import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { BlockStack, Box, InlineStack, Text } from "@shopify/polaris";
import { MinusIcon, PlusIcon } from "lucide-react";

import {
  formatCountdownForUnit,
  normalizeCountdownDisplayUnit,
} from "../utils/countdownTimes";
import {
  clampBadgeSizeScalePercent,
  clampRadioButtonSizePx,
  clampVolumeTableCellPaddingPx,
  clampVolumeTableColInlinePaddingPx,
  clampWidgetBorderRadiusPx,
  countdownAlignToFlexJustify,
  DEFAULT_WIDGET_DISPLAY,
  isVolumeDiscountBadgeTopFloat,
  scaledWidgetFontSizeCss,
  sanitizeCountdownLabelForDisplay,
  WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS,
  type VolumeDiscountBadgePosition,
  type VolumeDiscountWidgetDisplay,
} from "../utils/widgetDisplay";

import previewWidgetStyles from "./QuantityBreaksTailwindPreview.module.css";

export type QuantityBreaksPreviewTierRow = {
  key: string;
  buyNum: number;
  qtyLabel: string;
  /** Optional line under the option label (widget). */
  optionSubtext: string;
  discountLabel: string;
  perUnitPrice: number;
  priceLabel: string;
  lineOriginal: number;
  lineDiscounted: number;
  savings: number;
  badge: string | null;
  activeByDefault: boolean;
};

export type QuantityBreaksTailwindPreviewProps = {
  rows: QuantityBreaksPreviewTierRow[];
  currencySymbol?: string;
  /** @deprecated Prefer `display.widgetHeading` */
  heading?: string;
  showCountdown?: boolean;
  /** @deprecated Prefer `display.ctaLabel` */
  ctaLabel?: string;
  /** Merges with defaults; drives colors, copy, typography. */
  display?: Partial<VolumeDiscountWidgetDisplay>;
  /**
   * @deprecated Unused — empty `display.widgetHeading` hides the title.
   */
  themeHeadingFallback?: string;
  /** ISO end instant — live preview; omit for demo ticker. */
  countdownEndsAtIso?: string | null;
  /** ISO start instant — hide pill until then when set. */
  countdownStartsAtIso?: string | null;
  /**
   * When true, countdown shows one accurate tick but no 1s interval (lighter CPU
   * while another editor tab is active).
   */
  freezeCountdown?: boolean;
  /** Increment to re-run live countdown (e.g. admin “Reset timer” with same end within 1s). */
  countdownPreviewNonce?: number;
  /**
   * When `mobile`, applies the same heading/countdown rules as the storefront
   * for narrow screens (with `display.widgetHeaderMobileStack`).
   */
  previewDevice?: "desktop" | "mobile";
};

type CountdownPreviewPhase = "demo" | "before" | "active";

function formatMoney(amount: number, symbol: string): string {
  const s = amount.toFixed(2);
  return `${symbol}${s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function volumeTableDiscountLabel(row: QuantityBreaksPreviewTierRow): string {
  const dl = row.discountLabel.trim();
  const m = dl.match(/^(\d+(?:\.\d+)?)%\s*off$/i);
  if (m) return `${m[1]}%`;
  return dl;
}

/** Match storefront `VD_MAX_LINE_QTY` for preview clamping. */
const PREVIEW_MAX_QTY = 9999;
const PREVIEW_MAX_QTY_DIGITS = String(PREVIEW_MAX_QTY).length;

const variantOptions = [
  { label: "Default variant", value: "default", available: true },
  { label: "100ml", value: "100ml", available: true },
  { label: "250ml", value: "250ml", available: false },
];

/** Mirrors storefront `.vd-card__badge-top--float` + align modifiers (approx. card padding). */
function topFloatBadgeWrapStyle(
  position: Extract<
    VolumeDiscountBadgePosition,
    "top_left" | "top_center" | "top_right"
  >,
): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    top: 0,
    zIndex: 2,
    maxWidth: "calc(100% - 28px)",
    pointerEvents: "none",
    display: "flex",
    boxSizing: "border-box",
  };
  if (position === "top_left") {
    return {
      ...base,
      left: 14,
      right: "auto",
      transform: "translateY(-50%)",
      justifyContent: "flex-start",
    };
  }
  if (position === "top_center") {
    return {
      ...base,
      left: "50%",
      right: "auto",
      transform: "translate(-50%, -50%)",
      justifyContent: "center",
      width: "max-content",
    };
  }
  return {
    ...base,
    right: 14,
    left: "auto",
    transform: "translateY(-50%)",
    justifyContent: "flex-end",
  };
}

/**
 * Admin product-page preview: Polaris + storefront CSS variables from Appearance / Display.
 */
function QuantityBreaksTailwindPreviewInner({
  rows,
  currencySymbol = "$",
  heading,
  showCountdown: showCountdownLegacy,
  ctaLabel: ctaLabelLegacy,
  display: displayPartial,
  themeHeadingFallback: _themeHeadingFallback,
  countdownEndsAtIso = null,
  countdownStartsAtIso: _countdownStartsAtIso = null,
  freezeCountdown = false,
  countdownPreviewNonce = 0,
  previewDevice: previewDeviceProp,
}: QuantityBreaksTailwindPreviewProps) {
  const d: VolumeDiscountWidgetDisplay = {
    ...DEFAULT_WIDGET_DISPLAY,
    ...displayPartial,
  };
  const previewDevice = previewDeviceProp ?? "desktop";
  const mobileStackHeader =
    previewDevice === "mobile" && d.widgetHeaderMobileStack;
  const headerBothAlignCenter =
    d.widgetHeadingAlign === "center" && d.countdownAlign === "center";
  const headerUsesColumn =
    d.widgetHeaderLayout === "stacked" ||
    (mobileStackHeader && d.widgetHeaderLayout === "split") ||
    (headerBothAlignCenter && d.widgetHeaderLayout === "split");
  /** Matches storefront `effectiveWidgetHeaderLayout` (not mobile stack). */
  const headerLayoutEffective =
    d.widgetHeaderLayout === "stacked" || headerBothAlignCenter
      ? "stacked"
      : "split";
  /** Heading right + timer left on a split row → timer before title (storefront + preview). */
  const headerSwapEffective =
    d.widgetHeaderSwapOrder ||
    (headerLayoutEffective === "split" &&
      d.widgetHeadingAlign === "end" &&
      d.countdownAlign === "start");
  const headerMobileCentered = mobileStackHeader;
  const isVolumeTableLayout = d.widgetPresentation === "volume_table";
  /** Heading Right → timer also pins to the trailing edge (storefront + preview). */
  const countdownAlignEffective =
    d.widgetHeadingAlign === "end" ? "end" : d.countdownAlign;
  const headerPackEnd =
    !headerUsesColumn &&
    !headerMobileCentered &&
    d.widgetHeadingAlign === "end";
  const headerRowJustify = headerUsesColumn
    ? headerMobileCentered
      ? "center"
      : "flex-start"
    : headerPackEnd
      ? "flex-end"
      : d.widgetHeaderLayout === "split"
        ? "space-between"
        : "flex-start";
  const headingFlex = headerUsesColumn
    ? "0 0 auto"
    : headerPackEnd
      ? "0 1 auto"
      : d.widgetHeaderLayout === "split"
        ? "1 1 auto"
        : "0 0 auto";
  const sp = d.fontSizeScalePercent;
  const fs = (px: number) => scaledWidgetFontSizeCss(px, sp);
  /** Empty optional heading = hide title (no theme-block fallback). */
  const headingResolved =
    d.widgetHeading.trim() ||
    (heading != null && heading.trim() !== "" ? heading.trim() : "");
  const showHeading = headingResolved !== "";
  const radiogroupLabel = showHeading ? headingResolved : "Quantity breaks";
  const showCountdown =
    showCountdownLegacy !== undefined ? showCountdownLegacy : d.showCountdown;
  const ctaLabel = ctaLabelLegacy ?? d.ctaLabel;

  const cssVars: CSSProperties = {
    ["--color-vd-maroon" as string]: d.primaryColor,
    ["--color-vd-maroon-hover" as string]: d.primaryHoverColor,
    ["--color-vd-countdown-bg" as string]: d.countdownBgColor,
    ["--color-vd-countdown-text" as string]: d.countdownTextColor,
    ["--color-vd-save" as string]: d.savingsColor,
    ["--color-vd-option-subtext" as string]: d.optionSubtextColor,
    ["--vd-fs-title" as string]: fs(d.fontSizeTitle),
    ["--vd-fs-buy" as string]: fs(d.fontSizeBuyLabel),
    ["--vd-fs-option-subtext" as string]: fs(d.fontSizeOptionSubtext),
    ["--vd-fs-badge" as string]: fs(d.fontSizeBadge),
    ["--vd-fs-price" as string]: fs(d.fontSizePrice),
    ["--vd-fs-compare" as string]: fs(d.fontSizeComparePrice),
    ["--vd-fs-save" as string]: fs(d.fontSizeSavings),
    ["--vd-fs-cta" as string]: fs(d.fontSizeButton),
    ["--vd-fs-cd-label" as string]: fs(d.fontSizeCountdownLabel),
    ["--vd-fs-cd-badge" as string]: fs(d.fontSizeCountdownValue),
    ["--vd-fs-footnote" as string]: fs(d.fontSizeFootnote),
    ["--vd-radius-card" as string]: `${clampWidgetBorderRadiusPx(d.cardBorderRadiusPx)}px`,
    ["--vd-radius-cta" as string]: `${clampWidgetBorderRadiusPx(d.buttonBorderRadiusPx)}px`,
    ["--vd-radius-control" as string]: `${clampWidgetBorderRadiusPx(d.controlBorderRadiusPx)}px`,
    ["--vd-radio" as string]: `${clampRadioButtonSizePx(d.radioButtonSizePx)}px`,
    ["--vd-radio-border" as string]: d.radioButtonBorderColor,
    ["--vd-radio-accent" as string]: d.radioButtonAccentColor,
    ["--vd-badge-size-scale" as string]: String(
      clampBadgeSizeScalePercent(d.badgeSizeScalePercent) / 100,
    ),
    ["--vd-fw-strong" as string]: String(d.fontWeightStrong),
    ["--vd-fw-accent" as string]: String(d.fontWeightAccent),
    ["--vd-fw-body" as string]: String(d.fontWeightBody),
    ["--vd-fw-normal" as string]: String(d.fontWeightNormal),
    ["--vd-muted" as string]: d.mutedColor,
    ["--vd-card-border" as string]: d.cardBorderColor,
    ["--vd-surface" as string]: "#ffffff",
    ["--vd-compact-control-h" as string]: "30px",
    /** Admin Volume discount table only — wired in `.volumeTable*` CSS */
    ...(isVolumeTableLayout
      ? {
          ["--vd-vt-cell-pad-block" as string]: `${clampVolumeTableCellPaddingPx(
            d.volumeTableCellPaddingPx,
          )}px`,
          ["--vd-admin-vt-wrap-border" as string]: d.cardBorderColor,
          ["--vd-admin-vt-th-bg" as string]: d.countdownBgColor,
          ["--vd-admin-vt-th-fg" as string]: d.primaryColor,
          ["--vd-admin-vt-td-border" as string]: d.cardBorderColor,
          ["--vd-admin-vt-qty-fg" as string]: d.mutedColor,
          ["--vd-admin-vt-discount-fg" as string]: d.volumeTableDiscountColor,
          ["--vd-admin-vt-price-fg" as string]: d.primaryColor,
          ["--vd-vt-col1-text-align" as string]: d.volumeTableQuantityColumnAlign,
          ["--vd-vt-col2-text-align" as string]: d.volumeTableDiscountColumnAlign,
          ["--vd-vt-col3-text-align" as string]: d.volumeTablePriceColumnAlign,
          ["--vd-vt-col1-pad-inline-start" as string]: `${clampVolumeTableColInlinePaddingPx(
            d.volumeTableQuantityColPaddingStartPx,
          )}px`,
          ["--vd-vt-col1-pad-inline-end" as string]: `${clampVolumeTableColInlinePaddingPx(
            d.volumeTableQuantityColPaddingEndPx,
          )}px`,
          ["--vd-vt-col2-pad-inline-start" as string]: `${clampVolumeTableColInlinePaddingPx(
            d.volumeTableDiscountColPaddingStartPx,
          )}px`,
          ["--vd-vt-col2-pad-inline-end" as string]: `${clampVolumeTableColInlinePaddingPx(
            d.volumeTableDiscountColPaddingEndPx,
          )}px`,
          ["--vd-vt-col3-pad-inline-start" as string]: `${clampVolumeTableColInlinePaddingPx(
            d.volumeTablePriceColPaddingStartPx,
          )}px`,
          ["--vd-vt-col3-pad-inline-end" as string]: `${clampVolumeTableColInlinePaddingPx(
            d.volumeTablePriceColPaddingEndPx,
          )}px`,
        }
      : {}),
  };

  const tierCardBorderRadiusPx = clampWidgetBorderRadiusPx(d.cardBorderRadiusPx);
  const mainCtaBorderRadiusPx = clampWidgetBorderRadiusPx(d.buttonBorderRadiusPx);

  const visibleVariantOptions = useMemo(() => {
    if (!d.hideOutOfStockVariants) return variantOptions;
    const filtered = variantOptions.filter((o) => o.available !== false);
    return filtered.length ? filtered : variantOptions;
  }, [d.hideOutOfStockVariants]);

  const initialSelected = useMemo(() => {
    const i = rows.findIndex((r) => r.activeByDefault);
    return i === -1 ? 0 : i;
  }, [rows]);

  const [selectedIndex, setSelectedIndex] = useState(initialSelected);
  const [qty, setQty] = useState(1);
  const [qtyInputStr, setQtyInputStr] = useState("1");
  const [variant, setVariant] = useState("100ml");
  const [secondsLeft, setSecondsLeft] = useState(9 * 60 + 32);
  const [countdownPhase, setCountdownPhase] =
    useState<CountdownPreviewPhase>("demo");
  const previewRootRef = useRef<HTMLDivElement>(null);
  const showCountdownInHeader = showCountdown && countdownPhase !== "before";
  const showHeaderBar = showHeading || showCountdownInHeader;

  const hasLiveCountdownEnd =
    typeof countdownEndsAtIso === "string" &&
    countdownEndsAtIso.trim() !== "" &&
    !Number.isNaN(Date.parse(countdownEndsAtIso));

  useEffect(() => {
    if (visibleVariantOptions.some((o) => o.value === variant)) return;
    setVariant(visibleVariantOptions[0]?.value ?? "100ml");
  }, [visibleVariantOptions, variant]);

  useEffect(() => {
    setSelectedIndex(initialSelected);
  }, [initialSelected]);

  useEffect(() => {
    const minQ = rows[selectedIndex]?.buyNum ?? 1;
    setQty((q) => Math.max(minQ, q));
  }, [selectedIndex, rows]);

  useEffect(() => {
    setQtyInputStr(String(qty));
  }, [qty]);

  useEffect(() => {
    if (!showCountdown) return;
    if (hasLiveCountdownEnd) {
      const endsMs = Date.parse(countdownEndsAtIso!);
      const tick = () => {
        const now = Date.now();
        // Always show countdown to end; schedule start does not delay the pill.
        setCountdownPhase("active");
        setSecondsLeft(Math.max(0, Math.floor((endsMs - now) / 1000)));
      };
      tick();
      if (freezeCountdown) return;
      const id = window.setInterval(tick, 1000);
      return () => window.clearInterval(id);
    }
    setCountdownPhase("demo");
    setSecondsLeft(9 * 60 + 32);
    if (freezeCountdown) return;
    const id = window.setInterval(() => {
      setSecondsLeft((t) => (t <= 0 ? 9 * 60 + 32 : t - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [
    showCountdown,
    hasLiveCountdownEnd,
    countdownEndsAtIso,
    freezeCountdown,
    countdownPreviewNonce,
  ]);

  useEffect(() => {
    const host = previewRootRef.current;
    if (!host) return;
    const text = d.customCss
      .slice(0, WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS)
      .trim();
    const sel = "style[data-vd-admin-custom-css]";
    let el = host.querySelector(sel) as HTMLStyleElement | null;
    if (!text) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.setAttribute("data-vd-admin-custom-css", "");
      host.insertBefore(el, host.firstChild);
    }
    el.textContent = text;
  }, [d.customCss]);

  const tierMinQty = rows[selectedIndex]?.buyNum ?? 1;
  const decQty = useCallback(() => {
    setQty((q) => Math.max(tierMinQty, q - 1));
  }, [tierMinQty]);
  const incQty = useCallback(() => {
    setQty((q) => Math.min(PREVIEW_MAX_QTY, q + 1));
  }, []);

  const floatTopBadge =
    isVolumeDiscountBadgeTopFloat(d.badgePosition ?? "after_label") &&
    rows.some((r) => Boolean(r.badge?.trim()));

  if (!rows.length) {
    return (
      <Box padding="400" background="bg-surface-secondary" borderRadius="300">
        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
          Add tiers under Rule settings to see a preview.
        </Text>
      </Box>
    );
  }

  if (isVolumeTableLayout) {
    return (
      <div
        ref={previewRootRef}
        className="vd-admin-qb-preview"
        style={cssVars}
      >
        <BlockStack gap="300">
          {showHeaderBar ? (
          <div
            style={{
              display: "flex",
              flexDirection: headerUsesColumn ? "column" : "row",
              flexWrap:
                !headerUsesColumn && d.widgetHeaderLayout === "split"
                  ? "wrap"
                  : "nowrap",
              alignItems: headerUsesColumn
                ? headerMobileCentered
                  ? "center"
                  : "stretch"
                : "flex-start",
              justifyContent: headerRowJustify,
              gap: "var(--p-space-300, 0.75rem)",
              marginBottom: "clamp(0.85rem, 2.2vw, 1.15rem)",
              paddingBottom: "clamp(0.65rem, 2vw, 0.85rem)",
              borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
            }}
          >
            {showHeading ? (
            <div
              style={{
                order:
                  showCountdownInHeader && headerSwapEffective ? 2 : 1,
                flex: headingFlex,
                minWidth: 0,
                maxWidth: "100%",
                width: headerUsesColumn ? "100%" : undefined,
                textAlign: headerMobileCentered
                  ? "center"
                  : d.widgetHeadingAlign,
              }}
            >
              <Text
                as="h3"
                variant="headingSm"
                breakWord
                alignment={
                  headerMobileCentered
                    ? "center"
                    : d.widgetHeadingAlign === "center"
                      ? "center"
                      : d.widgetHeadingAlign === "end"
                        ? "end"
                        : "start"
                }
              >
                <span
                  style={{
                    fontFamily:
                      "var(--vd-theme-font-heading), Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, emoji",
                    fontSize: `var(--vd-fs-title, ${fs(d.fontSizeTitle)})`,
                    fontWeight: "var(--vd-fw-strong)",
                    color: d.primaryColor,
                  }}
                >
                  {headingResolved}
                </span>
              </Text>
            </div>
            ) : null}
            {showCountdownInHeader ? (
              <div
                style={{
                  order: headerSwapEffective ? 1 : 2,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: headerMobileCentered
                    ? "center"
                    : countdownAlignToFlexJustify(countdownAlignEffective),
                  gap: "0.35rem 0.5rem",
                  flex: "0 0 auto",
                  minWidth: 0,
                  maxWidth: "100%",
                  width: headerUsesColumn ? "100%" : undefined,
                  marginInlineStart:
                    !headerUsesColumn && countdownAlignEffective === "end"
                      ? "auto"
                      : undefined,
                }}
              >
                <Text as="span" variant="bodySm" tone="subdued">
                  <span
                    style={{
                      color: d.mutedColor,
                      fontWeight: "var(--vd-fw-normal)",
                      fontSize: `var(--vd-fs-cd-label, ${fs(d.fontSizeCountdownLabel)})`,
                    }}
                  >
                    {sanitizeCountdownLabelForDisplay(d.countdownLabel.trim()) ||
                      "Sale end in"}
                  </span>
                </Text>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: "1.75rem",
                    padding: "0.125rem 0.625rem",
                    borderRadius: "9999px",
                    fontWeight: "var(--vd-fw-accent)",
                    backgroundColor: d.countdownBgColor,
                    color: d.countdownTextColor,
                    fontSize: `var(--vd-fs-cd-badge, ${fs(d.fontSizeCountdownValue)})`,
                  }}
                >
                  {formatCountdownForUnit(
                    secondsLeft,
                    normalizeCountdownDisplayUnit(d.countdownTimeUnit),
                  )}
                </span>
              </div>
            ) : null}
          </div>
          ) : null}
          <div className={previewWidgetStyles.volumeTableWrap}>
            <div className={previewWidgetStyles.volumeTableScroll}>
              <table className={previewWidgetStyles.volumeTable}>
                <thead>
                  <tr>
                    <th scope="col">Quantity</th>
                    <th scope="col">Discount</th>
                    <th scope="col">Price per Item</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.qtyLabel}</td>
                      <td>{volumeTableDiscountLabel(row)}</td>
                      <td>{formatMoney(row.perUnitPrice, currencySymbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {!d.hideWidgetMainCta ? (
            <Box width="100%">
              <button
                type="button"
                onClick={() => {}}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  margin: 0,
                  padding: "0.875rem 1rem",
                  border: "none",
                  borderRadius: `${mainCtaBorderRadiusPx}px`,
                  backgroundColor: d.primaryColor,
                  color: "#fff",
                  fontWeight: "var(--vd-fw-strong)",
                  cursor: "pointer",
                  fontSize: `var(--vd-fs-cta, ${fs(d.fontSizeButton)})`,
                }}
              >
                {ctaLabel}
              </button>
            </Box>
          ) : null}
          <Text
            as="p"
            variant="bodySm"
            tone="subdued"
            alignment="center"
            breakWord
          >
            <span
              style={{
                fontSize: `var(--vd-fs-footnote, ${fs(d.fontSizeFootnote)})`,
                fontWeight: "var(--vd-fw-normal)",
                color: d.mutedColor,
              }}
            >
              {d.footnote}
            </span>
          </Text>
          <Text as="p" variant="bodyXs" tone="subdued" alignment="center">
            <span style={{ color: d.mutedColor }}>
              Admin preview uses a $98 sample unit. Tier labels come from Rule
              settings (or defaults when empty).
            </span>
          </Text>
        </BlockStack>
      </div>
    );
  }

  return (
    <div
      ref={previewRootRef}
      className="vd-admin-qb-preview"
      style={cssVars}
    >
      <BlockStack gap="300">
        {showHeaderBar ? (
        <div
          style={{
            display: "flex",
            flexDirection: headerUsesColumn ? "column" : "row",
            flexWrap:
              !headerUsesColumn && d.widgetHeaderLayout === "split"
                ? "wrap"
                : "nowrap",
            alignItems: headerUsesColumn
              ? headerMobileCentered
                ? "center"
                : "stretch"
              : "flex-start",
            justifyContent: headerRowJustify,
            gap: "var(--p-space-300, 0.75rem)",
            marginBottom: "clamp(0.85rem, 2.2vw, 1.15rem)",
            paddingBottom: "clamp(0.65rem, 2vw, 0.85rem)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
          }}
        >
          {showHeading ? (
          <div
            style={{
              order: showCountdownInHeader && headerSwapEffective ? 2 : 1,
              flex: headingFlex,
              minWidth: 0,
              maxWidth: "100%",
              width: headerUsesColumn ? "100%" : undefined,
              textAlign: headerMobileCentered
                ? "center"
                : d.widgetHeadingAlign,
            }}
          >
            <Text
              as="h3"
              variant="headingSm"
              breakWord
              alignment={
                headerMobileCentered
                  ? "center"
                  : d.widgetHeadingAlign === "center"
                    ? "center"
                    : d.widgetHeadingAlign === "end"
                      ? "end"
                      : "start"
              }
            >
              <span
                style={{
                  fontFamily:
                    "var(--vd-theme-font-heading), Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, emoji",
                  fontSize: `var(--vd-fs-title, ${fs(d.fontSizeTitle)})`,
                  fontWeight: "var(--vd-fw-strong)",
                }}
              >
                {headingResolved}
              </span>
            </Text>
          </div>
          ) : null}
          {showCountdownInHeader ? (
            <div
              style={{
                order: headerSwapEffective ? 1 : 2,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: headerMobileCentered
                  ? "center"
                  : countdownAlignToFlexJustify(countdownAlignEffective),
                gap: "0.35rem 0.5rem",
                flex: "0 0 auto",
                minWidth: 0,
                maxWidth: "100%",
                width: headerUsesColumn ? "100%" : undefined,
                marginInlineStart:
                  !headerUsesColumn && countdownAlignEffective === "end"
                    ? "auto"
                    : undefined,
              }}
            >
              <Text as="span" variant="bodySm" tone="subdued">
                <span
                  style={{
                    color: d.mutedColor,
                    fontWeight: "var(--vd-fw-normal)",
                    fontSize: `var(--vd-fs-cd-label, ${fs(d.fontSizeCountdownLabel)})`,
                  }}
                >
                  {sanitizeCountdownLabelForDisplay(d.countdownLabel.trim()) ||
                    "Sale end in"}
                </span>
              </Text>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: "1.75rem",
                  padding: "0.125rem 0.625rem",
                  borderRadius: "9999px",
                  fontWeight: "var(--vd-fw-accent)",
                  backgroundColor: d.countdownBgColor,
                  color: d.countdownTextColor,
                  fontSize: `var(--vd-fs-cd-badge, ${fs(d.fontSizeCountdownValue)})`,
                }}
              >
                {formatCountdownForUnit(
                  secondsLeft,
                  normalizeCountdownDisplayUnit(d.countdownTimeUnit),
                )}
              </span>
            </div>
          ) : null}
        </div>
        ) : null}

        <div role="radiogroup" aria-label={radiogroupLabel}>
          <div style={{ paddingTop: floatTopBadge ? "12px" : undefined }}>
            <BlockStack gap="400">
            {rows.map((row, index) => {
              const isSelected = index === selectedIndex;
              const showExpandedTierRow =
                isSelected &&
                (!d.hideWidgetVariantSelector ||
                  !d.hideWidgetLineTotal ||
                  !d.hideWidgetQuantitySelector ||
                  !d.hideWidgetTierAddButton);
              const perUnitCards = d.cardPriceShowsUnit === true;
              const unitOriginal =
                row.buyNum >= 1 ? row.lineOriginal / row.buyNum : row.lineOriginal;
              const showSavingsLine =
                row.savings > 0.005 &&
                (perUnitCards ? true : row.buyNum > 1);
              const showStrike = perUnitCards
                ? row.savings > 0.005 && row.perUnitPrice < unitOriginal - 1e-9
                : row.buyNum > 1 &&
                  row.savings > 0.005 &&
                  row.lineOriginal > row.lineDiscounted;
              const cardStrikeAmount = perUnitCards ? unitOriginal : row.lineOriginal;
              const cardMainAmount = perUnitCards ? row.perUnitPrice : row.lineDiscounted;

              const tierId = `vd-preview-tier-${row.key}`;
              const badgePos = d.badgePosition ?? "after_label";

              const badgeEl = row.badge ? (
                <span
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    padding: "2px 30px",
                    borderRadius: "9999px",
                    fontWeight: "var(--vd-fw-accent)",
                    color: d.badgeTextColor,
                    backgroundColor: d.badgeBackgroundColor,
                    fontSize: `calc(var(--vd-fs-badge, ${fs(d.fontSizeBadge)}) * var(--vd-badge-size-scale, 1))`,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    verticalAlign: "middle",
                    boxSizing: "border-box",
                    boxShadow: "0 1px 2px rgba(107, 29, 30, 0.2)",
                  }}
                >
                  {row.badge}
                </span>
              ) : null;

              const showComparePrice = showStrike && !d.hideWidgetComparePrice;
              const priceColumn = (
                <BlockStack gap="050" inlineAlign="end">
                  {badgePos === "price_column" ? badgeEl : null}
                  {showComparePrice ? (
                    <span
                      className={previewWidgetStyles.compareAtStrike}
                      style={{
                        color: d.mutedColor,
                        fontWeight: "var(--vd-fw-normal)",
                        fontSize: `var(--vd-fs-compare, ${fs(d.fontSizeComparePrice)})`,
                      }}
                    >
                      {formatMoney(cardStrikeAmount, currencySymbol)}
                    </span>
                  ) : null}
                  <Text as="span" variant="bodyMd" alignment="end">
                    <span
                      style={{
                        fontSize: `var(--vd-fs-price, ${fs(d.fontSizePrice)})`,
                        fontWeight: "var(--vd-fw-strong)",
                      }}
                    >
                      {formatMoney(cardMainAmount, currencySymbol)}
                    </span>
                  </Text>
                </BlockStack>
              );

              return (
                <div
                  key={row.key}
                  role="presentation"
                  onClick={() => setSelectedIndex(index)}
                  style={{
                    position: "relative",
                    width: "100%",
                    minWidth: 0,
                    cursor: "pointer",
                    borderRadius: `${tierCardBorderRadiusPx}px`,
                    border: isSelected
                      ? `2px solid ${d.primaryColor}`
                      : `1px solid ${d.cardBorderColor}`,
                    background: isSelected
                      ? `linear-gradient(165deg, #fffefb 0%, ${d.selectedBgColor} 55%, ${d.selectedBgColor} 100%)`
                      : "#ffffff",
                    outline: "none",
                    marginTop:
                      floatTopBadge && index > 0 ? "10px" : undefined,
                    overflow: "visible",
                  }}
                >
                  {isVolumeDiscountBadgeTopFloat(badgePos) && row.badge ? (
                    <div
                      style={topFloatBadgeWrapStyle(
                        badgePos === "top_left"
                          ? "top_left"
                          : badgePos === "top_center"
                            ? "top_center"
                            : "top_right",
                      )}
                    >
                      {badgeEl}
                    </div>
                  ) : null}
                  <Box padding={{ xs: "300", sm: "400" }}>
                    <BlockStack gap="300">
                      <InlineStack
                        align="space-between"
                        blockAlign="start"
                        wrap
                        gap="300"
                      >
                        <InlineStack
                          gap="200"
                          blockAlign="start"
                          wrap
                        >
                          <div
                            onClick={(e: MouseEvent) => e.stopPropagation()}
                            onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
                            role="presentation"
                          >
                            <label className={previewWidgetStyles.tierRadioLabel}>
                              <input
                                id={tierId}
                                type="radio"
                                name="vd-preview-tier"
                                value={String(index)}
                                className={previewWidgetStyles.tierRadioInput}
                                checked={isSelected}
                                onChange={() => setSelectedIndex(index)}
                                aria-label={row.qtyLabel}
                              />
                              <span
                                className={previewWidgetStyles.tierRadioCircle}
                                data-selected={isSelected ? "true" : undefined}
                                aria-hidden
                              />
                            </label>
                          </div>
                          <BlockStack gap="100" inlineAlign="start">
                            <InlineStack
                              gap="200"
                              blockAlign="center"
                              wrap
                            >
                              <Text as="span" variant="bodyMd">
                                <span
                                  style={{
                                    fontSize: `var(--vd-fs-buy, ${fs(d.fontSizeBuyLabel)})`,
                                    fontWeight: "var(--vd-fw-strong)",
                                  }}
                                >
                                  {row.qtyLabel}
                                </span>
                              </Text>
                              {badgePos === "after_label" ? badgeEl : null}
                            </InlineStack>
                            {badgePos === "below_label" ? badgeEl : null}
                            {row.optionSubtext.trim() ? (
                              <Text as="span" variant="bodySm" alignment="start">
                                <span
                                  style={{
                                    color: d.optionSubtextColor,
                                    fontWeight: "var(--vd-fw-body)",
                                    fontSize: `var(--vd-fs-option-subtext, ${fs(d.fontSizeOptionSubtext)})`,
                                  }}
                                >
                                  {row.optionSubtext.trim()}
                                </span>
                              </Text>
                            ) : null}
                            {badgePos === "after_subtext" ? badgeEl : null}
                            {showSavingsLine ? (
                              <Text as="span" variant="bodySm" alignment="start">
                                <span
                                  style={{
                                    color: d.savingsColor,
                                    fontWeight: "var(--vd-fw-body)",
                                    fontSize: `var(--vd-fs-save, ${fs(d.fontSizeSavings)})`,
                                  }}
                                >
                                  You save{" "}
                                  {formatMoney(row.savings, currencySymbol)}
                                </span>
                              </Text>
                            ) : null}
                          </BlockStack>
                        </InlineStack>
                        <Box minWidth="fit-content">{priceColumn}</Box>
                      </InlineStack>

                      {showExpandedTierRow ? (
                        <div
                          onClick={(e: MouseEvent) => e.stopPropagation()}
                          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
                          role="presentation"
                          className={previewWidgetStyles.expandSection}
                        >
                          <div
                            className={previewWidgetStyles.expandDivider}
                            aria-hidden
                          />
                          <div className={previewWidgetStyles.expandCompact}>
                            <span className={previewWidgetStyles.tierIdx}>
                              #{index + 1}
                            </span>
                            {!d.hideWidgetVariantSelector ? (
                              <div className={previewWidgetStyles.selectWrap}>
                                <select
                                  className={previewWidgetStyles.variantSelect}
                                  aria-label="Variant"
                                  value={variant}
                                  onChange={(e) => setVariant(e.target.value)}
                                >
                                  {visibleVariantOptions.map((opt) => (
                                    <option
                                      key={opt.value}
                                      value={opt.value}
                                    >
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            {!d.hideWidgetLineTotal ? (
                              <span className={previewWidgetStyles.lineTotal}>
                                {formatMoney(
                                  row.perUnitPrice * qty,
                                  currencySymbol,
                                )}
                              </span>
                            ) : null}
                            {!d.hideWidgetQuantitySelector ||
                            !d.hideWidgetTierAddButton ? (
                              <div className={previewWidgetStyles.expandTrailing}>
                                {!d.hideWidgetQuantitySelector ? (
                                  <div
                                    className={previewWidgetStyles.qtyGroup}
                                    role="group"
                                    aria-label="Quantity"
                                  >
                                    <button
                                      type="button"
                                      className={previewWidgetStyles.qtyBtn}
                                      disabled={qty <= tierMinQty}
                                      aria-label="Decrease quantity"
                                      onClick={() => decQty()}
                                    >
                                      <MinusIcon
                                        className="size-3"
                                        strokeWidth={2.5}
                                      />
                                    </button>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={PREVIEW_MAX_QTY_DIGITS}
                                      className={previewWidgetStyles.qtyValue}
                                      aria-label="Quantity"
                                      value={qtyInputStr}
                                      onChange={(e) => {
                                        setQtyInputStr(
                                          e.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, PREVIEW_MAX_QTY_DIGITS),
                                        );
                                      }}
                                      onBlur={() => {
                                        const minQ = row.buyNum ?? 1;
                                        let n = parseInt(qtyInputStr, 10);
                                        if (
                                          !Number.isFinite(n) ||
                                          qtyInputStr === ""
                                        ) {
                                          n = minQ;
                                        }
                                        n = Math.min(PREVIEW_MAX_QTY, Math.max(minQ, n));
                                        setQty(n);
                                        setQtyInputStr(String(n));
                                      }}
                                      onKeyDown={(e: KeyboardEvent) => {
                                        if (e.key === "Enter") {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className={previewWidgetStyles.qtyBtn}
                                      aria-label="Increase quantity"
                                      onClick={() => incQty()}
                                    >
                                      <PlusIcon
                                        className="size-3"
                                        strokeWidth={2.5}
                                      />
                                    </button>
                                  </div>
                                ) : null}
                                {!d.hideWidgetTierAddButton ? (
                                  <button
                                    type="button"
                                    className={previewWidgetStyles.addOutline}
                                    onClick={() => {}}
                                  >
                                    + Add
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </BlockStack>
                  </Box>
                </div>
              );
            })}
          </BlockStack>
          </div>
        </div>

        <Box width="100%">
          <button
            type="button"
            onClick={() => {}}
            style={{
              width: "100%",
              boxSizing: "border-box",
              margin: 0,
              padding: "0.875rem 1rem",
              border: "none",
              borderRadius: `${mainCtaBorderRadiusPx}px`,
              backgroundColor: d.primaryColor,
              color: "#fff",
              fontWeight: "var(--vd-fw-strong)",
              cursor: "pointer",
              fontSize: `var(--vd-fs-cta, ${fs(d.fontSizeButton)})`,
            }}
          >
            {ctaLabel}
          </button>
        </Box>

        <Text
          as="p"
          variant="bodySm"
          tone="subdued"
          alignment="center"
          breakWord
        >
          <span
            style={{
              fontSize: `var(--vd-fs-footnote, ${fs(d.fontSizeFootnote)})`,
              fontWeight: "var(--vd-fw-normal)",
            }}
          >
            {d.footnote}
          </span>
        </Text>
        <Text as="p" variant="bodyXs" tone="subdued" alignment="center">
          Admin preview uses a $98 sample unit. Tier badges use Rule settings
          (or defaults when empty).
        </Text>
      </BlockStack>
    </div>
  );
}

export const QuantityBreaksTailwindPreview = memo(QuantityBreaksTailwindPreviewInner);

/** @deprecated Use QuantityBreaksTailwindPreview */
export const QuantityBreaksPolarisPreview = QuantityBreaksTailwindPreview;
