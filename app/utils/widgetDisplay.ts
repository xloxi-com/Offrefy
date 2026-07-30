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

/** Visual shape/style of the tier badge pill (colors still come from Appearance). */
export type VolumeDiscountBadgeDesign =
  | "pill"
  | "rounded"
  | "square"
  | "soft"
  | "outline"
  | "outline_bold"
  | "ghost"
  | "ribbon"
  | "flag"
  | "tag"
  | "capsule"
  | "chip"
  | "underline"
  | "shadow"
  | "gradient"
  | "glow"
  | "stamp"
  | "ticket"
  | "arrow"
  | "banner";

const BADGE_DESIGN_VALUES: VolumeDiscountBadgeDesign[] = [
  "pill",
  "rounded",
  "square",
  "soft",
  "outline",
  "outline_bold",
  "ghost",
  "ribbon",
  "flag",
  "tag",
  "capsule",
  "chip",
  "underline",
  "shadow",
  "gradient",
  "glow",
  "stamp",
  "ticket",
  "arrow",
  "banner",
];

export const BADGE_DESIGN_OPTIONS: {
  label: string;
  value: VolumeDiscountBadgeDesign;
}[] = [
  { label: "Pill", value: "pill" },
  { label: "Rounded", value: "rounded" },
  { label: "Square", value: "square" },
  { label: "Soft", value: "soft" },
  { label: "Outline", value: "outline" },
  { label: "Bold outline", value: "outline_bold" },
  { label: "Ghost", value: "ghost" },
  { label: "Ribbon", value: "ribbon" },
  { label: "Flag", value: "flag" },
  { label: "Tag", value: "tag" },
  { label: "Capsule", value: "capsule" },
  { label: "Chip", value: "chip" },
  { label: "Underline", value: "underline" },
  { label: "Shadow", value: "shadow" },
  { label: "Gradient", value: "gradient" },
  { label: "Glow", value: "glow" },
  { label: "Stamp", value: "stamp" },
  { label: "Ticket", value: "ticket" },
  { label: "Arrow", value: "arrow" },
  { label: "Banner", value: "banner" },
];

function pickBadgeDesign(raw: unknown): VolumeDiscountBadgeDesign {
  if (
    typeof raw === "string" &&
    (BADGE_DESIGN_VALUES as string[]).includes(raw)
  ) {
    return raw as VolumeDiscountBadgeDesign;
  }
  return "pill";
}

export function isVolumeDiscountBadgeDesign(
  value: string,
): value is VolumeDiscountBadgeDesign {
  return (BADGE_DESIGN_VALUES as string[]).includes(value);
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

/**
 * Patch for heading / timer alignment selects.
 * Heading Right also pins the timer to the trailing edge (storefront).
 */
export function widgetHeaderAlignPatch(
  field: "widgetHeadingAlign" | "countdownAlign",
  value: VolumeDiscountWidgetHeaderTextAlign,
): Partial<
  Pick<VolumeDiscountWidgetDisplay, "widgetHeadingAlign" | "countdownAlign">
> {
  if (field === "widgetHeadingAlign") {
    return {
      widgetHeadingAlign: value,
      ...(value === "end" ? { countdownAlign: "end" as const } : {}),
    };
  }
  return { countdownAlign: value };
}

/** Patch for header layout (split / stacked). */
export function widgetHeaderLayoutPatch(
  value: VolumeDiscountWidgetHeaderLayout,
): Pick<VolumeDiscountWidgetDisplay, "widgetHeaderLayout"> {
  return { widgetHeaderLayout: value };
}

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
  return "add_to_cart";
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

/** Ten classic + seasonal storefront look presets (admin picker); `custom` = merchant-tweaked. */
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
  "christmas_candy_cane",
  "christmas_holly_bow",
  "christmas_snowflake",
  "christmas_gift_wrap",
  "christmas_santa_sleigh",
  "christmas_velvet",
  "christmas_pearl",
  "christmas_nordic",
  "christmas_cocoa",
  "christmas_aurora",
  "newyear_midnight",
  "newyear_champagne",
  "newyear_fireworks",
  "newyear_ball_drop",
  "newyear_confetti",
  "newyear_sparkle",
  "newyear_aurora",
  "newyear_rose",
  "newyear_emerald",
  "newyear_velvet",
  "newyear_skyburst",
  "newyear_golden_burst",
  "newyear_sparkler",
  "halloween_pumpkin",
  "halloween_midnight",
  "halloween_witch",
  "halloween_candy",
  "halloween_slime",
  "halloween_blood",
  "halloween_ghost",
  "halloween_bat",
  "halloween_cobweb",
  "halloween_graveyard",
  "ramadan_sand",
  "ramadan_emerald",
  "ramadan_gold",
  "ramadan_midnight",
  "ramadan_lantern",
  "ramadan_crescent",
  "ramadan_kaaba",
  "ramadan_oasis",
  "ramadan_iftar",
  "ramadan_starry",
  "diwali_diya",
  "diwali_fireworks",
  "diwali_lotus",
  "diwali_rangoli",
  "diwali_temple",
  "diwali_mithai",
  "diwali_sparkle",
  "diwali_royal",
  "diwali_marigold",
  "diwali_peacock",
  "pongal_pot",
  "pongal_sun",
  "pongal_sugarcane",
  "pongal_cow",
  "pongal_rice",
  "pongal_coconut",
  "pongal_kolam",
  "pongal_banana",
  "pongal_harvest",
  "pongal_steam",
  "valentine_rose",
  "valentine_blush",
  "valentine_cupid",
  "valentine_velvet",
  "valentine_candy",
  "valentine_admirer",
  "valentine_ruby",
  "valentine_pearl",
  "valentine_letter",
  "valentine_midnight",
  "easter_egg",
  "easter_rabbit",
  "easter_chick",
  "easter_tulip",
  "easter_carrot",
  "easter_blossom",
  "easter_basket",
  "easter_lavender",
  "easter_mint",
  "easter_sunrise",
] as const;

export type VolumeDiscountAppearancePresetId =
  (typeof VOLUME_DISCOUNT_APPEARANCE_PRESET_IDS)[number];

export type VolumeDiscountAppearanceTemplateId =
  | VolumeDiscountAppearancePresetId
  | "custom";

/** Admin Appearance templates tab groups. */
export type AppearanceTemplateCategory =
  | "classic"
  | "christmas"
  | "newyear"
  | "halloween"
  | "ramadan"
  | "diwali"
  | "pongal"
  | "valentine"
  | "easter";

export const APPEARANCE_TEMPLATE_CATEGORY_OPTIONS: {
  label: string;
  value: AppearanceTemplateCategory;
}[] = [
  { label: "Classic", value: "classic" },
  { label: "Christmas", value: "christmas" },
  { label: "New Year", value: "newyear" },
  { label: "Halloween", value: "halloween" },
  { label: "Ramadan", value: "ramadan" },
  { label: "Diwali", value: "diwali" },
  { label: "Pongal", value: "pongal" },
  { label: "Valentine's Day", value: "valentine" },
  { label: "Easter", value: "easter" },
];

export function isAppearanceTemplateCategory(
  value: string,
): value is AppearanceTemplateCategory {
  return APPEARANCE_TEMPLATE_CATEGORY_OPTIONS.some((o) => o.value === value);
}

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
  /** Optional widget title; empty after trim hides the heading (no theme fallback). */
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
  /**
   * Hide the theme product page price block (Dawn `.price`, etc.). Tier cards still show offer prices.
   */
  hideThemePrice: boolean;
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
  /** Visual shape of the tier badge (pill, outline, ribbon, …). */
  badgeDesign: VolumeDiscountBadgeDesign;
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
   * (`.xloxi-qb`). Merchant-owned; scope selectors under that class.
   */
  customCss: string;
  /**
   * Admin: last chosen appearance preset, or `custom` after a manual tweak to
   * colors/layout/CSS in the list `WIDGET_APPEARANCE_CUSTOM_TRIGGER_KEYS`.
   * Storefront uses this (or `appearanceDecorThemeId` when custom) for seasonal CSS.
   */
  appearanceTemplateId: VolumeDiscountAppearanceTemplateId;
  /**
   * Preset id kept for seasonal decorations after a color/layout tweak flips the
   * picker to `custom`. Empty when the merchant picks Custom explicitly.
   */
  appearanceDecorThemeId: VolumeDiscountAppearancePresetId | "";
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
  "badgeDesign",
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
  if (typeof raw === "boolean") return raw;
  if (raw === 1 || raw === "1" || raw === "true" || raw === "TRUE") return true;
  if (raw === 0 || raw === "0" || raw === "false" || raw === "FALSE") return false;
  return fallback;
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
  /** Admin tab: Classic / Christmas / Halloween / Ramadan. */
  category: AppearanceTemplateCategory;
  /** Swatch for admin template grid (usually matches primary). */
  swatch: string;
  /** Optional photo/icon for template picker (e.g. `/halloween/pumpkin.png`). */
  swatchImage?: string;
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
      category: "classic",
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
        badgeDesign: "pill",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "sunset_orange",
      label: "Sunset orange",
      swatch: "#ea580c",
      category: "classic",
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
        badgeDesign: "ribbon",
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
      category: "classic",
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
        badgeDesign: "capsule",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "forest_green",
      label: "Forest green",
      swatch: "#15803d",
      category: "classic",
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
        badgeDesign: "soft",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "royal_purple",
      label: "Royal purple",
      swatch: "#7c3aed",
      category: "classic",
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
        badgeDesign: "gradient",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "midnight_slate",
      label: "Midnight slate",
      swatch: "#0f172a",
      category: "classic",
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
        badgeDesign: "square",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "rose_coral",
      label: "Rose coral",
      swatch: "#e11d48",
      category: "classic",
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
        badgeDesign: "glow",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "mono_slate",
      label: "Mono slate",
      swatch: "#475569",
      category: "classic",
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
        badgeDesign: "outline_bold",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "teal_mint",
      label: "Teal mint",
      swatch: "#0d9488",
      category: "classic",
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
        badgeDesign: "tag",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "amber_gold",
      label: "Amber gold",
      swatch: "#d97706",
      category: "classic",
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
        badgeDesign: "banner",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_candy_cane",
      label: "Candy cane",
      category: "christmas",
      swatch: "#c41e3a",
      swatchImage: "/christmas/candy.png",
      patch: {
        primaryColor: "#c41e3a",
        primaryHoverColor: "#9f1239",
        selectedBgColor: "#fff7f7",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9f1239",
        savingsColor: "#b91c1c",
        optionSubtextColor: "#166534",
        mutedColor: "#57534e",
        cardBorderColor: "#fecdd3",
        badgeBackgroundColor: "#c41e3a",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#fda4af",
        radioButtonAccentColor: "#c41e3a",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "ribbon",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_holly_bow",
      label: "Holly bow",
      category: "christmas",
      swatch: "#166534",
      swatchImage: "/christmas/ribbon.png",
      patch: {
        primaryColor: "#166534",
        primaryHoverColor: "#14532d",
        selectedBgColor: "#f0fdf4",
        countdownBgColor: "#dcfce7",
        countdownTextColor: "#14532d",
        savingsColor: "#b91c1c",
        optionSubtextColor: "#166534",
        mutedColor: "#525252",
        cardBorderColor: "#86efac",
        badgeBackgroundColor: "#b91c1c",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#4ade80",
        radioButtonAccentColor: "#166534",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_left",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_snowflake",
      label: "Snowflake",
      category: "christmas",
      swatch: "#0e7490",
      swatchImage: "/christmas/snowflake.png",
      patch: {
        primaryColor: "#0e7490",
        primaryHoverColor: "#155e75",
        selectedBgColor: "#ecfeff",
        countdownBgColor: "#cffafe",
        countdownTextColor: "#155e75",
        savingsColor: "#b91c1c",
        optionSubtextColor: "#0f766e",
        mutedColor: "#64748b",
        cardBorderColor: "#a5f3fc",
        badgeBackgroundColor: "#b91c1c",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#67e8f9",
        radioButtonAccentColor: "#0e7490",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_gift_wrap",
      label: "Gift wrap",
      category: "christmas",
      swatch: "#b45309",
      swatchImage: "/christmas/gift.png",
      patch: {
        primaryColor: "#b45309",
        primaryHoverColor: "#92400e",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#92400e",
        savingsColor: "#b91c1c",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#fde68a",
        badgeBackgroundColor: "#166534",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#fcd34d",
        radioButtonAccentColor: "#b45309",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "top_right",
        badgeDesign: "tag",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_santa_sleigh",
      label: "Santa sleigh",
      category: "christmas",
      swatch: "#9f1239",
      swatchImage: "/christmas/santa.png",
      patch: {
        primaryColor: "#9f1239",
        primaryHoverColor: "#881337",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9f1239",
        savingsColor: "#ca8a04",
        optionSubtextColor: "#166534",
        mutedColor: "#57534e",
        cardBorderColor: "#fecdd3",
        badgeBackgroundColor: "#ca8a04",
        badgeTextColor: "#1c1917",
        radioButtonBorderColor: "#fda4af",
        radioButtonAccentColor: "#9f1239",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "banner",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_velvet",
      label: "Velvet",
      category: "christmas",
      swatch: "#4c0519",
      swatchImage: "/christmas/crown.png",
      patch: {
        primaryColor: "#4c0519",
        primaryHoverColor: "#3f0414",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#881337",
        savingsColor: "#a16207",
        optionSubtextColor: "#9f1239",
        mutedColor: "#57534e",
        cardBorderColor: "#e7e5e4",
        badgeBackgroundColor: "#4c0519",
        badgeTextColor: "#fef3c7",
        radioButtonBorderColor: "#d6d3d1",
        radioButtonAccentColor: "#9f1239",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 10,
        controlBorderRadiusPx: 8,
        badgePosition: "top_right",
        badgeDesign: "soft",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_pearl",
      label: "Pearl",
      category: "christmas",
      swatch: "#a8a29e",
      swatchImage: "/christmas/gem.png",
      patch: {
        primaryColor: "#44403c",
        primaryHoverColor: "#292524",
        selectedBgColor: "#fafaf9",
        countdownBgColor: "#f5f5f4",
        countdownTextColor: "#57534e",
        savingsColor: "#b45309",
        optionSubtextColor: "#78716c",
        mutedColor: "#78716c",
        cardBorderColor: "#e7e5e4",
        badgeBackgroundColor: "#44403c",
        badgeTextColor: "#fafaf9",
        radioButtonBorderColor: "#d6d3d1",
        radioButtonAccentColor: "#44403c",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 999,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_nordic",
      label: "Nordic",
      category: "christmas",
      swatch: "#3f6212",
      swatchImage: "/christmas/evergreen.png",
      patch: {
        primaryColor: "#3f6212",
        primaryHoverColor: "#365314",
        selectedBgColor: "#f7fee7",
        countdownBgColor: "#ecfccb",
        countdownTextColor: "#3f6212",
        savingsColor: "#b45309",
        optionSubtextColor: "#4d7c0f",
        mutedColor: "#57534e",
        cardBorderColor: "#d9f99d",
        badgeBackgroundColor: "#1c1917",
        badgeTextColor: "#ecfccb",
        radioButtonBorderColor: "#a3e635",
        radioButtonAccentColor: "#3f6212",
        cardBorderRadiusPx: 10,
        buttonBorderRadiusPx: 8,
        controlBorderRadiusPx: 6,
        badgePosition: "top_left",
        badgeDesign: "tag",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_cocoa",
      label: "Cocoa",
      category: "christmas",
      swatch: "#78350f",
      swatchImage: "/christmas/cocoa.png",
      patch: {
        primaryColor: "#78350f",
        primaryHoverColor: "#451a03",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#92400e",
        savingsColor: "#b45309",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#fde68a",
        badgeBackgroundColor: "#78350f",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fcd34d",
        radioButtonAccentColor: "#78350f",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "pill",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "christmas_aurora",
      label: "Aurora",
      category: "christmas",
      swatch: "#312e81",
      swatchImage: "/christmas/aurora.png",
      patch: {
        primaryColor: "#312e81",
        primaryHoverColor: "#1e1b4b",
        selectedBgColor: "#eef2ff",
        countdownBgColor: "#e0e7ff",
        countdownTextColor: "#3730a3",
        savingsColor: "#0d9488",
        optionSubtextColor: "#4f46e5",
        mutedColor: "#64748b",
        cardBorderColor: "#c7d2fe",
        badgeBackgroundColor: "#0f766e",
        badgeTextColor: "#ecfdf5",
        radioButtonBorderColor: "#a5b4fc",
        radioButtonAccentColor: "#4f46e5",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_midnight",
      label: "Midnight countdown",
      category: "newyear",
      swatch: "#0f172a",
      swatchImage: "/newyear/clock.svg",
      patch: {
        primaryColor: "#0f172a",
        primaryHoverColor: "#020617",
        selectedBgColor: "#f1f5f9",
        countdownBgColor: "#0f172a",
        countdownTextColor: "#fbbf24",
        savingsColor: "#d97706",
        optionSubtextColor: "#475569",
        mutedColor: "#64748b",
        cardBorderColor: "#cbd5e1",
        badgeBackgroundColor: "#0f172a",
        badgeTextColor: "#fbbf24",
        radioButtonBorderColor: "#fbbf24",
        radioButtonAccentColor: "#0f172a",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "banner",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_champagne",
      label: "Champagne toast",
      category: "newyear",
      swatch: "#b45309",
      swatchImage: "/newyear/champagne.svg",
      patch: {
        primaryColor: "#b45309",
        primaryHoverColor: "#92400e",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#92400e",
        savingsColor: "#c2410c",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#fde68a",
        badgeBackgroundColor: "#b45309",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fbbf24",
        radioButtonAccentColor: "#b45309",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_fireworks",
      label: "Fireworks night",
      category: "newyear",
      swatch: "#be123c",
      swatchImage: "/newyear/fireworks-crimson.png",
      patch: {
        primaryColor: "#be123c",
        primaryHoverColor: "#9f1239",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9f1239",
        savingsColor: "#d97706",
        optionSubtextColor: "#e11d48",
        mutedColor: "#64748b",
        cardBorderColor: "#fecdd3",
        badgeBackgroundColor: "#be123c",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fb7185",
        radioButtonAccentColor: "#be123c",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "flag",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_ball_drop",
      label: "Ball drop",
      category: "newyear",
      swatch: "#1e3a8a",
      swatchImage: "/newyear/sparkles.png",
      patch: {
        primaryColor: "#1e3a8a",
        primaryHoverColor: "#1e40af",
        selectedBgColor: "#eff6ff",
        countdownBgColor: "#dbeafe",
        countdownTextColor: "#1e3a8a",
        savingsColor: "#b45309",
        optionSubtextColor: "#2563eb",
        mutedColor: "#64748b",
        cardBorderColor: "#bfdbfe",
        badgeBackgroundColor: "#1e3a8a",
        badgeTextColor: "#e2e8f0",
        radioButtonBorderColor: "#93c5fd",
        radioButtonAccentColor: "#1e3a8a",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_center",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_confetti",
      label: "Confetti party",
      category: "newyear",
      swatch: "#c026d3",
      swatchImage: "/newyear/popper.svg",
      patch: {
        primaryColor: "#c026d3",
        primaryHoverColor: "#a21caf",
        selectedBgColor: "#fdf4ff",
        countdownBgColor: "#fae8ff",
        countdownTextColor: "#a21caf",
        savingsColor: "#d97706",
        optionSubtextColor: "#c026d3",
        mutedColor: "#78716c",
        cardBorderColor: "#f0abfc",
        badgeBackgroundColor: "#c026d3",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#e879f9",
        radioButtonAccentColor: "#c026d3",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "pill",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_sparkle",
      label: "Golden sparkle",
      category: "newyear",
      swatch: "#ca8a04",
      swatchImage: "/newyear/sparkles.png",
      patch: {
        primaryColor: "#ca8a04",
        primaryHoverColor: "#a16207",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef9c3",
        countdownTextColor: "#854d0e",
        savingsColor: "#c2410c",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#fde047",
        badgeBackgroundColor: "#a16207",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#facc15",
        radioButtonAccentColor: "#ca8a04",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_left",
        badgeDesign: "ribbon",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_aurora",
      label: "New Year aurora",
      category: "newyear",
      swatch: "#0f766e",
      swatchImage: "/newyear/comet.png",
      patch: {
        primaryColor: "#0f766e",
        primaryHoverColor: "#115e59",
        selectedBgColor: "#f0fdfa",
        countdownBgColor: "#ccfbf1",
        countdownTextColor: "#115e59",
        savingsColor: "#7c3aed",
        optionSubtextColor: "#0d9488",
        mutedColor: "#64748b",
        cardBorderColor: "#99f6e4",
        badgeBackgroundColor: "#5b21b6",
        badgeTextColor: "#f5f3ff",
        radioButtonBorderColor: "#2dd4bf",
        radioButtonAccentColor: "#0f766e",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "gradient",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_rose",
      label: "Rose gold NYE",
      category: "newyear",
      swatch: "#be185d",
      swatchImage: "/newyear/crown.png",
      patch: {
        primaryColor: "#be185d",
        primaryHoverColor: "#9d174d",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9d174d",
        savingsColor: "#b45309",
        optionSubtextColor: "#db2777",
        mutedColor: "#78716c",
        cardBorderColor: "#fda4af",
        badgeBackgroundColor: "#be185d",
        badgeTextColor: "#fff1f2",
        radioButtonBorderColor: "#fb7185",
        radioButtonAccentColor: "#be185d",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_emerald",
      label: "Lucky year",
      category: "newyear",
      swatch: "#047857",
      swatchImage: "/newyear/gem.png",
      patch: {
        primaryColor: "#047857",
        primaryHoverColor: "#065f46",
        selectedBgColor: "#ecfdf5",
        countdownBgColor: "#d1fae5",
        countdownTextColor: "#065f46",
        savingsColor: "#d97706",
        optionSubtextColor: "#059669",
        mutedColor: "#57534e",
        cardBorderColor: "#6ee7b7",
        badgeBackgroundColor: "#047857",
        badgeTextColor: "#ecfdf5",
        radioButtonBorderColor: "#34d399",
        radioButtonAccentColor: "#047857",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_velvet",
      label: "Black tie",
      category: "newyear",
      swatch: "#18181b",
      swatchImage: "/newyear/star.png",
      patch: {
        primaryColor: "#18181b",
        primaryHoverColor: "#09090b",
        selectedBgColor: "#f4f4f5",
        countdownBgColor: "#18181b",
        countdownTextColor: "#fbbf24",
        savingsColor: "#d97706",
        optionSubtextColor: "#52525b",
        mutedColor: "#71717a",
        cardBorderColor: "#d4d4d8",
        badgeBackgroundColor: "#18181b",
        badgeTextColor: "#fbbf24",
        radioButtonBorderColor: "#a1a1aa",
        radioButtonAccentColor: "#18181b",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "top_center",
        badgeDesign: "banner",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_skyburst",
      label: "Violet skyburst",
      category: "newyear",
      swatch: "#6d28d9",
      swatchImage: "/newyear/fireworks-violet.png",
      patch: {
        primaryColor: "#6d28d9",
        primaryHoverColor: "#5b21b6",
        selectedBgColor: "#f5f3ff",
        countdownBgColor: "#ede9fe",
        countdownTextColor: "#5b21b6",
        savingsColor: "#d97706",
        optionSubtextColor: "#7c3aed",
        mutedColor: "#64748b",
        cardBorderColor: "#ddd6fe",
        badgeBackgroundColor: "#6d28d9",
        badgeTextColor: "#f5f3ff",
        radioButtonBorderColor: "#a78bfa",
        radioButtonAccentColor: "#6d28d9",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "flag",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_golden_burst",
      label: "Golden fireworks",
      category: "newyear",
      swatch: "#ca8a04",
      swatchImage: "/newyear/fireworks-gold.png",
      patch: {
        primaryColor: "#ca8a04",
        primaryHoverColor: "#a16207",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#854d0e",
        savingsColor: "#c2410c",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#fde047",
        badgeBackgroundColor: "#0f172a",
        badgeTextColor: "#fbbf24",
        radioButtonBorderColor: "#facc15",
        radioButtonAccentColor: "#ca8a04",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_center",
        badgeDesign: "ribbon",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "newyear_sparkler",
      label: "Sparkler night",
      category: "newyear",
      swatch: "#ea580c",
      swatchImage: "/newyear/fireworks-cluster.png",
      patch: {
        primaryColor: "#ea580c",
        primaryHoverColor: "#c2410c",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#be185d",
        optionSubtextColor: "#ea580c",
        mutedColor: "#78716c",
        cardBorderColor: "#fed7aa",
        badgeBackgroundColor: "#ea580c",
        badgeTextColor: "#fff7ed",
        radioButtonBorderColor: "#fb923c",
        radioButtonAccentColor: "#ea580c",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_pumpkin",
      label: "Pumpkin",
      category: "halloween",
      swatch: "#ea580c",
      swatchImage: "/halloween/pumpkin.png",
      patch: {
        primaryColor: "#ea580c",
        primaryHoverColor: "#c2410c",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#7c2d12",
        optionSubtextColor: "#9a3412",
        mutedColor: "#57534e",
        cardBorderColor: "#fdba74",
        badgeBackgroundColor: "#1c1917",
        badgeTextColor: "#fb923c",
        radioButtonBorderColor: "#fdba74",
        radioButtonAccentColor: "#ea580c",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_midnight",
      label: "Midnight haunt",
      category: "halloween",
      swatch: "#1e1b4b",
      swatchImage: "/halloween/bat.png",
      patch: {
        primaryColor: "#1e1b4b",
        primaryHoverColor: "#312e81",
        selectedBgColor: "#eef2ff",
        countdownBgColor: "#e0e7ff",
        countdownTextColor: "#3730a3",
        savingsColor: "#ea580c",
        optionSubtextColor: "#4338ca",
        mutedColor: "#64748b",
        cardBorderColor: "#c7d2fe",
        badgeBackgroundColor: "#ea580c",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#a5b4fc",
        radioButtonAccentColor: "#1e1b4b",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_witch",
      label: "Witch purple",
      category: "halloween",
      swatch: "#6b21a8",
      swatchImage: "/halloween/witch.png",
      patch: {
        primaryColor: "#6b21a8",
        primaryHoverColor: "#581c87",
        selectedBgColor: "#faf5ff",
        countdownBgColor: "#f3e8ff",
        countdownTextColor: "#6b21a8",
        savingsColor: "#ea580c",
        optionSubtextColor: "#7e22ce",
        mutedColor: "#737373",
        cardBorderColor: "#e9d5ff",
        badgeBackgroundColor: "#ea580c",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#d8b4fe",
        radioButtonAccentColor: "#6b21a8",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        badgeDesign: "flag",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_candy",
      label: "Candy corn",
      category: "halloween",
      swatch: "#f59e0b",
      swatchImage: "/halloween/candy.png",
      patch: {
        primaryColor: "#f59e0b",
        primaryHoverColor: "#d97706",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#92400e",
        savingsColor: "#ea580c",
        optionSubtextColor: "#b45309",
        mutedColor: "#78716c",
        cardBorderColor: "#fcd34d",
        badgeBackgroundColor: "#ffffff",
        badgeTextColor: "#ea580c",
        radioButtonBorderColor: "#fbbf24",
        radioButtonAccentColor: "#f59e0b",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 18,
        controlBorderRadiusPx: 12,
        badgePosition: "after_subtext",
        badgeDesign: "capsule",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_slime",
      label: "Slime green",
      category: "halloween",
      swatch: "#65a30d",
      swatchImage: "/halloween/crystal.png",
      patch: {
        primaryColor: "#65a30d",
        primaryHoverColor: "#4d7c0f",
        selectedBgColor: "#f7fee7",
        countdownBgColor: "#ecfccb",
        countdownTextColor: "#3f6212",
        savingsColor: "#ea580c",
        optionSubtextColor: "#4d7c0f",
        mutedColor: "#57534e",
        cardBorderColor: "#bef264",
        badgeBackgroundColor: "#1c1917",
        badgeTextColor: "#a3e635",
        radioButtonBorderColor: "#a3e635",
        radioButtonAccentColor: "#65a30d",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "price_column",
        badgeDesign: "ticket",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_blood",
      label: "Blood moon",
      category: "halloween",
      swatch: "#7f1d1d",
      swatchImage: "/halloween/moon.png",
      patch: {
        primaryColor: "#7f1d1d",
        primaryHoverColor: "#450a0a",
        selectedBgColor: "#fef2f2",
        countdownBgColor: "#1c1917",
        countdownTextColor: "#fca5a5",
        savingsColor: "#ea580c",
        optionSubtextColor: "#991b1b",
        mutedColor: "#57534e",
        cardBorderColor: "#f87171",
        badgeBackgroundColor: "#ea580c",
        badgeTextColor: "#1c1917",
        radioButtonBorderColor: "#fca5a5",
        radioButtonAccentColor: "#7f1d1d",
        cardBorderRadiusPx: 6,
        buttonBorderRadiusPx: 6,
        controlBorderRadiusPx: 4,
        badgePosition: "top_left",
        badgeDesign: "arrow",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_ghost",
      label: "Ghost mist",
      category: "halloween",
      swatch: "#94a3b8",
      swatchImage: "/halloween/ghost.png",
      patch: {
        primaryColor: "#475569",
        primaryHoverColor: "#334155",
        selectedBgColor: "#f8fafc",
        countdownBgColor: "#e2e8f0",
        countdownTextColor: "#334155",
        savingsColor: "#ea580c",
        optionSubtextColor: "#64748b",
        mutedColor: "#64748b",
        cardBorderColor: "#cbd5e1",
        badgeBackgroundColor: "#0f172a",
        badgeTextColor: "#e2e8f0",
        radioButtonBorderColor: "#94a3b8",
        radioButtonAccentColor: "#475569",
        cardBorderRadiusPx: 20,
        buttonBorderRadiusPx: 999,
        controlBorderRadiusPx: 14,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_bat",
      label: "Bat night",
      category: "halloween",
      swatch: "#0f172a",
      swatchImage: "/halloween/bat.png",
      patch: {
        primaryColor: "#0f172a",
        primaryHoverColor: "#020617",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#1c1917",
        countdownTextColor: "#fb923c",
        savingsColor: "#f97316",
        optionSubtextColor: "#9a3412",
        mutedColor: "#57534e",
        cardBorderColor: "#fed7aa",
        badgeBackgroundColor: "#f97316",
        badgeTextColor: "#0f172a",
        radioButtonBorderColor: "#fdba74",
        radioButtonAccentColor: "#0f172a",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 10,
        controlBorderRadiusPx: 8,
        badgePosition: "top_right",
        badgeDesign: "ribbon",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_cobweb",
      label: "Cobweb",
      category: "halloween",
      swatch: "#44403c",
      swatchImage: "/halloween/web.png",
      patch: {
        primaryColor: "#44403c",
        primaryHoverColor: "#292524",
        selectedBgColor: "#fafaf9",
        countdownBgColor: "#e7e5e4",
        countdownTextColor: "#44403c",
        savingsColor: "#ea580c",
        optionSubtextColor: "#78716c",
        mutedColor: "#78716c",
        cardBorderColor: "#d6d3d1",
        badgeBackgroundColor: "#1c1917",
        badgeTextColor: "#fafaf9",
        radioButtonBorderColor: "#a8a29e",
        radioButtonAccentColor: "#44403c",
        cardBorderRadiusPx: 10,
        buttonBorderRadiusPx: 8,
        controlBorderRadiusPx: 6,
        badgePosition: "top_left",
        badgeDesign: "tag",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "start",
        countdownAlign: "end",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "halloween_graveyard",
      label: "Graveyard",
      category: "halloween",
      swatch: "#115e59",
      swatchImage: "/halloween/skull.png",
      patch: {
        primaryColor: "#115e59",
        primaryHoverColor: "#134e4a",
        selectedBgColor: "#f0fdfa",
        countdownBgColor: "#ccfbf1",
        countdownTextColor: "#115e59",
        savingsColor: "#ea580c",
        optionSubtextColor: "#0f766e",
        mutedColor: "#57534e",
        cardBorderColor: "#99f6e4",
        badgeBackgroundColor: "#0f172a",
        badgeTextColor: "#5eead4",
        radioButtonBorderColor: "#5eead4",
        radioButtonAccentColor: "#115e59",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "banner",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_sand",
      label: "Ramadan Kareem",
      category: "ramadan",
      swatch: "#6b1d1e",
      swatchImage: "/ramadan/fanous.svg",
      patch: {
        primaryColor: "#6b1d1e",
        primaryHoverColor: "#4a1214",
        selectedBgColor: "#f8efe3",
        countdownBgColor: "#efe6d6",
        countdownTextColor: "#4a1214",
        savingsColor: "#c45c26",
        optionSubtextColor: "#8a5a00",
        mutedColor: "#78716c",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#6b1d1e",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#d4af37",
        radioButtonAccentColor: "#6b1d1e",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "pill",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_emerald",
      label: "Ramadan emerald",
      category: "ramadan",
      swatch: "#066a4f",
      swatchImage: "/ramadan/crescent-gold.svg",
      patch: {
        primaryColor: "#066a4f",
        primaryHoverColor: "#064e3b",
        selectedBgColor: "#eef8f2",
        countdownBgColor: "#d8f0e4",
        countdownTextColor: "#064e3b",
        savingsColor: "#c45c26",
        optionSubtextColor: "#0f766e",
        mutedColor: "#57534e",
        cardBorderColor: "#a7d9c4",
        badgeBackgroundColor: "#066a4f",
        badgeTextColor: "#ecfdf5",
        radioButtonBorderColor: "#34d399",
        radioButtonAccentColor: "#066a4f",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_gold",
      label: "Golden fanous",
      category: "ramadan",
      swatch: "#b8860b",
      swatchImage: "/ramadan/fanous.svg",
      patch: {
        primaryColor: "#b8860b",
        primaryHoverColor: "#9a6b0a",
        selectedBgColor: "#f8efe3",
        countdownBgColor: "#f0e4c4",
        countdownTextColor: "#8a5a00",
        savingsColor: "#c45c26",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#8a5a00",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#e8c547",
        radioButtonAccentColor: "#b8860b",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_midnight",
      label: "Mosque midnight",
      category: "ramadan",
      swatch: "#1a365d",
      swatchImage: "/ramadan/mosque.svg",
      patch: {
        primaryColor: "#1a365d",
        primaryHoverColor: "#142848",
        selectedBgColor: "#eef2f7",
        countdownBgColor: "#dbe4f0",
        countdownTextColor: "#1e3a8a",
        savingsColor: "#c45c26",
        optionSubtextColor: "#2a4a7a",
        mutedColor: "#64748b",
        cardBorderColor: "#b8c9de",
        badgeBackgroundColor: "#1a365d",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#60a5fa",
        radioButtonAccentColor: "#1a365d",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "gradient",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_lantern",
      label: "Amber fanous",
      category: "ramadan",
      swatch: "#b04a1c",
      swatchImage: "/ramadan/fanous-amber.svg",
      patch: {
        primaryColor: "#b04a1c",
        primaryHoverColor: "#8f3c16",
        selectedBgColor: "#f8efe3",
        countdownBgColor: "#f0e0d0",
        countdownTextColor: "#9a3412",
        savingsColor: "#c45c26",
        optionSubtextColor: "#c2410c",
        mutedColor: "#57534e",
        cardBorderColor: "#e8c4a0",
        badgeBackgroundColor: "#b04a1c",
        badgeTextColor: "#fff8e7",
        radioButtonBorderColor: "#fb923c",
        radioButtonAccentColor: "#b04a1c",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "pill",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_crescent",
      label: "Crescent & star",
      category: "ramadan",
      swatch: "#055a44",
      swatchImage: "/ramadan/star-gold.svg",
      patch: {
        primaryColor: "#055a44",
        primaryHoverColor: "#044836",
        selectedBgColor: "#eef6f1",
        countdownBgColor: "#d4ebe0",
        countdownTextColor: "#044836",
        savingsColor: "#c45c26",
        optionSubtextColor: "#0b7a5c",
        mutedColor: "#57534e",
        cardBorderColor: "#a7d4c0",
        badgeBackgroundColor: "#055a44",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#34d399",
        radioButtonAccentColor: "#055a44",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "banner",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_kaaba",
      label: "Sacred Kaaba",
      category: "ramadan",
      swatch: "#1c1917",
      swatchImage: "/ramadan/kaaba.svg",
      patch: {
        primaryColor: "#1c1917",
        primaryHoverColor: "#0c0a09",
        selectedBgColor: "#f3efe8",
        countdownBgColor: "#1c1917",
        countdownTextColor: "#f0d78c",
        savingsColor: "#c45c26",
        optionSubtextColor: "#57534e",
        mutedColor: "#78716c",
        cardBorderColor: "#d4cfc4",
        badgeBackgroundColor: "#1c1917",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#a8a29e",
        radioButtonAccentColor: "#1c1917",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_oasis",
      label: "Suhoor dates",
      category: "ramadan",
      swatch: "#0f766e",
      swatchImage: "/ramadan/dates.svg",
      patch: {
        primaryColor: "#0f766e",
        primaryHoverColor: "#0d5f59",
        selectedBgColor: "#eef6f4",
        countdownBgColor: "#d5ebe7",
        countdownTextColor: "#115e59",
        savingsColor: "#c45c26",
        optionSubtextColor: "#0f766e",
        mutedColor: "#57534e",
        cardBorderColor: "#a5d4cb",
        badgeBackgroundColor: "#0f766e",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#2dd4bf",
        radioButtonAccentColor: "#0f766e",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_iftar",
      label: "Iftar table",
      category: "ramadan",
      swatch: "#7a3a12",
      swatchImage: "/ramadan/teapot.svg",
      patch: {
        primaryColor: "#7a3a12",
        primaryHoverColor: "#632f0e",
        selectedBgColor: "#f8efe3",
        countdownBgColor: "#f0e0d0",
        countdownTextColor: "#9a3412",
        savingsColor: "#c45c26",
        optionSubtextColor: "#b04a1c",
        mutedColor: "#78716c",
        cardBorderColor: "#e8c4a0",
        badgeBackgroundColor: "#7a3a12",
        badgeTextColor: "#fff8e7",
        radioButtonBorderColor: "#fb923c",
        radioButtonAccentColor: "#7a3a12",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_left",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "ramadan_starry",
      label: "Eid Mubarak",
      category: "ramadan",
      swatch: "#5b21b6",
      swatchImage: "/ramadan/crescent-gold.svg",
      patch: {
        primaryColor: "#5b21b6",
        primaryHoverColor: "#4c1d95",
        selectedBgColor: "#f3eef8",
        countdownBgColor: "#e8e0f4",
        countdownTextColor: "#5b21b6",
        savingsColor: "#c45c26",
        optionSubtextColor: "#7c3aed",
        mutedColor: "#64748b",
        cardBorderColor: "#c9b8e0",
        badgeBackgroundColor: "#5b21b6",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#a78bfa",
        radioButtonAccentColor: "#5b21b6",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "flag",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_diya",
      label: "Diwali Offer",
      category: "diwali",
      swatch: "#7a1f2b",
      swatchImage: "/diwali/diya.svg",
      patch: {
        primaryColor: "#7a1f2b",
        primaryHoverColor: "#5c1620",
        selectedBgColor: "#fff4e8",
        countdownBgColor: "#f5e6b8",
        countdownTextColor: "#7a1f2b",
        savingsColor: "#c2410c",
        optionSubtextColor: "#9a2a3a",
        mutedColor: "#78716c",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#7a1f2b",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#7a1f2b",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        badgeDesign: "capsule",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_marigold",
      label: "Marigold toran",
      category: "diwali",
      swatch: "#7a1f2b",
      swatchImage: "/diwali/toran.svg",
      patch: {
        primaryColor: "#7a1f2b",
        primaryHoverColor: "#5c1620",
        selectedBgColor: "#fff4eb",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#c2410c",
        optionSubtextColor: "#9a3412",
        mutedColor: "#78716c",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#7a1f2b",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#7a1f2b",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 12,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_rangoli",
      label: "Rangoli diyas",
      category: "diwali",
      swatch: "#7a1f2b",
      swatchImage: "/diwali/rangoli.svg",
      patch: {
        primaryColor: "#7a1f2b",
        primaryHoverColor: "#5c1620",
        selectedBgColor: "#fff5e8",
        countdownBgColor: "#f5e6b8",
        countdownTextColor: "#7a1f2b",
        savingsColor: "#c2410c",
        optionSubtextColor: "#9a2a3a",
        mutedColor: "#78716c",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#7a1f2b",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#7a1f2b",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_left",
        badgeDesign: "flag",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_fireworks",
      label: "Night sparklers",
      category: "diwali",
      swatch: "#5c1620",
      swatchImage: "/diwali/lantern.svg",
      patch: {
        primaryColor: "#5c1620",
        primaryHoverColor: "#3c141e",
        selectedBgColor: "#fff4e8",
        countdownBgColor: "#f5e6b8",
        countdownTextColor: "#5c1620",
        savingsColor: "#c2410c",
        optionSubtextColor: "#7a1f2b",
        mutedColor: "#64748b",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#7a1f2b",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#5c1620",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_temple",
      label: "Temple maroon",
      category: "diwali",
      swatch: "#5c1620",
      swatchImage: "/diwali/lantern.svg",
      patch: {
        primaryColor: "#5c1620",
        primaryHoverColor: "#3c141e",
        selectedBgColor: "#fff1e8",
        countdownBgColor: "#f5e6b8",
        countdownTextColor: "#5c1620",
        savingsColor: "#b45309",
        optionSubtextColor: "#7a1f2b",
        mutedColor: "#78716c",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#b45309",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#5c1620",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "top_right",
        badgeDesign: "capsule",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_mithai",
      label: "Mithai gold",
      category: "diwali",
      swatch: "#b8860b",
      swatchImage: "/diwali/diya.svg",
      patch: {
        primaryColor: "#b8860b",
        primaryHoverColor: "#9a6b0a",
        selectedBgColor: "#fefce8",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#854d0e",
        savingsColor: "#7a1f2b",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#fde68a",
        badgeBackgroundColor: "#7a1f2b",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#facc15",
        radioButtonAccentColor: "#b8860b",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_lotus",
      label: "Lotus ivory",
      category: "diwali",
      swatch: "#9a2a3a",
      swatchImage: "/diwali/flourish.svg",
      patch: {
        primaryColor: "#9a2a3a",
        primaryHoverColor: "#7a1f2b",
        selectedBgColor: "#fff5f0",
        countdownBgColor: "#f5e6b8",
        countdownTextColor: "#7a1f2b",
        savingsColor: "#c2410c",
        optionSubtextColor: "#9a2a3a",
        mutedColor: "#78716c",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#7a1f2b",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#9a2a3a",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_sparkle",
      label: "Gold sparkle",
      category: "diwali",
      swatch: "#c9a227",
      swatchImage: "/diwali/marigold.svg",
      patch: {
        primaryColor: "#c9a227",
        primaryHoverColor: "#7a1f2b",
        selectedBgColor: "#fff8e7",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#7a1f2b",
        savingsColor: "#c2410c",
        optionSubtextColor: "#9a6b0a",
        mutedColor: "#64748b",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#7a1f2b",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#c9a227",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_royal",
      label: "Royal maroon",
      category: "diwali",
      swatch: "#5c1620",
      swatchImage: "/diwali/lantern.svg",
      patch: {
        primaryColor: "#5c1620",
        primaryHoverColor: "#3c141e",
        selectedBgColor: "#ffefe8",
        countdownBgColor: "#f5e6b8",
        countdownTextColor: "#5c1620",
        savingsColor: "#c9a227",
        optionSubtextColor: "#7a1f2b",
        mutedColor: "#64748b",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#c9a227",
        badgeTextColor: "#1c1917",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#5c1620",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        badgeDesign: "flag",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "diwali_peacock",
      label: "Lakshmi gold",
      category: "diwali",
      swatch: "#b8860b",
      swatchImage: "/diwali/corner-tl.svg",
      patch: {
        primaryColor: "#b8860b",
        primaryHoverColor: "#7a1f2b",
        selectedBgColor: "#fff8e7",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#7a1f2b",
        savingsColor: "#7a1f2b",
        optionSubtextColor: "#9a6b0a",
        mutedColor: "#64748b",
        cardBorderColor: "#e8d5a8",
        badgeBackgroundColor: "#7a1f2b",
        badgeTextColor: "#f5e6b8",
        radioButtonBorderColor: "#c9a227",
        radioButtonAccentColor: "#b8860b",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        badgeDesign: "soft",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_pot",
      label: "Pongalo Pongal",
      category: "pongal",
      swatch: "#c2410c",
      swatchImage: "/pongal/paanai.png",
      patch: {
        primaryColor: "#c2410c",
        primaryHoverColor: "#9a3412",
        selectedBgColor: "#fff4eb",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#15803d",
        optionSubtextColor: "#c2410c",
        mutedColor: "#78716c",
        cardBorderColor: "#fdba74",
        badgeBackgroundColor: "#15803d",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#fb923c",
        radioButtonAccentColor: "#c2410c",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        badgeDesign: "capsule",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_sun",
      label: "Thai Pongal",
      category: "pongal",
      swatch: "#ca8a04",
      swatchImage: "/pongal/suryan.png",
      patch: {
        primaryColor: "#ca8a04",
        primaryHoverColor: "#a16207",
        selectedBgColor: "#fefce8",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#854d0e",
        savingsColor: "#15803d",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#fde68a",
        badgeBackgroundColor: "#ea580c",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#facc15",
        radioButtonAccentColor: "#ca8a04",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_sugarcane",
      label: "Karumbu",
      category: "pongal",
      swatch: "#16a34a",
      swatchImage: "/pongal/karumbu.png",
      patch: {
        primaryColor: "#16a34a",
        primaryHoverColor: "#15803d",
        selectedBgColor: "#ecfdf5",
        countdownBgColor: "#bbf7d0",
        countdownTextColor: "#166534",
        savingsColor: "#ca8a04",
        optionSubtextColor: "#15803d",
        mutedColor: "#64748b",
        cardBorderColor: "#86efac",
        badgeBackgroundColor: "#ca8a04",
        badgeTextColor: "#1c1917",
        radioButtonBorderColor: "#4ade80",
        radioButtonAccentColor: "#16a34a",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_cow",
      label: "Mattu Pongal",
      category: "pongal",
      swatch: "#92400e",
      swatchImage: "/pongal/mattu.png",
      patch: {
        primaryColor: "#92400e",
        primaryHoverColor: "#78350f",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#78350f",
        savingsColor: "#15803d",
        optionSubtextColor: "#92400e",
        mutedColor: "#78716c",
        cardBorderColor: "#fdba74",
        badgeBackgroundColor: "#ca8a04",
        badgeTextColor: "#1c1917",
        radioButtonBorderColor: "#f97316",
        radioButtonAccentColor: "#92400e",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "top_left",
        badgeDesign: "flag",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_rice",
      label: "Nel harvest",
      category: "pongal",
      swatch: "#a16207",
      swatchImage: "/pongal/rice.png",
      patch: {
        primaryColor: "#a16207",
        primaryHoverColor: "#854d0e",
        selectedBgColor: "#fefce8",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#854d0e",
        savingsColor: "#15803d",
        optionSubtextColor: "#a16207",
        mutedColor: "#78716c",
        cardBorderColor: "#fde68a",
        badgeBackgroundColor: "#15803d",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#facc15",
        radioButtonAccentColor: "#a16207",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        badgeDesign: "capsule",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_coconut",
      label: "Thengai",
      category: "pongal",
      swatch: "#15803d",
      swatchImage: "/pongal/coconut.png",
      patch: {
        primaryColor: "#15803d",
        primaryHoverColor: "#14532d",
        selectedBgColor: "#ecfdf5",
        countdownBgColor: "#bbf7d0",
        countdownTextColor: "#14532d",
        savingsColor: "#ca8a04",
        optionSubtextColor: "#166534",
        mutedColor: "#64748b",
        cardBorderColor: "#86efac",
        badgeBackgroundColor: "#ca8a04",
        badgeTextColor: "#1c1917",
        radioButtonBorderColor: "#4ade80",
        radioButtonAccentColor: "#15803d",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_kolam",
      label: "Kolam",
      category: "pongal",
      swatch: "#d97706",
      swatchImage: "/pongal/kolam.svg",
      patch: {
        primaryColor: "#d97706",
        primaryHoverColor: "#b45309",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#15803d",
        optionSubtextColor: "#c2410c",
        mutedColor: "#78716c",
        cardBorderColor: "#fdba74",
        badgeBackgroundColor: "#9a3412",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fbbf24",
        radioButtonAccentColor: "#d97706",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        badgeDesign: "flag",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_banana",
      label: "Vaazhai ilai",
      category: "pongal",
      swatch: "#65a30d",
      swatchImage: "/pongal/vaazhai.png",
      patch: {
        primaryColor: "#65a30d",
        primaryHoverColor: "#4d7c0f",
        selectedBgColor: "#f7fee7",
        countdownBgColor: "#d9f99d",
        countdownTextColor: "#3f6212",
        savingsColor: "#ca8a04",
        optionSubtextColor: "#4d7c0f",
        mutedColor: "#64748b",
        cardBorderColor: "#bef264",
        badgeBackgroundColor: "#ca8a04",
        badgeTextColor: "#1c1917",
        radioButtonBorderColor: "#a3e635",
        radioButtonAccentColor: "#65a30d",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_harvest",
      label: "Manjal & vellam",
      category: "pongal",
      swatch: "#d97706",
      swatchImage: "/pongal/manjal.png",
      patch: {
        primaryColor: "#d97706",
        primaryHoverColor: "#b45309",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#92400e",
        savingsColor: "#15803d",
        optionSubtextColor: "#c2410c",
        mutedColor: "#78716c",
        cardBorderColor: "#fdba74",
        badgeBackgroundColor: "#15803d",
        badgeTextColor: "#ffffff",
        radioButtonBorderColor: "#fbbf24",
        radioButtonAccentColor: "#d97706",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "pongal_steam",
      label: "Sakkarai Pongal",
      category: "pongal",
      swatch: "#ea580c",
      swatchImage: "/pongal/sakkarai.png",
      patch: {
        primaryColor: "#ea580c",
        primaryHoverColor: "#c2410c",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#15803d",
        optionSubtextColor: "#c2410c",
        mutedColor: "#78716c",
        cardBorderColor: "#fdba74",
        badgeBackgroundColor: "#9a3412",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fb923c",
        radioButtonAccentColor: "#ea580c",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_rose",
      label: "Rose romance",
      category: "valentine",
      swatch: "#e11d48",
      swatchImage: "/valentine/heart.png",
      patch: {
        primaryColor: "#e11d48",
        primaryHoverColor: "#be123c",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9f1239",
        savingsColor: "#c2410c",
        optionSubtextColor: "#e11d48",
        mutedColor: "#78716c",
        cardBorderColor: "#fecdd3",
        badgeBackgroundColor: "#e11d48",
        badgeTextColor: "#fff1f2",
        radioButtonBorderColor: "#fb7185",
        radioButtonAccentColor: "#e11d48",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "ribbon",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_blush",
      label: "Soft blush",
      category: "valentine",
      swatch: "#ec4899",
      swatchImage: "/valentine/sparkles.png",
      patch: {
        primaryColor: "#ec4899",
        primaryHoverColor: "#db2777",
        selectedBgColor: "#fdf2f8",
        countdownBgColor: "#fce7f3",
        countdownTextColor: "#9d174d",
        savingsColor: "#d97706",
        optionSubtextColor: "#db2777",
        mutedColor: "#78716c",
        cardBorderColor: "#fbcfe8",
        badgeBackgroundColor: "#ec4899",
        badgeTextColor: "#fff1f2",
        radioButtonBorderColor: "#f9a8d4",
        radioButtonAccentColor: "#ec4899",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_cupid",
      label: "Cupid's bow",
      category: "valentine",
      swatch: "#be185d",
      swatchImage: "/valentine/ribbon.png",
      patch: {
        primaryColor: "#be185d",
        primaryHoverColor: "#9d174d",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#fce7f3",
        countdownTextColor: "#9d174d",
        savingsColor: "#b45309",
        optionSubtextColor: "#db2777",
        mutedColor: "#78716c",
        cardBorderColor: "#f9a8d4",
        badgeBackgroundColor: "#be185d",
        badgeTextColor: "#fff1f2",
        radioButtonBorderColor: "#f472b6",
        radioButtonAccentColor: "#be185d",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "flag",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_velvet",
      label: "Velvet kiss",
      category: "valentine",
      swatch: "#9f1239",
      swatchImage: "/valentine/crown.png",
      patch: {
        primaryColor: "#9f1239",
        primaryHoverColor: "#881337",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#9f1239",
        countdownTextColor: "#fecdd3",
        savingsColor: "#d97706",
        optionSubtextColor: "#be123c",
        mutedColor: "#78716c",
        cardBorderColor: "#fda4af",
        badgeBackgroundColor: "#9f1239",
        badgeTextColor: "#fff1f2",
        radioButtonBorderColor: "#fb7185",
        radioButtonAccentColor: "#9f1239",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "top_center",
        badgeDesign: "banner",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_candy",
      label: "Candy hearts",
      category: "valentine",
      swatch: "#f472b6",
      swatchImage: "/valentine/candy.png",
      patch: {
        primaryColor: "#f472b6",
        primaryHoverColor: "#ec4899",
        selectedBgColor: "#fdf2f8",
        countdownBgColor: "#fce7f3",
        countdownTextColor: "#be185d",
        savingsColor: "#ea580c",
        optionSubtextColor: "#ec4899",
        mutedColor: "#a8a29e",
        cardBorderColor: "#fbcfe8",
        badgeBackgroundColor: "#f472b6",
        badgeTextColor: "#fff",
        radioButtonBorderColor: "#f9a8d4",
        radioButtonAccentColor: "#f472b6",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "pill",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_admirer",
      label: "Secret admirer",
      category: "valentine",
      swatch: "#a21caf",
      swatchImage: "/valentine/lollipop.png",
      patch: {
        primaryColor: "#a21caf",
        primaryHoverColor: "#86198f",
        selectedBgColor: "#fdf4ff",
        countdownBgColor: "#fae8ff",
        countdownTextColor: "#86198f",
        savingsColor: "#d97706",
        optionSubtextColor: "#c026d3",
        mutedColor: "#78716c",
        cardBorderColor: "#f0abfc",
        badgeBackgroundColor: "#a21caf",
        badgeTextColor: "#fdf4ff",
        radioButtonBorderColor: "#e879f9",
        radioButtonAccentColor: "#a21caf",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_left",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_ruby",
      label: "Ruby romance",
      category: "valentine",
      swatch: "#be123c",
      swatchImage: "/valentine/gem.png",
      patch: {
        primaryColor: "#be123c",
        primaryHoverColor: "#9f1239",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9f1239",
        savingsColor: "#b45309",
        optionSubtextColor: "#e11d48",
        mutedColor: "#64748b",
        cardBorderColor: "#fecdd3",
        badgeBackgroundColor: "#be123c",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fb7185",
        radioButtonAccentColor: "#be123c",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_pearl",
      label: "Pearl & rose",
      category: "valentine",
      swatch: "#fda4af",
      swatchImage: "/valentine/rose.png",
      patch: {
        primaryColor: "#e11d48",
        primaryHoverColor: "#be123c",
        selectedBgColor: "#fff7f7",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9f1239",
        savingsColor: "#a16207",
        optionSubtextColor: "#fb7185",
        mutedColor: "#a8a29e",
        cardBorderColor: "#fecdd3",
        badgeBackgroundColor: "#fda4af",
        badgeTextColor: "#881337",
        radioButtonBorderColor: "#fda4af",
        radioButtonAccentColor: "#e11d48",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_letter",
      label: "Love letter",
      category: "valentine",
      swatch: "#c2410c",
      swatchImage: "/valentine/gift.png",
      patch: {
        primaryColor: "#c2410c",
        primaryHoverColor: "#9a3412",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#be185d",
        optionSubtextColor: "#ea580c",
        mutedColor: "#78716c",
        cardBorderColor: "#fed7aa",
        badgeBackgroundColor: "#c2410c",
        badgeTextColor: "#fff7ed",
        radioButtonBorderColor: "#fb923c",
        radioButtonAccentColor: "#c2410c",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "tag",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "valentine_midnight",
      label: "Midnight romance",
      category: "valentine",
      swatch: "#4c0519",
      swatchImage: "/valentine/chocolate.png",
      patch: {
        primaryColor: "#4c0519",
        primaryHoverColor: "#3b0413",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#4c0519",
        countdownTextColor: "#fda4af",
        savingsColor: "#d97706",
        optionSubtextColor: "#9f1239",
        mutedColor: "#78716c",
        cardBorderColor: "#fecdd3",
        badgeBackgroundColor: "#4c0519",
        badgeTextColor: "#fecdd3",
        radioButtonBorderColor: "#fb7185",
        radioButtonAccentColor: "#4c0519",
        cardBorderRadiusPx: 12,
        buttonBorderRadiusPx: 12,
        controlBorderRadiusPx: 8,
        badgePosition: "top_center",
        badgeDesign: "banner",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_egg",
      label: "Pastel egg",
      category: "easter",
      swatch: "#f9a8d4",
      swatchImage: "/easter/egg-pink.png",
      patch: {
        primaryColor: "#db2777",
        primaryHoverColor: "#be185d",
        selectedBgColor: "#fdf2f8",
        countdownBgColor: "#fce7f3",
        countdownTextColor: "#9d174d",
        savingsColor: "#ca8a04",
        optionSubtextColor: "#db2777",
        mutedColor: "#78716c",
        cardBorderColor: "#fbcfe8",
        badgeBackgroundColor: "#db2777",
        badgeTextColor: "#fff1f2",
        radioButtonBorderColor: "#f9a8d4",
        radioButtonAccentColor: "#db2777",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_center",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_rabbit",
      label: "Bunny hop",
      category: "easter",
      swatch: "#a8a29e",
      swatchImage: "/easter/rabbit.png",
      patch: {
        primaryColor: "#78716c",
        primaryHoverColor: "#57534e",
        selectedBgColor: "#fafaf9",
        countdownBgColor: "#f5f5f4",
        countdownTextColor: "#44403c",
        savingsColor: "#ea580c",
        optionSubtextColor: "#78716c",
        mutedColor: "#a8a29e",
        cardBorderColor: "#e7e5e4",
        badgeBackgroundColor: "#57534e",
        badgeTextColor: "#fafaf9",
        radioButtonBorderColor: "#d6d3d1",
        radioButtonAccentColor: "#78716c",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "pill",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_chick",
      label: "Spring chick",
      category: "easter",
      swatch: "#facc15",
      swatchImage: "/easter/chick.png",
      patch: {
        primaryColor: "#ca8a04",
        primaryHoverColor: "#a16207",
        selectedBgColor: "#fefce8",
        countdownBgColor: "#fef9c3",
        countdownTextColor: "#854d0e",
        savingsColor: "#ea580c",
        optionSubtextColor: "#ca8a04",
        mutedColor: "#78716c",
        cardBorderColor: "#fde047",
        badgeBackgroundColor: "#ca8a04",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#facc15",
        radioButtonAccentColor: "#ca8a04",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_right",
        badgeDesign: "flag",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_tulip",
      label: "Garden tulip",
      category: "easter",
      swatch: "#f472b6",
      swatchImage: "/easter/tulip.png",
      patch: {
        primaryColor: "#ec4899",
        primaryHoverColor: "#db2777",
        selectedBgColor: "#fdf2f8",
        countdownBgColor: "#fce7f3",
        countdownTextColor: "#9d174d",
        savingsColor: "#16a34a",
        optionSubtextColor: "#db2777",
        mutedColor: "#78716c",
        cardBorderColor: "#f9a8d4",
        badgeBackgroundColor: "#ec4899",
        badgeTextColor: "#fff1f2",
        radioButtonBorderColor: "#f472b6",
        radioButtonAccentColor: "#ec4899",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "ribbon",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_carrot",
      label: "Carrot patch",
      category: "easter",
      swatch: "#fb923c",
      swatchImage: "/easter/carrot.png",
      patch: {
        primaryColor: "#ea580c",
        primaryHoverColor: "#c2410c",
        selectedBgColor: "#fff7ed",
        countdownBgColor: "#ffedd5",
        countdownTextColor: "#9a3412",
        savingsColor: "#16a34a",
        optionSubtextColor: "#ea580c",
        mutedColor: "#78716c",
        cardBorderColor: "#fed7aa",
        badgeBackgroundColor: "#ea580c",
        badgeTextColor: "#fff7ed",
        radioButtonBorderColor: "#fb923c",
        radioButtonAccentColor: "#ea580c",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_blossom",
      label: "Blossom meadow",
      category: "easter",
      swatch: "#fda4af",
      swatchImage: "/easter/blossom.png",
      patch: {
        primaryColor: "#e11d48",
        primaryHoverColor: "#be123c",
        selectedBgColor: "#fff1f2",
        countdownBgColor: "#ffe4e6",
        countdownTextColor: "#9f1239",
        savingsColor: "#ca8a04",
        optionSubtextColor: "#e11d48",
        mutedColor: "#78716c",
        cardBorderColor: "#fecdd3",
        badgeBackgroundColor: "#e11d48",
        badgeTextColor: "#fff1f2",
        radioButtonBorderColor: "#fda4af",
        radioButtonAccentColor: "#e11d48",
        cardBorderRadiusPx: 18,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "top_left",
        badgeDesign: "soft",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_basket",
      label: "Egg basket",
      category: "easter",
      swatch: "#d97706",
      swatchImage: "/easter/basket.png",
      patch: {
        primaryColor: "#b45309",
        primaryHoverColor: "#92400e",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#92400e",
        savingsColor: "#db2777",
        optionSubtextColor: "#b45309",
        mutedColor: "#78716c",
        cardBorderColor: "#fde68a",
        badgeBackgroundColor: "#b45309",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fbbf24",
        radioButtonAccentColor: "#b45309",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "stamp",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_lavender",
      label: "Lavender fields",
      category: "easter",
      swatch: "#c084fc",
      swatchImage: "/easter/egg-lilac.png",
      patch: {
        primaryColor: "#9333ea",
        primaryHoverColor: "#7e22ce",
        selectedBgColor: "#faf5ff",
        countdownBgColor: "#f3e8ff",
        countdownTextColor: "#6b21a8",
        savingsColor: "#db2777",
        optionSubtextColor: "#9333ea",
        mutedColor: "#78716c",
        cardBorderColor: "#e9d5ff",
        badgeBackgroundColor: "#9333ea",
        badgeTextColor: "#faf5ff",
        radioButtonBorderColor: "#c084fc",
        radioButtonAccentColor: "#9333ea",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_right",
        badgeDesign: "gradient",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_mint",
      label: "Mint meadow",
      category: "easter",
      swatch: "#6ee7b7",
      swatchImage: "/easter/egg-mint.png",
      patch: {
        primaryColor: "#059669",
        primaryHoverColor: "#047857",
        selectedBgColor: "#ecfdf5",
        countdownBgColor: "#d1fae5",
        countdownTextColor: "#065f46",
        savingsColor: "#db2777",
        optionSubtextColor: "#059669",
        mutedColor: "#78716c",
        cardBorderColor: "#a7f3d0",
        badgeBackgroundColor: "#059669",
        badgeTextColor: "#ecfdf5",
        radioButtonBorderColor: "#6ee7b7",
        radioButtonAccentColor: "#059669",
        cardBorderRadiusPx: 16,
        buttonBorderRadiusPx: 16,
        controlBorderRadiusPx: 12,
        badgePosition: "after_label",
        badgeDesign: "capsule",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
        widgetHeaderSwapOrder: false,
      },
    },
    {
      id: "easter_sunrise",
      label: "Easter sunrise",
      category: "easter",
      swatch: "#fbbf24",
      swatchImage: "/easter/egg-gold.png",
      patch: {
        primaryColor: "#d97706",
        primaryHoverColor: "#b45309",
        selectedBgColor: "#fffbeb",
        countdownBgColor: "#fef3c7",
        countdownTextColor: "#92400e",
        savingsColor: "#db2777",
        optionSubtextColor: "#d97706",
        mutedColor: "#78716c",
        cardBorderColor: "#fde68a",
        badgeBackgroundColor: "#d97706",
        badgeTextColor: "#fffbeb",
        radioButtonBorderColor: "#fbbf24",
        radioButtonAccentColor: "#d97706",
        cardBorderRadiusPx: 14,
        buttonBorderRadiusPx: 14,
        controlBorderRadiusPx: 10,
        badgePosition: "top_center",
        badgeDesign: "banner",
        widgetHeaderLayout: "stacked",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
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

const VOLUME_TABLE_APPEARANCE_COLOR_PATCHES: Partial<
  Record<VolumeDiscountAppearancePresetId, VolumeTablePresetColorPatch>
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
 * `VOLUME_TABLE_APPEARANCE_COLOR_PATCHES`. Heading + timer default to center.
 */
export const VOLUME_TABLE_APPEARANCE_PRESETS: VolumeDiscountAppearancePresetRow[] =
  VOLUME_DISCOUNT_APPEARANCE_PRESETS.map((row) => {
    const p = row.patch;
    const stacked = p.widgetHeaderLayout === "stacked";
    const colors = VOLUME_TABLE_APPEARANCE_COLOR_PATCHES[row.id];
    return {
      id: row.id,
      label: row.label,
      category: row.category,
      swatch: colors?.primaryColor ?? row.swatch,
      swatchImage: row.swatchImage,
      patch: {
        ...p,
        ...(colors ?? {}),
        widgetHeaderLayout: stacked ? "stacked" : "split",
        widgetHeadingAlign: "center",
        countdownAlign: "center",
      },
    };
  });

export function appearancePresetsForCategory(
  category: AppearanceTemplateCategory,
  forVolumeTable = false,
): VolumeDiscountAppearancePresetRow[] {
  const all = forVolumeTable
    ? VOLUME_TABLE_APPEARANCE_PRESETS
    : VOLUME_DISCOUNT_APPEARANCE_PRESETS;
  return all.filter((row) => row.category === category);
}

export function appearanceCategoryForPresetId(
  id: VolumeDiscountAppearanceTemplateId,
): AppearanceTemplateCategory {
  if (id === "custom") return "classic";
  const row = VOLUME_DISCOUNT_APPEARANCE_PRESETS.find((p) => p.id === id);
  return row?.category ?? "classic";
}

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
    appearanceDecorThemeId: presetId,
  });
}

function pickAppearanceTemplateId(
  raw: unknown,
): VolumeDiscountAppearanceTemplateId {
  if (raw === "custom") return "custom";
  if (typeof raw === "string") {
    const legacyChristmas: Record<string, VolumeDiscountAppearancePresetId> = {
      christmas_holly: "christmas_holly_bow",
      christmas_snow: "christmas_snowflake",
      christmas_gold: "christmas_santa_sleigh",
      christmas_candy: "christmas_candy_cane",
      christmas_evergreen: "christmas_gift_wrap",
      christmas_crimson: "christmas_santa_sleigh",
    };
    const mapped = legacyChristmas[raw] ?? raw;
    if (isVolumeDiscountAppearancePresetId(mapped)) return mapped;
  }
  return "classic_burgundy";
}

function pickAppearanceDecorThemeId(
  raw: unknown,
): VolumeDiscountAppearancePresetId | "" {
  if (raw === "" || raw == null) return "";
  if (typeof raw !== "string") return "";
  const legacyChristmas: Record<string, VolumeDiscountAppearancePresetId> = {
    christmas_holly: "christmas_holly_bow",
    christmas_snow: "christmas_snowflake",
    christmas_gold: "christmas_santa_sleigh",
    christmas_candy: "christmas_candy_cane",
    christmas_evergreen: "christmas_gift_wrap",
    christmas_crimson: "christmas_santa_sleigh",
  };
  const mapped = legacyChristmas[raw] ?? raw;
  if (isVolumeDiscountAppearancePresetId(mapped)) return mapped;
  return "";
}

/** Theme id used for seasonal CSS (`data-offrefy-theme`), including after Custom tweaks. */
export function resolveWidgetAppearanceDecorThemeId(
  d: Pick<
    VolumeDiscountWidgetDisplay,
    "appearanceTemplateId" | "appearanceDecorThemeId"
  >,
): VolumeDiscountAppearancePresetId | null {
  const id = d.appearanceTemplateId;
  if (id && id !== "custom") return id;
  const decor = d.appearanceDecorThemeId;
  if (decor) return decor;
  return null;
}

export const DEFAULT_WIDGET_DISPLAY: VolumeDiscountWidgetDisplay = {
  widgetHeading: "Get more, save more 🥳",
  widgetPresentation: "tier_cards",
  showCountdown: true,
  widgetHeaderLayout: "split",
  widgetHeadingAlign: "center",
  countdownAlign: "center",
  widgetHeaderSwapOrder: false,
  widgetHeaderMobileStack: true,
  countdownLabel: "Sale end in",
  countdownTimeAmount: 1,
  countdownTimeUnit: "days",
  ctaLabel: "Grab this deal",
  ctaButtonAction: "add_to_cart",
  ctaButtonPageUrl: "",
  hideThemeAddToCart: false,
  hideThemeBuyItNow: false,
  hideThemeVariantSelector: false,
  hideThemeQuantitySelector: false,
  hideThemePrice: false,
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
  badgeDesign: "pill",
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
  appearanceDecorThemeId: "classic_burgundy",
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
    hideThemePrice: pickBool(
      o.hideThemePrice,
      DEFAULT_WIDGET_DISPLAY.hideThemePrice,
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
    badgeDesign: pickBadgeDesign(o.badgeDesign),
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
    appearanceDecorThemeId: (() => {
      const explicit = pickAppearanceDecorThemeId(o.appearanceDecorThemeId);
      if (explicit) return explicit;
      // Legacy saves: only template id — keep decorations when already on a preset.
      const tid = pickAppearanceTemplateId(o.appearanceTemplateId);
      return tid === "custom" ? "" : tid;
    })(),
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
    appearanceDecorThemeId: presetId,
  });
}