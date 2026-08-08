import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';

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

  const availableStock = (product: POSProduct) => {
    if (product.stock_qty === null) return null;
    const inCart = cart.find((c) => c.id === product.id)?.qty ?? 0;
    return product.stock_qty - inCart;
  };

  const isOutOfStock = (product: POSProduct) =>
    product.stock_qty !== null && product.stock_qty <= 0;

  const addToCart = (product: POSProduct) => {
    if (isOutOfStock(product)) {
      toast({ title: t('error'), description: `${product.name} غير متوفر في المخزون`, variant: 'destructive' });
      return;
    }
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      if (product.stock_qty !== null && existing.qty >= product.stock_qty) {
        toast({
          title: t('error'),
          description: `الكمية المتوفرة من ${product.name} هي ${product.stock_qty} فقط`,
          variant: 'destructive',
        });
        return;
      }
      setCart(cart.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item)));
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          price: product.sell_price_ils,
          qty: 1,
          stock: product.stock_qty,
        },
      ]);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.id !== id) return item;
          const newQty = item.qty + delta;
          if (item.stock !== null && newQty > item.stock) {
            toast({
              title: t('error'),
              description: `الكمية المتوفرة من ${item.name} هي ${item.stock} فقط`,
              variant: 'destructive',
            });
            return item;
          }
          return { ...item, qty: newQty };
        })
        .filter((item) => item.qty > 0)
    );
  };

  const removeFromCart = (id: string) => setCart(cart.filter((item) => item.id !== id));
  const clearCart = () => setCart([]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cart]
  );

  const selectedPromotion = promotions.find((p) => p.id === promotionId) || null;

  // Display-only preview — the server recomputes the authoritative amounts.
  const discount = useMemo(() => {
    if (!selectedPromotion) return 0;
    const raw =
      selectedPromotion.discount_type === 'percentage'
        ? (subtotal * Math.min(Math.max(selectedPromotion.discount_value, 0), 100)) / 100
        : Math.max(selectedPromotion.discount_value, 0);
    return Math.min(Math.round(raw * 100) / 100, subtotal);
  }, [selectedPromotion, subtotal]);

  const total = Math.max(Math.round((subtotal - discount) * 100) / 100, 0);

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
        p_payments: payments,
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
      const sum = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
      if (sum !== total) {
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
