/**
 * Pure session timing helpers (display only — the server computes billing).
 */

export interface SessionTiming {
  start_time: string;
  paused_seconds?: number | null;
  pause_started_at?: string | null;
  status?: string | null;
  session_mode?: string | null;
  timer_minutes?: number | null;
}

/** Active (non-paused) minutes elapsed for a session. */
export function computeElapsedMinutes(
  session?: SessionTiming | null,
  now: number = Date.now()
): number {
  if (!session) return 0;
  const startTime = new Date(session.start_time).getTime();
  let pausedMs = (session.paused_seconds || 0) * 1000;
  if (session.status === 'paused' && session.pause_started_at) {
    pausedMs += now - new Date(session.pause_started_at).getTime();
  }
  return Math.max(Math.floor((now - startTime - pausedMs) / 60000), 0);
}

/** Minutes left on a timer session; null for open (meter) sessions. */
export function timerMinutesRemaining(
  session?: SessionTiming | null,
  now: number = Date.now()
): number | null {
  if (!session || session.session_mode !== 'timer' || !session.timer_minutes) return null;
  return session.timer_minutes - computeElapsedMinutes(session, now);
}

/** Timer sessions with 5 minutes or less left should be highlighted. */
export function isTimerEndingSoon(
  session?: SessionTiming | null,
  now: number = Date.now(),
  thresholdMinutes = 5
): boolean {
  const remaining = timerMinutesRemaining(session, now);
  return remaining !== null && remaining <= thresholdMinutes && remaining > 0;
}

export function isTimerExpired(session?: SessionTiming | null, now: number = Date.now()): boolean {
  const remaining = timerMinutesRemaining(session, now);
  return remaining !== null && remaining <= 0;
}
