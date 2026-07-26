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
 * Prefer `await syncVolumeDiscountShopToShopify` on offer save so discounts update
 * before the admin sees success — this helper remains for delete/bulk/cron paths.
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
    const { errors } = await syncVolumeDiscountShopToShopify(
      admin,
      shop,
      options,
    );
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
 * Flush storefront cache + push Automatic Discount / metafields to Shopify now.
 * Used on offer save so merchants do not need a manual Sync button.
 */
export async function syncVolumeDiscountShopToShopify(
  admin: AdminGraphql,
  shop: string,
  options: SyncShopOptions = {},
): Promise<{ errors: string[] }> {
  invalidateMemoryCachePrefix(`widget:${shop}:`);
  invalidateMemoryCachePrefix(`cart-rules:${shop}:`);
  const flush = await flushStorefrontWidgetPayloadNow(admin, shop);
  if (flush.errors.length) {
    console.error(
      "[volume-discount] flushStorefrontWidgetPayloadNow",
      shop,
      flush.errors.join("; "),
    );
  }
  const { errors } = await syncVolumeDiscountShop(admin, shop, options);
  return { errors: [...flush.errors, ...errors] };
}

/**
 * Lightweight storefront metafield refresh without blocking the save response.
 * Uses DB→cache flush so widget updates without a linked automatic discount.
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
