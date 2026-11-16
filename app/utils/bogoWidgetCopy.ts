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

/** Quantity-break template colors that should retint the Buy X Get Y card. */
export type BogoAppearanceColorSource = {
  primaryColor?: string;
  selectedBgColor?: string;
  countdownBgColor?: string;
  countdownTextColor?: string;
  savingsColor?: string;
  optionSubtextColor?: string;
  mutedColor?: string;
  cardBorderColor?: string;
  badgeBackgroundColor?: string;
  badgeTextColor?: string;
};

/**
 * Classic templates, tuned for the Buy X Get Y card only.
 * Buy keeps the preset's own color. Get is a second accent so the two panels
 * stay apart. Titles stay near-black; panels stay pale.
 */
const BOGO_CLASSIC_PRESET_COLORS: Record<
  string,
  {
    primaryColor: string;
    getColor: string;
    buyBg: string;
    getBg: string;
    surfaceColor: string;
    borderColor: string;
    textColor: string;
    mutedColor: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  classic_burgundy: {
    primaryColor: "#6b1d1e",
    buyBg: "#fbf7f7",
    getColor: "#c2410c",
    getBg: "#fff7f2",
    surfaceColor: "#ffffff",
    borderColor: "#eadfde",
    textColor: "#1c1917",
    mutedColor: "#78716c",
    badgeBg: "#6b1d1e",
    badgeText: "#ffffff",
  },
  sunset_orange: {
    primaryColor: "#ea580c",
    buyBg: "#fff8f3",
    getColor: "#9f1239",
    getBg: "#fff5f6",
    surfaceColor: "#ffffff",
    borderColor: "#f0e6df",
    textColor: "#1c1917",
    mutedColor: "#78716c",
    badgeBg: "#ea580c",
    badgeText: "#ffffff",
  },
  ocean_blue: {
    primaryColor: "#2563eb",
    buyBg: "#f5f8ff",
    getColor: "#0f766e",
    getBg: "#f3fbfa",
    surfaceColor: "#ffffff",
    borderColor: "#e2e8f0",
    textColor: "#0f172a",
    mutedColor: "#64748b",
    badgeBg: "#1d4ed8",
    badgeText: "#ffffff",
  },
  forest_green: {
    primaryColor: "#15803d",
    buyBg: "#f4fbf6",
    getColor: "#b45309",
    getBg: "#fff8ef",
    surfaceColor: "#ffffff",
    borderColor: "#e5e7eb",
    textColor: "#1c1917",
    mutedColor: "#6b7280",
    badgeBg: "#15803d",
    badgeText: "#ffffff",
  },
  royal_purple: {
    primaryColor: "#7c3aed",
    buyBg: "#f7f5ff",
    getColor: "#db2777",
    getBg: "#fdf2f8",
    surfaceColor: "#ffffff",
    borderColor: "#ece7f5",
    textColor: "#1e1b4b",
    mutedColor: "#6b7280",
    badgeBg: "#6d28d9",
    badgeText: "#ffffff",
  },
  midnight_slate: {
    primaryColor: "#0f172a",
    buyBg: "#f8fafc",
    getColor: "#0f766e",
    getBg: "#f0fdfa",
    surfaceColor: "#ffffff",
    borderColor: "#e2e8f0",
    textColor: "#0f172a",
    mutedColor: "#64748b",
    badgeBg: "#0f172a",
    badgeText: "#f8fafc",
  },
  rose_coral: {
    primaryColor: "#e11d48",
    buyBg: "#fff5f6",
    getColor: "#c2410c",
    getBg: "#fff7f2",
    surfaceColor: "#ffffff",
    borderColor: "#f3e4e6",
    textColor: "#1c1917",
    mutedColor: "#78716c",
    badgeBg: "#e11d48",
    badgeText: "#ffffff",
  },
  mono_slate: {
    primaryColor: "#334155",
    buyBg: "#f8fafc",
    getColor: "#0f172a",
    getBg: "#f1f5f9",
    surfaceColor: "#ffffff",
    borderColor: "#e2e8f0",
    textColor: "#0f172a",
    mutedColor: "#64748b",
    badgeBg: "#1e293b",
    badgeText: "#f8fafc",
  },
  teal_mint: {
    primaryColor: "#0f766e",
    buyBg: "#f3fbfa",
    getColor: "#c2410c",
    getBg: "#fff7f2",
    surfaceColor: "#ffffff",
    borderColor: "#e4eeec",
    textColor: "#134e4a",
    mutedColor: "#78716c",
    badgeBg: "#0f766e",
    badgeText: "#ffffff",
  },
  amber_gold: {
    primaryColor: "#b45309",
    buyBg: "#fffbeb",
    getColor: "#9f1239",
    getBg: "#fff5f6",
    surfaceColor: "#ffffff",
    borderColor: "#f3ead7",
    textColor: "#1c1917",
    mutedColor: "#78716c",
    badgeBg: "#b45309",
    badgeText: "#fffbeb",
  },
};

/** Professional Buy X Get Y colors for a Classic preset, or null for other templates. */
export function bogoClassicPresetCopy(
  presetId: string,
  current: BogoWidgetCopy,
): BogoWidgetCopy | null {
  const row = BOGO_CLASSIC_PRESET_COLORS[presetId];
  if (!row) return null;
  return {
    ...current,
    buyColor: row.primaryColor || current.buyColor,
    getColor: row.getColor || current.getColor,
    buyBg: row.buyBg,
    getBg: row.getBg,
    surfaceColor: row.surfaceColor,
    borderColor: row.borderColor || current.borderColor,
    textColor: row.textColor,
    mutedColor: row.mutedColor || current.mutedColor,
    badgeBg: row.badgeBg,
    badgeText: row.badgeText,
  };
}

/**
 * Map a quantity-break appearance preset onto the BOGO card.
 * Buy uses the template primary, Get uses the savings accent, panels use the
 * selected / countdown fills, and the badge uses the template badge colors.
 */
export function bogoColorsFromAppearancePatch(
  patch: BogoAppearanceColorSource,
  current: BogoWidgetCopy,
): BogoWidgetCopy {
  const buy = patch.primaryColor || current.buyColor;
  const get =
    patch.savingsColor || patch.badgeBackgroundColor || current.getColor;
  return {
    ...current,
    buyColor: buy,
    getColor: get,
    buyBg: patch.selectedBgColor || current.buyBg,
    getBg: patch.countdownBgColor || current.getBg,
    surfaceColor: "#ffffff",
    borderColor: patch.cardBorderColor || current.borderColor,
    textColor:
      patch.countdownTextColor ||
      patch.optionSubtextColor ||
      current.textColor,
    mutedColor: patch.mutedColor || current.mutedColor,
    badgeBg: patch.badgeBackgroundColor || buy,
    badgeText: patch.badgeTextColor || current.badgeText,
  };
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
  radii?: { cardPx?: number; buttonPx?: number },
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
  const cardRadius =
    typeof radii?.cardPx === "number" && Number.isFinite(radii.cardPx)
      ? `${Math.round(radii.cardPx)}px`
      : "12px";
  const buttonRadius =
    typeof radii?.buttonPx === "number" && Number.isFinite(radii.buttonPx)
      ? `${Math.round(radii.buttonPx)}px`
      : "12px";

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
    `--ob-radius:${cardRadius}`,
    `--ob-cta-radius:${buttonRadius}`,
    `--ob-soft:#f4f4f5`,
  ].join(";");
}
