import { useNotifications } from '@/hooks/useNotifications';
import { useEffect } from 'react';
import { toast } from 'sonner';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { permission, requestPermission } = useNotifications({
    enableLowStock: true,
    enableSessionWarnings: true,
    sessionWarningMinutes: 60,
  });

  useEffect(() => {
    // Show a toast prompting to enable notifications if not granted
    if (permission === 'default') {
      const timer = setTimeout(() => {
        toast.info(
          <div className="text-right">
            <p className="font-medium">تفعيل الإشعارات</p>
            <p className="text-sm text-muted-foreground">
              فعّل الإشعارات لتلقي تنبيهات المخزون والجلسات
            </p>
            <button
              onClick={() => {
                requestPermission();
                toast.dismiss();
              }}
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
