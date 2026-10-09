-- Phase 5 database safety tests. Runs everything inside one block and always
-- rolls back (ends with an exception), so no real data is ever kept.
-- Success = error message 'PHASE5 TESTS PASSED'.
DO $$
DECLARE
  t1 uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
  u1 uuid := gen_random_uuid();
  pkg uuid; c1 uuid; c2 uuid; bal uuid; res jsonb; n int; ok boolean;
BEGIN
  INSERT INTO public.tenants(id, name) VALUES (t1, 'test-a'), (t2, 'test-b');
  INSERT INTO auth.users(id, email, instance_id, aud, role) VALUES (u1, 'phase5-test-'||u1||'@x.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.profiles(id, name, tenant_id) VALUES (u1, 'tester', t1)
    ON CONFLICT (id) DO UPDATE SET tenant_id = t1;
  DELETE FROM public.user_roles WHERE user_id = u1;
  INSERT INTO public.user_roles(user_id, role) VALUES (u1, 'manager');

  -- 1. phone normalization
  IF public.normalize_phone(' 059-123 4567 ') <> '0591234567' THEN RAISE EXCEPTION 'FAIL normalize_phone'; END IF;

  -- 2. duplicate phone blocked in same café, allowed in another café
  INSERT INTO public.customers(name, phone, tenant_id) VALUES ('A', '059-1234567', t1) RETURNING id INTO c1;
  ok := false;
  BEGIN INSERT INTO public.customers(name, phone, tenant_id) VALUES ('B', '0591234567', t1);
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL duplicate phone allowed in same tenant'; END IF;
  INSERT INTO public.customers(name, phone, tenant_id) VALUES ('C', '0591234567', t2) RETURNING id INTO c2;

  -- act as the manager of café 1
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);

  -- 3. selling a package creates receipt + hours + history
  INSERT INTO public.loyalty_packages(name, hours_included, bonus_hours, price_ils, tenant_id)
    VALUES ('test', 2, 1, 50, t1) RETURNING id INTO pkg;
  res := public.sell_loyalty_package(c1, pkg, '[{"method":"cash","amount":50}]'::jsonb);
  bal := (res->>'balance_id')::uuid;
  SELECT remaining_minutes INTO n FROM public.customer_balances WHERE id = bal;
  IF n <> 180 THEN RAISE EXCEPTION 'FAIL package minutes %', n; END IF;

  -- 4. balance can never go below zero
  ok := false;
  BEGIN PERFORM public.adjust_customer_balance(bal, -999, 'manual_adjustment', 'test');
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL balance went negative'; END IF;

  -- 5. cancelling the package receipt removes the unused hours
  PERFORM public.adjust_customer_balance(bal, -60, 'manual_adjustment', 'used some');
  PERFORM public.void_ticket((res->>'ticket_id')::uuid, 'test cancel', 'void', NULL);
  SELECT remaining_minutes INTO n FROM public.customer_balances WHERE id = bal;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL hours left after cancel: %', n; END IF;

  -- 6. café isolation: café 1 staff cannot see café 2 customers
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.customers WHERE id = c2;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL tenant isolation (customers)'; END IF;
  SELECT count(*) INTO n FROM public.customers WHERE id = c1;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL own customer not visible'; END IF;
  IF public.find_customer_by_phone('0591234567')->>'id' <> c1::text THEN RAISE EXCEPTION 'FAIL phone lookup crossed tenants'; END IF;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'PHASE5 TESTS PASSED';
END $$;
