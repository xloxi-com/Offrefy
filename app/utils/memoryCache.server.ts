/**
 * Process-local TTL cache for hot app-proxy paths (widget-config, cart-rules).
 * Survives across requests in warm serverless instances; safe to miss on cold start.
 */

type CacheEntry = { body: string; expiresAt: number };

const store = new Map<string, CacheEntry>();

const MAX_ENTRIES = 500;

function pruneIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
    if (store.size <= MAX_ENTRIES * 0.8) break;
  }
  if (store.size > MAX_ENTRIES) {
    const keys = [...store.keys()].slice(0, store.size - MAX_ENTRIES);
    for (const k of keys) store.delete(k);
  }
}

export function getMemoryCachedJson(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.body;
}

export function setMemoryCachedJson(
  key: string,
  body: string,
  ttlMs: number,
): void {
  pruneIfNeeded();
  store.set(key, { body, expiresAt: Date.now() + Math.max(1, ttlMs) });
}

export function invalidateMemoryCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
