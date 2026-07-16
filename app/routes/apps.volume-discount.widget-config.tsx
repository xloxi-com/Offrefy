import type { LoaderFunctionArgs } from "react-router";

import { prisma } from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  readStorefrontPayloadForServe,
  rebuildAndPersistStorefrontPayload,
  scheduleStorefrontPayloadRevalidation,
  STOREFRONT_EMPTY_PAYLOAD,
  upsertEmptyStorefrontPayload,
} from "../services/volumeDiscountStorefrontCache.server";
import { cachedJsonResponse } from "../utils/httpCache.server";
import { volumeDiscountCampaignSyncSelect } from "../utils/volumeDiscountCampaignSelect.server";
import {
  buildStorefrontWidgetForProduct,
  stampStorefrontWidgetRev,
} from "../utils/storefrontWidgetConfig.server";

/**
 * App Proxy: GET /apps/volume-discount/widget-config
 * Optional `product_id` + `variant_id` — returns one campaign for that product (large catalogs).
 * Without those params, returns full cached payload (small catalogs / legacy).
 */
const STOREFRONT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type, If-None-Match",
};

/** Freshness first: browsers revalidate every time; ETag keeps unchanged offers fast (304). */
const FRESH_JSON = {
  maxAge: 0,
  mustRevalidate: true,
  publicCache: true,
  staleWhileRevalidate: 0,
} as const;

function emptyJson(request: Request) {
  return cachedJsonResponse(STOREFRONT_EMPTY_PAYLOAD, {
    request,
    ...FRESH_JSON,
    extraHeaders: STOREFRONT_CORS_HEADERS,
  });
}

function jsonBody(
  request: Request,
  body: string,
  revHint?: string | number | null,
) {
  const stamped = stampStorefrontWidgetRev(body, revHint);
  return cachedJsonResponse(stamped, {
    request,
    ...FRESH_JSON,
    extraHeaders: STOREFRONT_CORS_HEADERS,
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: STOREFRONT_CORS_HEADERS });
  }
  let admin: Awaited<
    ReturnType<typeof authenticate.public.appProxy>
  >["admin"] | undefined;
  let session: Awaited<
    ReturnType<typeof authenticate.public.appProxy>
  >["session"] | undefined;

  try {
    ({ admin, session } = await authenticate.public.appProxy(request));
  } catch (e) {
    console.warn("[volume-discount] widget-config app proxy auth failed, trying fallback", e);
  }

  const url = new URL(request.url);
  const shop =
    session?.shop ??
    url.searchParams.get("shop") ??
    request.headers.get("x-shopify-shop-domain") ??
    "";
  if (!shop) {
    return emptyJson(request);
  }

  if (!admin) {
    try {
      ({ admin } = await unauthenticated.admin(shop));
    } catch (e) {
      console.warn(
        "[volume-discount] widget-config offline admin fallback failed",
        shop,
        e,
      );
    }
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
      return jsonBody(request, value);
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
    return jsonBody(
      request,
      cached.body,
      cached.updatedAt ? cached.updatedAt.getTime() : null,
    );
  }

  if (!admin) {
    return emptyJson(request);
  }

  try {
    /* One query instead of count + findMany on cold cache (same branches, fewer round-trips). */
    const rows = await prisma.volumeDiscountCampaign.findMany({
      where: { shop, status: "active" },
      orderBy: { createdAt: "asc" },
      select: volumeDiscountCampaignSyncSelect,
    });

    if (rows.length === 0) {
      await upsertEmptyStorefrontPayload(shop);
      return emptyJson(request);
    }

    const value = await rebuildAndPersistStorefrontPayload(shop, rows, admin);
    return jsonBody(request, value);
  } catch (e) {
    console.error("[volume-discount] widget-config", e);
    return cachedJsonResponse(STOREFRONT_EMPTY_PAYLOAD, {
      request,
      ...FRESH_JSON,
      extraHeaders: STOREFRONT_CORS_HEADERS,
    });
  }
};

export default function VolumeDiscountWidgetConfigRoute() {
  return null;
}
