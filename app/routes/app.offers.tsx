import { Prisma } from "@prisma/client";
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
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
import { ensureVolumeDiscountFunctionDiscount } from "../services/volumeDiscountFunctionSync.server";
import {
  runAfterResponse,
  scheduleVolumeDiscountShopSync,
} from "../services/deferredShopSync.server";
import { applyDueCampaignScheduleTransitions } from "../services/scheduledVolumeDiscountSync.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { OfferLimitUpgradeModal } from "../components/OfferLimitUpgradeModal";
import { OffersPolarisHome, type OfferTab } from "../components/OffersPolarisHome";
import {
  QuantityBreaksSelectCard,
  VolumeDiscountComingSoonCard,
} from "../components/OfferTypeSelectCards";
import {
  adminEmbeddedPath,
  adminEmbeddedPathWithQuery,
} from "../utils/adminEmbeddedPath";
import { buildVolumeDiscountOffersCsvExport } from "../utils/offersCsvExport.server";
import type { OffersListTab } from "../utils/offersTableViewOrder.server";
import { filterSortOffersForListView } from "../utils/offersTableViewOrder.shared";
import { resolveOffersListDisplayStatus } from "../utils/offersListLiveStatus";
import { storefrontProductPreviewUrl } from "../utils/storefrontProductPreviewUrl.server";
import { widgetPresentationFromStoredJson } from "../utils/widgetDisplay";
import {
  countActiveCampaigns,
  countAllCampaigns,
  resolveShopPlanContext,
} from "../utils/shopPlan.server";
import {
  canCreateAnotherOffer,
  createOfferBlockedMessage,
  getMaxActiveCampaigns,
  upgradeMessage,
} from "../utils/pricingPlans";
import { useAdminI18n } from "../components/AdminI18nProvider";

const OfferTypePreviewModal = lazy(() =>
  import("../components/OfferTypePreviewModal").then((m) => ({
    default: m.OfferTypePreviewModal,
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

  runAfterResponse(
    ensureVolumeDiscountFunctionDiscount(admin, session.shop).catch((e) => {
      console.warn("[volume-discount] ensure function discount", e);
    })
  );

  /* Flip Scheduled → Active / Active → Ended before listing. */
  const flipped = await applyDueCampaignScheduleTransitions(session.shop);
  if (flipped.shopsNeedingShopifySync.length) {
    scheduleVolumeDiscountShopSync(admin, session.shop, {
      skipScheduleTransitions: true,
      force: true,
    });
  }

  const [rows, planCtx] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        id: string;
        campaignName: string;
        displayName: string | null;
        productScope: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        countdownStartsAt: Date | null;
        countdownEndsAt: Date | null;
        tierCount: bigint;
        widgetPresentation: string | null;
      }>
    >(Prisma.sql`
      SELECT
        c."id",
        c."campaignName",
        c."displayName",
        c."productScope",
        c."status",
        c."createdAt",
        c."updatedAt",
        c."countdownStartsAt",
        c."countdownEndsAt",
        c."widgetDisplay"->>'widgetPresentation' AS "widgetPresentation",
        CASE
          WHEN jsonb_typeof(c."tiers") = 'array' THEN jsonb_array_length(c."tiers")
          ELSE 0
        END AS "tierCount"
      FROM "VolumeDiscountCampaign" c
      WHERE c."shop" = ${session.shop}
      ORDER BY c."updatedAt" DESC, c."createdAt" DESC
    `),
    resolveShopPlanContext(session.shop),
  ]);

  /* Warm preview URL cache without blocking Offers table + header actions paint. */
  runAfterResponse(
    storefrontProductPreviewUrl(admin, session.shop).catch((e) => {
      console.warn("[Offrefy] storefrontProductPreviewUrl warm", e);
    })
  );

  const { plan, capabilities } = planCtx;
  let activeCount = 0;
  for (const c of rows) {
    if (String(c.status).toLowerCase() === "active") activeCount += 1;
  }
  const offerCount = rows.length;

  return {
    storefrontProductPreviewUrl: null as string | null,
    plan,
    planCapabilities: capabilities,
    activeCount,
    offerCount,
    maxActiveCampaigns: getMaxActiveCampaigns(plan),
    campaigns: rows.map((c) => ({
      id: c.id,
      campaignName: c.campaignName,
      displayName: c.displayName,
      productScope: c.productScope,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      countdownStartsAt: c.countdownStartsAt?.toISOString() ?? null,
      countdownEndsAt: c.countdownEndsAt?.toISOString() ?? null,
      tierCount: Number(c.tierCount),
      widgetPresentation: widgetPresentationFromStoredJson(
        c.widgetPresentation
          ? { widgetPresentation: c.widgetPresentation }
          : null,
      ),
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
    const deletedNeedsShopifySync = rows.some((r) => {
      const s = String(r.status).toLowerCase();
      return s === "active" || s === "scheduled";
    });
    await prisma.volumeDiscountCampaign.deleteMany({
      where: { shop: session.shop, id: { in: targetIds } },
    });
    /* Draft-only deletes are not in the Shopify discount — skip slow sync. */
    if (!deletedNeedsShopifySync) {
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
    };
  }

  if (intent === "exportCsv") {
    const { capabilities } = await resolveShopPlanContext(session.shop);
    if (!capabilities.importExport) {
      return {
        ok: false as const,
        error: upgradeMessage("importExport"),
      };
    }
    const tabRaw = String(form.get("listTab") ?? "all");
    const tab: OffersListTab =
      tabRaw === "active" ||
      tabRaw === "draft" ||
      tabRaw === "scheduled"
        ? tabRaw
        : "all";
    const searchQuery = String(form.get("listQ") ?? "");
    const sort = String(form.get("listSort") ?? "modified desc");
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
      filename: "offrefy-offers-excel.csv",
      csv,
    };
  }

  if (intent === "bulkActivate" || intent === "bulkDeactivate") {
    if (campaignIds.length === 0) {
      return { ok: false as const, error: "Select at least one offer" };
    }
    const rows = await prisma.volumeDiscountCampaign.findMany({
      where: { shop: session.shop, id: { in: campaignIds } },
      select: { id: true, status: true },
    });
    if (rows.length !== campaignIds.length) {
      return { ok: false as const, error: "One or more offers not found" };
    }

    if (intent === "bulkActivate") {
      const [{ plan }, activeCount] = await Promise.all([
        resolveShopPlanContext(session.shop),
        countActiveCampaigns(session.shop),
      ]);
      const notAlreadyActive = rows.filter(
        (r) => String(r.status).toLowerCase() !== "active",
      );
      const max = getMaxActiveCampaigns(plan);
      const room =
        max == null
          ? notAlreadyActive.length
          : Math.max(0, max - activeCount);
      if (room === 0 && notAlreadyActive.length > 0) {
        return {
          ok: false as const,
          error: upgradeMessage("activeCampaigns"),
        };
      }
      const toActivate = notAlreadyActive.slice(0, room).map((r) => r.id);
      if (toActivate.length === 0) {
        return {
          ok: true as const,
          intent: "bulkActivate" as const,
          count: 0,
        };
      }
      await prisma.volumeDiscountCampaign.updateMany({
        where: { shop: session.shop, id: { in: toActivate } },
        data: { status: "active" },
      });
      scheduleVolumeDiscountShopSync(admin, session.shop);
      const skipped = notAlreadyActive.length - toActivate.length;
      return {
        ok: true as const,
        intent: "bulkActivate" as const,
        count: toActivate.length,
        syncPending: true as const,
        warning:
          skipped > 0
            ? `Activated ${toActivate.length}. ${skipped} skipped — ${upgradeMessage("activeCampaigns")}`
            : undefined,
      };
    }

    await prisma.volumeDiscountCampaign.updateMany({
      where: { shop: session.shop, id: { in: campaignIds } },
      data: { status: "draft" },
    });
    scheduleVolumeDiscountShopSync(admin, session.shop);
    return {
      ok: true as const,
      intent: "bulkDeactivate" as const,
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
    const { plan } = await resolveShopPlanContext(session.shop);
    const offerCount = await countAllCampaigns(session.shop);
    if (!canCreateAnotherOffer(plan, offerCount)) {
      return {
        ok: false as const,
        error: createOfferBlockedMessage(plan),
      };
    }
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
  const {
    campaigns,
    storefrontProductPreviewUrl: storefrontProductPreviewUrlFromLoader,
    planCapabilities,
    activeCount,
    offerCount,
    maxActiveCampaigns,
    plan,
  } = useLoaderData<typeof loader>();
  const { t } = useAdminI18n();
  const { search } = useLocation();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [screen, setScreen] = useState<Screen>(() => {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    return params.get("selectType") === "1" ? "select" : "home";
  });
  const [offerPreviewModal, setOfferPreviewModal] =
    useState<OfferTypePreviewPreset | null>(null);
  const [offerTab, setOfferTab] = useState<OfferTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortSelected, setSortSelected] = useState<string[]>(["modified desc"]);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Tick every second so Scheduled → Active (and end → Draft) flip live in the table.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Persist schedule flips + analytics via loader (stable interval; ref avoids effect churn).
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;
  useEffect(() => {
    const POLL_MS = 8_000;
    const softRevalidate = () => {
      if (document.visibilityState !== "visible") return;
      const r = revalidatorRef.current;
      if (r.state !== "idle") return;
      r.revalidate();
    };
    const timer = window.setInterval(softRevalidate, POLL_MS);
    softRevalidate();
    const onVis = () => {
      if (document.visibilityState === "visible") softRevalidate();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", softRevalidate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", softRevalidate);
    };
  }, []);

  // Deep link from Setup Guide / home "Create offer" → Select offer type.
  useEffect(() => {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    if (params.get("selectType") !== "1") return;
    setScreen("select");
    params.delete("selectType");
    const next = params.toString();
    navigate(
      next ? `/app/offers?${next}` : "/app/offers",
      { replace: true },
    );
  }, [navigate, search]);

  const atOfferCap =
    maxActiveCampaigns != null && offerCount >= maxActiveCampaigns;
  const offerLimitMessage = createOfferBlockedMessage(plan);
  const [offerLimitModalOpen, setOfferLimitModalOpen] = useState(false);

  const showOfferLimitUpgrade = useCallback(() => {
    setOfferLimitModalOpen(true);
  }, []);

  const tryOpenCreate = useCallback(() => {
    if (atOfferCap) {
      showOfferLimitUpgrade();
      return;
    }
    setScreen("select");
  }, [atOfferCap, showOfferLimitUpgrade]);

  const liveCampaigns = useMemo(
    () =>
      campaigns.map((c) => ({
        ...c,
        status: resolveOffersListDisplayStatus(c, nowMs),
      })),
    [campaigns, nowMs],
  );

  const nextDefaultCampaignName = useMemo(
    () => t("offers.defaultName", { n: liveCampaigns.length + 1 }),
    [liveCampaigns.length, t],
  );

  const toastSoon = useCallback(
    (label: string) => {
      shopify.toast.show(t("offers.comingSoon", { label }));
    },
    [shopify, t],
  );

  const filteredCampaigns = useMemo(
    () =>
      filterSortOffersForListView(liveCampaigns, {
        tab: offerTab,
        searchQuery: deferredSearchQuery,
        sort: sortSelected[0] ?? "modified desc",
      }),
    [liveCampaigns, deferredSearchQuery, offerTab, sortSelected],
  );

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
          title={t("offers.selectTypeTitle")}
          subtitle={t("offers.selectTypeSubtitle")}
          backAction={{
            content: t("offers.back"),
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
                <QuantityBreaksSelectCard
                  title={t("offers.quantityBreaks")}
                  createLocked={atOfferCap}
                  onPreview={() => setOfferPreviewModal("quantity")}
                  onLearnMore={() => toastSoon(t("common.learnMore"))}
                  onCreate={() => {
                    if (atOfferCap) {
                      showOfferLimitUpgrade();
                      return;
                    }
                    navigate(
                      adminEmbeddedPathWithQuery(
                        "/app/volume-discount/new",
                        search,
                        { preset: "quantity" },
                      ),
                      {
                        state: {
                          defaultCampaignName: nextDefaultCampaignName,
                        },
                      },
                    );
                  }}
                />
                <VolumeDiscountComingSoonCard
                  title={t("offers.volumeDiscount")}
                  createLocked={atOfferCap}
                  onPreview={() => setOfferPreviewModal("volume")}
                  onLearnMore={() => toastSoon(t("common.learnMore"))}
                  onCreate={() => {
                    if (atOfferCap) {
                      showOfferLimitUpgrade();
                      return;
                    }
                    navigate(
                      adminEmbeddedPathWithQuery(
                        "/app/volume-discount/new",
                        search,
                        { preset: "volume" },
                      ),
                      {
                        state: {
                          defaultCampaignName: nextDefaultCampaignName,
                        },
                      },
                    );
                  }}
                />
              </InlineGrid>
            </div>
          </Box>
        </Page>
        <OfferLimitUpgradeModal
          open={offerLimitModalOpen}
          onClose={() => setOfferLimitModalOpen(false)}
          message={offerLimitMessage}
        />
      </>
    );
  }

  return (
    <>
      <OffersPolarisHome
        campaigns={liveCampaigns}
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
        canImportExport={planCapabilities.importExport}
        activeCount={
          liveCampaigns.filter((c) => c.status.toLowerCase() === "active")
            .length
        }
        maxActiveCampaigns={maxActiveCampaigns}
        atOfferCap={atOfferCap}
        createOfferBlockedMessage={offerLimitMessage}
        onCreateOffer={tryOpenCreate}
        onOfferLimitReached={showOfferLimitUpgrade}
      />
      <OfferLimitUpgradeModal
        open={offerLimitModalOpen}
        onClose={() => setOfferLimitModalOpen(false)}
        message={offerLimitMessage}
      />
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
