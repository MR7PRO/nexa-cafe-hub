import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  getFromLocal,
  saveToLocal,
  getPendingChanges,
  removePendingChange,
  addPendingChange,
  updateSyncMetadata,
  getLastSyncTime,
  getPendingChangesCount,
  TableName,
} from '@/lib/offlineDb';
import { useOnlineStatus } from './useOnlineStatus';

const SYNC_TABLES: TableName[] = [
  'devices', 'sessions', 'products', 'categories', 'tickets',
  'ticket_items', 'payments', 'rate_plans', 'expenses', 'shifts',
  'profiles', 'settings'
];

export function useOfflineSync() {
  const { isOnline } = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncInProgressRef = useRef(false);

  // Fetch data from server and save to local
  const fetchAndCacheTable = useCallback(async (table: TableName) => {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      if (data) {
        await saveToLocal(table, data);
        await updateSyncMetadata(table);
      }
    } catch (error) {
      console.error(`Error fetching ${table}:`, error);
    }
  }, []);

  // Initial sync - download all data
  const initialSync = useCallback(async () => {
    if (!isOnline || syncInProgressRef.current) return;
    
    syncInProgressRef.current = true;
    setIsSyncing(true);

    try {
      await Promise.all(SYNC_TABLES.map(fetchAndCacheTable));
      console.log('Initial sync completed');
    } catch (error) {
      console.error('Initial sync error:', error);
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [isOnline, fetchAndCacheTable]);

  // Push pending changes to server
  const pushPendingChanges = useCallback(async () => {
    if (!isOnline) return;

    const changes = await getPendingChanges();
    if (changes.length === 0) return;

    let successCount = 0;
    let errorCount = 0;

    for (const change of changes) {
      try {
        const table = change.table as TableName;
        
        if (change.operation === 'insert') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabase.from(table).insert(change.data as any);
          if (error) throw error;
        } else if (change.operation === 'update') {
          const { id, ...updateData } = change.data;
          const { error } = await supabase.from(table).update(updateData).eq('id', id as string);
          if (error) throw error;
        } else if (change.operation === 'delete') {
          const { error } = await supabase.from(table).delete().eq('id', change.data.id as string);
          if (error) throw error;
        }

        await removePendingChange(change.id);
        successCount++;
      } catch (error) {
        console.error(`Error syncing change ${change.id}:`, error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`تمت مزامنة ${successCount} تغيير`, { duration: 2000 });
    }
    if (errorCount > 0) {
      toast.error(`فشلت مزامنة ${errorCount} تغيير`, { duration: 3000 });
    }

    // Refresh data from server after pushing changes
    await Promise.all(SYNC_TABLES.map(fetchAndCacheTable));
    
    const newCount = await getPendingChangesCount();
    setPendingCount(newCount);
  }, [isOnline, fetchAndCacheTable]);

  // Save data with offline support
  const saveWithOfflineSupport = useCallback(async <T extends Record<string, unknown>>(
    table: TableName,
    data: T,
    operation: 'insert' | 'update' = 'insert'
  ): Promise<{ success: boolean; error?: string }> => {
    // Always save locally first
    await saveToLocal(table, data);

    if (isOnline) {
      try {
        if (operation === 'insert') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabase.from(table).insert(data as any);
          if (error) throw error;
        } else {
          const { id, ...updateData } = data;
          const { error } = await supabase.from(table).update(updateData).eq('id', id as string);
          if (error) throw error;
        }
        return { success: true };
      } catch (error) {
        // If online save fails, add to pending
        await addPendingChange(table, operation, data);
        const count = await getPendingChangesCount();
        setPendingCount(count);
        console.error(`Error saving to ${table}, queued for sync:`, error);
        return { success: true }; // Still return success as it's saved locally
      }
    } else {
      // Offline - add to pending changes
      await addPendingChange(table, operation, data);
      const count = await getPendingChangesCount();
      setPendingCount(count);
      return { success: true };
    }
  }, [isOnline]);

  // Delete with offline support
  const deleteWithOfflineSupport = useCallback(async (
    table: TableName,
    id: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (isOnline) {
      try {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        return { success: true };
      } catch (error) {
        await addPendingChange(table, 'delete', { id });
        const count = await getPendingChangesCount();
        setPendingCount(count);
        return { success: true };
      }
    } else {
      await addPendingChange(table, 'delete', { id });
      const count = await getPendingChangesCount();
      setPendingCount(count);
      return { success: true };
    }
  }, [isOnline]);

  // Get data with offline fallback
  const getWithOfflineFallback = useCallback(async <T,>(
    table: TableName,
    queryFn?: () => Promise<{ data: T[] | null; error: Error | null }>
  ): Promise<T[]> => {
    if (isOnline && queryFn) {
      try {
        const { data, error } = await queryFn();
        if (error) throw error;
        if (data) {
          await saveToLocal(table, data as Record<string, unknown>[]);
          return data;
        }
      } catch (error) {
        console.error(`Error fetching ${table}, falling back to cache:`, error);
      }
    }
    
    // Return cached data
    return getFromLocal<T>(table);
  }, [isOnline]);

  // Sync when coming back online
  useEffect(() => {
    if (isOnline) {
      pushPendingChanges();
    }
  }, [isOnline, pushPendingChanges]);

  // Initial load - sync if online, otherwise use cached data
  useEffect(() => {
    const init = async () => {
      const count = await getPendingChangesCount();
      setPendingCount(count);
      
      if (isOnline) {
        await initialSync();
        await pushPendingChanges();
      }
    };
    init();
  }, []);

  // Set up periodic sync when online
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(async () => {
      await pushPendingChanges();
    }, 30000); // Sync every 30 seconds

    return () => clearInterval(interval);
  }, [isOnline, pushPendingChanges]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    saveWithOfflineSupport,
    deleteWithOfflineSupport,
    getWithOfflineFallback,
    pushPendingChanges,
    initialSync,
  };
}
