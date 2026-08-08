import { useState } from 'react';
import { Banknote, CreditCard, Split, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatILS, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PaymentMethod, PaymentPart, POSPromotion } from '@/hooks/usePOS';

interface CheckoutPanelProps {
  subtotal: number;
  discount: number;
  total: number;
  promotions: POSPromotion[];
  promotionId: string | null;
  onPromotionChange: (id: string | null) => void;
  onPay: (method: PaymentMethod, parts?: PaymentPart[]) => void;
  onClear: () => void;
  disabled: boolean;
  processing: boolean;
  size?: 'default' | 'large';
}

/**
 * Shared totals + payment controls for both the normal and the fullscreen POS.
 * All amounts shown here are previews; the server recalculates them on checkout.
 */
export function CheckoutPanel({
  subtotal,
  discount,
  total,
  promotions,
  promotionId,
  onPromotionChange,
  onPay,
  onClear,
  disabled,
  processing,
  size = 'default',
}: CheckoutPanelProps) {
  const [mixedOpen, setMixedOpen] = useState(false);
  const [cashPart, setCashPart] = useState('');

  const large = size === 'large';
  const cash = parseFloat(cashPart) || 0;
  const cardPart = Math.round(Math.max(total - cash, 0) * 100) / 100;
  const mixedValid = cash > 0 && cash < total;

  return (
    <div className={cn('space-y-3', large && 'space-y-4')}>
      {promotions.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('discount')}</Label>
          <Select
            value={promotionId ?? 'none'}
            onValueChange={(v) => onPromotionChange(v === 'none' ? null : v)}
          >
            <SelectTrigger className={cn(large && 'h-12 text-base')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون عرض</SelectItem>
              {promotions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} (
                  {p.discount_type === 'percentage'
                    ? `${p.discount_value}%`
                    : formatILS(p.discount_value)}
                  )
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('subtotal')}</span>
          <span className="font-mono text-foreground">{formatILS(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('discount')}</span>
            <span className="font-mono text-destructive">- {formatILS(discount)}</span>
          </div>
        )}
        <div className={cn('flex justify-between font-bold', large ? 'text-2xl' : 'text-lg')}>
          <span>{t('total')}</span>
          <span className="font-mono text-primary">{formatILS(total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => onPay('cash')}
          disabled={disabled || processing}
          variant="secondary"
          className={cn('gap-2', large ? 'h-20 rounded-2xl text-xl' : 'touch-target')}
        >
          <Banknote className={large ? 'h-8 w-8' : 'h-5 w-5'} />
          {t('cash')}
        </Button>
        <Button
          onClick={() => onPay('card')}
          disabled={disabled || processing}
          className={cn('gap-2', large ? 'h-20 rounded-2xl text-xl' : 'touch-target')}
        >
          <CreditCard className={large ? 'h-8 w-8' : 'h-5 w-5'} />
          {t('card')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setCashPart('');
            setMixedOpen(true);
          }}
          disabled={disabled || processing}
          className={cn('gap-2', large ? 'h-14 rounded-2xl text-lg' : '')}
        >
          <Split className="h-5 w-5" />
          دفع مختلط
        </Button>
        <Button
          variant="outline"
          onClick={onClear}
          disabled={disabled}
          className={cn('gap-2', large ? 'h-14 rounded-2xl text-lg' : '')}
        >
          <Trash2 className="h-5 w-5" />
          مسح السلة
        </Button>
      </div>

      <Dialog open={mixedOpen} onOpenChange={setMixedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>دفع مختلط — {formatILS(total)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('cash')}</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={cashPart}
                onChange={(e) => setCashPart(e.target.value)}
                className="h-12 font-mono text-lg"
              />
            </div>
            <div className="flex justify-between rounded-xl bg-muted/50 p-3">
              <span className="text-muted-foreground">{t('card')}</span>
              <span className="font-mono font-bold text-primary">{formatILS(cardPart)}</span>
            </div>
            {!mixedValid && cashPart !== '' && (
              <p className="text-sm text-destructive">
                يجب أن يكون المبلغ النقدي أكبر من صفر وأقل من الإجمالي
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                onPay('mixed', [
                  { method: 'cash', amount: cash },
                  { method: 'card', amount: cardPart },
                ]);
                setMixedOpen(false);
              }}
              disabled={!mixedValid || processing}
              className="w-full h-12"
            >
              تأكيد الدفع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
