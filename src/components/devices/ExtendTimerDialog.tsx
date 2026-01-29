import { useState } from 'react';
import { Clock, Plus, Minus } from 'lucide-react';
import { t, formatDuration } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface ExtendTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceName: string;
  currentTimerMinutes: number;
  elapsedMinutes: number;
  onExtend: (additionalMinutes: number) => void;
  isLoading?: boolean;
}

const PRESET_MINUTES = [15, 30, 60, 90];

export function ExtendTimerDialog({
  open,
  onOpenChange,
  deviceName,
  currentTimerMinutes,
  elapsedMinutes,
  onExtend,
  isLoading = false,
}: ExtendTimerDialogProps) {
  const [additionalMinutes, setAdditionalMinutes] = useState(30);

  const handlePresetClick = (minutes: number) => {
    setAdditionalMinutes(minutes);
  };

  const handleIncrement = () => {
    setAdditionalMinutes(prev => Math.min(prev + 15, 240));
  };

  const handleDecrement = () => {
    setAdditionalMinutes(prev => Math.max(prev - 15, 15));
  };

  const handleConfirm = () => {
    onExtend(additionalMinutes);
  };

  const newTotalMinutes = currentTimerMinutes + additionalMinutes;
  const newRemainingMinutes = newTotalMinutes - elapsedMinutes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Clock className="h-5 w-5 text-primary" />
            {t('extendTimer')} - {deviceName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Status */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">الوقت الأصلي:</span>
              <span className="font-medium">{formatDuration(currentTimerMinutes)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">الوقت المستهلك:</span>
              <span className="font-medium">{formatDuration(elapsedMinutes)}</span>
            </div>
          </div>

          {/* Extension Amount */}
          <div className="space-y-3">
            <Label>{t('extendMinutes')}</Label>
            
            {/* Preset buttons */}
            <div className="grid grid-cols-4 gap-2">
              {PRESET_MINUTES.map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  variant={additionalMinutes === minutes ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePresetClick(minutes)}
                  className="text-sm"
                >
                  {minutes} د
                </Button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="flex items-center justify-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleDecrement}
                disabled={additionalMinutes <= 15}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[100px]">
                <span className="text-3xl font-bold text-primary">{additionalMinutes}</span>
                <span className="mr-1 text-sm text-muted-foreground">{t('minute')}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleIncrement}
                disabled={additionalMinutes >= 240}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* New Total Preview */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">الوقت الجديد المتبقي:</span>
              <span className="text-xl font-bold text-primary">
                {formatDuration(Math.max(0, newRemainingMinutes))}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading} className="gap-2">
            {isLoading ? 'جاري التمديد...' : t('extendTimer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
