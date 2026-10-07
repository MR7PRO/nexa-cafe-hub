CREATE OR REPLACE FUNCTION public.sell_loyalty_package(p_customer_id uuid, p_package_id uuid, p_payments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _tenant uuid; _pkg record; _mins integer; _bal uuid;
  _ticket_id uuid; _ticket_no text; _part jsonb; _total numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  _tenant := public.get_user_tenant_id(_uid);
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND tenant_id = _tenant) THEN
    RAISE EXCEPTION 'الزبون غير موجود'; END IF;
  SELECT * INTO _pkg FROM public.loyalty_packages WHERE id = p_package_id AND tenant_id = _tenant AND is_active;
  IF _pkg.id IS NULL THEN RAISE EXCEPTION 'الباقة غير متاحة'; END IF;
  _mins := (COALESCE(_pkg.hours_included,0) + COALESCE(_pkg.bonus_hours,0)) * 60;
  IF _mins <= 0 THEN RAISE EXCEPTION 'الباقة لا تحتوي على وقت'; END IF;
  _total := ROUND(COALESCE(_pkg.price_ils,0), 2);

  PERFORM public.validate_payment_parts(p_payments, _total);

  _ticket_no := public.next_ticket_no(_tenant);
  INSERT INTO public.tickets (ticket_no, status, created_by, tenant_id, discount_ils, total_ils, closed_at, customer_id)
  VALUES (_ticket_no, 'paid', _uid, _tenant, 0, _total, now(), p_customer_id)
  RETURNING id INTO _ticket_id;

  INSERT INTO public.ticket_items (ticket_id, tenant_id, item_type, ref_id, name, qty, unit_price_ils, total_ils)
  VALUES (_ticket_id, _tenant, 'package', _pkg.id, _pkg.name, 1, _total, _total);

  FOR _part IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.payments (ticket_id, tenant_id, method, amount_ils)
    VALUES (_ticket_id, _tenant, (_part->>'method')::payment_method, (_part->>'amount')::numeric);
  END LOOP;

  INSERT INTO public.customer_balances (customer_id, package_id, remaining_minutes, total_minutes, sold_by, tenant_id)
  VALUES (p_customer_id, p_package_id, _mins, _mins, _uid, _tenant) RETURNING id INTO _bal;
  INSERT INTO public.customer_balance_movements (tenant_id, customer_id, balance_id, change_minutes, balance_before, balance_after, movement_type, reference_type, reference_id, performed_by)
  VALUES (_tenant, p_customer_id, _bal, _mins, 0, _mins, 'package_purchase', 'ticket', _ticket_id, _uid);

  PERFORM public.log_audit_event('ticket_paid', 'ticket', _ticket_id,
    jsonb_build_object('ticket_no', _ticket_no, 'total_ils', _total, 'source', 'loyalty_package',
      'customer_id', p_customer_id, 'package', _pkg.name, 'minutes', _mins, 'balance_id', _bal), _tenant, _uid);

  RETURN jsonb_build_object('ticket_id', _ticket_id, 'ticket_no', _ticket_no, 'balance_id', _bal, 'total_ils', _total);
END $$;
REVOKE ALL ON FUNCTION public.sell_loyalty_package(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_loyalty_package(uuid, uuid, jsonb) TO authenticated;