import { useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "./AdminI18nProvider";
import {
  BogoSpecialOfferCard,
  type BogoGiftOption,
} from "./BogoSpecialOfferCard";
import { statusBadgeTone, statusLabel } from "../utils/offers-display";
import type {
  BogoBuysRequirement,
  BogoCampaignStatus,
  BogoGetsValueType,
  BogoItemScope,
} from "../types/bogo";
import {
  bogoPanelColorStyle,
  fillBogoTemplate,
  DEFAULT_BOGO_WIDGET_COPY,
} from "../utils/bogoWidgetCopy";
import type { VolumeDiscountWidgetDisplay } from "../utils/widgetDisplay";
import createStyles from "../styles/volume-discount-create.module.css";

export type BogoLivePreviewProps = {
  campaignName: string;
  displayName: string;
  status: BogoCampaignStatus;
  buysRequirement: BogoBuysRequirement;
  buysQuantity: string;
  buysAmount: string;
  buysScope: BogoItemScope;
  buysCount: number;
  getsQuantity: string;
  getsScope: BogoItemScope;
  getsCount: number;
  getsValueType: BogoGetsValueType;
  getsValue: string;
  usesPerOrderLimit: string;
  widgetDisplay?: VolumeDiscountWidgetDisplay | null;
  previewDevice: "desktop" | "mobile";
  onPreviewDeviceChange: (device: "desktop" | "mobile") => void;
  /** Campaign status card Turn on / Turn off — same state as Rules → Status. */
  onStatusChange?: (next: BogoCampaignStatus) => void;
};

function bottleImage(body: string, label: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120">` +
    `<rect width="80" height="120" fill="#f7f7f8"/>` +
    `<path d="M32 8h16v14c6 4 10 10 10 18v62c0 6-4 10-10 10H32c-6 0-10-4-10-10V40c0-8 4-14 10-18V8z" fill="${body}"/>` +
    `<rect x="30" y="6" width="20" height="8" rx="2" fill="#3a3a3a"/>` +
    `<rect x="24" y="58" width="32" height="22" rx="3" fill="${label}"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const BUY_IMAGE = bottleImage("#1a1a1a", "#f5a623");
const SAMPLE_GIFTS: BogoGiftOption[] = [
  {
    id: "classic",
    name: "Coca-Cola Original",
    tone: "classic",
    image: bottleImage("#c81e1e", "#fff"),
  },
  {
    id: "zero",
    name: "Zero Sugar",
    tone: "zero",
    image: bottleImage("#111", "#e10600"),
  },
  {
    id: "light",
    name: "Coca-Cola Light",
    tone: "light",
    image: bottleImage("#c4c4c4", "#b11226"),
  },
  {
    id: "cherry",
    name: "Cherry",
    tone: "generic",
    image: bottleImage("#7a1230", "#ffd0dc"),
  },
];

/** Wide enough to skip ≤560 compact rules — real desktop product column. */
const DESKTOP_CANVAS = 680;
/** Phone width — hits ≤400 stack rules. */
const MOBILE_CANVAS = 360;

const STOCK_FOOTNOTE =
  "Discount applies automatically when Buy and Get quantities are in your cart.";

function badgeToneForStatus(
  status: BogoCampaignStatus,
): "success" | "info" | "warning" | "neutral" | "critical" {
  const tone = statusBadgeTone(status);
  if (tone === "success" || tone === "info" || tone === "critical") {
    return tone;
  }
  if (tone === "attention" || tone === "warning") return "warning";
  return "neutral";
}

export function BogoLivePreview({
  campaignName,
  displayName,
  status,
  buysRequirement,
  buysQuantity,
  buysAmount,
  getsQuantity,
  getsCount,
  getsValueType,
  getsValue,
  usesPerOrderLimit,
  widgetDisplay = null,
  previewDevice,
  onPreviewDeviceChange,
  onStatusChange,
}: BogoLivePreviewProps) {
  const { t } = useAdminI18n();
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [frameHeight, setFrameHeight] = useState(280);
  const canvasWidth =
    previewDevice === "mobile" ? MOBILE_CANVAS : DESKTOP_CANVAS;

  const buysQty = Math.max(1, Number.parseInt(buysQuantity, 10) || 1);
  const getsQty = Math.max(1, Number.parseInt(getsQuantity, 10) || 1);
  const getPool = Math.max(0, getsCount || 0);
  const isFreeGet =
    getsValueType !== "percentage" && getsValueType !== "amount";
  const rawHeading = (widgetDisplay?.widgetHeading || "").trim();
  const generatedHeading =
    buysRequirement === "amount"
      ? displayName || campaignName || "Buy X, Get Y"
      : `Buy ${buysQty} Get ${getsQty}${isFreeGet ? " Free" : ""}`;
  const heading =
    !rawHeading ||
    rawHeading === generatedHeading ||
    rawHeading === "Buy X, Get Y"
      ? "Special Offer"
      : rawHeading;
  const rawFoot = (widgetDisplay?.footnote || "").trim();
  const subtitle =
    rawFoot && rawFoot !== STOCK_FOOTNOTE
      ? rawFoot
      : buysRequirement === "amount"
        ? `Spend $${(Number.parseFloat(buysAmount) || 0).toFixed(2)} and unlock your Get reward.`
        : "Buy Boga Pack de 6 × 1.5L and get a Coca-Cola of your choice for free.";
  const rawCta = (widgetDisplay?.ctaLabel || "").trim();
  const ctaLabel =
    !rawCta || rawCta === "Add to cart" ? "Add To Cart" : rawCta;
  const primary = widgetDisplay?.primaryColor || "#111111";
  const usesLimit = Number.parseInt(usesPerOrderLimit, 10);
  const limitLabel =
    Number.isFinite(usesLimit) && usesLimit > 0
      ? `Max ${usesLimit} use(s) per order`
      : undefined;
  const isLive = status === "active";
  const gifts =
    getPool === 1
      ? [
          {
            id: "one",
            name: "Free gift",
            tone: "classic" as const,
            image: SAMPLE_GIFTS[0]?.image,
          },
        ]
      : getPool === 2
        ? SAMPLE_GIFTS.slice(0, 2)
        : SAMPLE_GIFTS;
  const copy = widgetDisplay?.bogoCopy ?? DEFAULT_BOGO_WIDGET_COPY;
  const pickLabel = isFreeGet
    ? fillBogoTemplate(
        getsQty === 1 ? copy.pickLabel : copy.pickLabelPlural,
        { qty: getsQty },
      )
    : "Your reward";
  const availableLabel =
    gifts.length > 1
      ? fillBogoTemplate(copy.availableLabel, {
          count: getPool > 1 ? getPool : gifts.length,
        })
      : undefined;
  const rewardLabel = isFreeGet
    ? copy.freeLabel
    : getsValueType === "percentage"
      ? `${getsValue || "0"}% off`
      : `$${getsValue || "0"} off`;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const measure = () => {
      const frameW = Math.max(frame.clientWidth || 1, 1);
      const nextScale = Math.min(1, frameW / canvasWidth);
      const hosts = Array.from(canvas.querySelectorAll("div"));
      let naturalH = 0;
      for (const host of hosts) {
        const shadowCard =
          host.shadowRoot?.querySelector<HTMLElement>(".offrefy-bogo") ??
          host.shadowRoot?.querySelector<HTMLElement>(".offrefy-bogo-host");
        naturalH = Math.max(
          naturalH,
          shadowCard?.scrollHeight ?? 0,
          shadowCard?.offsetHeight ?? 0,
          host.offsetHeight,
        );
      }
      const content = canvas.firstElementChild as HTMLElement | null;
      naturalH = Math.max(
        naturalH,
        content?.scrollHeight ?? 0,
        content?.offsetHeight ?? 0,
        1,
      );
      setScale(nextScale);
      setFrameHeight(Math.max(160, Math.ceil(naturalH * nextScale) + 16));
    };

    measure();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    ro.observe(frame);
    ro.observe(canvas);
    const host = canvas.querySelector("div");
    if (host) ro.observe(host);

    const timers = [80, 200, 500, 900].map((ms) =>
      window.setTimeout(measure, ms),
    );
    return () => {
      ro.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [
    canvasWidth,
    previewDevice,
    heading,
    subtitle,
    pickLabel,
    availableLabel,
    rewardLabel,
    ctaLabel,
    buysQty,
    gifts.length,
    widgetDisplay?.primaryColor,
    widgetDisplay?.customCss,
    widgetDisplay?.bogoCopy,
  ]);

  return (
    // Polaris web: s-stack — campaign status + product page preview
    <s-stack direction="block" gap="base">
      <s-box
        padding="large-200"
        borderWidth="base"
        borderRadius="large"
        background="base"
      >
        <s-stack direction="block" gap="small-200">
          <s-stack
            direction="inline"
            gap="small-200"
            alignItems="center"
            justifyContent="space-between"
          >
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-heading>{t("offerEditor.campaignStatus")}</s-heading>
              <s-badge tone={badgeToneForStatus(status)}>
                {statusLabel(status)}
              </s-badge>
            </s-stack>
            {onStatusChange ? (
              <s-button
                variant="tertiary"
                onClick={() => {
                  if (status === "active" || status === "scheduled") {
                    onStatusChange("draft");
                    return;
                  }
                  onStatusChange("active");
                }}
              >
                {status === "active"
                  ? t("offerEditor.turnOff")
                  : t("offerEditor.turnOn")}
              </s-button>
            ) : null}
          </s-stack>
          {!isLive ? (
            <s-paragraph color="subdued">
              {status === "scheduled"
                ? t("bogo.preview.scheduledHint")
                : t("bogo.preview.draftHint")}
            </s-paragraph>
          ) : null}
        </s-stack>
      </s-box>

      <s-box
        padding="large-200"
        borderWidth="base"
        borderRadius="large"
        background="base"
      >
        <s-stack direction="block" gap="base">
          <s-stack
            direction="inline"
            gap="small"
            alignItems="start"
            justifyContent="space-between"
          >
            <s-heading>{t("offerEditor.productPagePreview")}</s-heading>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-button
                variant={previewDevice === "desktop" ? "secondary" : "tertiary"}
                icon="desktop"
                accessibilityLabel={t("offerEditor.desktopPreview")}
                onClick={() => onPreviewDeviceChange("desktop")}
              />
              <s-button
                variant={previewDevice === "mobile" ? "secondary" : "tertiary"}
                icon="mobile"
                accessibilityLabel={t("offerEditor.mobilePreview")}
                onClick={() => onPreviewDeviceChange("mobile")}
              />
            </s-stack>
          </s-stack>

          <s-box
            padding="none"
            background="subdued"
            borderRadius="base"
            overflow="hidden"
          >
            <div
              ref={frameRef}
              className={createStyles.bogoPreviewFrame}
              style={{
                height: frameHeight,
                opacity: isLive ? undefined : 0.55,
                pointerEvents: isLive ? undefined : "none",
              }}
            >
              <div
                ref={canvasRef}
                className={createStyles.bogoPreviewCanvas}
                style={{
                  width: canvasWidth,
                  transform: `translateX(-50%) scale(${scale})`,
                }}
              >
                <div className={createStyles.bogoPreviewCardPad}>
                  <BogoSpecialOfferCard
                    heading={heading}
                    badgeLabel={copy.badgeLabel}
                    buyLabel={copy.buyLabel}
                    getLabel={isFreeGet ? copy.getFreeLabel : copy.getLabel}
                    subtitle={subtitle}
                    buyImage={BUY_IMAGE}
                    buyName="Boga Pack de 6 × 1.5L"
                    buyPrice="$2.00"
                    buyQty={buysQty}
                    gifts={gifts}
                    pickLabel={pickLabel}
                    availableLabel={availableLabel}
                    rewardLabel={rewardLabel}
                    ctaLabel={ctaLabel}
                    limitLabel={limitLabel}
                    buttonColor={primary}
                    panelStyle={bogoPanelColorStyle(copy, primary)}
                    customCss={widgetDisplay?.customCss}
                  />
                </div>
              </div>
            </div>
          </s-box>
        </s-stack>
      </s-box>
    </s-stack>
  );
}
