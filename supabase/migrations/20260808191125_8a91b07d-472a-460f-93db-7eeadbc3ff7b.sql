-- ========== ticket number counters ==========
CREATE TABLE IF NOT EXISTS public.ticket_counters (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  last_no integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
GRANT ALL ON public.ticket_counters TO service_role;
ALTER TABLE public.ticket_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to ticket counters"
  ON public.ticket_counters FOR SELECT TO authenticated USING (false);

CREATE UNIQUE INDEX IF NOT EXISTS tickets_tenant_ticket_no_uniq
  ON public.tickets (tenant_id, ticket_no);

CREATE OR REPLACE FUNCTION public.next_ticket_no(_tenant uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _day date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  _no integer;
BEGIN
  INSERT INTO public.ticket_counters (tenant_id, day, last_no)
  VALUES (_tenant, _day, 1)
  ON CONFLICT (tenant_id, day)
  DO UPDATE SET last_no = public.ticket_counters.last_no + 1
  RETURNING last_no INTO _no;

  RETURN 'NX-' || to_char(_day, 'YYYYMMDD') || '-' || lpad(_no::text, 4, '0');
END;
$$;

-- ========== promotion discount helper ==========
CREATE OR REPLACE FUNCTION public.compute_promotion_discount(
  _tenant uuid, _promotion_id uuid, _subtotal numeric, _scope text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p record;
  _discount numeric := 0;
BEGIN
  IF _promotion_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _p FROM public.promotions
  WHERE id = _promotion_id AND tenant_id = _tenant AND is_active;

  IF _p.id IS NULL THEN RAISE EXCEPTION 'العرض غير موجود أو غير مفعّل'; END IF;
  IF _p.start_date > now() THEN RAISE EXCEPTION 'العرض لم يبدأ بعد'; END IF;
  IF _p.end_date IS NOT NULL AND _p.end_date < now() THEN RAISE EXCEPTION 'العرض منتهي'; END IF;
  IF _p.applies_to NOT IN ('all', _scope) THEN RAISE EXCEPTION 'العرض لا ينطبق على هذه الفاتورة'; END IF;

  IF _p.discount_type = 'percentage' THEN
    _discount := ROUND(_subtotal * LEAST(GREATEST(_p.discount_value, 0), 100) / 100.0, 2);
  ELSE
    _discount := GREATEST(_p.discount_value, 0);
  END IF;

  RETURN LEAST(_discount, _subtotal);
END;
$$;

-- ========== payments validation helper ==========
CREATE OR REPLACE FUNCTION public.validate_payment_parts(_payments jsonb, _total numeric)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _sum numeric := 0;
  _part jsonb;
BEGIN
  IF _payments IS NULL OR jsonb_typeof(_payments) <> 'array' OR jsonb_array_length(_payments) = 0 THEN
    RAISE EXCEPTION 'بيانات الدفع غير صحيحة';
  END IF;

  FOR _part IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    IF (_part->>'method') NOT IN ('cash','card','mixed') THEN
      RAISE EXCEPTION 'طريقة دفع غير مدعومة';
    END IF;
    IF COALESCE((_part->>'amount')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'مبلغ الدفع غير صحيح';
    END IF;
    _sum := _sum + (_part->>'amount')::numeric;
  END LOOP;

  IF ROUND(_sum, 2) <> ROUND(_total, 2) THEN
    RAISE EXCEPTION 'مجموع المبالغ المدفوعة (%) لا يساوي الإجمالي (%)', ROUND(_sum,2), ROUND(_total,2);
  END IF;

  RETURN _payments;
END;
$$;

-- ========== atomic POS sale ==========
CREATE OR REPLACE FUNCTION public.process_sale(
  p_items jsonb,
  p_payments jsonb,
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

  -- validate items, lock product rows, compute authoritative subtotal
  FOR _item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    _qty := COALESCE((_item->>'qty')::integer, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'الكمية غير صحيحة'; END IF;

    SELECT id, name, sell_price_ils, stock_qty, is_active, tenant_id
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
      'total_ils', ROUND(_product.sell_price_ils * _qty, 2)
    );
  END LOOP;

  _subtotal := ROUND(_subtotal, 2);
  _discount := public.compute_promotion_discount(_tenant, p_promotion_id, _subtotal, 'products');
  _discount := LEAST(_subtotal, _discount + GREATEST(COALESCE(p_manual_discount_ils, 0), 0));
  _total := GREATEST(ROUND(_subtotal - _discount, 2), 0);

  PERFORM public.validate_payment_parts(p_payments, _total);

  _ticket_no := public.next_ticket_no(_tenant);

  INSERT INTO public.tickets (ticket_no, status, created_by, tenant_id, discount_ils, total_ils, closed_at)
  VALUES (_ticket_no, 'paid', _uid, _tenant, _discount, _total, now())
  RETURNING id INTO _ticket_id;

  INSERT INTO public.ticket_items (ticket_id, tenant_id, item_type, ref_id, name, qty, unit_price_ils, total_ils)
  SELECT _ticket_id, _tenant, 'product',
         (l->>'ref_id')::uuid, l->>'name', (l->>'qty')::integer,
         (l->>'unit_price_ils')::numeric, (l->>'total_ils')::numeric
  FROM jsonb_array_elements(_lines) l;

  FOR _part IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.payments (ticket_id, tenant_id, method, amount_ils)
    VALUES (_ticket_id, _tenant, (_part->>'method')::payment_method, (_part->>'amount')::numeric);
  END LOOP;

  -- decrement stock only for tracked products
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

REVOKE ALL ON FUNCTION public.next_ticket_no(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.process_sale(jsonb, jsonb, uuid, numeric) TO authenticated;

-- ========== session billing snapshots ==========
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS rate_price_per_hour_snapshot numeric,
  ADD COLUMN IF NOT EXISTS rate_rounding_minutes_snapshot integer,
  ADD COLUMN IF NOT EXISTS rate_min_charge_snapshot numeric,
  ADD COLUMN IF NOT EXISTS billed_minutes integer,
  ADD COLUMN IF NOT EXISTS effective_rate_ils numeric,
  ADD COLUMN IF NOT EXISTS subtotal_ils numeric,
  ADD COLUMN IF NOT EXISTS discount_ils numeric,
  ADD COLUMN IF NOT EXISTS total_ils numeric,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_from_balance boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sessions_payment_status_idx
  ON public.sessions (tenant_id, payment_status) WHERE payment_status = 'unpaid';

-- start_session: snapshot the rate plan values and flag prepaid sessions
CREATE OR REPLACE FUNCTION public.start_session(
  p_device_id uuid, p_rate_plan_id uuid, p_session_mode text DEFAULT 'meter',
  p_timer_minutes integer DEFAULT NULL, p_controller_count integer DEFAULT 1,
  p_customer_balance_id uuid DEFAULT NULL, p_deduct_minutes integer DEFAULT NULL
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
  _mode text;
  _controllers integer;
  _timer integer;
  _prepaid boolean := false;
  _session_id uuid;
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

  _mode := CASE WHEN p_session_mode = 'timer' THEN 'timer' ELSE 'meter' END;
  _controllers := LEAST(GREATEST(COALESCE(p_controller_count, 1), 1), 4);
  _timer := CASE WHEN _mode = 'timer' THEN GREATEST(COALESCE(p_timer_minutes, 0), 1) ELSE NULL END;

  IF p_customer_balance_id IS NOT NULL THEN
    IF COALESCE(p_deduct_minutes, 0) <= 0 THEN RAISE EXCEPTION 'عدد الدقائق غير صحيح'; END IF;

    SELECT tenant_id, remaining_minutes INTO _bal_tenant, _remaining
    FROM public.customer_balances WHERE id = p_customer_balance_id FOR UPDATE;

    IF _bal_tenant IS NULL OR _bal_tenant <> _tenant THEN RAISE EXCEPTION 'رصيد الزبون غير موجود'; END IF;
    IF _remaining < p_deduct_minutes THEN RAISE EXCEPTION 'الرصيد غير كافٍ'; END IF;

    UPDATE public.customer_balances
    SET remaining_minutes = remaining_minutes - p_deduct_minutes
    WHERE id = p_customer_balance_id;

    _mode := 'timer';
    _timer := p_deduct_minutes;
    _prepaid := true;
  END IF;

  INSERT INTO public.sessions (
    device_id, rate_plan_id, tenant_id, created_by,
    session_mode, timer_minutes, controller_count, status, start_time,
    rate_price_per_hour_snapshot, rate_rounding_minutes_snapshot, rate_min_charge_snapshot,
    paid_from_balance, payment_status
  ) VALUES (
    p_device_id, p_rate_plan_id, _tenant, _uid,
    _mode, _timer, _controllers, 'running', now(),
    _plan.price_per_hour_ils, COALESCE(_plan.rounding_minutes, 1), COALESCE(_plan.min_charge_ils, 0),
    _prepaid, CASE WHEN _prepaid THEN 'prepaid' ELSE 'unpaid' END
  )
  RETURNING id INTO _session_id;

  RETURN _session_id;
END;
$$;

-- authoritative session pricing calculation
CREATE OR REPLACE FUNCTION public.compute_session_billing(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid := public.get_user_tenant_id(auth.uid());
  _s record;
  _device record;
  _rate numeric;
  _round integer;
  _min numeric;
  _raw_minutes numeric;
  _minutes integer;
  _multiplier integer;
  _effective_rate numeric;
  _amount numeric;
BEGIN
  IF _tenant IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;

  SELECT * INTO _s FROM public.sessions WHERE id = p_session_id;
  IF _s.id IS NULL OR _s.tenant_id <> _tenant THEN RAISE EXCEPTION 'الجلسة غير موجودة'; END IF;

  SELECT * INTO _device FROM public.devices WHERE id = _s.device_id;

  -- settled sessions always return their immutable snapshot
  IF _s.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'settled', true,
      'billed_minutes', _s.billed_minutes,
      'effective_rate_ils', _s.effective_rate_ils,
      'subtotal_ils', _s.subtotal_ils,
      'discount_ils', _s.discount_ils,
      'total_ils', _s.total_ils,
      'ticket_id', _s.ticket_id
    );
  END IF;

  _rate := COALESCE(_s.rate_price_per_hour_snapshot,
                    (SELECT price_per_hour_ils FROM public.rate_plans WHERE id = _s.rate_plan_id), 0);
  _round := GREATEST(COALESCE(_s.rate_rounding_minutes_snapshot,
                    (SELECT rounding_minutes FROM public.rate_plans WHERE id = _s.rate_plan_id), 1), 1);
  _min := GREATEST(COALESCE(_s.rate_min_charge_snapshot,
                    (SELECT min_charge_ils FROM public.rate_plans WHERE id = _s.rate_plan_id), 0), 0);

  -- active duration excludes every paused interval
  _raw_minutes := GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(_s.end_time, now()) - _s.start_time))
      - COALESCE(_s.paused_seconds, 0)
      - CASE WHEN _s.pause_started_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (COALESCE(_s.end_time, now()) - _s.pause_started_at))
             ELSE 0 END
  , 0) / 60.0;

  IF _s.session_mode = 'timer' THEN
    -- timer sessions are sold as a block of minutes
    _minutes := GREATEST(COALESCE(_s.timer_minutes, 0), 0);
  ELSE
    _minutes := CEIL(_raw_minutes / _round)::integer * _round;
  END IF;

  _multiplier := CASE WHEN _device.type = 'playstation' THEN GREATEST(COALESCE(_s.controller_count, 1), 1) ELSE 1 END;
  _effective_rate := ROUND(_rate * _multiplier, 2);
  _amount := ROUND(_minutes / 60.0 * _effective_rate, 2);

  IF _s.paid_from_balance THEN
    _amount := 0;
  ELSE
    _amount := GREATEST(_amount, _min);
  END IF;

  RETURN jsonb_build_object(
    'settled', false,
    'device_name', _device.name,
    'status', _s.status,
    'payment_status', _s.payment_status,
    'paid_from_balance', _s.paid_from_balance,
    'active_minutes', FLOOR(_raw_minutes)::integer,
    'billed_minutes', _minutes,
    'controller_count', COALESCE(_s.controller_count, 1),
    'rate_per_hour_ils', _rate,
    'effective_rate_ils', _effective_rate,
    'min_charge_ils', _min,
    'rounding_minutes', _round,
    'subtotal_ils', _amount,
    'total_ils', _amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_session_billing(uuid) TO authenticated;

-- settle an ended session into the existing tickets architecture, exactly once
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

  INSERT INTO public.tickets (ticket_no, status, created_by, tenant_id, discount_ils, total_ils, closed_at)
  VALUES (_ticket_no, 'paid', _uid, _tenant, _discount, _total, now())
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

GRANT EXECUTE ON FUNCTION public.settle_session(uuid, jsonb, uuid, numeric) TO authenticated;