import { prisma } from "../db.server";
import { unauthenticated } from "../shopify.server";
import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
import { isScheduledSyncDue } from "../utils/syncIntervalMs.server";
import { runAfterResponse } from "./deferredShopSync.server";
import {
  enqueueOrderAnalyticsReconcileForAllShops,
  reconcileOrderAnalyticsForShop,
} from "./orderAnalyticsReconcile.server";
import { refreshStorefrontWidgetForShop } from "./refreshStorefrontWidget.server";
import { syncVolumeDiscountShop } from "./volumeDiscountFunctionSync.server";
import { touchShopLastSyncedAt } from "../utils/shopSyncState.server";
type ShopSyncRow = {
  shop: string;
  syncInterval: string;
  lastSyncedAt: Date | null;
};

const shopSyncInFlight = new Map<string, Promise<void>>();
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

export async function runScheduledSyncForShop(shop: string): Promise<string[]> {
  const errors: string[] = [];
  try {
    const { admin } = await unauthenticated.admin(shop);
    const syncResult = await syncVolumeDiscountShop(admin, shop, {
      purgeLegacy: true,
    });
    if (syncResult.errors.length) {
      errors.push(...syncResult.errors);
    } else {
      invalidateMemoryCachePrefix(`widget:${shop}:`);
      invalidateMemoryCachePrefix(`cart-rules:${shop}:`);

      const refreshResult = await refreshStorefrontWidgetForShop(admin, shop);
      if (refreshResult.errors.length) {
        errors.push(...refreshResult.errors);
      }
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

function enqueueScheduledSyncForShop(shop: string): void {
  if (shopSyncInFlight.has(shop)) return;

  const work = runScheduledSyncForShop(shop)
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
    });

  shopSyncInFlight.set(shop, work);
  runAfterResponse(work);
}

export async function runDueScheduledSyncs(): Promise<{
  checked: number;
  triggered: number;
  shops: string[];
}> {
  const rows = await listShopsWithScheduledSync();
  const dueShops: string[] = [];

  for (const row of rows) {
    if (!isScheduledSyncDue(row.syncInterval, row.lastSyncedAt)) continue;
    dueShops.push(row.shop);
    enqueueScheduledSyncForShop(row.shop);
  }

  return {
    checked: rows.length,
    triggered: dueShops.length,
    shops: dueShops,
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
  setInterval(tick, 60_000);
}
