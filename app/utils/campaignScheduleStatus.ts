/**
 * Campaign lifecycle from optional schedule window
 * (`countdownStartsAt` / `countdownEndsAt`).
 *
 * - Before start → scheduled (waiting to go live)
 * - After end → draft
 * - Inside window (or no blocking schedule) → honor merchant requested status
 */
export type CampaignLifecycleStatus = "draft" | "active" | "scheduled";

export function resolveCampaignStatusFromSchedule(opts: {
  requestedStatus: "draft" | "active";
  startsAt: Date | null;
  endsAt: Date | null;
  now?: Date;
}): CampaignLifecycleStatus {
  const nowMs = (opts.now ?? new Date()).getTime();
  if (opts.endsAt && nowMs >= opts.endsAt.getTime()) {
    return "draft";
  }
  if (opts.startsAt && nowMs < opts.startsAt.getTime()) {
    return opts.requestedStatus === "draft" ? "draft" : "scheduled";
  }
  return opts.requestedStatus;
}

/** True when start is in the future (waiting to go live). */
export function isCampaignSchedulePendingStart(
  startsAt: Date | null,
  now: Date = new Date(),
): boolean {
  return Boolean(startsAt && now.getTime() < startsAt.getTime());
}

/** True when end has passed. */
export function isCampaignScheduleExpired(
  endsAt: Date | null,
  now: Date = new Date(),
): boolean {
  return Boolean(endsAt && now.getTime() >= endsAt.getTime());
}

export function isCampaignLiveStatus(status: string): boolean {
  return String(status).toLowerCase() === "active";
}
