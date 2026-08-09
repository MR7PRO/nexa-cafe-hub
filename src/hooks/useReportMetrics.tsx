import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ReportDevice {
  name: string;
  sessions: number;
  revenue: number;
  minutes: number;
  utilization_pct: number;
}

export interface ReportProduct {
  name: string;
  quantity: number;
  revenue?: number;
  cost?: number;
  profit?: number;
}

export interface ReportStaff {
  name: string;
  sessions_started: number;
  tickets_closed: number;
  revenue: number;
}

export interface ReportMetrics {
  total_revenue: number;
  session_revenue: number;
  product_revenue: number;
  total_tickets: number;
  avg_ticket_value: number;
  product_cogs: number;
  product_gross_profit: number;
  operating_expenses: number;
  revenue_series: Array<{ bucket: string; sessions: number; products: number; total: number }>;
  sessions_count: number;
  avg_session_minutes: number;
  devices: ReportDevice[];
  peak_hours: Array<{ hour: number; sessions: number }>;
  top_products: ReportProduct[];
  top_products_by_qty: ReportProduct[];
  top_products_by_profit: ReportProduct[];
  low_stock_count: number;
  shift_cash_difference: number;
  shift_count: number;
  staff: ReportStaff[];
}

export function getPeriodRange(
  period: ReportPeriod,
  custom?: { from: string; to: string }
): { start: Date; end: Date; bucket: 'day' | 'week' | 'month' } {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case 'daily':
      start.setDate(start.getDate() - 7);
      return { start, end, bucket: 'day' };
    case 'weekly':
      start.setDate(start.getDate() - 28);
      return { start, end, bucket: 'week' };
    case 'monthly':
      start.setMonth(start.getMonth() - 6);
      return { start, end, bucket: 'month' };
    case 'custom': {
      const from = custom?.from ? new Date(`${custom.from}T00:00:00`) : start;
      const to = custom?.to ? new Date(`${custom.to}T23:59:59`) : end;
      const days = Math.max((to.getTime() - from.getTime()) / 86400000, 1);
      return { start: from, end: to, bucket: days > 120 ? 'month' : days > 35 ? 'week' : 'day' };
    }
  }
}

/** Single server-side aggregation call — no raw rows shipped to the browser. */
export function useReportMetrics(period: ReportPeriod, custom?: { from: string; to: string }) {
  const { start, end, bucket } = getPeriodRange(period, custom);

  return useQuery({
    queryKey: ['report-metrics', period, start.toISOString().slice(0, 13), custom?.from, custom?.to],
    queryFn: async (): Promise<ReportMetrics> => {
      const { data, error } = await supabase.rpc('get_report_metrics', {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
        p_bucket: bucket,
      });
      if (error) throw error;
      return data as unknown as ReportMetrics;
    },
  });
}
