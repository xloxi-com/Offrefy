import { unauthenticated } from "../shopify.server";
import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
import { isScheduledSyncDue } from "../utils/syncIntervalMs.server";
import { prisma } from "../db.server";
import { runAfterResponse } from "./deferredShopSync.server";
import {
  applyDueCampaignScheduleTransitions,
} from "./campaignScheduleTransitions.server";
import {
  enqueueOrderAnalyticsReconcileForAllShops,
  reconcileOrderAnalyticsForShop,
} from "./orderAnalyticsReconcile.server";
import { syncVolumeDiscountShop } from "./volumeDiscountFunctionSync.server";
import { touchShopLastSyncedAt } from "../utils/shopSyncState.server";
import { discountSyncCampaignWhere } from "../utils/campaignScheduleStatus";

export {
  applyDueCampaignScheduleTransitions,
} from "./campaignScheduleTransitions.server";

type ShopSyncRow = {
  shop: string;
  syncInterval: string;
  lastSyncedAt: Date | null;
};

const shopSyncInFlight = new Map<string, Promise<void>>();
/** If a sync is requested while one is running, run again after (schedule flips). */
const shopSyncNeedsFollowUp = new Map<string, { force?: boolean }>();
let localTickerStarted = false;

async function listShopsWithScheduledSync(): Promise<ShopSyncRow[]> {
  return prisma.$queryRaw<ShopSyncRow[]>`
    SELECT
      s."shop",
      s."syncInterval",
      s."lastSyncedAt"
    FROM "VolumeDiscountSettings" s
    WHERE s."syncInterval" <> 'disabled'
  `;
}

/** Apply schedule transitions for one shop and queue Shopify sync when Active membership flips. */
export function applyShopCampaignScheduleTransitionsIfNeeded(
  shop: string,
): void {
  void (async () => {
    const result = await applyDueCampaignScheduleTransitions(shop);
    if (result.shopsNeedingShopifySync.length) {
      enqueueScheduledSyncForShop(shop, { force: true });
      return;
    }
    /*
     * Recover stale Shopify AD: Offrefy already Draft/empty but Automatic Discount
     * still Active (previous sync dropped while in-flight).
     */
    const [liveCount, state] = await Promise.all([
      prisma.volumeDiscountCampaign.count({
        where: discountSyncCampaignWhere(shop),
      }),
      prisma.volumeDiscountShopState.findUnique({
        where: { shop },
        select: { functionDiscountId: true },
      }),
    ]);
    if (liveCount === 0 && state?.functionDiscountId) {
      enqueueScheduledSyncForShop(shop, { force: true });
    }
  })().catch((e) => {
    console.error("[volume-discount] schedule transitions", shop, e);
  });
}

export async function runScheduledSyncForShop(
  shop: string,
  opts?: { force?: boolean },
): Promise<string[]> {
  const errors: string[] = [];
  try {
    /* Flip Scheduled→Active / Active→Draft before building Shopify payload. */
    await applyDueCampaignScheduleTransitions(shop);

    const { admin } = await unauthenticated.admin(shop);
    const syncResult = await syncVolumeDiscountShop(admin, shop, {
      purgeLegacy: true,
      skipScheduleTransitions: true,
      force: opts?.force === true,
    });
    if (syncResult.errors.length) {
      errors.push(...syncResult.errors);
    } else {
      invalidateMemoryCachePrefix(`widget:${shop}:`);
      invalidateMemoryCachePrefix(`cart-rules:${shop}:`);
      /* syncVolumeDiscountShop already writes the storefront widget payload. */
    }

    await reconcileOrderAnalyticsForShop(shop, { force: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    console.error("[volume-discount] scheduled sync failed", shop, e);
  } finally {
    await touchShopLastSyncedAt(shop).catch((e) => {
      console.warn("[volume-discount] touchShopLastSyncedAt", shop, e);
    });
  }
  return errors;
}

function enqueueScheduledSyncForShop(
  shop: string,
  opts?: { force?: boolean },
): void {
  if (shopSyncInFlight.has(shop)) {
    // Do not drop schedule start/end syncs — chain a follow-up after the current run.
    const prev = shopSyncNeedsFollowUp.get(shop);
    shopSyncNeedsFollowUp.set(shop, {
      force: Boolean(prev?.force || opts?.force),
    });
    return;
  }

  const work = runScheduledSyncForShop(shop, opts)
    .then((errors) => {
      if (errors.length) {
        console.error(
          "[volume-discount] scheduled sync",
          shop,
          errors.join("; "),
        );
      } else {
        console.log("[volume-discount] scheduled sync completed", shop);
      }
    })
    .finally(() => {
      shopSyncInFlight.delete(shop);
      const followUp = shopSyncNeedsFollowUp.get(shop);
      if (followUp) {
        shopSyncNeedsFollowUp.delete(shop);
        enqueueScheduledSyncForShop(shop, followUp);
      }
    });

  shopSyncInFlight.set(shop, work);
  runAfterResponse(work);
}

export async function runDueScheduledSyncs(): Promise<{
  checked: number;
  triggered: number;
  shops: string[];
  scheduleTransitionShops: string[];
}> {
  const transition = await applyDueCampaignScheduleTransitions();
  const scheduleTransitionShops = transition.shopsNeedingShopifySync;
  for (const shop of scheduleTransitionShops) {
    enqueueScheduledSyncForShop(shop, { force: true });
  }

  const rows = await listShopsWithScheduledSync();
  const dueShops: string[] = [];

  for (const row of rows) {
    if (!isScheduledSyncDue(row.syncInterval, row.lastSyncedAt)) continue;
    dueShops.push(row.shop);
    enqueueScheduledSyncForShop(row.shop);
  }

  const shops = [...new Set([...dueShops, ...scheduleTransitionShops])];

  return {
    checked: rows.length,
    triggered: shops.length,
    shops,
    scheduleTransitionShops,
  };
}

/** Fire-and-forget when an admin page loads and the shop interval is overdue. */
export function scheduleDueSyncForShopIfNeeded(
  shop: string,
  syncInterval: string,
  lastSyncedAt: Date | null,
): void {
  if (!isScheduledSyncDue(syncInterval, lastSyncedAt)) return;
  enqueueScheduledSyncForShop(shop);
}

/**
 * Local dev / long-running Node: poll every minute. Vercel production uses `/api/cron/scheduled-sync`.
 */
export function ensureLocalScheduledSyncTicker(): void {
  if (localTickerStarted || process.env.VERCEL) return;
  localTickerStarted = true;

  const tick = () => {
    void runDueScheduledSyncs().catch((e) => {
      console.error("[volume-discount] scheduled sync ticker", e);
    });
    enqueueOrderAnalyticsReconcileForAllShops();
  };

  setTimeout(tick, 5_000);
  /* Poll often — short schedule windows (start/end) must flip Shopify AD quickly. */
  setInterval(tick, 10_000);
}
