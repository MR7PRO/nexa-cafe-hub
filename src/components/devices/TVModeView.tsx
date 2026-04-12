import { useEffect, useState } from 'react';
import { Monitor, Gamepad2, Timer, Gauge, Minimize2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatILS, formatDuration } from '@/lib/i18n';

interface Session {
  id: string;
  start_time: string;
  paused_seconds: number;
  pause_started_at: string | null;
  status: 'running' | 'paused' | 'ended';
  session_mode?: 'meter' | 'timer';
  timer_minutes?: number | null;
  controller_count?: number;
  rate_plan: {
    name: string;
    price_per_hour_ils: number;
  };
}

interface Device {
  id: string;
  name: string;
  type: 'playstation' | 'pc';
  location: string | null;
}

interface TVModeViewProps {
  devices: Device[];
  sessions: Record<string, Session>;
  onExit: () => void;
}

function TVDeviceCard({ device, session }: { device: Device; session: Session | null }) {
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
      if (session.status === 'paused' && session.pause_started_at) {
        pausedMs += now - new Date(session.pause_started_at).getTime();
      }
      const activeMs = now - startTime - pausedMs;
      const minutes = Math.max(0, Math.floor(activeMs / 60000));
      setElapsedMinutes(minutes);

      if (isTimerMode && session.timer_minutes) {
        const remaining = session.timer_minutes - minutes;
        setRemainingMinutes(Math.max(0, remaining));
        setTimerEnded(remaining <= 0);
      }

      const pricePerHour = session.rate_plan?.price_per_hour_ils || 15;
      const multiplier = device.type === 'playstation' ? controllerCount : 1;
      setCurrentCost((minutes / 60) * pricePerHour * multiplier);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [session, isTimerMode, controllerCount, device.type]);

  const Icon = device.type === 'playstation' ? Gamepad2 : Monitor;

  const timerProgress = isTimerMode && session?.timer_minutes
    ? Math.min(100, (elapsedMinutes / session.timer_minutes) * 100)
    : 0;

  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 p-4 transition-all duration-500',
        isRunning && 'border-green-500/60 bg-green-500/10 shadow-[0_0_30px_rgba(34,197,94,0.15)]',
        isPaused && 'border-yellow-500/60 bg-yellow-500/10 shadow-[0_0_30px_rgba(234,179,8,0.15)]',
        isIdle && 'border-border/40 bg-card/50',
        timerEnded && 'animate-pulse border-destructive bg-destructive/10'
      )}
    >
      {/* Status indicator dot */}
      <div className={cn(
        'absolute top-3 left-3 h-3 w-3 rounded-full',
        isRunning && 'bg-green-500 animate-pulse',
        isPaused && 'bg-yellow-500',
        isIdle && 'bg-muted-foreground/30'
      )} />

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={cn(
          'rounded-xl p-2.5',
          isRunning ? 'bg-green-500/20 text-green-400' :
          isPaused ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-muted/50 text-muted-foreground/50'
        )}>
          <Icon className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground truncate">{device.name}</h3>
          <div className="flex items-center gap-2">
            {!isIdle && session && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {isTimerMode ? <Timer className="h-3 w-3" /> : <Gauge className="h-3 w-3" />}
                {isTimerMode ? 'تايمر' : 'عداد'}
              </span>
            )}
            {device.type === 'playstation' && controllerCount > 1 && !isIdle && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {controllerCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Active session info */}
      {!isIdle && session && (
        <div className="space-y-2">
          {/* Timer progress */}
          {isTimerMode && (
            <div className="relative h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-1000 rounded-full',
                  timerEnded ? 'bg-destructive' : timerProgress > 80 ? 'bg-yellow-500' : 'bg-primary'
                )}
                style={{ width: `${timerProgress}%` }}
              />
            </div>
          )}

          {/* Time */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {isTimerMode ? 'المتبقي' : 'المدة'}
            </span>
            <span className={cn(
              'font-mono text-base font-bold',
              timerEnded ? 'text-destructive' : 'text-foreground'
            )}>
              {isTimerMode
                ? (timerEnded ? 'انتهى!' : formatDuration(remainingMinutes))
                : formatDuration(elapsedMinutes)
              }
            </span>
          </div>

          {/* Cost */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">التكلفة</span>
            <span className="font-mono text-xl font-bold text-primary">
              {formatILS(currentCost)}
            </span>
          </div>
        </div>
      )}

      {/* Idle state */}
      {isIdle && (
        <div className="text-center py-2">
          <span className="text-sm text-muted-foreground/50">متاح</span>
        </div>
      )}
    </div>
  );
}

export function TVModeView({ devices, sessions, onExit }: TVModeViewProps) {
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      clearInterval(interval);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onExit]);

  const activeCount = Object.values(sessions).filter(s => s.status === 'running').length;
  const pausedCount = Object.values(sessions).filter(s => s.status === 'paused').length;

  // Determine grid columns based on device count
  const count = devices.length;
  const gridClass = count <= 4
    ? 'grid-cols-2'
    : count <= 6
    ? 'grid-cols-3'
    : count <= 9
    ? 'grid-cols-3 xl:grid-cols-3'
    : count <= 12
    ? 'grid-cols-4'
    : 'grid-cols-4 xl:grid-cols-5';

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/30 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-foreground">شبكة الأجهزة</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-muted-foreground">{activeCount} نشط</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
              <span className="text-muted-foreground">{pausedCount} متوقف</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span className="text-muted-foreground">{devices.length - activeCount - pausedCount} متاح</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-2xl font-bold text-foreground tabular-nums">
            {clock.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            onClick={onExit}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="خروج (Esc)"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Device grid */}
      <div className={cn('flex-1 grid gap-4 p-6 auto-rows-fr overflow-auto', gridClass)}>
        {devices.map((device) => (
          <TVDeviceCard
            key={device.id}
            device={device}
            session={sessions[device.id] || null}
          />
        ))}
      </div>
    </div>
  );
}
