import { Monitor, Gamepad2, Play, Pause, Square, ArrowLeftRight, Timer, Gauge, Users, Clock, User, CalendarCheck, Wallet, AlertTriangle } from 'lucide-react';
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
  session_mode?: 'meter' | 'timer';
  timer_minutes?: number | null;
  controller_count?: number;
  customer_name?: string | null;
  reservation_id?: string | null;
  paid_from_balance?: boolean;
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
  onExtendTimer?: () => void;
}

export function DeviceCard({
  device,
  session,
  onStart,
  onPause,
  onResume,
  onEnd,
  onTransfer,
  onExtendTimer,
}: DeviceCardProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [remainingMinutes, setRemainingMinutes] = useState(0);
  const [currentCost, setCurrentCost] = useState(0);
  const [timerEnded, setTimerEnded] = useState(false);

  const isRunning = session?.status === 'running';
  const isPaused = session?.status === 'paused';
  const isIdle = !session || session.status === 'ended';
  const isTimerMode = session?.session_mode === 'timer';
  const controllerCount = session?.controller_count || 1;

  useEffect(() => {
    if (!session || session.status === 'ended') {
      setElapsedMinutes(0);
      setRemainingMinutes(0);
      setCurrentCost(0);
      setTimerEnded(false);
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

      // Calculate remaining time for timer mode
      if (isTimerMode && session.timer_minutes) {
        const remaining = session.timer_minutes - minutes;
        setRemainingMinutes(Math.max(0, remaining));
        setTimerEnded(remaining <= 0);
      }

      // Calculate cost with controller multiplier
      const pricePerHour = session.rate_plan?.price_per_hour_ils || 15;
      const multiplier = device.type === 'playstation' ? controllerCount : 1;
      const cost = (minutes / 60) * pricePerHour * multiplier;
      setCurrentCost(cost);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [session, isTimerMode, controllerCount, device.type]);

  const Icon = device.type === 'playstation' ? Gamepad2 : Monitor;

  const statusLabel = isRunning ? t('running') : isPaused ? t('paused') : t('idle');
  const statusClass = isRunning ? 'status-running' : isPaused ? 'status-paused' : 'status-idle';

  // Timer progress percentage
  const timerProgress = isTimerMode && session?.timer_minutes 
    ? Math.min(100, (elapsedMinutes / session.timer_minutes) * 100)
    : 0;

  return (
    <div
      className={cn(
        'device-card',
        isRunning && 'device-card-running',
        isPaused && 'device-card-paused',
        timerEnded && 'animate-pulse border-destructive'
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
        <div className="flex flex-col items-end gap-1">
          <span className={cn('rounded-full px-3 py-1 text-xs font-medium', statusClass)}>
            {statusLabel}
          </span>
          {(isRunning || isPaused) && session && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {isTimerMode ? <Timer className="h-3 w-3" /> : <Gauge className="h-3 w-3" />}
              {isTimerMode ? 'تايمر' : 'عداد'}
            </span>
          )}
        </div>
      </div>

      {/* Session Info */}
      {(isRunning || isPaused) && session && (
        <div className="mt-4 space-y-3">
          {/* Customer / reservation / prepaid context */}
          {(session.customer_name || session.reservation_id || session.paid_from_balance) && (
            <div className="flex flex-wrap gap-2">
              {session.customer_name && (
                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  <User className="h-3 w-3" />
                  {session.customer_name}
                </span>
              )}
              {session.reservation_id && (
                <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                  <CalendarCheck className="h-3 w-3" />
                  حجز
                </span>
              )}
              {session.paid_from_balance && (
                <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                  <Wallet className="h-3 w-3" />
                  مدفوع من الرصيد
                </span>
              )}
            </div>
          )}

          {/* Paused notice */}
          {isPaused && (
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              <Pause className="h-3 w-3" />
              الجلسة موقوفة مؤقتاً — الوقت لا يُحسب حالياً
            </div>
          )}

          {/* Timer ending soon warning */}
          {isTimerMode && !timerEnded && remainingMinutes <= 5 && (
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
              <AlertTriangle className="h-3 w-3" />
              ستنتهي الجلسة خلال {remainingMinutes} دقيقة
            </div>
          )}

          {/* Timer Progress Bar */}
          {isTimerMode && (
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-1000",
                  timerEnded ? "bg-destructive" : timerProgress > 80 ? "bg-warning" : "bg-primary"
                )}
                style={{ width: `${timerProgress}%` }}
              />
            </div>
          )}


          <div className="rounded-lg bg-muted/50 p-3">
            {/* Time Display */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {isTimerMode ? t('remainingTime') : t('duration')}
              </span>
              <span className={cn(
                "font-mono text-sm font-medium",
                timerEnded ? "text-destructive animate-pulse" : "text-foreground"
              )}>
                {isTimerMode 
                  ? (timerEnded ? t('timerEnded') : formatDuration(remainingMinutes))
                  : formatDuration(elapsedMinutes)
                }
              </span>
            </div>

            {/* Controller Count (PlayStation only) */}
            {device.type === 'playstation' && controllerCount > 1 && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {t('controllerCount')}
                </span>
                <span className="text-sm font-medium text-accent">
                  {controllerCount} {t('controllers')}
                </span>
              </div>
            )}

            {/* Cost */}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('cost')}</span>
              <span className="font-mono text-lg font-bold text-primary">
                {session.paid_from_balance ? formatILS(0) : formatILS(currentCost)}
              </span>
            </div>


            {/* Rate Plan */}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('ratePlan')}</span>
              <span className="text-sm text-foreground">{session.rate_plan?.name || 'عادي'}</span>
            </div>
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
          <>
            {/* Extend Timer Button (only for timer mode) */}
            {isTimerMode && onExtendTimer && (
              <Button 
                onClick={onExtendTimer} 
                variant="outline" 
                size="icon" 
                aria-label={t('extendTimer')}
                className="touch-target border-primary/50 hover:bg-primary/10"
                title={t('extendTimer')}
              >
                <Clock className="h-4 w-4 text-primary" />
              </Button>
            )}
            <Button onClick={onTransfer} variant="outline" size="icon" aria-label={t('transferSession')} className="touch-target">
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
