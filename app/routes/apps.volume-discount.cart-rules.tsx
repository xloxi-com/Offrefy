import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { lookupDiscountRulesForProducts } from "../utils/discountRules.server";
import { cachedJsonResponse } from "../utils/httpCache.server";

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
    console.warn("[volume-discount] cart-rules app proxy auth failed", e);
    return new Response(JSON.stringify({ ok: false, rules: {} }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const shop =
    session?.shop ?? new URL(request.url).searchParams.get("shop") ?? "";
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
    ? body.product_ids.map(String)
    : [];

  if (productIds.length === 0) {
    return cachedJsonResponse(JSON.stringify({ ok: true, rules: {} }), {
      request,
      maxAge: 30,
      staleWhileRevalidate: 120,
    });
  }

  const rules = await lookupDiscountRulesForProducts(shop, productIds);
  const responseJson = JSON.stringify({ ok: true, rules });

  return cachedJsonResponse(responseJson, {
    request,
    maxAge: 30,
    staleWhileRevalidate: 120,
  });
};

export default function VolumeDiscountCartRulesRoute() {
  return null;
}
