import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/AppButton";
import { authenticate } from "../shopify.server";
import { SHOPIFY_APP_SCOPES } from "../shopifyAppScopes";
import { loadAnalyticsDashboard } from "../utils/volumeDiscountAnalytics.server";
import type { CampaignAnalyticsRow } from "../utils/volumeDiscountAnalytics.server";
import {
  formatAnalyticsCount,
  formatAnalyticsMoney,
  parseAnalyticsRangeFromUrl,
} from "../utils/volumeDiscountAnalytics.shared";
import { AnalyticsDateRangeFilter } from "../components/AnalyticsDateRangeFilter";
import { AnalyticsCampaignSortDropdown } from "../components/AnalyticsCampaignSortDropdown";
import { PlanUpgradeBanner } from "../components/PlanUpgradeBanner";
import { useAdminI18n } from "../components/AdminI18nProvider";
import type { AdminUiMessageKey } from "../utils/adminUiMessages";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeSelection = parseAnalyticsRangeFromUrl(url);
  const grantedScopes = (session.scope ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  const [planCtx, analytics] = await Promise.all([
    import("../utils/shopPlan.server").then((m) =>
      m.resolveShopPlanContext(session.shop),
    ),
    loadAnalyticsDashboard(session.shop, rangeSelection, admin, {
      grantedScopes,
    }),
  ]);
  const { plan, capabilities } = planCtx;

  return {
    analytics,
    rangeSelection,
    plan,
    analyticsTier: capabilities.analytics,
  };
};

function changeBadgeTone(change: string | null): "success" | "critical" | "info" {
  if (!change || change === "0%") return "info";
  return change.startsWith("-") ? "critical" : "success";
}

type MetricIconType = "view" | "cart" | "discount" | "arrow-up" | "arrow-down";

function changeIconType(change: string | null): MetricIconType | null {
  if (!change || change === "0%") return null;
  return change.startsWith("-") ? "arrow-down" : "arrow-up";
}

/** Polaris web: s-box metric card — same props / change badge logic */
function MetricCard({
  title,
  value,
  hint,
  change,
  icon,
  iconColor,
  vsPreviousPeriod,
}: {
  title: string;
  value: string;
  hint?: string;
  change?: string | null;
  icon?: MetricIconType;
  iconColor?: string;
  vsPreviousPeriod: string;
}) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="large"
      background="base"
    >
      <s-stack direction="block" gap="small-200">
        <s-stack
          direction="inline"
          justifyContent="space-between"
          alignItems="center"
        >
          <s-text color="subdued">{title}</s-text>
          {icon ? (
            <span style={{ color: iconColor ?? "#5c5f62" }}>
              <s-icon type={icon} />
            </span>
          ) : change ? (
            <span
              style={{
                color:
                  changeBadgeTone(change) === "critical" ? "#bf0711" : "#008060",
              }}
            >
              <s-icon type={changeIconType(change) ?? "arrow-up"} />
            </span>
          ) : null}
        </s-stack>
        <s-heading>{value}</s-heading>
        {change ? (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone={changeBadgeTone(change)}>{change}</s-badge>
            <s-text color="subdued">{vsPreviousPeriod}</s-text>
          </s-stack>
        ) : hint ? (
          <s-text color="subdued">{hint}</s-text>
        ) : null}
      </s-stack>
    </s-box>
  );
}

const DOW_KEYS: Record<string, AdminUiMessageKey> = {
  Sun: "analytics.dow.sun",
  Mon: "analytics.dow.mon",
  Tue: "analytics.dow.tue",
  Wed: "analytics.dow.wed",
  Thu: "analytics.dow.thu",
  Fri: "analytics.dow.fri",
  Sat: "analytics.dow.sat",
};

const CAMPAIGN_STATUS_KEYS: Record<string, AdminUiMessageKey> = {
  active: "offers.status.active",
  draft: "offers.status.draft",
  scheduled: "offers.status.scheduled",
  archived: "offers.status.archived",
};

/** Polaris web: s-stack funnel row — same width math */
function FunnelBar({
  label,
  value,
  max,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
  suffix?: string;
}) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <s-stack direction="block" gap="small-200">
      <s-stack direction="inline" justifyContent="space-between">
        <s-text>{label}</s-text>
        <s-text color="subdued">
          {value.toLocaleString()}
          {suffix ? ` · ${suffix}` : ""}
        </s-text>
      </s-stack>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: "#f1f1f1",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            background: tone,
            borderRadius: 4,
          }}
        />
      </div>
    </s-stack>
  );
}

const CAMPAIGN_PAGE_SIZE = 25;

function parseConversionRate(value: string): number {
  const n = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

function compareCampaignName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function sortCampaignRows(
  rows: CampaignAnalyticsRow[],
  sortBy: string,
): CampaignAnalyticsRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "revenue asc":
        return a.revenueCents - b.revenueCents;
      case "views desc":
        return b.views - a.views;
      case "views asc":
        return a.views - b.views;
      case "atc desc":
        return b.addToCart - a.addToCart;
      case "atc asc":
        return a.addToCart - b.addToCart;
      case "cr desc":
        return (
          parseConversionRate(b.conversionRate) -
          parseConversionRate(a.conversionRate)
        );
      case "cr asc":
        return (
          parseConversionRate(a.conversionRate) -
          parseConversionRate(b.conversionRate)
        );
      case "name asc":
        return compareCampaignName(a.campaignName, b.campaignName);
      case "name desc":
        return compareCampaignName(b.campaignName, a.campaignName);
      case "revenue desc":
      default:
        return b.revenueCents - a.revenueCents;
    }
  });
  return sorted;
}

export default function AnalyticsPage() {
  const { analytics, rangeSelection, analyticsTier } =
    useLoaderData<typeof loader>();
  const { t } = useAdminI18n();
  const revalidator = useRevalidator();
  const [campaignSearch, setCampaignSearch] = useState("");
  const [sortBy, setSortBy] = useState("revenue desc");
  const [campaignPageIndex, setCampaignPageIndex] = useState(0);
  const isRefreshing = revalidator.state === "loading";
  const showStandardAnalytics =
    analyticsTier === "standard" || analyticsTier === "advanced";
  const showAdvancedAnalytics = analyticsTier === "advanced";
  const vsPreviousPeriod = t("analytics.vsPreviousPeriod");

  const campaignSortSelectOptions = useMemo(
    () => [
      { label: t("analytics.sort.salesHigh"), value: "revenue desc" },
      { label: t("analytics.sort.salesLow"), value: "revenue asc" },
      { label: t("analytics.sort.impressionsHigh"), value: "views desc" },
      { label: t("analytics.sort.impressionsLow"), value: "views asc" },
      { label: t("analytics.sort.atcHigh"), value: "atc desc" },
      { label: t("analytics.sort.atcLow"), value: "atc asc" },
      { label: t("analytics.sort.conversionHigh"), value: "cr desc" },
      { label: t("analytics.sort.conversionLow"), value: "cr asc" },
      { label: t("analytics.sort.nameAsc"), value: "name asc" },
      { label: t("analytics.sort.nameDesc"), value: "name desc" },
    ],
    [t],
  );

  useEffect(() => {
    const intervalMs = 60_000;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      revalidator.revalidate();
    };
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [revalidator]);

  const metrics = analytics.metrics;

  const filteredCampaignRows = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    const rows = analytics.campaignRows.filter((row) => {
      if (query && !row.campaignName.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
    return sortCampaignRows(rows, sortBy);
  }, [analytics.campaignRows, campaignSearch, sortBy]);

  useEffect(() => {
    setCampaignPageIndex(0);
  }, [campaignSearch, sortBy]);

  const campaignPagination = useMemo(() => {
    const total = filteredCampaignRows.length;
    const maxPage = Math.max(0, Math.ceil(total / CAMPAIGN_PAGE_SIZE) - 1);
    const safePage = Math.min(campaignPageIndex, maxPage);
    const start = safePage * CAMPAIGN_PAGE_SIZE;
    const end = Math.min(start + CAMPAIGN_PAGE_SIZE, total);
    return {
      rows: filteredCampaignRows.slice(start, end),
      total,
      rangeStart: total === 0 ? 0 : start + 1,
      rangeEnd: end,
      hasPrevious: safePage > 0,
      hasNext: safePage < maxPage,
    };
  }, [filteredCampaignRows, campaignPageIndex]);

  const svgHeight = 220;
  const svgWidth = 600;
  const padding = 40;

  const chartPaths = useMemo(() => {
    const data = metrics.chartData;
    if (!data.length) {
      return {
        revenuePath: "",
        viewsPath: "",
        addToCartPath: "",
        revenueFillPath: "",
        viewsFillPath: "",
        revenuePoints: [],
        viewsPoints: [],
        addToCartPoints: [],
      };
    }

    const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
    const maxViews = Math.max(...data.map((d) => d.views), 1);
    const maxAddToCart = Math.max(...data.map((d) => d.addToCart), 1);

    const getX = (index: number) =>
      data.length === 1
        ? svgWidth / 2
        : padding + (index / (data.length - 1)) * (svgWidth - padding * 2);
    const getY = (val: number, max: number) =>
      svgHeight - padding - (val / max) * (svgHeight - padding * 2);

    let revPath = "";
    let viewPath = "";
    let atcPath = "";
    const revPts: Array<{ x: number; y: number; val: number }> = [];
    const viewPts: Array<{ x: number; y: number; val: number }> = [];
    const atcPts: Array<{ x: number; y: number; val: number }> = [];

    data.forEach((d, i) => {
      const x = getX(i);
      const yRev = getY(d.revenue, maxRevenue);
      const yView = getY(d.views, maxViews);
      const yAtc = getY(d.addToCart, maxAddToCart);

      revPts.push({ x, y: yRev, val: d.revenue });
      viewPts.push({ x, y: yView, val: d.views });
      atcPts.push({ x, y: yAtc, val: d.addToCart });

      if (i === 0) {
        revPath += `M ${x} ${yRev}`;
        viewPath += `M ${x} ${yView}`;
        atcPath += `M ${x} ${yAtc}`;
      } else {
        const prevX = getX(i - 1);
        const prevYRev = getY(data[i - 1].revenue, maxRevenue);
        const prevYView = getY(data[i - 1].views, maxViews);
        const prevYAtc = getY(data[i - 1].addToCart, maxAddToCart);
        const cpX1 = prevX + (x - prevX) / 2;
        revPath += ` C ${cpX1} ${prevYRev}, ${cpX1} ${yRev}, ${x} ${yRev}`;
        viewPath += ` C ${cpX1} ${prevYView}, ${cpX1} ${yView}, ${x} ${yView}`;
        atcPath += ` C ${cpX1} ${prevYAtc}, ${cpX1} ${yAtc}, ${x} ${yAtc}`;
      }
    });

    const firstX = getX(0);
    const lastX = getX(data.length - 1);
    const bottomY = svgHeight - padding;

    return {
      revenuePath: revPath,
      revenueFillPath: `${revPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`,
      viewsPath: viewPath,
      viewsFillPath: `${viewPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`,
      addToCartPath: atcPath,
      revenuePoints: revPts,
      viewsPoints: viewPts,
      addToCartPoints: atcPts,
    };
  }, [metrics.chartData]);

  const dayOfWeekMax = useMemo(
    () =>
      Math.max(
        1,
        ...analytics.dayOfWeek.map((d) => d.impressions + d.addToCart),
      ),
    [analytics.dayOfWeek],
  );

  return (
    /* Polaris web: s-page — Analytics dashboard shell */
    <s-page heading={t("analytics.title")} inlineSize="large">
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <s-stack direction="block" gap="base">
          {!analytics.hasTrackingData ? (
            <s-text color="subdued">{t("analytics.noActivity")}</s-text>
          ) : null}

          {analytics.ordersSync.needsReadOrdersScope ||
          analytics.ordersSync.syncError ? (
            /* Polaris web: s-banner — same orders sync messaging */
            <s-banner tone="warning" heading={t("analytics.ordersBannerTitle")}>
              {analytics.ordersSync.syncError ??
                t("analytics.ordersBannerBody", {
                  scopes: SHOPIFY_APP_SCOPES.join(", "),
                })}
            </s-banner>
          ) : null}

          <s-stack
            direction="inline"
            gap="small-200"
            justifyContent="end"
            alignItems="center"
          >
            {/* Polaris web: s-button — same revalidator.revalidate */}
            <Button
              icon="refresh"
              accessibilityLabel={t("common.reload")}
              onClick={() => revalidator.revalidate()}
              loading={isRefreshing}
              disabled={isRefreshing}
            />
            <AnalyticsDateRangeFilter selection={rangeSelection} />
          </s-stack>

          {/* Polaris web: s-grid — primary metric cards */}
          <s-grid
            gap="base"
            gridTemplateColumns="repeat(auto-fit, minmax(14rem, 1fr))"
          >
            <MetricCard
              title={t("analytics.metric.widgetSales")}
              value={formatAnalyticsMoney(metrics.revenueCents)}
              change={metrics.revenueChange}
              hint={t("analytics.metric.widgetSalesHint")}
              vsPreviousPeriod={vsPreviousPeriod}
            />
            <MetricCard
              title={t("analytics.metric.offerImpressions")}
              value={formatAnalyticsCount(metrics.impressions)}
              change={metrics.impressionsChange}
              icon="view"
              iconColor="#2c6ecb"
              hint={t("analytics.metric.offerImpressionsHint")}
              vsPreviousPeriod={vsPreviousPeriod}
            />
            <MetricCard
              title={t("analytics.metric.addToCart")}
              value={formatAnalyticsCount(metrics.addToCart)}
              change={metrics.addToCartChange}
              icon="cart"
              iconColor="#b98900"
              hint={t("analytics.metric.addToCartHint")}
              vsPreviousPeriod={vsPreviousPeriod}
            />
            <MetricCard
              title={t("analytics.metric.conversionRate")}
              value={metrics.conversionRate}
              change={metrics.conversionChange}
              hint={t("analytics.metric.conversionRateHint")}
              vsPreviousPeriod={vsPreviousPeriod}
            />
          </s-grid>

          {showStandardAnalytics ? (
            <s-grid
              gap="base"
              gridTemplateColumns="repeat(auto-fit, minmax(14rem, 1fr))"
            >
              <MetricCard
                title={t("analytics.metric.avgCartValue")}
                value={formatAnalyticsMoney(metrics.avgCartValueCents)}
                change={metrics.avgCartValueChange}
                hint={t("analytics.metric.avgCartValueHint")}
                vsPreviousPeriod={vsPreviousPeriod}
              />
              <MetricCard
                title={t("analytics.metric.avgQuantity")}
                value={metrics.avgQuantity}
                hint={t("analytics.metric.avgQuantityHint")}
                vsPreviousPeriod={vsPreviousPeriod}
              />
              <MetricCard
                title={t("analytics.metric.revenuePerImpression")}
                value={formatAnalyticsMoney(metrics.revenuePerImpressionCents)}
                hint={t("analytics.metric.revenuePerImpressionHint")}
                vsPreviousPeriod={vsPreviousPeriod}
              />
              <MetricCard
                title={t("analytics.metric.activeCampaigns")}
                value={metrics.activeCampaigns}
                icon="discount"
                iconColor="#bf0711"
                hint={t("analytics.metric.activeCampaignsHint")}
                vsPreviousPeriod={vsPreviousPeriod}
              />
            </s-grid>
          ) : (
            <PlanUpgradeBanner feature="analytics" />
          )}

          {showStandardAnalytics ? (
            /* Polaris web: s-grid — charts row */
            <s-grid
              gap="base"
              gridTemplateColumns="repeat(auto-fit, minmax(18rem, 1fr))"
            >
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="large"
                background="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack
                    direction="inline"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <s-heading>
                      {t("analytics.chart.performanceOverTime")}
                    </s-heading>
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-stack
                        direction="inline"
                        gap="small-200"
                        alignItems="center"
                      >
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: "#008060",
                            display: "inline-block",
                          }}
                        />
                        <s-text color="subdued">
                          {t("analytics.chart.legendWidgetSales")}
                        </s-text>
                      </s-stack>
                      <s-stack
                        direction="inline"
                        gap="small-200"
                        alignItems="center"
                      >
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: "#2c6ecb",
                            display: "inline-block",
                          }}
                        />
                        <s-text color="subdued">
                          {t("analytics.chart.legendImpressions")}
                        </s-text>
                      </s-stack>
                      <s-stack
                        direction="inline"
                        gap="small-200"
                        alignItems="center"
                      >
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: "#b98900",
                            display: "inline-block",
                          }}
                        />
                        <s-text color="subdued">
                          {t("analytics.chart.legendAddToCart")}
                        </s-text>
                      </s-stack>
                    </s-stack>
                  </s-stack>

                  <s-box inlineSize="100%">
                    <div
                      style={{
                        width: "100%",
                        overflowX: "auto",
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <svg
                        width="100%"
                        height={svgHeight}
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        style={{ maxWidth: "600px", overflow: "visible" }}
                      >
                        <defs>
                          <linearGradient
                            id="salesGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#008060"
                              stopOpacity="0.25"
                            />
                            <stop
                              offset="100%"
                              stopColor="#008060"
                              stopOpacity="0.0"
                            />
                          </linearGradient>
                          <linearGradient
                            id="viewsGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#2c6ecb"
                              stopOpacity="0.25"
                            />
                            <stop
                              offset="100%"
                              stopColor="#2c6ecb"
                              stopOpacity="0.0"
                            />
                          </linearGradient>
                        </defs>

                        {[0, 1, 2, 3, 4].map((grid, idx) => {
                          const yVal =
                            padding + (idx / 4) * (svgHeight - padding * 2);
                          return (
                            <line
                              key={idx}
                              x1={padding}
                              y1={yVal}
                              x2={svgWidth - padding}
                              y2={yVal}
                              stroke="#f1f1f1"
                              strokeWidth="1"
                            />
                          );
                        })}

                        {chartPaths.revenueFillPath ? (
                          <path
                            d={chartPaths.revenueFillPath}
                            fill="url(#salesGrad)"
                          />
                        ) : null}
                        {chartPaths.viewsFillPath ? (
                          <path
                            d={chartPaths.viewsFillPath}
                            fill="url(#viewsGrad)"
                          />
                        ) : null}
                        {chartPaths.revenuePath ? (
                          <path
                            d={chartPaths.revenuePath}
                            fill="none"
                            stroke="#008060"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        ) : null}
                        {chartPaths.viewsPath ? (
                          <path
                            d={chartPaths.viewsPath}
                            fill="none"
                            stroke="#2c6ecb"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        ) : null}
                        {chartPaths.addToCartPath ? (
                          <path
                            d={chartPaths.addToCartPath}
                            fill="none"
                            stroke="#b98900"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray="6 4"
                          />
                        ) : null}

                        {chartPaths.revenuePoints.map((pt, idx) => (
                          <circle
                            key={`sales-${idx}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="4"
                            fill="#ffffff"
                            stroke="#008060"
                            strokeWidth="2.5"
                          />
                        ))}

                        {chartPaths.viewsPoints.map((pt, idx) => (
                          <circle
                            key={`views-${idx}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="4"
                            fill="#ffffff"
                            stroke="#2c6ecb"
                            strokeWidth="2.5"
                          />
                        ))}

                        {metrics.chartData.map((d, idx) => {
                          const x =
                            padding +
                            (idx / Math.max(metrics.chartData.length - 1, 1)) *
                              (svgWidth - padding * 2);
                          return (
                            <text
                              key={idx}
                              x={x}
                              y={svgHeight - 12}
                              textAnchor="middle"
                              fill="#8c9196"
                              fontSize="10"
                              fontWeight="500"
                            >
                              {d.label}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                  </s-box>
                </s-stack>
              </s-box>

              <s-stack direction="block" gap="base">
                {/* Polaris web: s-box — conversion funnel */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="large"
                  background="base"
                >
                  <s-stack direction="block" gap="base">
                    <s-heading>{t("analytics.funnel.title")}</s-heading>
                    <s-text color="subdued">
                      {t("analytics.funnel.subtitle")}
                    </s-text>
                    <FunnelBar
                      label={t("analytics.funnel.impressions")}
                      value={analytics.funnel.impressions}
                      max={analytics.funnel.impressions || 1}
                      tone="#2c6ecb"
                    />
                    <FunnelBar
                      label={t("analytics.funnel.addToCart")}
                      value={analytics.funnel.addToCart}
                      max={analytics.funnel.impressions || 1}
                      tone="#b98900"
                      suffix={analytics.funnel.conversionRate}
                    />
                  </s-stack>
                </s-box>

                {/* Polaris web: s-box — activity by day of week */}
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="large"
                  background="base"
                >
                  <s-stack direction="block" gap="base">
                    <s-heading>{t("analytics.dow.title")}</s-heading>
                    <s-text color="subdued">
                      {t("analytics.dow.subtitle")}
                    </s-text>
                    <s-grid
                      gap="small-200"
                      gridTemplateColumns="repeat(7, minmax(0, 1fr))"
                    >
                      {analytics.dayOfWeek.map((day) => {
                        const total = day.impressions + day.addToCart;
                        const height = Math.min(
                          72,
                          Math.max(8, Math.round((total / dayOfWeekMax) * 72)),
                        );
                        const dowKey = DOW_KEYS[day.label];
                        const dowLabel = dowKey ? t(dowKey) : day.label;
                        return (
                          <s-stack
                            key={day.label}
                            direction="block"
                            gap="small-200"
                            alignItems="center"
                          >
                            <div
                              style={{
                                width: "100%",
                                height: 72,
                                display: "flex",
                                alignItems: "flex-end",
                                justifyContent: "center",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: "70%",
                                  height,
                                  borderRadius: "4px 4px 0 0",
                                  background:
                                    day.addToCart > 0
                                      ? "linear-gradient(180deg, #b98900 0%, #2c6ecb 100%)"
                                      : "#d2d5d8",
                                }}
                                title={t("analytics.dow.barTitle", {
                                  views: day.impressions,
                                  atc: day.addToCart,
                                })}
                              />
                            </div>
                            <s-text color="subdued">{dowLabel}</s-text>
                          </s-stack>
                        );
                      })}
                    </s-grid>
                  </s-stack>
                </s-box>
              </s-stack>
            </s-grid>
          ) : null}

          {showAdvancedAnalytics ? (
            <>
              {/* Polaris web: s-box + s-table — Top products */}
              <s-box
                padding="none"
                borderWidth="base"
                borderRadius="large"
                background="base"
                overflow="hidden"
              >
                <s-box padding="base">
                  <s-stack direction="block" gap="small-200">
                    <s-heading>{t("analytics.topProducts.title")}</s-heading>
                    <s-text color="subdued">
                      {t("analytics.topProducts.subtitle")}
                    </s-text>
                  </s-stack>
                </s-box>
                <s-divider />
                {analytics.topProducts.length === 0 ? (
                  <s-box padding="large">
                    <s-stack direction="block" alignItems="center">
                      <s-text color="subdued">
                        {t("analytics.topProducts.empty")}
                      </s-text>
                    </s-stack>
                  </s-box>
                ) : (
                  <s-table>
                    <s-table-header-row>
                      <s-table-header listSlot="primary">
                        {t("analytics.col.product")}
                      </s-table-header>
                      <s-table-header>
                        {t("analytics.col.impressions")}
                      </s-table-header>
                      <s-table-header>
                        {t("analytics.col.addToCart")}
                      </s-table-header>
                      <s-table-header>
                        {t("analytics.col.conversionRate")}
                      </s-table-header>
                      <s-table-header format="numeric">
                        {t("analytics.col.widgetSales")}
                      </s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      {analytics.topProducts.map((row) => (
                        <s-table-row key={row.productId}>
                          <s-table-cell>
                            <s-text type="strong">{row.productTitle}</s-text>
                          </s-table-cell>
                          <s-table-cell>
                            {row.impressions.toLocaleString()}
                          </s-table-cell>
                          <s-table-cell>
                            {row.addToCart.toLocaleString()}
                          </s-table-cell>
                          <s-table-cell>{row.conversionRate}</s-table-cell>
                          <s-table-cell>
                            {formatAnalyticsMoney(row.revenueCents)}
                          </s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>
                )}
              </s-box>

              {/* Polaris web: s-box + s-table — Offer performance breakdown */}
              <s-box
                padding="none"
                borderWidth="base"
                borderRadius="large"
                background="base"
                overflow="hidden"
              >
                <s-box padding="base">
                  <s-stack direction="block" gap="small-200">
                    <s-heading>{t("analytics.campaigns.title")}</s-heading>
                    <s-text color="subdued">
                      {t("analytics.campaigns.subtitle")}
                    </s-text>
                  </s-stack>
                </s-box>
                <s-divider />
                {analytics.campaignRows.length === 0 ? (
                  <s-box padding="large">
                    <s-stack direction="block" alignItems="center">
                      <s-text color="subdued">
                        {t("analytics.campaigns.empty")}
                      </s-text>
                    </s-stack>
                  </s-box>
                ) : (
                  <>
                    <s-box padding="base">
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Polaris web: s-search-field — same campaignSearch state */}
                          <s-search-field
                            label={t("analytics.campaigns.search")}
                            labelAccessibilityVisibility="exclusive"
                            value={campaignSearch}
                            placeholder={t("analytics.campaigns.search")}
                            onInput={(event) =>
                              setCampaignSearch(
                                String(event.currentTarget.value ?? ""),
                              )
                            }
                          />
                        </div>
                        <div style={{ width: "240px", flexShrink: 0 }}>
                          <AnalyticsCampaignSortDropdown
                            label={t("analytics.campaigns.sort")}
                            value={sortBy}
                            options={campaignSortSelectOptions}
                            onChange={setSortBy}
                          />
                        </div>
                      </s-stack>
                    </s-box>
                    <s-divider />
                    {filteredCampaignRows.length === 0 ? (
                      <s-box padding="base">
                        <s-text color="subdued">
                          {t("analytics.campaigns.noMatch")}
                        </s-text>
                      </s-box>
                    ) : (
                      <>
                        <s-table>
                          <s-table-header-row>
                            <s-table-header listSlot="primary">
                              {t("analytics.col.campaignName")}
                            </s-table-header>
                            <s-table-header>
                              {t("analytics.col.status")}
                            </s-table-header>
                            <s-table-header>
                              {t("analytics.col.impressions")}
                            </s-table-header>
                            <s-table-header>
                              {t("analytics.col.addToCart")}
                            </s-table-header>
                            <s-table-header>
                              {t("analytics.col.conversionRate")}
                            </s-table-header>
                            <s-table-header format="numeric">
                              {t("analytics.col.widgetSales")}
                            </s-table-header>
                          </s-table-header-row>
                          <s-table-body>
                            {campaignPagination.rows.map((row) => (
                              <s-table-row key={row.id}>
                                <s-table-cell>
                                  <s-text type="strong">
                                    {row.campaignName}
                                  </s-text>
                                </s-table-cell>
                                <s-table-cell>
                                  <s-badge
                                    tone={
                                      row.status.toLowerCase() === "active"
                                        ? "success"
                                        : "info"
                                    }
                                  >
                                    {CAMPAIGN_STATUS_KEYS[
                                      row.status.toLowerCase()
                                    ]
                                      ? t(
                                          CAMPAIGN_STATUS_KEYS[
                                            row.status.toLowerCase()
                                          ]!,
                                        )
                                      : row.status}
                                  </s-badge>
                                </s-table-cell>
                                <s-table-cell>
                                  {row.views.toLocaleString()}
                                </s-table-cell>
                                <s-table-cell>
                                  {row.addToCart.toLocaleString()}
                                </s-table-cell>
                                <s-table-cell>
                                  {row.conversionRate}
                                </s-table-cell>
                                <s-table-cell>
                                  {formatAnalyticsMoney(row.revenueCents)}
                                </s-table-cell>
                              </s-table-row>
                            ))}
                          </s-table-body>
                        </s-table>
                        {campaignPagination.total > CAMPAIGN_PAGE_SIZE ? (
                          /* Polaris web: s-stack pagination — same page index handlers */
                          <s-box padding="small" background="subdued">
                            <s-stack
                              direction="inline"
                              gap="small"
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <s-text color="subdued">
                                {t("analytics.campaigns.pagination", {
                                  start: campaignPagination.rangeStart,
                                  end: campaignPagination.rangeEnd,
                                  total:
                                    campaignPagination.total.toLocaleString(),
                                })}
                              </s-text>
                              <s-stack
                                direction="inline"
                                gap="small-200"
                                alignItems="center"
                              >
                                <s-button
                                  variant="secondary"
                                  disabled={
                                    !campaignPagination.hasPrevious || undefined
                                  }
                                  onClick={() =>
                                    setCampaignPageIndex((p) =>
                                      Math.max(0, p - 1),
                                    )
                                  }
                                >
                                  Previous
                                </s-button>
                                <s-button
                                  variant="secondary"
                                  disabled={
                                    !campaignPagination.hasNext || undefined
                                  }
                                  onClick={() =>
                                    setCampaignPageIndex((p) => p + 1)
                                  }
                                >
                                  Next
                                </s-button>
                              </s-stack>
                            </s-stack>
                          </s-box>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </s-box>
            </>
          ) : showStandardAnalytics ? (
            <PlanUpgradeBanner
              feature="analytics"
              message={t("analytics.upgrade.breakdown")}
            />
          ) : null}
        </s-stack>
      </div>
    </s-page>
  );
}
