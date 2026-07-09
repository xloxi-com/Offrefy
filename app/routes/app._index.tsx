import { Prisma } from "@prisma/client";
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Box, InlineGrid, Page } from "@shopify/polaris";
import { APP_DISPLAY_NAME } from "../branding";
import { prisma } from "../db.server";
import { scheduleVolumeDiscountShopSync } from "../services/deferredShopSync.server";
import { syncVolumeDiscountShop } from "../services/volumeDiscountFunctionSync.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { OffersPolarisHome, type OfferTab } from "../components/OffersPolarisHome";
import {
  adminEmbeddedPath,
  adminEmbeddedPathWithQuery,
} from "../utils/adminEmbeddedPath";
import { buildVolumeDiscountOffersCsvExport } from "../utils/offersCsvExport.server";
import type { OffersListTab } from "../utils/offersTableViewOrder.server";
import { storefrontProductPreviewUrl } from "../utils/storefrontProductPreviewUrl.server";
import { widgetPresentationFromStoredJson } from "../utils/widgetDisplay";

const OfferTypePreviewModal = lazy(() =>
  import("../components/OfferTypePreviewModal").then((m) => ({
    default: m.OfferTypePreviewModal,
  })),
);
const QuantityBreaksSelectCard = lazy(() =>
  import("../components/OfferTypeSelectCards").then((m) => ({
    default: m.QuantityBreaksSelectCard,
  })),
);
const VolumeDiscountComingSoonCard = lazy(() =>
  import("../components/OfferTypeSelectCards").then((m) => ({
    default: m.VolumeDiscountComingSoonCard,
  })),
);

type OfferTypePreviewPreset = import("../components/OfferTypePreviewModal").OfferTypePreviewPreset;

export const meta: MetaFunction = () => [
  { title: `Offers · ${APP_DISPLAY_NAME}` },
];

type Screen = "home" | "select";

/** Matches Prisma row fields used when duplicating (explicit so TS matches DB even if client typings split). */
type VolumeDiscountCampaignDuplicateRow = {
  shop: string;
  campaignName: string;
  displayName: string | null;
  productScope: string;
  quantityCondition: string;
  customerType: string;
  productIds: Prisma.JsonValue;
  collectionIds: Prisma.JsonValue;
  tiers: Prisma.JsonValue;
  widgetDisplay: Prisma.JsonValue;
  countdownStartsAt: Date | null;
  countdownEndsAt: Date | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      campaignName: string;
      displayName: string | null;
      productScope: string;
      status: string;
      createdAt: Date;
      tierCount: bigint;
      widgetDisplay: unknown;
    }>
  >(Prisma.sql`
      SELECT
        c."id",
        c."campaignName",
        c."displayName",
        c."productScope",
        c."status",
        c."createdAt",
        c."widgetDisplay",
        CASE
          WHEN jsonb_typeof(c."tiers") = 'array' THEN jsonb_array_length(c."tiers")
          ELSE 0
        END AS "tierCount"
      FROM "VolumeDiscountCampaign" c
      WHERE c."shop" = ${session.shop}
      ORDER BY c."createdAt" DESC
    `);

  /* Warm preview URL cache without blocking Offers table + header actions paint. */
  void storefrontProductPreviewUrl(admin, session.shop).catch((e) => {
    console.warn("[Offrefy] storefrontProductPreviewUrl warm", e);
  });

  return {
    storefrontProductPreviewUrl: null as string | null,
    campaigns: rows.map((c) => ({
      id: c.id,
      campaignName: c.campaignName,
      displayName: c.displayName,
      productScope: c.productScope,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      tierCount: Number(c.tierCount),
      widgetPresentation: widgetPresentationFromStoredJson(c.widgetDisplay),
    })),
  };
};

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("_action") ?? "");
  const campaignId = String(form.get("campaignId") ?? "").trim();
  const campaignIds = [
    ...new Set(
      form
        .getAll("campaignIds")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ];

  if (intent === "delete") {
    const targetIds =
      campaignIds.length > 0 ? campaignIds : campaignId ? [campaignId] : [];
    if (targetIds.length === 0) {
      return { ok: false as const, error: "Missing offer" };
    }
    const rows = await prisma.volumeDiscountCampaign.findMany({
      where: { shop: session.shop, id: { in: targetIds } },
      select: { id: true, status: true },
    });
    if (rows.length !== targetIds.length) {
      return { ok: false as const, error: "One or more offers not found" };
    }
    const deletedAnyActive = rows.some(
      (r) => String(r.status).toLowerCase() === "active",
    );
    await prisma.volumeDiscountCampaign.deleteMany({
      where: { shop: session.shop, id: { in: targetIds } },
    });
    /* Draft-only deletes are not in the Shopify discount or storefront widget JSON — skip slow sync. */
    if (!deletedAnyActive) {
      return {
        ok: true as const,
        intent: "delete" as const,
        count: targetIds.length,
      };
    }
    scheduleVolumeDiscountShopSync(admin, session.shop);
    return {
      ok: true as const,
      intent: "delete" as const,
      count: targetIds.length,
      syncPending: true as const,
    };
  }

  if (intent === "syncAll") {
    const { errors } = await syncVolumeDiscountShop(admin, session.shop, {
      purgeLegacy: true,
    });
    if (errors.length) {
      return { ok: false as const, error: errors.join(" ") };
    }
    return { ok: true as const, intent: "syncAll" as const };
  }

  if (intent === "exportCsv") {
    const tabRaw = String(form.get("listTab") ?? "all");
    const tab: OffersListTab =
      tabRaw === "active" || tabRaw === "draft" ? tabRaw : "all";
    const searchQuery = String(form.get("listQ") ?? "");
    const sort = String(form.get("listSort") ?? "created desc");
    const csv = await buildVolumeDiscountOffersCsvExport(session.shop, {
      tab,
      searchQuery,
      sort,
    });
    if (csv === null) {
      return {
        ok: false as const,
        error:
          "No offers to export. Add an offer or switch tab / clear search so the list shows at least one row.",
      };
    }
    return {
      ok: true as const,
      intent: "exportCsv" as const,
      filename: "offrefy-offers.csv",
      csv,
    };
  }

  if (intent === "bulkActivate" || intent === "bulkDeactivate") {
    if (campaignIds.length === 0) {
      return { ok: false as const, error: "Select at least one offer" };
    }
    const rows = await prisma.volumeDiscountCampaign.findMany({
      where: { shop: session.shop, id: { in: campaignIds } },
      select: { id: true },
    });
    if (rows.length !== campaignIds.length) {
      return { ok: false as const, error: "One or more offers not found" };
    }
    const status = intent === "bulkActivate" ? "active" : "draft";
    await prisma.volumeDiscountCampaign.updateMany({
      where: { shop: session.shop, id: { in: campaignIds } },
      data: { status },
    });
    scheduleVolumeDiscountShopSync(admin, session.shop);
    return {
      ok: true as const,
      intent: intent === "bulkActivate" ? ("bulkActivate" as const) : ("bulkDeactivate" as const),
      count: campaignIds.length,
      syncPending: true as const,
    };
  }

  if (!campaignId) {
    return { ok: false as const, error: "Missing offer" };
  }

  const row = (await prisma.volumeDiscountCampaign.findFirst({
    where: { id: campaignId, shop: session.shop },
  })) as VolumeDiscountCampaignDuplicateRow | null;
  if (!row) {
    return { ok: false as const, error: "Offer not found" };
  }

  if (intent === "duplicate") {
    const copyName = `${row.campaignName} (copy)`.slice(0, 500);
    await prisma.volumeDiscountCampaign.create({
      data: {
        shop: row.shop,
        campaignName: copyName,
        displayName: row.displayName,
        productScope: row.productScope,
        quantityCondition: row.quantityCondition,
        customerType: row.customerType,
        productIds: row.productIds as Prisma.InputJsonValue,
        collectionIds: row.collectionIds as Prisma.InputJsonValue,
        tiers: row.tiers as Prisma.InputJsonValue,
        widgetDisplay: (row.widgetDisplay ?? {}) as Prisma.InputJsonValue,
        countdownStartsAt: row.countdownStartsAt,
        countdownEndsAt: row.countdownEndsAt,
        shopifyDiscountIds: [],
        status: "draft",
      } as Prisma.VolumeDiscountCampaignUncheckedCreateInput,
    });
    return { ok: true as const, intent: "duplicate" as const };
  }

  return { ok: false as const, error: "Unknown action" };
}

export default function Index() {
  const { campaigns, storefrontProductPreviewUrl: storefrontProductPreviewUrlFromLoader } =
    useLoaderData<typeof loader>();
  const { search } = useLocation();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [screen, setScreen] = useState<Screen>("home");
  const [offerPreviewModal, setOfferPreviewModal] =
    useState<OfferTypePreviewPreset | null>(null);
  const [offerTab, setOfferTab] = useState<OfferTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortSelected, setSortSelected] = useState<string[]>(["created desc"]);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const toastSoon = useCallback(
    (label: string) => {
      shopify.toast.show(`${label} — coming soon`);
    },
    [shopify],
  );

  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    const q = deferredSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => c.campaignName.toLowerCase().includes(q));
    }
    if (offerTab === "active") {
      list = list.filter((c) => c.status === "active");
    } else if (offerTab === "draft") {
      list = list.filter((c) => c.status === "draft");
    }
    const sortValue = sortSelected[0] ?? "created desc";
    if (sortValue.startsWith("name")) {
      const desc = sortValue.endsWith("desc");
      return [...list].sort((a, b) => {
        const cmp = a.campaignName.localeCompare(b.campaignName);
        return desc ? -cmp : cmp;
      });
    }
    const desc = sortValue.endsWith("desc");
    return [...list].sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return desc ? db - da : da - db;
    });
  }, [campaigns, deferredSearchQuery, offerTab, sortSelected]);

  const notify = useCallback(
    (message: string) => shopify.toast.show(message),
    [shopify],
  );
  const onCampaignsMutated = useCallback(
    () => revalidator.revalidate(),
    [revalidator],
  );
  const offerEditTo = useCallback(
    (id: string) => adminEmbeddedPath(`/app/volume-discount/${id}`, search),
    [search],
  );

  if (screen === "select") {
    return (
      <>
        <Suspense fallback={null}>
          <OfferTypePreviewModal
            open={offerPreviewModal !== null}
            preset={offerPreviewModal ?? "quantity"}
            onClose={() => setOfferPreviewModal(null)}
            storefrontPreviewUrl={storefrontProductPreviewUrlFromLoader}
          />
        </Suspense>
        <Page
          fullWidth
          title="Select offer type"
          subtitle="Choose how volume pricing appears on product pages."
          backAction={{
            content: "Offers",
            onAction: () => setScreen("home"),
          }}
        >
          <Box paddingBlockEnd="400" width="100%">
            <div
              style={{
                width: "100%",
                maxWidth: "800px",
                marginInline: "auto",
              }}
            >
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <Suspense fallback={null}>
                  <QuantityBreaksSelectCard
                    title="Quantity breaks"
                    onPreview={() => setOfferPreviewModal("quantity")}
                    onLearnMore={() => toastSoon("Learn more")}
                    onCreate={() =>
                      navigate(
                        adminEmbeddedPathWithQuery(
                          "/app/volume-discount/new",
                          search,
                          { preset: "quantity" },
                        ),
                      )
                    }
                  />
                  <VolumeDiscountComingSoonCard
                    title="Volume discount"
                    onPreview={() => setOfferPreviewModal("volume")}
                    onLearnMore={() => toastSoon("Learn more")}
                    onCreate={() =>
                      navigate(
                        adminEmbeddedPathWithQuery(
                          "/app/volume-discount/new",
                          search,
                          { preset: "volume" },
                        ),
                      )
                    }
                  />
                </Suspense>
              </InlineGrid>
            </div>
          </Box>
        </Page>
      </>
    );
  }

  return (
    <OffersPolarisHome
      campaigns={campaigns}
      filteredCampaigns={filteredCampaigns}
      offerTab={offerTab}
      setOfferTab={setOfferTab}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      sortSelected={sortSelected}
      setSortSelected={setSortSelected}
      exportSearchQuery={deferredSearchQuery}
      toastSoon={toastSoon}
      setScreen={setScreen}
      offerEditTo={offerEditTo}
      onCampaignsMutated={onCampaignsMutated}
      notify={notify}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
