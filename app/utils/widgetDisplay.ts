import {
  type VolumeDiscountFontScale,
  type WidgetFontRole,
  FONT_SIZE_SCALE_PERCENT_DEFAULT,
  fontPixelsFromScale,
  parseFontSizeScalePercent,
  parseWidgetFontPx,
} from "./widgetFontSizes";
import { parseWidgetFontWeight } from "./widgetFontWeights";

export type { VolumeDiscountFontScale, WidgetFontRole } from "./widgetFontSizes";

export {
  clampFontSizeScalePercent,
  clampWidgetFontPx,
  FONT_SIZE_SCALE_PERCENT_DEFAULT,
  FONT_SIZE_SCALE_PERCENT_MAX,
  FONT_SIZE_SCALE_PERCENT_MIN,
  fontPixelsFromScale,
  parseFontSizeScalePercent,
  parseWidgetFontPx,
  scaledWidgetFontPx,
  scaledWidgetFontSizeCss,
  widgetFontSizeCss,
  WIDGET_FONT_PX_MAX,
  WIDGET_FONT_PX_MIN,
  WIDGET_FONT_PX_SELECT_OPTIONS,
} from "./widgetFontSizes";

export {
  clampWidgetFontWeight,
  parseWidgetFontWeight,
  WIDGET_FONT_WEIGHT_MAX,
  WIDGET_FONT_WEIGHT_MIN,
  WIDGET_FONT_WEIGHT_SELECT_OPTIONS,
} from "./widgetFontWeights";

/** Main CTA / “+ Add” behavior on the storefront widget. */
export type VolumeDiscountCtaButtonAction =
  | "add_to_cart"
  | "add_to_cart_open_drawer"
  | "go_to_checkout"
  | "go_to_page";

export const CTA_BUTTON_ACTION_OPTIONS: {
  label: string;
  value: VolumeDiscountCtaButtonAction;
}[] = [
  { label: "Add to cart", value: "add_to_cart" },
  {
    label: "Add to cart + open side cart",
    value: "add_to_cart_open_drawer",
  },
  { label: "Go to checkout", value: "go_to_checkout" },
  { label: "Go to specific page", value: "go_to_page" },
];

const CTA_ACTION_VALUES = CTA_BUTTON_ACTION_OPTIONS.map((o) => o.value);

/** Where the tier badge pill appears in each option row (storefront + preview). */
export type VolumeDiscountBadgePosition =
  | "after_label"
  | "below_label"
  | "after_subtext"
  | "top_left"
  | "top_center"
  | "top_right"
  | "price_column";

const BADGE_POSITION_VALUES: VolumeDiscountBadgePosition[] = [
  "after_label",
  "below_label",
  "after_subtext",
  "top_left",
  "top_center",
  "top_right",
  "price_column",
];

export const BADGE_POSITION_OPTIONS: {
  label: string;
  value: VolumeDiscountBadgePosition;
}[] = [
  { label: "After option label (same line)", value: "after_label" },
  { label: "Below option label", value: "below_label" },
  {
    label: "After subtext (before “You save”)",
    value: "after_subtext",
  },
  {
    label: "Top edge, left (pill overlaps card border)",
    value: "top_left",
  },
  {
    label: "Top edge, center (pill overlaps card border)",
    value: "top_center",
  },
  {
    label: "Top edge, right (pill overlaps card border)",
    value: "top_right",
  },
  { label: "Above price (right column)", value: "price_column" },
];

/** True when the badge floats on the card’s top edge (half pill above the border). */
export function isVolumeDiscountBadgeTopFloat(
  position: VolumeDiscountBadgePosition,
): boolean {
  return (
    position === "top_left" ||
    position === "top_center" ||
    position === "top_right"
  );
}

function pickBadgePosition(raw: unknown): VolumeDiscountBadgePosition {
  if (typeof raw === "string" && raw === "after_subtext_right") {
    return "after_subtext";
  }
  if (
    typeof raw === "string" &&
    (BADGE_POSITION_VALUES as string[]).includes(raw)
  ) {
    return raw as VolumeDiscountBadgePosition;
  }
  return "after_label";
}

export function isVolumeDiscountBadgePosition(
  value: string,
): value is VolumeDiscountBadgePosition {
  return (BADGE_POSITION_VALUES as string[]).includes(value);
}

/** Widget heading + countdown header row layout (storefront + preview). */
export type VolumeDiscountWidgetHeaderLayout = "split" | "stacked";

/** Horizontal alignment for heading text and countdown group. */
export type VolumeDiscountWidgetHeaderTextAlign = "start" | "center" | "end";

/** Admin duration unit → seconds multiplier when applying sale end from now. */
export type VolumeDiscountCountdownTimeUnit = "days" | "hours" | "minutes";

const COUNTDOWN_TIME_UNIT_VALUES: VolumeDiscountCountdownTimeUnit[] = [
  "days",
  "hours",
  "minutes",
];

export const COUNTDOWN_TIME_UNIT_OPTIONS: {
  label: string;
  value: VolumeDiscountCountdownTimeUnit;
}[] = [
  { label: "Days", value: "days" },
  { label: "Hours", value: "hours" },
  { label: "Minutes", value: "minutes" },
];

export function isVolumeDiscountCountdownTimeUnit(
  value: string,
): value is VolumeDiscountCountdownTimeUnit {
  return (COUNTDOWN_TIME_UNIT_VALUES as string[]).includes(value);
}

function pickCountdownTimeUnit(
  raw: unknown,
): VolumeDiscountCountdownTimeUnit {
  if (
    typeof raw === "string" &&
    isVolumeDiscountCountdownTimeUnit(raw)
  ) {
    return raw;
  }
  return "days";
}

function pickCountdownTimeAmount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(9999, n);
}

/** Remove legacy `%c` placeholder from stored countdown copy. */
export function sanitizeCountdownLabelForDisplay(raw: string): string {
  return raw
    .replace(/\s*%c\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WIDGET_HEADER_LAYOUT_VALUES: VolumeDiscountWidgetHeaderLayout[] = [
  "split",
  "stacked",
];

const WIDGET_HEADER_TEXT_ALIGN_VALUES: VolumeDiscountWidgetHeaderTextAlign[] = [
  "start",
  "center",
  "end",
];

export const WIDGET_HEADER_LAYOUT_OPTIONS: {
  label: string;
  value: VolumeDiscountWidgetHeaderLayout;
}[] = [
  { label: "Same row (wraps on small screens)", value: "split" },
  { label: "Stacked: heading, then timer", value: "stacked" },
];

/** Volume discount table — clearer labels (same values as `WIDGET_HEADER_LAYOUT_OPTIONS`). */
export const WIDGET_HEADER_LAYOUT_OPTIONS_VOLUME_TABLE: {
  label: string;
  value: VolumeDiscountWidgetHeaderLayout;
}[] = [
  {
    label: "One row: title and countdown side by side",
    value: "split",
  },
  {
    label: "Two rows: title on top, countdown below",
    value: "stacked",
  },
];

export const WIDGET_HEADER_TEXT_ALIGN_OPTIONS: {
  label: string;
  value: VolumeDiscountWidgetHeaderTextAlign;
}[] = [
  { label: "Left", value: "start" },
  { label: "Center", value: "center" },
  { label: "Right", value: "end" },
];

function pickWidgetHeaderLayout(
  raw: unknown,
): VolumeDiscountWidgetHeaderLayout {
  if (
    typeof raw === "string" &&
    (WIDGET_HEADER_LAYOUT_VALUES as string[]).includes(raw)
  ) {
    return raw as VolumeDiscountWidgetHeaderLayout;
  }
  return "split";
}

function pickWidgetHeaderTextAlign(
  raw: unknown,
  fallback: VolumeDiscountWidgetHeaderTextAlign,
): VolumeDiscountWidgetHeaderTextAlign {
  if (
    typeof raw === "string" &&
    (WIDGET_HEADER_TEXT_ALIGN_VALUES as string[]).includes(raw)
  ) {
    return raw as VolumeDiscountWidgetHeaderTextAlign;
  }
  return fallback;
}

export function isVolumeDiscountWidgetHeaderLayout(
  value: string,
): value is VolumeDiscountWidgetHeaderLayout {
  return (WIDGET_HEADER_LAYOUT_VALUES as string[]).includes(value);
}

export function isVolumeDiscountWidgetHeaderTextAlign(
  value: string,
): value is VolumeDiscountWidgetHeaderTextAlign {
  return (WIDGET_HEADER_TEXT_ALIGN_VALUES as string[]).includes(value);
}

/** Storefront + admin preview: tier cards vs volume pricing table. */
export type VolumeDiscountWidgetPresentation = "tier_cards" | "volume_table";

const WIDGET_PRESENTATION_VALUES: VolumeDiscountWidgetPresentation[] = [
  "tier_cards",
  "volume_table",
];

function pickWidgetPresentation(
  raw: unknown,
): VolumeDiscountWidgetPresentation {
  if (
    typeof raw === "string" &&
    (WIDGET_PRESENTATION_VALUES as string[]).includes(raw)
  ) {
    return raw as VolumeDiscountWidgetPresentation;
  }
  return "tier_cards";
}

/** Offers list / badges — avoids full `normalizeVolumeDiscountWidgetDisplay` per row. */
export function widgetPresentationFromStoredJson(
  widgetDisplay: unknown,
): VolumeDiscountWidgetPresentation {
  if (
    !widgetDisplay ||
    typeof widgetDisplay !== "object" ||
    Array.isArray(widgetDisplay)
  ) {
    return "tier_cards";
  }
  return pickWidgetPresentation(
    (widgetDisplay as Record<string, unknown>).widgetPresentation,
  );
}

export const WIDGET_PRESENTATION_OPTIONS: {
  label: string;
  value: VolumeDiscountWidgetPresentation;
}[] = [
  { label: "Tier cards (selectable rows)", value: "tier_cards" },
  {
    label: "Volume table (Quantity / Discount / Price per item)",
    value: "volume_table",
  },
];

export function isVolumeDiscountWidgetPresentation(
  value: string,
): value is VolumeDiscountWidgetPresentation {
  return (WIDGET_PRESENTATION_VALUES as string[]).includes(value);
}

/** Map header align to flex `justify-content` for the countdown row. */
export function countdownAlignToFlexJustify(
  align: VolumeDiscountWidgetHeaderTextAlign,
): "flex-start" | "center" | "flex-end" {
  if (align === "start") return "flex-start";
  if (align === "center") return "center";
  return "flex-end";
}

function pickCtaButtonAction(raw: unknown): VolumeDiscountCtaButtonAction {
  if (
    typeof raw === "string" &&
    (CTA_ACTION_VALUES as string[]).includes(raw)
  ) {
    return raw as VolumeDiscountCtaButtonAction;
  }
  return "add_to_cart_open_drawer";
}

/** Tier badge pill only: scales font + padding on top of “Badge” px × global text scale. */
export const BADGE_SIZE_SCALE_PERCENT_MIN = 60;
export const BADGE_SIZE_SCALE_PERCENT_MAX = 160;
export const BADGE_SIZE_SCALE_PERCENT_DEFAULT = 100;

export function clampBadgeSizeScalePercent(n: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) {
    return BADGE_SIZE_SCALE_PERCENT_DEFAULT;
  }
  return Math.min(
    BADGE_SIZE_SCALE_PERCENT_MAX,
    Math.max(BADGE_SIZE_SCALE_PERCENT_MIN, x),
  );
}

function pickBadgeSizeScalePercent(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampBadgeSizeScalePercent(raw);
  }
  if (typeof raw === "string") {
    const n = parseInt(String(raw).trim().replace(/%/g, ""), 10);
    if (!Number.isNaN(n)) return clampBadgeSizeScalePercent(n);
  }
  return BADGE_SIZE_SCALE_PERCENT_DEFAULT;
}

/** Max length for merchant-authored CSS stored in `widgetDisplay.customCss`. */
export const WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS = 32_000;

function pickCustomCss(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.length <= WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS
    ? s
    : s.slice(0, WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS);
}

/** Ten built-in storefront look presets (admin picker); `custom` = merchant-tweaked. */
export const VOLUME_DISCOUNT_APPEARANCE_PRESET_IDS = [
  "classic_burgundy",
  "sunset_orange",
  "ocean_blue",
  "forest_green",
  "royal_purple",
  "midnight_slate",
  "rose_coral",
  "mono_slate",
  "teal_mint",
  "amber_gold",
] as const;

export type VolumeDiscountAppearancePresetId =
  (typeof VOLUME_DISCOUNT_APPEARANCE_PRESET_IDS)[number];

export type VolumeDiscountAppearanceTemplateId =
  | VolumeDiscountAppearancePresetId
  | "custom";

const APPEARANCE_PRESET_ID_SET = new Set<string>(
  VOLUME_DISCOUNT_APPEARANCE_PRESET_IDS,
);

export function isVolumeDiscountAppearancePresetId(
  value: string,
): value is VolumeDiscountAppearancePresetId {
  return APPEARANCE_PRESET_ID_SET.has(value);
}

/** Product-page widget appearance; stored on `VolumeDiscountCampaign.widgetDisplay`. */
export type VolumeDiscountWidgetDisplay = {
  /** Overrides theme block heading when non-empty after trim. */
  widgetHeading: string;
  /**
   * `tier_cards` = selectable tier rows (default). `volume_table` = Quantity / Discount / Price per item table.
   */
  widgetPresentation: VolumeDiscountWidgetPresentation;
  showCountdown: boolean;
  /**
   * `split` = heading and countdown on one row (wraps); `stacked` = heading then countdown below.
   */
  widgetHeaderLayout: VolumeDiscountWidgetHeaderLayout;
  /** Text alignment for the widget title in the header. */
  widgetHeadingAlign: VolumeDiscountWidgetHeaderTextAlign;
  /** Alignment of the countdown label + pill as a group. */
  countdownAlign: VolumeDiscountWidgetHeaderTextAlign;
  /** When true, countdown is shown before the heading (left on split, above when stacked). */
  widgetHeaderSwapOrder: boolean;
  /**
   * When true (default), narrow viewports stack heading + countdown and center them.
   * When false, “split” stays one row on phones (may wrap); stacked layout unchanged.
   */
  widgetHeaderMobileStack: boolean;
  /** Muted timer label beside the pill; live time (e.g. `23h 5m`, zeros hidden) is inside the pill. */
  countdownLabel: string;
  /** Duration number; with `countdownTimeUnit`, sets sale end from “now” when applied. */
  countdownTimeAmount: number;
  countdownTimeUnit: VolumeDiscountCountdownTimeUnit;
  ctaLabel: string;
  /** After add: stay on page, open drawer, checkout, or custom path (same shop only). */
  ctaButtonAction: VolumeDiscountCtaButtonAction;
  /** Used when `ctaButtonAction` is `go_to_page` — relative `/path` or full URL on this shop. */
  ctaButtonPageUrl: string;
  /** Hide native product “Add to cart” in the theme (storefront script). */
  hideThemeAddToCart: boolean;
  /** Hide theme dynamic checkout / “Buy it now” (Shop Pay, etc.). */
  hideThemeBuyItNow: boolean;
  /**
   * Hide the theme product form’s variant UI (dropdown / swatches / radios for `name="id"`).
   * Use the widget’s variant picker; leave “Hide variant selector in widget” off.
   */
  hideThemeVariantSelector: boolean;
  /**
   * Hide the theme product form’s quantity control (+/− or input). Widget qty / tier selection drives cart qty.
   */
  hideThemeQuantitySelector: boolean;
  /** Hide variant dropdown inside the widget; use the theme product form variant instead. */
  hideWidgetVariantSelector: boolean;
  /**
   * When true, variants with `available: false` in the embed JSON are omitted from the
   * widget variant dropdown only (legacy JSON without `available` treats all as in stock).
   */
  hideOutOfStockVariants: boolean;
  /** Hide +/- quantity in the widget; quantity follows the selected tier only. */
  hideWidgetQuantitySelector: boolean;
  /** Hide line total (qty × unit) in the expanded tier row. */
  hideWidgetLineTotal: boolean;
  /** Hide per-tier “+ Add” in the expanded row; main CTA still adds. */
  hideWidgetTierAddButton: boolean;
  /**
   * When true, tier card column shows per-item compare + sale price.
   * When false (default), shows line total for the tier minimum quantity.
   */
  cardPriceShowsUnit: boolean;
  /** Hide strikethrough compare-at price in tier cards (“You save” can still show). */
  hideWidgetComparePrice: boolean;
  /**
   * Volume discount (`volume_table`) only: hide the app’s main button under the
   * pricing table. Theme Add to cart is controlled separately.
   */
  hideWidgetMainCta: boolean;
  /**
   * Volume discount table only: vertical padding inside header and body cells (px).
   * Controls row height. Storefront: `--vd-vt-cell-pad-block`.
   */
  volumeTableCellPaddingPx: number;
  /**
   * Volume discount table: horizontal text alignment per column (Quantity / Discount / Price).
   * Values `start` | `center` | `end` → CSS `text-align`. Storefront: `--vd-vt-col{n}-text-align`.
   */
  volumeTableQuantityColumnAlign: VolumeDiscountWidgetHeaderTextAlign;
  volumeTableDiscountColumnAlign: VolumeDiscountWidgetHeaderTextAlign;
  volumeTablePriceColumnAlign: VolumeDiscountWidgetHeaderTextAlign;
  /**
   * Volume discount table: inline-start / inline-end padding per column (px), header and body.
   * Storefront: `--vd-vt-col{n}-pad-inline-start` / `--vd-vt-col{n}-pad-inline-end`.
   */
  volumeTableQuantityColPaddingStartPx: number;
  volumeTableQuantityColPaddingEndPx: number;
  volumeTableDiscountColPaddingStartPx: number;
  volumeTableDiscountColPaddingEndPx: number;
  volumeTablePriceColPaddingStartPx: number;
  volumeTablePriceColPaddingEndPx: number;
  /** Placement of the tier badge relative to the option label and subtext. */
  badgePosition: VolumeDiscountBadgePosition;
  /** Tier badge pill background (Rule settings → badge text). */
  badgeBackgroundColor: string;
  /** Tier badge pill text color. */
  badgeTextColor: string;
  /**
   * Extra scale for the tier badge only (%). 100 = size from “Badge” font px × global text scale.
   * Drives `--vd-badge-size-scale` (font + padding).
   */
  badgeSizeScalePercent: number;
  footnote: string;
  primaryColor: string;
  primaryHoverColor: string;
  selectedBgColor: string;
  countdownBgColor: string;
  countdownTextColor: string;
  savingsColor: string;
  /**
   * Volume discount table: “Discount” column header + percent values.
   * When missing in stored JSON, normalizes to `savingsColor`.
   */
  volumeTableDiscountColor: string;
  /** Color for tier “option subtext” under the buy label (separate from “You save”). */
  optionSubtextColor: string;
  mutedColor: string;
  cardBorderColor: string;
  /** Tier / option card corner radius (px) → `--vd-radius-card`. */
  cardBorderRadiusPx: number;
  /** Main “Grab this deal” CTA corner radius (px) → `--vd-radius-cta`. */
  buttonBorderRadiusPx: number;
  /**
   * Variant dropdown, qty stepper, and tier-row “+ Add” (expanded row) — px → `--vd-radius-control`.
   */
  controlBorderRadiusPx: number;
  /** Custom tier radio outer diameter (px) → `--vd-radio`. */
  radioButtonSizePx: number;
  /** Unselected radio ring color → `--vd-radio-border`. */
  radioButtonBorderColor: string;
  /** Selected radio ring + inner dot → `--vd-radio-accent` (often matches primary). */
  radioButtonAccentColor: string;
  /** Quick preset; seeds per-element px when migrating or resetting. */
  fontScale: VolumeDiscountFontScale;
  /**
   * Global font size scale (%). 100 = use base px as-is; e.g. 105 enlarges all text by 5%.
   * Base title at default preset is 19 px at 100%.
   */
  fontSizeScalePercent: number;
  /** Widget title line (e.g. “Get more, save more”) — base px before `fontSizeScalePercent`. */
  fontSizeTitle: number;
  /** Tier option text (e.g. “Buy 10–14”) — px. */
  fontSizeBuyLabel: number;
  /** Badge pill — px. */
  fontSizeBadge: number;
  /** Main / discounted price — px. */
  fontSizePrice: number;
  /** Strikethrough compare-at price — px. */
  fontSizeComparePrice: number;
  /** “You save …” line — px. */
  fontSizeSavings: number;
  /** Subtext under tier / option name — px (legacy: copied from fontSizeSavings when unset). */
  fontSizeOptionSubtext: number;
  /** CTA button text — px. */
  fontSizeButton: number;
  /** “Sales end in” (muted) — px. */
  fontSizeCountdownLabel: number;
  /** Countdown time pill — px. */
  fontSizeCountdownValue: number;
  /** Text under the button — px. */
  fontSizeFootnote: number;
  /**
   * CSS numeric font-weight for headings, tier labels, prices, line totals, main CTA, + Add.
   * Storefront: `--vd-fw-strong`.
   */
  fontWeightStrong: number;
  /** Badges, countdown pill, quantity +/- — `--vd-fw-accent`. */
  fontWeightAccent: number;
  /** “You save” and tier subtext — `--vd-fw-body`. */
  fontWeightBody: number;
  /** Footnote, compare-at, muted label lines, tier “#” index — `--vd-fw-normal`. */
  fontWeightNormal: number;
  /**
   * Optional CSS injected as a `<style>` inside the storefront widget root
   * (`.volume-discount-embed`). Merchant-owned; scope selectors under that class.
   */
  customCss: string;
  /**
   * Admin: last chosen appearance preset, or `custom` after a manual tweak to
   * colors/layout/CSS in the list `WIDGET_APPEARANCE_CUSTOM_TRIGGER_KEYS`.
   * Ignored on the storefront; persisted for the editor only.
   */
  appearanceTemplateId: VolumeDiscountAppearanceTemplateId;
};

/**
 * Widget fields that, when changed without setting `appearanceTemplateId`, flip the
 * template picker to “Custom”.
 */
export const WIDGET_APPEARANCE_CUSTOM_TRIGGER_KEYS = new Set<
  keyof VolumeDiscountWidgetDisplay
>([
  "widgetPresentation",
  "primaryColor",
  "primaryHoverColor",
  "selectedBgColor",
  "countdownBgColor",
  "countdownTextColor",
  "savingsColor",
  "volumeTableDiscountColor",
  "optionSubtextColor",
  "mutedColor",
  "cardBorderColor",
  "badgeBackgroundColor",
  "badgeTextColor",
  "radioButtonBorderColor",
  "radioButtonAccentColor",
  "cardBorderRadiusPx",
  "buttonBorderRadiusPx",
  "controlBorderRadiusPx",
  "badgePosition",
  "badgeSizeScalePercent",
  "radioButtonSizePx",
  "widgetHeaderLayout",
  "widgetHeadingAlign",
  "countdownAlign",
  "widgetHeaderSwapOrder",
  "widgetHeaderMobileStack",
  "customCss",
  "hideWidgetMainCta",
  "volumeTableCellPaddingPx",
  "volumeTableQuantityColumnAlign",
  "volumeTableDiscountColumnAlign",
  "volumeTablePriceColumnAlign",
  "volumeTableQuantityColPaddingStartPx",
  "volumeTableQuantityColPaddingEndPx",
  "volumeTableDiscountColPaddingStartPx",
  "volumeTableDiscountColPaddingEndPx",
  "volumeTablePriceColPaddingStartPx",
  "volumeTablePriceColPaddingEndPx",
]);

type VolumeDiscountWidgetFontSizeKeys = Pick<
  VolumeDiscountWidgetDisplay,
  | "fontSizeTitle"
  | "fontSizeBuyLabel"
  | "fontSizeBadge"
  | "fontSizePrice"
  | "fontSizeComparePrice"
  | "fontSizeSavings"
  | "fontSizeOptionSubtext"
  | "fontSizeButton"
  | "fontSizeCountdownLabel"
  | "fontSizeCountdownValue"
  | "fontSizeFootnote"
>;

const FONT_SCALES: VolumeDiscountFontScale[] = [
  "compact",
  "default",
  "comfortable",
];

const FONT_ROLE_KEYS: WidgetFontRole[] = [
  "title",
  "buyLabel",
  "badge",
  "price",
  "comparePrice",
  "savings",
  "optionSubtext",
  "button",
  "countdownLabel",
  "countdownValue",
  "footnote",
];

const DISPLAY_KEY_FOR_ROLE: Record<
  WidgetFontRole,
  keyof VolumeDiscountWidgetFontSizeKeys
> = {
  title: "fontSizeTitle",
  buyLabel: "fontSizeBuyLabel",
  badge: "fontSizeBadge",
  price: "fontSizePrice",
  comparePrice: "fontSizeComparePrice",
  savings: "fontSizeSavings",
  optionSubtext: "fontSizeOptionSubtext",
  button: "fontSizeButton",
  countdownLabel: "fontSizeCountdownLabel",
  countdownValue: "fontSizeCountdownValue",
  footnote: "fontSizeFootnote",
};

export type WidgetColorRgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function clamp255(n: number): number {
  return Math.min(255, Math.max(0, Math.round(Number(n))));
}

function clamp01a(n: number): number {
  return Math.min(1, Math.max(0, Number(n)));
}

/** Parse `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, or `rgba()` → channels. */
export function parseWidgetColor(input: string): WidgetColorRgba | null {
  const s = input.trim();
  if (!s) return null;

  const rgbaRe =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;
  const rm = rgbaRe.exec(s.replace(/\s+/g, " "));
  if (rm) {
    const r = Number(rm[1]);
    const g = Number(rm[2]);
    const b = Number(rm[3]);
    const a = rm[4] != null ? Number(rm[4]) : 1;
    if (![r, g, b, a].every((x) => Number.isFinite(x))) return null;
    return {
      r: clamp255(r),
      g: clamp255(g),
      b: clamp255(b),
      a: clamp01a(a),
    };
  }

  const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const hm = hexRe.exec(s);
  if (!hm) return null;
  let h = hm[1]!;
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: clamp01a(parseInt(h.slice(6, 8), 16) / 255),
    };
  }
  return null;
}

export function rgbaToCssString(c: WidgetColorRgba): string {
  if (c.a >= 0.999) {
    const to2 = (n: number) => clamp255(n).toString(16).padStart(2, "0");
    return `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
  }
  const a = Math.round(c.a * 1000) / 1000;
  return `rgba(${clamp255(c.r)}, ${clamp255(c.g)}, ${clamp255(c.b)}, ${a})`;
}

/** Canonical CSS color for widget JSON (hex if opaque, else `rgba()`). */
export function normalizeWidgetColor(input: string, fallback: string): string {
  const p = parseWidgetColor(input);
  if (p) return rgbaToCssString(p);
  return fallback;
}

function pickCssColor(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  return normalizeWidgetColor(raw, fallback);
}

function pickString(raw: unknown, fallback: string): string {
  return typeof raw === "string" ? raw : fallback;
}

function pickBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

/** Tier cards use `--vd-radius-card`; main CTA uses `--vd-radius-cta`; compact controls use `--vd-radius-control`. */
export const WIDGET_BORDER_RADIUS_PX_MIN = 0;
export const WIDGET_BORDER_RADIUS_PX_MAX = 32;

export const WIDGET_RADIO_BUTTON_SIZE_PX_MIN = 10;
export const WIDGET_RADIO_BUTTON_SIZE_PX_MAX = 36;
export const WIDGET_RADIO_BUTTON_SIZE_PX_DEFAULT = 24;

export function clampRadioButtonSizePx(n: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) {
    return WIDGET_RADIO_BUTTON_SIZE_PX_DEFAULT;
  }
  return Math.min(
    WIDGET_RADIO_BUTTON_SIZE_PX_MAX,
    Math.max(WIDGET_RADIO_BUTTON_SIZE_PX_MIN, x),
  );
}

export function clampWidgetBorderRadiusPx(n: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) {
    return 14;
  }
  return Math.min(
    WIDGET_BORDER_RADIUS_PX_MAX,
    Math.max(WIDGET_BORDER_RADIUS_PX_MIN, x),
  );
}

/** Volume table cell vertical padding (row height). */
export const WIDGET_VOLUME_TABLE_CELL_PADDING_PX_MIN = 4;
export const WIDGET_VOLUME_TABLE_CELL_PADDING_PX_MAX = 36;
export const WIDGET_VOLUME_TABLE_CELL_PADDING_PX_DEFAULT = 11;

/** Horizontal padding inside volume-table cells (per column); 0 allows flush edges. */
export const WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN = 0;
export const WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX = 36;

export function clampVolumeTableColInlinePaddingPx(n: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) {
    return 0;
  }
  return Math.min(
    WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX,
    Math.max(WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN, x),
  );
}

function pickVolumeTableColInlinePaddingPx(
  raw: unknown,
  fallback: number,
): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampVolumeTableColInlinePaddingPx(raw);
  }
  if (typeof raw === "string") {
    const n = parseInt(raw.trim(), 10);
    if (!Number.isNaN(n)) return clampVolumeTableColInlinePaddingPx(n);
  }
  return clampVolumeTableColInlinePaddingPx(fallback);
}

export function clampVolumeTableCellPaddingPx(n: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) {
    return WIDGET_VOLUME_TABLE_CELL_PADDING_PX_DEFAULT;
  }
  return Math.min(
    WIDGET_VOLUME_TABLE_CELL_PADDING_PX_MAX,
    Math.max(WIDGET_VOLUME_TABLE_CELL_PADDING_PX_MIN, x),
  );
}

function pickVolumeTableCellPaddingPx(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampVolumeTableCellPaddingPx(raw);
  }
  if (typeof raw === "string") {
    const n = parseInt(raw.trim(), 10);
    if (!Number.isNaN(n)) return clampVolumeTableCellPaddingPx(n);
  }
  return clampVolumeTableCellPaddingPx(fallback);
}

function pickBorderRadiusPx(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampWidgetBorderRadiusPx(raw);
  }
  if (typeof raw === "string") {
    const n = parseInt(raw.trim(), 10);
    if (!Number.isNaN(n)) return clampWidgetBorderRadiusPx(n);
  }
  return clampWidgetBorderRadiusPx(fallback);
}

function pickRadioButtonSizePx(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampRadioButtonSizePx(raw);
  }
  if (typeof raw === "string") {
    const n = parseInt(raw.trim(), 10);
    if (!Number.isNaN(n)) return clampRadioButtonSizePx(n);
  }
  return clampRadioButtonSizePx(fallback);
}

function pickFontScale(raw: unknown): VolumeDiscountFontScale {
  if (
    typeof raw === "string" &&
    (FONT_SCALES as string[]).includes(raw)
  ) {
    return raw as VolumeDiscountFontScale;
  }
  return "default";
}

function fontDisplaySizesFromRaw(
  o: Record<string, unknown>,
  scale: VolumeDiscountFontScale,
): VolumeDiscountWidgetFontSizeKeys {
  const preset = fontPixelsFromScale(scale);
  const fontSizes = {} as VolumeDiscountWidgetFontSizeKeys;
  for (const role of FONT_ROLE_KEYS) {
    const key = DISPLAY_KEY_FOR_ROLE[role];
    let rawVal: unknown = o[key as string];
    if (
      role === "optionSubtext" &&
      (rawVal === undefined || rawVal === null) &&
      Object.prototype.hasOwnProperty.call(o, "fontSizeSavings")
    ) {
      rawVal = o.fontSizeSavings;
    }
    fontSizes[key] = parseWidgetFontPx(rawVal, role, preset[role]);
  }
  return fontSizes;
}

/** All per-element px for `fontScale` (preset + reset). */
export function widgetDisplayFontSizesFromScale(
  scale: VolumeDiscountFontScale,
): VolumeDiscountWidgetFontSizeKeys {
  return fontDisplaySizesFromRaw({}, scale);
}

export type VolumeDiscountAppearancePresetRow = {
  id: VolumeDiscountAppearancePresetId;
  label: string;
  /** Swatch for admin template grid (usually matches primary). */
  swatch: string;
  patch: Partial<VolumeDiscountWidgetDisplay>;
};

/**
 * Ten one-click storefront looks (colors, radii, badge/header layout).
 * Same `widgetDisplay` schema; only these fields are overwritten when applying a preset.
 */
export const VOLUME_DISCOUNT_APPEARANCE_PRESETS: VolumeDiscountAppearancePresetRow[] =
  [
    {
      id: "classic_burgundy",
      label: "Classic burgundy",
      swatch: "#6b1d1e",
      patch: {
        primaryColor: "#6b1d1e",
        primaryHoverColor: "#551618",
        selectedBgColor: "#fff5f5",
        countdownBgColor: "#fce8e8",
        countdownTextColor: "#b42318",
        savingsColor: "#ea580c",
        optionSubtextColor: "#784a4f",
        mutedColor: "#616161",
        cardBorderColor: "#d4d4d4",
        badgeBackgroundColor: "#6b1d1e",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#bdbdbd",
        radioButtonAccentColor: "#6b1d1e",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "sunset_orange",
      label: "Sunset orange",
      swatch: "#ea580c",
      patch: {
        primaryColor: "#ea580c",
        primaryHoverColor: "#c2410c",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#ea580c",
        optionSubtextColor: "#9a3412",
        mutedColor: "#57534e",
        cardBorderColor: "#e7e5e4",
        badgeBackgroundColor: "#ea580c",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#d6d3d1",
        radioButtonAccentColor: "#ea580c",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "top_center",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ocean_blue",
      label: "Ocean blue",
      swatch: "#2563eb",
      patch: {
        primaryColor: "#2563eb",
        primaryHoverColor: "#1d4ed8",
        selectedBgColor: "#eff6ff",
        countdownBgColor: "#dbeafe",
        countdownTextColor: "#1e40af",
        savingsColor: "#0284c7",
        optionSubtextColor: "#1e40af",
        mutedColor: "#64748b",
        cardBorderColor: "#cbd5e1",
        badgeBackgroundColor: "#1d4ed8",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#94a3b8",
        radioButtonAccentColor: "#2563eb",
        cardBorderRadiusPx: 10,
        buttonBorderRadiusPx: 10,
        controlBorderRadiusPx: 8,
        badgePosition: "after_label",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "end",
        countdownAlign: "start",
        widgetHeaderSwapOrder: true,
      },
    },
    {
      id: "forest_green",
      label: "Forest green",
      swatch: "#15803d",
      patch: {
        primaryColor: "#15803d",
        primaryHoverColor: "#166534",
        selectedBgColor: "#f0fdf4",
        countdownBgColor: "#dcfce7",
        countdownTextColor: "#14532d",
        savingsColor: "#16a34a",
        optionSubtextColor: "#166534",
        mutedColor: "#525252",
        cardBorderColor: "#d4d4d4",
        badgeBackgroundColor: "#15803d",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#a3a3a3",
        radioButtonAccentColor: "#15803d",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "below_label",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "royal_purple",
      label: "Royal purple",
      swatch: "#7c3aed",
      patch: {
        primaryColor: "#7c3aed",
        primaryHoverColor: "#6d28d9",
        selectedBgColor: "#f5f3ff",
        countdownBgColor: "#ede9fe",
        countdownTextColor: "#5b21b6",
        savingsColor: "#9333ea",
        optionSubtextColor: "#6d28d9",
        mutedColor: "#737373",
        cardBorderColor: "#d4d4d4",
        badgeBackgroundColor: "#6d28d9",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#c4b5fd",
        radioButtonAccentColor: "#7c3aed",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_subtext",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "midnight_slate",
      label: "Midnight slate",
      swatch: "#0f172a",
      patch: {
        primaryColor: "#0f172a",
        primaryHoverColor: "#020617",
        selectedBgColor: "#f8fafc",
        countdownBgColor: "#e2e8f0",
        countdownTextColor: "#334155",
        savingsColor: "#0f766e",
        optionSubtextColor: "#475569",
        mutedColor: "#64748b",
        cardBorderColor: "#cbd5e1",
        badgeBackgroundColor: "#0f172a",
        badgeTextColor: "#f8fafc",
        radioButtonBorderColor: "#94a3b8",
        radioButtonAccentColor: "#0f172a",
        cardBorderRadiusPx: 8,
        buttonBorderRadiusPx: 8,
        controlBorderRadiusPx: 6,
        badgePosition: "top_left",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "start",
        countdownAlign: "start",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "rose_coral",
      label: "Rose coral",
      swatch: "#e11d48",
      patch: {
        primaryColor: "#e11d48",
        primaryHoverColor: "#be123c",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9f1239",
        savingsColor: "#f97316",
        optionSubtextColor: "#9f1239",
        mutedColor: "#78716c",
        cardBorderColor: "#e7e5e4",
        badgeBackgroundColor: "#e11d48",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#fecdd3",
        radioButtonAccentColor: "#e11d48",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 18,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "mono_slate",
      label: "Mono slate",
      swatch: "#475569",
      patch: {
        primaryColor: "#475569",
        primaryHoverColor: "#334155",
        selectedBgColor: "#f8fafc",
        countdownBgColor: "#f1f5f9",
        countdownTextColor: "#334155",
        savingsColor: "#64748b",
        optionSubtextColor: "#64748b",
        mutedColor: "#64748b",
        cardBorderColor: "#e2e8f0",
        badgeBackgroundColor: "#334155",
        badgeTextColor: "#f8fafc",
        radioButtonBorderColor: "#cbd5e1",
        radioButtonAccentColor: "#475569",
        cardBorderRadiusPx: 6,
        buttonBorderRadiusPx: 6,
        controlBorderRadiusPx: 4,
        badgePosition: "after_label",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "teal_mint",
      label: "Teal mint",
      swatch: "#0d9488",
      patch: {
        primaryColor: "#0d9488",
        primaryHoverColor: "#0f766e",
        selectedBgColor: "#f0fdfa",
        countdownBgColor: "#ccfbf1",
        countdownTextColor: "#115e59",
        savingsColor: "#059669",
        optionSubtextColor: "#0f766e",
        mutedColor: "#57534e",
        cardBorderColor: "#d6d3d1",
        badgeBackgroundColor: "#0f766e",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#99f6e4",
        radioButtonAccentColor: "#0d9488",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 10,
        badgePosition: "price_column",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "amber_gold",
      label: "Amber gold",
      swatch: "#d97706",
      patch: {
        primaryColor: "#b45309",
        primaryHoverColor: "#92400e",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#92400e",
        savingsColor: "#d97706",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#e7e5e4",
        badgeBackgroundColor: "#b45309",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fcd34d",
        radioButtonAccentColor: "#b45309",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 20,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
  ];

/** Color-only overrides for Volume discount (table) templates — Quantity breaks presets unchanged. */
type VolumeTablePresetColorPatch = Pick<
  VolumeDiscountWidgetDisplay,
  | "primaryColor"
  | "primaryHoverColor"
  | "selectedBgColor"
  | "countdownBgColor"
  | "countdownTextColor"
  | "savingsColor"
  | "optionSubtextColor"
  | "mutedColor"
  | "cardBorderColor"
  | "badgeBackgroundColor"
  | "badgeTextColor"
  | "radioButtonBorderColor"
  | "radioButtonAccentColor"
>;

const VOLUME_TABLE_APPEARANCE_COLOR_PATCHES: Record<
  VolumeDiscountAppearancePresetId,
  VolumeTablePresetColorPatch
> = {
  classic_burgundy: {
    primaryColor: "#722f37",
    primaryHoverColor: "#5c262d",
    selectedBgColor: "#fdf2f2",
    countdownBgColor: "#fecdd3",
    countdownTextColor: "#7f1d1d",
    savingsColor: "#c2410c",
    optionSubtextColor: "#6b2d32",
    mutedColor: "#57534e",
    cardBorderColor: "#e8b4b8",
    badgeBackgroundColor: "#722f37",
    badgeTextColor: "#ffffff",
    radioButtonBorderColor: "#d6d3d1",
    radioButtonAccentColor: "#722f37",
  },
  sunset_orange: {
    primaryColor: "#ea580c",
    primaryHoverColor: "#c2410c",
    selectedBgColor: "#fff7ed",
    countdownBgColor: "#fed7aa",
    countdownTextColor: "#9a3412",
    savingsColor: "#d97706",
    optionSubtextColor: "#b45309",
    mutedColor: "#57534e",
    cardBorderColor: "#fdba74",
    badgeBackgroundColor: "#ea580c",
    badgeTextColor: "#ffffff",
    radioButtonBorderColor: "#d6d3d1",
    radioButtonAccentColor: "#ea580c",
  },
  ocean_blue: {
    primaryColor: "#1e40af",
    primaryHoverColor: "#1e3a8a",
    selectedBgColor: "#eff6ff",
    countdownBgColor: "#bfdbfe",
    countdownTextColor: "#1e3a8a",
    savingsColor: "#0369a1",
    optionSubtextColor: "#1d4ed8",
    mutedColor: "#64748b",
    cardBorderColor: "#93c5fd",
    badgeBackgroundColor: "#1d4ed8",
    badgeTextColor: "#ffffff",
    radioButtonBorderColor: "#94a3b8",
    radioButtonAccentColor: "#2563eb",
  },
  forest_green: {
    primaryColor: "#166534",
    primaryHoverColor: "#14532d",
    selectedBgColor: "#f0fdf4",
    countdownBgColor: "#bbf7d0",
    countdownTextColor: "#14532d",
    savingsColor: "#15803d",
    optionSubtextColor: "#166534",
    mutedColor: "#525252",
    cardBorderColor: "#86efac",
    badgeBackgroundColor: "#166534",
    badgeTextColor: "#ffffff",
    radioButtonBorderColor: "#a3a3a3",
    radioButtonAccentColor: "#15803d",
  },
  royal_purple: {
    primaryColor: "#5b21b6",
    primaryHoverColor: "#4c1d95",
    selectedBgColor: "#faf5ff",
    countdownBgColor: "#e9d5ff",
    countdownTextColor: "#5b21b6",
    savingsColor: "#7c3aed",
    optionSubtextColor: "#6d28d9",
    mutedColor: "#6b7280",
    cardBorderColor: "#d8b4fe",
    badgeBackgroundColor: "#5b21b6",
    badgeTextColor: "#ffffff",
    radioButtonBorderColor: "#c4b5fd",
    radioButtonAccentColor: "#7c3aed",
  },
  midnight_slate: {
    primaryColor: "#1e293b",
    primaryHoverColor: "#0f172a",
    selectedBgColor: "#f8fafc",
    countdownBgColor: "#cbd5e1",
    countdownTextColor: "#334155",
    savingsColor: "#0d9488",
    optionSubtextColor: "#475569",
    mutedColor: "#64748b",
    cardBorderColor: "#94a3b8",
    badgeBackgroundColor: "#1e293b",
    badgeTextColor: "#f8fafc",
    radioButtonBorderColor: "#94a3b8",
    radioButtonAccentColor: "#1e293b",
  },
  rose_coral: {
    primaryColor: "#db2777",
    primaryHoverColor: "#be185d",
    selectedBgColor: "#fdf2f8",
    countdownBgColor: "#fbcfe8",
    countdownTextColor: "#9d174d",
    savingsColor: "#ea580c",
    optionSubtextColor: "#9d174d",
    mutedColor: "#78716c",
    cardBorderColor: "#f9a8d4",
    badgeBackgroundColor: "#db2777",
    badgeTextColor: "#ffffff",
    radioButtonBorderColor: "#fecdd3",
    radioButtonAccentColor: "#db2777",
  },
  mono_slate: {
    primaryColor: "#334155",
    primaryHoverColor: "#1e293b",
    selectedBgColor: "#f8fafc",
    countdownBgColor: "#e2e8f0",
    countdownTextColor: "#475569",
    savingsColor: "#475569",
    optionSubtextColor: "#64748b",
    mutedColor: "#64748b",
    cardBorderColor: "#cbd5e1",
    badgeBackgroundColor: "#1e293b",
    badgeTextColor: "#f8fafc",
    radioButtonBorderColor: "#cbd5e1",
    radioButtonAccentColor: "#475569",
  },
  teal_mint: {
    primaryColor: "#0f766e",
    primaryHoverColor: "#115e59",
    selectedBgColor: "#f0fdfa",
    countdownBgColor: "#99f6e4",
    countdownTextColor: "#134e4a",
    savingsColor: "#059669",
    optionSubtextColor: "#0d9488",
    mutedColor: "#57534e",
    cardBorderColor: "#5eead4",
    badgeBackgroundColor: "#0f766e",
    badgeTextColor: "#ffffff",
    radioButtonBorderColor: "#99f6e4",
    radioButtonAccentColor: "#0d9488",
  },
  amber_gold: {
    primaryColor: "#b45309",
    primaryHoverColor: "#92400e",
    selectedBgColor: "#fffbeb",
    countdownBgColor: "#fde68a",
    countdownTextColor: "#92400e",
    savingsColor: "#ca8a04",
    optionSubtextColor: "#a16207",
    mutedColor: "#78716c",
    cardBorderColor: "#fcd34d",
    badgeBackgroundColor: "#b45309",
    badgeTextColor: "#fffbeb",
    radioButtonBorderColor: "#fcd34d",
    radioButtonAccentColor: "#b45309",
  },
};

/**
 * Ten one-click looks for Volume discount (pricing table). Same preset ids and
 * layout/radii as Quantity breaks, but **colors** are table-tuned via
 * `VOLUME_TABLE_APPEARANCE_COLOR_PATCHES`. Stacked QB presets → centered header rows.
 */
export const VOLUME_TABLE_APPEARANCE_PRESETS: VolumeDiscountAppearancePresetRow[] =
  VOLUME_DISCOUNT_APPEARANCE_PRESETS.map((row) => {
    const p = row.patch;
    const stacked = p.widgetHeaderLayout === "stacked";
    const colors = VOLUME_TABLE_APPEARANCE_COLOR_PATCHES[row.id];
    return {
      id: row.id,
      label: row.label,
      swatch: colors.primaryColor,
      patch: {
        ...p,
        ...colors,
        widgetHeaderLayout: stacked ? "stacked" : "split",
        widgetHeadingAlign: stacked
          ? "center"
          : (p.widgetHeadingAlign ?? "center"),
        countdownAlign: stacked
          ? "center"
          : (p.countdownAlign ?? "end"),
      },
    };
  });

/** When a preset updates savings but not the volume-table column, keep them aligned. */
function mergeAppearancePresetPatch(
  patch: Partial<VolumeDiscountWidgetDisplay>,
): Partial<VolumeDiscountWidgetDisplay> {
  if (
    patch.savingsColor !== undefined &&
    patch.volumeTableDiscountColor === undefined
  ) {
    return { ...patch, volumeTableDiscountColor: patch.savingsColor };
  }
  return patch;
}

/** Apply a Volume discount template (table layout); keeps copy, CTA, and visibility toggles. */
export function applyVolumeTableAppearancePreset(
  current: VolumeDiscountWidgetDisplay,
  presetId: VolumeDiscountAppearancePresetId,
): VolumeDiscountWidgetDisplay {
  const row = VOLUME_TABLE_APPEARANCE_PRESETS.find((p) => p.id === presetId);
  if (!row) return current;
  const patch = mergeAppearancePresetPatch(row.patch);
  return normalizeVolumeDiscountWidgetDisplay({
    ...current,
    ...patch,
    appearanceTemplateId: presetId,
  });
}

function pickAppearanceTemplateId(
  raw: unknown,
): VolumeDiscountAppearanceTemplateId {
  if (raw === "custom") return "custom";
  if (typeof raw === "string" && isVolumeDiscountAppearancePresetId(raw)) {
    return raw;
  }
  return "classic_burgundy";
}

export const DEFAULT_WIDGET_DISPLAY: VolumeDiscountWidgetDisplay = {
  widgetHeading: "",
  widgetPresentation: "tier_cards",
  showCountdown: true,
  widgetHeaderLayout: "split",
  widgetHeadingAlign: "start",
  countdownAlign: "end",
  widgetHeaderSwapOrder: false,
  widgetHeaderMobileStack: true,
  countdownLabel: "Sale end in",
  countdownTimeAmount: 1,
  countdownTimeUnit: "days",
  ctaLabel: "Grab this deal",
  ctaButtonAction: "add_to_cart_open_drawer",
  ctaButtonPageUrl: "",
  hideThemeAddToCart: false,
  hideThemeBuyItNow: false,
  hideThemeVariantSelector: false,
  hideThemeQuantitySelector: false,
  hideWidgetVariantSelector: false,
  hideOutOfStockVariants: false,
  hideWidgetQuantitySelector: false,
  hideWidgetLineTotal: false,
  hideWidgetTierAddButton: false,
  cardPriceShowsUnit: false,
  hideWidgetComparePrice: false,
  hideWidgetMainCta: false,
  volumeTableCellPaddingPx: WIDGET_VOLUME_TABLE_CELL_PADDING_PX_DEFAULT,
  volumeTableQuantityColumnAlign: "start",
  volumeTableDiscountColumnAlign: "center",
  volumeTablePriceColumnAlign: "end",
  volumeTableQuantityColPaddingStartPx: 12,
  volumeTableQuantityColPaddingEndPx: 10,
  volumeTableDiscountColPaddingStartPx: 10,
  volumeTableDiscountColPaddingEndPx: 10,
  volumeTablePriceColPaddingStartPx: 10,
  volumeTablePriceColPaddingEndPx: 12,
  badgePosition: "after_label",
  badgeBackgroundColor: "#6b1d1e",
  badgeTextColor: "#ffffff",
  badgeSizeScalePercent: BADGE_SIZE_SCALE_PERCENT_DEFAULT,
  footnote: "Pick a tier to set quantity, then add to cart.",
  primaryColor: "#6b1d1e",
  primaryHoverColor: "#551618",
  selectedBgColor: "#fff5f5",
  countdownBgColor: "#fce8e8",
  countdownTextColor: "#b42318",
  savingsColor: "#ea580c",
  volumeTableDiscountColor: "#ea580c",
  optionSubtextColor: "#784a4f",
  mutedColor: "#616161",
  cardBorderColor: "#d4d4d4",
  cardBorderRadiusPx: 14,
  buttonBorderRadiusPx: 14,
  controlBorderRadiusPx: 10,
  radioButtonSizePx: WIDGET_RADIO_BUTTON_SIZE_PX_DEFAULT,
  radioButtonBorderColor: "#bdbdbd",
  radioButtonAccentColor: "#6b1d1e",
  fontScale: "default",
  fontSizeScalePercent: FONT_SIZE_SCALE_PERCENT_DEFAULT,
  ...fontDisplaySizesFromRaw({}, "default"),
  fontWeightStrong: 700,
  fontWeightAccent: 600,
  fontWeightBody: 500,
  fontWeightNormal: 400,
  customCss: "",
  appearanceTemplateId: "classic_burgundy",
};

/** Merge DB / API values with defaults and validate colors. */
export function normalizeVolumeDiscountWidgetDisplay(
  raw: unknown,
): VolumeDiscountWidgetDisplay {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const scale = pickFontScale(o.fontScale);
  const fontSizes = fontDisplaySizesFromRaw(o, scale);
  const primaryColor = pickCssColor(
    o.primaryColor,
    DEFAULT_WIDGET_DISPLAY.primaryColor,
  );

  const presentation = pickWidgetPresentation(o.widgetPresentation);
  const resolvedSavingsColor = pickCssColor(
    o.savingsColor,
    DEFAULT_WIDGET_DISPLAY.savingsColor,
  );

  return {
    widgetHeading: pickString(o.widgetHeading, DEFAULT_WIDGET_DISPLAY.widgetHeading)
      .trim(),
    widgetPresentation: presentation,
    showCountdown: pickBool(
      o.showCountdown,
      DEFAULT_WIDGET_DISPLAY.showCountdown,
    ),
    widgetHeaderLayout: pickWidgetHeaderLayout(o.widgetHeaderLayout),
    widgetHeadingAlign: pickWidgetHeaderTextAlign(
      o.widgetHeadingAlign,
      DEFAULT_WIDGET_DISPLAY.widgetHeadingAlign,
    ),
    countdownAlign: pickWidgetHeaderTextAlign(
      o.countdownAlign,
      DEFAULT_WIDGET_DISPLAY.countdownAlign,
    ),
    widgetHeaderSwapOrder: pickBool(
      o.widgetHeaderSwapOrder,
      DEFAULT_WIDGET_DISPLAY.widgetHeaderSwapOrder,
    ),
    widgetHeaderMobileStack: pickBool(
      o.widgetHeaderMobileStack,
      DEFAULT_WIDGET_DISPLAY.widgetHeaderMobileStack,
    ),
    countdownLabel: (() => {
      const base =
        pickString(o.countdownLabel, DEFAULT_WIDGET_DISPLAY.countdownLabel).trim() ||
        DEFAULT_WIDGET_DISPLAY.countdownLabel;
      const cleaned = sanitizeCountdownLabelForDisplay(base);
      return cleaned || DEFAULT_WIDGET_DISPLAY.countdownLabel;
    })(),
    countdownTimeAmount: pickCountdownTimeAmount(o.countdownTimeAmount),
    countdownTimeUnit: pickCountdownTimeUnit(o.countdownTimeUnit),
    ctaLabel: (() => {
      const raw =
        pickString(o.ctaLabel, DEFAULT_WIDGET_DISPLAY.ctaLabel).trim() ||
        DEFAULT_WIDGET_DISPLAY.ctaLabel;
      if (
        presentation === "volume_table" &&
        raw === DEFAULT_WIDGET_DISPLAY.ctaLabel
      ) {
        return "Add to cart";
      }
      return raw;
    })(),
    ctaButtonAction: pickCtaButtonAction(o.ctaButtonAction),
    ctaButtonPageUrl: pickString(
      o.ctaButtonPageUrl,
      DEFAULT_WIDGET_DISPLAY.ctaButtonPageUrl,
    ).trim(),
    hideThemeAddToCart: pickBool(
      o.hideThemeAddToCart,
      DEFAULT_WIDGET_DISPLAY.hideThemeAddToCart,
    ),
    hideThemeBuyItNow: pickBool(
      o.hideThemeBuyItNow,
      DEFAULT_WIDGET_DISPLAY.hideThemeBuyItNow,
    ),
    hideThemeVariantSelector: pickBool(
      o.hideThemeVariantSelector,
      DEFAULT_WIDGET_DISPLAY.hideThemeVariantSelector,
    ),
    hideThemeQuantitySelector: pickBool(
      o.hideThemeQuantitySelector,
      DEFAULT_WIDGET_DISPLAY.hideThemeQuantitySelector,
    ),
    hideWidgetVariantSelector: pickBool(
      o.hideWidgetVariantSelector,
      DEFAULT_WIDGET_DISPLAY.hideWidgetVariantSelector,
    ),
    hideOutOfStockVariants: pickBool(
      o.hideOutOfStockVariants,
      DEFAULT_WIDGET_DISPLAY.hideOutOfStockVariants,
    ),
    hideWidgetQuantitySelector: pickBool(
      o.hideWidgetQuantitySelector,
      DEFAULT_WIDGET_DISPLAY.hideWidgetQuantitySelector,
    ),
    hideWidgetLineTotal: pickBool(
      o.hideWidgetLineTotal,
      DEFAULT_WIDGET_DISPLAY.hideWidgetLineTotal,
    ),
    hideWidgetTierAddButton: pickBool(
      o.hideWidgetTierAddButton,
      DEFAULT_WIDGET_DISPLAY.hideWidgetTierAddButton,
    ),
    cardPriceShowsUnit: pickBool(
      o.cardPriceShowsUnit,
      DEFAULT_WIDGET_DISPLAY.cardPriceShowsUnit,
    ),
    hideWidgetComparePrice: pickBool(
      o.hideWidgetComparePrice,
      DEFAULT_WIDGET_DISPLAY.hideWidgetComparePrice,
    ),
    hideWidgetMainCta: pickBool(
      o.hideWidgetMainCta,
      DEFAULT_WIDGET_DISPLAY.hideWidgetMainCta,
    ),
    volumeTableCellPaddingPx: pickVolumeTableCellPaddingPx(
      o.volumeTableCellPaddingPx,
      DEFAULT_WIDGET_DISPLAY.volumeTableCellPaddingPx,
    ),
    volumeTableQuantityColumnAlign: pickWidgetHeaderTextAlign(
      o.volumeTableQuantityColumnAlign,
      DEFAULT_WIDGET_DISPLAY.volumeTableQuantityColumnAlign,
    ),
    volumeTableDiscountColumnAlign: pickWidgetHeaderTextAlign(
      o.volumeTableDiscountColumnAlign,
      DEFAULT_WIDGET_DISPLAY.volumeTableDiscountColumnAlign,
    ),
    volumeTablePriceColumnAlign: pickWidgetHeaderTextAlign(
      o.volumeTablePriceColumnAlign,
      DEFAULT_WIDGET_DISPLAY.volumeTablePriceColumnAlign,
    ),
    volumeTableQuantityColPaddingStartPx: pickVolumeTableColInlinePaddingPx(
      o.volumeTableQuantityColPaddingStartPx,
      DEFAULT_WIDGET_DISPLAY.volumeTableQuantityColPaddingStartPx,
    ),
    volumeTableQuantityColPaddingEndPx: pickVolumeTableColInlinePaddingPx(
      o.volumeTableQuantityColPaddingEndPx,
      DEFAULT_WIDGET_DISPLAY.volumeTableQuantityColPaddingEndPx,
    ),
    volumeTableDiscountColPaddingStartPx: pickVolumeTableColInlinePaddingPx(
      o.volumeTableDiscountColPaddingStartPx,
      DEFAULT_WIDGET_DISPLAY.volumeTableDiscountColPaddingStartPx,
    ),
    volumeTableDiscountColPaddingEndPx: pickVolumeTableColInlinePaddingPx(
      o.volumeTableDiscountColPaddingEndPx,
      DEFAULT_WIDGET_DISPLAY.volumeTableDiscountColPaddingEndPx,
    ),
    volumeTablePriceColPaddingStartPx: pickVolumeTableColInlinePaddingPx(
      o.volumeTablePriceColPaddingStartPx,
      DEFAULT_WIDGET_DISPLAY.volumeTablePriceColPaddingStartPx,
    ),
    volumeTablePriceColPaddingEndPx: pickVolumeTableColInlinePaddingPx(
      o.volumeTablePriceColPaddingEndPx,
      DEFAULT_WIDGET_DISPLAY.volumeTablePriceColPaddingEndPx,
    ),
    badgePosition: pickBadgePosition(o.badgePosition),
    badgeBackgroundColor: pickCssColor(
      o.badgeBackgroundColor,
      primaryColor,
    ),
    badgeTextColor: pickCssColor(
      o.badgeTextColor,
      DEFAULT_WIDGET_DISPLAY.badgeTextColor,
    ),
    badgeSizeScalePercent: pickBadgeSizeScalePercent(
      o.badgeSizeScalePercent,
    ),
    footnote: (() => {
      const raw =
        pickString(o.footnote, DEFAULT_WIDGET_DISPLAY.footnote).trim() ||
        DEFAULT_WIDGET_DISPLAY.footnote;
      if (presentation !== "volume_table") return raw;
      if (
        raw === DEFAULT_WIDGET_DISPLAY.footnote ||
        raw === "Select a quantity tier, then add to cart." ||
        raw === "Choose a quantity in the table, then add to cart."
      ) {
        return "Set quantity, then add to cart.";
      }
      return raw;
    })(),
    primaryColor,
    primaryHoverColor: pickCssColor(
      o.primaryHoverColor,
      DEFAULT_WIDGET_DISPLAY.primaryHoverColor,
    ),
    selectedBgColor: pickCssColor(
      o.selectedBgColor,
      DEFAULT_WIDGET_DISPLAY.selectedBgColor,
    ),
    countdownBgColor: pickCssColor(
      o.countdownBgColor,
      DEFAULT_WIDGET_DISPLAY.countdownBgColor,
    ),
    countdownTextColor: pickCssColor(
      o.countdownTextColor,
      DEFAULT_WIDGET_DISPLAY.countdownTextColor,
    ),
    savingsColor: resolvedSavingsColor,
    volumeTableDiscountColor: pickCssColor(
      o.volumeTableDiscountColor,
      resolvedSavingsColor,
    ),
    optionSubtextColor: pickCssColor(
      o.optionSubtextColor,
      resolvedSavingsColor,
    ),
    mutedColor: pickCssColor(o.mutedColor, DEFAULT_WIDGET_DISPLAY.mutedColor),
    cardBorderColor: pickCssColor(
      o.cardBorderColor,
      DEFAULT_WIDGET_DISPLAY.cardBorderColor,
    ),
    cardBorderRadiusPx: pickBorderRadiusPx(
      o.cardBorderRadiusPx,
      DEFAULT_WIDGET_DISPLAY.cardBorderRadiusPx,
    ),
    buttonBorderRadiusPx: pickBorderRadiusPx(
      o.buttonBorderRadiusPx,
      DEFAULT_WIDGET_DISPLAY.buttonBorderRadiusPx,
    ),
    controlBorderRadiusPx: pickBorderRadiusPx(
      o.controlBorderRadiusPx,
      DEFAULT_WIDGET_DISPLAY.controlBorderRadiusPx,
    ),
    radioButtonSizePx: pickRadioButtonSizePx(
      o.radioButtonSizePx,
      DEFAULT_WIDGET_DISPLAY.radioButtonSizePx,
    ),
    radioButtonBorderColor: pickCssColor(
      o.radioButtonBorderColor,
      DEFAULT_WIDGET_DISPLAY.radioButtonBorderColor,
    ),
    radioButtonAccentColor: pickCssColor(
      o.radioButtonAccentColor,
      primaryColor,
    ),
    fontScale: scale,
    fontSizeScalePercent: parseFontSizeScalePercent(o.fontSizeScalePercent),
    ...fontSizes,
    fontWeightStrong: parseWidgetFontWeight(
      o.fontWeightStrong,
      DEFAULT_WIDGET_DISPLAY.fontWeightStrong,
    ),
    fontWeightAccent: parseWidgetFontWeight(
      o.fontWeightAccent,
      DEFAULT_WIDGET_DISPLAY.fontWeightAccent,
    ),
    fontWeightBody: parseWidgetFontWeight(
      o.fontWeightBody,
      DEFAULT_WIDGET_DISPLAY.fontWeightBody,
    ),
    fontWeightNormal: parseWidgetFontWeight(
      o.fontWeightNormal,
      DEFAULT_WIDGET_DISPLAY.fontWeightNormal,
    ),
    customCss: pickCustomCss(o.customCss),
    appearanceTemplateId: pickAppearanceTemplateId(o.appearanceTemplateId),
  };
}

/** Apply a built-in preset; keeps copy, fonts, CTA action, and visibility toggles. */
export function applyVolumeDiscountAppearancePreset(
  current: VolumeDiscountWidgetDisplay,
  presetId: VolumeDiscountAppearancePresetId,
): VolumeDiscountWidgetDisplay {
  const row = VOLUME_DISCOUNT_APPEARANCE_PRESETS.find((p) => p.id === presetId);
  if (!row) return current;
  const patch = mergeAppearancePresetPatch(row.patch);
  return normalizeVolumeDiscountWidgetDisplay({
    ...current,
    ...patch,
    appearanceTemplateId: presetId,
  });
}
