import { useAppBridge } from "@shopify/app-bridge-react";
import { lazy, Suspense, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { Prisma } from "@prisma/client";

import { IndeterminateLinearProgress } from "../components/IndeterminateLinearProgress";
import { prisma } from "../db.server";
import { planCampaignSaveSync } from "../utils/campaignSyncDelta.server";
import {
  scheduleStorefrontWidgetRefresh,
  scheduleVolumeDiscountShopSync,
} from "../services/deferredShopSync.server";
import { deleteAutomaticDiscounts } from "../services/volumeDiscountShopify.server";
import { authenticate } from "../shopify.server";
import {
  type VolumeDiscountProductScope,
  isVolumeDiscountQuantityCondition,
  normalizeVolumeDiscountCustomerType,
} from "../types/volumeDiscount";
import { parseVolumeDiscountForm } from "../utils/volumeDiscountForm.server";
import {
  normalizeTiersFromDb,
  parseShopifyDiscountIds,
} from "../utils/volumeDiscountTier";
import {
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "../utils/widgetDisplay";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";

const VolumeDiscountCreateView = lazy(() =>
  import("../components/VolumeDiscountCreateView").then((m) => ({
    default: m.VolumeDiscountCreateView,
  })),
);

export type VolumeDiscountEditLoaderData = {
  campaign: {
    id: string;
    campaignName: string;
    displayName: string | null;
    status: string;
    productScope: VolumeDiscountProductScope;
    quantityCondition: string;
    customerType: string;
    customerTags: string[];
    productIds: string[];
    collectionIds: string[];
    tiers: unknown;
    widgetDisplay: VolumeDiscountWidgetDisplay;
    countdownEndsAt: string | null;
  };
};

function jsonStringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs): Promise<VolumeDiscountEditLoaderData | Response> => {
  const { session } = await authenticate.admin(request);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const row = await prisma.volumeDiscountCampaign.findFirst({
    where: { id, shop: session.shop },
    select: {
      id: true,
      campaignName: true,
      displayName: true,
      status: true,
      productScope: true,
      quantityCondition: true,
      customerType: true,
      customerTags: true,
      productIds: true,
      collectionIds: true,
      tiers: true,
      widgetDisplay: true,
      countdownEndsAt: true,
    } as unknown as Prisma.VolumeDiscountCampaignSelect,
  });
  if (!row) {
    throw new Response("Not found", { status: 404 });
  }

  const rowWithWidget = row as typeof row & {
    widgetDisplay?: Prisma.JsonValue;
  };

  const productIds = jsonStringArrayField(row.productIds);
  const collectionIds = jsonStringArrayField(row.collectionIds);
  const customerTags = jsonStringArrayField(row.customerTags);

  return {
    campaign: {
      id: row.id,
      campaignName: row.campaignName,
      displayName: row.displayName,
      status: row.status,
      productScope: row.productScope as VolumeDiscountProductScope,
      quantityCondition: row.quantityCondition,
      customerType: row.customerType,
      customerTags,
      productIds,
      collectionIds,
      tiers: row.tiers,
      widgetDisplay: normalizeVolumeDiscountWidgetDisplay(
        rowWithWidget.widgetDisplay ?? {},
      ),
      countdownEndsAt: row.countdownEndsAt?.toISOString() ?? null,
    },
  };
};

export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id;
  if (!id) {
    return { ok: false as const, error: "Missing campaign id" };
  }

  const [existing, shared] = await Promise.all([
    prisma.volumeDiscountCampaign.findFirst({
      where: { id, shop: session.shop },
    }),
    prisma.volumeDiscountShopState.findUnique({
      where: { shop: session.shop },
    }),
  ]);
  if (!existing) {
    return { ok: false as const, error: "Campaign not found" };
  }

  const form = await request.formData();
  const parsed = parseVolumeDiscountForm(form);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error };
  }
  const d = parsed.data;
  const oldDiscountIds = parseShopifyDiscountIds(existing.shopifyDiscountIds);
  const legacyOnly = oldDiscountIds.filter(
    (gid) => gid !== shared?.functionDiscountId,
  );
  if (legacyOnly.length) {
    const { errors: deleteErrors } = await deleteAutomaticDiscounts(
      admin,
      legacyOnly,
    );
    if (deleteErrors.length) {
      return {
        ok: false as const,
        error: `Could not remove old Shopify discounts: ${deleteErrors.join(" ")}`,
      };
    }
  }

  await prisma.volumeDiscountCampaign.update({
    where: { id },
    data: {
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
    } as unknown as Prisma.VolumeDiscountCampaignUpdateInput,
  });

  const syncPlan = planCampaignSaveSync(
    {
      status: existing.status,
      campaignName: existing.campaignName,
      displayName: existing.displayName,
      productScope: existing.productScope,
      quantityCondition: existing.quantityCondition,
      customerType: existing.customerType,
      customerTags: existing.customerTags,
      productIds: existing.productIds,
      collectionIds: existing.collectionIds,
      tiers: existing.tiers,
      widgetDisplay: existing.widgetDisplay,
      countdownStartsAt: existing.countdownStartsAt,
      countdownEndsAt: existing.countdownEndsAt,
    },
    d,
  );

  if (syncPlan.kind === "full") {
    scheduleVolumeDiscountShopSync(admin, session.shop, {
      changedCampaignIds: [id],
    });
  } else if (syncPlan.kind === "storefront_only") {
    scheduleStorefrontWidgetRefresh(admin, session.shop);
  }

  return { ok: true as const, campaignId: id, syncPending: true as const };
};

const fallbackTier = {
  buyFrom: "1",
  discountMode: "per-item",
  value: "0",
  valueUnit: "%",
  badge: "Most Popular ⚡",
  buyLabelText: "",
  optionSubtext: "",
  multiples: false,
  activeByDefault: true,
};

export default function VolumeDiscountEditRoute() {
  const { campaign } = useLoaderData<VolumeDiscountEditLoaderData>();
  const navigate = useNavigate();
  const { search } = useLocation();
  const shopify = useAppBridge();
  const onSuccess = useCallback(() => {
    shopify.toast.show("Offer saved — syncing to Shopify");
  }, [shopify]);

  const parsedTiers = normalizeTiersFromDb(campaign.tiers);
  const tiersNorm = parsedTiers.length > 0 ? parsedTiers : [fallbackTier];

  const quantityCondition = isVolumeDiscountQuantityCondition(
    campaign.quantityCondition,
  )
    ? campaign.quantityCondition
    : "per-variant";
  const customerType = normalizeVolumeDiscountCustomerType(
    campaign.customerType,
  );

  return (
    <Suspense fallback={<IndeterminateLinearProgress fixed />}>
      <VolumeDiscountCreateView
        key={campaign.id}
        onBack={() => navigate(adminEmbeddedPath("/app/offers", search))}
        onSuccess={onSuccess}
        initialCampaign={{
          id: campaign.id,
          campaignName: campaign.campaignName,
          displayName: campaign.displayName,
          status: campaign.status,
          productScope: campaign.productScope,
          quantityCondition,
          customerType,
          customerTags: campaign.customerTags,
          productIds: campaign.productIds,
          collectionIds: campaign.collectionIds,
          tiers: tiersNorm,
          widgetDisplay: campaign.widgetDisplay,
          countdownEndsAt: campaign.countdownEndsAt,
        }}
      />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
