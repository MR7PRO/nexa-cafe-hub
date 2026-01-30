import { useEffect, useState } from 'react';
import { Plus, Minus, Trash2, CreditCard, Banknote, Receipt, X, Minimize2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  sell_price_ils: number;
  category_id: string | null;
  category?: { name: string };
}

interface Category {
  id: string;
  name: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

interface FullscreenPOSProps {
  onClose: () => void;
}

export function FullscreenPOS({ onClose }: FullscreenPOSProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
    // Enter fullscreen mode
    document.documentElement.requestFullscreen?.().catch(() => {});
    
    return () => {
      // Exit fullscreen on unmount
      document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const fetchData = async () => {
    const [productsRes, categoriesRes] = await Promise.all([
      supabase.from('products').select('*, categories(name)').eq('is_active', true),
      supabase.from('categories').select('*'),
    ]);

    if (productsRes.data) {
      setProducts(productsRes.data.map((p: any) => ({
        ...p,
        category: p.categories,
      })));
    }
    if (categoriesRes.data) setCategories(categoriesRes.data);
    setLoading(false);
  };

  const addToCart = (product: Product) => {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      setCart(cart.map((item) =>
        item.id === product.id ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      setCart([...cart, { id: product.id, name: product.name, price: product.sell_price_ils, qty: 1 }]);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(cart.map((item) => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }).filter((item) => item.qty > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const processPayment = async (method: 'cash' | 'card') => {
    if (cart.length === 0) {
      toast({ title: t('error'), description: 'السلة فارغة', variant: 'destructive' });
      return;
    }

    setProcessing(true);

    try {
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
      const randomPart = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      const ticketNo = `NX-${dateStr}-${randomPart}`;

      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          ticket_no: ticketNo,
          status: 'paid',
          created_by: user?.id,
          total_ils: total,
          closed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      const items = cart.map((item) => ({
        ticket_id: ticket.id,
        item_type: 'product' as const,
        ref_id: item.id,
        name: item.name,
        qty: item.qty,
        unit_price_ils: item.price,
        total_ils: item.price * item.qty,
      }));

      const { error: itemsError } = await supabase.from('ticket_items').insert(items);
      if (itemsError) throw itemsError;

      const { error: paymentError } = await supabase.from('payments').insert({
        ticket_id: ticket.id,
        method,
        amount_ils: total,
      });
      if (paymentError) throw paymentError;

      toast({
        title: t('paymentSuccess'),
        description: `${t('ticketNo')}: ${ticketNo}`,
      });

      setCart([]);
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }

    setProcessing(false);
  };

  const filteredProducts = products.filter((p) => {
    return !selectedCategory || p.category_id === selectedCategory;
  });

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-background">
      {/* Products Section - Takes most of the screen */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">نقطة البيع</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-12 w-12"
          >
            <Minimize2 className="h-6 w-6" />
          </Button>
        </div>

        {/* Categories - Big touch-friendly buttons */}
        <div className="flex gap-3 overflow-x-auto pb-4 mb-4">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'whitespace-nowrap rounded-2xl px-8 py-4 text-lg font-bold transition-all min-w-[120px]',
              !selectedCategory
                ? 'bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            )}
          >
            الكل
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'whitespace-nowrap rounded-2xl px-8 py-4 text-lg font-bold transition-all min-w-[120px]',
                selectedCategory === cat.id
                  ? 'bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg'
                  : 'bg-card text-muted-foreground hover:text-foreground border border-border'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products Grid - Large touch-friendly buttons */}
        <div className="flex-1 grid gap-4 overflow-y-auto grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card p-6 transition-all hover:border-primary hover:bg-primary/5 active:scale-95 min-h-[140px]"
            >
              <span className="text-lg font-bold text-foreground text-center leading-tight">
                {product.name}
              </span>
              <span className="font-mono text-2xl font-bold text-primary">
                {formatILS(product.sell_price_ils)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Cart Section - Fixed width on the right */}
      <div className="w-[400px] flex flex-col border-r border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">{t('ticket')}</h2>
          </div>
          <p className="text-muted-foreground">{cart.length} عناصر</p>
        </div>

        {/* Cart Items */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-lg text-muted-foreground">السلة فارغة</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-muted/50 p-4"
              >
                <div className="flex-1">
                  <p className="text-lg font-bold text-foreground">{item.name}</p>
                  <p className="font-mono text-primary">
                    {formatILS(item.price)} × {item.qty}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-xl"
                    onClick={() => updateQuantity(item.id, -1)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <span className="w-10 text-center font-mono text-xl font-bold">{item.qty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-xl"
                    onClick={() => updateQuantity(item.id, 1)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 rounded-xl text-destructive hover:text-destructive"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total & Payment Buttons */}
        <div className="border-t border-border p-4 space-y-4">
          <div className="flex justify-between text-2xl font-bold">
            <span>{t('total')}</span>
            <span className="font-mono text-primary">{formatILS(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => processPayment('cash')}
              disabled={cart.length === 0 || processing}
              variant="secondary"
              className="h-20 gap-3 text-xl rounded-2xl"
            >
              <Banknote className="h-8 w-8" />
              {t('cash')}
            </Button>
            <Button
              onClick={() => processPayment('card')}
              disabled={cart.length === 0 || processing}
              className="h-20 gap-3 text-xl rounded-2xl"
              style={{ background: 'linear-gradient(135deg, hsl(190 100% 50%), hsl(270 80% 60%))' }}
            >
              <CreditCard className="h-8 w-8" />
              {t('card')}
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={() => setCart([])}
            disabled={cart.length === 0}
            className="w-full h-14 text-lg rounded-2xl"
          >
            <Trash2 className="h-5 w-5 mr-2" />
            مسح السلة
          </Button>
        </div>
      </div>
    </div>
  );
}
