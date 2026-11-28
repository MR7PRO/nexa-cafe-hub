/** Keep a request identity through failures/reloads; never used for authorization. */
export function createSaleRequest(scope: string, storage: Storage = sessionStorage) {
  const slot = `nexa-sale-request:${scope}`;
  let pending: { fingerprint: string; id: string } | null = null;
  try {
    const stored = JSON.parse(storage.getItem(slot) ?? 'null');
    if (typeof stored?.fingerprint === 'string' && typeof stored?.id === 'string') pending = stored;
  } catch { /* Storage unavailable or stale: keep an in-memory identity. */ }
  return {
    get(payload: unknown): string {
      const fingerprint = JSON.stringify(payload);
      if (pending?.fingerprint !== fingerprint) {
        pending = { fingerprint, id: crypto.randomUUID() };
        try { storage.setItem(slot, JSON.stringify(pending)); } catch { /* memory fallback */ }
      }
      return pending.id;
    },
    complete() {
      pending = null;
      try { storage.removeItem(slot); } catch { /* memory fallback */ }
    },
  };
}