import { describe, it, expect } from 'vitest';
import {
  computeElapsedMinutes,
  isTimerEndingSoon,
  isTimerExpired,
  timerMinutesRemaining,
  type SessionTiming,
} from './sessionTime';

const NOW = new Date('2026-01-01T12:00:00Z').getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

const session = (over: Partial<SessionTiming> = {}): SessionTiming => ({
  start_time: minutesAgo(30),
  paused_seconds: 0,
  pause_started_at: null,
  status: 'running',
  session_mode: 'open',
  timer_minutes: null,
  ...over,
});

describe('computeElapsedMinutes', () => {
  it('returns 0 without a session', () => {
    expect(computeElapsedMinutes(null, NOW)).toBe(0);
  });

  it('counts wall-clock minutes for a running session', () => {
    expect(computeElapsedMinutes(session(), NOW)).toBe(30);
  });

  it('excludes accumulated paused seconds', () => {
    expect(computeElapsedMinutes(session({ paused_seconds: 600 }), NOW)).toBe(20);
  });

  it('excludes the currently open pause window', () => {
    const s = session({ status: 'paused', pause_started_at: minutesAgo(10) });
    expect(computeElapsedMinutes(s, NOW)).toBe(20);
  });

  it('never goes negative', () => {
    expect(computeElapsedMinutes(session({ start_time: minutesAgo(-5) }), NOW)).toBe(0);
  });
});

describe('timer sessions', () => {
  const timer = (mins: number, elapsed: number) =>
    session({ session_mode: 'timer', timer_minutes: mins, start_time: minutesAgo(elapsed) });

  it('has no remaining minutes for meter sessions', () => {
    expect(timerMinutesRemaining(session(), NOW)).toBeNull();
    expect(isTimerEndingSoon(session(), NOW)).toBe(false);
    expect(isTimerExpired(session(), NOW)).toBe(false);
  });

  it('computes remaining minutes', () => {
    expect(timerMinutesRemaining(timer(60, 25), NOW)).toBe(35);
  });

  it('flags the last 5 minutes', () => {
    expect(isTimerEndingSoon(timer(60, 56), NOW)).toBe(true);
    expect(isTimerEndingSoon(timer(60, 50), NOW)).toBe(false);
  });

  it('does not flag an already expired timer as ending soon', () => {
    expect(isTimerEndingSoon(timer(60, 61), NOW)).toBe(false);
    expect(isTimerExpired(timer(60, 61), NOW)).toBe(true);
  });

  it('treats an exactly finished timer as expired', () => {
    expect(isTimerExpired(timer(60, 60), NOW)).toBe(true);
  });
});
