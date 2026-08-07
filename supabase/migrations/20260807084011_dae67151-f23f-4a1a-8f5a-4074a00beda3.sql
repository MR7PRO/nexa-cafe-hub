-- 0) Close pre-existing duplicate active sessions per device (keep newest)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY device_id ORDER BY start_time DESC, created_at DESC) AS rn
  FROM public.sessions
  WHERE status IN ('running','paused')
)
UPDATE public.sessions s
SET status = 'ended',
    end_time = COALESCE(s.end_time, now()),
    pause_started_at = NULL
FROM ranked r
WHERE s.id = r.id AND r.rn > 1;

-- 1) DB-level guarantee: only one active session per device
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_per_device
  ON public.sessions (device_id)
  WHERE status IN ('running','paused');

-- 2) Start session atomically
CREATE OR REPLACE FUNCTION public.start_session(
  p_device_id uuid,
  p_rate_plan_id uuid,
  p_session_mode text DEFAULT 'meter',
  p_timer_minutes integer DEFAULT NULL,
  p_controller_count integer DEFAULT 1,
  p_customer_balance_id uuid DEFAULT NULL,
  p_deduct_minutes integer DEFAULT NULL
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
  _plan_tenant uuid;
  _remaining integer;
  _bal_tenant uuid;
  _mode text;
  _controllers integer;
  _timer integer;
  _session_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب';
  END IF;

  SELECT tenant_id, is_active INTO _device_tenant, _device_active
  FROM public.devices WHERE id = p_device_id FOR UPDATE;
  IF _device_tenant IS NULL OR _device_tenant <> _tenant THEN
    RAISE EXCEPTION 'الجهاز غير موجود';
  END IF;
  IF NOT _device_active THEN
    RAISE EXCEPTION 'الجهاز غير مفعّل';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sessions
    WHERE device_id = p_device_id AND status IN ('running','paused')
  ) THEN
    RAISE EXCEPTION 'يوجد جلسة نشطة على هذا الجهاز';
  END IF;

  SELECT tenant_id INTO _plan_tenant
  FROM public.rate_plans WHERE id = p_rate_plan_id AND is_active;
  IF _plan_tenant IS NULL OR _plan_tenant <> _tenant THEN
    RAISE EXCEPTION 'خطة التسعير غير صحيحة';
  END IF;

  _mode := CASE WHEN p_session_mode = 'timer' THEN 'timer' ELSE 'meter' END;
  _controllers := LEAST(GREATEST(COALESCE(p_controller_count, 1), 1), 4);
  _timer := CASE WHEN _mode = 'timer' THEN GREATEST(COALESCE(p_timer_minutes, 0), 1) ELSE NULL END;

  IF p_customer_balance_id IS NOT NULL THEN
    IF COALESCE(p_deduct_minutes, 0) <= 0 THEN
      RAISE EXCEPTION 'عدد الدقائق غير صحيح';
    END IF;

    SELECT tenant_id, remaining_minutes INTO _bal_tenant, _remaining
    FROM public.customer_balances WHERE id = p_customer_balance_id FOR UPDATE;

    IF _bal_tenant IS NULL OR _bal_tenant <> _tenant THEN
      RAISE EXCEPTION 'رصيد الزبون غير موجود';
    END IF;
    IF _remaining < p_deduct_minutes THEN
      RAISE EXCEPTION 'الرصيد غير كافٍ';
    END IF;

    UPDATE public.customer_balances
    SET remaining_minutes = remaining_minutes - p_deduct_minutes
    WHERE id = p_customer_balance_id;

    _mode := 'timer';
    _timer := p_deduct_minutes;
  END IF;

  INSERT INTO public.sessions (
    device_id, rate_plan_id, tenant_id, created_by,
    session_mode, timer_minutes, controller_count, status, start_time
  ) VALUES (
    p_device_id, p_rate_plan_id, _tenant, _uid,
    _mode, _timer, _controllers, 'running', now()
  )
  RETURNING id INTO _session_id;

  RETURN _session_id;
END;
$$;

-- 3) Transfer session atomically
CREATE OR REPLACE FUNCTION public.transfer_session(
  p_session_id uuid,
  p_target_device_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _s_tenant uuid;
  _s_status session_status;
  _t_tenant uuid;
  _t_active boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  SELECT tenant_id, status INTO _s_tenant, _s_status
  FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF _s_tenant IS NULL OR _s_tenant <> _tenant THEN
    RAISE EXCEPTION 'الجلسة غير موجودة';
  END IF;
  IF _s_status NOT IN ('running','paused') THEN
    RAISE EXCEPTION 'الجلسة غير نشطة';
  END IF;

  SELECT tenant_id, is_active INTO _t_tenant, _t_active
  FROM public.devices WHERE id = p_target_device_id FOR UPDATE;
  IF _t_tenant IS NULL OR _t_tenant <> _tenant THEN
    RAISE EXCEPTION 'الجهاز الهدف غير موجود';
  END IF;
  IF NOT _t_active THEN RAISE EXCEPTION 'الجهاز الهدف غير مفعّل'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.sessions
    WHERE device_id = p_target_device_id AND status IN ('running','paused')
  ) THEN
    RAISE EXCEPTION 'الجهاز الهدف مشغول';
  END IF;

  UPDATE public.sessions SET device_id = p_target_device_id WHERE id = p_session_id;
END;
$$;

-- 4) Pause
CREATE OR REPLACE FUNCTION public.pause_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _s_tenant uuid;
  _s_status session_status;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  SELECT tenant_id, status INTO _s_tenant, _s_status
  FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF _s_tenant IS NULL OR _tenant IS NULL OR _s_tenant <> _tenant THEN
    RAISE EXCEPTION 'الجلسة غير موجودة';
  END IF;
  IF _s_status <> 'running' THEN RAISE EXCEPTION 'الجلسة ليست قيد التشغيل'; END IF;

  UPDATE public.sessions
  SET status = 'paused', pause_started_at = now()
  WHERE id = p_session_id;
END;
$$;

-- 5) Resume
CREATE OR REPLACE FUNCTION public.resume_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _s_tenant uuid;
  _s_status session_status;
  _paused_at timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  SELECT tenant_id, status, pause_started_at INTO _s_tenant, _s_status, _paused_at
  FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF _s_tenant IS NULL OR _tenant IS NULL OR _s_tenant <> _tenant THEN
    RAISE EXCEPTION 'الجلسة غير موجودة';
  END IF;
  IF _s_status <> 'paused' THEN RAISE EXCEPTION 'الجلسة ليست موقوفة'; END IF;

  UPDATE public.sessions
  SET status = 'running',
      pause_started_at = NULL,
      paused_seconds = paused_seconds
        + GREATEST(FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(_paused_at, now()))))::integer, 0)
  WHERE id = p_session_id;
END;
$$;

-- 6) End
CREATE OR REPLACE FUNCTION public.end_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _s_tenant uuid;
  _s_status session_status;
  _paused_at timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  SELECT tenant_id, status, pause_started_at INTO _s_tenant, _s_status, _paused_at
  FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF _s_tenant IS NULL OR _tenant IS NULL OR _s_tenant <> _tenant THEN
    RAISE EXCEPTION 'الجلسة غير موجودة';
  END IF;
  IF _s_status NOT IN ('running','paused') THEN
    RAISE EXCEPTION 'الجلسة منتهية بالفعل';
  END IF;

  UPDATE public.sessions
  SET status = 'ended',
      end_time = now(),
      pause_started_at = NULL,
      paused_seconds = paused_seconds + CASE
        WHEN _s_status = 'paused' AND _paused_at IS NOT NULL
        THEN GREATEST(FLOOR(EXTRACT(EPOCH FROM (now() - _paused_at)))::integer, 0)
        ELSE 0 END
  WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_session(uuid,uuid,text,integer,integer,uuid,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_session(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pause_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_session(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_session(uuid,uuid,text,integer,integer,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_session(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_session(uuid) TO authenticated;