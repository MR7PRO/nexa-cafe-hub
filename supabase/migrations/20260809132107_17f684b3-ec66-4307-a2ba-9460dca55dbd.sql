ALTER TABLE public.ticket_items ADD COLUMN IF NOT EXISTS unit_cost_ils numeric;

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status_created ON public.tickets (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_items_ticket ON public.ticket_items (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_items_tenant_type ON public.ticket_items (tenant_id, item_type);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_created ON public.sessions (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_created ON public.expenses (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_open ON public.shifts (tenant_id, open_time);

CREATE OR REPLACE FUNCTION public.process_sale(p_items jsonb, p_payments jsonb, p_promotion_id uuid DEFAULT NULL::uuid, p_manual_discount_ils numeric DEFAULT 0)
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

  INSERT INTO public.tickets (ticket_no, status, created_by, tenant_id, discount_ils, total_ils, closed_at)
  VALUES (_ticket_no, 'paid', _uid, _tenant, _discount, _total, now())
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
$function$;

CREATE OR REPLACE FUNCTION public.get_report_metrics(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text DEFAULT 'day'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
           COALESCE(SUM(CASE WHEN i.item_type='product' THEN i.total_ils END),0) AS products,
           COALESCE(SUM(tk.total_ils),0) AS total
    FROM tk
    LEFT JOIN public.ticket_items i ON i.ticket_id = tk.id
    GROUP BY 1
  ),
  series_fixed AS (
    -- ticket total must not be multiplied by the item join
    SELECT date_trunc(_bucket, tk.created_at) AS bucket, SUM(tk.total_ils) AS total
    FROM tk GROUP BY 1
  ),
  device_rev AS (
    SELECT d.id, d.name,
      COUNT(s.id) FILTER (WHERE s.id IS NOT NULL) AS sessions,
      COALESCE(SUM(s.total_ils),0) AS revenue,
      COALESCE(SUM(s.active_minutes),0) AS minutes
    FROM public.devices d
    LEFT JOIN sess s ON s.device_id = d.id
    WHERE d.tenant_id = _tenant
    GROUP BY d.id, d.name
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
    'operating_expenses', (
      SELECT ROUND(COALESCE(SUM(e.amount_ils),0),2) FROM public.expenses e
      WHERE e.tenant_id = _tenant AND e.created_at >= p_start AND e.created_at <= p_end
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
      ) ORDER BY revenue DESC)
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

REVOKE ALL ON FUNCTION public.get_report_metrics(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_metrics(timestamptz, timestamptz, text) TO authenticated;