import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { lookupDiscountRulesForProducts } from "../utils/discountRules.server";
import { cachedJsonResponse } from "../utils/httpCache.server";
import {
  getMemoryCachedJson,
  setMemoryCachedJson,
} from "../utils/memoryCache.server";
import { compactTranslationsForDiscountFunction } from "../utils/storefrontTranslations";
import { loadStorefrontTranslationsForShop } from "../utils/storefrontTranslations.server";

/**
 * App proxy: POST /apps/volume-discount/cart-rules
 * Returns discount rules for specific cart product ids only (not the full 1000+ catalog).
 * Used when metafield storage exceeds shard limits and the Function uses network access.
 */
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }
  return new Response(JSON.stringify({ ok: true, hint: "POST product_ids[]" }), {
    status: 200,
    headers: jsonHeaders,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  let session: { shop?: string } | undefined;
  try {
    ({ session } = await authenticate.public.appProxy(request));
  } catch (e) {
    console.warn("[volume-discount] cart-rules app proxy auth failed, trying fallback", e);
  }

  const shop =
    session?.shop ??
    new URL(request.url).searchParams.get("shop") ??
    request.headers.get("x-shopify-shop-domain") ??
    "";
  if (!shop) {
    return new Response(JSON.stringify({ ok: false, rules: {} }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  let body: { product_ids?: unknown };
  try {
    body = (await request.json()) as { product_ids?: unknown };
  } catch {
    return new Response(JSON.stringify({ ok: false, rules: {} }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const productIds = Array.isArray(body.product_ids)
    ? [...new Set(body.product_ids.map(String).filter(Boolean))].slice(0, 500)
    : [];

  if (productIds.length === 0) {
    return cachedJsonResponse(JSON.stringify({ ok: true, rules: {} }), {
      request,
      maxAge: 30,
      staleWhileRevalidate: 120,
    });
  }

  const sortedIds = [...productIds].sort().join(",");
  const memKey = `cart-rules:${shop}:${sortedIds}`;
  const memHit = getMemoryCachedJson(memKey);
  if (memHit) {
    return cachedJsonResponse(memHit, {
      request,
      maxAge: 30,
      staleWhileRevalidate: 120,
    });
  }

  const [rules, storefrontTranslations] = await Promise.all([
    lookupDiscountRulesForProducts(shop, productIds, {
      maxProducts: productIds.length,
    }),
    loadStorefrontTranslationsForShop(shop)
      .then((translations) =>
        compactTranslationsForDiscountFunction(translations),
      )
      .catch((e) => {
        console.warn("[volume-discount] cart-rules translations load failed", e);
        return {};
      }),
  ]);
  const responseJson = JSON.stringify({ ok: true, rules, storefrontTranslations });

  setMemoryCachedJson(memKey, responseJson, 30_000);

  return cachedJsonResponse(responseJson, {
    request,
    maxAge: 30,
    staleWhileRevalidate: 120,
  });
};

export default function VolumeDiscountCartRulesRoute() {
  return null;
}
