import { useState } from 'react';
import { Play, Timer, Gauge, Gamepad, Users } from 'lucide-react';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

  const isPlaystation = device?.type === 'playstation';

  // Get selected rate plan
  const selectedPlan = ratePlans.find(p => p.id === selectedRatePlanId) || ratePlans[0];
  
  // Calculate estimated cost
  const getEstimatedCost = () => {
    if (!selectedPlan) return 0;
    const basePrice = selectedPlan.price_per_hour_ils;
    const multiplier = isPlaystation ? controllerCount : 1;
    if (sessionMode === 'timer') {
      return (timerMinutes / 60) * basePrice * multiplier;
    }
    return basePrice * multiplier; // Show per hour for meter mode
  };

  const handleStart = () => {
    const ratePlanId = selectedRatePlanId || device?.default_rate_plan_id || ratePlans[0]?.id;
    if (!ratePlanId) return;

    onStart({
      ratePlanId,
      sessionMode,
      timerMinutes: sessionMode === 'timer' ? timerMinutes : undefined,
      controllerCount: isPlaystation ? controllerCount : 1,
    });
  };

  // Reset state when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && device) {
      setSessionMode('meter');
      setTimerMinutes(60);
      setControllerCount(1);
      setSelectedRatePlanId(device.default_rate_plan_id || ratePlans[0]?.id || '');
    }
    onOpenChange(newOpen);
  };

  if (!device) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            بدء جلسة - {device.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Session Mode Selection */}
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

          {/* Timer Duration (only for timer mode) */}
          {sessionMode === 'timer' && (
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

          {/* Estimated Cost Summary */}
          <div className="rounded-xl bg-gradient-to-l from-primary/10 to-accent/10 p-4 border border-primary/20">
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button 
            onClick={handleStart} 
            disabled={isLoading}
            className="gap-2"
            style={{ background: 'linear-gradient(135deg, hsl(190 100% 50%), hsl(270 80% 60%))' }}
          >
            <Play className="h-4 w-4" />
            بدء الجلسة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}