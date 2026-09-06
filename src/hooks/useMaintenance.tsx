import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { sessionKeys } from '@/hooks/useSessions';

export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved';
export type MaintenanceIssueType =
  | 'hardware'
  | 'controller'
  | 'screen'
  | 'network'
  | 'software'
  | 'cleaning'
  | 'other';

export interface MaintenanceRecord {
  id: string;
  device_id: string;
  status: MaintenanceStatus;
  issue_type: MaintenanceIssueType;
  description: string | null;
  opened_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

export const ISSUE_TYPE_LABELS: Record<MaintenanceIssueType, string> = {
  hardware: 'عطل بالجهاز',
  controller: 'عطل بالدراع',
  screen: 'عطل بالشاشة',
  network: 'مشكلة بالشبكة',
  software: 'مشكلة برمجية',
  cleaning: 'يحتاج تنظيف',
  other: 'أخرى',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  open: 'عطل مفتوح',
  in_progress: 'قيد الإصلاح',
  resolved: 'تم الإصلاح',
};

export const maintenanceKeys = {
  open: ['maintenance', 'open'] as const,
};

/** Open (unresolved) issues keyed by device id — small result, safe to poll on focus. */
export function useOpenMaintenanceQuery() {
  return useQuery({
    queryKey: maintenanceKeys.open,
    queryFn: async (): Promise<Record<string, MaintenanceRecord>> => {
      const { data, error } = await supabase
        .from('device_maintenance')
        .select('id, device_id, status, issue_type, description, opened_at, resolved_at, resolution_note')
        .neq('status', 'resolved')
        .order('opened_at', { ascending: false });
      if (error) throw error;
      const map: Record<string, MaintenanceRecord> = {};
      for (const row of (data || []) as MaintenanceRecord[]) {
        if (!map[row.device_id]) map[row.device_id] = row;
      }
      return map;
    },
  });
}

export function useMaintenanceMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: maintenanceKeys.open });
    queryClient.invalidateQueries({ queryKey: sessionKeys.devices });
  };

  const reportIssue = useMutation({
    mutationFn: async (args: {
      deviceId: string;
      issueType: MaintenanceIssueType;
      description?: string;
    }) => {
      const { error } = await supabase.rpc('report_device_issue', {
        p_device_id: args.deviceId,
        p_issue_type: args.issueType,
        p_description: args.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'تم تسجيل العطل', description: 'الجهاز الآن تحت الصيانة' });
    },
    onError: (e: Error) =>
      toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  const updateStatus = useMutation({
    mutationFn: async (args: { id: string; status: MaintenanceStatus; note?: string }) => {
      const { error } = await supabase.rpc('update_device_maintenance', {
        p_id: args.id,
        p_status: args.status,
        p_resolution_note: args.note || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      toast({
        title: vars.status === 'resolved' ? 'تم إصلاح الجهاز' : 'تم تحديث حالة العطل',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  return { reportIssue, updateStatus };
}
