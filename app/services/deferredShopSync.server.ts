import type { SyncShopOptions } from "./volumeDiscountFunctionSync.server";
import { syncVolumeDiscountShop } from "./volumeDiscountFunctionSync.server";
import { refreshStorefrontWidgetForShop } from "./refreshStorefrontWidget.server";

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
 */
export function scheduleVolumeDiscountShopSync(
  admin: AdminGraphql,
  shop: string,
  options: SyncShopOptions = {},
): void {
  enqueueShopWork(shop, async () => {
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

/** Lightweight storefront metafield refresh without blocking the save response. */
export function scheduleStorefrontWidgetRefresh(
  admin: AdminGraphql,
  shop: string,
): void {
  enqueueShopWork(shop, async () => {
    const { errors } = await refreshStorefrontWidgetForShop(admin, shop);
    if (errors.length) {
      console.error(
        "[volume-discount] deferred refreshStorefrontWidget",
        shop,
        errors.join("; "),
      );
    }
  });
}
