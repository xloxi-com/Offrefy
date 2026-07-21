import type { QuantityBreaksPreviewTierRow } from "../components/QuantityBreaksTailwindPreview";
import { buyLabelsForQuantityTiers } from "./buyLabelsForQuantityTiers";
import {
  applyVolumeTableAppearancePreset,
  DEFAULT_WIDGET_DISPLAY,
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "./widgetDisplay";

const BASE_SAMPLE = 98;

type TierLike = {
  buyFrom: string;
  value: string;
  valueUnit: string;
  badge: string;
  buyLabelText: string;
  optionSubtext: string;
  activeByDefault: boolean;
};

const QUANTITY_TIERS: TierLike[] = [
  {
    buyFrom: "1",
    value: "0",
    valueUnit: "%",
    badge: "Most Popular ⚡",
    buyLabelText: "",
    optionSubtext: "",
    activeByDefault: true,
  },
  {
    buyFrom: "11",
    value: "10",
    valueUnit: "%",
    badge: "",
    buyLabelText: "",
    optionSubtext: "",
    activeByDefault: false,
  },
  {
    buyFrom: "25",
    value: "15",
    valueUnit: "%",
    badge: "",
    buyLabelText: "",
    optionSubtext: "",
    activeByDefault: false,
  },
];

const VOLUME_TIERS: TierLike[] = [
  {
    buyFrom: "1",
    value: "0",
    valueUnit: "%",
    badge: "",
    buyLabelText: "Buy 1-10",
    optionSubtext: "",
    activeByDefault: true,
  },
  {
    buyFrom: "11",
    value: "10",
    valueUnit: "%",
    badge: "",
    buyLabelText: "Buy 11-20",
    optionSubtext: "",
    activeByDefault: false,
  },
  {
    buyFrom: "21",
    value: "15",
    valueUnit: "%",
    badge: "",
    buyLabelText: "Buy 21+",
    optionSubtext: "",
    activeByDefault: false,
  },
];

function buildRows(tiers: TierLike[]): QuantityBreaksPreviewTierRow[] {
  const base = BASE_SAMPLE;
  const sorted = tiers
    .map((t, idx) => ({
      t,
      idx,
      buyNum: Math.max(1, parseInt(String(t.buyFrom), 10) || 1),
    }))
    .sort((a, b) => a.buyNum - b.buyNum || a.idx - b.idx);

  const buyNums = sorted.map((s) => s.buyNum);
  const buyLabels = buyLabelsForQuantityTiers(buyNums);

  return sorted.map(({ t, buyNum }, i) => {
    const qtyLabel =
      t.buyLabelText.trim() ||
      buyLabels[i] ||
      (buyNum <= 1 ? "Buy 1" : `Buy ${buyNum}+`);
    const badge: string | null = t.badge?.trim() ? t.badge.trim() : null;
    const v = parseFloat(String(t.value)) || 0;
    let discountLabel: string;
    let perUnit: number;
    if (t.valueUnit === "%") {
      const pct = Math.min(100, Math.max(0, v));
      discountLabel = `${Math.round(pct)}% off`;
      perUnit = base * (1 - pct / 100);
    } else if (t.valueUnit === "fixed-price") {
      discountLabel = `$${t.value} each`;
      perUnit = v;
    } else if (t.valueUnit === "amount-each") {
      discountLabel = `$${t.value} off ea.`;
      perUnit = Math.max(0, base - v);
    } else {
      discountLabel = `$${t.value}`;
      perUnit = Math.max(0, base - v);
    }
    const lineOriginal = base * buyNum;
    const lineDiscounted = perUnit * buyNum;
    const savings = Math.max(0, lineOriginal - lineDiscounted);
    return {
      key: `${buyNum}-${t.value}-${t.valueUnit}-${t.badge ?? ""}`,
      buyNum,
      qtyLabel,
      optionSubtext: t.optionSubtext?.trim() ?? "",
      discountLabel,
      perUnitPrice: perUnit,
      priceLabel: `$${perUnit.toFixed(2)}`,
      lineOriginal,
      lineDiscounted,
      savings,
      badge,
      activeByDefault: t.activeByDefault,
    };
  });
}

export function getOfferTypePreviewRows(
  preset: "quantity" | "volume",
): QuantityBreaksPreviewTierRow[] {
  return buildRows(preset === "volume" ? VOLUME_TIERS : QUANTITY_TIERS);
}

export function getOfferTypePreviewWidgetDisplay(
  preset: "quantity" | "volume",
): VolumeDiscountWidgetDisplay {
  if (preset === "volume") {
    const base = normalizeVolumeDiscountWidgetDisplay({
      ...DEFAULT_WIDGET_DISPLAY,
      widgetHeading: "Buy more save more",
      widgetPresentation: "volume_table",
      ctaLabel: "Add to cart",
      ctaButtonAction: "add_to_cart",
      footnote: "Set quantity, then add to cart.",
    });
    return applyVolumeTableAppearancePreset(base, "ocean_blue");
  }
  return normalizeVolumeDiscountWidgetDisplay({ ...DEFAULT_WIDGET_DISPLAY });
}
