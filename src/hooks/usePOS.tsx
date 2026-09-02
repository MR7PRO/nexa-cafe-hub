import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';
import {
  addLine,
  availableStock as availableStockOf,
  cartSubtotal,
  cartTotal,
  changeQuantity,
  isOutOfStock as isOutOfStockOf,
  isValidMixedPayment,
  promotionDiscount,
} from '@/lib/pos';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface POSProduct {
  id: string;
  name: string;
  sell_price_ils: number;
  category_id: string | null;
  stock_qty: number | null;
  category?: { name: string } | null;
}

export interface POSCategory {
  id: string;
  name: string;
}

export interface POSPromotion {
  id: string;
  name: string;
  discount_type: string;
  discount_value: number;
  applies_to: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  stock: number | null;
}

export type PaymentMethod = 'cash' | 'card' | 'mixed';

export interface PaymentPart {
  method: 'cash' | 'card';
  amount: number;
}

export const posKeys = {
  products: ['pos-products'] as const,
  categories: ['pos-categories'] as const,
  promotions: ['pos-promotions'] as const,
  tickets: ['tickets'] as const,
};

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

function useProductsQuery() {
  return useQuery({
    queryKey: posKeys.products,
    queryFn: async (): Promise<POSProduct[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sell_price_ils, category_id, stock_qty, categories(name)')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []).map((p: any) => ({ ...p, category: p.categories }));
    },
  });
}

function useCategoriesQuery() {
  return useQuery({
    queryKey: posKeys.categories,
    queryFn: async (): Promise<POSCategory[]> => {
      const { data, error } = await supabase.from('categories').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

function usePromotionsQuery() {
  return useQuery({
    queryKey: posKeys.promotions,
    queryFn: async (): Promise<POSPromotion[]> => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('promotions')
        .select('id, name, discount_type, discount_value, applies_to, start_date, end_date')
        .eq('is_active', true)
        .in('applies_to', ['all', 'products'])
        .lte('start_date', nowIso);
      if (error) throw error;
      return (data || []).filter((p: any) => !p.end_date || p.end_date >= nowIso);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Shared POS logic — used by both the normal and fullscreen POS        */
/* ------------------------------------------------------------------ */

export function usePOS() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const productsQuery = useProductsQuery();
  const categoriesQuery = useCategoriesQuery();
  const promotionsQuery = usePromotionsQuery();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [promotionId, setPromotionId] = useState<string | null>(null);

  const products = productsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const promotions = promotionsQuery.data || [];

  const availableStock = (product: POSProduct) =>
    availableStockOf(product.stock_qty, cart, product.id);

  const isOutOfStock = (product: POSProduct) => isOutOfStockOf(product.stock_qty);

  const addToCart = (product: POSProduct) => {
    const next = addLine(cart, product);
    if (!next) {
      toast({
        title: t('error'),
        description: isOutOfStock(product)
          ? `${product.name} غير متوفر في المخزون`
          : `الكمية المتوفرة من ${product.name} هي ${product.stock_qty} فقط`,
        variant: 'destructive',
      });
      return;
    }
    setCart(next);
  };

  const updateQuantity = (id: string, delta: number) => {
    const item = cart.find((i) => i.id === id);
    if (item && item.stock !== null && item.qty + delta > item.stock) {
      toast({
        title: t('error'),
        description: `الكمية المتوفرة من ${item.name} هي ${item.stock} فقط`,
        variant: 'destructive',
      });
      return;
    }
    setCart(changeQuantity(cart, id, delta));
  };

  const removeFromCart = (id: string) => setCart(cart.filter((item) => item.id !== id));
  const clearCart = () => setCart([]);

  const subtotal = useMemo(() => cartSubtotal(cart), [cart]);

  const selectedPromotion = promotions.find((p) => p.id === promotionId) || null;

  // Display-only preview — the server recomputes the authoritative amounts.
  const discount = useMemo(
    () => promotionDiscount(selectedPromotion, subtotal),
    [selectedPromotion, subtotal]
  );

  const total = cartTotal(subtotal, discount);

  const filteredProducts = products.filter((p) => {
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery || p.name.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  /* --------------------------- checkout ---------------------------- */

  const checkout = useMutation({
    mutationFn: async (payments: PaymentPart[]) => {
      const { data, error } = await supabase.rpc('process_sale', {
        p_items: cart.map((item) => ({ product_id: item.id, qty: item.qty })),
        p_payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        p_promotion_id: promotionId,
        p_manual_discount_ils: 0,
      });
      if (error) throw error;
      return data as {
        ticket_no: string;
        ticket_id: string;
        subtotal_ils: number;
        discount_ils: number;
        total_ils: number;
      };
    },
    onSuccess: (result) => {
      toast({
        title: t('paymentSuccess'),
        description: `${t('ticketNo')}: ${result.ticket_no}`,
      });
      clearCart();
      setPromotionId(null);
      // refresh only the affected data
      queryClient.invalidateQueries({ queryKey: posKeys.products });
      queryClient.invalidateQueries({ queryKey: posKeys.tickets });
    },
    onError: (error: unknown) => {
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: posKeys.products });
    },
  });

  const pay = async (method: PaymentMethod, parts?: PaymentPart[]) => {
    if (cart.length === 0) {
      toast({ title: t('error'), description: 'السلة فارغة', variant: 'destructive' });
      return;
    }

    let payments: PaymentPart[];
    if (method === 'mixed') {
      payments = (parts || []).filter((p) => p.amount > 0);
      if (!isValidMixedPayment(payments, total)) {
        toast({
          title: t('error'),
          description: 'مجموع الدفع المختلط يجب أن يساوي الإجمالي',
          variant: 'destructive',
        });
        return;
      }
    } else {
      payments = [{ method, amount: total }];
    }

    try {
      await checkout.mutateAsync(payments);
    } catch {
      /* toast handled in mutation */
    }
  };

  return {
    // data
    products,
    filteredProducts,
    categories,
    promotions,
    loading: productsQuery.isLoading || categoriesQuery.isLoading,
    // filters
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    // cart
    cart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    availableStock,
    isOutOfStock,
    // money
    subtotal,
    discount,
    total,
    promotionId,
    setPromotionId,
    // payment
    pay,
    processing: checkout.isPending,
  };
}
