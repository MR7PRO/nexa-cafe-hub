-- Phase 5 database tests. Each case is its own DO block that ALWAYS ends with
-- an exception, so everything it created (temporary test accounts, cafés,
-- customers, receipts) is rolled back. No live business data is touched.
-- Expected: every block reports 'PASS <name>'. Anything else is a failure.
--
-- Isolation: each block creates throw-away auth users; the signup trigger gives
-- each one its own café. Tests then act AS that user via request.jwt.claims so
-- tenant-assignment triggers run exactly as in production.

-- Helper used by all blocks (created and dropped inside each transaction).

-- 1. phone uniqueness (same café blocked, normalized, race-safe index, other café allowed)
DO $$
DECLARE ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ta uuid; tb uuid; ok boolean; id1 uuid; id2 uuid;
BEGIN
  INSERT INTO auth.users(id, instance_id, aud, role, email) VALUES
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ua || '@test.local'),
    (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ub || '@test.local');
  SELECT tenant_id INTO ta FROM public.profiles WHERE id = ua;
  SELECT tenant_id INTO tb FROM public.profiles WHERE id = ub;
  IF ta IS NULL OR tb IS NULL OR ta = tb THEN RAISE EXCEPTION 'FAIL fixture tenants'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  IF public.normalize_phone(' 059-123 4567 ') <> '0591234567' THEN RAISE EXCEPTION 'FAIL normalize'; END IF;
  INSERT INTO public.customers(name, phone) VALUES ('A', '059-1234567');
  IF (SELECT tenant_id FROM public.customers WHERE name='A' AND tenant_id = ta) IS NULL THEN RAISE EXCEPTION 'FAIL tenant not set'; END IF;
  ok := false;
  BEGIN INSERT INTO public.customers(name, phone) VALUES ('B', '0591234567'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL duplicate allowed (trigger)'; END IF;
  -- bypass trigger to prove the unique index alone blocks a race
  ok := false;
  ALTER TABLE public.customers DISABLE TRIGGER prevent_duplicate_customer_phone_trg;
  BEGIN INSERT INTO public.customers(name, phone) VALUES ('B2', '059 123 4567'); EXCEPTION WHEN unique_violation THEN ok := true; END;
  ALTER TABLE public.customers ENABLE TRIGGER prevent_duplicate_customer_phone_trg;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL duplicate allowed (index)'; END IF;
  -- empty / null phones never collide
  INSERT INTO public.customers(name, phone) VALUES ('N1', NULL), ('N2', NULL), ('E1', ''), ('E2', ' ');
  -- find_or_create reuses, never duplicates
  id1 := public.find_or_create_customer('Other name', '+059-1234567'::text);
  id2 := public.find_or_create_customer('A', '0591234567');
  IF id2 <> (SELECT id FROM public.customers WHERE name='A' AND tenant_id=ta) THEN RAISE EXCEPTION 'FAIL find_or_create reuse'; END IF;
  -- other café may use the same number
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  INSERT INTO public.customers(name, phone) VALUES ('C', '0591234567');
  RAISE EXCEPTION 'PASS phone_uniqueness';
END $$;

-- 2. cross-tenant separation (RLS + lookup RPCs)
DO $$
DECLARE ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ca uuid; cb uuid; n int;
BEGIN
  INSERT INTO auth.users(id, instance_id, aud, role, email) VALUES
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ua || '@test.local'),
    (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ub || '@test.local');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  INSERT INTO public.customers(name, phone) VALUES ('B', '0597777777') RETURNING id INTO cb;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  INSERT INTO public.customers(name, phone) VALUES ('A', '0597777777') RETURNING id INTO ca;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.customers WHERE id = cb;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL other café customer visible'; END IF;
  SELECT count(*) INTO n FROM public.customers WHERE id = ca;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL own customer hidden'; END IF;
  IF public.find_customer_by_phone('0597777777')->>'id' <> ca::text THEN RAISE EXCEPTION 'FAIL lookup crossed cafés'; END IF;
  IF public.get_customer_profile(cb) IS NOT NULL AND public.get_customer_profile(cb)->>'id' IS NOT NULL THEN RAISE EXCEPTION 'FAIL profile crossed cafés'; END IF;
  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'PASS tenant_separation';
END $$;

-- 3. atomic package sale + 4. ledger + 5. no negative balance + 6. receipt void removes unused hours
DO $$
DECLARE ua uuid := gen_random_uuid(); ta uuid; c1 uuid; pkg uuid; res jsonb; bal uuid; n int; ok boolean;
BEGIN
  INSERT INTO auth.users(id, instance_id, aud, role, email) VALUES
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ua || '@test.local');
  SELECT tenant_id INTO ta FROM public.profiles WHERE id = ua;
  DELETE FROM public.user_roles WHERE user_id = ua;
  INSERT INTO public.user_roles(user_id, role) VALUES (ua, 'manager');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  INSERT INTO public.customers(name, phone) VALUES ('A', '0598888888') RETURNING id INTO c1;
  INSERT INTO public.loyalty_packages(name, hours_included, bonus_hours, price_ils) VALUES ('t', 2, 1, 50) RETURNING id INTO pkg;

  -- underpayment rejected, nothing written
  ok := false;
  BEGIN PERFORM public.sell_loyalty_package(c1, pkg, '[{"method":"cash","amount":10}]'::jsonb); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL underpaid sale accepted'; END IF;
  IF EXISTS (SELECT 1 FROM public.customer_balances WHERE customer_id = c1) THEN RAISE EXCEPTION 'FAIL partial sale written'; END IF;

  res := public.sell_loyalty_package(c1, pkg, '[{"method":"cash","amount":50}]'::jsonb);
  bal := (res->>'balance_id')::uuid;
  SELECT remaining_minutes INTO n FROM public.customer_balances WHERE id = bal;
  IF n <> 180 THEN RAISE EXCEPTION 'FAIL minutes %', n; END IF;
  IF (SELECT status FROM public.tickets WHERE id = (res->>'ticket_id')::uuid) <> 'paid' THEN RAISE EXCEPTION 'FAIL receipt'; END IF;
  IF (SELECT sum(amount_ils) FROM public.payments WHERE ticket_id = (res->>'ticket_id')::uuid) <> 50 THEN RAISE EXCEPTION 'FAIL payment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ticket_items WHERE ticket_id = (res->>'ticket_id')::uuid AND item_type = 'package') THEN RAISE EXCEPTION 'FAIL item'; END IF;
  RAISE NOTICE 'ok package_sale';

  -- no negative balance
  ok := false;
  BEGIN PERFORM public.adjust_customer_balance(bal, -999, 'manual_adjustment', 'x'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL negative allowed'; END IF;
  ok := false;
  BEGIN PERFORM public.adjust_customer_balance(bal, -10, 'manual_adjustment', ''); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL reasonless adjust allowed'; END IF;
  PERFORM public.adjust_customer_balance(bal, -60, 'manual_adjustment', 'used');
  RAISE NOTICE 'ok no_negative';

  -- ledger consistency: every movement chains before->after
  IF EXISTS (SELECT 1 FROM public.customer_balance_movements WHERE balance_id = bal AND balance_before + change_minutes <> balance_after)
    THEN RAISE EXCEPTION 'FAIL ledger arithmetic'; END IF;
  SELECT count(*) INTO n FROM public.customer_balance_movements WHERE balance_id = bal;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL ledger count %', n; END IF;
  RAISE NOTICE 'ok ledger';

  -- void removes only the unused hours, ledgered
  PERFORM public.void_ticket((res->>'ticket_id')::uuid, 'test cancel', 'void', NULL);
  SELECT remaining_minutes INTO n FROM public.customer_balances WHERE id = bal;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL hours after void %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customer_balance_movements WHERE balance_id = bal AND change_minutes = -120) THEN RAISE EXCEPTION 'FAIL void not ledgered'; END IF;
  IF (SELECT sum(change_minutes) FROM public.customer_balance_movements WHERE balance_id = bal) <> 0 THEN RAISE EXCEPTION 'FAIL ledger sum'; END IF;
  RAISE EXCEPTION 'PASS package_sale+no_negative+ledger+void';
END $$;

-- 7. cashier cannot adjust balances directly
DO $$
DECLARE ua uuid := gen_random_uuid(); c1 uuid; pkg uuid; res jsonb; ok boolean;
BEGIN
  INSERT INTO auth.users(id, instance_id, aud, role, email) VALUES
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ua || '@test.local');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  INSERT INTO public.customers(name, phone) VALUES ('A', '0596666666') RETURNING id INTO c1;
  INSERT INTO public.loyalty_packages(name, hours_included, bonus_hours, price_ils) VALUES ('t', 1, 0, 20) RETURNING id INTO pkg;
  res := public.sell_loyalty_package(c1, pkg, '[{"method":"card","amount":20}]'::jsonb);
  DELETE FROM public.user_roles WHERE user_id = ua;
  INSERT INTO public.user_roles(user_id, role) VALUES (ua, 'cashier');
  ok := false;
  BEGIN PERFORM public.adjust_customer_balance((res->>'balance_id')::uuid, 30, 'manual_adjustment', 'x'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL cashier adjusted balance'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  ok := false;
  BEGIN UPDATE public.customer_balances SET remaining_minutes = 9999 WHERE id = (res->>'balance_id')::uuid;
    GET DIAGNOSTICS ok = ROW_COUNT; ok := NOT ok;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  EXECUTE 'RESET ROLE';
  IF NOT ok THEN RAISE EXCEPTION 'FAIL direct balance edit allowed'; END IF;
  RAISE EXCEPTION 'PASS balance_permissions';
END $$;
