-- ============ device maintenance ============
CREATE TABLE IF NOT EXISTS public.device_maintenance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  issue_type text NOT NULL DEFAULT 'other',
  description text,
  opened_by uuid REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_maintenance_status_chk CHECK (status IN ('open','in_progress','resolved')),
  CONSTRAINT device_maintenance_issue_chk CHECK (issue_type IN ('hardware','controller','screen','network','software','cleaning','other'))
);

GRANT SELECT, INSERT, UPDATE ON public.device_maintenance TO authenticated;
GRANT ALL ON public.device_maintenance TO service_role;

ALTER TABLE public.device_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read maintenance"
ON public.device_maintenance FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant members report maintenance"
ON public.device_maintenance FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.id = device_id AND d.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "management updates maintenance"
ON public.device_maintenance FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.is_super_admin(auth.uid())
  )
)
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_device_maintenance_tenant_created
  ON public.device_maintenance (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_maintenance_device_status
  ON public.device_maintenance (device_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_maintenance_one_open
  ON public.device_maintenance (device_id) WHERE status <> 'resolved';

CREATE TRIGGER set_device_maintenance_tenant
BEFORE INSERT ON public.device_maintenance
FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE OR REPLACE FUNCTION public.touch_device_maintenance()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_device_maintenance_updated
BEFORE UPDATE ON public.device_maintenance
FOR EACH ROW EXECUTE FUNCTION public.touch_device_maintenance();

-- ============ optional device details ============
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS notes text;

-- ============ block sessions on devices with an open issue ============
CREATE OR REPLACE FUNCTION public.block_session_on_maintenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.device_maintenance m
    WHERE m.device_id = NEW.device_id AND m.status <> 'resolved'
  ) THEN
    RAISE EXCEPTION 'الجهاز تحت الصيانة — لا يمكن بدء جلسة عليه';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_session_on_maintenance_trg ON public.sessions;
CREATE TRIGGER block_session_on_maintenance_trg
BEFORE INSERT ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.block_session_on_maintenance();

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.report_device_issue(
  p_device_id uuid,
  p_issue_type text DEFAULT 'other',
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.devices d WHERE d.id = p_device_id AND d.tenant_id = _tenant) THEN
    RAISE EXCEPTION 'الجهاز غير موجود';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.device_maintenance m
    WHERE m.device_id = p_device_id AND m.status <> 'resolved'
  ) THEN
    RAISE EXCEPTION 'يوجد عطل مفتوح على هذا الجهاز';
  END IF;

  INSERT INTO public.device_maintenance (tenant_id, device_id, status, issue_type, description, opened_by, opened_at)
  VALUES (_tenant, p_device_id, 'open',
          COALESCE(NULLIF(p_issue_type, ''), 'other'),
          NULLIF(p_description, ''), _uid, now())
  RETURNING id INTO _id;

  PERFORM public.log_audit_event('device_maintenance_opened', 'device_maintenance', _id,
    jsonb_build_object('device_id', p_device_id, 'issue_type', COALESCE(NULLIF(p_issue_type,''),'other')),
    _tenant, _uid);

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_device_issue(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_device_issue(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_device_maintenance(
  p_id uuid,
  p_status text,
  p_resolution_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _rec public.device_maintenance;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  IF NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'manager') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'هذا الإجراء يتطلب صلاحية مدير';
  END IF;

  IF p_status NOT IN ('open','in_progress','resolved') THEN
    RAISE EXCEPTION 'حالة غير صحيحة';
  END IF;

  SELECT * INTO _rec FROM public.device_maintenance
  WHERE id = p_id AND tenant_id = _tenant FOR UPDATE;
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'السجل غير موجود'; END IF;

  UPDATE public.device_maintenance
  SET status = p_status,
      resolution_note = COALESCE(NULLIF(p_resolution_note, ''), resolution_note),
      resolved_by = CASE WHEN p_status = 'resolved' THEN _uid ELSE NULL END,
      resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE NULL END
  WHERE id = p_id;

  PERFORM public.log_audit_event(
    CASE WHEN p_status = 'resolved' THEN 'device_maintenance_resolved' ELSE 'device_maintenance_updated' END,
    'device_maintenance', p_id,
    jsonb_build_object('device_id', _rec.device_id, 'status', p_status),
    _tenant, _uid);
END;
$$;

REVOKE ALL ON FUNCTION public.update_device_maintenance(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_device_maintenance(uuid, text, text) TO authenticated;

-- ============ reports: maintenance events, downtime, utilization ============
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
  maint AS (
    SELECT m.device_id,
      COUNT(*) AS events,
      COALESCE(SUM(
        EXTRACT(EPOCH FROM (
          LEAST(COALESCE(m.resolved_at, p_end), p_end) - GREATEST(m.opened_at, p_start)
        )) / 60.0
      ), 0) AS downtime_minutes
    FROM public.device_maintenance m
    WHERE m.tenant_id = _tenant
      AND m.opened_at <= p_end
      AND COALESCE(m.resolved_at, p_end) >= p_start
    GROUP BY m.device_id
  ),
  maint_named AS (
    SELECT COALESCE(d.name, 'غير معروف') AS name,
           SUM(m.events) AS events,
           GREATEST(SUM(m.downtime_minutes), 0) AS downtime_minutes
    FROM maint m
    LEFT JOIN public.devices d ON d.id = m.device_id
    GROUP BY COALESCE(d.name, 'غير معروف')
  ),
  device_rev AS (
    SELECT COALESCE(d.name, 'غير معروف') AS name,
      COUNT(s.id) AS sessions,
      COALESCE(SUM(s.total_ils),0) AS revenue,
      COALESCE(SUM(s.active_minutes),0) AS minutes,
      COALESCE(MAX(mn.downtime_minutes), 0) AS downtime_minutes
    FROM sess s
    LEFT JOIN public.devices d ON d.id = s.device_id
    LEFT JOIN maint_named mn ON mn.name = COALESCE(d.name, 'غير معروف')
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
        'downtime_minutes', ROUND(downtime_minutes,0),
        'utilization_pct', ROUND(LEAST(minutes / GREATEST(_range_minutes - LEAST(downtime_minutes, _range_minutes - 1), 1) * 100, 100), 1)
      ) ORDER BY revenue DESC, sessions DESC)
      FROM device_rev
    ), '[]'::jsonb),
    'maintenance_events', (SELECT COALESCE(SUM(events),0) FROM maint),
    'maintenance_downtime_minutes', (SELECT ROUND(COALESCE(SUM(downtime_minutes),0),0) FROM maint),
    'maintenance_open_count', (
      SELECT COUNT(*) FROM public.device_maintenance m
      WHERE m.tenant_id = _tenant AND m.status <> 'resolved'
    ),
    'device_downtime', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', name, 'events', events, 'downtime_minutes', ROUND(downtime_minutes,0)
      ) ORDER BY downtime_minutes DESC)
      FROM (SELECT * FROM maint_named ORDER BY downtime_minutes DESC LIMIT 10) q
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