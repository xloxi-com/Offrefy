import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  recordCheckoutCompletedFromPixel,
  recordStorefrontAnalyticsEvents,
  type PixelCheckoutCompletedPayload,
  type StorefrontAnalyticsEventInput,
} from "../utils/volumeDiscountAnalytics.server";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

function withCors(headers: Record<string, string> = jsonHeaders) {
  return { ...headers, ...corsHeaders };
}

function resolveShop(
  sessionShop: string | undefined,
  request: Request,
): string {
  const url = new URL(request.url);
  return (
    sessionShop ??
    url.searchParams.get("shop") ??
    request.headers.get("x-shopify-shop-domain") ??
    ""
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCors() });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: withCors(),
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      service: "volume-discount-analytics",
      usage: "POST JSON { events: [...] } or { checkoutCompleted: true, checkout: {...} }",
    }),
    { status: 200, headers: withCors({ ...jsonHeaders, "Cache-Control": "private, max-age=60" }) },
  );
};

async function parseAnalyticsBody(
  request: Request,
): Promise<{
  events?: StorefrontAnalyticsEventInput[];
  checkoutCompleted?: boolean;
  checkout?: PixelCheckoutCompletedPayload["checkout"];
}> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as {
      events?: StorefrontAnalyticsEventInput[];
      checkoutCompleted?: boolean;
      checkout?: PixelCheckoutCompletedPayload["checkout"];
    };
  } catch {
    return {};
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCors() });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: withCors(),
    });
  }

  let session: Awaited<
    ReturnType<typeof authenticate.public.appProxy>
  >["session"] | undefined;

  try {
    ({ session } = await authenticate.public.appProxy(request));
  } catch (e) {
    console.warn("[volume-discount] analytics app proxy auth failed, trying fallback", e);
  }

  const shop = resolveShop(session?.shop, request);
  if (!shop) {
    return new Response(JSON.stringify({ ok: false, error: "Missing shop" }), {
      status: 400,
      headers: withCors(),
    });
  }

  let body: {
    events?: StorefrontAnalyticsEventInput[];
    checkoutCompleted?: boolean;
    checkout?: PixelCheckoutCompletedPayload["checkout"];
  };
  try {
    body = await parseAnalyticsBody(request);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: withCors(),
    });
  }

  let recorded = 0;

  if (body.checkoutCompleted && body.checkout) {
    try {
      recorded += await recordCheckoutCompletedFromPixel(shop, {
        checkout: body.checkout,
      });
    } catch (e) {
      console.error("[volume-discount] checkout pixel analytics", e);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to record checkout analytics" }),
        { status: 500, headers: withCors() },
      );
    }
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
  if (!events.length) {
    return new Response(JSON.stringify({ ok: true, recorded }), {
      status: 200,
      headers: withCors(),
    });
  }

  try {
    recorded += await recordStorefrontAnalyticsEvents(shop, events);
    return new Response(JSON.stringify({ ok: true, recorded }), {
      status: 200,
      headers: withCors(),
    });
  } catch (e) {
    console.error("[volume-discount] analytics", e);
    return new Response(JSON.stringify({ ok: false, error: "Failed to record analytics" }), {
      status: 500,
      headers: withCors(),
    });
  }
};

export default function VolumeDiscountAnalyticsRoute() {
  return null;
}
