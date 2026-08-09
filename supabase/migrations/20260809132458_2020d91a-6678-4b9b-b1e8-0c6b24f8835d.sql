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