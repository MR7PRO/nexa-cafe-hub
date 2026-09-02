import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computeElapsedMinutes, type SessionTiming } from '@/lib/sessionTime';
import { useToast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SessionDevice {
  id: string;
  name: string;
  type: 'playstation' | 'pc';
  location: string | null;
  default_rate_plan_id: string | null;
}

export interface ActiveSession {
  id: string;
  device_id: string;
  start_time: string;
  paused_seconds: number;
  pause_started_at: string | null;
  status: 'running' | 'paused' | 'ended';
  session_mode?: 'meter' | 'timer';
  timer_minutes?: number | null;
  controller_count?: number;
  paid_from_balance?: boolean;
  customer_id?: string | null;
  customer_name?: string | null;
  reservation_id?: string | null;
  rate_plan: {
    name: string;
    price_per_hour_ils: number;
  };
}

export interface SessionRatePlan {
  id: string;
  name: string;
  price_per_hour_ils: number;
}

export interface StartSessionOptions {
  ratePlanId: string;
  sessionMode: 'meter' | 'timer';
  timerMinutes?: number;
  controllerCount: number;
  customerBalanceId?: string;
  deductMinutes?: number;
  customerId?: string;
  reservationId?: string;
}

/* ------------------------------------------------------------------ */
/* Query keys                                                          */
/* ------------------------------------------------------------------ */

export const sessionKeys = {
  devices: ['session-devices'] as const,
  activeSessions: ['active-sessions'] as const,
  ratePlans: ['session-rate-plans'] as const,
};

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function useDevicesQuery() {
  return useQuery({
    queryKey: sessionKeys.devices,
    queryFn: async (): Promise<SessionDevice[]> => {
      const { data, error } = await supabase
        .from('devices')
        .select('id, name, type, location, default_rate_plan_id')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as SessionDevice[];
    },
  });
}

export function useActiveSessionsQuery() {
  return useQuery({
    queryKey: sessionKeys.activeSessions,
    queryFn: async (): Promise<Record<string, ActiveSession>> => {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          device_id,
          start_time,
          paused_seconds,
          pause_started_at,
          status,
          session_mode,
          timer_minutes,
          controller_count,
          paid_from_balance,
          customer_id,
          reservation_id,
          customers ( name ),
          rate_plans!inner (
            name,
            price_per_hour_ils
          )
        `)
        .in('status', ['running', 'paused']);
      if (error) throw error;

      const map: Record<string, ActiveSession> = {};
      (data || []).forEach((s: any) => {
        map[s.device_id] = {
          ...s,
          customer_name: s.customers?.name ?? null,
          rate_plan: s.rate_plans,
        } as ActiveSession;
      });
      return map;
    },
  });
}

export function useRatePlansQuery() {
  return useQuery({
    queryKey: sessionKeys.ratePlans,
    queryFn: async (): Promise<SessionRatePlan[]> => {
      const { data, error } = await supabase
        .from('rate_plans')
        .select('id, name, price_per_hour_ils')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Realtime — invalidate only the affected query                        */
/* ------------------------------------------------------------------ */

export function useSessionRealtime(options?: { onTickets?: () => void }) {
  const queryClient = useQueryClient();
  const onTickets = options?.onTickets;

  useEffect(() => {
    const channel = supabase
      .channel(`session-data-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        queryClient.invalidateQueries({ queryKey: sessionKeys.activeSessions });
        queryClient.invalidateQueries({ queryKey: ['pending-settlements'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        queryClient.invalidateQueries({ queryKey: sessionKeys.devices });
      });

    if (onTickets) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        onTickets();
      });
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, onTickets]);
}

/* ------------------------------------------------------------------ */
/* Mutations — single implementation shared by every page               */
/* ------------------------------------------------------------------ */

export function useSessionMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateSessions = () =>
    queryClient.invalidateQueries({ queryKey: sessionKeys.activeSessions });

  const fail = (error: unknown) => {
    toast({
      title: t('error'),
      description: error instanceof Error ? error.message : String(error),
      variant: 'destructive',
    });
    invalidateSessions();
  };

  const startSession = useMutation({
    mutationFn: async ({ deviceId, options }: { deviceId: string; options: StartSessionOptions }) => {
      const { error } = await supabase.rpc('start_session', {
        p_device_id: deviceId,
        p_rate_plan_id: options.ratePlanId,
        p_session_mode: options.sessionMode,
        p_timer_minutes: options.timerMinutes ?? null,
        p_controller_count: options.controllerCount,
        p_customer_balance_id: options.customerBalanceId ?? null,
        p_deduct_minutes: options.deductMinutes ?? null,
        p_customer_id: options.customerId ?? null,
        p_reservation_id: options.reservationId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      const balanceMsg = variables.options.customerBalanceId
        ? ` (تم خصم ${variables.options.deductMinutes} دقيقة من الرصيد)`
        : '';
      const device = queryClient
        .getQueryData<SessionDevice[]>(sessionKeys.devices)
        ?.find((d) => d.id === variables.deviceId);
      toast({ title: t('sessionStarted'), description: (device?.name || '') + balanceMsg });
      invalidateSessions();
      if (variables.options.reservationId) {
        queryClient.invalidateQueries({ queryKey: ['reservations'] });
        queryClient.invalidateQueries({ queryKey: ['reservations-upcoming'] });
      }
    },
    onError: fail,
  });

  const pauseSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc('pause_session', { p_session_id: sessionId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t('sessionPaused') });
      invalidateSessions();
    },
    onError: fail,
  });

  const resumeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc('resume_session', { p_session_id: sessionId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t('sessionResumed') });
      invalidateSessions();
    },
    onError: fail,
  });

  const endSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc('end_session', { p_session_id: sessionId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t('sessionEnded'), description: 'الجلسة بانتظار التحصيل' });
      invalidateSessions();
      queryClient.invalidateQueries({ queryKey: ['pending-settlements'] });
    },
    onError: fail,
  });

  const transferSession = useMutation({
    mutationFn: async ({ sessionId, targetDeviceId }: { sessionId: string; targetDeviceId: string }) => {
      const { error } = await supabase.rpc('transfer_session', {
        p_session_id: sessionId,
        p_target_device_id: targetDeviceId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t('sessionTransferred') });
      invalidateSessions();
    },
    onError: fail,
  });

  const extendTimer = useMutation({
    mutationFn: async ({
      sessionId,
      currentTimerMinutes,
      additionalMinutes,
    }: {
      sessionId: string;
      currentTimerMinutes: number;
      additionalMinutes: number;
    }) => {
      const { error } = await supabase
        .from('sessions')
        .update({ timer_minutes: currentTimerMinutes + additionalMinutes })
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast({
        title: t('sessionExtended'),
        description: `تم إضافة ${variables.additionalMinutes} دقيقة`,
      });
      invalidateSessions();
    },
    onError: fail,
  });

  return { startSession, pauseSession, resumeSession, endSession, transferSession, extendTimer };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function getElapsedMinutes(session?: ActiveSession | null): number {
  return computeElapsedMinutes(session as SessionTiming | null | undefined);
}
