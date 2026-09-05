import { useEffect, useRef } from 'react';
import { Plus, Minus, Trash2, Receipt, Minimize2 } from 'lucide-react';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CheckoutPanel } from '@/components/pos/CheckoutPanel';
import { usePOS } from '@/hooks/usePOS';

interface FullscreenPOSProps {
  onClose: () => void;
}

export function FullscreenPOS({ onClose }: FullscreenPOSProps) {
  const pos = usePOS();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  if (pos.loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-background">
      {/* Products Section */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">نقطة البيع</h1>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-12 w-12">
            <Minimize2 className="h-6 w-6" />
          </Button>
        </div>

        {/* Search / barcode */}
        <Input
          ref={searchRef}
          placeholder="ابحث أو امسح الباركود"
          value={pos.searchQuery}
          onChange={(e) => pos.setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              pos.submitScan(pos.searchQuery);
              searchRef.current?.focus();
            }
          }}
          className="mb-4 h-14 max-w-xl text-lg"
        />

        {/* Categories */}
        <div className="flex gap-3 overflow-x-auto pb-4 mb-4">
          <button
            onClick={() => pos.setSelectedCategory(null)}
            className={cn(
              'whitespace-nowrap rounded-2xl px-8 py-4 text-lg font-bold transition-all min-w-[120px]',
              !pos.selectedCategory
                ? 'bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            )}
          >
            الكل
          </button>
          {pos.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => pos.setSelectedCategory(cat.id)}
              className={cn(
                'whitespace-nowrap rounded-2xl px-8 py-4 text-lg font-bold transition-all min-w-[120px]',
                pos.selectedCategory === cat.id
                  ? 'bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg'
                  : 'bg-card text-muted-foreground hover:text-foreground border border-border'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 grid gap-4 overflow-y-auto grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {pos.filteredProducts.map((product) => {
            const outOfStock = pos.isOutOfStock(product);
            const remaining = pos.availableStock(product);
            const blocked = outOfStock || remaining === 0;
            return (
              <button
                key={product.id}
                onClick={() => pos.addToCart(product)}
                disabled={blocked}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card p-6 transition-all hover:border-primary hover:bg-primary/5 active:scale-95 min-h-[140px]',
                  blocked && 'opacity-50 hover:border-border hover:bg-card'
                )}
              >
                <span className="text-lg font-bold text-foreground text-center leading-tight">
                  {product.name}
                </span>
                <span className="font-mono text-2xl font-bold text-primary">
                  {formatILS(product.sell_price_ils)}
                </span>
                {product.stock_qty !== null &&
                  (outOfStock ? (
                    <span className="text-sm font-bold text-destructive">غير متوفر</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t('stock')}: {remaining}
                    </span>
                  ))}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart Section */}
      <div className="w-[400px] flex flex-col border-r border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">{t('ticket')}</h2>
          </div>
          <p className="text-muted-foreground">{pos.cart.length} عناصر</p>
        </div>

        {/* Cart Items */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {pos.cart.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-lg text-muted-foreground">السلة فارغة</p>
            </div>
          ) : (
            pos.cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-muted/50 p-4"
              >
                <div className="flex-1">
                  <p className="text-lg font-bold text-foreground">{item.name}</p>
                  <p className="font-mono text-primary">
                    {formatILS(item.price)} × {item.qty}
                  </p>
                  {item.stock !== null && (
                    <p className="text-sm text-muted-foreground">
                      {t('stock')}: {item.stock}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-xl"
                    onClick={() => pos.updateQuantity(item.id, -1)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <span className="w-10 text-center font-mono text-xl font-bold">{item.qty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-xl"
                    disabled={item.stock !== null && item.qty >= item.stock}
                    onClick={() => pos.updateQuantity(item.id, 1)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 rounded-xl text-destructive hover:text-destructive"
                    onClick={() => pos.removeFromCart(item.id)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Payment — same shared implementation as the normal POS */}
        <div className="border-t border-border p-4">
          <CheckoutPanel
            subtotal={pos.subtotal}
            discount={pos.discount}
            total={pos.total}
            promotions={pos.promotions}
            promotionId={pos.promotionId}
            onPromotionChange={pos.setPromotionId}
            onPay={pos.pay}
            onClear={pos.clearCart}
            disabled={pos.cart.length === 0}
            processing={pos.processing}
            size="large"
          />
        </div>
      </div>
    </div>
  );
}
