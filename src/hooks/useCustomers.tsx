import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  /** Total remaining prepaid minutes across every active loyalty balance. */
  remaining_minutes: number;
  /** Balance row with the most remaining minutes — usable to start a prepaid session. */
  primary_balance_id: string | null;
}

export const customerKeys = {
  search: (term: string) => ['customers-search', term] as const,
  all: ['customers-search'] as const,
};

/** Sanitise a term before it goes into a PostgREST `or(...)` filter. */
function sanitize(term: string) {
  return term.replace(/[(),*%]/g, ' ').trim();
}

function mapCustomer(row: any): CustomerSummary {
  const balances: { id: string; remaining_minutes: number }[] = row.customer_balances || [];
  const sorted = [...balances].sort((a, b) => b.remaining_minutes - a.remaining_minutes);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    remaining_minutes: balances.reduce((s, b) => s + (b.remaining_minutes || 0), 0),
    primary_balance_id: sorted[0]?.id ?? null,
  };
}

/**
 * Fast customer lookup by name or phone, including their remaining loyalty
 * minutes so staff can see prepaid time without leaving the workflow.
 */
export function useCustomerSearch(term: string, enabled = true) {
  const q = sanitize(term);
  return useQuery({
    queryKey: customerKeys.search(q),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<CustomerSummary[]> => {
      let query = supabase
        .from('customers')
        .select('id, name, phone, customer_balances(id, remaining_minutes)')
        .order('created_at', { ascending: false })
        .limit(20);

      if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapCustomer);
    },
  });
}

/** Single customer (used to display context on cards/dialogs). */
export function useCustomer(customerId: string | null) {
  return useQuery({
    queryKey: ['customer', customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<CustomerSummary | null> => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, customer_balances(id, remaining_minutes)')
        .eq('id', customerId!)
        .maybeSingle();
      if (error) throw error;
      return data ? mapCustomer(data) : null;
    },
  });
}

/**
 * Server-side de-duplication: reuses the existing customer when the phone
 * already exists inside the tenant instead of creating a duplicate record.
 */
export function useFindOrCreateCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ name, phone }: { name: string; phone?: string | null }) => {
      const { data, error } = await supabase.rpc('find_or_create_customer', {
        p_name: name,
        p_phone: phone || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
    onError: (error: unknown) => {
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
  });
}
