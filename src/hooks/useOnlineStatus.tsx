import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    if (wasOffline) {
      toast.success('تم استعادة الاتصال بالإنترنت', {
        description: 'جاري مزامنة البيانات...',
        duration: 3000,
      });
    }
    setWasOffline(false);
  }, [wasOffline]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setWasOffline(true);
    toast.warning('أنت الآن بدون اتصال', {
      description: 'البيانات محفوظة محلياً وستتم مزامنتها عند عودة الاتصال',
      duration: 5000,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, wasOffline };
}
