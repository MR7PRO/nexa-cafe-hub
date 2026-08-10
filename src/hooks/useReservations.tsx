import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';
import {
  findConflictingIds,
  getReservationPhase,
  type ReservationPhase,
  type ReservationStatus,
} from '@/lib/reservations';

export interface Reservation {
  id: string;
  device_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  reserved_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  status: ReservationStatus;
  session_id: string | null;
  fulfilled_at: string | null;
  created_at: string;
}

export interface ReservationWithPhase extends Reservation {
  phase: ReservationPhase;
  hasConflict: boolean;
}

export const reservationKeys = {
  byDate: (date: string) => ['reservations', date] as const,
  all: ['reservations'] as const,
  upcoming: ['reservations-upcoming'] as const,
};

const SELECT =
  'id, device_id, customer_id, customer_name, customer_phone, reserved_date, start_time, end_time, notes, status, session_id, fulfilled_at, created_at';

/** Reservations for one day, enriched with operational phase + conflict flags. */
export function useReservationsQuery(date: string) {
  return useQuery({
    queryKey: reservationKeys.byDate(date),
    queryFn: async (): Promise<ReservationWithPhase[]> => {
      const { data, error } = await supabase
        .from('reservations')
        .select(SELECT)
        .eq('reserved_date', date)
        .order('start_time');
      if (error) throw error;

      const rows = (data || []) as Reservation[];
      const conflicts = findConflictingIds(rows);
      const now = new Date();
      return rows.map((r) => ({
        ...r,
        phase: getReservationPhase(r, now),
        hasConflict: conflicts.has(r.id),
      }));
    },
  });
}

/** Today's reservations that have not been used yet — powers operational alerts. */
export function useUpcomingReservationsQuery() {
  return useQuery({
    queryKey: reservationKeys.upcoming,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Reservation[]> => {
      const today = new Date();
      const dateStr = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-');

      const { data, error } = await supabase
        .from('reservations')
        .select(SELECT)
        .eq('reserved_date', dateStr)
        .in('status', ['pending', 'confirmed'])
        .order('start_time');
      if (error) throw error;
      return (data || []) as Reservation[];
    },
  });
}

export function useReservationRealtime(date: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`reservations-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        queryClient.invalidateQueries({ queryKey: reservationKeys.all });
        queryClient.invalidateQueries({ queryKey: reservationKeys.upcoming });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, date]);
}

export interface ReservationInput {
  device_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  reserved_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
}

export function useReservationMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: reservationKeys.all });
    queryClient.invalidateQueries({ queryKey: reservationKeys.upcoming });
  };

  const fail = (error: unknown) => {
    toast({
      title: t('error'),
      description: error instanceof Error ? error.message : String(error),
      variant: 'destructive',
    });
  };

  const createReservation = useMutation({
    mutationFn: async (input: ReservationInput) => {
      const { error } = await supabase
        .from('reservations')
        .insert({ ...input, status: 'confirmed' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'تم الحجز بنجاح' });
      invalidate();
    },
    onError: fail,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservationStatus }) => {
      const { error } = await supabase.from('reservations').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'تم تحديث الحجز' });
      invalidate();
    },
    onError: fail,
  });

  return { createReservation, updateStatus };
}
