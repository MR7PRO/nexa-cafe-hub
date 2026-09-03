import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditEvent {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditEventsPage {
  total: number;
  events: AuditEvent[];
  limit: number;
  offset: number;
}

export interface AuditFilters {
  start?: string;
  end?: string;
  actor?: string;
  action?: string;
  search?: string;
  page: number;
  pageSize: number;
}

/** Paginated, newest-first audit feed. Server-side filtering; no realtime subscription. */
export function useAuditEvents(filters: AuditFilters, enabled = true) {
  const { start, end, actor, action, search, page, pageSize } = filters;

  return useQuery({
    queryKey: ['audit-events', start, end, actor, action, search, page, pageSize],
    enabled,
    queryFn: async (): Promise<AuditEventsPage> => {
      const { data, error } = await supabase.rpc('get_audit_events', {
        p_start: start ? new Date(`${start}T00:00:00`).toISOString() : undefined,
        p_end: end ? new Date(`${end}T23:59:59`).toISOString() : undefined,
        p_actor: actor || undefined,
        p_action: action || undefined,
        p_search: search || undefined,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      return data as unknown as AuditEventsPage;
    },
  });
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  ticket_paid: 'فاتورة مدفوعة',
  ticket_voided: 'إلغاء فاتورة',
  ticket_refunded: 'استرداد فاتورة',
  session_settled: 'تسوية جلسة',
  expense_created: 'إضافة مصروف',
  expense_updated: 'تعديل مصروف',
  expense_voided: 'إلغاء مصروف',
  shift_opened: 'فتح وردية',
  shift_closed: 'إغلاق وردية',
  setting_changed: 'تغيير إعداد',
  role_changed: 'تغيير صلاحية',
  refund: 'استرداد',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
