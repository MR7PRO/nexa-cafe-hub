import { Monitor, Gamepad2, Play, Pause, Square, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t, formatILS, formatDuration } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

interface Session {
  id: string;
  start_time: string;
  paused_seconds: number;
  pause_started_at: string | null;
  status: 'running' | 'paused' | 'ended';
  rate_plan: {
    name: string;
    price_per_hour_ils: number;
  };
}

interface DeviceCardProps {
  device: {
    id: string;
    name: string;
    type: 'playstation' | 'pc';
    location: string | null;
  };
  session: Session | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onTransfer: () => void;
}

export function DeviceCard({
  device,
  session,
  onStart,
  onPause,
  onResume,
  onEnd,
  onTransfer,
}: DeviceCardProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [currentCost, setCurrentCost] = useState(0);

  const isRunning = session?.status === 'running';
  const isPaused = session?.status === 'paused';
  const isIdle = !session || session.status === 'ended';

  useEffect(() => {
    if (!session || session.status === 'ended') {
      setElapsedMinutes(0);
      setCurrentCost(0);
      return;
    }

    const calculateTime = () => {
      const startTime = new Date(session.start_time).getTime();
      const now = Date.now();
      let pausedMs = (session.paused_seconds || 0) * 1000;

      // If currently paused, add time since pause started
      if (session.status === 'paused' && session.pause_started_at) {
        const pauseStart = new Date(session.pause_started_at).getTime();
        pausedMs += now - pauseStart;
      }

      const activeMs = now - startTime - pausedMs;
      const minutes = Math.max(0, Math.floor(activeMs / 60000));
      setElapsedMinutes(minutes);

      // Calculate cost
      const pricePerHour = session.rate_plan?.price_per_hour_ils || 15;
      const cost = (minutes / 60) * pricePerHour;
      setCurrentCost(cost);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [session]);

  const Icon = device.type === 'playstation' ? Gamepad2 : Monitor;

  const statusLabel = isRunning ? t('running') : isPaused ? t('paused') : t('idle');
  const statusClass = isRunning ? 'status-running' : isPaused ? 'status-paused' : 'status-idle';

  return (
    <div
      className={cn(
        'device-card',
        isRunning && 'device-card-running',
        isPaused && 'device-card-paused'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'rounded-xl p-3',
            isRunning ? 'bg-success/20 text-success' :
            isPaused ? 'bg-warning/20 text-warning' :
            'bg-muted text-muted-foreground'
          )}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{device.name}</h3>
            <p className="text-sm text-muted-foreground">{device.location || 'الصالة الرئيسية'}</p>
          </div>
        </div>
        <span className={cn('rounded-full px-3 py-1 text-xs font-medium', statusClass)}>
          {statusLabel}
        </span>
      </div>

      {/* Session Info */}
      {(isRunning || isPaused) && session && (
        <div className="mt-4 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('duration')}</span>
            <span className="font-mono text-sm font-medium text-foreground">
              {formatDuration(elapsedMinutes)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('cost')}</span>
            <span className="font-mono text-lg font-bold text-primary">
              {formatILS(currentCost)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('ratePlan')}</span>
            <span className="text-sm text-foreground">{session.rate_plan?.name || 'عادي'}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isIdle && (
          <Button onClick={onStart} className="flex-1 gap-2 touch-target" variant="default">
            <Play className="h-4 w-4" />
            {t('start')}
          </Button>
        )}
        {isRunning && (
          <>
            <Button onClick={onPause} variant="secondary" className="flex-1 gap-2 touch-target">
              <Pause className="h-4 w-4" />
              {t('pause')}
            </Button>
            <Button onClick={onEnd} variant="destructive" className="flex-1 gap-2 touch-target">
              <Square className="h-4 w-4" />
              {t('end')}
            </Button>
          </>
        )}
        {isPaused && (
          <>
            <Button onClick={onResume} className="flex-1 gap-2 touch-target">
              <Play className="h-4 w-4" />
              {t('resume')}
            </Button>
            <Button onClick={onEnd} variant="destructive" className="flex-1 gap-2 touch-target">
              <Square className="h-4 w-4" />
              {t('end')}
            </Button>
          </>
        )}
        {(isRunning || isPaused) && (
          <Button onClick={onTransfer} variant="outline" size="icon" className="touch-target">
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
