/** CSS `font-weight` as 100–900 (hundreds). */

export const WIDGET_FONT_WEIGHT_MIN = 100;
export const WIDGET_FONT_WEIGHT_MAX = 900;

export function clampWidgetFontWeight(n: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 400;
  const step = Math.round(x / 100) * 100;
  return Math.min(
    WIDGET_FONT_WEIGHT_MAX,
    Math.max(WIDGET_FONT_WEIGHT_MIN, step),
  );
}

export function parseWidgetFontWeight(
  raw: unknown,
  fallback: number,
): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampWidgetFontWeight(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "normal" || t === "regular") return clampWidgetFontWeight(400);
    if (t === "bold" || t === "bolder") return clampWidgetFontWeight(700);
    const n = parseInt(t, 10);
    if (!Number.isNaN(n)) return clampWidgetFontWeight(n);
  }
  return clampWidgetFontWeight(fallback);
}

export const WIDGET_FONT_WEIGHT_SELECT_OPTIONS: { label: string; value: string }[] =
  [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
    label: String(w),
    value: String(w),
  }));
