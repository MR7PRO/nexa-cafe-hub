import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PendingChange {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
}

interface OfflineDbSchema extends DBSchema {
  devices: {
    key: string;
    value: Record<string, unknown>;
  };
  sessions: {
    key: string;
    value: Record<string, unknown>;
  };
  products: {
    key: string;
    value: Record<string, unknown>;
  };
  categories: {
    key: string;
    value: Record<string, unknown>;
  };
  tickets: {
    key: string;
    value: Record<string, unknown>;
  };
  ticket_items: {
    key: string;
    value: Record<string, unknown>;
  };
  payments: {
    key: string;
    value: Record<string, unknown>;
  };
  rate_plans: {
    key: string;
    value: Record<string, unknown>;
  };
  expenses: {
    key: string;
    value: Record<string, unknown>;
  };
  shifts: {
    key: string;
    value: Record<string, unknown>;
  };
  profiles: {
    key: string;
    value: Record<string, unknown>;
  };
  settings: {
    key: string;
    value: Record<string, unknown>;
  };
  pending_changes: {
    key: string;
    value: PendingChange;
    indexes: { 'by-timestamp': number };
  };
  sync_metadata: {
    key: string;
    value: { table: string; lastSync: number };
  };
}

const DB_NAME = 'gaming-cafe-offline';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<OfflineDbSchema> | null = null;

export async function getOfflineDb(): Promise<IDBPDatabase<OfflineDbSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OfflineDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create object stores for each table
      const tables = [
        'devices', 'sessions', 'products', 'categories', 'tickets',
        'ticket_items', 'payments', 'rate_plans', 'expenses', 'shifts',
        'profiles', 'settings'
      ] as const;

      tables.forEach(table => {
        if (!db.objectStoreNames.contains(table)) {
          db.createObjectStore(table, { keyPath: 'id' });
        }
      });

      // Pending changes store with timestamp index
      if (!db.objectStoreNames.contains('pending_changes')) {
        const store = db.createObjectStore('pending_changes', { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
      }

      // Sync metadata store
      if (!db.objectStoreNames.contains('sync_metadata')) {
        db.createObjectStore('sync_metadata', { keyPath: 'table' });
      }
    },
  });

  return dbInstance;
}

export type TableName = 'devices' | 'sessions' | 'products' | 'categories' | 'tickets' |
  'ticket_items' | 'payments' | 'rate_plans' | 'expenses' | 'shifts' | 'profiles' | 'settings';

// Save data to local store
export async function saveToLocal<T extends Record<string, unknown>>(
  table: TableName,
  data: T | T[]
): Promise<void> {
  const db = await getOfflineDb();
  const items = Array.isArray(data) ? data : [data];
  
  const tx = db.transaction(table, 'readwrite');
  await Promise.all([
    ...items.map(item => tx.store.put(item)),
    tx.done
  ]);
}

// Get all data from local store
export async function getFromLocal<T>(table: TableName): Promise<T[]> {
  const db = await getOfflineDb();
  return db.getAll(table) as Promise<T[]>;
}

// Get single item from local store
export async function getOneFromLocal<T>(table: TableName, id: string): Promise<T | undefined> {
  const db = await getOfflineDb();
  return db.get(table, id) as Promise<T | undefined>;
}

// Delete from local store
export async function deleteFromLocal(table: TableName, id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete(table, id);
}

// Add pending change for sync
export async function addPendingChange(
  table: TableName,
  operation: 'insert' | 'update' | 'delete',
  data: Record<string, unknown>
): Promise<void> {
  const db = await getOfflineDb();
  const change: PendingChange = {
    id: `${table}-${data.id || Date.now()}-${Date.now()}`,
    table,
    operation,
    data,
    timestamp: Date.now(),
  };
  await db.add('pending_changes', change);
}

// Get all pending changes sorted by timestamp
export async function getPendingChanges(): Promise<PendingChange[]> {
  const db = await getOfflineDb();
  return db.getAllFromIndex('pending_changes', 'by-timestamp');
}

// Remove a pending change after successful sync
export async function removePendingChange(id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete('pending_changes', id);
}

// Get pending changes count
export async function getPendingChangesCount(): Promise<number> {
  const db = await getOfflineDb();
  return db.count('pending_changes');
}

// Clear all pending changes
export async function clearPendingChanges(): Promise<void> {
  const db = await getOfflineDb();
  await db.clear('pending_changes');
}

// Update sync metadata
export async function updateSyncMetadata(table: TableName): Promise<void> {
  const db = await getOfflineDb();
  await db.put('sync_metadata', { table, lastSync: Date.now() });
}

// Get last sync time for a table
export async function getLastSyncTime(table: TableName): Promise<number | null> {
  const db = await getOfflineDb();
  const metadata = await db.get('sync_metadata', table);
  return metadata?.lastSync || null;
}

// Clear entire table in local store
export async function clearLocalTable(table: TableName): Promise<void> {
  const db = await getOfflineDb();
  await db.clear(table);
}
