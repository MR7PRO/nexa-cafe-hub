import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff, RefreshCw } from 'lucide-react';
import { getPendingChangesCount } from '@/lib/offlineDb';
import { useEffect, useState } from 'react';

export function OfflineIndicator() {
  const { isOnline } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateCount = async () => {
      const count = await getPendingChangesCount();
      setPendingCount(count);
    };
    
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-all ${
      isOnline 
        ? 'bg-yellow-500/90 text-yellow-950' 
        : 'bg-destructive/90 text-destructive-foreground'
    }`}>
      {isOnline ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>جاري المزامنة... ({pendingCount})</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>بدون اتصال {pendingCount > 0 && `(${pendingCount} معلق)`}</span>
        </>
      )}
    </div>
  );
}
