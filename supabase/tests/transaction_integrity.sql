-- Run this DO block alone. PASS is an intentional exception that rolls back
-- all fixtures and temporary staff-context changes. Any other exception fails.
-- No business records survive, including receipts, stock, hours or shifts.
DO $$
DECLARE
 u uuid; tenant uuid; product uuid; customer uuid; package uuid; shift uuid;
 key uuid := gen_random_uuid(); package_key uuid := gen_random_uuid(); failed_key uuid := gen_random_uuid();
 items jsonb; payments jsonb := '[{"method":"cash","amount":50}]';
 a jsonb; b jsonb; balance uuid; rejected boolean; rows_changed integer;
BEGIN
 u := (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1);
 IF u IS NULL THEN RAISE EXCEPTION 'FAIL: staff fixture unavailable'; END IF;
 INSERT INTO public.tenants(name) VALUES ('ROLLBACK ONLY transaction test') RETURNING id INTO tenant;
 UPDATE public.profiles SET tenant_id=tenant WHERE id=u;
 DELETE FROM public.user_roles WHERE user_id=u;
 INSERT INTO public.user_roles(user_id,role) VALUES (u,'admin');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 INSERT INTO public.products(name,sell_price_ils,cost_price_ils,stock_qty) VALUES ('test product',10,4,10) RETURNING id INTO product;
 INSERT INTO public.customers(name) VALUES ('test customer') RETURNING id INTO customer;
 INSERT INTO public.loyalty_packages(name,hours_included,bonus_hours,price_ils) VALUES ('test package',2,1,50) RETURNING id INTO package;
 INSERT INTO public.shifts(employee_id,opening_cash_ils) VALUES (u,100) RETURNING id INTO shift;
 items := jsonb_build_array(jsonb_build_object('product_id',product,'qty',5));
 EXECUTE 'SET LOCAL ROLE authenticated';
 a := public.process_sale(items,payments,NULL,0,customer,key);
 b := public.process_sale(items,payments,NULL,0,customer,key);
 IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'FAIL POS replay result'; END IF;
 IF (SELECT stock_qty FROM public.products WHERE id=product) <> 5 THEN RAISE EXCEPTION 'FAIL duplicate stock deduction'; END IF;
 IF (SELECT count(*) FROM public.payments WHERE ticket_id=(a->>'ticket_id')::uuid) <> 1 THEN RAISE EXCEPTION 'FAIL duplicate payment'; END IF;
 rejected := false;
 BEGIN PERFORM public.process_sale(items,'[{"method":"cash","amount":49}]',NULL,0,customer,key);
 EXCEPTION WHEN OTHERS THEN rejected := true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL changed payload replay accepted'; END IF;

 -- Failure after stock deductions (duplicate product lines) must undo everything.
 rejected := false;
 BEGIN PERFORM public.process_sale(jsonb_build_array(jsonb_build_object('product_id',product,'qty',3),jsonb_build_object('product_id',product,'qty',3)),
 '[{"method":"cash","amount":60}]',NULL,0,customer,failed_key);
 EXCEPTION WHEN OTHERS THEN rejected := true; END;
 IF NOT rejected OR (SELECT stock_qty FROM public.products WHERE id=product) <> 5 THEN RAISE EXCEPTION 'FAIL stock rollback'; END IF;
 IF (SELECT count(*) FROM public.tickets WHERE tenant_id=tenant) <> 1 THEN RAISE EXCEPTION 'FAIL receipt rollback'; END IF;
 EXECUTE 'RESET ROLE';
 IF EXISTS (SELECT 1 FROM public.sale_requests WHERE request_id=failed_key AND tenant_id=tenant) THEN RAISE EXCEPTION 'FAIL failed request persisted'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 -- 50% of five units returns two, rounded down.
 PERFORM public.void_ticket((a->>'ticket_id')::uuid,'test half refund','refund',25);
 IF (SELECT stock_qty FROM public.products WHERE id=product) <> 7 THEN RAISE EXCEPTION 'FAIL proportional stock refund'; END IF;
 rejected := false;
 BEGIN PERFORM public.void_ticket((a->>'ticket_id')::uuid,'duplicate refund','refund',25);
 EXCEPTION WHEN OTHERS THEN rejected := true; END;
 IF NOT rejected OR (SELECT stock_qty FROM public.products WHERE id=product) <> 7 THEN RAISE EXCEPTION 'FAIL repeat refund'; END IF;
 IF (SELECT unit_price_ils FROM public.ticket_items WHERE ticket_id=(a->>'ticket_id')::uuid) <> 10 THEN RAISE EXCEPTION 'FAIL price snapshot'; END IF;

 a := public.sell_loyalty_package(customer,package,payments,package_key);
 b := public.sell_loyalty_package(customer,package,payments,package_key);
 IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'FAIL package replay result'; END IF;
 balance := (a->>'balance_id')::uuid;
 IF (SELECT remaining_minutes FROM public.customer_balances WHERE id=balance) <> 180 THEN RAISE EXCEPTION 'FAIL duplicate package hours'; END IF;
 IF (SELECT count(*) FROM public.customer_balances WHERE customer_id=customer) <> 1 THEN RAISE EXCEPTION 'FAIL duplicate balance'; END IF;
 PERFORM public.adjust_customer_balance(balance,-60,'manual_adjustment','test usage');
 -- 50% of the UNUSED 120 minutes removes 60, not 90 of purchased 180.
 b := public.void_ticket((a->>'ticket_id')::uuid,'test half refund','refund',25);
 IF (b->>'package_minutes_removed')::int <> 60 OR (SELECT remaining_minutes FROM public.customer_balances WHERE id=balance) <> 60 THEN
 RAISE EXCEPTION 'FAIL proportional unused hours'; END IF;
 IF (SELECT sum(change_minutes) FROM public.customer_balance_movements WHERE balance_id=balance) <> 60 THEN RAISE EXCEPTION 'FAIL refund ledger'; END IF;
 -- Full void still removes all unused minutes.
 a := public.sell_loyalty_package(customer,package,payments,gen_random_uuid());
 PERFORM public.adjust_customer_balance((a->>'balance_id')::uuid,-60,'manual_adjustment','test usage');
 PERFORM public.void_ticket((a->>'ticket_id')::uuid,'test full void','void',NULL);
 IF (SELECT remaining_minutes FROM public.customer_balances WHERE id=(a->>'balance_id')::uuid) <> 0 THEN RAISE EXCEPTION 'FAIL full void hours'; END IF;

 UPDATE public.shifts SET close_time=now(),closing_cash_ils=100,expected_cash_ils=9999,difference_ils=9999 WHERE id=shift;
 GET DIAGNOSTICS rows_changed = ROW_COUNT;
 IF rows_changed <> 1 THEN RAISE EXCEPTION 'FAIL shift not visible'; END IF;
 IF (SELECT expected_cash_ils FROM public.shifts WHERE id=shift) <> 100 THEN RAISE EXCEPTION 'FAIL server shift cash'; END IF;
 rejected := false;
 BEGIN UPDATE public.shifts SET closing_cash_ils=9999 WHERE id=shift;
 EXCEPTION WHEN OTHERS THEN rejected := true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL closed shift mutable'; END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM public.sale_requests WHERE tenant_id=tenant) <> 3 THEN RAISE EXCEPTION 'FAIL request count'; END IF;
 RAISE EXCEPTION 'PASS transaction_integrity: POS/package replay, changed payload, rollback, proportional stock/unused-hours, full void, ledger, shift lock';
END $$;