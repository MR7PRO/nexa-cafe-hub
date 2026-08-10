/**
 * Pure reservation rules shared by the reservations page, the session
 * workflow and the notification provider. Kept free of React/Supabase so the
 * behaviour can be unit-tested directly.
 */

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

/** Operational phase shown to staff. */
export type ReservationPhase = 'upcoming' | 'active' | 'completed' | 'cancelled' | 'missed';

export interface ReservationLike {
  id: string;
  device_id: string;
  reserved_date: string; // yyyy-MM-dd
  start_time: string; // HH:mm[:ss]
  end_time: string; // HH:mm[:ss]
  status: ReservationStatus;
  session_id?: string | null;
}

export const RESERVATION_PHASE_LABELS: Record<ReservationPhase, string> = {
  upcoming: 'قادم',
  active: 'جاري الآن',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  missed: 'لم يحضر',
};

export const RESERVATION_PHASE_CLASSES: Record<ReservationPhase, string> = {
  upcoming: 'bg-primary/15 text-primary border-primary/30',
  active: 'bg-success/15 text-success border-success/30',
  completed: 'bg-muted text-muted-foreground border-border',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
  missed: 'bg-warning/15 text-warning border-warning/30',
};

/** Combine the reservation date and a HH:mm[:ss] time into a local Date. */
export function reservationDateTime(date: string, time: string): Date {
  const [h = '0', m = '0', s = '0'] = time.split(':');
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, Number(h), Number(m), Number(s));
}

export function reservationStart(r: ReservationLike) {
  return reservationDateTime(r.reserved_date, r.start_time);
}

export function reservationEnd(r: ReservationLike) {
  return reservationDateTime(r.reserved_date, r.end_time);
}

/** Minutes until the reservation starts (negative once it has started). */
export function minutesUntilStart(r: ReservationLike, now: Date = new Date()): number {
  return Math.round((reservationStart(r).getTime() - now.getTime()) / 60000);
}

export function getReservationPhase(r: ReservationLike, now: Date = new Date()): ReservationPhase {
  if (r.status === 'cancelled') return 'cancelled';
  if (r.status === 'completed' || r.session_id) return 'completed';

  const start = reservationStart(r).getTime();
  const end = reservationEnd(r).getTime();
  const t = now.getTime();

  if (t < start) return 'upcoming';
  if (t <= end) return 'active';
  return 'missed';
}

/** Two reservations clash when they share a device, a date and overlapping times. */
export function reservationsOverlap(a: ReservationLike, b: ReservationLike): boolean {
  if (a.id === b.id) return false;
  if (a.device_id !== b.device_id) return false;
  if (a.reserved_date !== b.reserved_date) return false;
  if (a.status === 'cancelled' || b.status === 'cancelled') return false;
  if (a.status === 'completed' || b.status === 'completed') return false;
  return a.start_time < b.end_time && a.end_time > b.start_time;
}

/** Ids of every reservation that clashes with at least one other reservation. */
export function findConflictingIds(list: ReservationLike[]): Set<string> {
  const conflicts = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (reservationsOverlap(list[i], list[j])) {
        conflicts.add(list[i].id);
        conflicts.add(list[j].id);
      }
    }
  }
  return conflicts;
}

/**
 * Staff may start a session from a reservation once it is close enough to the
 * booked time and the reservation has not been used yet.
 */
export function canStartFromReservation(
  r: ReservationLike,
  now: Date = new Date(),
  earlyGraceMinutes = 15
): boolean {
  if (r.status === 'cancelled' || r.status === 'completed' || r.session_id) return false;
  const phase = getReservationPhase(r, now);
  if (phase === 'active') return true;
  return phase === 'upcoming' && minutesUntilStart(r, now) <= earlyGraceMinutes;
}

/** Duration of the booking in whole minutes — used to prefill timer sessions. */
export function reservationMinutes(r: ReservationLike): number {
  return Math.max(
    Math.round((reservationEnd(r).getTime() - reservationStart(r).getTime()) / 60000),
    0
  );
}
