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

/**
 * Campaigns that should be synced to Shopify Function / storefront widget:
 * Active, or Scheduled (rules ready before start — Shopify discount startsAt/endsAt
 * gates when the automatic discount is live; Functions cannot use Date.now()).
 * Exclude anything whose end time has already passed.
 */
export function campaignEligibleForDiscountSync(opts: {
  status: string;
  endsAt: Date | null;
  now?: Date;
}): boolean {
  const status = String(opts.status ?? "").toLowerCase();
  if (status !== "active" && status !== "scheduled") return false;
  if (isCampaignScheduleExpired(opts.endsAt, opts.now ?? new Date())) {
    return false;
  }
  return true;
}

/** Prisma `where` fragment for discount/widget sync rows. */
export function discountSyncCampaignWhere(
  shop: string,
  now: Date = new Date(),
): {
  shop: string;
  status: { in: ["active", "scheduled"] };
  OR: [{ countdownEndsAt: null }, { countdownEndsAt: { gt: Date } }];
} {
  return {
    shop,
    status: { in: ["active", "scheduled"] },
    OR: [{ countdownEndsAt: null }, { countdownEndsAt: { gt: now } }],
  };
}

/**
 * Storefront widget only — hide until Schedule start, hide after end.
 * (Discount Function may still sync Scheduled early via startsAt.)
 */
export function storefrontLiveCampaignWhere(
  shop: string,
  now: Date = new Date(),
): {
  shop: string;
  status: { in: ["active", "scheduled"] };
  AND: Array<
    | { OR: [{ countdownStartsAt: null }, { countdownStartsAt: { lte: Date } }] }
    | { OR: [{ countdownEndsAt: null }, { countdownEndsAt: { gt: Date } }] }
  >;
} {
  return {
    shop,
    status: { in: ["active", "scheduled"] },
    AND: [
      {
        OR: [
          { countdownStartsAt: null },
          { countdownStartsAt: { lte: now } },
        ],
      },
      {
        OR: [{ countdownEndsAt: null }, { countdownEndsAt: { gt: now } }],
      },
    ],
  };
}
