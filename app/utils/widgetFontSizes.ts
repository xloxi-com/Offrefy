/** Global preset (quick apply for all text roles). */
export type VolumeDiscountFontScale = "compact" | "default" | "comfortable";

export type WidgetFontRole =
  | "title"
  | "buyLabel"
  | "badge"
  | "price"
  | "comparePrice"
  | "savings"
  /** Line under tier name (Rule settings → subtext); same default px as savings. */
  | "optionSubtext"
  | "button"
  | "countdownLabel"
  | "countdownValue"
  | "footnote";

/** Legacy stored values (sm / md / lg) — migrated to px on read. */
type LegacyFontStep = "sm" | "md" | "lg";

export const WIDGET_FONT_PX_MIN = 10;
export const WIDGET_FONT_PX_MAX = 36;

export function clampWidgetFontPx(n: number): number {
  return Math.min(
    WIDGET_FONT_PX_MAX,
    Math.max(WIDGET_FONT_PX_MIN, Math.round(Number(n))),
  );
}

/** CSS `font-size` value (clamped px). */
export function widgetFontSizeCss(px: number): string {
  return `${clampWidgetFontPx(px)}px`;
}

/**
 * Integer px per role × legacy step (matches former rem scale at 16px root).
 * Keep in sync with extensions/.../volume-discount-storefront.src.js (LEGACY_STEP_PX).
 */
const LEGACY_STEP_PX: Record<WidgetFontRole, Record<LegacyFontStep, number>> = {
  title: { sm: 17, md: 19, lg: 24 },
  buyLabel: { sm: 14, md: 16, lg: 18 },
  badge: { sm: 11, md: 12, lg: 13 },
  price: { sm: 14, md: 17, lg: 19 },
  comparePrice: { sm: 12, md: 13, lg: 15 },
  savings: { sm: 11, md: 12, lg: 14 },
  optionSubtext: { sm: 11, md: 12, lg: 14 },
  button: { sm: 14, md: 17, lg: 18 },
  countdownLabel: { sm: 12, md: 13, lg: 14 },
  countdownValue: { sm: 12, md: 13, lg: 14 },
  footnote: { sm: 11, md: 12, lg: 13 },
};

/** Default px per role for each preset (same as legacy md/sm/lg columns). */
export const FONT_SCALE_PIXELS: Record<
  VolumeDiscountFontScale,
  Record<WidgetFontRole, number>
> = {
  compact: {
    title: LEGACY_STEP_PX.title.sm,
    buyLabel: LEGACY_STEP_PX.buyLabel.sm,
    badge: LEGACY_STEP_PX.badge.sm,
    price: LEGACY_STEP_PX.price.sm,
    comparePrice: LEGACY_STEP_PX.comparePrice.sm,
    savings: LEGACY_STEP_PX.savings.sm,
    optionSubtext: LEGACY_STEP_PX.optionSubtext.sm,
    button: LEGACY_STEP_PX.button.sm,
    countdownLabel: LEGACY_STEP_PX.countdownLabel.sm,
    countdownValue: LEGACY_STEP_PX.countdownValue.sm,
    footnote: LEGACY_STEP_PX.footnote.sm,
  },
  default: {
    title: LEGACY_STEP_PX.title.md,
    buyLabel: LEGACY_STEP_PX.buyLabel.md,
    badge: LEGACY_STEP_PX.badge.md,
    price: LEGACY_STEP_PX.price.md,
    comparePrice: LEGACY_STEP_PX.comparePrice.md,
    savings: LEGACY_STEP_PX.savings.md,
    optionSubtext: LEGACY_STEP_PX.optionSubtext.md,
    button: LEGACY_STEP_PX.button.md,
    countdownLabel: LEGACY_STEP_PX.countdownLabel.md,
    countdownValue: LEGACY_STEP_PX.countdownValue.md,
    footnote: LEGACY_STEP_PX.footnote.md,
  },
  comfortable: {
    title: LEGACY_STEP_PX.title.lg,
    buyLabel: LEGACY_STEP_PX.buyLabel.lg,
    badge: LEGACY_STEP_PX.badge.lg,
    price: LEGACY_STEP_PX.price.lg,
    comparePrice: LEGACY_STEP_PX.comparePrice.lg,
    savings: LEGACY_STEP_PX.savings.lg,
    optionSubtext: LEGACY_STEP_PX.optionSubtext.lg,
    button: LEGACY_STEP_PX.button.lg,
    countdownLabel: LEGACY_STEP_PX.countdownLabel.lg,
    countdownValue: LEGACY_STEP_PX.countdownValue.lg,
    footnote: LEGACY_STEP_PX.footnote.lg,
  },
};

export function fontPixelsFromScale(
  scale: VolumeDiscountFontScale,
): Record<WidgetFontRole, number> {
  return { ...FONT_SCALE_PIXELS[scale] };
}

/** Parse JSON / form value: number, numeric string, or legacy sm|md|lg. */
export function parseWidgetFontPx(
  raw: unknown,
  role: WidgetFontRole,
  fallback: number,
): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampWidgetFontPx(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "sm" || t === "md" || t === "lg") {
      return LEGACY_STEP_PX[role][t];
    }
    const n = parseInt(t, 10);
    if (!Number.isNaN(n)) return clampWidgetFontPx(n);
  }
  return clampWidgetFontPx(fallback);
}

/** Polaris / admin: dropdown options 10–36 px. */
export const WIDGET_FONT_PX_SELECT_OPTIONS: { label: string; value: string }[] =
  Array.from({ length: WIDGET_FONT_PX_MAX - WIDGET_FONT_PX_MIN + 1 }, (_, i) => {
    const px = WIDGET_FONT_PX_MIN + i;
    return { label: `${px} px`, value: String(px) };
  });

/** Global multiplier for all role px (slider + % field in admin). */
export const FONT_SIZE_SCALE_PERCENT_MIN = 50;
export const FONT_SIZE_SCALE_PERCENT_MAX = 200;
export const FONT_SIZE_SCALE_PERCENT_DEFAULT = 100;

export function clampFontSizeScalePercent(n: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return FONT_SIZE_SCALE_PERCENT_DEFAULT;
  return Math.min(
    FONT_SIZE_SCALE_PERCENT_MAX,
    Math.max(FONT_SIZE_SCALE_PERCENT_MIN, x),
  );
}

export function parseFontSizeScalePercent(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampFontSizeScalePercent(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim().replace(/%/g, "");
    const n = parseInt(t, 10);
    if (!Number.isNaN(n)) return clampFontSizeScalePercent(n);
  }
  return FONT_SIZE_SCALE_PERCENT_DEFAULT;
}

/** Base px from preset × scale % → final px (clamped). */
export function scaledWidgetFontPx(
  basePx: number,
  scalePercent: number,
): number {
  const base = clampWidgetFontPx(basePx);
  const pct = clampFontSizeScalePercent(scalePercent);
  return clampWidgetFontPx(Math.round((base * pct) / 100));
}

export function scaledWidgetFontSizeCss(
  basePx: number,
  scalePercent: number,
): string {
  return `${scaledWidgetFontPx(basePx, scalePercent)}px`;
}
