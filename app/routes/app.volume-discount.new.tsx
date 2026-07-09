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
import { syncVolumeDiscountShop } from "../services/volumeDiscountFunctionSync.server";
import { authenticate } from "../shopify.server";
import { parseVolumeDiscountForm } from "../utils/volumeDiscountForm.server";
import type { VolumeDiscountNewOfferPreset } from "../types/volumeDiscount";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";

const VolumeDiscountCreateView = lazy(() =>
  import("../components/VolumeDiscountCreateView").then((m) => ({
    default: m.VolumeDiscountCreateView,
  })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const count = await prisma.volumeDiscountCampaign.count({
    where: { shop: session.shop },
  });
  const presetParam = new URL(request.url).searchParams.get("preset");
  const newOfferPreset: VolumeDiscountNewOfferPreset =
    presetParam === "volume" ? "volume_table" : "quantity_breaks";
  return {
    defaultCampaignName: `Offer ${count + 1}`,
    newOfferPreset,
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
  const d = parsed.data;

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

  /* Draft offers are not in the aggregate discount — skip slow GraphQL (collection expansion, metafields). */
  if (d.campaignStatus === "active") {
    const { errors } = await syncVolumeDiscountShop(admin, session.shop);
    if (errors.length) {
      await prisma.volumeDiscountCampaign.delete({ where: { id: record.id } });
      return { ok: false as const, error: errors.join(" ") };
    }
  }

  return { ok: true as const, campaignId: record.id };
};

export default function VolumeDiscountNewRoute() {
  const { defaultCampaignName, newOfferPreset: loaderPreset } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const newOfferPreset = newOfferPresetFromSearchParam(
    searchParams.get("preset"),
    loaderPreset,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { search } = location;
  const shopify = useAppBridge();
  const onSuccess = useCallback(() => {
    shopify.toast.show("Offer created in Shopify");
    navigate(adminEmbeddedPath("/app", search));
  }, [navigate, search, shopify]);

  return (
    <Suspense fallback={null}>
      <VolumeDiscountCreateView
        key={`${location.pathname}${location.search}`}
        onBack={() => navigate(adminEmbeddedPath("/app", search))}
        onSuccess={onSuccess}
        defaultCampaignName={defaultCampaignName}
        newOfferPreset={newOfferPreset}
      />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
