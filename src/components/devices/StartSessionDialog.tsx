import { useState, useEffect } from 'react';
import { Play, Timer, Gauge, Gamepad, Users, Wallet } from 'lucide-react';
import { formatILS } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
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
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface RatePlan {
  id: string;
  name: string;
  price_per_hour_ils: number;
}

interface CustomerBalance {
  id: string;
  customer_id: string;
  customer_name: string;
  remaining_minutes: number;
  package_name: string;
}

interface StartSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: {
    id: string;
    name: string;
    type: 'playstation' | 'pc';
    default_rate_plan_id: string | null;
  } | null;
  ratePlans: RatePlan[];
  onStart: (options: {
    ratePlanId: string;
    sessionMode: 'meter' | 'timer';
    timerMinutes?: number;
    controllerCount: number;
    customerBalanceId?: string;
    deductMinutes?: number;
  }) => void;
  isLoading?: boolean;
}

const TIMER_PRESETS = [30, 60, 90, 120, 180, 240];

export function StartSessionDialog({
  open,
  onOpenChange,
  device,
  ratePlans,
  onStart,
  isLoading,
}: StartSessionDialogProps) {
  const [sessionMode, setSessionMode] = useState<'meter' | 'timer'>('meter');
  const [timerMinutes, setTimerMinutes] = useState(60);
  const [controllerCount, setControllerCount] = useState(1);
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>('');
  
  // Customer balance state
  const [useBalance, setUseBalance] = useState(false);
  const [customerBalances, setCustomerBalances] = useState<CustomerBalance[]>([]);
  const [selectedBalanceId, setSelectedBalanceId] = useState<string>('');
  const [balanceMinutesToUse, setBalanceMinutesToUse] = useState(60);

  const isPlaystation = device?.type === 'playstation';

  // Fetch customer balances with remaining minutes > 0
  useEffect(() => {
    if (open) {
      fetchCustomerBalances();
    }
  }, [open]);

  const fetchCustomerBalances = async () => {
    const { data } = await supabase
      .from('customer_balances')
      .select(`
        id,
        customer_id,
        remaining_minutes,
        customers!customer_balances_customer_id_fkey (name),
        loyalty_packages!customer_balances_package_id_fkey (name)
      `)
      .gt('remaining_minutes', 0)
      .order('created_at', { ascending: false });

    if (data) {
      setCustomerBalances(
        data.map((b: any) => ({
          id: b.id,
          customer_id: b.customer_id,
          customer_name: b.customers?.name || 'زبون',
          remaining_minutes: b.remaining_minutes,
          package_name: b.loyalty_packages?.name || 'باقة',
        }))
      );
    }
  };

  const selectedBalance = customerBalances.find(b => b.id === selectedBalanceId);

  // Get selected rate plan
  const selectedPlan = ratePlans.find(p => p.id === selectedRatePlanId) || ratePlans[0];
  
  // Calculate estimated cost
  const getEstimatedCost = () => {
    if (useBalance && selectedBalance) return 0; // Paid from balance
    if (!selectedPlan) return 0;
    const basePrice = selectedPlan.price_per_hour_ils;
    const multiplier = isPlaystation ? controllerCount : 1;
    if (sessionMode === 'timer') {
      return (timerMinutes / 60) * basePrice * multiplier;
    }
    return basePrice * multiplier;
  };

  const handleStart = () => {
    const ratePlanId = selectedRatePlanId || device?.default_rate_plan_id || ratePlans[0]?.id;
    if (!ratePlanId) return;

    if (useBalance && selectedBalance) {
      const mins = Math.min(balanceMinutesToUse, selectedBalance.remaining_minutes);
      onStart({
        ratePlanId,
        sessionMode: 'timer',
        timerMinutes: mins,
        controllerCount: isPlaystation ? controllerCount : 1,
        customerBalanceId: selectedBalance.id,
        deductMinutes: mins,
      });
    } else {
      onStart({
        ratePlanId,
        sessionMode,
        timerMinutes: sessionMode === 'timer' ? timerMinutes : undefined,
        controllerCount: isPlaystation ? controllerCount : 1,
      });
    }
  };

  // Reset state when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && device) {
      setSessionMode('meter');
      setTimerMinutes(60);
      setControllerCount(1);
      setSelectedRatePlanId(device.default_rate_plan_id || ratePlans[0]?.id || '');
      setUseBalance(false);
      setSelectedBalanceId('');
      setBalanceMinutesToUse(60);
    }
    onOpenChange(newOpen);
  };

  if (!device) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            بدء جلسة - {device.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Use Customer Balance Toggle */}
          {customerBalances.length > 0 && (
            <div className="space-y-3 rounded-xl border-2 border-dashed border-accent/50 p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-accent" />
                  استخدام رصيد زبون
                </Label>
                <Switch checked={useBalance} onCheckedChange={setUseBalance} />
              </div>

              {useBalance && (
                <div className="space-y-3 pt-2">
                  <Select value={selectedBalanceId} onValueChange={(v) => {
                    setSelectedBalanceId(v);
                    const bal = customerBalances.find(b => b.id === v);
                    if (bal) setBalanceMinutesToUse(Math.min(60, bal.remaining_minutes));
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر زبون وباقة" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerBalances.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.customer_name} - {b.package_name} ({b.remaining_minutes} دقيقة متبقية)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedBalance && (
                    <div className="space-y-2">
                      <Label className="text-sm">المدة المطلوبة (دقيقة)</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {[30, 60, 90, 120].filter(m => m <= selectedBalance.remaining_minutes).map((mins) => (
                          <Button
                            key={mins}
                            type="button"
                            variant={balanceMinutesToUse === mins ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setBalanceMinutesToUse(mins)}
                          >
                            {mins >= 60 ? `${mins / 60} ساعة` : `${mins} د`}
                          </Button>
                        ))}
                      </div>
                      <Slider
                        value={[balanceMinutesToUse]}
                        onValueChange={(v) => setBalanceMinutesToUse(v[0])}
                        min={15}
                        max={selectedBalance.remaining_minutes}
                        step={15}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>سيتم خصم: {balanceMinutesToUse} دقيقة</span>
                        <span>المتبقي بعد الخصم: {selectedBalance.remaining_minutes - balanceMinutesToUse} دقيقة</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Session Mode Selection (hidden when using balance) */}
          {!useBalance && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">نوع الجلسة</Label>
              <RadioGroup
                value={sessionMode}
                onValueChange={(v) => setSessionMode(v as 'meter' | 'timer')}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="meter"
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                    sessionMode === 'meter'
                      ? 'border-primary bg-primary/10 shadow-glow-cyan'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <RadioGroupItem value="meter" id="meter" className="sr-only" />
                  <Gauge className={cn('h-8 w-8', sessionMode === 'meter' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="font-medium">عداد الوقت</span>
                  <span className="text-xs text-muted-foreground text-center">يحسب الوقت تصاعدياً</span>
                </Label>
                
                <Label
                  htmlFor="timer"
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                    sessionMode === 'timer'
                      ? 'border-primary bg-primary/10 shadow-glow-cyan'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <RadioGroupItem value="timer" id="timer" className="sr-only" />
                  <Timer className={cn('h-8 w-8', sessionMode === 'timer' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="font-medium">تايمر تنازلي</span>
                  <span className="text-xs text-muted-foreground text-center">وقت محدد مسبقاً</span>
                </Label>
              </RadioGroup>
            </div>
          )}

          {/* Timer Duration (only for timer mode, not balance) */}
          {!useBalance && sessionMode === 'timer' && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">مدة الجلسة</Label>
              <div className="grid grid-cols-3 gap-2">
                {TIMER_PRESETS.map((mins) => (
                  <Button
                    key={mins}
                    type="button"
                    variant={timerMinutes === mins ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTimerMinutes(mins)}
                    className={cn(
                      'transition-all',
                      timerMinutes === mins && 'shadow-glow-cyan'
                    )}
                  >
                    {mins >= 60 ? `${mins / 60} ساعة` : `${mins} دقيقة`}
                  </Button>
                ))}
              </div>
              <div className="pt-2">
                <Slider
                  value={[timerMinutes]}
                  onValueChange={(v) => setTimerMinutes(v[0])}
                  min={15}
                  max={360}
                  step={15}
                  className="w-full"
                />
                <div className="mt-2 text-center text-sm text-muted-foreground">
                  {Math.floor(timerMinutes / 60) > 0 && `${Math.floor(timerMinutes / 60)} ساعة `}
                  {timerMinutes % 60 > 0 && `${timerMinutes % 60} دقيقة`}
                </div>
              </div>
            </div>
          )}

          {/* Controller Count (only for PlayStation) */}
          {isPlaystation && (
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Gamepad className="h-5 w-5" />
                عدد الأيدي (اللاعبين)
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((count) => (
                  <Button
                    key={count}
                    type="button"
                    variant={controllerCount === count ? 'default' : 'outline'}
                    onClick={() => setControllerCount(count)}
                    className={cn(
                      'flex flex-col gap-1 h-auto py-3 transition-all',
                      controllerCount === count && 'shadow-glow-cyan'
                    )}
                  >
                    <Users className="h-5 w-5" />
                    <span>{count}</span>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                كل يد/لاعب يضاف بسعر مستخدم إضافي
              </p>
            </div>
          )}

          {/* Rate Plan Selection */}
          {!useBalance && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">خطة التسعير</Label>
              <Select
                value={selectedRatePlanId || device.default_rate_plan_id || ratePlans[0]?.id}
                onValueChange={setSelectedRatePlanId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر خطة التسعير" />
                </SelectTrigger>
                <SelectContent>
                  {ratePlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - {formatILS(plan.price_per_hour_ils)}/ساعة
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Estimated Cost / Balance Summary */}
          <div className="rounded-xl bg-gradient-to-l from-primary/10 to-accent/10 p-4 border border-primary/20">
            {useBalance && selectedBalance ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">الزبون</span>
                  <span className="font-medium text-foreground">{selectedBalance.customer_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">سيتم خصمها من الرصيد</span>
                  <span className="text-lg font-bold text-accent font-mono">{balanceMinutesToUse} دقيقة</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">التكلفة</span>
                  <span className="text-lg font-bold text-success font-mono">مجاناً (من الباقة)</span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {sessionMode === 'timer' ? 'التكلفة المقدرة' : 'السعر بالساعة'}
                  </span>
                  <span className="text-2xl font-bold text-primary font-mono">
                    {formatILS(getEstimatedCost())}
                  </span>
                </div>
                {isPlaystation && controllerCount > 1 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {controllerCount} لاعبين × {formatILS(selectedPlan?.price_per_hour_ils || 0)}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button 
            onClick={handleStart} 
            disabled={isLoading || (useBalance && !selectedBalanceId)}
            className="gap-2"
            style={{ background: 'linear-gradient(135deg, hsl(190 100% 50%), hsl(270 80% 60%))' }}
          >
            <Play className="h-4 w-4" />
            {useBalance ? 'بدء من الرصيد' : 'بدء الجلسة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
