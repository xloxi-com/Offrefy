import { useAppBridge } from "@shopify/app-bridge-react";
import { lazy, Suspense, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { useLoaderData, useLocation, useNavigate, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { Prisma } from "@prisma/client";

import { IndeterminateLinearProgress } from "../components/IndeterminateLinearProgress";
import { prisma } from "../db.server";
import {
  scheduleStorefrontWidgetRefresh,
  scheduleVolumeDiscountShopSync,
} from "../services/deferredShopSync.server";
import { applyDueCampaignScheduleTransitions } from "../services/campaignScheduleTransitions.server";
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
import {
  parseVolumeDiscountForm,
  sanitizeCampaignForPlan,
  activationBlockedMessage,
} from "../utils/volumeDiscountForm.server";
import type { VolumeDiscountNewOfferPreset } from "../types/volumeDiscount";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";

const VolumeDiscountCreateView = lazy(() =>
  import("../components/VolumeDiscountCreateView").then((m) => ({
    default: m.VolumeDiscountCreateView,
  })),
);

type NewOfferNavigationState = {
  defaultCampaignName?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const presetParam = new URL(request.url).searchParams.get("preset");
  const newOfferPreset: VolumeDiscountNewOfferPreset =
    presetParam === "volume" ? "volume_table" : "quantity_breaks";
  const [{ plan, capabilities }, activeCount] = await Promise.all([
    resolveShopPlanContext(session.shop),
    countActiveCampaigns(session.shop),
  ]);
  return {
    newOfferPreset,
    plan,
    planCapabilities: capabilities,
    activeCount,
  };
};

/** React Router may skip re-running loaders when only the query string changes (same path, no dynamic params). Preset lives in `?preset=` — always revalidate on search change. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search !== nextUrl.search
  ) {
    return true;
  }
  return defaultShouldRevalidate;
}

function newOfferPresetFromSearchParam(
  presetParam: string | null,
  loaderPreset: VolumeDiscountNewOfferPreset,
): VolumeDiscountNewOfferPreset {
  if (presetParam === "volume") return "volume_table";
  if (presetParam === "quantity") return "quantity_breaks";
  return loaderPreset;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const parsed = parseVolumeDiscountForm(form);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error };
  }

  const [{ plan }, offerCount] = await Promise.all([
    resolveShopPlanContext(session.shop),
    countAllCampaigns(session.shop),
  ]);
  const d = sanitizeCampaignForPlan(parsed.data, plan);

  if (!canCreateAnotherOffer(plan, offerCount)) {
    return {
      ok: false as const,
      error: createOfferBlockedMessage(plan),
    };
  }

  if (d.campaignStatus === "active") {
    const activeCount = await countActiveCampaigns(session.shop);
    if (!canActivateAnotherCampaign(plan, activeCount)) {
      return {
        ok: false as const,
        error: activationBlockedMessage(plan),
      };
    }
  }

  const record = await prisma.volumeDiscountCampaign.create({
    data: {
      shop: session.shop,
      campaignName: d.campaignName,
      displayName: d.displayName || null,
      status: d.campaignStatus,
      productScope: d.productScope,
      quantityCondition: d.quantityCondition,
      customerType: d.customerType,
      customerTags: d.customerTags,
      productIds: d.productIds,
      collectionIds: d.collectionIds,
      tiers: d.tiers,
      widgetDisplay: d.widgetDisplay,
      countdownStartsAt: d.countdownStartsAt,
      countdownEndsAt: d.countdownEndsAt,
      shopifyDiscountIds: [],
    } as unknown as Prisma.VolumeDiscountCampaignCreateInput,
  });

  const transition = await applyDueCampaignScheduleTransitions(session.shop);
  const liveNow =
    d.campaignStatus === "active" ||
    transition.activatedIds.includes(record.id) ||
    transition.shopsNeedingShopifySync.includes(session.shop);

  /* Draft / scheduled offers are not in the aggregate discount — skip slow GraphQL. */
  if (liveNow) {
    scheduleVolumeDiscountShopSync(admin, session.shop, {
      changedCampaignIds: [record.id],
      skipScheduleTransitions: true,
    });
  } else if (
    d.campaignStatus === "scheduled" ||
    d.countdownStartsAt ||
    d.countdownEndsAt
  ) {
    /* Keep storefront cache/rev fresh for countdown schedule metadata. */
    scheduleStorefrontWidgetRefresh(admin, session.shop);
  }

  return { ok: true as const, campaignId: record.id, syncPending: true as const };
};

export default function VolumeDiscountNewRoute() {
  const {
    newOfferPreset: loaderPreset,
    planCapabilities,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navState = location.state as NewOfferNavigationState | null;
  const newOfferPreset = newOfferPresetFromSearchParam(
    searchParams.get("preset"),
    loaderPreset,
  );
  const navigate = useNavigate();
  const { search } = location;
  const shopify = useAppBridge();
  const defaultCampaignName =
    navState?.defaultCampaignName?.trim() || "Offer";
  const onSuccess = useCallback(() => {
    shopify.toast.show("Offer saved — syncing to Shopify");
    navigate(adminEmbeddedPath("/app/offers", search));
  }, [navigate, search, shopify]);

  return (
    <Suspense fallback={<IndeterminateLinearProgress fixed />}>
      <VolumeDiscountCreateView
        key={`${location.pathname}${location.search}`}
        onBack={() => navigate(adminEmbeddedPath("/app/offers", search))}
        onSuccess={onSuccess}
        defaultCampaignName={defaultCampaignName}
        newOfferPreset={newOfferPreset}
        planCapabilities={planCapabilities}
      />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
