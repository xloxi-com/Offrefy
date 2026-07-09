import type { LoaderFunctionArgs } from "react-router";

import { prisma } from "../db.server";
import { authenticate } from "../shopify.server";
import {
  readStorefrontPayloadForServe,
  rebuildAndPersistStorefrontPayload,
  scheduleStorefrontPayloadRevalidation,
  STOREFRONT_EMPTY_PAYLOAD,
  upsertEmptyStorefrontPayload,
} from "../services/volumeDiscountStorefrontCache.server";
import { cachedJsonResponse } from "../utils/httpCache.server";
import { buildStorefrontWidgetForProduct } from "../utils/storefrontWidgetConfig.server";

/**
 * App Proxy: GET /apps/volume-discount/widget-config
 * Optional `product_id` + `variant_id` — returns one campaign for that product (large catalogs).
 * Without those params, returns full cached payload (small catalogs / legacy).
 */
function emptyJson(request: Request) {
  return cachedJsonResponse(STOREFRONT_EMPTY_PAYLOAD, {
    request,
    maxAge: 60,
    staleWhileRevalidate: 300,
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let admin: Awaited<
    ReturnType<typeof authenticate.public.appProxy>
  >["admin"];
  let session: Awaited<
    ReturnType<typeof authenticate.public.appProxy>
  >["session"];

  try {
    ({ admin, session } = await authenticate.public.appProxy(request));
  } catch (e) {
    console.warn("[volume-discount] widget-config app proxy auth failed", e);
    return emptyJson(request);
  }

  const url = new URL(request.url);
  const shop =
    session?.shop ?? url.searchParams.get("shop") ?? "";
  if (!shop) {
    return emptyJson(request);
  }

  const productId = url.searchParams.get("product_id")?.trim() ?? "";
  const variantId = url.searchParams.get("variant_id")?.trim() ?? "";

  if (productId) {
    try {
      const value = await buildStorefrontWidgetForProduct(
        shop,
        productId,
        variantId || null,
        admin ?? null,
      );
      return cachedJsonResponse(value, {
        request,
        maxAge: 120,
        staleWhileRevalidate: 600,
      });
    } catch (e) {
      console.error("[volume-discount] widget-config product", e);
      return emptyJson(request);
    }
  }

  /* Cache-first: sync writes VolumeDiscountStorefrontPayload on every save — avoid DB + Admin on hot path. */
  const cached = await readStorefrontPayloadForServe(shop);
  if (cached) {
    if (cached.stale && admin) {
      scheduleStorefrontPayloadRevalidation(shop, admin);
    }
    return cachedJsonResponse(cached.body, {
      request,
      maxAge: 60,
      staleWhileRevalidate: 300,
    });
  }

  if (!admin) {
    return emptyJson(request);
  }

  try {
    /* One query instead of count + findMany on cold cache (same branches, fewer round-trips). */
    const rows = await prisma.volumeDiscountCampaign.findMany({
      where: { shop, status: "active" },
      orderBy: { createdAt: "asc" },
    });

    if (rows.length === 0) {
      await upsertEmptyStorefrontPayload(shop);
      return emptyJson(request);
    }

    const value = await rebuildAndPersistStorefrontPayload(shop, rows, admin);
    return cachedJsonResponse(value, {
      request,
      maxAge: 60,
      staleWhileRevalidate: 300,
    });
  } catch (e) {
    console.error("[volume-discount] widget-config", e);
    return cachedJsonResponse(STOREFRONT_EMPTY_PAYLOAD, {
      request,
      maxAge: 10,
      staleWhileRevalidate: 0,
    });
  }
};

export default function VolumeDiscountWidgetConfigRoute() {
  return null;
}
