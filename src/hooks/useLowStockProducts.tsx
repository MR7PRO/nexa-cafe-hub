import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LowStockProduct {
  id: string;
  name: string;
  stock_qty: number;
  low_stock_threshold: number;
}

export function useLowStockProducts() {
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLowStock = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, stock_qty, low_stock_threshold')
      .eq('is_active', true)
      .not('stock_qty', 'is', null);

    if (data) {
      const low = data.filter(p => 
        p.stock_qty !== null && p.stock_qty <= (p.low_stock_threshold || 5)
      ) as LowStockProduct[];
      setLowStockProducts(low);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLowStock();
    const interval = setInterval(fetchLowStock, 60000);
    return () => clearInterval(interval);
  }, [fetchLowStock]);

  return { lowStockProducts, lowStockCount: lowStockProducts.length, loading, refetch: fetchLowStock };
}
