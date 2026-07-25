import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
import type { SyncShopOptions } from "./volumeDiscountFunctionSync.server";
import { syncVolumeDiscountShop } from "./volumeDiscountFunctionSync.server";
import {
  flushStorefrontWidgetPayloadNow,
  refreshStorefrontWidgetForShop,
} from "./refreshStorefrontWidget.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Per-shop chain so rapid saves still run every sync in order. */
const shopWorkTail = new Map<string, Promise<void>>();

export function runAfterResponse(promise: Promise<unknown>): void {
  void import("@vercel/functions")
    .then((mod) => {
      if (typeof mod.waitUntil === "function") {
        mod.waitUntil(promise);
        return;
      }
      void promise;
    })
    .catch(() => {
      void promise;
    });
}

function enqueueShopWork(shop: string, work: () => Promise<void>): void {
  const prev = shopWorkTail.get(shop) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(work)
    .catch((e) => {
      console.error("[volume-discount] deferred shop work failed", shop, e);
    });
  shopWorkTail.set(shop, next);
  runAfterResponse(next);
}

/**
 * Run Shopify discount + storefront sync after the HTTP response (Vercel `waitUntil`).
 * Returns immediately so campaign save actions respond after the DB write only.
 *
 * Always flushes the storefront widget cache first so product-page tiers update
 * without needing a manual Sync all — even if the slower Function sync fails later.
 */
export function scheduleVolumeDiscountShopSync(
  admin: AdminGraphql,
  shop: string,
  options: SyncShopOptions = {},
): void {
  /* Drop hot proxy caches immediately so next hits rebuild after DB changes. */
  invalidateMemoryCachePrefix(`widget:${shop}:`);
  invalidateMemoryCachePrefix(`cart-rules:${shop}:`);
  enqueueShopWork(shop, async () => {
    const flush = await flushStorefrontWidgetPayloadNow(admin, shop);
    if (flush.errors.length) {
      console.error(
        "[volume-discount] deferred flushStorefrontWidgetPayloadNow",
        shop,
        flush.errors.join("; "),
      );
    }
    const { errors } = await syncVolumeDiscountShop(admin, shop, options);
    if (errors.length) {
      console.error(
        "[volume-discount] deferred syncVolumeDiscountShop",
        shop,
        errors.join("; "),
      );
    }
  });
}

/**
 * Lightweight storefront metafield refresh without blocking the save response.
 * Uses DB→cache flush so widget updates without Sync all (does not require a
 * linked automatic discount the way the older metafield-read path did).
 */
export function scheduleStorefrontWidgetRefresh(
  admin: AdminGraphql,
  shop: string,
): void {
  invalidateMemoryCachePrefix(`widget:${shop}:`);
  enqueueShopWork(shop, async () => {
    const flush = await flushStorefrontWidgetPayloadNow(admin, shop);
    if (flush.errors.length) {
      console.warn(
        "[volume-discount] flushStorefrontWidgetPayloadNow failed, falling back",
        shop,
        flush.errors.join("; "),
      );
      const { errors } = await refreshStorefrontWidgetForShop(admin, shop);
      if (errors.length) {
        console.error(
          "[volume-discount] deferred refreshStorefrontWidget",
          shop,
          errors.join("; "),
        );
      }
    }
  });
}
