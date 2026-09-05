import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface InventoryMovement {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  unit_cost_ils: number | null;
  supplier: string | null;
  performed_by: string | null;
  performed_by_name: string | null;
}

export const MOVEMENT_LABELS: Record<string, string> = {
  sale: 'بيع',
  restock: 'توريد',
  manual_adjustment: 'تعديل يدوي',
  damaged: 'تالف',
  expired: 'منتهي الصلاحية',
  refund: 'إرجاع',
};

export function movementLabel(type: string): string {
  return MOVEMENT_LABELS[type] || type;
}

const PAGE_SIZE = 10;

/** Paginated per-product movement history. Only fetched when a product is opened. */
export function useInventoryHistory(productId: string | null) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (!productId) return;
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('get_inventory_movements', {
        p_product_id: productId,
        p_limit: PAGE_SIZE,
        p_offset: nextPage * PAGE_SIZE,
      });
      if (rpcError) {
        setError(rpcError.message);
      } else {
        const payload = data as unknown as { total: number; movements: InventoryMovement[] };
        setMovements(payload?.movements || []);
        setTotal(payload?.total || 0);
        setPage(nextPage);
      }
      setLoading(false);
    },
    [productId]
  );

  return {
    movements,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    loading,
    error,
    fetchPage,
  };
}
