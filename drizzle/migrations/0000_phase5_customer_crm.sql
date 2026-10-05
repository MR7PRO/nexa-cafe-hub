-- Phone normalisation (digits and leading + only)
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(btrim(COALESCE(p,'')), '[^0-9+]', '', 'g'), '')
$$;

CREATE INDEX IF NOT EXISTS customers_tenant_phone_norm_idx
  ON public.customers (tenant_id, public.normalize_phone(phone));

-- Balance movement ledger (historical; written only by server functions)
CREATE TABLE public.customer_balance_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  balance_id uuid REFERENCES public.customer_balances(id) ON DELETE SET NULL,
  change_minutes integer NOT NULL,
  balance_before integer NOT NULL,
  balance_after integer NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('package_purchase','session_use','manual_adjustment','refund','correction')),
  reference_type text,
  reference_id uuid,
  reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customer_balance_movements TO authenticated;
GRANT ALL ON public.customer_balance_movements TO service_role;
ALTER TABLE public.customer_balance_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant reads balance movements" ON public.customer_balance_movements
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE INDEX cbm_customer_created_idx ON public.customer_balance_movements (customer_id, created_at DESC);
CREATE INDEX cbm_tenant_created_idx ON public.customer_balance_movements (tenant_id, created_at DESC);

-- Balances may no longer be written directly from the browser
DROP POLICY IF EXISTS "insert_balances" ON public.customer_balances;
DROP POLICY IF EXISTS "update_balances" ON public.customer_balances;

-- Exact phone lookup inside the caller's tenant
CREATE OR REPLACE FUNCTION public.find_customer_by_phone(p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid := public.get_user_tenant_id(auth.uid()); _n text := public.normalize_phone(p_phone); _r record;
BEGIN
  IF auth.uid() IS NULL OR _tenant IS NULL OR _n IS NULL THEN RETURN NULL; END IF;
  SELECT id, name, phone INTO _r FROM public.customers
   WHERE tenant_id = _tenant AND public.normalize_phone(phone) = _n
   ORDER BY created_at LIMIT 1;
  IF _r.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', _r.id, 'name', _r.name, 'phone', _r.phone);
END $$;
REVOKE ALL ON FUNCTION public.find_customer_by_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_customer_by_phone(text) TO authenticated;

-- Reuse existing customer by normalised phone; never silently rename
CREATE OR REPLACE FUNCTION public.find_or_create_customer(p_name text, p_phone text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _tenant uuid;
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
     WHERE tenant_id = _tenant AND public.normalize_phone(phone) = public.normalize_phone(_phone)
     ORDER BY created_at LIMIT 1;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  ELSE
    SELECT id INTO _id FROM public.customers
     WHERE tenant_id = _tenant AND phone IS NULL AND lower(name) = lower(_name)
     ORDER BY created_at LIMIT 1;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  INSERT INTO public.customers (name, phone, created_by, tenant_id)
  VALUES (COALESCE(_name, _phone), _phone, _uid, _tenant) RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Block direct duplicate inserts (same normalised phone in same tenant)
CREATE OR REPLACE FUNCTION public.prevent_duplicate_customer_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.normalize_phone(NEW.phone) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.tenant_id = NEW.tenant_id AND c.id <> NEW.id
       AND public.normalize_phone(c.phone) = public.normalize_phone(NEW.phone)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PHONE: يوجد زبون مسجل بنفس رقم الهاتف';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prevent_duplicate_customer_phone_trg ON public.customers;
CREATE TRIGGER prevent_duplicate_customer_phone_trg
BEFORE INSERT OR UPDATE OF phone ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_customer_phone();

-- Sell a package: minutes computed server-side from the package
CREATE OR REPLACE FUNCTION public.sell_loyalty_package(p_customer_id uuid, p_package_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tenant uuid; _pkg record; _mins integer; _bal uuid;
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
  INSERT INTO public.customer_balances (customer_id, package_id, remaining_minutes, total_minutes, sold_by, tenant_id)
  VALUES (p_customer_id, p_package_id, _mins, _mins, _uid, _tenant) RETURNING id INTO _bal;
  INSERT INTO public.customer_balance_movements (tenant_id, customer_id, balance_id, change_minutes, balance_before, balance_after, movement_type, reference_type, reference_id, performed_by)
  VALUES (_tenant, p_customer_id, _bal, _mins, 0, _mins, 'package_purchase', 'loyalty_package', p_package_id, _uid);
  PERFORM public.log_audit_event('loyalty_package_sold', 'customer_balance', _bal,
    jsonb_build_object('customer_id', p_customer_id, 'package', _pkg.name, 'minutes', _mins, 'price_ils', _pkg.price_ils), _tenant, _uid);
  RETURN _bal;
END $$;
REVOKE ALL ON FUNCTION public.sell_loyalty_package(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_loyalty_package(uuid, uuid) TO authenticated;

-- Manager/admin balance adjustment (delta only, never overwrite, never negative)
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(p_balance_id uuid, p_change_minutes integer, p_movement_type text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tenant uuid; _b record; _after integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  _tenant := public.get_user_tenant_id(_uid);
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'هذا الإجراء يتطلب صلاحية مدير'; END IF;
  IF p_movement_type NOT IN ('manual_adjustment','refund','correction') THEN RAISE EXCEPTION 'نوع الحركة غير صحيح'; END IF;
  IF COALESCE(p_change_minutes,0) = 0 THEN RAISE EXCEPTION 'عدد الدقائق غير صحيح'; END IF;
  IF NULLIF(btrim(COALESCE(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'السبب مطلوب'; END IF;
  SELECT * INTO _b FROM public.customer_balances WHERE id = p_balance_id AND tenant_id = _tenant FOR UPDATE;
  IF _b.id IS NULL THEN RAISE EXCEPTION 'رصيد الزبون غير موجود'; END IF;
  _after := _b.remaining_minutes + p_change_minutes;
  IF _after < 0 THEN RAISE EXCEPTION 'لا يمكن أن يصبح الرصيد سالباً'; END IF;
  UPDATE public.customer_balances SET remaining_minutes = _after WHERE id = _b.id;
  INSERT INTO public.customer_balance_movements (tenant_id, customer_id, balance_id, change_minutes, balance_before, balance_after, movement_type, reason, performed_by)
  VALUES (_tenant, _b.customer_id, _b.id, p_change_minutes, _b.remaining_minutes, _after, p_movement_type, btrim(p_reason), _uid);
  PERFORM public.log_audit_event('customer_balance_adjusted', 'customer_balance', _b.id,
    jsonb_build_object('customer_id', _b.customer_id, 'change_minutes', p_change_minutes, 'before', _b.remaining_minutes, 'after', _after, 'type', p_movement_type, 'reason', btrim(p_reason)), _tenant, _uid);
  RETURN jsonb_build_object('balance_before', _b.remaining_minutes, 'balance_after', _after);
END $$;
REVOKE ALL ON FUNCTION public.adjust_customer_balance(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_customer_balance(uuid, integer, text, text) TO authenticated;

-- Session start: record session_use movement in the same transaction
CREATE OR REPLACE FUNCTION public.start_session(p_device_id uuid, p_rate_plan_id uuid, p_session_mode text DEFAULT 'meter'::text, p_timer_minutes integer DEFAULT NULL::integer, p_controller_count integer DEFAULT 1, p_customer_balance_id uuid DEFAULT NULL::uuid, p_deduct_minutes integer DEFAULT NULL::integer, p_customer_id uuid DEFAULT NULL::uuid, p_reservation_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _uid uuid := auth.uid(); _tenant uuid; _device_tenant uuid; _device_active boolean; _plan record;
  _remaining integer; _bal_tenant uuid; _bal_customer uuid; _mode text; _controllers integer; _timer integer;
  _prepaid boolean := false; _session_id uuid; _res record; _customer uuid := p_customer_id;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;
  SELECT tenant_id, is_active INTO _device_tenant, _device_active FROM public.devices WHERE id = p_device_id FOR UPDATE;
  IF _device_tenant IS NULL OR _device_tenant <> _tenant THEN RAISE EXCEPTION 'الجهاز غير موجود'; END IF;
  IF NOT _device_active THEN RAISE EXCEPTION 'الجهاز غير مفعّل'; END IF;
  IF EXISTS (SELECT 1 FROM public.sessions WHERE device_id = p_device_id AND status IN ('running','paused')) THEN
    RAISE EXCEPTION 'يوجد جلسة نشطة على هذا الجهاز'; END IF;
  SELECT * INTO _plan FROM public.rate_plans WHERE id = p_rate_plan_id AND is_active;
  IF _plan.id IS NULL OR _plan.tenant_id <> _tenant THEN RAISE EXCEPTION 'خطة التسعير غير صحيحة'; END IF;
  IF _customer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer AND tenant_id = _tenant) THEN
    RAISE EXCEPTION 'الزبون غير موجود'; END IF;
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
    SELECT tenant_id, remaining_minutes, customer_id INTO _bal_tenant, _remaining, _bal_customer
      FROM public.customer_balances WHERE id = p_customer_balance_id FOR UPDATE;
    IF _bal_tenant IS NULL OR _bal_tenant <> _tenant THEN RAISE EXCEPTION 'رصيد الزبون غير موجود'; END IF;
    IF _remaining < p_deduct_minutes THEN RAISE EXCEPTION 'الرصيد غير كافٍ'; END IF;
    UPDATE public.customer_balances SET remaining_minutes = remaining_minutes - p_deduct_minutes WHERE id = p_customer_balance_id;
    _mode := 'timer'; _timer := p_deduct_minutes; _prepaid := true;
    _customer := COALESCE(_customer, _bal_customer);
  END IF;
  INSERT INTO public.sessions (
    device_id, rate_plan_id, tenant_id, created_by, session_mode, timer_minutes, controller_count, status, start_time,
    rate_price_per_hour_snapshot, rate_rounding_minutes_snapshot, rate_min_charge_snapshot,
    paid_from_balance, payment_status, customer_id, reservation_id
  ) VALUES (
    p_device_id, p_rate_plan_id, _tenant, _uid, _mode, _timer, _controllers, 'running', now(),
    _plan.price_per_hour_ils, COALESCE(_plan.rounding_minutes, 1), COALESCE(_plan.min_charge_ils, 0),
    _prepaid, CASE WHEN _prepaid THEN 'prepaid' ELSE 'unpaid' END, _customer, p_reservation_id
  ) RETURNING id INTO _session_id;
  IF _prepaid THEN
    INSERT INTO public.customer_balance_movements (tenant_id, customer_id, balance_id, change_minutes, balance_before, balance_after, movement_type, reference_type, reference_id, performed_by)
    VALUES (_tenant, _bal_customer, p_customer_balance_id, -p_deduct_minutes, _remaining, _remaining - p_deduct_minutes, 'session_use', 'session', _session_id, _uid);
  END IF;
  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.reservations SET status = 'completed', fulfilled_at = now(), session_id = _session_id,
      customer_id = COALESCE(customer_id, _customer) WHERE id = p_reservation_id;
  END IF;
  RETURN _session_id;
END $function$;

-- Legacy 7-arg overload delegates so every deduction is ledgered
CREATE OR REPLACE FUNCTION public.start_session(p_device_id uuid, p_rate_plan_id uuid, p_session_mode text DEFAULT 'meter'::text, p_timer_minutes integer DEFAULT NULL::integer, p_controller_count integer DEFAULT 1, p_customer_balance_id uuid DEFAULT NULL::uuid, p_deduct_minutes integer DEFAULT NULL::integer)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.start_session(p_device_id, p_rate_plan_id, p_session_mode, p_timer_minutes, p_controller_count, p_customer_balance_id, p_deduct_minutes, NULL::uuid, NULL::uuid)
$$;

-- Customer profile: summary aggregated server-side + small recent lists
CREATE OR REPLACE FUNCTION public.get_customer_profile(p_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid := public.get_user_tenant_id(auth.uid()); _c record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT id, name, phone, notes, created_at INTO _c FROM public.customers WHERE id = p_customer_id AND tenant_id = _tenant;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'الزبون غير موجود'; END IF;
  RETURN jsonb_build_object(
    'customer', to_jsonb(_c),
    'remaining_minutes', (SELECT COALESCE(sum(remaining_minutes),0) FROM public.customer_balances WHERE customer_id = _c.id AND tenant_id = _tenant),
    'total_visits', (SELECT count(*) FROM public.sessions WHERE customer_id = _c.id AND tenant_id = _tenant),
    'total_gaming_minutes', (SELECT COALESCE(sum(COALESCE(billed_minutes,
        GREATEST(0, floor((extract(epoch FROM (end_time - start_time)) - COALESCE(paused_seconds,0)) / 60))::int)),0)
      FROM public.sessions WHERE customer_id = _c.id AND tenant_id = _tenant AND end_time IS NOT NULL),
    'total_spent_ils', (SELECT COALESCE(sum(total_ils),0) FROM public.tickets WHERE customer_id = _c.id AND tenant_id = _tenant AND status = 'paid'),
    'balances', COALESCE((SELECT jsonb_agg(x ORDER BY x.purchased_at DESC) FROM (
        SELECT b.id, b.remaining_minutes, b.total_minutes, b.purchased_at, lp.name AS package_name
        FROM public.customer_balances b LEFT JOIN public.loyalty_packages lp ON lp.id = b.package_id
        WHERE b.customer_id = _c.id AND b.tenant_id = _tenant ORDER BY b.purchased_at DESC LIMIT 10) x), '[]'::jsonb),
    'recent_sessions', COALESCE((SELECT jsonb_agg(x ORDER BY x.start_time DESC) FROM (
        SELECT s.id, s.start_time, s.end_time, s.status, s.billed_minutes, s.total_ils, s.paid_from_balance, d.name AS device_name
        FROM public.sessions s LEFT JOIN public.devices d ON d.id = s.device_id
        WHERE s.customer_id = _c.id AND s.tenant_id = _tenant ORDER BY s.start_time DESC LIMIT 10) x), '[]'::jsonb),
    'recent_tickets', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
        SELECT id, ticket_no, status, total_ils, refund_amount_ils, created_at FROM public.tickets
        WHERE customer_id = _c.id AND tenant_id = _tenant ORDER BY created_at DESC LIMIT 10) x), '[]'::jsonb),
    'recent_reservations', COALESCE((SELECT jsonb_agg(x ORDER BY x.reserved_date DESC, x.start_time DESC) FROM (
        SELECT r.id, r.reserved_date, r.start_time, r.end_time, r.status, d.name AS device_name
        FROM public.reservations r LEFT JOIN public.devices d ON d.id = r.device_id
        WHERE r.customer_id = _c.id AND r.tenant_id = _tenant ORDER BY r.reserved_date DESC, r.start_time DESC LIMIT 10) x), '[]'::jsonb),
    'recent_movements', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
        SELECT id, change_minutes, balance_before, balance_after, movement_type, reason, created_at
        FROM public.customer_balance_movements WHERE customer_id = _c.id AND tenant_id = _tenant
        ORDER BY created_at DESC LIMIT 20) x), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.get_customer_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_profile(uuid) TO authenticated;