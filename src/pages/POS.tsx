import { useEffect, useState } from 'react';
import { Plus, Minus, Trash2, CreditCard, Banknote, Receipt } from 'lucide-react';
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

export default function POS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
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

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = subtotal; // Could add discount logic here

  const processPayment = async (method: 'cash' | 'card') => {
    if (cart.length === 0) {
      toast({ title: t('error'), description: 'السلة فارغة', variant: 'destructive' });
      return;
    }

    setProcessing(true);

    try {
      // Generate ticket number
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
      const randomPart = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      const ticketNo = `NX-${dateStr}-${randomPart}`;

      // Create ticket
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

      // Create ticket items
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

      // Create payment
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
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery || p.name.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-6 animate-fade-in">
      {/* Products Section */}
      <div className="flex-1 space-y-4 overflow-hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pos')}</h1>
          <p className="text-muted-foreground">اختر المنتجات لإضافتها للفاتورة</p>
        </div>

        {/* Search */}
        <Input
          placeholder={t('searchProducts')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors',
              !selectedCategory
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            الكل
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors',
                selectedCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="grid h-[calc(100%-12rem)] gap-3 overflow-y-auto pb-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className="pos-button"
            >
              <span className="text-sm font-medium text-foreground">{product.name}</span>
              <span className="font-mono text-lg font-bold text-primary">
                {formatILS(product.sell_price_ils)}
              </span>
              {product.category && (
                <span className="text-xs text-muted-foreground">{product.category.name}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Cart Section */}
      <div className="flex w-96 flex-col rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('ticket')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{cart.length} عناصر</p>
        </div>

        {/* Cart Items */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <p className="text-muted-foreground">السلة فارغة</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
              >
                <div className="flex-1">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="font-mono text-sm text-primary">
                    {formatILS(item.price)} × {item.qty}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(item.id, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center font-mono">{item.qty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(item.id, 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Payment */}
        <div className="border-t border-border p-4">
          <div className="mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('subtotal')}</span>
              <span className="font-mono text-foreground">{formatILS(subtotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>{t('total')}</span>
              <span className="font-mono text-primary">{formatILS(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => processPayment('cash')}
              disabled={cart.length === 0 || processing}
              className="gap-2 touch-target"
              variant="secondary"
            >
              <Banknote className="h-5 w-5" />
              {t('cash')}
            </Button>
            <Button
              onClick={() => processPayment('card')}
              disabled={cart.length === 0 || processing}
              className="gap-2 touch-target"
            >
              <CreditCard className="h-5 w-5" />
              {t('card')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
