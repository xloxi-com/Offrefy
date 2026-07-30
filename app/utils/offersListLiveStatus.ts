/**
 * Client-side schedule status for the Offers table so Scheduled → Active
 * (and Active → Draft) flips immediately when the window opens/closes,
 * without waiting for a loader round-trip.
 */
export function resolveOffersListDisplayStatus(
  row: {
    status: string;
    countdownStartsAt?: string | null;
    countdownEndsAt?: string | null;
  },
  nowMs: number = Date.now(),
): string {
  const stored = String(row.status ?? "");
  const status = stored.toLowerCase();
  const startsAt = row.countdownStartsAt
    ? Date.parse(row.countdownStartsAt)
    : Number.NaN;
  const endsAt = row.countdownEndsAt
    ? Date.parse(row.countdownEndsAt)
    : Number.NaN;

  if (
    Number.isFinite(endsAt) &&
    nowMs >= endsAt &&
    (status === "active" || status === "scheduled")
  ) {
    return "draft";
  }

  if (
    status === "scheduled" &&
    Number.isFinite(startsAt) &&
    nowMs >= startsAt
  ) {
    return "active";
  }

  return stored;
}
