import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';
import { posKeys, type PaymentPart } from '@/hooks/usePOS';

export interface PendingSession {
  id: string;
  device_id: string;
  end_time: string | null;
  session_mode: string | null;
  timer_minutes: number | null;
  controller_count: number | null;
  device: { name: string; type: string } | null;
}

export interface SessionBilling {
  settled: boolean;
  device_name?: string;
  active_minutes?: number;
  billed_minutes: number;
  controller_count?: number;
  rate_per_hour_ils?: number;
  effective_rate_ils: number;
  min_charge_ils?: number;
  rounding_minutes?: number;
  subtotal_ils: number;
  total_ils: number;
  paid_from_balance?: boolean;
}

export const settlementKeys = {
  pending: ['pending-settlements'] as const,
  billing: (id: string) => ['session-billing', id] as const,
};

/** Ended sessions still awaiting payment collection. */
export function usePendingSettlementsQuery() {
  return useQuery({
    queryKey: settlementKeys.pending,
    queryFn: async (): Promise<PendingSession[]> => {
      const { data, error } = await supabase
        .from('sessions')
        .select(
          'id, device_id, end_time, session_mode, timer_minutes, controller_count, devices(name, type)'
        )
        .eq('status', 'ended')
        .is('settled_at', null)
        .eq('paid_from_balance', false)
        .order('end_time', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map((s: any) => ({ ...s, device: s.devices }));
    },
  });
}

/** Server-computed amount owed for a session (authoritative). */
export function useSessionBillingQuery(sessionId: string | null) {
  return useQuery({
    queryKey: settlementKeys.billing(sessionId || 'none'),
    enabled: !!sessionId,
    queryFn: async (): Promise<SessionBilling> => {
      const { data, error } = await supabase.rpc('compute_session_billing', {
        p_session_id: sessionId as string,
      });
      if (error) throw error;
      return data as unknown as SessionBilling;
    },
  });
}

export function useSettleSession() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      payments,
      promotionId,
    }: {
      sessionId: string;
      payments: PaymentPart[];
      promotionId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('settle_session', {
        p_session_id: sessionId,
        p_payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        p_promotion_id: promotionId ?? null,
        p_manual_discount_ils: 0,
      });
      if (error) throw error;
      return data as unknown as { ticket_no: string; total_ils: number };
    },
    onSuccess: (result) => {
      toast({
        title: t('paymentSuccess'),
        description: `${t('ticketNo')}: ${result.ticket_no}`,
      });
      queryClient.invalidateQueries({ queryKey: settlementKeys.pending });
      queryClient.invalidateQueries({ queryKey: posKeys.tickets });
    },
    onError: (error: unknown) => {
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: settlementKeys.pending });
    },
  });
}
