import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Phone, Clock, Gamepad2, Wallet, Receipt, CalendarDays } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatILS, t } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { customerKeys } from '@/hooks/useCustomers';

interface Props {
  customerId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canAdjust: boolean;
}

const MOVEMENT_LABELS: Record<string, string> = {
  package_purchase: 'شراء باقة',
  session_use: 'استخدام جلسة',
  manual_adjustment: 'تعديل يدوي',
  refund: 'استرداد',
  correction: 'تصحيح',
};

export function formatMinutes(m: number) {
  const h = Math.floor(Math.abs(m) / 60);
  const r = Math.abs(m) % 60;
  return `${m < 0 ? '-' : ''}${h} س${r ? ` ${r} د` : ''}`;
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('ar-EG');

export function CustomerProfileDialog({ customerId, open, onOpenChange, canAdjust }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adjBalance, setAdjBalance] = useState('');
  const [adjMinutes, setAdjMinutes] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const key = ['customer-profile', customerId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: open && !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_profile', { p_customer_id: customerId! });
      if (error) throw error;
      return data as any;
    },
  });

  const adjust = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('adjust_customer_balance', {
        p_balance_id: adjBalance,
        p_change_minutes: Number(adjMinutes),
        p_movement_type: 'manual_adjustment',
        p_reason: adjReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'تم تعديل الرصيد' });
      setAdjMinutes(''); setAdjReason('');
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: customerKeys.all });
    },
    onError: (e: unknown) =>
      toast({ title: t('error'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' }),
  });

  const c = data?.customer;
  const balances: any[] = data?.balances || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> {c?.name || '...'}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {c.phone && <span className="flex items-center gap-1" dir="ltr"><Phone className="h-4 w-4" />{c.phone}</span>}
              <span>مسجل منذ {fmtDate(c.created_at)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { icon: Wallet, label: 'الرصيد', value: formatMinutes(data.remaining_minutes) },
                { icon: Gamepad2, label: 'الزيارات', value: data.total_visits },
                { icon: Clock, label: 'وقت اللعب', value: formatMinutes(data.total_gaming_minutes) },
                { icon: Receipt, label: 'الإنفاق', value: formatILS(Number(data.total_spent_ils)) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><s.icon className="h-3 w-3" />{s.label}</p>
                  <p className="mt-1 font-bold text-foreground">{s.value}</p>
                </div>
              ))}
            </div>

            <section>
              <h4 className="mb-2 font-bold">الباقات</h4>
              {balances.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد باقات</p> : (
                <div className="space-y-2">
                  {balances.map((b) => (
                    <div key={b.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{b.package_name || 'باقة'}</span>
                        <Badge variant={b.remaining_minutes > 0 ? 'default' : 'secondary'}>
                          {b.remaining_minutes > 0 ? 'نشطة' : 'منتهية'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        المتبقي {formatMinutes(b.remaining_minutes)} من {formatMinutes(b.total_minutes)} · {fmtDate(b.purchased_at)}
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${b.total_minutes ? (b.remaining_minutes / b.total_minutes) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {canAdjust && balances.length > 0 && (
              <section className="space-y-2 rounded-lg border border-border p-3">
                <h4 className="font-bold">تعديل الرصيد (للمدير)</h4>
                <div className="grid gap-2 sm:grid-cols-3">
                  <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={adjBalance} onChange={(e) => setAdjBalance(e.target.value)}>
                    <option value="">اختر الباقة</option>
                    {balances.map((b) => <option key={b.id} value={b.id}>{b.package_name || 'باقة'} ({b.remaining_minutes} د)</option>)}
                  </select>
                  <div>
                    <Label className="sr-only">الدقائق</Label>
                    <Input type="number" placeholder="+30 أو -15 دقيقة" value={adjMinutes} onChange={(e) => setAdjMinutes(e.target.value)} dir="ltr" />
                  </div>
                  <Input placeholder="السبب (إجباري)" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
                </div>
                <Button size="sm" disabled={adjust.isPending || !adjBalance || !Number(adjMinutes) || !adjReason.trim()} onClick={() => adjust.mutate()}>
                  حفظ التعديل
                </Button>
              </section>
            )}

            <section>
              <h4 className="mb-2 font-bold">حركة الرصيد</h4>
              {(data.recent_movements || []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد حركات</p> : (
                <ul className="space-y-1 text-sm">
                  {data.recent_movements.map((m: any) => (
                    <li key={m.id} className="flex justify-between gap-2 border-b border-border py-1">
                      <span>{MOVEMENT_LABELS[m.movement_type] || m.movement_type}{m.reason ? ` — ${m.reason}` : ''}</span>
                      <span className={m.change_minutes < 0 ? 'text-destructive' : 'text-primary'} dir="ltr">
                        {m.change_minutes > 0 ? '+' : ''}{m.change_minutes} د · {fmtDate(m.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-2 flex items-center gap-1 font-bold"><Gamepad2 className="h-4 w-4" />آخر الجلسات</h4>
              {(data.recent_sessions || []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد جلسات</p> : (
                <ul className="space-y-1 text-sm">
                  {data.recent_sessions.map((s: any) => (
                    <li key={s.id} className="flex justify-between border-b border-border py-1">
                      <span>{s.device_name} · {fmtDate(s.start_time)}</span>
                      <span>{s.paid_from_balance ? 'من الرصيد' : s.total_ils != null ? formatILS(Number(s.total_ils)) : s.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-2 flex items-center gap-1 font-bold"><Receipt className="h-4 w-4" />آخر الفواتير</h4>
              {(data.recent_tickets || []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد فواتير</p> : (
                <ul className="space-y-1 text-sm">
                  {data.recent_tickets.map((tk: any) => (
                    <li key={tk.id} className="flex justify-between border-b border-border py-1">
                      <span>#{tk.ticket_no} · {fmtDate(tk.created_at)}</span>
                      <span>{tk.status === 'void' ? 'ملغاة' : formatILS(Number(tk.total_ils))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-2 flex items-center gap-1 font-bold"><CalendarDays className="h-4 w-4" />الحجوزات</h4>
              {(data.recent_reservations || []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد حجوزات</p> : (
                <ul className="space-y-1 text-sm">
                  {data.recent_reservations.map((r: any) => (
                    <li key={r.id} className="flex justify-between border-b border-border py-1">
                      <span>{r.device_name} · {r.reserved_date}</span>
                      <span dir="ltr">{String(r.start_time).slice(0, 5)}–{String(r.end_time).slice(0, 5)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
