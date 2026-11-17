import { useAppBridge } from "@shopify/app-bridge-react";
import { lazy, Suspense, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

const BogoCreateView = lazy(() =>
  import("../components/BogoCreateView").then((m) => ({
    default: m.BogoCreateView,
  })),
);
import { syncBogoCampaignToShopify } from "../services/bogoBxgySync.server";
import { flushStorefrontWidgetPayloadNow } from "../services/refreshStorefrontWidget.server";
import { authenticate } from "../shopify.server";
import {
  canActivateAnotherCampaign,
  canCreateAnotherOffer,
  createOfferBlockedMessage,
} from "../utils/pricingPlans";
import {
  countActiveCampaigns,
  countAllCampaigns,
  resolveShopPlanContext,
} from "../utils/shopPlan.server";
import { parseBogoForm } from "../utils/bogoForm.server";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import { bogoCampaignDb } from "../utils/bogoPrisma.server";
import { resolveShopIanaTimezone } from "../utils/shopTimezone.server";
import { activationBlockedMessage } from "../utils/volumeDiscountForm.server";

type NewOfferNavigationState = {
  defaultCampaignName?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [{ plan }, shopTimezone] = await Promise.all([
    resolveShopPlanContext(session.shop),
    resolveShopIanaTimezone(admin, session.shop),
  ]);
  return { plan, shopTimezone };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  if (String(form.get("intent") ?? "") === "autoTranslateCampaign") {
    const { runCampaignAutoTranslateFromForm } = await import(
      "../utils/storefrontTranslations.server"
    );
    return runCampaignAutoTranslateFromForm(session.shop, form);
  }
  const parsed = parseBogoForm(form);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error };
  }

  const [{ plan }, offerCount] = await Promise.all([
    resolveShopPlanContext(session.shop),
    countAllCampaigns(session.shop),
  ]);
  if (!canCreateAnotherOffer(plan, offerCount)) {
    return {
      ok: false as const,
      error: createOfferBlockedMessage(plan),
    };
  }

  const d = parsed.data;
  if (d.status === "active") {
    const activeCount = await countActiveCampaigns(session.shop);
    if (!canActivateAnotherCampaign(plan, activeCount)) {
      return {
        ok: false as const,
        error: activationBlockedMessage(plan),
      };
    }
  }

  /*
   * Soft idempotency for double-submit: reuse a near-identical create from the
   * last 20s that already synced to Shopify (avoids duplicate BXGY ADs).
   */
  const dedupeSince = new Date(Date.now() - 20_000);
  const recent = (await bogoCampaignDb().findFirst({
    where: {
      shop: session.shop,
      campaignName: d.campaignName,
      buysQuantity: d.buysQuantity,
      getsQuantity: d.getsQuantity,
      getsValueType: d.getsValueType,
      usesPerOrderLimit: d.usesPerOrderLimit,
      createdAt: { gte: dedupeSince },
      NOT: { shopifyDiscountId: null },
    },
    orderBy: { createdAt: "desc" },
  })) as { id: string; shopifyDiscountId: string | null } | null;
  if (recent?.shopifyDiscountId) {
    return { ok: true as const, campaignId: recent.id };
  }

  const record = (await bogoCampaignDb().create({
    data: {
      shop: session.shop,
      campaignName: d.campaignName,
      displayName: d.displayName || null,
      status: d.status,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      buysRequirement: d.buysRequirement,
      buysQuantity: d.buysQuantity,
      buysAmount: d.buysAmount,
      buysScope: d.buysScope,
      buysProductIds: d.buysProductIds,
      buysCollectionIds: d.buysCollectionIds,
      getsQuantity: d.getsQuantity,
      getsScope: d.getsScope,
      getsProductIds: d.getsProductIds,
      getsCollectionIds: d.getsCollectionIds,
      getsValueType: d.getsValueType,
      getsValue: d.getsValue,
      usesPerOrderLimit: d.usesPerOrderLimit,
      widgetDisplay: d.widgetDisplay,
      displayNameTranslations: d.displayNameTranslations,
      combinesWithProductDiscounts: d.combinesWithProductDiscounts,
      combinesWithOrderDiscounts: d.combinesWithOrderDiscounts,
      combinesWithShippingDiscounts: d.combinesWithShippingDiscounts,
      shopifyDiscountId: null,
    },
  })) as { id: string };

  if (d.status === "active" || d.status === "scheduled") {
    const { errors } = await syncBogoCampaignToShopify(
      admin,
      session.shop,
      record.id,
    );
    if (errors.length) {
      return {
        ok: false as const,
        error: `Offer saved as draft, but Shopify BXGY failed: ${errors.join(" ")}`,
      };
    }
  }

  await flushStorefrontWidgetPayloadNow(admin, session.shop).catch((e) => {
    console.warn("[bogo] storefront widget flush after create", e);
  });

  return { ok: true as const, campaignId: record.id };
};

export default function BogoNewRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const { shopTimezone } = useLoaderData<typeof loader>();
  const navState = location.state as NewOfferNavigationState | null;
  const { search } = location;
  const defaultCampaignName =
    navState?.defaultCampaignName?.trim() || "BOGO offer";

  const onSuccess = useCallback(() => {
    shopify.toast.show("BOGO offer saved");
    navigate(adminEmbeddedPath("/app/offers", search));
  }, [navigate, search, shopify]);

  return (
    <Suspense fallback={null}>
      <BogoCreateView
        onBack={() => navigate(adminEmbeddedPath("/app/offers", search))}
        onSuccess={onSuccess}
        defaultCampaignName={defaultCampaignName}
        shopTimezone={shopTimezone}
      />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
