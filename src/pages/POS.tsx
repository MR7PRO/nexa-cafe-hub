import { Plus, Minus, Trash2, Receipt, Maximize2 } from 'lucide-react';
import { useState } from 'react';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FullscreenPOS } from '@/components/pos/FullscreenPOS';
import { CheckoutPanel } from '@/components/pos/CheckoutPanel';
import { usePOS } from '@/hooks/usePOS';

export default function POS() {
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const pos = usePOS();

  if (fullscreenMode) {
    return <FullscreenPOS onClose={() => setFullscreenMode(false)} />;
  }

  if (pos.loading) {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('pos')}</h1>
            <p className="text-muted-foreground">اختر المنتجات لإضافتها للفاتورة</p>
          </div>
          <Button variant="outline" onClick={() => setFullscreenMode(true)} className="gap-2">
            <Maximize2 className="h-5 w-5" />
            ملء الشاشة
          </Button>
        </div>

        {/* Search */}
        <Input
          placeholder={t('searchProducts')}
          value={pos.searchQuery}
          onChange={(e) => pos.setSearchQuery(e.target.value)}
          className="max-w-md"
        />

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => pos.setSelectedCategory(null)}
            className={cn(
              'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors',
              !pos.selectedCategory
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            الكل
          </button>
          {pos.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => pos.setSelectedCategory(cat.id)}
              className={cn(
                'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors',
                pos.selectedCategory === cat.id
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
          {pos.filteredProducts.map((product) => {
            const outOfStock = pos.isOutOfStock(product);
            const remaining = pos.availableStock(product);
            return (
              <button
                key={product.id}
                onClick={() => pos.addToCart(product)}
                disabled={outOfStock || remaining === 0}
                className={cn('pos-button', (outOfStock || remaining === 0) && 'opacity-50')}
              >
                <span className="text-sm font-medium text-foreground">{product.name}</span>
                <span className="font-mono text-lg font-bold text-primary">
                  {formatILS(product.sell_price_ils)}
                </span>
                {product.stock_qty === null ? (
                  <span className="text-xs text-muted-foreground">{product.category?.name}</span>
                ) : outOfStock ? (
                  <span className="text-xs font-bold text-destructive">غير متوفر</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t('stock')}: {remaining}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart Section */}
      <div className="flex w-96 flex-col rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('ticket')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{pos.cart.length} عناصر</p>
        </div>

        {/* Cart Items */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {pos.cart.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <p className="text-muted-foreground">السلة فارغة</p>
            </div>
          ) : (
            pos.cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
              >
                <div className="flex-1">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="font-mono text-sm text-primary">
                    {formatILS(item.price)} × {item.qty}
                  </p>
                  {item.stock !== null && (
                    <p className="text-xs text-muted-foreground">
                      {t('stock')}: {item.stock}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="تقليل الكمية"
                    className="h-8 w-8"
                    onClick={() => pos.updateQuantity(item.id, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center font-mono">{item.qty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="زيادة الكمية"
                    className="h-8 w-8"
                    disabled={item.stock !== null && item.qty >= item.stock}
                    onClick={() => pos.updateQuantity(item.id, 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف من السلة"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => pos.removeFromCart(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Payment — shared implementation */}
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
          />
        </div>
      </div>
    </div>
  );
}
