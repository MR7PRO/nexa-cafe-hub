import { useState, useEffect } from 'react';
import { Banknote, CreditCard, Split } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatILS, t } from '@/lib/i18n';
import { useSessionBillingQuery, useSettleSession } from '@/hooks/useSessionSettlement';
import type { PaymentPart } from '@/hooks/usePOS';

interface SettleSessionDialogProps {
  sessionId: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Collect payment for an ended session using the server-side billing snapshot. */
export function SettleSessionDialog({ sessionId, onOpenChange }: SettleSessionDialogProps) {
  const { data: billing, isLoading } = useSessionBillingQuery(sessionId);
  const settle = useSettleSession();
  const [mixed, setMixed] = useState(false);
  const [cashPart, setCashPart] = useState('');

  useEffect(() => {
    setMixed(false);
    setCashPart('');
  }, [sessionId]);

  const total = billing?.total_ils ?? 0;
  const cash = parseFloat(cashPart) || 0;
  const card = Math.round(Math.max(total - cash, 0) * 100) / 100;
  const mixedValid = cash > 0 && cash < total;

  const submit = async (payments: PaymentPart[]) => {
    if (!sessionId) return;
    try {
      await settle.mutateAsync({ sessionId, payments });
      onOpenChange(false);
    } catch {
      /* toast handled in mutation */
    }
  };

  return (
    <Dialog open={!!sessionId} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تحصيل الجلسة</DialogTitle>
        </DialogHeader>

        {isLoading || !billing ? (
          <div className="flex justify-center py-8">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{billing.device_name}</span>
                <span className="font-mono">
                  {billing.billed_minutes} دقيقة محسوبة
                  {billing.active_minutes !== undefined && ` (فعلي ${billing.active_minutes})`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">السعر الفعلي / ساعة</span>
                <span className="font-mono">{formatILS(billing.effective_rate_ils)}</span>
              </div>
              {!!billing.controller_count && billing.controller_count > 1 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('controllerCount')}</span>
                  <span className="font-mono">{billing.controller_count}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('subtotal')}</span>
                <span className="font-mono">{formatILS(billing.subtotal_ils)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>{t('total')}</span>
                <span className="font-mono text-primary">{formatILS(total)}</span>
              </div>
            </div>

            {mixed ? (
              <div className="space-y-3">
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
                  <span className="font-mono font-bold text-primary">{formatILS(card)}</span>
                </div>
                <Button
                  className="w-full h-12"
                  disabled={!mixedValid || settle.isPending}
                  onClick={() =>
                    submit([
                      { method: 'cash', amount: cash },
                      { method: 'card', amount: card },
                    ])
                  }
                >
                  تأكيد الدفع
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setMixed(false)}>
                  رجوع
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="secondary"
                    className="h-14 gap-2 text-lg"
                    disabled={settle.isPending}
                    onClick={() => submit([{ method: 'cash', amount: total }])}
                  >
                    <Banknote className="h-6 w-6" />
                    {t('cash')}
                  </Button>
                  <Button
                    className="h-14 gap-2 text-lg"
                    disabled={settle.isPending}
                    onClick={() => submit([{ method: 'card', amount: total }])}
                  >
                    <CreditCard className="h-6 w-6" />
                    {t('card')}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-12 gap-2"
                  disabled={settle.isPending || total <= 0}
                  onClick={() => setMixed(true)}
                >
                  <Split className="h-5 w-5" />
                  دفع مختلط
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
