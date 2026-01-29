import { createContext, useContext, ReactNode } from 'react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { TableName } from '@/lib/offlineDb';

interface OfflineSyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  saveWithOfflineSupport: <T extends Record<string, unknown>>(
    table: TableName,
    data: T,
    operation?: 'insert' | 'update'
  ) => Promise<{ success: boolean; error?: string }>;
  deleteWithOfflineSupport: (
    table: TableName,
    id: string
  ) => Promise<{ success: boolean; error?: string }>;
  getWithOfflineFallback: <T>(
    table: TableName,
    queryFn?: () => Promise<{ data: T[] | null; error: Error | null }>
  ) => Promise<T[]>;
  pushPendingChanges: () => Promise<void>;
  initialSync: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const offlineSync = useOfflineSync();

  return (
    <OfflineSyncContext.Provider value={offlineSync}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSyncContext() {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSyncContext must be used within OfflineSyncProvider');
  }
  return context;
}
