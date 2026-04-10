import { useNotifications } from '@/hooks/useNotifications';
import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { permission, requestPermission } = useNotifications({
    enableLowStock: true,
    enableSessionWarnings: true,
    sessionWarningMinutes: 60,
  });

  const visualNotifiedRef = useRef<Set<string>>(new Set());
  const knownEmployeesRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  // Visual on-screen alerts for timer sessions
  const checkTimerVisualAlerts = useCallback(async () => {
    const { data: sessions } = await supabase
      .from('sessions')
      .select(`
        id, start_time, paused_seconds, pause_started_at, status, session_mode, timer_minutes,
        devices!inner(name)
      `)
      .eq('status', 'running')
      .eq('session_mode', 'timer')
      .not('timer_minutes', 'is', null);

    if (!sessions) return;

    const now = Date.now();

    for (const session of sessions) {
      if (!session.timer_minutes) continue;

      const startTime = new Date(session.start_time).getTime();
      let pausedMs = (session.paused_seconds || 0) * 1000;
      if (session.pause_started_at) {
        pausedMs += now - new Date(session.pause_started_at).getTime();
      }
      const elapsedMs = now - startTime - pausedMs;
      const totalMs = session.timer_minutes * 60 * 1000;
      const remainingMs = totalMs - elapsedMs;
      const remainingMinutes = Math.floor(remainingMs / 60000);

      const deviceName = (session.devices as { name: string })?.name || 'جهاز';

      // 5-minute warning
      const fiveMinKey = `visual-${session.id}-5min`;
      if (remainingMinutes <= 5 && remainingMinutes > 0 && !visualNotifiedRef.current.has(fiveMinKey)) {
        toast.warning(`⏱️ جلسة "${deviceName}" ستنتهي خلال ${remainingMinutes} دقائق!`, {
          duration: 15000, position: 'top-center',
          style: { direction: 'rtl', fontSize: '16px' },
        });
        playSound(0.7);
        visualNotifiedRef.current.add(fiveMinKey);
      }

      // Timer ended
      const endedKey = `visual-${session.id}-ended`;
      if (remainingMs <= 0 && !visualNotifiedRef.current.has(endedKey)) {
        toast.error(`🔔 انتهت جلسة "${deviceName}"! يرجى إنهاء الجلسة.`, {
          duration: 30000, position: 'top-center',
          style: { direction: 'rtl', fontSize: '16px' },
        });
        playSound(1);
        setTimeout(() => playSound(1), 1500);
        visualNotifiedRef.current.add(endedKey);
      }
    }

    // Cleanup
    const activeIds = new Set(sessions.map(s => s.id));
    visualNotifiedRef.current.forEach(key => {
      const sessionId = key.replace('visual-', '').split('-')[0];
      if (!activeIds.has(sessionId)) visualNotifiedRef.current.delete(key);
    });
  }, []);

  // Monitor new employee joins
  const checkNewEmployees = useCallback(async () => {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name');

    if (!profiles) return;

    if (!initialLoadDoneRef.current) {
      profiles.forEach(p => knownEmployeesRef.current.add(p.id));
      initialLoadDoneRef.current = true;
      return;
    }

    for (const profile of profiles) {
      if (!knownEmployeesRef.current.has(profile.id)) {
        toast.success(
          `👤 انضم موظف جديد: "${profile.name}"`,
          {
            duration: 10000, position: 'top-center',
            style: { direction: 'rtl', fontSize: '16px' },
          }
        );
        playSound(0.5);
        knownEmployeesRef.current.add(profile.id);
      }
    }
  }, []);

  function playSound(volume: number) {
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch {}
  }

  // Timer alerts every 15s
  useEffect(() => {
    checkTimerVisualAlerts();
    const interval = setInterval(checkTimerVisualAlerts, 15000);
    return () => clearInterval(interval);
  }, [checkTimerVisualAlerts]);

  // New employee check every 60s
  useEffect(() => {
    checkNewEmployees();
    const interval = setInterval(checkNewEmployees, 60000);
    return () => clearInterval(interval);
  }, [checkNewEmployees]);

  useEffect(() => {
    if (permission === 'default') {
      const timer = setTimeout(() => {
        toast.info(
          <div className="text-right">
            <p className="font-medium">تفعيل الإشعارات</p>
            <p className="text-sm text-muted-foreground">
              فعّل الإشعارات لتلقي تنبيهات المخزون والجلسات
            </p>
            <button
              onClick={() => { requestPermission(); toast.dismiss(); }}
              className="mt-2 text-sm text-primary hover:underline"
            >
              تفعيل الآن
            </button>
          </div>,
          { duration: 10000 }
        );
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [permission, requestPermission]);

  return <>{children}</>;
}
