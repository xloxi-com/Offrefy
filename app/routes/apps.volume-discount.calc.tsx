import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { prisma } from "../db.server";
import { authenticate } from "../shopify.server";
import {
  computeUnlimitedDiscountPreview,
  type DiscountEngineCalcRequest,
} from "../utils/unlimitedDiscountEngineCalc.server";

/**
 * App proxy: POST /apps/volume-discount/calc
 * Runtime discount preview for cart drawer (no automatic discount activation, no draft orders).
 *
 * Body JSON: { items: [{ product_id, variant_id, quantity, line_subtotal_cents }], ... }
 * Optional: customer_logged_in, customer_tags
 *
 * With `shopify.app.toml` subpath `volume-discount`, this is the full storefront path.
 * (A literal `/apps/discount-engine/calc` URL would require a different app proxy subpath.)
 */
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      service: "discount-engine-calc",
      usage: "POST JSON with items[].product_id, variant_id, quantity, line_subtotal_cents",
    }),
    { status: 200, headers: { ...jsonHeaders, "Cache-Control": "private, max-age=60" } },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  let session: Awaited<
    ReturnType<typeof authenticate.public.appProxy>
  >["session"];

  try {
    ({ session } = await authenticate.public.appProxy(request));
  } catch (e) {
    console.warn("[volume-discount] calc app proxy auth failed", e);
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const shop =
    session?.shop ?? new URL(request.url).searchParams.get("shop") ?? "";
  if (!shop) {
    return new Response(JSON.stringify({ ok: false, error: "Missing shop" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  let body: DiscountEngineCalcRequest;
  try {
    body = (await request.json()) as DiscountEngineCalcRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const campaigns = await prisma.volumeDiscountCampaign.findMany({
    where: { shop, status: "active" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      campaignName: true,
      displayName: true,
      productScope: true,
      quantityCondition: true,
      customerType: true,
      customerTags: true,
      productIds: true,
      tiers: true,
      widgetDisplay: true,
      status: true,
      createdAt: true,
    },
  });

  try {
    const result = computeUnlimitedDiscountPreview(campaigns, body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "calc error";
    console.error("[volume-discount] calc", e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
};

export default function VolumeDiscountCalcRoute() {
  return null;
}
