DROP POLICY IF EXISTS insert_payments ON public.payments;
DROP POLICY IF EXISTS update_payments ON public.payments;
DROP POLICY IF EXISTS delete_payments ON public.payments;
DROP POLICY IF EXISTS delete_tickets ON public.tickets;
DROP POLICY IF EXISTS delete_ticket_items ON public.ticket_items;
DROP POLICY IF EXISTS insert_sessions ON public.sessions;

REVOKE EXECUTE ON FUNCTION public.sell_loyalty_package(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_session_direct_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - 'timer_minutes') IS DISTINCT FROM (to_jsonb(OLD) - 'timer_minutes')
     OR OLD.status = 'ended'
     OR COALESCE(OLD.session_mode,'meter') <> 'timer'
     OR NEW.timer_minutes IS NULL
     OR NEW.timer_minutes <= COALESCE(OLD.timer_minutes,0) THEN
    RAISE EXCEPTION 'لا يمكن تعديل الجلسة مباشرة';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_session_direct_update ON public.sessions;
CREATE TRIGGER trg_guard_session_direct_update BEFORE UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_session_direct_update();

CREATE OR REPLACE FUNCTION public.compute_shift_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_in numeric; v_out numeric;
BEGIN
  IF OLD.close_time IS NOT NULL THEN
    IF current_user IN ('authenticated','anon') THEN
      RAISE EXCEPTION 'لا يمكن تعديل وردية مغلقة';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.close_time IS NULL THEN
    NEW.closing_cash_ils := NULL; NEW.expected_cash_ils := NULL; NEW.difference_ils := NULL;
    NEW.opening_cash_ils := OLD.opening_cash_ils; NEW.open_time := OLD.open_time;
    RETURN NEW;
  END IF;
  IF NEW.closing_cash_ils IS NULL OR NEW.closing_cash_ils < 0 THEN
    RAISE EXCEPTION 'مبلغ الإغلاق غير صالح';
  END IF;
  NEW.open_time := OLD.open_time; NEW.opening_cash_ils := OLD.opening_cash_ils;
  NEW.employee_id := OLD.employee_id; NEW.tenant_id := OLD.tenant_id;
  NEW.close_time := now();
  SELECT COALESCE(sum(p.amount_ils),0) INTO v_in FROM payments p JOIN tickets t ON t.id = p.ticket_id
   WHERE p.method = 'cash' AND t.status = 'paid' AND p.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND p.created_at >= OLD.open_time AND p.created_at <= NEW.close_time;
  SELECT COALESCE(sum(e.amount_ils),0) INTO v_out FROM expenses e
   WHERE e.voided_at IS NULL AND e.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND e.created_at >= OLD.open_time AND e.created_at <= NEW.close_time;
  NEW.expected_cash_ils := OLD.opening_cash_ils + v_in - v_out;
  NEW.difference_ils := NEW.closing_cash_ils - NEW.expected_cash_ils;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.compute_shift_close() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_compute_shift_close ON public.shifts;
CREATE TRIGGER trg_compute_shift_close BEFORE UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.compute_shift_close();

CREATE OR REPLACE FUNCTION public.validate_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.device_id::text || NEW.reserved_date::text));
  IF NEW.status IN ('pending', 'confirmed') AND EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.device_id = NEW.device_id AND r.reserved_date = NEW.reserved_date
      AND r.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND r.id <> NEW.id
      AND r.status IN ('pending', 'confirmed')
      AND NEW.start_time < r.end_time AND NEW.end_time > r.start_time
  ) THEN
    RAISE EXCEPTION 'يتعارض هذا الحجز مع حجز آخر على نفس الجهاز في نفس الوقت';
  END IF;
  RETURN NEW;
END;
$function$;