CREATE OR REPLACE FUNCTION public.void_ticket(p_ticket_id uuid, p_reason text, p_mode text DEFAULT 'void'::text, p_refund_amount_ils numeric DEFAULT NULL::numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _t record;
  _m record;
  _mode text := CASE WHEN p_mode = 'refund' THEN 'refund' ELSE 'void' END;
  _reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  _refund numeric;
  _before integer;
  _take integer;
  _removed integer := 0;
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

  WITH agg AS (
    SELECT i.ref_id AS id, SUM(i.qty)::integer AS qty
    FROM public.ticket_items i
    WHERE i.ticket_id = p_ticket_id AND i.item_type = 'product' AND i.ref_id IS NOT NULL
    GROUP BY i.ref_id
  ), upd AS (
    UPDATE public.products p SET stock_qty = p.stock_qty + agg.qty
    FROM agg WHERE p.id = agg.id AND p.stock_qty IS NOT NULL
    RETURNING p.id, p.tenant_id, p.stock_qty AS after_qty, agg.qty AS qty
  )
  INSERT INTO public.inventory_movements (tenant_id, product_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, reason, performed_by)
  SELECT u.tenant_id, u.id, 'refund', u.qty, u.after_qty - u.qty, u.after_qty, 'ticket', p_ticket_id, _reason, _uid FROM upd u;

  -- take back unused hours from packages sold on this receipt
  FOR _m IN SELECT * FROM public.customer_balance_movements
            WHERE reference_type = 'ticket' AND reference_id = p_ticket_id
              AND movement_type = 'package_purchase' AND balance_id IS NOT NULL LOOP
    SELECT remaining_minutes INTO _before FROM public.customer_balances WHERE id = _m.balance_id FOR UPDATE;
    _take := LEAST(COALESCE(_before, 0), _m.change_minutes);
    IF _take > 0 THEN
      UPDATE public.customer_balances SET remaining_minutes = _before - _take WHERE id = _m.balance_id;
      INSERT INTO public.customer_balance_movements (tenant_id, customer_id, balance_id, change_minutes, balance_before, balance_after, movement_type, reference_type, reference_id, reason, performed_by)
      VALUES (_m.tenant_id, _m.customer_id, _m.balance_id, -_take, _before, _before - _take, 'refund', 'ticket', p_ticket_id, _reason, _uid);
      _removed := _removed + _take;
    END IF;
  END LOOP;

  UPDATE public.tickets SET status = 'void', void_type = _mode, void_reason = _reason,
    voided_by = _uid, voided_at = now(), refund_amount_ils = _refund
  WHERE id = p_ticket_id;

  UPDATE public.sessions SET payment_status = CASE WHEN _mode = 'refund' THEN 'refunded' ELSE 'voided' END
  WHERE ticket_id = p_ticket_id;

  PERFORM public.log_audit_event(
    CASE WHEN _mode = 'refund' THEN 'ticket_refunded' ELSE 'ticket_voided' END,
    'ticket', p_ticket_id,
    jsonb_build_object('ticket_no', _t.ticket_no, 'original_total_ils', _t.total_ils,
      'refund_amount_ils', _refund, 'reason', _reason, 'package_minutes_removed', _removed),
    _t.tenant_id, _uid);

  RETURN jsonb_build_object('ticket_id', p_ticket_id, 'ticket_no', _t.ticket_no, 'mode', _mode,
    'refund_amount_ils', _refund, 'package_minutes_removed', _removed);
END;
$function$;

-- Lock down SECURITY DEFINER functions: never callable by signed-out visitors;
-- trigger-only and internal helpers not callable through the API at all.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, p.proname, pg_get_function_result(p.oid) AS res
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prosecdef LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.res = 'trigger' OR f.proname IN ('log_audit_event','next_ticket_no','compute_promotion_discount') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;