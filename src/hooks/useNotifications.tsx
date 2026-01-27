import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface NotificationOptions {
  enableLowStock?: boolean;
  enableSessionWarnings?: boolean;
  sessionWarningMinutes?: number;
}

export function useNotifications(options: NotificationOptions = {}) {
  const {
    enableLowStock = true,
    enableSessionWarnings = true,
    sessionWarningMinutes = 60,
  } = options;

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const notifiedSessions = useRef<Set<string>>(new Set());
  const notifiedProducts = useRef<Set<string>>(new Set());

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
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
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

  // Check for session time warnings
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
        devices!inner(name)
      `)
      .in('status', ['running', 'paused']);

    if (!sessions) return;

    const now = new Date();
    const warningThreshold = sessionWarningMinutes * 60 * 1000; // Convert to milliseconds

    for (const session of sessions) {
      const startTime = new Date(session.start_time);
      const elapsedMs = now.getTime() - startTime.getTime() - (session.paused_seconds * 1000);
      
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

  return {
    permission,
    requestPermission,
    sendNotification,
    checkLowStock,
    checkSessionWarnings,
  };
}
