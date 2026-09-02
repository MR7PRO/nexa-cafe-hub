-- ============ 1. audit log: indexes ============
CREATE INDEX IF NOT EXISTS audit_logs_tenant_created_idx
  ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
  ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON public.audit_logs (action, created_at DESC);

-- ============ 2. server-side audit writer ============
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action text,
  _entity text,
  _entity_id uuid,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _tenant uuid DEFAULT NULL,
  _actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := COALESCE(_actor, auth.uid());
  _t uuid := COALESCE(_tenant, public.get_user_tenant_id(_uid));
BEGIN
  IF _t IS NULL THEN RETURN; END IF;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, details_json, tenant_id)
  VALUES (_uid, _action, _entity, _entity_id, COALESCE(_metadata, '{}'::jsonb), _t);
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid, uuid) FROM PUBLIC, anon;

-- ============ 3. correction columns (preserve original data) ============
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS void_type text,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_amount_ils numeric;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

CREATE INDEX IF NOT EXISTS tickets_tenant_created_idx ON public.tickets (tenant_id, created_at DESC);

-- ============ 4. void / refund a settled ticket ============
CREATE OR REPLACE FUNCTION public.void_ticket(
  p_ticket_id uuid,
  p_reason text,
  p_mode text DEFAULT 'void',
  p_refund_amount_ils numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _t record;
  _mode text := CASE WHEN p_mode = 'refund' THEN 'refund' ELSE 'void' END;
  _reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  _refund numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  IF NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'manager') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'هذه العملية تتطلب صلاحية مدير';
  END IF;

  IF _reason IS NULL THEN RAISE EXCEPTION 'سبب الإلغاء مطلوب'; END IF;

  SELECT * INTO _t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF _t.id IS NULL OR (_t.tenant_id <> _tenant AND NOT public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة';
  END IF;
  IF _t.status = 'void' THEN RAISE EXCEPTION 'الفاتورة ملغاة مسبقاً'; END IF;

  _refund := CASE WHEN _mode = 'refund'
                  THEN LEAST(GREATEST(COALESCE(p_refund_amount_ils, _t.total_ils), 0), _t.total_ils)
                  ELSE 0 END;

  -- return stock for product lines (original ticket rows stay untouched)
  UPDATE public.products p
  SET stock_qty = p.stock_qty + agg.qty
  FROM (
    SELECT i.ref_id AS id, SUM(i.qty)::integer AS qty
    FROM public.ticket_items i
    WHERE i.ticket_id = p_ticket_id AND i.item_type = 'product' AND i.ref_id IS NOT NULL
    GROUP BY i.ref_id
  ) agg
  WHERE p.id = agg.id AND p.stock_qty IS NOT NULL;

  UPDATE public.tickets
  SET status = 'void',
      void_type = _mode,
      void_reason = _reason,
      voided_by = _uid,
      voided_at = now(),
      refund_amount_ils = _refund
  WHERE id = p_ticket_id;

  -- a settled session tied to this ticket is flagged, never erased
  UPDATE public.sessions
  SET payment_status = CASE WHEN _mode = 'refund' THEN 'refunded' ELSE 'voided' END
  WHERE ticket_id = p_ticket_id;

  PERFORM public.log_audit_event(
    CASE WHEN _mode = 'refund' THEN 'ticket_refunded' ELSE 'ticket_voided' END,
    'ticket', p_ticket_id,
    jsonb_build_object(
      'ticket_no', _t.ticket_no,
      'original_total_ils', _t.total_ils,
      'refund_amount_ils', _refund,
      'reason', _reason
    ),
    _t.tenant_id, _uid
  );

  RETURN jsonb_build_object(
    'ticket_id', p_ticket_id,
    'ticket_no', _t.ticket_no,
    'mode', _mode,
    'refund_amount_ils', _refund
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_ticket(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_ticket(uuid, text, text, numeric) TO authenticated;

-- ============ 5. void an expense ============
CREATE OR REPLACE FUNCTION public.void_expense(p_expense_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _e record;
  _reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'manager') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'هذه العملية تتطلب صلاحية مدير';
  END IF;
  IF _reason IS NULL THEN RAISE EXCEPTION 'سبب الإلغاء مطلوب'; END IF;

  SELECT * INTO _e FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
  IF _e.id IS NULL OR (_e.tenant_id <> _tenant AND NOT public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'المصروف غير موجود';
  END IF;
  IF _e.voided_at IS NOT NULL THEN RAISE EXCEPTION 'المصروف ملغى مسبقاً'; END IF;

  UPDATE public.expenses
  SET voided_at = now(), voided_by = _uid, void_reason = _reason
  WHERE id = p_expense_id;

  PERFORM public.log_audit_event('expense_voided', 'expense', p_expense_id,
    jsonb_build_object('title', _e.title, 'amount_ils', _e.amount_ils, 'reason', _reason),
    _e.tenant_id, _uid);
END;
$$;

REVOKE ALL ON FUNCTION public.void_expense(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_expense(uuid, text) TO authenticated;

-- ============ 6. audit triggers for expenses / shifts / roles / settings ============
CREATE OR REPLACE FUNCTION public.audit_expense_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('expense_created', 'expense', NEW.id,
      jsonb_build_object('title', NEW.title, 'amount_ils', NEW.amount_ils), NEW.tenant_id, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.voided_at IS NULL AND (
      NEW.amount_ils <> OLD.amount_ils OR NEW.title <> OLD.title
  ) THEN
    PERFORM public.log_audit_event('expense_edited', 'expense', NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'from_amount_ils', OLD.amount_ils,
        'to_amount_ils', NEW.amount_ils
      ), NEW.tenant_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_expenses ON public.expenses;
CREATE TRIGGER audit_expenses
AFTER INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.audit_expense_changes();

CREATE OR REPLACE FUNCTION public.audit_shift_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('shift_opened', 'shift', NEW.id,
      jsonb_build_object('opening_cash_ils', NEW.opening_cash_ils), NEW.tenant_id, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND OLD.close_time IS NULL AND NEW.close_time IS NOT NULL THEN
    PERFORM public.log_audit_event('shift_closed', 'shift', NEW.id,
      jsonb_build_object(
        'closing_cash_ils', NEW.closing_cash_ils,
        'expected_cash_ils', NEW.expected_cash_ils,
        'difference_ils', NEW.difference_ils
      ), NEW.tenant_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_shifts ON public.shifts;
CREATE TRIGGER audit_shifts
AFTER INSERT OR UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.audit_shift_changes();

CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  PERFORM public.log_audit_event('user_role_changed', 'user_role', _target,
    jsonb_build_object(
      'operation', TG_OP,
      'from_role', CASE WHEN TG_OP <> 'INSERT' THEN OLD.role::text END,
      'to_role', CASE WHEN TG_OP <> 'DELETE' THEN NEW.role::text END
    ),
    public.get_user_tenant_id(_target), auth.uid());
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();

CREATE OR REPLACE FUNCTION public.audit_setting_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value THEN
    RETURN NEW;
  END IF;
  PERFORM public.log_audit_event('settings_changed', 'setting', NEW.id,
    jsonb_build_object('key', NEW.key), NEW.tenant_id, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_settings ON public.settings;
CREATE TRIGGER audit_settings
AFTER INSERT OR UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.audit_setting_changes();

-- ============ 7. audit inside the money RPCs ============
CREATE OR REPLACE FUNCTION public.process_sale(p_items jsonb, p_payments jsonb, p_promotion_id uuid DEFAULT NULL::uuid, p_manual_discount_ils numeric DEFAULT 0, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.log_audit_event('ticket_paid', 'ticket', _ticket_id,
    jsonb_build_object(
      'ticket_no', _ticket_no,
      'total_ils', _total,
      'discount_ils', _discount,
      'items', jsonb_array_length(_lines),
      'source', 'pos'
    ), _tenant, _uid);

  RETURN jsonb_build_object(
    'ticket_id', _ticket_id,
    'ticket_no', _ticket_no,
    'subtotal_ils', _subtotal,
    'discount_ils', _discount,
    'total_ils', _total
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_session(p_session_id uuid, p_payments jsonb DEFAULT NULL::jsonb, p_promotion_id uuid DEFAULT NULL::uuid, p_manual_discount_ils numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.log_audit_event('session_settled', 'session', p_session_id,
    jsonb_build_object(
      'ticket_no', _ticket_no,
      'device', _device.name,
      'billed_minutes', (_calc->>'billed_minutes')::integer,
      'total_ils', _total,
      'discount_ils', _discount
    ), _tenant, _uid);

  RETURN jsonb_build_object(
    'ticket_id', _ticket_id,
    'ticket_no', _ticket_no,
    'billed_minutes', (_calc->>'billed_minutes')::integer,
    'subtotal_ils', _subtotal,
    'discount_ils', _discount,
    'total_ils', _total
  );
END;
$function$;

-- ============ 8. paginated audit feed for admin/manager ============
CREATE OR REPLACE FUNCTION public.get_audit_events(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  _offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  _search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  _total integer;
  _rows jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'manager') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'هذه الصفحة تتطلب صلاحية مدير';
  END IF;

  WITH filtered AS (
    SELECT a.*, pr.name AS actor_name
    FROM public.audit_logs a
    LEFT JOIN public.profiles pr ON pr.id = a.user_id
    WHERE (a.tenant_id = _tenant OR public.is_super_admin(_uid))
      AND (p_start IS NULL OR a.created_at >= p_start)
      AND (p_end IS NULL OR a.created_at <= p_end)
      AND (p_actor IS NULL OR a.user_id = p_actor)
      AND (p_action IS NULL OR a.action = p_action)
      AND (_search IS NULL
           OR a.details_json::text ILIKE '%' || _search || '%'
           OR a.entity_id::text ILIKE '%' || _search || '%')
  )
  SELECT COUNT(*)::integer,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'created_at', f.created_at,
        'action', f.action,
        'entity', f.entity,
        'entity_id', f.entity_id,
        'actor_id', f.user_id,
        'actor_name', f.actor_name,
        'metadata', f.details_json
      ) ORDER BY f.created_at DESC)
      FROM (SELECT * FROM filtered ORDER BY created_at DESC LIMIT _limit OFFSET _offset) f
    ), '[]'::jsonb)
  INTO _total, _rows
  FROM filtered;

  RETURN jsonb_build_object('total', COALESCE(_total, 0), 'events', _rows,
                            'limit', _limit, 'offset', _offset);
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_events(timestamptz, timestamptz, uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_events(timestamptz, timestamptz, uuid, text, text, integer, integer) TO authenticated;

-- ============ 9. reports account for voids/refunds ============
CREATE OR REPLACE FUNCTION public.get_report_metrics(p_start timestamp with time zone, p_end timestamp with time zone, p_bucket text DEFAULT 'day'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _bucket text := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'day' END;
  _result jsonb;
  _range_minutes numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  _range_minutes := GREATEST(EXTRACT(EPOCH FROM (p_end - p_start)) / 60.0, 1);

  WITH tk AS (
    SELECT t.id, t.created_at, t.total_ils, t.discount_ils, t.created_by
    FROM public.tickets t
    WHERE t.tenant_id = _tenant AND t.status = 'paid'
      AND t.created_at >= p_start AND t.created_at <= p_end
  ),
  voided AS (
    SELECT t.id, t.total_ils, t.void_type, COALESCE(t.refund_amount_ils, 0) AS refund_amount_ils
    FROM public.tickets t
    WHERE t.tenant_id = _tenant AND t.status = 'void'
      AND t.created_at >= p_start AND t.created_at <= p_end
  ),
  ti AS (
    SELECT i.*, tk.created_at AS ticket_created_at
    FROM public.ticket_items i
    JOIN tk ON tk.id = i.ticket_id
  ),
  prod_lines AS (
    SELECT i.name, i.qty, i.total_ils,
           COALESCE(i.unit_cost_ils, p.cost_price_ils, 0) * i.qty AS cost_ils
    FROM ti i
    LEFT JOIN public.products p ON p.id = i.ref_id
    WHERE i.item_type = 'product'
  ),
  totals AS (
    SELECT
      (SELECT COALESCE(SUM(total_ils),0) FROM tk) AS total_revenue,
      (SELECT COUNT(*) FROM tk) AS total_tickets,
      (SELECT COALESCE(SUM(total_ils),0) FROM ti WHERE item_type = 'session') AS session_revenue,
      (SELECT COALESCE(SUM(total_ils),0) FROM ti WHERE item_type = 'product') AS product_revenue,
      (SELECT COALESCE(SUM(cost_ils),0) FROM prod_lines) AS product_cogs
  ),
  sess AS (
    SELECT s.*,
      GREATEST(
        COALESCE(s.billed_minutes,
          EXTRACT(EPOCH FROM (COALESCE(s.end_time, now()) - s.start_time))/60.0
            - COALESCE(s.paused_seconds,0)/60.0
        ), 0) AS active_minutes
    FROM public.sessions s
    WHERE s.tenant_id = _tenant
      AND s.created_at >= p_start AND s.created_at <= p_end
  ),
  series AS (
    SELECT date_trunc(_bucket, tk.created_at) AS bucket,
           COALESCE(SUM(CASE WHEN i.item_type='session' THEN i.total_ils END),0) AS sessions,
           COALESCE(SUM(CASE WHEN i.item_type='product' THEN i.total_ils END),0) AS products
    FROM tk
    LEFT JOIN public.ticket_items i ON i.ticket_id = tk.id
    GROUP BY 1
  ),
  series_fixed AS (
    SELECT date_trunc(_bucket, tk.created_at) AS bucket, SUM(tk.total_ils) AS total
    FROM tk GROUP BY 1
  ),
  device_rev AS (
    SELECT COALESCE(d.name, 'غير معروف') AS name,
      COUNT(s.id) AS sessions,
      COALESCE(SUM(s.total_ils),0) AS revenue,
      COALESCE(SUM(s.active_minutes),0) AS minutes
    FROM sess s
    LEFT JOIN public.devices d ON d.id = s.device_id
    GROUP BY COALESCE(d.name, 'غير معروف')
  ),
  staff AS (
    SELECT pr.id, pr.name,
      (SELECT COUNT(*) FROM sess s WHERE s.created_by = pr.id) AS sessions_started,
      (SELECT COUNT(*) FROM tk WHERE tk.created_by = pr.id) AS tickets_closed,
      (SELECT COALESCE(SUM(tk.total_ils),0) FROM tk WHERE tk.created_by = pr.id) AS revenue
    FROM public.profiles pr
    WHERE pr.tenant_id = _tenant
  )
  SELECT jsonb_build_object(
    'total_revenue', (SELECT ROUND(total_revenue,2) FROM totals),
    'session_revenue', (SELECT ROUND(session_revenue,2) FROM totals),
    'product_revenue', (SELECT ROUND(product_revenue,2) FROM totals),
    'total_tickets', (SELECT total_tickets FROM totals),
    'avg_ticket_value', (SELECT ROUND(CASE WHEN total_tickets > 0 THEN total_revenue/total_tickets ELSE 0 END, 2) FROM totals),
    'product_cogs', (SELECT ROUND(product_cogs,2) FROM totals),
    'product_gross_profit', (SELECT ROUND(product_revenue - product_cogs,2) FROM totals),
    'voided_tickets', (SELECT COUNT(*) FROM voided),
    'voided_amount_ils', (SELECT ROUND(COALESCE(SUM(total_ils),0),2) FROM voided),
    'refunded_amount_ils', (SELECT ROUND(COALESCE(SUM(refund_amount_ils),0),2) FROM voided),
    'operating_expenses', (
      SELECT ROUND(COALESCE(SUM(e.amount_ils),0),2) FROM public.expenses e
      WHERE e.tenant_id = _tenant AND e.voided_at IS NULL
        AND e.created_at >= p_start AND e.created_at <= p_end
    ),
    'revenue_series', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'bucket')
      FROM (
        SELECT jsonb_build_object(
          'bucket', to_char(sf.bucket, 'YYYY-MM-DD'),
          'sessions', ROUND(COALESCE(s.sessions,0),2),
          'products', ROUND(COALESCE(s.products,0),2),
          'total', ROUND(sf.total,2)
        ) AS x
        FROM series_fixed sf LEFT JOIN series s ON s.bucket = sf.bucket
      ) q
    ), '[]'::jsonb),
    'sessions_count', (SELECT COUNT(*) FROM sess),
    'avg_session_minutes', (SELECT ROUND(COALESCE(AVG(active_minutes),0),1) FROM sess WHERE end_time IS NOT NULL),
    'devices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', name,
        'sessions', sessions,
        'revenue', ROUND(revenue,2),
        'minutes', ROUND(minutes,0),
        'utilization_pct', ROUND(LEAST(minutes / _range_minutes * 100, 100), 1)
      ) ORDER BY revenue DESC, sessions DESC)
      FROM device_rev
    ), '[]'::jsonb),
    'peak_hours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('hour', h, 'sessions', c) ORDER BY h)
      FROM (
        SELECT g.h AS h, COUNT(s.id) AS c
        FROM generate_series(0,23) g(h)
        LEFT JOIN sess s ON EXTRACT(HOUR FROM s.start_time) = g.h
        GROUP BY g.h
      ) q
    ), '[]'::jsonb),
    'top_products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', name, 'quantity', qty, 'revenue', ROUND(rev,2),
        'cost', ROUND(cost,2), 'profit', ROUND(rev - cost,2)
      ) ORDER BY rev DESC)
      FROM (
        SELECT name, SUM(qty) AS qty, SUM(total_ils) AS rev, SUM(cost_ils) AS cost
        FROM prod_lines GROUP BY name ORDER BY SUM(total_ils) DESC LIMIT 10
      ) q
    ), '[]'::jsonb),
    'top_products_by_qty', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'quantity', qty, 'revenue', ROUND(rev,2)) ORDER BY qty DESC)
      FROM (
        SELECT name, SUM(qty) AS qty, SUM(total_ils) AS rev
        FROM prod_lines GROUP BY name ORDER BY SUM(qty) DESC LIMIT 10
      ) q
    ), '[]'::jsonb),
    'top_products_by_profit', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'quantity', qty, 'profit', ROUND(profit,2)) ORDER BY profit DESC)
      FROM (
        SELECT name, SUM(qty) AS qty, SUM(total_ils - cost_ils) AS profit
        FROM prod_lines GROUP BY name ORDER BY SUM(total_ils - cost_ils) DESC LIMIT 10
      ) q
    ), '[]'::jsonb),
    'low_stock_count', (
      SELECT COUNT(*) FROM public.products p
      WHERE p.tenant_id = _tenant AND p.is_active AND p.stock_qty IS NOT NULL
        AND p.stock_qty <= COALESCE(p.low_stock_threshold, 5)
    ),
    'shift_cash_difference', (
      SELECT ROUND(COALESCE(SUM(sh.difference_ils),0),2) FROM public.shifts sh
      WHERE sh.tenant_id = _tenant AND sh.open_time >= p_start AND sh.open_time <= p_end
    ),
    'shift_count', (
      SELECT COUNT(*) FROM public.shifts sh
      WHERE sh.tenant_id = _tenant AND sh.open_time >= p_start AND sh.open_time <= p_end
    ),
    'staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', name, 'sessions_started', sessions_started,
        'tickets_closed', tickets_closed, 'revenue', ROUND(revenue,2)
      ) ORDER BY revenue DESC)
      FROM staff WHERE sessions_started > 0 OR tickets_closed > 0
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$function$;