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
} from "../utils/pricingPlans";
import {
  countActiveCampaigns,
  resolveShopPlanContext,
} from "../utils/shopPlan.server";
import { previousItemsFromRow } from "../utils/bogoBxgyInput";
import {
  jsonStringArrayFromDb,
  parseBogoForm,
} from "../utils/bogoForm.server";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import { bogoCampaignDb } from "../utils/bogoPrisma.server";
import { resolveShopIanaTimezone } from "../utils/shopTimezone.server";
import { activationBlockedMessage } from "../utils/volumeDiscountForm.server";

type BogoRow = {
  id: string;
  campaignName: string;
  displayName: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  buysRequirement: string;
  buysQuantity: number | null;
  buysAmount: string | null;
  buysScope: string;
  buysProductIds: unknown;
  buysCollectionIds: unknown;
  getsQuantity: number;
  getsScope: string;
  getsProductIds: unknown;
  getsCollectionIds: unknown;
  getsValueType: string;
  getsValue: string | null;
  usesPerOrderLimit: number | null;
  shopifyDiscountId?: string | null;
  widgetDisplay?: unknown;
  displayNameTranslations?: unknown;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = String(params.id ?? "").trim();
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }
  const [row, shopTimezone] = await Promise.all([
    bogoCampaignDb().findFirst({
      where: { id, shop: session.shop },
      select: {
        id: true,
        campaignName: true,
        displayName: true,
        status: true,
        startsAt: true,
        endsAt: true,
        buysRequirement: true,
        buysQuantity: true,
        buysAmount: true,
        buysScope: true,
        buysProductIds: true,
        buysCollectionIds: true,
        getsQuantity: true,
        getsScope: true,
        getsProductIds: true,
        getsCollectionIds: true,
        getsValueType: true,
        getsValue: true,
        usesPerOrderLimit: true,
        widgetDisplay: true,
        displayNameTranslations: true,
        combinesWithProductDiscounts: true,
        combinesWithOrderDiscounts: true,
        combinesWithShippingDiscounts: true,
      },
    }) as Promise<BogoRow | null>,
    resolveShopIanaTimezone(admin, session.shop),
  ]);
  if (!row) {
    throw new Response("Not found", { status: 404 });
  }

  return {
    shopTimezone,
    campaign: {
      id: row.id,
      campaignName: row.campaignName,
      displayName: row.displayName,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      buysRequirement: row.buysRequirement,
      buysQuantity: row.buysQuantity,
      buysAmount: row.buysAmount,
      buysScope: row.buysScope,
      buysProductIds: jsonStringArrayFromDb(row.buysProductIds),
      buysCollectionIds: jsonStringArrayFromDb(row.buysCollectionIds),
      getsQuantity: row.getsQuantity,
      getsScope: row.getsScope,
      getsProductIds: jsonStringArrayFromDb(row.getsProductIds),
      getsCollectionIds: jsonStringArrayFromDb(row.getsCollectionIds),
      getsValueType: row.getsValueType,
      getsValue: row.getsValue,
      usesPerOrderLimit: row.usesPerOrderLimit,
      widgetDisplay: row.widgetDisplay ?? {},
      displayNameTranslations: row.displayNameTranslations ?? {},
      combinesWithProductDiscounts: row.combinesWithProductDiscounts !== false,
      combinesWithOrderDiscounts: row.combinesWithOrderDiscounts === true,
      combinesWithShippingDiscounts:
        row.combinesWithShippingDiscounts !== false,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = String(params.id ?? "").trim();
  if (!id) {
    return { ok: false as const, error: "Missing offer" };
  }

  const existing = (await bogoCampaignDb().findFirst({
    where: { id, shop: session.shop },
  })) as BogoRow | null;
  if (!existing) {
    return { ok: false as const, error: "Offer not found" };
  }

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

  const d = parsed.data;
  const wasActive = String(existing.status).toLowerCase() === "active";
  if (d.status === "active" && !wasActive) {
    const [{ plan }, activeCount] = await Promise.all([
      resolveShopPlanContext(session.shop),
      countActiveCampaigns(session.shop),
    ]);
    if (!canActivateAnotherCampaign(plan, activeCount)) {
      return {
        ok: false as const,
        error: activationBlockedMessage(plan),
      };
    }
  }

  /* Capture membership before Prisma overwrite so BXGY update diffs are accurate. */
  const previous = previousItemsFromRow(existing);

  await bogoCampaignDb().update({
    where: { id },
    data: {
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
    },
  });

  const { errors } = await syncBogoCampaignToShopify(admin, session.shop, id, {
    previousBuys: previous.buys,
    previousGets: previous.gets,
  });
  if (errors.length) {
    /* Restore prior Prisma config so a failed Shopify update does not desync. */
    await bogoCampaignDb().update({
      where: { id },
      data: {
        campaignName: existing.campaignName,
        displayName: existing.displayName,
        status: existing.status,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        buysRequirement: existing.buysRequirement,
        buysQuantity: existing.buysQuantity,
        buysAmount: existing.buysAmount,
        buysScope: existing.buysScope,
        buysProductIds: existing.buysProductIds,
        buysCollectionIds: existing.buysCollectionIds,
        getsQuantity: existing.getsQuantity,
        getsScope: existing.getsScope,
        getsProductIds: existing.getsProductIds,
        getsCollectionIds: existing.getsCollectionIds,
        getsValueType: existing.getsValueType,
        getsValue: existing.getsValue,
        usesPerOrderLimit: existing.usesPerOrderLimit,
        widgetDisplay: existing.widgetDisplay ?? {},
        displayNameTranslations: existing.displayNameTranslations ?? {},
        combinesWithProductDiscounts:
          existing.combinesWithProductDiscounts !== false,
        combinesWithOrderDiscounts:
          existing.combinesWithOrderDiscounts === true,
        combinesWithShippingDiscounts:
          existing.combinesWithShippingDiscounts !== false,
      },
    });
    return {
      ok: false as const,
      error: `Shopify BXGY update failed (previous offer kept): ${errors.join(" ")}`,
    };
  }

  await flushStorefrontWidgetPayloadNow(admin, session.shop).catch((e) => {
    console.warn("[bogo] storefront widget flush after update", e);
  });

  return { ok: true as const, campaignId: id };
};

export default function BogoEditRoute() {
  const { campaign, shopTimezone } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const { search } = location;

  const onSuccess = useCallback(() => {
    shopify.toast.show("BOGO offer updated");
    navigate(adminEmbeddedPath("/app/offers", search));
  }, [navigate, search, shopify]);

  return (
    <Suspense fallback={null}>
      <BogoCreateView
        onBack={() => navigate(adminEmbeddedPath("/app/offers", search))}
        onSuccess={onSuccess}
        defaultCampaignName={campaign.campaignName}
        initialCampaign={campaign}
        shopTimezone={shopTimezone}
      />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
