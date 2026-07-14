import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { prisma } from "../db.server";
import { lookupDiscountRulesForProducts } from "../utils/discountRules.server";
import { authenticate } from "../shopify.server";
import type { DiscountEngineCalcRequest } from "../utils/unlimitedDiscountEngineCalc.server";
import {
  computeUnlimitedDiscountPreview,
  type DiscountEngineCampaignRow,
} from "../utils/unlimitedDiscountEngineCalc.server";

const CALC_CAMPAIGN_SELECT = {
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
} as const;

/** Load only campaigns that can apply to cart lines (via DiscountRule), not every active row. */
async function loadCampaignsForCalc(
  shop: string,
  body: DiscountEngineCalcRequest,
): Promise<DiscountEngineCampaignRow[]> {
  const productIds = (body.items ?? []).map((i) => String(i.product_id ?? ""));
  if (!productIds.length) {
    return prisma.volumeDiscountCampaign.findMany({
      where: { shop, status: "active" },
      orderBy: { createdAt: "asc" },
      select: CALC_CAMPAIGN_SELECT,
    });
  }

  const rules = await lookupDiscountRulesForProducts(shop, productIds);
  const campaignIds = [
    ...new Set(
      Object.values(rules)
        .map((r) => r.campaignId)
        .filter(Boolean),
    ),
  ];

  if (!campaignIds.length) {
    return [];
  }

  return prisma.volumeDiscountCampaign.findMany({
    where: { shop, status: "active", id: { in: campaignIds } },
    orderBy: { createdAt: "asc" },
    select: CALC_CAMPAIGN_SELECT,
  });
}

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
  >["session"] | undefined;

  try {
    ({ session } = await authenticate.public.appProxy(request));
  } catch (e) {
    console.warn("[volume-discount] calc app proxy auth failed, trying fallback", e);
  }

  const shop =
    session?.shop ??
    new URL(request.url).searchParams.get("shop") ??
    request.headers.get("x-shopify-shop-domain") ??
    "";
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

  const campaigns = await loadCampaignsForCalc(shop, body);

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
