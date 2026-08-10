-- 1. Linkage columns -------------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id),
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id);

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

CREATE INDEX IF NOT EXISTS reservations_tenant_date_device_idx
  ON public.reservations (tenant_id, reserved_date, device_id);
CREATE INDEX IF NOT EXISTS sessions_customer_idx
  ON public.sessions (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS tickets_customer_idx
  ON public.tickets (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS customers_tenant_phone_idx
  ON public.customers (tenant_id, phone);

-- 2. Overlap / time validation trigger --------------------------------
CREATE OR REPLACE FUNCTION public.validate_reservation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية';
  END IF;

  IF NEW.status IN ('pending', 'confirmed') AND EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.device_id = NEW.device_id
      AND r.reserved_date = NEW.reserved_date
      AND r.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
      AND r.id <> NEW.id
      AND r.status IN ('pending', 'confirmed')
      AND NEW.start_time < r.end_time
      AND NEW.end_time > r.start_time
  ) THEN
    RAISE EXCEPTION 'يتعارض هذا الحجز مع حجز آخر على نفس الجهاز في نفس الوقت';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_reservation_trg ON public.reservations;
CREATE TRIGGER validate_reservation_trg
BEFORE INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.validate_reservation();

-- 3. Customer de-duplication helper -----------------------------------
CREATE OR REPLACE FUNCTION public.find_or_create_customer(p_name text, p_phone text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  _name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;
  IF _name IS NULL AND _phone IS NULL THEN RAISE EXCEPTION 'اسم أو رقم الزبون مطلوب'; END IF;

  IF _phone IS NOT NULL THEN
    SELECT id INTO _id FROM public.customers
    WHERE tenant_id = _tenant AND phone = _phone
    ORDER BY created_at LIMIT 1;
    IF _id IS NOT NULL THEN
      UPDATE public.customers SET name = COALESCE(_name, name) WHERE id = _id;
      RETURN _id;
    END IF;
  ELSE
    SELECT id INTO _id FROM public.customers
    WHERE tenant_id = _tenant AND phone IS NULL AND lower(name) = lower(_name)
    ORDER BY created_at LIMIT 1;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;

  INSERT INTO public.customers (name, phone, created_by, tenant_id)
  VALUES (COALESCE(_name, _phone), _phone, _uid, _tenant)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- 4. start_session: optional customer + reservation fulfilment --------
CREATE OR REPLACE FUNCTION public.start_session(
  p_device_id uuid,
  p_rate_plan_id uuid,
  p_session_mode text DEFAULT 'meter',
  p_timer_minutes integer DEFAULT NULL,
  p_controller_count integer DEFAULT 1,
  p_customer_balance_id uuid DEFAULT NULL,
  p_deduct_minutes integer DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _device_tenant uuid;
  _device_active boolean;
  _plan record;
  _remaining integer;
  _bal_tenant uuid;
  _bal_customer uuid;
  _mode text;
  _controllers integer;
  _timer integer;
  _prepaid boolean := false;
  _session_id uuid;
  _res record;
  _customer uuid := p_customer_id;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;

  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  SELECT tenant_id, is_active INTO _device_tenant, _device_active
  FROM public.devices WHERE id = p_device_id FOR UPDATE;
  IF _device_tenant IS NULL OR _device_tenant <> _tenant THEN RAISE EXCEPTION 'الجهاز غير موجود'; END IF;
  IF NOT _device_active THEN RAISE EXCEPTION 'الجهاز غير مفعّل'; END IF;

  IF EXISTS (SELECT 1 FROM public.sessions WHERE device_id = p_device_id AND status IN ('running','paused')) THEN
    RAISE EXCEPTION 'يوجد جلسة نشطة على هذا الجهاز';
  END IF;

  SELECT * INTO _plan FROM public.rate_plans WHERE id = p_rate_plan_id AND is_active;
  IF _plan.id IS NULL OR _plan.tenant_id <> _tenant THEN RAISE EXCEPTION 'خطة التسعير غير صحيحة'; END IF;

  IF _customer IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = _customer AND tenant_id = _tenant
  ) THEN
    RAISE EXCEPTION 'الزبون غير موجود';
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT * INTO _res FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
    IF _res.id IS NULL OR _res.tenant_id <> _tenant THEN RAISE EXCEPTION 'الحجز غير موجود'; END IF;
    IF _res.status = 'cancelled' THEN RAISE EXCEPTION 'الحجز ملغي'; END IF;
    IF _res.session_id IS NOT NULL THEN RAISE EXCEPTION 'تم استخدام هذا الحجز مسبقاً'; END IF;
    _customer := COALESCE(_customer, _res.customer_id);
  END IF;

  _mode := CASE WHEN p_session_mode = 'timer' THEN 'timer' ELSE 'meter' END;
  _controllers := LEAST(GREATEST(COALESCE(p_controller_count, 1), 1), 4);
  _timer := CASE WHEN _mode = 'timer' THEN GREATEST(COALESCE(p_timer_minutes, 0), 1) ELSE NULL END;

  IF p_customer_balance_id IS NOT NULL THEN
    IF COALESCE(p_deduct_minutes, 0) <= 0 THEN RAISE EXCEPTION 'عدد الدقائق غير صحيح'; END IF;

    SELECT tenant_id, remaining_minutes, customer_id
      INTO _bal_tenant, _remaining, _bal_customer
    FROM public.customer_balances WHERE id = p_customer_balance_id FOR UPDATE;

    IF _bal_tenant IS NULL OR _bal_tenant <> _tenant THEN RAISE EXCEPTION 'رصيد الزبون غير موجود'; END IF;
    IF _remaining < p_deduct_minutes THEN RAISE EXCEPTION 'الرصيد غير كافٍ'; END IF;

    UPDATE public.customer_balances
    SET remaining_minutes = remaining_minutes - p_deduct_minutes
    WHERE id = p_customer_balance_id;

    _mode := 'timer';
    _timer := p_deduct_minutes;
    _prepaid := true;
    _customer := COALESCE(_customer, _bal_customer);
  END IF;

  INSERT INTO public.sessions (
    device_id, rate_plan_id, tenant_id, created_by,
    session_mode, timer_minutes, controller_count, status, start_time,
    rate_price_per_hour_snapshot, rate_rounding_minutes_snapshot, rate_min_charge_snapshot,
    paid_from_balance, payment_status, customer_id, reservation_id
  ) VALUES (
    p_device_id, p_rate_plan_id, _tenant, _uid,
    _mode, _timer, _controllers, 'running', now(),
    _plan.price_per_hour_ils, COALESCE(_plan.rounding_minutes, 1), COALESCE(_plan.min_charge_ils, 0),
    _prepaid, CASE WHEN _prepaid THEN 'prepaid' ELSE 'unpaid' END, _customer, p_reservation_id
  )
  RETURNING id INTO _session_id;

  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.reservations
    SET status = 'completed', fulfilled_at = now(), session_id = _session_id,
        customer_id = COALESCE(customer_id, _customer)
    WHERE id = p_reservation_id;
  END IF;

  RETURN _session_id;
END;
$$;

-- 5. process_sale: optional customer on the ticket ---------------------
CREATE OR REPLACE FUNCTION public.process_sale(
  p_items jsonb,
  p_payments jsonb,
  p_promotion_id uuid DEFAULT NULL,
  p_manual_discount_ils numeric DEFAULT 0,
  p_customer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _item jsonb;
  _qty integer;
  _product record;
  _subtotal numeric := 0;
  _discount numeric := 0;
  _total numeric := 0;
  _ticket_id uuid;
  _ticket_no text;
  _part jsonb;
  _lines jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'السلة فارغة';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND tenant_id = _tenant
  ) THEN
    RAISE EXCEPTION 'الزبون غير موجود';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    _qty := COALESCE((_item->>'qty')::integer, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'الكمية غير صحيحة'; END IF;

    SELECT id, name, sell_price_ils, cost_price_ils, stock_qty, is_active, tenant_id
      INTO _product
    FROM public.products
    WHERE id = (_item->>'product_id')::uuid
    FOR UPDATE;

    IF _product.id IS NULL OR _product.tenant_id <> _tenant THEN
      RAISE EXCEPTION 'المنتج غير موجود';
    END IF;
    IF NOT _product.is_active THEN
      RAISE EXCEPTION 'المنتج % غير مفعّل', _product.name;
    END IF;
    IF _product.stock_qty IS NOT NULL AND _product.stock_qty < _qty THEN
      RAISE EXCEPTION 'الكمية المتوفرة من % هي % فقط', _product.name, _product.stock_qty;
    END IF;

    _subtotal := _subtotal + (_product.sell_price_ils * _qty);
    _lines := _lines || jsonb_build_object(
      'ref_id', _product.id,
      'name', _product.name,
      'qty', _qty,
      'unit_price_ils', _product.sell_price_ils,
      'unit_cost_ils', _product.cost_price_ils,
      'total_ils', ROUND(_product.sell_price_ils * _qty, 2)
    );
  END LOOP;

  _subtotal := ROUND(_subtotal, 2);
  _discount := public.compute_promotion_discount(_tenant, p_promotion_id, _subtotal, 'products');
  _discount := LEAST(_subtotal, _discount + GREATEST(COALESCE(p_manual_discount_ils, 0), 0));
  _total := GREATEST(ROUND(_subtotal - _discount, 2), 0);

  PERFORM public.validate_payment_parts(p_payments, _total);

  _ticket_no := public.next_ticket_no(_tenant);

  INSERT INTO public.tickets (ticket_no, status, created_by, tenant_id, discount_ils, total_ils, closed_at, customer_id)
  VALUES (_ticket_no, 'paid', _uid, _tenant, _discount, _total, now(), p_customer_id)
  RETURNING id INTO _ticket_id;

  INSERT INTO public.ticket_items (ticket_id, tenant_id, item_type, ref_id, name, qty, unit_price_ils, unit_cost_ils, total_ils)
  SELECT _ticket_id, _tenant, 'product',
         (l->>'ref_id')::uuid, l->>'name', (l->>'qty')::integer,
         (l->>'unit_price_ils')::numeric, (l->>'unit_cost_ils')::numeric,
         (l->>'total_ils')::numeric
  FROM jsonb_array_elements(_lines) l;

  FOR _part IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.payments (ticket_id, tenant_id, method, amount_ils)
    VALUES (_ticket_id, _tenant, (_part->>'method')::payment_method, (_part->>'amount')::numeric);
  END LOOP;

  UPDATE public.products p
  SET stock_qty = p.stock_qty - agg.qty
  FROM (
    SELECT (l->>'ref_id')::uuid AS id, SUM((l->>'qty')::integer) AS qty
    FROM jsonb_array_elements(_lines) l GROUP BY 1
  ) agg
  WHERE p.id = agg.id AND p.stock_qty IS NOT NULL;

  IF EXISTS (SELECT 1 FROM public.products WHERE tenant_id = _tenant AND stock_qty < 0) THEN
    RAISE EXCEPTION 'المخزون غير كافٍ';
  END IF;

  RETURN jsonb_build_object(
    'ticket_id', _ticket_id,
    'ticket_no', _ticket_no,
    'subtotal_ils', _subtotal,
    'discount_ils', _discount,
    'total_ils', _total
  );
END;
$$;

-- 6. settle_session carries the session customer onto the ticket -------
CREATE OR REPLACE FUNCTION public.settle_session(
  p_session_id uuid,
  p_payments jsonb DEFAULT NULL,
  p_promotion_id uuid DEFAULT NULL,
  p_manual_discount_ils numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _s record;
  _device record;
  _calc jsonb;
  _subtotal numeric;
  _discount numeric;
  _total numeric;
  _ticket_id uuid;
  _ticket_no text;
  _part jsonb;
  _payments jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  SELECT * INTO _s FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF _s.id IS NULL OR _s.tenant_id <> _tenant THEN RAISE EXCEPTION 'الجلسة غير موجودة'; END IF;
  IF _s.status <> 'ended' THEN RAISE EXCEPTION 'يجب إنهاء الجلسة قبل التحصيل'; END IF;
  IF _s.settled_at IS NOT NULL THEN RAISE EXCEPTION 'تم تحصيل هذه الجلسة مسبقاً'; END IF;

  SELECT * INTO _device FROM public.devices WHERE id = _s.device_id;

  _calc := public.compute_session_billing(p_session_id);
  _subtotal := (_calc->>'subtotal_ils')::numeric;

  _discount := public.compute_promotion_discount(_tenant, p_promotion_id, _subtotal, 'sessions');
  _discount := LEAST(_subtotal, _discount + GREATEST(COALESCE(p_manual_discount_ils, 0), 0));
  _total := GREATEST(ROUND(_subtotal - _discount, 2), 0);

  _payments := COALESCE(p_payments, jsonb_build_array(jsonb_build_object('method','cash','amount',_total)));
  IF _total = 0 THEN
    _payments := jsonb_build_array(jsonb_build_object('method','cash','amount',0));
  ELSE
    PERFORM public.validate_payment_parts(_payments, _total);
  END IF;

  _ticket_no := public.next_ticket_no(_tenant);

  INSERT INTO public.tickets (ticket_no, status, created_by, tenant_id, discount_ils, total_ils, closed_at, customer_id)
  VALUES (_ticket_no, 'paid', _uid, _tenant, _discount, _total, now(), _s.customer_id)
  RETURNING id INTO _ticket_id;

  INSERT INTO public.ticket_items (ticket_id, tenant_id, item_type, ref_id, name, qty, unit_price_ils, total_ils)
  VALUES (
    _ticket_id, _tenant, 'session', _s.id,
    COALESCE(_device.name, 'جلسة') || ' - ' || (_calc->>'billed_minutes') || ' دقيقة'
      || CASE WHEN COALESCE(_s.controller_count,1) > 1 AND _device.type = 'playstation'
              THEN ' × ' || _s.controller_count || ' أيدي' ELSE '' END,
    1, _subtotal, _subtotal
  );

  FOR _part IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    INSERT INTO public.payments (ticket_id, tenant_id, method, amount_ils)
    VALUES (_ticket_id, _tenant, (_part->>'method')::payment_method, (_part->>'amount')::numeric);
  END LOOP;

  UPDATE public.sessions SET
    billed_minutes = (_calc->>'billed_minutes')::integer,
    effective_rate_ils = (_calc->>'effective_rate_ils')::numeric,
    subtotal_ils = _subtotal,
    discount_ils = _discount,
    total_ils = _total,
    ticket_id = _ticket_id,
    settled_at = now(),
    payment_status = CASE WHEN _s.paid_from_balance THEN 'prepaid' ELSE 'settled' END
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ticket_id', _ticket_id,
    'ticket_no', _ticket_no,
    'billed_minutes', (_calc->>'billed_minutes')::integer,
    'subtotal_ils', _subtotal,
    'discount_ils', _discount,
    'total_ils', _total
  );
END;
$$;