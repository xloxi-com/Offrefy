/** Parse Settings → Sync Interval values into milliseconds. */
export function syncIntervalToMs(interval: string): number | null {
  switch (interval) {
    case "5m":
      return 5 * 60 * 1000;
    case "15m":
      return 15 * 60 * 1000;
    case "30m":
      return 30 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "6h":
      return 6 * 60 * 60 * 1000;
    case "12h":
      return 12 * 60 * 60 * 1000;
    case "24h":
      return 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export function isScheduledSyncDue(
  syncInterval: string,
  lastSyncedAt: Date | null,
  now = Date.now(),
): boolean {
  const intervalMs = syncIntervalToMs(syncInterval);
  if (!intervalMs) return false;
  if (!lastSyncedAt) return true;
  return now - lastSyncedAt.getTime() >= intervalMs;
}
