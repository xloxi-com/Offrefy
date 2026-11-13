/** Buy X Get Y card copy and colors. Volume offers ignore this object. */

export type BogoWidgetCopy = {
  badgeLabel: string;
  buyLabel: string;
  getFreeLabel: string;
  getLabel: string;
  pickLabel: string;
  pickLabelPlural: string;
  availableLabel: string;
  freeLabel: string;
  /** Buy accent (ribbon, price, qty). */
  buyColor: string;
  /** Free-gift accent (ribbon, FREE, selection). */
  getColor: string;
  /** Buy panel fill. */
  buyBg: string;
  /** Get panel fill. */
  getBg: string;
  /** Outer card fill. */
  surfaceColor: string;
  /** Outer card + tile borders. */
  borderColor: string;
  /** Title / product names. */
  textColor: string;
  /** Subtitle / hints. */
  mutedColor: string;
  /** Special Offer chip. */
  badgeBg: string;
  badgeText: string;
};

export const DEFAULT_BOGO_WIDGET_COPY: BogoWidgetCopy = {
  badgeLabel: "Special Offer",
  buyLabel: "BUY",
  getFreeLabel: "GET FREE",
  getLabel: "GET",
  pickLabel: "Pick {{qty}} free gift",
  pickLabelPlural: "Pick {{qty}} free gifts",
  availableLabel: "{{count}} products available",
  freeLabel: "FREE",
  buyColor: "#177245",
  getColor: "#9f2d55",
  buyBg: "#f6faf7",
  getBg: "#fbf7f9",
  surfaceColor: "#ffffff",
  borderColor: "#e8e8ea",
  textColor: "#18181b",
  mutedColor: "#71717a",
  badgeBg: "#f4f4f5",
  badgeText: "#52525b",
};

const TEXT_KEYS: Array<keyof BogoWidgetCopy> = [
  "badgeLabel",
  "buyLabel",
  "getFreeLabel",
  "getLabel",
  "pickLabel",
  "pickLabelPlural",
  "availableLabel",
  "freeLabel",
];

const COLOR_KEYS: Array<keyof BogoWidgetCopy> = [
  "buyColor",
  "getColor",
  "buyBg",
  "getBg",
  "surfaceColor",
  "borderColor",
  "textColor",
  "mutedColor",
  "badgeBg",
  "badgeText",
];

function pickText(raw: unknown, fallback: string): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

function pickColor(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
    return value;
  }
  if (
    /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+\s*)?\)$/i.test(
      value,
    )
  ) {
    return value;
  }
  return fallback;
}

export function normalizeBogoWidgetCopy(raw: unknown): BogoWidgetCopy {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const next = { ...DEFAULT_BOGO_WIDGET_COPY };
  for (const key of TEXT_KEYS) {
    next[key] = pickText(source[key], DEFAULT_BOGO_WIDGET_COPY[key]);
  }
  for (const key of COLOR_KEYS) {
    next[key] = pickColor(source[key], DEFAULT_BOGO_WIDGET_COPY[key]);
  }
  return next;
}

/** Replace `{{qty}}` / `{qty}` style tokens. */
export function fillBogoTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  let out = String(template ?? "");
  for (const [key, value] of Object.entries(vars)) {
    const text = String(value);
    out = out.split(`{{${key}}}`).join(text).split(`{${key}}`).join(text);
  }
  return out;
}

/** CSS custom properties for the BOGO card. */
export function bogoPanelColorStyle(
  copy: BogoWidgetCopy,
  ctaColor?: string,
): string {
  const buy = copy.buyColor || DEFAULT_BOGO_WIDGET_COPY.buyColor;
  const get = copy.getColor || DEFAULT_BOGO_WIDGET_COPY.getColor;
  const buyBg = copy.buyBg || DEFAULT_BOGO_WIDGET_COPY.buyBg;
  const getBg = copy.getBg || DEFAULT_BOGO_WIDGET_COPY.getBg;
  const surface = copy.surfaceColor || DEFAULT_BOGO_WIDGET_COPY.surfaceColor;
  const border = copy.borderColor || DEFAULT_BOGO_WIDGET_COPY.borderColor;
  const ink = copy.textColor || DEFAULT_BOGO_WIDGET_COPY.textColor;
  const muted = copy.mutedColor || DEFAULT_BOGO_WIDGET_COPY.mutedColor;
  const badgeBg = copy.badgeBg || DEFAULT_BOGO_WIDGET_COPY.badgeBg;
  const badgeText = copy.badgeText || DEFAULT_BOGO_WIDGET_COPY.badgeText;
  const cta = (ctaColor || "").trim() || "#18181b";

  return [
    `--ob-buy:${buy}`,
    `--ob-buy-soft:${buyBg}`,
    `--ob-buy-line:color-mix(in srgb, ${buy} 22%, ${border})`,
    `--ob-get:${get}`,
    `--ob-get-soft:${getBg}`,
    `--ob-get-line:color-mix(in srgb, ${get} 22%, ${border})`,
    `--ob-surface:${surface}`,
    `--ob-line:${border}`,
    `--ob-ink:${ink}`,
    `--ob-muted:${muted}`,
    `--ob-badge-bg:${badgeBg}`,
    `--ob-badge-text:${badgeText}`,
    `--ob-cta:${cta}`,
    `--ob-soft:#f4f4f5`,
  ].join(";");
}
