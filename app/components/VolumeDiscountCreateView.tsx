import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  ChoiceList,
  Divider,
  Icon,
  InlineStack,
  RangeSlider,
  Select,
  Tag,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  DesktopIcon,
  MobileIcon,
  RedoIcon,
  SearchIcon,
  UndoIcon,
} from "@shopify/polaris-icons";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFetcher } from "react-router";

import { QuantityBreaksTailwindPreview } from "./QuantityBreaksTailwindPreview";
import { WidgetDisplayColorField } from "./WidgetDisplayColorField";
import createStyles from "../styles/volume-discount-create.module.css";
import { buyLabelsForQuantityTiers } from "../utils/buyLabelsForQuantityTiers";
import {
  countdownDatetimeLocalFromNow,
  datetimeLocalToIsoUtc,
  isoToDatetimeLocalValue,
} from "../utils/countdownTimes";
import {
  BADGE_POSITION_OPTIONS,
  BADGE_SIZE_SCALE_PERCENT_MAX,
  BADGE_SIZE_SCALE_PERCENT_MIN,
  clampBadgeSizeScalePercent,
  isVolumeDiscountBadgePosition,
  isVolumeDiscountCountdownTimeUnit,
  isVolumeDiscountWidgetHeaderLayout,
  isVolumeDiscountWidgetHeaderTextAlign,
  WIDGET_HEADER_LAYOUT_OPTIONS,
  WIDGET_HEADER_LAYOUT_OPTIONS_VOLUME_TABLE,
  WIDGET_HEADER_TEXT_ALIGN_OPTIONS,
  clampFontSizeScalePercent,
  clampRadioButtonSizePx,
  clampVolumeTableCellPaddingPx,
  clampVolumeTableColInlinePaddingPx,
  clampWidgetBorderRadiusPx,
  clampWidgetFontPx,
  clampWidgetFontWeight,
  COUNTDOWN_TIME_UNIT_OPTIONS,
  CTA_BUTTON_ACTION_OPTIONS,
  applyVolumeDiscountAppearancePreset,
  applyVolumeTableAppearancePreset,
  DEFAULT_WIDGET_DISPLAY,
  FONT_SIZE_SCALE_PERCENT_MAX,
  FONT_SIZE_SCALE_PERCENT_MIN,
  normalizeVolumeDiscountWidgetDisplay,
  VOLUME_DISCOUNT_APPEARANCE_PRESETS,
  VOLUME_TABLE_APPEARANCE_PRESETS,
  widgetDisplayFontSizesFromScale,
  WIDGET_APPEARANCE_CUSTOM_TRIGGER_KEYS,
  WIDGET_BORDER_RADIUS_PX_MAX,
  WIDGET_BORDER_RADIUS_PX_MIN,
  WIDGET_VOLUME_TABLE_CELL_PADDING_PX_MAX,
  WIDGET_VOLUME_TABLE_CELL_PADDING_PX_MIN,
  WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX,
  WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN,
  WIDGET_RADIO_BUTTON_SIZE_PX_MAX,
  WIDGET_RADIO_BUTTON_SIZE_PX_MIN,
  WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS,
  WIDGET_FONT_PX_MAX,
  WIDGET_FONT_PX_MIN,
  WIDGET_FONT_WEIGHT_SELECT_OPTIONS,
  type VolumeDiscountFontScale,
  type VolumeDiscountWidgetDisplay,
} from "../utils/widgetDisplay";
import type {
  TierPayload,
  VolumeDiscountCustomerType,
  VolumeDiscountNewOfferPreset,
  VolumeDiscountProductScope,
  VolumeDiscountQuantityCondition,
} from "../types/volumeDiscount";
import {
  isVolumeDiscountCustomerType,
  isVolumeDiscountProductScope,
  isVolumeDiscountQuantityCondition,
  normalizeVolumeDiscountCustomerType,
} from "../types/volumeDiscount";
import { normalizeTierValueForForm } from "../utils/volumeDiscountTier";

/** Cart & checkout label default for new offers (`{{ discount }}` = tier %). */
const DEFAULT_VOLUME_DISCOUNT_DISPLAY_NAME = "{{ discount }} OFF";

/** Default “Discounted products” scope for new offers (Specific products). */
const DEFAULT_PRODUCT_SCOPE: VolumeDiscountProductScope = "specific-products";

/**
 * Shopify `s-text-field` / `s-number-field` often commit to React `onChange` on blur only.
 * Listen to `onInput` as well so form dirty state (Save bar) updates while typing.
 */
function sTextFieldValue(target: EventTarget | null): string {
  if (!target || typeof target !== "object") return "";
  const el = target as HTMLElement & { value?: unknown };
  return typeof el.value === "string" ? el.value : "";
}

type TierForm = {
  buyFrom: string;
  discountMode: string;
  value: string;
  valueUnit: string;
  badge: string;
  /** Custom tier line on the widget; empty uses auto (Buy 1, Buy 10–14, …). */
  buyLabelText: string;
  /** Optional line under the option label (same band as “You save …”). */
  optionSubtext: string;
  activeByDefault: boolean;
};

const defaultTier = (): TierForm => ({
  buyFrom: "1",
  discountMode: "per-item",
  value: "10",
  valueUnit: "%",
  badge: "",
  buyLabelText: "",
  optionSubtext: "",
  activeByDefault: true,
});

function defaultCreateTiers(): TierForm[] {
  return normalizeExclusiveActiveByDefault([
    {
      ...defaultTier(),
      value: "0",
      badge: "Most Popular ⚡",
    },
    { ...defaultTier(), buyFrom: "11", activeByDefault: false },
    { ...defaultTier(), buyFrom: "25", activeByDefault: false },
  ]);
}

/** Matches “Volume discount” card on Select offer type (`preset=volume`). */
function defaultVolumeTableTiers(): TierForm[] {
  return normalizeExclusiveActiveByDefault([
    {
      ...defaultTier(),
      buyFrom: "1",
      value: "0",
      valueUnit: "%",
      badge: "",
      buyLabelText: "Buy 1-10",
      activeByDefault: true,
    },
    {
      ...defaultTier(),
      buyFrom: "11",
      value: "10",
      valueUnit: "%",
      badge: "",
      buyLabelText: "Buy 11-20",
      activeByDefault: false,
    },
    {
      ...defaultTier(),
      buyFrom: "21",
      value: "15",
      valueUnit: "%",
      badge: "",
      buyLabelText: "Buy 21+",
      activeByDefault: false,
    },
  ]);
}

function initialTiersForNewCampaign(
  preset: VolumeDiscountNewOfferPreset | undefined,
): TierForm[] {
  if (preset === "volume_table") return defaultVolumeTableTiers();
  return defaultCreateTiers();
}

function initialWidgetDisplayForNewCampaign(
  preset: VolumeDiscountNewOfferPreset | undefined,
): VolumeDiscountWidgetDisplay {
  if (preset === "volume_table") {
    const base = normalizeVolumeDiscountWidgetDisplay({
      ...DEFAULT_WIDGET_DISPLAY,
      widgetHeading: "Buy more save more",
      widgetPresentation: "volume_table",
      showCountdown: true,
      ctaLabel: "Add to cart",
      ctaButtonAction: "add_to_cart",
      footnote: "Set quantity, then add to cart.",
    });
    return applyVolumeTableAppearancePreset(base, "ocean_blue");
  }
  return normalizeVolumeDiscountWidgetDisplay({ ...DEFAULT_WIDGET_DISPLAY });
}

/** Same rules as countdown `useState` initializer and after Discard (edit + create). */
function initialCountdownEndsAtLocalForEditor(
  initialCampaign: VolumeDiscountInitialCampaign | undefined,
  newOfferPreset: VolumeDiscountNewOfferPreset | undefined,
): string {
  const fromStored = isoToDatetimeLocalValue(
    initialCampaign?.countdownEndsAt ?? null,
  );
  if (fromStored.trim() !== "") return fromStored;
  const wd = initialCampaign
    ? normalizeVolumeDiscountWidgetDisplay(initialCampaign.widgetDisplay ?? {})
    : initialWidgetDisplayForNewCampaign(newOfferPreset);
  if (!wd.showCountdown) return "";
  return countdownDatetimeLocalFromNow(
    wd.countdownTimeAmount,
    wd.countdownTimeUnit,
  );
}

/**
 * Appearance → "Reset styles". Volume offers must not use `DEFAULT_WIDGET_DISPLAY`
 * when editing (it forces `tier_cards`); quantity breaks use the shared default.
 */
function resetWidgetAppearanceForEditor(
  isVolumeTableOffer: boolean,
  initialCampaign: VolumeDiscountInitialCampaign | undefined,
  newOfferPreset: VolumeDiscountNewOfferPreset | undefined,
): VolumeDiscountWidgetDisplay {
  if (isVolumeTableOffer) {
    return initialWidgetDisplayForNewCampaign("volume_table");
  }
  if (initialCampaign) {
    return { ...DEFAULT_WIDGET_DISPLAY };
  }
  return initialWidgetDisplayForNewCampaign(newOfferPreset);
}

/** At most one tier may be active by default (radio-style). */
function normalizeExclusiveActiveByDefault(tiers: TierForm[]): TierForm[] {
  const first = tiers.findIndex((t) => t.activeByDefault);
  const keepIdx = first === -1 ? 0 : first;
  return tiers.map((t, i) => ({ ...t, activeByDefault: i === keepIdx }));
}

const WIDGET_FONT_SCALE_OPTIONS = [
  { label: "Compact", value: "compact" },
  { label: "Default", value: "default" },
  { label: "Comfortable", value: "comfortable" },
] satisfies { label: string; value: VolumeDiscountFontScale }[];

type WidgetFontSizeFieldKey = keyof Pick<
  VolumeDiscountWidgetDisplay,
  | "fontSizeTitle"
  | "fontSizeBuyLabel"
  | "fontSizeOptionSubtext"
  | "fontSizeBadge"
  | "fontSizePrice"
  | "fontSizeComparePrice"
  | "fontSizeSavings"
  | "fontSizeButton"
  | "fontSizeCountdownLabel"
  | "fontSizeCountdownValue"
  | "fontSizeFootnote"
>;

/** Base px per widget part (sliders in admin). */
const WIDGET_FONT_SIZE_FIELDS: { key: WidgetFontSizeFieldKey; label: string }[] =
  [
    { key: "fontSizeTitle", label: "Title" },
    { key: "fontSizeBuyLabel", label: "Tier label" },
    { key: "fontSizeOptionSubtext", label: "Tier subtext" },
    { key: "fontSizeBadge", label: "Badge" },
    { key: "fontSizePrice", label: "Price" },
    { key: "fontSizeComparePrice", label: "Compare-at" },
    { key: "fontSizeSavings", label: "“You save” line" },
    { key: "fontSizeButton", label: "CTA text" },
    { key: "fontSizeCountdownLabel", label: "Countdown label" },
    { key: "fontSizeCountdownValue", label: "Countdown pill" },
    { key: "fontSizeFootnote", label: "Footnote" },
  ];

type SaveResponse =
  | { ok: true; campaignId: string }
  | { ok: false; error: string };

export type VolumeDiscountInitialCampaign = {
  id: string;
  campaignName: string;
  displayName: string | null;
  /** `draft` | `active` (and other DB values treated as not active in the toggle). */
  status: string;
  productScope: VolumeDiscountProductScope;
  quantityCondition: VolumeDiscountQuantityCondition;
  customerType: VolumeDiscountCustomerType;
  customerTags: string[];
  productIds: string[];
  collectionIds: string[];
  tiers: TierPayload[];
  widgetDisplay?: VolumeDiscountWidgetDisplay;
  countdownEndsAt?: string | null;
};

function tiersFromInitialCampaign(ic: VolumeDiscountInitialCampaign): TierForm[] {
  return normalizeExclusiveActiveByDefault(
    ic.tiers.map((t) => ({
      ...t,
      value: normalizeTierValueForForm(t.value),
      valueUnit: t.valueUnit === "amount" ? "amount-each" : t.valueUnit,
      badge: typeof t.badge === "string" ? t.badge : "",
      buyLabelText: t.buyLabelText ?? "",
      optionSubtext: t.optionSubtext ?? "",
    })),
  );
}

function volumeDiscountFormSnapshot(input: {
  campaignName: string;
  displayName: string;
  campaignStatus: "draft" | "active";
  productScope: VolumeDiscountProductScope;
  productIds: string[];
  collectionIds: string[];
  quantityCondition: VolumeDiscountQuantityCondition;
  customerType: string;
  customerTags: string[];
  tiers: TierForm[];
  widgetDisplay: VolumeDiscountWidgetDisplay;
  countdownEndsAt: string | null;
}) {
  return JSON.stringify({
    campaignName: input.campaignName.trim(),
    displayName: input.displayName.trim(),
    campaignStatus: input.campaignStatus,
    productScope: input.productScope,
    productIds: [...input.productIds].slice().sort(),
    collectionIds: [...input.collectionIds].slice().sort(),
    quantityCondition: input.quantityCondition,
    customerType: input.customerType,
    customerTags: [...input.customerTags].slice().sort(),
    tiers: input.tiers,
    widgetDisplay: input.widgetDisplay,
    countdownStartsAt: null,
    countdownEndsAt: input.countdownEndsAt,
  });
}

const VD_OFFER_SAVE_BAR_ID = "vd-volume-discount-offer";

type VolumeDiscountCreateViewProps = {
  onBack: () => void;
  onSuccess?: () => void;
  /** When set, form loads existing campaign (edit mode). */
  initialCampaign?: VolumeDiscountInitialCampaign;
  /** Default campaign name for create flow (e.g. Offer 1, Offer 2). Ignored when editing. */
  defaultCampaignName?: string;
  /** When creating from Select offer type → Volume discount (`?preset=volume`). */
  newOfferPreset?: VolumeDiscountNewOfferPreset;
};

export function VolumeDiscountCreateView({
  onBack,
  onSuccess,
  initialCampaign,
  defaultCampaignName,
  newOfferPreset,
}: VolumeDiscountCreateViewProps) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<SaveResponse>();
  const [campaignName, setCampaignName] = useState(
    () =>
      initialCampaign?.campaignName ??
      defaultCampaignName ??
      "Offer 1",
  );
  const [displayName, setDisplayName] = useState(
    () =>
      initialCampaign?.displayName ?? DEFAULT_VOLUME_DISCOUNT_DISPLAY_NAME,
  );
  const [productScope, setProductScope] = useState<VolumeDiscountProductScope>(
    () => initialCampaign?.productScope ?? DEFAULT_PRODUCT_SCOPE,
  );
  const [productIds, setProductIds] = useState<string[]>(
    () => [...(initialCampaign?.productIds ?? [])],
  );
  const [collectionIds, setCollectionIds] = useState<string[]>(
    () => [...(initialCampaign?.collectionIds ?? [])],
  );
  const [productQuery, setProductQuery] = useState("");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [quantityCondition, setQuantityCondition] =
    useState<VolumeDiscountQuantityCondition>(
      () => initialCampaign?.quantityCondition ?? "total-all",
    );
  const [customerType, setCustomerType] = useState<VolumeDiscountCustomerType>(
    () =>
      initialCampaign
        ? normalizeVolumeDiscountCustomerType(initialCampaign.customerType)
        : "everyone",
  );
  const [customerTags, setCustomerTags] = useState<string[]>(() =>
    initialCampaign?.customerTags?.length
      ? [...initialCampaign.customerTags]
      : [],
  );
  const [customerTagInput, setCustomerTagInput] = useState("");
  const [activeTier, setActiveTier] = useState(0);
  const [settingsTab, setSettingsTab] = useState(0);
  const [saveErrorDismissed, setSaveErrorDismissed] = useState(false);
  const [tiers, setTiers] = useState<TierForm[]>(() =>
    initialCampaign
      ? tiersFromInitialCampaign(initialCampaign)
      : initialTiersForNewCampaign(newOfferPreset),
  );
  const [widgetDisplay, setWidgetDisplay] = useState<VolumeDiscountWidgetDisplay>(
    () =>
      initialCampaign?.widgetDisplay
        ? normalizeVolumeDiscountWidgetDisplay(initialCampaign.widgetDisplay)
        : initialWidgetDisplayForNewCampaign(newOfferPreset),
  );
  const [countdownEndsAtLocal, setCountdownEndsAtLocal] = useState(() =>
    initialCountdownEndsAtLocalForEditor(initialCampaign, newOfferPreset),
  );
  /** Bumps preview countdown effect when user clicks “Reset timer” (same ISO within 1s). */
  const [countdownPreviewNonce, setCountdownPreviewNonce] = useState(0);
  /** Previous duration/unit/show for “reset end from now” when inputs change. */
  const lastCountdownAmountRef = useRef<number | null>(null);
  const lastCountdownUnitRef = useRef<string | null>(null);
  const lastShowCountdownRef = useRef<boolean | null>(null);
  /** Skips one countdown duration auto-sync after undo/redo (or external snapshot apply). */
  const skipNextCountdownAutoSyncRef = useRef(false);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const prevSnapshotForHistoryRef = useRef<string>("");
  const skipHistoryCommitRef = useRef(false);
  /** After Discard, realign Save-bar baseline to the restored form (see useLayoutEffect). */
  const syncBaselineAfterDiscardRef = useRef(false);
  const latestSnapshotRef = useRef("");
  const [historyVersion, setHistoryVersion] = useState(0);
  /** Mirrors `VolumeDiscountCampaign.status` (on = active, off = draft). */
  const [previewCampaignOn, setPreviewCampaignOn] = useState(() =>
    initialCampaign == null ? true : initialCampaign.status === "active",
  );
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">(
    "desktop",
  );

  const isVolumeTableOffer =
    widgetDisplay.widgetPresentation === "volume_table";
  /** Matches Select offer type cards: “Quantity breaks” vs “Volume discount”. */
  const offerTypePageTitle = useMemo((): string => {
    if (initialCampaign != null) {
      return widgetDisplay.widgetPresentation === "volume_table"
        ? "Volume discount"
        : "Quantity breaks";
    }
    return newOfferPreset === "volume_table"
      ? "Volume discount"
      : "Quantity breaks";
  }, [
    initialCampaign,
    newOfferPreset,
    widgetDisplay.widgetPresentation,
  ]);
  const appearanceFontSizeFields = useMemo(() => {
    if (!isVolumeTableOffer) return WIDGET_FONT_SIZE_FIELDS;
    let rows = WIDGET_FONT_SIZE_FIELDS.filter(
      (f) =>
        f.key !== "fontSizeOptionSubtext" &&
        f.key !== "fontSizeBadge" &&
        f.key !== "fontSizeComparePrice" &&
        f.key !== "fontSizeSavings",
    );
    if (!widgetDisplay.showCountdown) {
      rows = rows.filter(
        (f) =>
          f.key !== "fontSizeCountdownLabel" &&
          f.key !== "fontSizeCountdownValue",
      );
    }
    return rows.map((f) =>
      f.key === "fontSizeBuyLabel"
        ? { ...f, label: "Quantity column" }
        : f.key === "fontSizePrice"
          ? { ...f, label: "Price column" }
          : f,
    );
  }, [isVolumeTableOffer, widgetDisplay.showCountdown]);

  const tier = tiers[activeTier] ?? defaultTier();

  const handleSettingsTabChange = useCallback((index: number) => {
    startTransition(() => setSettingsTab(index));
  }, []);

  const patchWidgetDisplay = useCallback(
    (patch: Partial<VolumeDiscountWidgetDisplay>) => {
      setWidgetDisplay((prev) => {
        const next = { ...prev, ...patch };
        if (
          !Object.prototype.hasOwnProperty.call(patch, "appearanceTemplateId")
        ) {
          for (const k of Object.keys(patch) as (keyof VolumeDiscountWidgetDisplay)[]) {
            if (WIDGET_APPEARANCE_CUSTOM_TRIGGER_KEYS.has(k)) {
              next.appearanceTemplateId = "custom";
              break;
            }
          }
        }
        return next;
      });
    },
    [],
  );

  const productPagePreviewRows = useMemo(() => {
    const base = 98;
    const sorted = [...tiers]
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
  }, [tiers]);

  const updateTier = useCallback(
    (patch: Partial<TierForm>) => {
      setTiers((prev) =>
        prev.map((t, i) => (i === activeTier ? { ...t, ...patch } : t)),
      );
    },
    [activeTier],
  );

  const removeTier = useCallback(() => {
    setTiers((prev) => {
      if (prev.length <= 1) return prev;
      const next = normalizeExclusiveActiveByDefault(
        prev.filter((_, i) => i !== activeTier),
      );
      queueMicrotask(() =>
        setActiveTier(Math.max(0, next.length - 1)),
      );
      return next;
    });
  }, [activeTier]);

  const addTier = useCallback(() => {
    setTiers((prev) => {
      const next = [...prev, { ...defaultTier(), activeByDefault: false }];
      queueMicrotask(() => setActiveTier(next.length - 1));
      return next;
    });
  }, []);

  const openResourcePicker = useCallback(
    async (opts: {
      type: "product" | "variant" | "collection";
      query: string;
      selectionIds: string[];
    }): Promise<string[] | undefined> => {
      const resourcePicker = (
        shopify as unknown as {
          resourcePicker?: (args: {
            type: "product" | "variant" | "collection";
            multiple: boolean;
            query?: string;
            selectionIds?: { id: string }[];
          }) => Promise<{ id: string }[] | undefined>;
        }
      ).resourcePicker;
      if (typeof resourcePicker !== "function") {
        shopify.toast.show("Resource picker is not available in this context.");
        return undefined;
      }
      const selected = await resourcePicker({
        type: opts.type,
        multiple: true,
        query: opts.query.trim() || undefined,
        selectionIds: opts.selectionIds.map((id) => ({ id })),
      });
      if (!selected?.length) return undefined;
      return selected.map((r) => r.id);
    },
    [shopify],
  );

  const handleBrowseProducts = useCallback(async () => {
    const ids = await openResourcePicker({
      type: "product",
      query: productQuery,
      selectionIds: productIds,
    });
    if (ids) setProductIds(ids);
  }, [openResourcePicker, productIds, productQuery]);

  const handleBrowseVariants = useCallback(async () => {
    const ids = await openResourcePicker({
      type: "variant",
      query: productQuery,
      selectionIds: productIds,
    });
    if (ids) setProductIds(ids);
  }, [openResourcePicker, productIds, productQuery]);

  const handleBrowseCollections = useCallback(async () => {
    const ids = await openResourcePicker({
      type: "collection",
      query: collectionQuery,
      selectionIds: collectionIds,
    });
    if (ids) setCollectionIds(ids);
  }, [collectionIds, collectionQuery, openResourcePicker]);

  const addCustomerTag = useCallback(() => {
    const next = customerTagInput.trim();
    if (!next) return;
    setCustomerTags((prev) =>
      prev.includes(next) ? prev : [...prev, next],
    );
    setCustomerTagInput("");
  }, [customerTagInput]);

  const removeCustomerTag = useCallback((tag: string) => {
    setCustomerTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const applyFormSnapshotString = useCallback((raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const o = parsed as Record<string, unknown>;

    setCampaignName(String(o.campaignName ?? ""));
    setDisplayName(String(o.displayName ?? ""));

    const ps = o.productScope;
    setProductScope(
      typeof ps === "string" && isVolumeDiscountProductScope(ps)
        ? ps
        : DEFAULT_PRODUCT_SCOPE,
    );

    if (Array.isArray(o.productIds)) {
      setProductIds(o.productIds.filter((x): x is string => typeof x === "string"));
    } else {
      setProductIds([]);
    }
    if (Array.isArray(o.collectionIds)) {
      setCollectionIds(
        o.collectionIds.filter((x): x is string => typeof x === "string"),
      );
    } else {
      setCollectionIds([]);
    }

    const qc = o.quantityCondition;
    setQuantityCondition(
      typeof qc === "string" && isVolumeDiscountQuantityCondition(qc)
        ? qc
        : "total-all",
    );

    const ct = o.customerType;
    setCustomerType(
      typeof ct === "string"
        ? normalizeVolumeDiscountCustomerType(ct)
        : "everyone",
    );

    if (Array.isArray(o.customerTags)) {
      setCustomerTags(
        o.customerTags.filter((x): x is string => typeof x === "string"),
      );
    } else {
      setCustomerTags([]);
    }

    const nextTiers = Array.isArray(o.tiers)
      ? normalizeExclusiveActiveByDefault(o.tiers as TierForm[])
      : [];
    setTiers(nextTiers);
    setActiveTier((idx) =>
      Math.min(Math.max(0, idx), Math.max(0, nextTiers.length - 1)),
    );

    setWidgetDisplay(normalizeVolumeDiscountWidgetDisplay(o.widgetDisplay));

    const ends = o.countdownEndsAt;
    setCountdownEndsAtLocal(
      typeof ends === "string" && ends.trim()
        ? isoToDatetimeLocalValue(ends)
        : "",
    );

    setPreviewCampaignOn(o.campaignStatus === "active");
  }, []);

  const bumpHistoryStacks = useCallback(() => {
    setHistoryVersion((v) => v + 1);
  }, []);

  const handleSave = useCallback(() => {
    setSaveErrorDismissed(false);
    const fd = new FormData();
    fd.set("campaignName", campaignName.trim());
    fd.set("displayName", displayName.trim());
    fd.set("productScope", productScope);
    fd.set("quantityCondition", quantityCondition);
    fd.set("customerType", customerType);
    fd.set("customerTags", JSON.stringify(customerTags));
    const tiersForSave = tiers.map((t) => ({
      ...t,
      value: normalizeTierValueForForm(t.value),
    }));
    fd.set("tiers", JSON.stringify(tiersForSave));
    fd.set("productIds", JSON.stringify(productIds));
    fd.set("collectionIds", JSON.stringify(collectionIds));
    fd.set("widgetDisplay", JSON.stringify(widgetDisplay));
    fd.set("countdownStartsAt", "");
    fd.set(
      "countdownEndsAt",
      countdownEndsAtLocal.trim()
        ? datetimeLocalToIsoUtc(countdownEndsAtLocal) ?? ""
        : "",
    );
    fd.set(
      "campaignStatus",
      previewCampaignOn ? "active" : "draft",
    );
    fetcher.submit(fd, { method: "post" });
  }, [
    campaignName,
    collectionIds,
    countdownEndsAtLocal,
    customerTags,
    customerType,
    displayName,
    fetcher,
    previewCampaignOn,
    productIds,
    productScope,
    quantityCondition,
    tiers,
    widgetDisplay,
  ]);

  const handleDiscard = useCallback(() => {
    setSaveErrorDismissed(true);
    skipHistoryCommitRef.current = true;
    syncBaselineAfterDiscardRef.current = true;
    lastCountdownAmountRef.current = null;
    lastCountdownUnitRef.current = null;
    lastShowCountdownRef.current = null;
    if (initialCampaign) {
      setCampaignName(initialCampaign.campaignName);
      setDisplayName(
        initialCampaign.displayName ?? DEFAULT_VOLUME_DISCOUNT_DISPLAY_NAME,
      );
      setProductScope(initialCampaign.productScope);
      setProductIds([...initialCampaign.productIds]);
      setCollectionIds([...initialCampaign.collectionIds]);
      setQuantityCondition(initialCampaign.quantityCondition);
      setCustomerType(
        normalizeVolumeDiscountCustomerType(initialCampaign.customerType),
      );
      setCustomerTags(
        initialCampaign.customerTags?.length
          ? [...initialCampaign.customerTags]
          : [],
      );
      setCustomerTagInput("");
      setTiers(tiersFromInitialCampaign(initialCampaign));
      setWidgetDisplay(
        initialCampaign.widgetDisplay
          ? normalizeVolumeDiscountWidgetDisplay(initialCampaign.widgetDisplay)
          : { ...DEFAULT_WIDGET_DISPLAY },
      );
      setCountdownEndsAtLocal(
        initialCountdownEndsAtLocalForEditor(initialCampaign, newOfferPreset),
      );
      setPreviewCampaignOn(initialCampaign.status === "active");
    } else {
      setCampaignName(defaultCampaignName ?? "Offer 1");
      setDisplayName(DEFAULT_VOLUME_DISCOUNT_DISPLAY_NAME);
      setProductScope(DEFAULT_PRODUCT_SCOPE);
      setProductIds([]);
      setCollectionIds([]);
      setQuantityCondition("total-all");
      setCustomerType("everyone");
      setCustomerTags([]);
      setCustomerTagInput("");
      setTiers(initialTiersForNewCampaign(newOfferPreset));
      setWidgetDisplay(initialWidgetDisplayForNewCampaign(newOfferPreset));
      setCountdownEndsAtLocal(
        initialCountdownEndsAtLocalForEditor(undefined, newOfferPreset),
      );
      setProductQuery("");
      setCollectionQuery("");
      setPreviewCampaignOn(true);
    }
    setActiveTier(0);
  }, [defaultCampaignName, initialCampaign, newOfferPreset]);

  useEffect(() => {
    lastCountdownAmountRef.current = null;
    lastCountdownUnitRef.current = null;
    lastShowCountdownRef.current = null;
  }, [initialCampaign?.id]);

  useEffect(() => {
    if (skipNextCountdownAutoSyncRef.current) {
      skipNextCountdownAutoSyncRef.current = false;
      return;
    }

    if (!widgetDisplay.showCountdown) {
      setCountdownEndsAtLocal("");
      lastCountdownAmountRef.current = widgetDisplay.countdownTimeAmount;
      lastCountdownUnitRef.current = widgetDisplay.countdownTimeUnit;
      lastShowCountdownRef.current = false;
      return;
    }

    const nextLocal = countdownDatetimeLocalFromNow(
      widgetDisplay.countdownTimeAmount,
      widgetDisplay.countdownTimeUnit,
    );

    const hadStoredEnd = Boolean(
      initialCampaign?.countdownEndsAt &&
        isoToDatetimeLocalValue(initialCampaign.countdownEndsAt).trim(),
    );

    const amountChanged =
      lastCountdownAmountRef.current !== null &&
      lastCountdownAmountRef.current !== widgetDisplay.countdownTimeAmount;
    const unitChanged =
      lastCountdownUnitRef.current !== null &&
      lastCountdownUnitRef.current !== widgetDisplay.countdownTimeUnit;
    const showCountdownTurnedOn =
      lastShowCountdownRef.current === false &&
      widgetDisplay.showCountdown === true;

    const shouldSyncFromNow =
      amountChanged || unitChanged || showCountdownTurnedOn;

    const isFirstSyncRun =
      lastCountdownAmountRef.current === null &&
      lastCountdownUnitRef.current === null;

    const shouldSkipInitialOverwrite = isFirstSyncRun && hadStoredEnd;

    if (shouldSkipInitialOverwrite) {
      lastCountdownAmountRef.current = widgetDisplay.countdownTimeAmount;
      lastCountdownUnitRef.current = widgetDisplay.countdownTimeUnit;
      lastShowCountdownRef.current = widgetDisplay.showCountdown;
      return;
    }

    // useState already seeded end-from-duration when DB had no end; avoid a second
    // Date.now() write that trips the Save bar as “unsaved” on load/refresh.
    if (
      isFirstSyncRun &&
      !hadStoredEnd &&
      countdownEndsAtLocal.trim() !== ""
    ) {
      lastCountdownAmountRef.current = widgetDisplay.countdownTimeAmount;
      lastCountdownUnitRef.current = widgetDisplay.countdownTimeUnit;
      lastShowCountdownRef.current = widgetDisplay.showCountdown;
      return;
    }

    if (shouldSyncFromNow || !hadStoredEnd) {
      setCountdownEndsAtLocal(nextLocal);
    }

    lastCountdownAmountRef.current = widgetDisplay.countdownTimeAmount;
    lastCountdownUnitRef.current = widgetDisplay.countdownTimeUnit;
    lastShowCountdownRef.current = widgetDisplay.showCountdown;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- omit `initialCampaign.countdownEndsAt` so loader revalidation does not clobber local end time.
  }, [
    widgetDisplay.showCountdown,
    widgetDisplay.countdownTimeAmount,
    widgetDisplay.countdownTimeUnit,
    initialCampaign?.id,
  ]);

  const handleResetCountdownTimer = useCallback(() => {
    if (!widgetDisplay.showCountdown) return;
    setCountdownEndsAtLocal(
      countdownDatetimeLocalFromNow(
        widgetDisplay.countdownTimeAmount,
        widgetDisplay.countdownTimeUnit,
      ),
    );
    lastCountdownAmountRef.current = widgetDisplay.countdownTimeAmount;
    lastCountdownUnitRef.current = widgetDisplay.countdownTimeUnit;
    lastShowCountdownRef.current = true;
    setCountdownPreviewNonce((n) => n + 1);
  }, [
    widgetDisplay.showCountdown,
    widgetDisplay.countdownTimeAmount,
    widgetDisplay.countdownTimeUnit,
  ]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      onSuccess?.();
    }
  }, [fetcher.state, fetcher.data, onSuccess]);

  useEffect(() => {
    if (
      quantityCondition === "per-collection" &&
      productScope !== "collections"
    ) {
      setQuantityCondition("per-variant");
    }
  }, [productScope, quantityCondition]);

  const productScopeChoices = useMemo(
    () => [
      { label: "Specific products", value: "specific-products" },
      { label: "Specific product variants", value: "variants" },
      { label: "All products", value: "all" },
      { label: "Specific collections", value: "collections" },
      { label: "Group products", value: "group-products" },
    ],
    [],
  );

  const quantityBasisChoices = useMemo(
    () => [
      { label: "Total quantity of all products", value: "total-all" },
      {
        label: "Total quantity of each collection",
        value: "per-collection",
        disabled: productScope !== "collections",
      },
      { label: "Total quantity of each product", value: "per-product" },
      {
        label: "Total quantity of each product variant",
        value: "per-variant",
      },
    ],
    [productScope],
  );

  const saveBusy = fetcher.state !== "idle";
  const saveSubmitting = fetcher.state === "submitting";
  const saveError =
    !saveErrorDismissed &&
    fetcher.state === "idle" &&
    fetcher.data &&
    !fetcher.data.ok
      ? fetcher.data.error
      : null;

  const [, bumpSaveBaseline] = useState(0);
  const wasSubmittingRef = useRef(false);

  const formBaselineKey = initialCampaign?.id ?? "__new__";
  const countdownEndsSnapshot =
    countdownEndsAtLocal.trim() === ""
      ? null
      : datetimeLocalToIsoUtc(countdownEndsAtLocal);

  const currentFormSnapshot = useMemo(
    () =>
      volumeDiscountFormSnapshot({
        campaignName,
        displayName,
        campaignStatus: previewCampaignOn ? "active" : "draft",
        productScope,
        productIds,
        collectionIds,
        quantityCondition,
        customerType,
        customerTags: [...customerTags].sort(),
        tiers,
        widgetDisplay,
        countdownEndsAt: countdownEndsSnapshot,
      }),
    [
      campaignName,
      collectionIds,
      countdownEndsSnapshot,
      customerTags,
      customerType,
      displayName,
      previewCampaignOn,
      productIds,
      productScope,
      quantityCondition,
      tiers,
      widgetDisplay,
    ],
  );

  const baselineKeyRef = useRef(formBaselineKey);
  const baselineSnapshotRef = useRef<string | null>(null);
  if (
    baselineSnapshotRef.current === null ||
    baselineKeyRef.current !== formBaselineKey
  ) {
    baselineKeyRef.current = formBaselineKey;
    baselineSnapshotRef.current = currentFormSnapshot;
  }
  const formIsDirty = currentFormSnapshot !== baselineSnapshotRef.current;

  latestSnapshotRef.current = currentFormSnapshot;

  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    prevSnapshotForHistoryRef.current = "";
    setHistoryVersion((v) => v + 1);
  }, [formBaselineKey]);

  useEffect(() => {
    if (prevSnapshotForHistoryRef.current === "") {
      prevSnapshotForHistoryRef.current = currentFormSnapshot;
      return;
    }
    if (skipHistoryCommitRef.current) {
      skipHistoryCommitRef.current = false;
      prevSnapshotForHistoryRef.current = currentFormSnapshot;
      return;
    }
    if (prevSnapshotForHistoryRef.current === currentFormSnapshot) return;
    undoStackRef.current.push(prevSnapshotForHistoryRef.current);
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    prevSnapshotForHistoryRef.current = currentFormSnapshot;
    bumpHistoryStacks();
  }, [bumpHistoryStacks, currentFormSnapshot]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0 || saveBusy) return;
    const target = undoStackRef.current.pop()!;
    redoStackRef.current.push(latestSnapshotRef.current);
    skipHistoryCommitRef.current = true;
    skipNextCountdownAutoSyncRef.current = true;
    applyFormSnapshotString(target);
    prevSnapshotForHistoryRef.current = target;
    bumpHistoryStacks();
  }, [applyFormSnapshotString, bumpHistoryStacks, saveBusy]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0 || saveBusy) return;
    const target = redoStackRef.current.pop()!;
    undoStackRef.current.push(latestSnapshotRef.current);
    skipHistoryCommitRef.current = true;
    skipNextCountdownAutoSyncRef.current = true;
    applyFormSnapshotString(target);
    prevSnapshotForHistoryRef.current = target;
    bumpHistoryStacks();
  }, [applyFormSnapshotString, bumpHistoryStacks, saveBusy]);

  useLayoutEffect(() => {
    if (fetcher.state === "submitting") {
      wasSubmittingRef.current = true;
      return;
    }
    if (fetcher.state !== "idle" || !wasSubmittingRef.current) return;
    wasSubmittingRef.current = false;
    const d = fetcher.data;
    if (!d || !("ok" in d) || !d.ok) return;
    baselineSnapshotRef.current = currentFormSnapshot;
    bumpSaveBaseline((t) => t + 1);
  }, [fetcher.state, fetcher.data, currentFormSnapshot]);

  useLayoutEffect(() => {
    if (!syncBaselineAfterDiscardRef.current) return;
    syncBaselineAfterDiscardRef.current = false;
    baselineSnapshotRef.current = currentFormSnapshot;
    bumpSaveBaseline((t) => t + 1);
  }, [currentFormSnapshot]);

  const handleBack = useCallback(async () => {
    try {
      if (formIsDirty) {
        await shopify.saveBar.leaveConfirmation();
      }
    } catch {
      return;
    }
    onBack();
  }, [formIsDirty, onBack, shopify]);

  void historyVersion;
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  return (
    <s-page
      inlineSize="base"
      heading={
        initialCampaign
          ? `Edit ${offerTypePageTitle}`
          : `Create ${offerTypePageTitle}`
      }
    >
      <SaveBar
        id={VD_OFFER_SAVE_BAR_ID}
        open={formIsDirty}
        discardConfirmation
      >
        <button
          type="button"
          disabled={saveBusy}
          onClick={() => handleDiscard()}
        >
          Discard
        </button>
        <button
          type="button"
          variant="primary"
          disabled={
            saveBusy || (initialCampaign != null && !formIsDirty)
          }
          loading={saveSubmitting}
          onClick={() => handleSave()}
        >
          Save
        </button>
      </SaveBar>
      <s-stack direction="block" gap="base">
        {saveError ? (
          <s-banner tone="critical" heading="Could not save">
            {saveError}
          </s-banner>
        ) : null}
        <div className={createStyles.pageContentMax}>
          <s-stack
            direction="inline"
            gap="base"
            justifyContent="space-between"
            alignItems="center"
            inlineSize="100%"
          >
            <s-button
              variant="tertiary"
              icon="arrow-left"
              accessibilityLabel="Back to offer types"
              onClick={() => void handleBack()}
            >
              Offer types
            </s-button>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <ButtonGroup variant="segmented">
                <Button
                  icon={UndoIcon}
                  size="slim"
                  accessibilityLabel="Undo"
                  disabled={!canUndo || saveBusy}
                  onClick={handleUndo}
                />
                <Button
                  icon={RedoIcon}
                  size="slim"
                  accessibilityLabel="Redo"
                  disabled={!canRedo || saveBusy}
                  onClick={handleRedo}
                />
              </ButtonGroup>
              <s-button
                variant="primary"
                onClick={() => handleSave()}
                disabled={
                  saveBusy ||
                  (initialCampaign != null && !formIsDirty)
                }
                loading={saveSubmitting}
              >
                Save
              </s-button>
            </InlineStack>
          </s-stack>

          <s-stack direction="block" alignItems="stretch">
            <s-box inlineSize="100%">
            <div className={createStyles.formWithPreview}>
              <div className={createStyles.formColumn}>
                <Box paddingBlockEnd="300">
                  <Tabs
                    fitted
                    tabs={[
                      {
                        id: "rules",
                        content: "Rule settings",
                        panelID: "vd-rule-settings-panel",
                      },
                      {
                        id: "display",
                        content: "Display settings",
                        panelID: "vd-display-settings-panel",
                      },
                      {
                        id: "appearance",
                        content: "Appearance",
                        panelID: "vd-appearance-panel",
                      },
                    ]}
                    selected={settingsTab}
                    onSelect={handleSettingsTabChange}
                  >
                    {settingsTab === 0 ? (
                      <s-stack direction="block" gap="base">
                        <s-box
                          padding="large-200"
                          borderWidth="base"
                          borderRadius="large"
                          background="base"
                        >
                          <s-stack direction="block" gap="base">
                            <s-heading>Campaign details</s-heading>
                            <s-text-field
                              label="Campaign name"
                              name="campaignName"
                              value={campaignName}
                              onChange={(e) =>
                                setCampaignName(
                                  sTextFieldValue(e.currentTarget),
                                )
                              }
                              onInput={(e) =>
                                setCampaignName(
                                  sTextFieldValue(e.currentTarget),
                                )
                              }
                              autocomplete="off"
                            />
                            <s-paragraph color="subdued">
                              Internal name for this offer in the app.
                              Customer-facing text is set under Display settings.
                            </s-paragraph>
                          </s-stack>
                        </s-box>

                  <s-box
                    padding="large-200"
                    borderWidth="base"
                    borderRadius="large"
                    background="base"
                  >
                    <s-stack direction="block" gap="base">
                      <s-heading>Discount rules</s-heading>

                      <s-stack
                        direction="inline"
                        gap="small-200"
                        alignItems="center"
                      >
                        {tiers.map((_, i) => (
                          <s-button
                            key={i}
                            variant={
                              activeTier === i ? "secondary" : "tertiary"
                            }
                            onClick={() => setActiveTier(i)}
                          >
                            Tier {i + 1}
                          </s-button>
                        ))}
                        <s-button variant="tertiary" onClick={addTier}>
                          + Add
                        </s-button>
                      </s-stack>

                      <div className={createStyles.tierFieldsRow}>
                        <s-number-field
                          label="Buy from (quantity)"
                          name="buyFrom"
                          value={tier.buyFrom}
                          onChange={(e) =>
                            updateTier({ buyFrom: e.currentTarget.value })
                          }
                          onInput={(e) =>
                            updateTier({ buyFrom: e.currentTarget.value })
                          }
                          min={1}
                          step={1}
                          autocomplete="off"
                        />
                        <s-number-field
                          label="Value"
                          name="discountValue"
                          value={normalizeTierValueForForm(tier.value)}
                          onChange={(e) => {
                            const v = e.currentTarget.value;
                            updateTier({
                              value: v.trim() === "" ? "0" : v,
                            });
                          }}
                          onInput={(e) => {
                            const v = e.currentTarget.value;
                            updateTier({
                              value: v.trim() === "" ? "0" : v,
                            });
                          }}
                          min={0}
                          step={0.01}
                          autocomplete="off"
                        />
                        <s-select
                          label="Unit"
                          name="valueUnit"
                          icon="select"
                          labelAccessibilityVisibility="exclusive"
                          value={tier.valueUnit}
                          onChange={(e) =>
                            updateTier({ valueUnit: e.currentTarget.value })
                          }
                        >
                          <s-option value="%">%</s-option>
                          <s-option value="amount-each">
                            Amount off each
                          </s-option>
                          <s-option value="fixed-price">Fixed price</s-option>
                        </s-select>
                      </div>

                      <s-text-field
                        label="Option label (widget)"
                        name="tierBuyLabelText"
                        value={tier.buyLabelText}
                        onChange={(e) =>
                          updateTier({
                            buyLabelText: sTextFieldValue(e.currentTarget),
                          })
                        }
                        onInput={(e) =>
                          updateTier({
                            buyLabelText: sTextFieldValue(e.currentTarget),
                          })
                        }
                        placeholder="e.g. Buy 10–14 (auto if empty)"
                        autocomplete="off"
                      />
                      <s-paragraph color="subdued">
                        Overrides the automatic “Buy 1”, “Buy 10–14” text from
                        quantities. Leave empty to use the default range labels.
                      </s-paragraph>

                      {!isVolumeTableOffer ? (
                        <>
                          <s-text-field
                            label="Subtext under option (widget)"
                            name="tierOptionSubtext"
                            value={tier.optionSubtext}
                            onChange={(e) =>
                              updateTier({
                                optionSubtext: sTextFieldValue(e.currentTarget),
                              })
                            }
                            onInput={(e) =>
                              updateTier({
                                optionSubtext: sTextFieldValue(e.currentTarget),
                              })
                            }
                            placeholder="e.g. Standard price"
                            autocomplete="off"
                          />
                          <s-paragraph color="subdued">
                            Shown under the option name (color and size:
                            Appearance). Use for extra copy on any tier.
                          </s-paragraph>

                          <s-text-field
                            label="Badge"
                            name="tierBadge"
                            value={tier.badge}
                            onChange={(e) =>
                              updateTier({
                                badge: sTextFieldValue(e.currentTarget),
                              })
                            }
                            onInput={(e) =>
                              updateTier({
                                badge: sTextFieldValue(e.currentTarget),
                              })
                            }
                            placeholder="e.g. Most Popular ⚡"
                            autocomplete="off"
                          />
                          <s-paragraph color="subdued">
                            Leave empty to hide the pill. New offers pre-fill
                            “Most Popular ⚡” on the first tier only; other tiers
                            stay blank unless you add a badge.
                          </s-paragraph>
                        </>
                      ) : null}

                      <s-checkbox
                        label="Activate this tier by default"
                        checked={tier.activeByDefault}
                        onChange={() => {
                          const turnOn = !tier.activeByDefault;
                          setTiers((prev) => {
                            if (turnOn) {
                              return prev.map((t, i) => ({
                                ...t,
                                activeByDefault: i === activeTier,
                              }));
                            }
                            const next = prev.map((t, i) => ({
                              ...t,
                              activeByDefault:
                                i === activeTier ? false : t.activeByDefault,
                            }));
                            if (!next.some((t) => t.activeByDefault)) {
                              return normalizeExclusiveActiveByDefault(next);
                            }
                            return next;
                          });
                        }}
                      />

                      {tiers.length > 1 ? (
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          icon="delete"
                          onClick={removeTier}
                        >
                          Remove Tier {activeTier + 1}
                        </s-button>
                      ) : null}
                    </s-stack>
                  </s-box>

                  <Card padding="400">
                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">
                          Discounted products
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Choose what this discount applies to. Use Browse to
                          pick resources from your store.
                        </Text>
                      </BlockStack>
                      <ChoiceList
                        title="Product scope"
                        name="product-scope"
                        choices={productScopeChoices}
                        selected={[productScope]}
                        onChange={(selected) => {
                          const v = selected[0];
                          if (!v || !isVolumeDiscountProductScope(v)) return;
                          setProductScope(v);
                          setProductIds([]);
                          setCollectionIds([]);
                          setProductQuery("");
                          setCollectionQuery("");
                        }}
                      />

                      {productScope === "all" ? (
                        <Text as="p" variant="bodyMd" tone="subdued">
                          The discount applies to every product in your store.
                        </Text>
                      ) : null}

                      {productScope === "specific-products" ||
                      productScope === "group-products" ? (
                        <BlockStack gap="300">
                          <Text as="p" variant="bodyMd" tone="subdued">
                            {productScope === "group-products"
                              ? "Select multiple products that belong to this offer group."
                              : "Select individual products."}
                          </Text>
                          <InlineStack gap="200" wrap blockAlign="end">
                            <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
                              <TextField
                                label="Search products"
                                name="productSearch"
                                placeholder="Search products"
                                value={productQuery}
                                onChange={setProductQuery}
                                autoComplete="off"
                                prefix={<Icon source={SearchIcon} tone="base" />}
                              />
                            </div>
                            <Button
                              variant="secondary"
                              onClick={handleBrowseProducts}
                            >
                              Browse
                            </Button>
                          </InlineStack>
                          {productIds.length > 0 ? (
                            <InlineStack gap="200" blockAlign="center" wrap>
                              <Text as="span" variant="bodyMd" tone="subdued">
                                {productIds.length} product
                                {productIds.length === 1 ? "" : "s"} selected
                              </Text>
                              <Button
                                variant="plain"
                                onClick={() => setProductIds([])}
                              >
                                Clear
                              </Button>
                            </InlineStack>
                          ) : null}
                        </BlockStack>
                      ) : null}

                      {productScope === "variants" ? (
                        <BlockStack gap="300">
                          <InlineStack gap="200" wrap blockAlign="end">
                            <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
                              <TextField
                                label="Search variants"
                                name="variantSearch"
                                placeholder="Search variants"
                                value={productQuery}
                                onChange={setProductQuery}
                                autoComplete="off"
                                prefix={<Icon source={SearchIcon} tone="base" />}
                              />
                            </div>
                            <Button
                              variant="secondary"
                              onClick={handleBrowseVariants}
                            >
                              Browse
                            </Button>
                          </InlineStack>
                          {productIds.length > 0 ? (
                            <InlineStack gap="200" blockAlign="center" wrap>
                              <Text as="span" variant="bodyMd" tone="subdued">
                                {productIds.length} variant
                                {productIds.length === 1 ? "" : "s"} selected
                              </Text>
                              <Button
                                variant="plain"
                                onClick={() => setProductIds([])}
                              >
                                Clear
                              </Button>
                            </InlineStack>
                          ) : null}
                        </BlockStack>
                      ) : null}

                      {productScope === "collections" ? (
                        <BlockStack gap="300">
                          <InlineStack gap="200" wrap blockAlign="end">
                            <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
                              <TextField
                                label="Search collections"
                                name="collectionSearch"
                                placeholder="Search collections"
                                value={collectionQuery}
                                onChange={setCollectionQuery}
                                autoComplete="off"
                                prefix={<Icon source={SearchIcon} tone="base" />}
                              />
                            </div>
                            <Button
                              variant="secondary"
                              onClick={handleBrowseCollections}
                            >
                              Browse
                            </Button>
                          </InlineStack>
                          {collectionIds.length > 0 ? (
                            <InlineStack gap="200" blockAlign="center" wrap>
                              <Text as="span" variant="bodyMd" tone="subdued">
                                {collectionIds.length} collection
                                {collectionIds.length === 1 ? "" : "s"}{" "}
                                selected
                              </Text>
                              <Button
                                variant="plain"
                                onClick={() => setCollectionIds([])}
                              >
                                Clear
                              </Button>
                            </InlineStack>
                          ) : null}
                        </BlockStack>
                      ) : null}
                    </BlockStack>
                  </Card>

                  <Card padding="400">
                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">
                          Set quantity conditions
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Define how tier thresholds (e.g. Buy 25+) are counted.{" "}
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            Total quantity of all products
                          </Text>{" "}
                          sums every line quantity in the cart, picks one tier for
                          the whole cart, and applies that tier to each eligible
                          line — use this for cart-wide volume discounts.{" "}
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            Each product variant
                          </Text>{" "}
                          evaluates tiers separately per line (line quantity only).
                          Per collection applies when{" "}
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            Product scope
                          </Text>{" "}
                          is{" "}
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            Specific collections
                          </Text>
                          .
                        </Text>
                      </BlockStack>
                      <ChoiceList
                        title="Quantity basis"
                        name="quantity-condition"
                        choices={quantityBasisChoices}
                        selected={[quantityCondition]}
                        onChange={(selected) => {
                          const v = selected[0];
                          if (!v || !isVolumeDiscountQuantityCondition(v))
                            return;
                          setQuantityCondition(v);
                        }}
                      />
                    </BlockStack>
                  </Card>

                  <s-box
                    padding="large-200"
                    borderWidth="base"
                    borderRadius="large"
                    background="base"
                  >
                    <s-stack direction="block" gap="base">
                      <s-heading>Target customer</s-heading>
                      <s-paragraph color="subdued">
                        Choose which customers can use this discount.
                      </s-paragraph>
                      <s-select
                        label="Customer type"
                        name="customerType"
                        icon="person"
                        value={customerType}
                        onChange={(e) => {
                          const v = e.currentTarget.value;
                          if (isVolumeDiscountCustomerType(v)) {
                            setCustomerType(v);
                          }
                        }}
                      >
                        <s-option value="everyone">Everyone</s-option>
                        <s-option value="logged-in">
                          Logged-in customers
                        </s-option>
                        <s-option value="logged-in-tag-any">
                          Logged-in customers with specific tag
                        </s-option>
                      </s-select>
                      {customerType === "logged-in-tag-any" ? (
                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Match spelling to customer tags in Shopify admin
                              (Customers). Add one tag per chip; remove with ×.
                            </Text>
                            <InlineStack gap="200" wrap>
                              {customerTags.map((tag) => (
                                <Tag
                                  key={tag}
                                  onRemove={() => removeCustomerTag(tag)}
                                >
                                  {tag}
                                </Tag>
                              ))}
                            </InlineStack>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                addCustomerTag();
                              }}
                            >
                              <InlineStack gap="200" wrap blockAlign="end">
                                <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                                  <TextField
                                    label="Add customer tag"
                                    value={customerTagInput}
                                    onChange={(v) => setCustomerTagInput(v)}
                                    autoComplete="off"
                                    placeholder="e.g. Wholesale"
                                  />
                                </div>
                                <Button submit variant="primary">
                                  Add
                                </Button>
                              </InlineStack>
                            </form>
                          </BlockStack>
                        </Card>
                      ) : null}
                    </s-stack>
                  </s-box>
                      </s-stack>
                    ) : settingsTab === 1 ? (
                      <BlockStack gap="400">
                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              Cart & checkout
                            </Text>
                            <TextField
                              label="Display name"
                              name="displayName"
                              value={displayName}
                              onChange={setDisplayName}
                              multiline={2}
                              autoComplete="off"
                              helpText="Cart & checkout. {{ discount }} = tier % (e.g. 10%). {{ amount }} = line discount in store currency."
                            />
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              Button settings
                            </Text>
                            <TextField
                              label="Text button"
                              name="ctaLabel"
                              value={widgetDisplay.ctaLabel}
                              onChange={(v) =>
                                patchWidgetDisplay({ ctaLabel: v })
                              }
                              autoComplete="off"
                              multiline={2}
                            />
                            <Select
                              label="Button action"
                              helpText={
                                isVolumeTableOffer
                                  ? "Applies to the main button below the pricing table. Page URL must be on this shop."
                                  : "Applies to main CTA and tier + Add. Page URL must be on this shop."
                              }
                              options={[...CTA_BUTTON_ACTION_OPTIONS]}
                              value={widgetDisplay.ctaButtonAction}
                              onChange={(v) => {
                                if (
                                  v === "add_to_cart" ||
                                  v === "add_to_cart_open_drawer" ||
                                  v === "go_to_checkout" ||
                                  v === "go_to_page"
                                ) {
                                  patchWidgetDisplay({
                                    ctaButtonAction: v,
                                  });
                                }
                              }}
                            />
                            {widgetDisplay.ctaButtonAction === "go_to_page" ? (
                              <TextField
                                label="Page URL"
                                value={widgetDisplay.ctaButtonPageUrl}
                                onChange={(v) =>
                                  patchWidgetDisplay({
                                    ctaButtonPageUrl: v,
                                  })
                                }
                                autoComplete="off"
                                helpText="e.g. /pages/shipping or a full URL on this shop."
                              />
                            ) : null}
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              Advanced settings
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {isVolumeTableOffer
                                ? "Theme product form visibility. Tier row options below apply only to Quantity breaks (radio cards), not the volume discount table."
                                : "Theme product form visibility, widget chrome, and tier card price display. Most shops can leave these off unless you are replacing theme controls with the widget."}
                            </Text>
                            <BlockStack gap="200">
                                <Checkbox
                                  label="Hide theme Add to cart"
                                  helpText="Theme form only. Use the widget button to add."
                                  checked={widgetDisplay.hideThemeAddToCart}
                                  onChange={(checked) =>
                                    patchWidgetDisplay({
                                      hideThemeAddToCart: checked,
                                    })
                                  }
                                />
                                <Checkbox
                                  label="Hide theme Buy it now"
                                  helpText="Hides Shop Pay / dynamic checkout on the form."
                                  checked={widgetDisplay.hideThemeBuyItNow}
                                  onChange={(checked) =>
                                    patchWidgetDisplay({
                                      hideThemeBuyItNow: checked,
                                    })
                                  }
                                />
                                <Checkbox
                                  label="Hide theme variant picker"
                                  helpText="Pick variant in the widget (keep widget variant on)."
                                  checked={widgetDisplay.hideThemeVariantSelector}
                                  onChange={(checked) =>
                                    patchWidgetDisplay({
                                      hideThemeVariantSelector: checked,
                                    })
                                  }
                                />
                                <Checkbox
                                  label="Hide theme quantity"
                                  helpText="Removes qty on the product form only."
                                  checked={widgetDisplay.hideThemeQuantitySelector}
                                  onChange={(checked) =>
                                    patchWidgetDisplay({
                                      hideThemeQuantitySelector: checked,
                                    })
                                  }
                                />
                                {isVolumeTableOffer ? (
                                  <Checkbox
                                    label="Hide widget Add to cart button"
                                    helpText="Removes only this offer’s main button under the pricing table. Use Hide theme Add to cart above to hide the theme’s button."
                                    checked={widgetDisplay.hideWidgetMainCta}
                                    onChange={(checked) =>
                                      patchWidgetDisplay({
                                        hideWidgetMainCta: checked,
                                      })
                                    }
                                  />
                                ) : null}
                                {!isVolumeTableOffer ? (
                                  <>
                                    <Checkbox
                                      label="Hide widget variant dropdown"
                                      helpText="Use the theme’s variant UI instead."
                                      checked={
                                        widgetDisplay.hideWidgetVariantSelector
                                      }
                                      onChange={(checked) =>
                                        patchWidgetDisplay({
                                          hideWidgetVariantSelector: checked,
                                        })
                                      }
                                    />
                                    <Checkbox
                                      label="Hide out-of-stock variants in widget"
                                      helpText="Unavailable variants are omitted from the widget variant dropdown only."
                                      checked={
                                        widgetDisplay.hideOutOfStockVariants
                                      }
                                      onChange={(checked) =>
                                        patchWidgetDisplay({
                                          hideOutOfStockVariants: checked,
                                        })
                                      }
                                    />
                                    <Checkbox
                                      label="Hide widget quantity"
                                      helpText="Tier minimum only; no +/- in the widget."
                                      checked={
                                        widgetDisplay.hideWidgetQuantitySelector
                                      }
                                      onChange={(checked) =>
                                        patchWidgetDisplay({
                                          hideWidgetQuantitySelector: checked,
                                        })
                                      }
                                    />
                                    <Checkbox
                                      label="Hide line total in widget"
                                      helpText="Hides qty × price in the expanded row."
                                      checked={widgetDisplay.hideWidgetLineTotal}
                                      onChange={(checked) =>
                                        patchWidgetDisplay({
                                          hideWidgetLineTotal: checked,
                                        })
                                      }
                                    />
                                    <Checkbox
                                      label="Hide tier + Add buttons"
                                      helpText="Main CTA only."
                                      checked={
                                        widgetDisplay.hideWidgetTierAddButton
                                      }
                                      onChange={(checked) =>
                                        patchWidgetDisplay({
                                          hideWidgetTierAddButton: checked,
                                        })
                                      }
                                    />
                                    <Checkbox
                                      label="Show per-item price in tier cards"
                                      helpText="Off: tier total. On: each price. “You save” is unchanged."
                                      checked={widgetDisplay.cardPriceShowsUnit}
                                      onChange={(checked) =>
                                        patchWidgetDisplay({
                                          cardPriceShowsUnit: checked,
                                        })
                                      }
                                    />
                                    <Checkbox
                                      label="Hide compare-at price in tier cards"
                                      helpText="Removes strikethrough; sale price and savings can still show."
                                      checked={
                                        widgetDisplay.hideWidgetComparePrice
                                      }
                                      onChange={(checked) =>
                                        patchWidgetDisplay({
                                          hideWidgetComparePrice: checked,
                                        })
                                      }
                                    />
                                  </>
                                ) : null}
                            </BlockStack>
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              Widget text (storefront)
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Product page copy. Fonts and colors: Appearance tab.
                            </Text>
                            <TextField
                              label="Widget heading (optional)"
                              name="widgetHeading"
                              value={widgetDisplay.widgetHeading}
                              onChange={(v) =>
                                patchWidgetDisplay({ widgetHeading: v })
                              }
                              autoComplete="off"
                              multiline={2}
                              placeholder="Empty = use theme block heading"
                            />
                            {!isVolumeTableOffer ? (
                              <Select
                                id="vd-widget-heading-align"
                                label="Widget heading alignment"
                                options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
                                value={widgetDisplay.widgetHeadingAlign}
                                onChange={(v) => {
                                  if (
                                    isVolumeDiscountWidgetHeaderTextAlign(v)
                                  ) {
                                    patchWidgetDisplay({
                                      widgetHeadingAlign: v,
                                    });
                                  }
                                }}
                              />
                            ) : (
                              <Text as="p" variant="bodySm" tone="subdued">
                                Title alignment is in{" "}
                                <Text as="span" fontWeight="semibold">
                                  Appearance
                                </Text>{" "}
                                →{" "}
                                <Text as="span" fontWeight="semibold">
                                  Title &amp; countdown
                                </Text>
                                .
                              </Text>
                            )}
                            <TextField
                              label="Footnote under button"
                              name="footnote"
                              value={widgetDisplay.footnote}
                              onChange={(v) =>
                                patchWidgetDisplay({ footnote: v })
                              }
                              autoComplete="off"
                              multiline={3}
                            />
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              Countdown timer
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Timer label and how long it runs. End = now + duration, stored in UTC. Pill colors: Appearance.
                            </Text>
                            <Checkbox
                              label="Show countdown"
                              checked={widgetDisplay.showCountdown}
                              onChange={(checked) =>
                                patchWidgetDisplay({
                                  showCountdown: checked,
                                })
                              }
                            />
                            <TextField
                              label="Timer label"
                              name="countdownLabel"
                              value={widgetDisplay.countdownLabel}
                              onChange={(v) =>
                                patchWidgetDisplay({ countdownLabel: v })
                              }
                              autoComplete="off"
                              multiline={2}
                              placeholder="Sale end in"
                              helpText="Beside the pill. Time rolls into days when ≥24h (e.g. 72h → 3d). Hides 0d, 0h, 0m. Minutes unit uses h/m/s under 24h."
                            />
                            <InlineStack gap="300" blockAlign="end" wrap>
                              <div
                                style={{
                                  flex: "1 1 5.5rem",
                                  minWidth: "4.5rem",
                                }}
                              >
                                <TextField
                                  label="Duration"
                                  type="number"
                                  name="countdownTimeAmount"
                                  min={1}
                                  autoComplete="off"
                                  value={String(widgetDisplay.countdownTimeAmount)}
                                  onChange={(v) => {
                                    const n = parseInt(
                                      String(v).replace(/\D/g, ""),
                                      10,
                                    );
                                    patchWidgetDisplay({
                                      countdownTimeAmount:
                                        Number.isFinite(n) && n >= 1
                                          ? Math.min(9999, n)
                                          : 1,
                                    });
                                  }}
                                />
                              </div>
                              <div
                                style={{
                                  flex: "1 1 10rem",
                                  minWidth: "8rem",
                                }}
                              >
                                <Select
                                  label="Unit"
                                  options={[...COUNTDOWN_TIME_UNIT_OPTIONS]}
                                  value={widgetDisplay.countdownTimeUnit}
                                  onChange={(v) => {
                                    if (
                                      isVolumeDiscountCountdownTimeUnit(v)
                                    ) {
                                      patchWidgetDisplay({
                                        countdownTimeUnit: v,
                                      });
                                    }
                                  }}
                                />
                              </div>
                            </InlineStack>
                            <InlineStack gap="300" blockAlign="center" wrap>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Changing duration or unit resets end from now.
                                Saved in UTC with the offer.
                              </Text>
                              {widgetDisplay.showCountdown ? (
                                <Button
                                  variant="plain"
                                  size="slim"
                                  onClick={handleResetCountdownTimer}
                                >
                                  Reset timer
                                </Button>
                              ) : null}
                            </InlineStack>
                            {!isVolumeTableOffer ? (
                              <>
                                <Select
                                  id="vd-widget-header-layout"
                                  label="Heading and timer layout"
                                  options={[...WIDGET_HEADER_LAYOUT_OPTIONS]}
                                  value={widgetDisplay.widgetHeaderLayout}
                                  onChange={(v) => {
                                    if (
                                      isVolumeDiscountWidgetHeaderLayout(v)
                                    ) {
                                      patchWidgetDisplay({
                                        widgetHeaderLayout: v,
                                      });
                                    }
                                  }}
                                />
                                <Checkbox
                                  label="Stack heading and timer on small screens"
                                  helpText="On: narrow phones show title and countdown stacked and centered. Off: keeps the same row layout as desktop (may wrap)."
                                  checked={widgetDisplay.widgetHeaderMobileStack}
                                  onChange={(checked) =>
                                    patchWidgetDisplay({
                                      widgetHeaderMobileStack: checked,
                                    })
                                  }
                                />
                                <Select
                                  id="vd-widget-countdown-align"
                                  label="Timer alignment"
                                  helpText="Label and pill move together."
                                  options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
                                  value={widgetDisplay.countdownAlign}
                                  onChange={(v) => {
                                    if (
                                      isVolumeDiscountWidgetHeaderTextAlign(v)
                                    ) {
                                      patchWidgetDisplay({ countdownAlign: v });
                                    }
                                  }}
                                />
                                <Checkbox
                                  label="Timer before heading"
                                  helpText="Row: timer left. Stacked: timer on top."
                                  checked={widgetDisplay.widgetHeaderSwapOrder}
                                  onChange={(checked) =>
                                    patchWidgetDisplay({
                                      widgetHeaderSwapOrder: checked,
                                    })
                                  }
                                />
                              </>
                            ) : null}
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="200">
                            <Text as="h2" variant="headingSm">
                              Theme setup
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Add the{" "}
                              <Text as="span" fontWeight="semibold">
                                {isVolumeTableOffer
                                  ? "Volume discount"
                                  : "Quantity breaks"}
                              </Text>{" "}
                              app block on the product template (Online Store →
                              Themes → Customize). If widget heading is empty, the
                              block title is used.
                            </Text>
                            {!isVolumeTableOffer ? (
                              <Text as="p" variant="bodySm" tone="subdued">
                                <Text as="span" fontWeight="semibold">
                                  Badge
                                </Text>{" "}
                                (Rule settings): tier field shows a pill; clear the
                                field to hide. New offers default to “Most Popular
                                ⚡” on tier 1.
                              </Text>
                            ) : (
                              <Text as="p" variant="bodySm" tone="subdued">
                                Volume discount uses a pricing table (quantity,
                                discount, price per item). Tier labels come from
                                Rule settings.
                              </Text>
                            )}
                            <Text as="p" variant="bodySm" tone="subdued">
                              Widget in editor but not live? Enable <Text as="span" fontWeight="semibold">Offrefy (global)</Text> under Theme settings → App embeds, then save.
                            </Text>
                          </BlockStack>
                        </Card>
                      </BlockStack>
                    ) : (
                      <BlockStack gap="400">
                        <Card padding="400">
                          <BlockStack gap="300">
                            <InlineStack
                              align="space-between"
                              blockAlign="center"
                              gap="300"
                              wrap
                            >
                              <Text as="h2" variant="headingSm">
                                Widget appearance (storefront)
                              </Text>
                              <Button
                                variant="tertiary"
                                onClick={() =>
                                  setWidgetDisplay(
                                    resetWidgetAppearanceForEditor(
                                      isVolumeTableOffer,
                                      initialCampaign,
                                      newOfferPreset,
                                    ),
                                  )
                                }
                              >
                                Reset styles
                              </Button>
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {isVolumeTableOffer ? (
                                <>
                                  Volume discount pricing table on the product page
                                  (stored as{" "}
                                  <Text as="span" fontWeight="semibold">
                                    widgetDisplay
                                  </Text>
                                  ). Customer-facing copy:{" "}
                                  <Text as="span" fontWeight="semibold">
                                    Display settings
                                  </Text>
                                  ; timer length:{" "}
                                  <Text as="span" fontWeight="semibold">
                                    Countdown timer
                                  </Text>
                                  ; header layout:{" "}
                                  <Text as="span" fontWeight="semibold">
                                    Title &amp; countdown
                                  </Text>
                                  .
                                </>
                              ) : (
                                <>
                                  Storefront widget look for this offer (one{" "}
                                  <Text as="span" fontWeight="semibold">
                                    widgetDisplay
                                  </Text>{" "}
                                  JSON). Widget copy:{" "}
                                  <Text as="span" fontWeight="semibold">
                                    Display settings
                                  </Text>{" "}
                                  → Widget text; countdown notice, timer length
                                  &amp; layout:{" "}
                                  <Text as="span" fontWeight="semibold">
                                    Countdown timer
                                  </Text>
                                  .
                                </>
                              )}
                            </Text>
                          </BlockStack>
                        </Card>

                        {isVolumeTableOffer ? (
                          <Card padding="400">
                            <BlockStack gap="400">
                              <BlockStack gap="200">
                                <Text as="h2" variant="headingSm">
                                  Title &amp; countdown
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Arranges the widget title and the countdown in
                                  the header. Layout = structure; alignment =
                                  left/center/right for each part.
                                </Text>
                              </BlockStack>

                              <BlockStack gap="300">
                                <Text as="h3" variant="headingSm">
                                  Layout
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Split = one row on desktop; stacked = title
                                  above countdown. Order and narrow‑screen
                                  behavior are separate from alignment.
                                </Text>
                                <Select
                                  id="vd-widget-header-layout"
                                  label="Heading and timer layout"
                                  helpText="Wide screens: how the title and countdown share the row or stack vertically."
                                  options={[
                                    ...WIDGET_HEADER_LAYOUT_OPTIONS_VOLUME_TABLE,
                                  ]}
                                  value={widgetDisplay.widgetHeaderLayout}
                                  onChange={(v) => {
                                    if (
                                      isVolumeDiscountWidgetHeaderLayout(v)
                                    ) {
                                      patchWidgetDisplay({
                                        widgetHeaderLayout: v,
                                      });
                                    }
                                  }}
                                />
                                <Checkbox
                                  label="Timer before heading"
                                  helpText="One row: countdown left of title. Stacked: countdown above title."
                                  checked={widgetDisplay.widgetHeaderSwapOrder}
                                  onChange={(checked) =>
                                    patchWidgetDisplay({
                                      widgetHeaderSwapOrder: checked,
                                    })
                                  }
                                />
                                <Checkbox
                                  label="Stack heading and timer on small screens"
                                  helpText="Narrow viewports: center title and countdown in a column. Off: same order as desktop (may wrap)."
                                  checked={widgetDisplay.widgetHeaderMobileStack}
                                  onChange={(checked) =>
                                    patchWidgetDisplay({
                                      widgetHeaderMobileStack: checked,
                                    })
                                  }
                                />
                              </BlockStack>

                              <Divider />

                              <BlockStack gap="300">
                                <Text as="h3" variant="headingSm">
                                  Alignment
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Horizontal position of the title and of the
                                  countdown (label + digits move together).
                                </Text>
                                <Select
                                  id="vd-widget-heading-align-volume"
                                  label="Widget heading alignment"
                                  helpText="Title in the header."
                                  options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
                                  value={widgetDisplay.widgetHeadingAlign}
                                  onChange={(v) => {
                                    if (
                                      isVolumeDiscountWidgetHeaderTextAlign(v)
                                    ) {
                                      patchWidgetDisplay({
                                        widgetHeadingAlign: v,
                                      });
                                    }
                                  }}
                                />
                                <Select
                                  id="vd-widget-countdown-align"
                                  label="Timer alignment"
                                  helpText="Countdown label and pill together."
                                  options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
                                  value={widgetDisplay.countdownAlign}
                                  onChange={(v) => {
                                    if (
                                      isVolumeDiscountWidgetHeaderTextAlign(v)
                                    ) {
                                      patchWidgetDisplay({
                                        countdownAlign: v,
                                      });
                                    }
                                  }}
                                />
                              </BlockStack>
                            </BlockStack>
                          </Card>
                        ) : null}

                        {isVolumeTableOffer ? (
                          <Card padding="400">
                            <BlockStack gap="300">
                              <Text as="h3" variant="headingSm">
                                Appearance templates
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Choose one of 10 table styles. Fine-tune colors and
                                type below; manual changes set the template to{" "}
                                <Text as="span" fontWeight="semibold">
                                  Custom
                                </Text>{" "}
                                in saved data.
                              </Text>
                              <div
                                className={createStyles.appearanceTemplateGrid}
                                aria-label="Volume discount appearance templates"
                              >
                                {VOLUME_TABLE_APPEARANCE_PRESETS.map((preset) => {
                                  const selected =
                                    widgetDisplay.appearanceTemplateId ===
                                    preset.id;
                                  return (
                                    <button
                                      key={preset.id}
                                      type="button"
                                      className={
                                        selected
                                          ? `${createStyles.appearanceTemplateCard} ${createStyles.appearanceTemplateCardSelected}`
                                          : createStyles.appearanceTemplateCard
                                      }
                                      onClick={() => {
                                        setWidgetDisplay(
                                          applyVolumeTableAppearancePreset(
                                            widgetDisplay,
                                            preset.id,
                                          ),
                                        );
                                      }}
                                    >
                                      <span
                                        className={
                                          createStyles.appearanceTemplateSwatch
                                        }
                                        style={{
                                          backgroundColor: preset.swatch,
                                        }}
                                        aria-hidden
                                      />
                                      <span
                                        className={
                                          createStyles.appearanceTemplateLabel
                                        }
                                      >
                                        {preset.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </BlockStack>
                          </Card>
                        ) : (
                          <Card padding="400">
                            <BlockStack gap="300">
                              <Text as="h3" variant="headingSm">
                                Appearance templates
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Pick a look; you can still fine-tune colors and
                                layout below. Manual tweaks set the picker to{" "}
                                <Text as="span" fontWeight="semibold">
                                  Custom
                                </Text>
                                .
                              </Text>
                              <div
                                className={createStyles.appearanceTemplateGrid}
                                aria-label="Widget appearance templates"
                              >
                                {VOLUME_DISCOUNT_APPEARANCE_PRESETS.map(
                                  (preset) => {
                                    const selected =
                                      widgetDisplay.appearanceTemplateId ===
                                      preset.id;
                                    return (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        className={
                                          selected
                                            ? `${createStyles.appearanceTemplateCard} ${createStyles.appearanceTemplateCardSelected}`
                                            : createStyles.appearanceTemplateCard
                                        }
                                        onClick={() => {
                                          setWidgetDisplay(
                                            applyVolumeDiscountAppearancePreset(
                                              widgetDisplay,
                                              preset.id,
                                            ),
                                          );
                                        }}
                                      >
                                        <span
                                          className={
                                            createStyles.appearanceTemplateSwatch
                                          }
                                          style={{
                                            backgroundColor: preset.swatch,
                                          }}
                                          aria-hidden
                                        />
                                        <span
                                          className={
                                            createStyles.appearanceTemplateLabel
                                          }
                                        >
                                          {preset.label}
                                        </span>
                                      </button>
                                    );
                                  },
                                )}
                                <button
                                  type="button"
                                  className={
                                    widgetDisplay.appearanceTemplateId ===
                                    "custom"
                                      ? `${createStyles.appearanceTemplateCard} ${createStyles.appearanceTemplateCardSelected}`
                                      : createStyles.appearanceTemplateCard
                                  }
                                  onClick={() =>
                                    patchWidgetDisplay({
                                      appearanceTemplateId: "custom",
                                    })
                                  }
                                >
                                  <span
                                    className={
                                      createStyles.appearanceTemplateSwatchCustom
                                    }
                                    aria-hidden
                                  />
                                  <span
                                    className={
                                      createStyles.appearanceTemplateLabel
                                    }
                                  >
                                    Custom
                                  </span>
                                </button>
                              </div>
                            </BlockStack>
                          </Card>
                        )}

                        <Card padding="400">
                          <BlockStack gap="400">
                              <Text as="h3" variant="headingSm">
                                Type
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {isVolumeTableOffer ? (
                                  <>
                                    Font family follows your live theme (body / heading
                                    CSS variables). Font sizes below apply to the volume
                                    table, title row, button, countdown, and footnote —
                                    not tier cards. To change families, use Theme
                                    settings → Typography or{" "}
                                    <Text as="span" fontWeight="semibold">
                                      Custom CSS
                                    </Text>{" "}
                                    on this offer.
                                  </>
                                ) : (
                                  <>
                                    Font family follows your live theme: body text uses the
                                    theme body font (CSS variables such as{" "}
                                    <Text as="span" fontWeight="semibold">
                                      --font-body-family
                                    </Text>{" "}
                                    or{" "}
                                    <Text as="span" fontWeight="semibold">
                                      --font-body--family
                                    </Text>
                                    ); widget titles use the heading font when the theme
                                    exposes it. To change fonts, use Theme settings →
                                    Typography (or Custom CSS on this offer). Commonly used
                                    web fonts include Inter, Roboto, Open Sans, Lato,
                                    Montserrat, Poppins, Work Sans, Source Sans 3, Nunito,
                                    and DM Sans.
                                  </>
                                )}
                              </Text>
                              <Select
                                id="vd-widget-font-scale"
                                label="Size preset"
                                options={WIDGET_FONT_SCALE_OPTIONS}
                                value={widgetDisplay.fontScale}
                                onChange={(v) => {
                                  if (
                                    v === "compact" ||
                                    v === "default" ||
                                    v === "comfortable"
                                  ) {
                                    patchWidgetDisplay({
                                      fontScale: v,
                                      ...widgetDisplayFontSizesFromScale(v),
                                    });
                                  }
                                }}
                              />
                              <InlineStack gap="200" blockAlign="center">
                                <Button
                                  size="slim"
                                  onClick={() =>
                                    patchWidgetDisplay(
                                      widgetDisplayFontSizesFromScale(
                                        widgetDisplay.fontScale,
                                      ),
                                    )
                                  }
                                >
                                  Reset sizes to preset
                                </Button>
                              </InlineStack>
                              <RangeSlider
                                id="vd-widget-font-scale-percent"
                                label="Overall text scale"
                                helpText="Applies to all sizes below."
                                min={FONT_SIZE_SCALE_PERCENT_MIN}
                                max={FONT_SIZE_SCALE_PERCENT_MAX}
                                step={1}
                                value={widgetDisplay.fontSizeScalePercent}
                                output
                                suffix="%"
                                onChange={(value) => {
                                  if (typeof value === "number") {
                                    patchWidgetDisplay({
                                      fontSizeScalePercent:
                                        clampFontSizeScalePercent(value),
                                    });
                                  }
                                }}
                              />
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                              <Text as="h3" variant="headingSm">
                                Font size (px)
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {isVolumeTableOffer
                                  ? `${WIDGET_FONT_PX_MIN}–${WIDGET_FONT_PX_MAX} px. Only roles used by the volume table widget are listed. Countdown sizes appear when Show countdown is on (Display settings).`
                                  : `${WIDGET_FONT_PX_MIN}–${WIDGET_FONT_PX_MAX} px per role.`}
                              </Text>
                            <div className={createStyles.widgetFontSizeGrid}>
                              {appearanceFontSizeFields.map((row) => (
                                <div
                                  key={row.key}
                                  className={createStyles.widgetFontSizeRow}
                                >
                                  <Text as="p" variant="bodySm">
                                    {row.label}
                                  </Text>
                                  <div
                                    className={createStyles.widgetFontSizeControlRow}
                                  >
                                    <div
                                      className={createStyles.widgetFontSizeSliderWrap}
                                    >
                                      <RangeSlider
                                        id={`vd-widget-font-${row.key}`}
                                        label={row.label}
                                        labelHidden
                                        min={WIDGET_FONT_PX_MIN}
                                        max={WIDGET_FONT_PX_MAX}
                                        step={1}
                                        value={widgetDisplay[row.key]}
                                        onChange={(value) => {
                                          if (typeof value === "number") {
                                            patchWidgetDisplay({
                                              [row.key]:
                                                clampWidgetFontPx(value),
                                            } as Partial<VolumeDiscountWidgetDisplay>);
                                          }
                                        }}
                                      />
                                    </div>
                                    <Text
                                      as="span"
                                      variant="bodySm"
                                      tone="subdued"
                                    >
                                      px
                                    </Text>
                                    <div
                                      className={
                                        createStyles.widgetFontSizeInputWrap
                                      }
                                    >
                                      <TextField
                                        id={`vd-widget-font-field-${row.key}`}
                                        label={row.label}
                                        labelHidden
                                        type="number"
                                        autoComplete="off"
                                        min={WIDGET_FONT_PX_MIN}
                                        max={WIDGET_FONT_PX_MAX}
                                        value={String(widgetDisplay[row.key])}
                                        suffix="px"
                                        onChange={(v) => {
                                          if (v === "") return;
                                          const n = parseInt(v, 10);
                                          if (!Number.isNaN(n)) {
                                            patchWidgetDisplay({
                                              [row.key]: clampWidgetFontPx(n),
                                            } as Partial<VolumeDiscountWidgetDisplay>);
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                              <Text as="h3" variant="headingSm">
                                Font weights
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {isVolumeTableOffer
                                  ? "CSS numeric weights (100–900). Strong: widget title, table header, quantity label, price column, main button. Accent: countdown pill. Normal: footnote and muted helper text."
                                  : "CSS numeric weights (100–900). Strong = title, tier label, price, CTA; accent = badge, countdown pill, qty buttons; body = subtext and “You save”; normal = footnote, compare-at, muted lines."}
                              </Text>
                              <div className={createStyles.widgetFontWeightGrid}>
                                <Select
                                  id="vd-widget-fw-strong"
                                  label="Strong"
                                  options={WIDGET_FONT_WEIGHT_SELECT_OPTIONS}
                                  value={String(widgetDisplay.fontWeightStrong)}
                                  onChange={(v) => {
                                    const n = parseInt(String(v), 10);
                                    if (!Number.isNaN(n)) {
                                      patchWidgetDisplay({
                                        fontWeightStrong: clampWidgetFontWeight(n),
                                      });
                                    }
                                  }}
                                />
                                <Select
                                  id="vd-widget-fw-accent"
                                  label="Accent"
                                  options={WIDGET_FONT_WEIGHT_SELECT_OPTIONS}
                                  value={String(widgetDisplay.fontWeightAccent)}
                                  onChange={(v) => {
                                    const n = parseInt(String(v), 10);
                                    if (!Number.isNaN(n)) {
                                      patchWidgetDisplay({
                                        fontWeightAccent: clampWidgetFontWeight(n),
                                      });
                                    }
                                  }}
                                />
                                {!isVolumeTableOffer ? (
                                  <Select
                                    id="vd-widget-fw-body"
                                    label="Body"
                                    options={WIDGET_FONT_WEIGHT_SELECT_OPTIONS}
                                    value={String(widgetDisplay.fontWeightBody)}
                                    onChange={(v) => {
                                      const n = parseInt(String(v), 10);
                                      if (!Number.isNaN(n)) {
                                        patchWidgetDisplay({
                                          fontWeightBody: clampWidgetFontWeight(n),
                                        });
                                      }
                                    }}
                                  />
                                ) : null}
                                <Select
                                  id="vd-widget-fw-normal"
                                  label="Normal"
                                  options={WIDGET_FONT_WEIGHT_SELECT_OPTIONS}
                                  value={String(widgetDisplay.fontWeightNormal)}
                                  onChange={(v) => {
                                    const n = parseInt(String(v), 10);
                                    if (!Number.isNaN(n)) {
                                      patchWidgetDisplay({
                                        fontWeightNormal: clampWidgetFontWeight(n),
                                      });
                                    }
                                  }}
                                />
                              </div>
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="400">
                              <Text as="h3" variant="headingSm">
                                Layout
                              </Text>
                              {isVolumeTableOffer ? (
                                <>
                                  <RangeSlider
                                    id="vd-widget-card-border-radius"
                                    label="Table corner radius"
                                    helpText="Corners of the pricing table container."
                                    min={WIDGET_BORDER_RADIUS_PX_MIN}
                                    max={WIDGET_BORDER_RADIUS_PX_MAX}
                                    step={1}
                                    value={widgetDisplay.cardBorderRadiusPx}
                                    output
                                    suffix="px"
                                    onChange={(value) => {
                                      if (typeof value === "number") {
                                        patchWidgetDisplay({
                                          cardBorderRadiusPx:
                                            clampWidgetBorderRadiusPx(value),
                                        });
                                      }
                                    }}
                                  />
                                  <RangeSlider
                                    id="vd-widget-volume-table-cell-pad"
                                    label="Table row height"
                                    helpText="Vertical padding inside each table cell (header and rows)."
                                    min={WIDGET_VOLUME_TABLE_CELL_PADDING_PX_MIN}
                                    max={WIDGET_VOLUME_TABLE_CELL_PADDING_PX_MAX}
                                    step={1}
                                    value={widgetDisplay.volumeTableCellPaddingPx}
                                    output
                                    suffix="px"
                                    onChange={(value) => {
                                      if (typeof value === "number") {
                                        patchWidgetDisplay({
                                          volumeTableCellPaddingPx:
                                            clampVolumeTableCellPaddingPx(value),
                                        });
                                      }
                                    }}
                                  />
                                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                                    Table columns
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Text alignment and left/right padding inside each
                                    column (applies to header and body cells).
                                  </Text>
                                  <BlockStack gap="300">
                                    <Text as="p" variant="bodySm" fontWeight="semibold">
                                      Quantity
                                    </Text>
                                    <Select
                                      id="vd-vt-col-qty-align"
                                      label="Text align"
                                      options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
                                      value={widgetDisplay.volumeTableQuantityColumnAlign}
                                      onChange={(v) => {
                                        if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                                          patchWidgetDisplay({
                                            volumeTableQuantityColumnAlign: v,
                                          });
                                        }
                                      }}
                                    />
                                    <RangeSlider
                                      id="vd-vt-col-qty-pad-start"
                                      label="Left padding"
                                      min={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN}
                                      max={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX}
                                      step={1}
                                      value={
                                        widgetDisplay.volumeTableQuantityColPaddingStartPx
                                      }
                                      output
                                      suffix="px"
                                      onChange={(value) => {
                                        if (typeof value === "number") {
                                          patchWidgetDisplay({
                                            volumeTableQuantityColPaddingStartPx:
                                              clampVolumeTableColInlinePaddingPx(value),
                                          });
                                        }
                                      }}
                                    />
                                    <RangeSlider
                                      id="vd-vt-col-qty-pad-end"
                                      label="Right padding"
                                      min={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN}
                                      max={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX}
                                      step={1}
                                      value={
                                        widgetDisplay.volumeTableQuantityColPaddingEndPx
                                      }
                                      output
                                      suffix="px"
                                      onChange={(value) => {
                                        if (typeof value === "number") {
                                          patchWidgetDisplay({
                                            volumeTableQuantityColPaddingEndPx:
                                              clampVolumeTableColInlinePaddingPx(value),
                                          });
                                        }
                                      }}
                                    />
                                  </BlockStack>
                                  <BlockStack gap="300">
                                    <Text as="p" variant="bodySm" fontWeight="semibold">
                                      Discount
                                    </Text>
                                    <Select
                                      id="vd-vt-col-discount-align"
                                      label="Text align"
                                      options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
                                      value={widgetDisplay.volumeTableDiscountColumnAlign}
                                      onChange={(v) => {
                                        if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                                          patchWidgetDisplay({
                                            volumeTableDiscountColumnAlign: v,
                                          });
                                        }
                                      }}
                                    />
                                    <RangeSlider
                                      id="vd-vt-col-discount-pad-start"
                                      label="Left padding"
                                      min={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN}
                                      max={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX}
                                      step={1}
                                      value={
                                        widgetDisplay.volumeTableDiscountColPaddingStartPx
                                      }
                                      output
                                      suffix="px"
                                      onChange={(value) => {
                                        if (typeof value === "number") {
                                          patchWidgetDisplay({
                                            volumeTableDiscountColPaddingStartPx:
                                              clampVolumeTableColInlinePaddingPx(value),
                                          });
                                        }
                                      }}
                                    />
                                    <RangeSlider
                                      id="vd-vt-col-discount-pad-end"
                                      label="Right padding"
                                      min={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN}
                                      max={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX}
                                      step={1}
                                      value={
                                        widgetDisplay.volumeTableDiscountColPaddingEndPx
                                      }
                                      output
                                      suffix="px"
                                      onChange={(value) => {
                                        if (typeof value === "number") {
                                          patchWidgetDisplay({
                                            volumeTableDiscountColPaddingEndPx:
                                              clampVolumeTableColInlinePaddingPx(value),
                                          });
                                        }
                                      }}
                                    />
                                  </BlockStack>
                                  <BlockStack gap="300">
                                    <Text as="p" variant="bodySm" fontWeight="semibold">
                                      Price per item
                                    </Text>
                                    <Select
                                      id="vd-vt-col-price-align"
                                      label="Text align"
                                      options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
                                      value={widgetDisplay.volumeTablePriceColumnAlign}
                                      onChange={(v) => {
                                        if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                                          patchWidgetDisplay({
                                            volumeTablePriceColumnAlign: v,
                                          });
                                        }
                                      }}
                                    />
                                    <RangeSlider
                                      id="vd-vt-col-price-pad-start"
                                      label="Left padding"
                                      min={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN}
                                      max={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX}
                                      step={1}
                                      value={widgetDisplay.volumeTablePriceColPaddingStartPx}
                                      output
                                      suffix="px"
                                      onChange={(value) => {
                                        if (typeof value === "number") {
                                          patchWidgetDisplay({
                                            volumeTablePriceColPaddingStartPx:
                                              clampVolumeTableColInlinePaddingPx(value),
                                          });
                                        }
                                      }}
                                    />
                                    <RangeSlider
                                      id="vd-vt-col-price-pad-end"
                                      label="Right padding"
                                      min={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MIN}
                                      max={WIDGET_VOLUME_TABLE_COL_INLINE_PADDING_PX_MAX}
                                      step={1}
                                      value={widgetDisplay.volumeTablePriceColPaddingEndPx}
                                      output
                                      suffix="px"
                                      onChange={(value) => {
                                        if (typeof value === "number") {
                                          patchWidgetDisplay({
                                            volumeTablePriceColPaddingEndPx:
                                              clampVolumeTableColInlinePaddingPx(value),
                                          });
                                        }
                                      }}
                                    />
                                  </BlockStack>
                                  <RangeSlider
                                    id="vd-widget-cta-border-radius"
                                    label="Main button radius"
                                    helpText="Primary button under the table (e.g. Add to cart)."
                                    min={WIDGET_BORDER_RADIUS_PX_MIN}
                                    max={WIDGET_BORDER_RADIUS_PX_MAX}
                                    step={1}
                                    value={widgetDisplay.buttonBorderRadiusPx}
                                    output
                                    suffix="px"
                                    onChange={(value) => {
                                      if (typeof value === "number") {
                                        patchWidgetDisplay({
                                          buttonBorderRadiusPx:
                                            clampWidgetBorderRadiusPx(value),
                                        });
                                      }
                                    }}
                                  />
                                </>
                              ) : (
                                <>
                                  <Select
                                    id="vd-badge-position"
                                    label="Badge position"
                                    helpText="Badge text: Rule settings → Discount rules."
                                    options={[...BADGE_POSITION_OPTIONS]}
                                    value={widgetDisplay.badgePosition}
                                    onChange={(v) => {
                                      if (isVolumeDiscountBadgePosition(v)) {
                                        patchWidgetDisplay({ badgePosition: v });
                                      }
                                    }}
                                  />
                                  <RangeSlider
                                    id="vd-badge-size-scale"
                                    label="Badge size"
                                    helpText="Scales tier badge text and padding. 100% matches the “Badge” font size (Appearance) × global text scale."
                                    min={BADGE_SIZE_SCALE_PERCENT_MIN}
                                    max={BADGE_SIZE_SCALE_PERCENT_MAX}
                                    step={1}
                                    value={widgetDisplay.badgeSizeScalePercent}
                                    output
                                    suffix="%"
                                    onChange={(value) => {
                                      if (typeof value === "number") {
                                        patchWidgetDisplay({
                                          badgeSizeScalePercent:
                                            clampBadgeSizeScalePercent(value),
                                        });
                                      }
                                    }}
                                  />
                                  <RangeSlider
                                    id="vd-widget-card-border-radius"
                                    label="Tier card radius"
                                    helpText="Corner radius for each tier row."
                                    min={WIDGET_BORDER_RADIUS_PX_MIN}
                                    max={WIDGET_BORDER_RADIUS_PX_MAX}
                                    step={1}
                                    value={widgetDisplay.cardBorderRadiusPx}
                                    output
                                    suffix="px"
                                    onChange={(value) => {
                                      if (typeof value === "number") {
                                        patchWidgetDisplay({
                                          cardBorderRadiusPx:
                                            clampWidgetBorderRadiusPx(value),
                                        });
                                      }
                                    }}
                                  />
                                  <RangeSlider
                                    id="vd-widget-cta-border-radius"
                                    label="Main CTA radius"
                                    helpText="Primary button only (“Grab this deal”)."
                                    min={WIDGET_BORDER_RADIUS_PX_MIN}
                                    max={WIDGET_BORDER_RADIUS_PX_MAX}
                                    step={1}
                                    value={widgetDisplay.buttonBorderRadiusPx}
                                    output
                                    suffix="px"
                                    onChange={(value) => {
                                      if (typeof value === "number") {
                                        patchWidgetDisplay({
                                          buttonBorderRadiusPx:
                                            clampWidgetBorderRadiusPx(value),
                                        });
                                      }
                                    }}
                                  />
                                  <RangeSlider
                                    id="vd-widget-control-border-radius"
                                    label="Qty & + Add radius"
                                    helpText="Expanded tier row: variant menu, quantity stepper, and “+ Add” button."
                                    min={WIDGET_BORDER_RADIUS_PX_MIN}
                                    max={WIDGET_BORDER_RADIUS_PX_MAX}
                                    step={1}
                                    value={widgetDisplay.controlBorderRadiusPx}
                                    output
                                    suffix="px"
                                    onChange={(value) => {
                                      if (typeof value === "number") {
                                        patchWidgetDisplay({
                                          controlBorderRadiusPx:
                                            clampWidgetBorderRadiusPx(value),
                                        });
                                      }
                                    }}
                                  />
                                  <RangeSlider
                                    id="vd-widget-radio-size"
                                    label="Tier radio size"
                                    helpText="Diameter of the circle next to each tier option."
                                    min={WIDGET_RADIO_BUTTON_SIZE_PX_MIN}
                                    max={WIDGET_RADIO_BUTTON_SIZE_PX_MAX}
                                    step={1}
                                    value={widgetDisplay.radioButtonSizePx}
                                    output
                                    suffix="px"
                                    onChange={(value) => {
                                      if (typeof value === "number") {
                                        patchWidgetDisplay({
                                          radioButtonSizePx:
                                            clampRadioButtonSizePx(value),
                                        });
                                      }
                                    }}
                                  />
                                </>
                              )}
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="400">
                              <Text as="h3" variant="headingSm">
                                Colors
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Hex or rgba; swatch opens the picker.
                              </Text>
                            <InlineStack gap="300" wrap>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label="Primary"
                                  value={widgetDisplay.primaryColor}
                                  onChange={(hex) =>
                                    patchWidgetDisplay({ primaryColor: hex })
                                  }
                                />
                              </div>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label="Primary hover"
                                  value={widgetDisplay.primaryHoverColor}
                                  onChange={(hex) =>
                                    patchWidgetDisplay({
                                      primaryHoverColor: hex,
                                    })
                                  }
                                />
                              </div>
                            </InlineStack>
                            {!isVolumeTableOffer ? (
                              <InlineStack gap="300" wrap>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                  <WidgetDisplayColorField
                                    label="Badge background"
                                    value={widgetDisplay.badgeBackgroundColor}
                                    onChange={(hex) =>
                                      patchWidgetDisplay({
                                        badgeBackgroundColor: hex,
                                      })
                                    }
                                  />
                                </div>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                  <WidgetDisplayColorField
                                    label="Badge text"
                                    value={widgetDisplay.badgeTextColor}
                                    onChange={(hex) =>
                                      patchWidgetDisplay({
                                        badgeTextColor: hex,
                                      })
                                    }
                                  />
                                </div>
                              </InlineStack>
                            ) : null}
                            <InlineStack gap="300" wrap>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label={
                                    isVolumeTableOffer
                                      ? "Selected row background"
                                      : "Selected tier background"
                                  }
                                  value={widgetDisplay.selectedBgColor}
                                  onChange={(hex) =>
                                    patchWidgetDisplay({
                                      selectedBgColor: hex,
                                    })
                                  }
                                />
                              </div>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label={
                                    isVolumeTableOffer
                                      ? "Table border"
                                      : "Card border (unselected)"
                                  }
                                  value={widgetDisplay.cardBorderColor}
                                  onChange={(hex) =>
                                    patchWidgetDisplay({
                                      cardBorderColor: hex,
                                    })
                                  }
                                />
                              </div>
                            </InlineStack>
                            {!isVolumeTableOffer ? (
                              <InlineStack gap="300" wrap>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                  <WidgetDisplayColorField
                                    label="Radio border (unselected)"
                                    value={widgetDisplay.radioButtonBorderColor}
                                    onChange={(hex) =>
                                      patchWidgetDisplay({
                                        radioButtonBorderColor: hex,
                                      })
                                    }
                                  />
                                </div>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                  <WidgetDisplayColorField
                                    label="Radio accent (selected)"
                                    value={widgetDisplay.radioButtonAccentColor}
                                    onChange={(hex) =>
                                      patchWidgetDisplay({
                                        radioButtonAccentColor: hex,
                                      })
                                    }
                                  />
                                </div>
                              </InlineStack>
                            ) : null}
                            <InlineStack gap="300" wrap>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label="Countdown pill background"
                                  value={widgetDisplay.countdownBgColor}
                                  onChange={(hex) =>
                                    patchWidgetDisplay({
                                      countdownBgColor: hex,
                                    })
                                  }
                                />
                              </div>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label="Countdown pill text"
                                  value={widgetDisplay.countdownTextColor}
                                  onChange={(hex) =>
                                    patchWidgetDisplay({
                                      countdownTextColor: hex,
                                    })
                                  }
                                />
                              </div>
                            </InlineStack>
                            {isVolumeTableOffer ? (
                              <InlineStack gap="300" wrap>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                  <WidgetDisplayColorField
                                    label="Discount column (header & %)"
                                    value={widgetDisplay.volumeTableDiscountColor}
                                    onChange={(hex) =>
                                      patchWidgetDisplay({
                                        volumeTableDiscountColor: hex,
                                      })
                                    }
                                  />
                                </div>
                              </InlineStack>
                            ) : null}
                            {!isVolumeTableOffer ? (
                              <InlineStack gap="300" wrap>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                  <WidgetDisplayColorField
                                    label={'"You save" line color'}
                                    value={widgetDisplay.savingsColor}
                                    onChange={(hex) =>
                                      patchWidgetDisplay({ savingsColor: hex })
                                    }
                                  />
                                </div>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                  <WidgetDisplayColorField
                                    label="Option subtext color"
                                    value={widgetDisplay.optionSubtextColor}
                                    onChange={(hex) =>
                                      patchWidgetDisplay({
                                        optionSubtextColor: hex,
                                      })
                                    }
                                  />
                                </div>
                              </InlineStack>
                            ) : null}
                            <InlineStack gap="300" wrap>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label="Muted text"
                                  value={widgetDisplay.mutedColor}
                                  onChange={(hex) =>
                                    patchWidgetDisplay({ mutedColor: hex })
                                  }
                                />
                              </div>
                            </InlineStack>
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h3" variant="headingSm">
                              Custom CSS
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Extra rules injected on the storefront root (
                              <Text as="span" fontWeight="semibold">
                                .volume-discount-embed
                              </Text>
                              ). Admin preview:{" "}
                              <Text as="span" fontWeight="semibold">
                                .vd-admin-qb-preview
                              </Text>{" "}
                              {isVolumeTableOffer
                                ? "(volume table preview)."
                                : "(tier card preview)."}{" "}
                              Field:{" "}
                              <Text as="span" fontWeight="semibold">
                                customCss
                              </Text>
                              .
                            </Text>
                            <TextField
                              label="CSS"
                              value={widgetDisplay.customCss}
                              onChange={(v) =>
                                patchWidgetDisplay({
                                  customCss:
                                    v.length > WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS
                                      ? v.slice(
                                          0,
                                          WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS,
                                        )
                                      : v,
                                })
                              }
                              multiline={10}
                              autoComplete="off"
                              monospaced
                              helpText={`Max ${WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS.toLocaleString()} characters.`}
                            />
                          </BlockStack>
                        </Card>
                      </BlockStack>
                    )}
                  </Tabs>
                </Box>
              </div>
              <aside className={createStyles.previewColumn}>
                <BlockStack gap="400">
                  <Card padding="400">
                    <InlineStack
                      align="space-between"
                      blockAlign="center"
                      gap="300"
                      wrap
                    >
                      <InlineStack gap="200" blockAlign="center" wrap>
                        <Text as="h3" variant="headingSm">
                          Campaign status
                        </Text>
                        <Badge
                          tone={previewCampaignOn ? "success" : "info"}
                        >
                          {previewCampaignOn ? "On" : "Draft"}
                        </Badge>
                      </InlineStack>
                      <Button
                        variant="tertiary"
                        onClick={() => setPreviewCampaignOn((v) => !v)}
                      >
                        {previewCampaignOn ? "Turn off" : "Turn on"}
                      </Button>
                    </InlineStack>
                  </Card>

                  <Card padding="400">
                    <BlockStack gap="400">
                      <InlineStack
                        align="space-between"
                        blockAlign="start"
                        gap="300"
                        wrap
                      >
                        <Text as="h2" variant="headingMd">
                          Product Page - Preview
                        </Text>
                        <ButtonGroup variant="segmented" noWrap>
                          <Button
                            pressed={previewDevice === "desktop"}
                            icon={DesktopIcon}
                            accessibilityLabel="Desktop preview"
                            onClick={() => setPreviewDevice("desktop")}
                          />
                          <Button
                            pressed={previewDevice === "mobile"}
                            icon={MobileIcon}
                            accessibilityLabel="Mobile preview"
                            onClick={() => setPreviewDevice("mobile")}
                          />
                        </ButtonGroup>
                      </InlineStack>
                      <Text as="p" variant="headingLg" alignment="center">
                        {widgetDisplay.widgetPresentation === "volume_table"
                          ? "Volume discount"
                          : "Quantity breaks"}
                      </Text>
                      <Box
                        padding="0"
                        background="bg-surface-secondary"
                        borderRadius="200"
                        overflowX="hidden"
                        opacity={previewCampaignOn ? undefined : "0.5"}
                      >
                        <div
                          className={
                            previewDevice === "mobile"
                              ? `${createStyles.previewViewport} ${createStyles.previewViewportMobile}`
                              : `${createStyles.previewViewport} ${createStyles.previewViewportDesktop}`
                          }
                          style={
                            previewCampaignOn
                              ? undefined
                              : { pointerEvents: "none" as const }
                          }
                        >
                          <Box
                            padding={{ xs: "300", sm: "400" }}
                            background="bg-surface"
                          >
                            <QuantityBreaksTailwindPreview
                              rows={productPagePreviewRows}
                              currencySymbol="$"
                              display={widgetDisplay}
                              previewDevice={previewDevice}
                              countdownPreviewNonce={countdownPreviewNonce}
                              countdownEndsAtIso={
                                countdownEndsAtLocal.trim()
                                  ? datetimeLocalToIsoUtc(countdownEndsAtLocal)
                                  : null
                              }
                              countdownStartsAtIso={null}
                            />
                          </Box>
                        </div>
                      </Box>
                      <Text as="p" variant="bodyXs" tone="subdued">
                        Live preview uses Display + Appearance settings and a
                        sample $98 unit price.
                      </Text>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </aside>
            </div>
          </s-box>
        </s-stack>
        </div>
      </s-stack>
    </s-page>
  );
}
