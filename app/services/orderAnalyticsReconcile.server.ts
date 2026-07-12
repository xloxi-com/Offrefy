import { prisma } from "../db.server";
import { unauthenticated } from "../shopify.server";
import { reconcileRecentPaidOrders } from "../utils/volumeDiscountAnalytics.server";
import { runAfterResponse } from "./deferredShopSync.server";

const ORDER_RECONCILE_MIN_INTERVAL_MS = 15 * 1000;
const lastReconcileAtByShop = new Map<string, number>();
const reconcileInFlight = new Set<string>();

async function listInstalledShops(): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.session.findMany({
    where: {
      isOnline: false,
      OR: [{ expires: null }, { expires: { gt: now } }],
    },
    select: { shop: true },
    distinct: ["shop"],
  });
  return rows.map((row) => row.shop);
}

export async function reconcileOrderAnalyticsForShop(
  shop: string,
  options?: { force?: boolean },
): Promise<number> {
  if (reconcileInFlight.has(shop)) return 0;

  const now = Date.now();
  const lastRun = lastReconcileAtByShop.get(shop) ?? 0;
  if (!options?.force && now - lastRun < ORDER_RECONCILE_MIN_INTERVAL_MS) {
    return 0;
  }

  reconcileInFlight.add(shop);
  try {
    const { admin } = await unauthenticated.admin(shop);
    const { recorded } = await reconcileRecentPaidOrders(shop, admin);
    lastReconcileAtByShop.set(shop, now);
    return recorded;
  } catch (e) {
    console.warn("[volume-discount] reconcileOrderAnalyticsForShop", shop, e);
    return 0;
  } finally {
    reconcileInFlight.delete(shop);
  }
}

export async function reconcileOrderAnalyticsForAllShops(): Promise<{
  shops: number;
  recorded: number;
}> {
  const shops = await listInstalledShops();
  let recorded = 0;

  for (const shop of shops) {
    recorded += await reconcileOrderAnalyticsForShop(shop);
  }

  return { shops: shops.length, recorded };
}

export function enqueueOrderAnalyticsReconcileForAllShops(): void {
  runAfterResponse(
    reconcileOrderAnalyticsForAllShops().then((result) => {
      if (result.recorded > 0) {
        console.log("[volume-discount] order analytics reconcile", result);
      }
    }),
  );
}
