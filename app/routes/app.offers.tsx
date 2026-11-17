import { Prisma } from "@prisma/client";
import {
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
import { bogoCampaignDb } from "../utils/bogoPrisma.server";
import { ensureVolumeDiscountFunctionDiscount } from "../services/volumeDiscountFunctionSync.server";
import {
  runAfterResponse,
  scheduleVolumeDiscountShopSync,
} from "../services/deferredShopSync.server";
import { applyDueCampaignScheduleTransitions } from "../services/scheduledVolumeDiscountSync.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { OfferLimitUpgradeModal } from "../components/OfferLimitUpgradeModal";
import {
  OffersPolarisHome,
  type OfferCampaignRow,
  type OfferTab,
} from "../components/OffersPolarisHome";
import {
  BogoSelectCard,
  QuantityBreaksSelectCard,
  VolumeDiscountComingSoonCard,
} from "../components/OfferTypeSelectCards";
import {
  applyDueBogoScheduleTransitions,
  deleteBogoCampaign,
  setBogoCampaignsStatus,
  syncDueBogoScheduleToShopify,
} from "../services/bogoBxgySync.server";
import {
  adminEmbeddedPath,
  adminEmbeddedPathWithQuery,
} from "../utils/adminEmbeddedPath";
import { buildVolumeDiscountOffersCsvExport } from "../utils/offersCsvExport.server";
import type { OffersListTab } from "../utils/offersTableViewOrder.server";
import { filterSortOffersForListView } from "../utils/offersTableViewOrder.shared";
import { resolveOffersListDisplayStatus } from "../utils/offersListLiveStatus";
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

type OffersVolumeListRow = {
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
};

type OffersBogoListRow = {
  id: string;
  campaignName: string;
  displayName: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  buysScope: string;
  createdAt: Date;
  updatedAt: Date;
};

type OffersStatusIdRow = { id: string; status: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  runAfterResponse(
    ensureVolumeDiscountFunctionDiscount(admin, session.shop).catch((e) => {
      console.warn("[volume-discount] ensure function discount", e);
    })
  );

  /* Flip Scheduled → Active / Active → Ended before listing (parallel). */
  const [flipped, bogoFlipped] = await Promise.all([
    applyDueCampaignScheduleTransitions(session.shop),
    applyDueBogoScheduleTransitions(session.shop),
  ]);
  if (flipped.shopsNeedingShopifySync.length) {
    scheduleVolumeDiscountShopSync(admin, session.shop, {
      skipScheduleTransitions: true,
      force: true,
    });
  }
  if (bogoFlipped.idsNeedingSync.length) {
    const idsToSync = bogoFlipped.idsNeedingSync;
    runAfterResponse(
      syncDueBogoScheduleToShopify(admin, session.shop, idsToSync).catch(
        (e) => {
          console.warn("[bogo] schedule sync", e);
        },
      ),
    );
  }

  const [rows, bogoRows, planCtx] = await Promise.all([
    prisma.$queryRaw<OffersVolumeListRow[]>(Prisma.sql`
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
    bogoCampaignDb().findMany({
      where: { shop: session.shop },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        campaignName: true,
        displayName: true,
        status: true,
        startsAt: true,
        endsAt: true,
        buysScope: true,
        createdAt: true,
        updatedAt: true,
      },
    }) as Promise<OffersBogoListRow[]>,
    resolveShopPlanContext(session.shop),
  ]);

  const { plan, capabilities } = planCtx;
  const volumeCampaigns = rows.map((c: OffersVolumeListRow) => ({
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
    offerKind: "volume" as const,
  }));

  const bogoCampaigns = bogoRows.map((c: OffersBogoListRow) => ({
    id: c.id,
    campaignName: c.campaignName,
    displayName: c.displayName,
    productScope:
      c.buysScope === "collections" ? "collections" : "specific-products",
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    countdownStartsAt: c.startsAt.toISOString(),
    countdownEndsAt: c.endsAt?.toISOString() ?? null,
    tierCount: 0,
    widgetPresentation: "tier_cards" as const,
    offerKind: "bogo" as const,
  }));

  const campaigns = [...volumeCampaigns, ...bogoCampaigns].sort((a, b) => {
    const ub = Date.parse(b.updatedAt);
    const ua = Date.parse(a.updatedAt);
    if (ub !== ua) return ub - ua;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  let activeCount = 0;
  for (const c of campaigns) {
    if (String(c.status).toLowerCase() === "active") activeCount += 1;
  }
  const offerCount = campaigns.length;

  return {
    plan,
    planCapabilities: capabilities,
    activeCount,
    offerCount,
    maxActiveCampaigns: getMaxActiveCampaigns(plan),
    campaigns,
  };
};

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("_action") ?? "");
  const campaignId = String(form.get("campaignId") ?? "").trim();
  const campaignIds: string[] = [
    ...new Set(
      form
        .getAll("campaignIds")
        .map((v) => String(v).trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (intent === "delete") {
    const targetIds =
      campaignIds.length > 0 ? campaignIds : campaignId ? [campaignId] : [];
    if (targetIds.length === 0) {
      return { ok: false as const, error: "Missing offer" };
    }
    const [volumeRows, bogoRows] = await Promise.all([
      prisma.volumeDiscountCampaign.findMany({
        where: { shop: session.shop, id: { in: targetIds } },
        select: { id: true, status: true },
      }) as Promise<OffersStatusIdRow[]>,
      bogoCampaignDb().findMany({
        where: { shop: session.shop, id: { in: targetIds } },
        select: { id: true, status: true },
      }) as Promise<OffersStatusIdRow[]>,
    ]);
    const foundIds = new Set([
      ...volumeRows.map((r: OffersStatusIdRow) => r.id),
      ...bogoRows.map((r: OffersStatusIdRow) => r.id),
    ]);
    if (foundIds.size !== targetIds.length) {
      return { ok: false as const, error: "One or more offers not found" };
    }

    const volumeIds = volumeRows.map((r: OffersStatusIdRow) => r.id);
    const bogoIds = bogoRows.map((r: OffersStatusIdRow) => r.id);

    if (bogoIds.length) {
      const { errors } = await deleteBogoCampaign(admin, session.shop, bogoIds);
      if (errors.length) {
        console.warn("[bogo] delete", errors.join("; "));
      }
      const { flushStorefrontWidgetPayloadNow } = await import(
        "../services/refreshStorefrontWidget.server"
      );
      await flushStorefrontWidgetPayloadNow(admin, session.shop).catch((e) => {
        console.warn("[bogo] storefront flush after delete", e);
      });
    }

    if (volumeIds.length) {
      const deletedNeedsShopifySync = volumeRows.some((r: OffersStatusIdRow) => {
        const s = String(r.status).toLowerCase();
        return s === "active" || s === "scheduled";
      });
      await prisma.volumeDiscountCampaign.deleteMany({
        where: { shop: session.shop, id: { in: volumeIds } },
      });
      if (deletedNeedsShopifySync) {
        scheduleVolumeDiscountShopSync(admin, session.shop);
      }
    }

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
    const [volumeRows, bogoRows] = await Promise.all([
      prisma.volumeDiscountCampaign.findMany({
        where: { shop: session.shop, id: { in: campaignIds } },
        select: { id: true, status: true },
      }) as Promise<OffersStatusIdRow[]>,
      bogoCampaignDb().findMany({
        where: { shop: session.shop, id: { in: campaignIds } },
        select: { id: true, status: true },
      }) as Promise<OffersStatusIdRow[]>,
    ]);
    const foundIds = new Set([
      ...volumeRows.map((r: OffersStatusIdRow) => r.id),
      ...bogoRows.map((r: OffersStatusIdRow) => r.id),
    ]);
    if (foundIds.size !== campaignIds.length) {
      return { ok: false as const, error: "One or more offers not found" };
    }

    if (intent === "bulkActivate") {
      const [{ plan }, activeCount] = await Promise.all([
        resolveShopPlanContext(session.shop),
        countActiveCampaigns(session.shop),
      ]);
      const notAlreadyActive = [
        ...volumeRows.filter(
          (r: OffersStatusIdRow) => String(r.status).toLowerCase() !== "active",
        ),
        ...bogoRows.filter(
          (r: OffersStatusIdRow) => String(r.status).toLowerCase() !== "active",
        ),
      ];
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
      const toActivate = notAlreadyActive
        .slice(0, room)
        .map((r: OffersStatusIdRow) => r.id);
      if (toActivate.length === 0) {
        return {
          ok: true as const,
          intent: "bulkActivate" as const,
          count: 0,
        };
      }
      const volumeActivate = toActivate.filter((id: string) =>
        volumeRows.some((r: OffersStatusIdRow) => r.id === id),
      );
      const bogoActivate = toActivate.filter((id: string) =>
        bogoRows.some((r: OffersStatusIdRow) => r.id === id),
      );
      if (volumeActivate.length) {
        await prisma.volumeDiscountCampaign.updateMany({
          where: { shop: session.shop, id: { in: volumeActivate } },
          data: { status: "active" },
        });
        scheduleVolumeDiscountShopSync(admin, session.shop);
      }
      if (bogoActivate.length) {
        await setBogoCampaignsStatus(
          admin,
          session.shop,
          bogoActivate,
          "active",
        );
        const { flushStorefrontWidgetPayloadNow } = await import(
          "../services/refreshStorefrontWidget.server"
        );
        await flushStorefrontWidgetPayloadNow(admin, session.shop).catch(
          (e) => {
            console.warn("[bogo] storefront flush after activate", e);
          },
        );
      }
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

    const volumeDeactivate = volumeRows.map((r: OffersStatusIdRow) => r.id);
    const bogoDeactivate = bogoRows.map((r: OffersStatusIdRow) => r.id);
    if (volumeDeactivate.length) {
      await prisma.volumeDiscountCampaign.updateMany({
        where: { shop: session.shop, id: { in: volumeDeactivate } },
        data: { status: "draft" },
      });
      scheduleVolumeDiscountShopSync(admin, session.shop);
    }
    if (bogoDeactivate.length) {
      await setBogoCampaignsStatus(
        admin,
        session.shop,
        bogoDeactivate,
        "draft",
      );
      const { flushStorefrontWidgetPayloadNow } = await import(
        "../services/refreshStorefrontWidget.server"
      );
      await flushStorefrontWidgetPayloadNow(admin, session.shop).catch((e) => {
        console.warn("[bogo] storefront flush after draft", e);
      });
    }
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

  if (intent === "duplicate") {
    const { plan } = await resolveShopPlanContext(session.shop);
    const offerCount = await countAllCampaigns(session.shop);
    if (!canCreateAnotherOffer(plan, offerCount)) {
      return {
        ok: false as const,
        error: createOfferBlockedMessage(plan),
      };
    }

    if (row) {
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

    const bogoRow = (await bogoCampaignDb().findFirst({
      where: { id: campaignId, shop: session.shop },
    })) as {
      shop: string;
      campaignName: string;
      displayName: string | null;
      startsAt: Date;
      endsAt: Date | null;
      buysRequirement: string;
      buysQuantity: number | null;
      buysAmount: string | null;
      buysScope: string;
      buysProductIds: Prisma.JsonValue;
      buysCollectionIds: Prisma.JsonValue;
      getsQuantity: number;
      getsScope: string;
      getsProductIds: Prisma.JsonValue;
      getsCollectionIds: Prisma.JsonValue;
      getsValueType: string;
      getsValue: string | null;
      usesPerOrderLimit: number | null;
    } | null;
    if (!bogoRow) {
      return { ok: false as const, error: "Offer not found" };
    }
    const copyName = `${bogoRow.campaignName} (copy)`.slice(0, 500);
    await bogoCampaignDb().create({
      data: {
        shop: bogoRow.shop,
        campaignName: copyName,
        displayName: bogoRow.displayName,
        status: "draft",
        startsAt: bogoRow.startsAt,
        endsAt: bogoRow.endsAt,
        buysRequirement: bogoRow.buysRequirement,
        buysQuantity: bogoRow.buysQuantity,
        buysAmount: bogoRow.buysAmount,
        buysScope: bogoRow.buysScope,
        buysProductIds: bogoRow.buysProductIds as Prisma.InputJsonValue,
        buysCollectionIds: bogoRow.buysCollectionIds as Prisma.InputJsonValue,
        getsQuantity: bogoRow.getsQuantity,
        getsScope: bogoRow.getsScope,
        getsProductIds: bogoRow.getsProductIds as Prisma.InputJsonValue,
        getsCollectionIds: bogoRow.getsCollectionIds as Prisma.InputJsonValue,
        getsValueType: bogoRow.getsValueType,
        getsValue: bogoRow.getsValue,
        usesPerOrderLimit: bogoRow.usesPerOrderLimit,
        shopifyDiscountId: null,
      },
    });
    return { ok: true as const, intent: "duplicate" as const };
  }

  if (!row) {
    return { ok: false as const, error: "Offer not found" };
  }

  return { ok: false as const, error: "Unknown action" };
}

export default function Index() {
  const {
    campaigns,
    planCapabilities,
    activeCount: _activeCount,
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
  const [offerTab, setOfferTab] = useState<OfferTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortSelected, setSortSelected] = useState<string[]>(["modified desc"]);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Tick only when a row can flip by clock (scheduled / timed active) — avoids 1 Hz re-renders.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const needsLiveClock = useMemo(
    () =>
      campaigns.some((c) => {
        const status = String(c.status ?? "").toLowerCase();
        if (status === "scheduled") return true;
        if (status === "active" && c.countdownEndsAt) return true;
        return false;
      }),
    [campaigns],
  );
  useEffect(() => {
    if (!needsLiveClock) {
      setNowMs(Date.now());
      return;
    }
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [needsLiveClock]);

  // Persist schedule flips via loader. 30s is enough — client clock already flips badges live.
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;
  useEffect(() => {
    const POLL_MS = 30_000;
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
      filterSortOffersForListView<OfferCampaignRow>(liveCampaigns, {
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
    (id: string, offerKind?: "volume" | "bogo") =>
      adminEmbeddedPath(
        offerKind === "bogo"
          ? `/app/bogo/${id}`
          : `/app/volume-discount/${id}`,
        search,
      ),
    [search],
  );

  if (screen === "select") {
    return (
      <>
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
                maxWidth: "1200px",
                marginInline: "auto",
              }}
            >
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
                <QuantityBreaksSelectCard
                  title={t("offers.quantityBreaks")}
                  createLocked={atOfferCap}
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
                <BogoSelectCard
                  title={t("offers.bogo")}
                  createLocked={atOfferCap}
                  onCreate={() => {
                    if (atOfferCap) {
                      showOfferLimitUpgrade();
                      return;
                    }
                    navigate(adminEmbeddedPath("/app/bogo/new", search), {
                      state: {
                        defaultCampaignName: nextDefaultCampaignName,
                      },
                    });
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
