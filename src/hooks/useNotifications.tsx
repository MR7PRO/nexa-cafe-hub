import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface NotificationOptions {
  enableLowStock?: boolean;
  enableSessionWarnings?: boolean;
  sessionWarningMinutes?: number;
  enableTimerEndNotifications?: boolean;
}

export function useNotifications(options: NotificationOptions = {}) {
  const {
    enableLowStock = true,
    enableSessionWarnings = true,
    sessionWarningMinutes = 60,
    enableTimerEndNotifications = true,
  } = options;

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const notifiedSessions = useRef<Set<string>>(new Set());
  const notifiedProducts = useRef<Set<string>>(new Set());
  const notifiedTimerSessions = useRef<Set<string>>(new Set());

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('المتصفح لا يدعم الإشعارات');
      return false;
    }

    if (Notification.permission === 'granted') {
      setPermission('granted');
      return true;
    }

    if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    }

    setPermission('denied');
    return false;
  }, []);

  // Send notification
  const sendNotification = useCallback((title: string, body: string, icon?: string) => {
    if (permission !== 'granted') return;

    const notification = new Notification(title, {
      body,
      icon: icon || '/favicon.ico',
      dir: 'rtl',
      lang: 'ar',
      tag: `${title}-${Date.now()}`,
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Play notification sound
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}

    // Auto close after 10 seconds
    setTimeout(() => notification.close(), 10000);
  }, [permission]);

  // Check for low stock products
  const checkLowStock = useCallback(async () => {
    if (!enableLowStock || permission !== 'granted') return;

    const { data: products } = await supabase
      .from('products')
      .select('id, name, stock_qty, low_stock_threshold')
      .eq('is_active', true)
      .not('stock_qty', 'is', null);

    if (!products) return;

    for (const product of products) {
      const threshold = product.low_stock_threshold || 5;
      if (
        product.stock_qty !== null && 
        product.stock_qty <= threshold &&
        !notifiedProducts.current.has(product.id)
      ) {
        sendNotification(
          '⚠️ تنبيه مخزون منخفض',
          `المنتج "${product.name}" وصل للحد الأدنى (${product.stock_qty} متبقي)`
        );
        notifiedProducts.current.add(product.id);
      } else if (product.stock_qty !== null && product.stock_qty > threshold) {
        // Remove from notified if stock is replenished
        notifiedProducts.current.delete(product.id);
      }
    }
  }, [enableLowStock, permission, sendNotification]);

  // Check for session time warnings (1 hour+ sessions)
  const checkSessionWarnings = useCallback(async () => {
    if (!enableSessionWarnings || permission !== 'granted') return;

    const { data: sessions } = await supabase
      .from('sessions')
      .select(`
        id,
        device_id,
        start_time,
        paused_seconds,
        status,
        session_mode,
        devices!inner(name)
      `)
      .in('status', ['running', 'paused'])
      .eq('session_mode', 'meter');

    if (!sessions) return;

    const now = new Date();
    const warningThreshold = sessionWarningMinutes * 60 * 1000; // Convert to milliseconds

    for (const session of sessions) {
      const startTime = new Date(session.start_time);
      const elapsedMs = now.getTime() - startTime.getTime() - ((session.paused_seconds || 0) * 1000);
      
      // Check if session has exceeded the warning threshold
      if (
        elapsedMs >= warningThreshold &&
        !notifiedSessions.current.has(session.id)
      ) {
        const deviceName = (session.devices as { name: string })?.name || 'جهاز غير معروف';
        const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
        const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
        
        sendNotification(
          '⏰ تنبيه وقت الجلسة',
          `الجهاز "${deviceName}" يعمل منذ ${hours > 0 ? hours + ' ساعة و ' : ''}${minutes} دقيقة`
        );
        notifiedSessions.current.add(session.id);
      }
    }

    // Clean up ended sessions from notified set
    const activeSessionIds = new Set(sessions.map(s => s.id));
    notifiedSessions.current.forEach(id => {
      if (!activeSessionIds.has(id)) {
        notifiedSessions.current.delete(id);
      }
    });
  }, [enableSessionWarnings, permission, sessionWarningMinutes, sendNotification]);

  // Check for timer sessions about to end
  const checkTimerEndNotifications = useCallback(async () => {
    if (!enableTimerEndNotifications || permission !== 'granted') return;

    const { data: sessions } = await supabase
      .from('sessions')
      .select(`
        id,
        device_id,
        start_time,
        paused_seconds,
        status,
        session_mode,
        timer_minutes,
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
      const pausedMs = (session.paused_seconds || 0) * 1000;
      const elapsedMs = now - startTime - pausedMs;
      const totalMs = session.timer_minutes * 60 * 1000;
      const remainingMs = totalMs - elapsedMs;
      const remainingMinutes = Math.floor(remainingMs / 60000);

      const deviceName = (session.devices as { name: string })?.name || 'جهاز غير معروف';

      // 5-minute warning
      const fiveMinKey = `${session.id}-5min`;
      if (remainingMinutes <= 5 && remainingMinutes > 0 && !notifiedTimerSessions.current.has(fiveMinKey)) {
        sendNotification(
          '⏱️ تنبيه انتهاء الجلسة',
          `جلسة "${deviceName}" ستنتهي خلال ${remainingMinutes} دقائق`
        );
        notifiedTimerSessions.current.add(fiveMinKey);
      }

      // Session ended
      const endedKey = `${session.id}-ended`;
      if (remainingMs <= 0 && !notifiedTimerSessions.current.has(endedKey)) {
        sendNotification(
          '🔔 انتهت الجلسة!',
          `انتهى وقت جلسة "${deviceName}"`
        );
        notifiedTimerSessions.current.add(endedKey);
      }
    }

    // Cleanup old notifications
    const activeIds = new Set(sessions.map(s => s.id));
    notifiedTimerSessions.current.forEach(key => {
      const sessionId = key.split('-')[0];
      if (!activeIds.has(sessionId)) {
        notifiedTimerSessions.current.delete(key);
      }
    });
  }, [enableTimerEndNotifications, permission, sendNotification]);

  // Request permission on mount
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // Check low stock periodically
  useEffect(() => {
    if (!enableLowStock) return;

    checkLowStock();
    const interval = setInterval(checkLowStock, 5 * 60 * 1000); // Every 5 minutes
    
    return () => clearInterval(interval);
  }, [enableLowStock, checkLowStock]);

  // Check session warnings periodically
  useEffect(() => {
    if (!enableSessionWarnings) return;

    checkSessionWarnings();
    const interval = setInterval(checkSessionWarnings, 60 * 1000); // Every minute
    
    return () => clearInterval(interval);
  }, [enableSessionWarnings, checkSessionWarnings]);

  // Check timer end notifications frequently
  useEffect(() => {
    if (!enableTimerEndNotifications) return;

    checkTimerEndNotifications();
    const interval = setInterval(checkTimerEndNotifications, 30 * 1000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [enableTimerEndNotifications, checkTimerEndNotifications]);

  return {
    permission,
    requestPermission,
    sendNotification,
    checkLowStock,
    checkSessionWarnings,
    checkTimerEndNotifications,
  };
}
