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

import { prisma } from "../db.server";
import {
  scheduleStorefrontWidgetRefresh,
  syncVolumeDiscountShopToShopify,
} from "../services/deferredShopSync.server";
import { applyDueCampaignScheduleTransitions } from "../services/campaignScheduleTransitions.server";
import { authenticate } from "../shopify.server";
import {
  canActivateAnotherCampaign,
  canCreateAnotherOffer,
  createOfferBlockedMessage,
} from "../utils/pricingPlans";
import {
  appearanceTemplateSaveBlockedMessage,
  isWidgetDisplayAppearanceAbovePlan,
} from "../utils/appearanceTemplateAccess";
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
import { resolveShopIanaTimezone } from "../utils/shopTimezone.server";
import {
  isCartDiscountDisplayTemplate,
  syncCartDiscountTranslationsFromDisplayName,
  languageKeysFromShopLanguages,
  parseStoredStorefrontTranslations,
  readStorefrontSettingsRow,
  runCampaignAutoTranslateFromForm,
} from "../utils/storefrontTranslations.server";
import {
  packCampaignTranslationBlob,
  seedCampaignCartOverridesFromDisplayName,
  sparsifyStorefrontTranslations,
  type SparseStorefrontTranslationsMap,
} from "../utils/storefrontTranslations";
import {
  FALLBACK_SHOP_LANGUAGES,
  fetchShopPublishedLocales,
} from "../utils/shopPublishedLocales.server";

async function resolveCampaignTranslationsForSave(
  admin: {
    graphql: (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => Promise<Response>;
  },
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

type NewOfferNavigationState = {
  defaultCampaignName?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const presetParam = new URL(request.url).searchParams.get("preset");
  const newOfferPreset: VolumeDiscountNewOfferPreset =
    presetParam === "volume" ? "volume_table" : "quantity_breaks";
  const [{ plan, capabilities }, activeCount, shopTimezone, shopLocales, settingsRow] =
    await Promise.all([
      resolveShopPlanContext(session.shop),
      countActiveCampaigns(session.shop),
      resolveShopIanaTimezone(admin),
      fetchShopPublishedLocales(admin),
      readStorefrontSettingsRow(session.shop),
    ]);
  return {
    newOfferPreset,
    plan,
    planCapabilities: capabilities,
    activeCount,
    shopTimezone,
    shopLanguages:
      shopLocales.languages.length > 0
        ? shopLocales.languages
        : FALLBACK_SHOP_LANGUAGES,
    shopTranslations: parseStoredStorefrontTranslations(
      settingsRow.translationsString,
    ),
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
  if (String(form.get("intent") ?? "") === "autoTranslateCampaign") {
    return runCampaignAutoTranslateFromForm(session.shop, form);
  }

  const parsed = parseVolumeDiscountForm(form);
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error };
  }

  const [{ plan, capabilities }, offerCount] = await Promise.all([
    resolveShopPlanContext(session.shop),
    countAllCampaigns(session.shop),
  ]);
  if (
    isWidgetDisplayAppearanceAbovePlan(
      capabilities.appearanceTemplates,
      parsed.data.widgetDisplay,
    )
  ) {
    return {
      ok: false as const,
      error: appearanceTemplateSaveBlockedMessage(
        capabilities.appearanceTemplates,
      ),
    };
  }
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

  const record = await prisma.volumeDiscountCampaign.create({
    data: {
      shop: session.shop,
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
      shopifyDiscountIds: [],
    } as unknown as Prisma.VolumeDiscountCampaignCreateInput,
  });

  if (isCartDiscountDisplayTemplate(nextDisplayName)) {
    try {
      await syncCartDiscountTranslationsFromDisplayName(
        session.shop,
        admin,
        nextDisplayName,
        { autoTranslate: capabilities.translations },
      );
    } catch (error) {
      console.error(
        "[volume-discount] Cart badge translation sync after new offer display name",
        error,
      );
    }
  }

  const transition = await applyDueCampaignScheduleTransitions(session.shop);
  const needsFunctionSync =
    d.campaignStatus === "active" ||
    d.campaignStatus === "scheduled" ||
    transition.activatedIds.includes(record.id) ||
    transition.shopsNeedingShopifySync.includes(session.shop);

  /* Push Automatic Discount + widget to Shopify before responding (no manual Sync). */
  if (needsFunctionSync) {
    const { errors } = await syncVolumeDiscountShopToShopify(admin, session.shop, {
      changedCampaignIds: [record.id],
      skipScheduleTransitions: true,
      force: true,
    });
    if (errors.length) {
      return {
        ok: false as const,
        error: `Offer saved, but Shopify discount update failed: ${errors.join(" ")}`,
      };
    }
  } else if (d.countdownStartsAt || d.countdownEndsAt) {
    scheduleStorefrontWidgetRefresh(admin, session.shop);
  }

  return { ok: true as const, campaignId: record.id };
};

export default function VolumeDiscountNewRoute() {
  const {
    newOfferPreset: loaderPreset,
    planCapabilities,
    shopTimezone,
    shopLanguages,
    shopTranslations,
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
    shopify.toast.show("Offer saved — updated on Shopify");
    navigate(adminEmbeddedPath("/app/offers", search));
  }, [navigate, search, shopify]);

  return (
    <Suspense fallback={null}>
      <VolumeDiscountCreateView
        key={`${location.pathname}${location.search}`}
        onBack={() => navigate(adminEmbeddedPath("/app/offers", search))}
        onSuccess={onSuccess}
        defaultCampaignName={defaultCampaignName}
        newOfferPreset={newOfferPreset}
        planCapabilities={planCapabilities}
        shopTimezone={shopTimezone}
        shopLanguages={shopLanguages}
        shopTranslations={shopTranslations}
      />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
