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

import { prisma } from "../db.server";
import { planCampaignSaveSync } from "../utils/campaignSyncDelta.server";
import { applyDueCampaignScheduleTransitions } from "../services/campaignScheduleTransitions.server";
import {
  scheduleStorefrontWidgetRefresh,
  syncVolumeDiscountShopToShopify,
} from "../services/deferredShopSync.server";
import { deleteAutomaticDiscounts } from "../services/volumeDiscountShopify.server";
import { authenticate } from "../shopify.server";
import {
  type VolumeDiscountProductScope,
  isVolumeDiscountQuantityCondition,
  normalizeVolumeDiscountCustomerType,
} from "../types/volumeDiscount";
import { parseVolumeDiscountForm, sanitizeCampaignForPlan, activationBlockedMessage } from "../utils/volumeDiscountForm.server";
import {
  normalizeTiersFromDb,
  parseShopifyDiscountIds,
} from "../utils/volumeDiscountTier";
import {
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "../utils/widgetDisplay";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import { canActivateAnotherCampaign } from "../utils/pricingPlans";
import {
  appearanceTemplateSaveBlockedMessage,
  isWidgetDisplayAppearanceAbovePlan,
} from "../utils/appearanceTemplateAccess";
import {
  countActiveCampaigns,
  resolveShopPlanContext,
} from "../utils/shopPlan.server";
import { resolveShopIanaTimezone } from "../utils/shopTimezone.server";
import type { PlanCapabilities, PricingPlanId } from "../utils/pricingPlans";
import {
  isCartDiscountDisplayTemplate,
  syncCartDiscountTranslationsFromDisplayName,
  languageKeysFromShopLanguages,
  parseStoredStorefrontTranslations,
  readStorefrontSettingsRow,
  runCampaignAutoTranslateFromForm,
} from "../utils/storefrontTranslations.server";
import {
  parseSparseStorefrontTranslations,
  packCampaignTranslationBlob,
  seedCampaignCartOverridesFromDisplayName,
  sparsifyStorefrontTranslations,
  unpackCampaignTranslationBlob,
  type SparseStorefrontTranslationsMap,
  type StorefrontTranslationsMap,
  type TierCopyTranslationsMap,
} from "../utils/storefrontTranslations";
import {
  FALLBACK_SHOP_LANGUAGES,
  fetchShopPublishedLocales,
  type ShopLanguageOption,
} from "../utils/shopPublishedLocales.server";

async function resolveCampaignTranslationsForSave(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  formOverrides: SparseStorefrontTranslationsMap,
  displayName: string,
): Promise<SparseStorefrontTranslationsMap> {
  let sparse = sparsifyStorefrontTranslations(formOverrides);
  if (!isCartDiscountDisplayTemplate(displayName)) {
    return sparse;
  }
  const { languages } = await fetchShopPublishedLocales(admin);
  const languageKeys = languageKeysFromShopLanguages(
    languages.length > 0 ? languages : FALLBACK_SHOP_LANGUAGES,
  );
  return seedCampaignCartOverridesFromDisplayName(
    sparse,
    displayName,
    languageKeys,
  );
}

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
    displayNameTranslations: SparseStorefrontTranslationsMap;
    tierCopyTranslations: TierCopyTranslationsMap;
    status: string;
    productScope: VolumeDiscountProductScope;
    quantityCondition: string;
    customerType: string;
    customerTags: string[];
    productIds: string[];
    collectionIds: string[];
    tiers: unknown;
    widgetDisplay: VolumeDiscountWidgetDisplay;
    countdownStartsAt: string | null;
    countdownEndsAt: string | null;
  };
  plan: PricingPlanId;
  planCapabilities: PlanCapabilities;
  shopTimezone: string;
  shopLanguages: ShopLanguageOption[];
  shopTranslations: StorefrontTranslationsMap;
};

function jsonStringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs): Promise<VolumeDiscountEditLoaderData | Response> => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const [planCtx, row, shopTimezone, shopLocales, settingsRow] = await Promise.all([
    resolveShopPlanContext(session.shop),
    prisma.volumeDiscountCampaign.findFirst({
      where: { id, shop: session.shop },
      select: {
        id: true,
        campaignName: true,
        displayName: true,
        displayNameTranslations: true,
        status: true,
        productScope: true,
        quantityCondition: true,
        customerType: true,
        customerTags: true,
        productIds: true,
        collectionIds: true,
        tiers: true,
        widgetDisplay: true,
        countdownStartsAt: true,
        countdownEndsAt: true,
      } as unknown as Prisma.VolumeDiscountCampaignSelect,
    }),
    resolveShopIanaTimezone(admin),
    fetchShopPublishedLocales(admin),
    readStorefrontSettingsRow(session.shop),
  ]);
  if (!row) {
    throw new Response("Not found", { status: 404 });
  }

  const rowWithWidget = row as typeof row & {
    widgetDisplay?: Prisma.JsonValue;
    displayNameTranslations?: Prisma.JsonValue;
  };

  const productIds = jsonStringArrayField(row.productIds);
  const collectionIds = jsonStringArrayField(row.collectionIds);
  const customerTags = jsonStringArrayField(row.customerTags);
  const shopLanguages =
    shopLocales.languages.length > 0
      ? shopLocales.languages
      : FALLBACK_SHOP_LANGUAGES;
  const shopTranslations = parseStoredStorefrontTranslations(
    settingsRow.translationsString,
  );

  return {
    campaign: {
      id: row.id,
      campaignName: row.campaignName,
      displayName: row.displayName,
      ...(() => {
        const unpacked = unpackCampaignTranslationBlob(
          rowWithWidget.displayNameTranslations,
        );
        return {
          displayNameTranslations: unpacked.locales,
          tierCopyTranslations: unpacked.tierCopy,
        };
      })(),
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
      countdownStartsAt: row.countdownStartsAt?.toISOString() ?? null,
      countdownEndsAt: row.countdownEndsAt?.toISOString() ?? null,
    },
    plan: planCtx.plan,
    planCapabilities: planCtx.capabilities,
    shopTimezone,
    shopLanguages,
    shopTranslations,
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

  const form = await request.formData();
  if (String(form.get("intent") ?? "") === "autoTranslateCampaign") {
    return runCampaignAutoTranslateFromForm(session.shop, form);
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

  const parsed = parseVolumeDiscountForm(form);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error };
  }

  const wasActive = existing.status === "active";
  const needsActiveRoom = parsed.data.campaignStatus === "active" && !wasActive;
  const [planCtx, activeCount] = await Promise.all([
    resolveShopPlanContext(session.shop),
    needsActiveRoom
      ? countActiveCampaigns(session.shop)
      : Promise.resolve(0),
  ]);
  if (
    isWidgetDisplayAppearanceAbovePlan(
      planCtx.capabilities.appearanceTemplates,
      parsed.data.widgetDisplay,
    )
  ) {
    return {
      ok: false as const,
      error: appearanceTemplateSaveBlockedMessage(
        planCtx.capabilities.appearanceTemplates,
      ),
    };
  }
  const d = sanitizeCampaignForPlan(parsed.data, planCtx.plan);

  if (needsActiveRoom) {
    if (!canActivateAnotherCampaign(planCtx.plan, activeCount)) {
      return {
        ok: false as const,
        error: activationBlockedMessage(planCtx.plan),
      };
    }
  }

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

  const nextDisplayName = (d.displayName || "").trim();
  const displayNameLocales = await resolveCampaignTranslationsForSave(
    admin,
    d.displayNameTranslations,
    nextDisplayName,
  );
  const displayNameTranslations = packCampaignTranslationBlob(
    displayNameLocales,
    d.tierCopyTranslations,
  );

  await prisma.volumeDiscountCampaign.update({
    where: { id },
    data: {
      campaignName: d.campaignName,
      displayName: d.displayName || null,
      displayNameTranslations,
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

  let cartTranslationsUpdated = false;
  if (isCartDiscountDisplayTemplate(nextDisplayName)) {
    try {
      const syncResult = await syncCartDiscountTranslationsFromDisplayName(
        session.shop,
        admin,
        nextDisplayName,
        { autoTranslate: planCtx.capabilities.translations },
      );
      cartTranslationsUpdated = syncResult.updated;
    } catch (error) {
      console.error(
        "[volume-discount] Cart badge translation sync after display name save",
        error,
      );
    }
  }

  /* If start/end already due at save time, flip Scheduled↔Active/Draft before sync plan. */
  const transition = await applyDueCampaignScheduleTransitions(session.shop);
  const afterStatus =
    transition.activatedIds.includes(id)
      ? "active"
      : transition.deactivatedIds.includes(id)
        ? "draft"
        : d.campaignStatus;

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
      displayNameTranslations: existing.displayNameTranslations,
      countdownStartsAt: existing.countdownStartsAt,
      countdownEndsAt: existing.countdownEndsAt,
    },
    { ...d, displayNameTranslations, campaignStatus: afterStatus },
  );

  if (
    syncPlan.kind === "full" ||
    afterStatus === "active" ||
    afterStatus === "scheduled" ||
    transition.shopsNeedingShopifySync.includes(session.shop) ||
    cartTranslationsUpdated
  ) {
    const { errors } = await syncVolumeDiscountShopToShopify(admin, session.shop, {
      changedCampaignIds: [id],
      skipScheduleTransitions: true,
      force: true,
    });
    if (errors.length) {
      return {
        ok: false as const,
        error: `Offer saved, but Shopify discount update failed: ${errors.join(" ")}`,
      };
    }
  } else if (syncPlan.kind === "storefront_only") {
    scheduleStorefrontWidgetRefresh(admin, session.shop);
  }

  return { ok: true as const, campaignId: id };
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
  const { campaign, planCapabilities, shopTimezone, shopLanguages, shopTranslations } =
    useLoaderData<VolumeDiscountEditLoaderData>();
  const navigate = useNavigate();
  const { search } = useLocation();
  const shopify = useAppBridge();
  const onSuccess = useCallback(() => {
    shopify.toast.show("Offer saved — updated on Shopify");
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
    <Suspense fallback={null}>
      <VolumeDiscountCreateView
        key={campaign.id}
        onBack={() => navigate(adminEmbeddedPath("/app/offers", search))}
        onSuccess={onSuccess}
        planCapabilities={planCapabilities}
        shopTimezone={shopTimezone}
        shopLanguages={shopLanguages}
        shopTranslations={shopTranslations}
        initialCampaign={{
          id: campaign.id,
          campaignName: campaign.campaignName,
          displayName: campaign.displayName,
          displayNameTranslations: campaign.displayNameTranslations,
          tierCopyTranslations: campaign.tierCopyTranslations,
          status: campaign.status,
          productScope: campaign.productScope,
          quantityCondition,
          customerType,
          customerTags: campaign.customerTags,
          productIds: campaign.productIds,
          collectionIds: campaign.collectionIds,
          tiers: tiersNorm,
          widgetDisplay: campaign.widgetDisplay,
          countdownStartsAt: campaign.countdownStartsAt,
          countdownEndsAt: campaign.countdownEndsAt,
        }}
      />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
