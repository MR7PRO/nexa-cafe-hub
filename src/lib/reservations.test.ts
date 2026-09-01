import { describe, it, expect } from 'vitest';
import {
  canStartFromReservation,
  findConflictingIds,
  getReservationPhase,
  minutesUntilStart,
  reservationMinutes,
  reservationsOverlap,
  type ReservationLike,
} from './reservations';

const base = (over: Partial<ReservationLike> = {}): ReservationLike => ({
  id: 'r1',
  device_id: 'dev-1',
  reserved_date: '2026-03-10',
  start_time: '18:00',
  end_time: '20:00',
  status: 'confirmed',
  session_id: null,
  ...over,
});

const at = (time: string) => new Date(`2026-03-10T${time}:00`);

describe('reservation overlap detection', () => {
  it('flags overlapping bookings on the same device and day', () => {
    const a = base();
    const b = base({ id: 'r2', start_time: '19:00', end_time: '21:00' });
    expect(reservationsOverlap(a, b)).toBe(true);
  });

  it('allows back-to-back bookings (end == next start)', () => {
    const a = base();
    const b = base({ id: 'r2', start_time: '20:00', end_time: '22:00' });
    expect(reservationsOverlap(a, b)).toBe(false);
  });

  it('ignores different devices, different days and itself', () => {
    const a = base();
    expect(reservationsOverlap(a, base({ id: 'r2', device_id: 'dev-2' }))).toBe(false);
    expect(reservationsOverlap(a, base({ id: 'r2', reserved_date: '2026-03-11' }))).toBe(false);
    expect(reservationsOverlap(a, base())).toBe(false);
  });

  it('ignores cancelled and completed bookings', () => {
    const a = base();
    expect(reservationsOverlap(a, base({ id: 'r2', status: 'cancelled' }))).toBe(false);
    expect(reservationsOverlap(a, base({ id: 'r2', status: 'completed' }))).toBe(false);
  });

  it('collects every conflicting id from a day list', () => {
    const list = [
      base({ id: 'a', start_time: '18:00', end_time: '20:00' }),
      base({ id: 'b', start_time: '19:00', end_time: '21:00' }),
      base({ id: 'c', start_time: '21:00', end_time: '22:00' }),
    ];
    expect(findConflictingIds(list)).toEqual(new Set(['a', 'b']));
  });
});

describe('reservation status transitions', () => {
  it('moves upcoming -> active -> missed with time', () => {
    const r = base();
    expect(getReservationPhase(r, at('17:00'))).toBe('upcoming');
    expect(getReservationPhase(r, at('18:30'))).toBe('active');
    expect(getReservationPhase(r, at('21:00'))).toBe('missed');
  });

  it('reports cancelled and completed regardless of time', () => {
    expect(getReservationPhase(base({ status: 'cancelled' }), at('18:30'))).toBe('cancelled');
    expect(getReservationPhase(base({ status: 'completed' }), at('17:00'))).toBe('completed');
  });

  it('treats a fulfilled reservation (session linked) as completed', () => {
    expect(getReservationPhase(base({ session_id: 'sess-1' }), at('18:30'))).toBe('completed');
  });

  it('computes minutes until start', () => {
    expect(minutesUntilStart(base(), at('17:50'))).toBe(10);
    expect(minutesUntilStart(base(), at('18:10'))).toBe(-10);
  });
});

describe('starting a session from a reservation', () => {
  it('allows starting while active or within the early grace window', () => {
    expect(canStartFromReservation(base(), at('18:30'))).toBe(true);
    expect(canStartFromReservation(base(), at('17:50'))).toBe(true);
  });

  it('rejects starting too early, after the slot, or when already used', () => {
    expect(canStartFromReservation(base(), at('17:00'))).toBe(false);
    expect(canStartFromReservation(base(), at('21:00'))).toBe(false);
    expect(canStartFromReservation(base({ session_id: 'sess-1' }), at('18:30'))).toBe(false);
    expect(canStartFromReservation(base({ status: 'cancelled' }), at('18:30'))).toBe(false);
    expect(canStartFromReservation(base({ status: 'completed' }), at('18:30'))).toBe(false);
  });

  it('prefills timer minutes from the booked duration', () => {
    expect(reservationMinutes(base())).toBe(120);
    expect(reservationMinutes(base({ start_time: '18:00', end_time: '18:45' }))).toBe(45);
    expect(reservationMinutes(base({ start_time: '18:00', end_time: '18:00' }))).toBe(0);
  });
});
