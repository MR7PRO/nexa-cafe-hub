import { useState } from 'react';
import { ArrowLeftRight, Monitor, Gamepad2 } from 'lucide-react';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Device {
  id: string;
  name: string;
  type: 'playstation' | 'pc';
  location: string | null;
}

interface TransferSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceDevice: Device | null;
  availableDevices: Device[];
  onTransfer: (targetDeviceId: string) => void;
  isLoading?: boolean;
}

export function TransferSessionDialog({
  open,
  onOpenChange,
  sourceDevice,
  availableDevices,
  onTransfer,
  isLoading = false,
}: TransferSessionDialogProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const handleTransfer = () => {
    if (selectedDeviceId) {
      onTransfer(selectedDeviceId);
      setSelectedDeviceId(null);
    }
  };

  const handleClose = () => {
    setSelectedDeviceId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            {t('transferSession')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Source Device */}
          {sourceDevice && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground mb-1">{t('from')}</p>
              <div className="flex items-center gap-2">
                {sourceDevice.type === 'playstation' ? (
                  <Gamepad2 className="h-5 w-5 text-primary" />
                ) : (
                  <Monitor className="h-5 w-5 text-primary" />
                )}
                <span className="font-medium">{sourceDevice.name}</span>
              </div>
            </div>
          )}

          {/* Target Device Selection */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">{t('to')}</p>
            {availableDevices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>{t('noAvailableDevices')}</p>
              </div>
            ) : (
              <div className="grid gap-2 max-h-64 overflow-y-auto">
                {availableDevices.map((device) => {
                  const Icon = device.type === 'playstation' ? Gamepad2 : Monitor;
                  const isSelected = selectedDeviceId === device.id;

                  return (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDeviceId(device.id)}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border transition-all text-right',
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      )}
                    >
                      <div className={cn(
                        'rounded-lg p-2',
                        isSelected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{device.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {device.location || 'الصالة الرئيسية'}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="h-3 w-3 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={isLoading}
            >
              {t('cancel')}
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleTransfer}
              disabled={!selectedDeviceId || isLoading}
            >
              <ArrowLeftRight className="h-4 w-4" />
              {t('transfer')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
