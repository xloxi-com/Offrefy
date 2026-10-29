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
  FormLayout,
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
  AutomationIcon,
  RedoIcon,
  ResetIcon,
  SearchIcon,
  UndoIcon,
} from "@shopify/polaris-icons";
import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useFetcher } from "react-router";

import { useAdminI18n } from "./AdminI18nProvider";
import type { AdminUiMessageKey } from "../utils/adminUiMessages";
import { AdminLanguageDropdown } from "./AdminLanguageDropdown";
import { CampaignStatusScheduleCard } from "./CampaignStatusScheduleCard";
import { WidgetHeaderAlignFields } from "./WidgetHeaderAlignFields";
import { PlanUpgradeBanner, PlanUpgradeHint } from "./PlanUpgradeBanner";
import { PlanUpgradeBadge } from "./PlanUpgradeBadge";
import { WidgetDisplayColorField } from "./WidgetDisplayColorField";
import { AppearanceTemplateCategoryTabs } from "./AppearanceTemplateCategoryTabs";
import { AppearanceTemplateGrid } from "./AppearanceTemplateGrid";
import {
  isWidgetDisplayAppearanceAbovePlan,
  isAppearancePresetAllowedForTier,
  isSeasonalAppearanceCategory,
} from "../utils/appearanceTemplateAccess";
import {
  planCapabilities as defaultPlanCapabilities,
  type PlanCapabilities,
} from "../utils/pricingPlans";
import {
  emptyTierCopyFields,
  packCampaignTranslationBlob,
  resolveCampaignEnglishSourceForAutoTranslate,
  sparsifyStorefrontTranslations,
  translationPresetForLanguage,
  type SparseStorefrontTranslationsMap,
  type StorefrontTranslationFields,
  type StorefrontTranslationsMap,
  type TierCopyFields,
  type TierCopyTranslationsMap,
} from "../utils/storefrontTranslations";

type OfferEditorShopLanguage = {
  label: string;
  value: string;
  locale?: string;
  primary?: boolean;
};

const FALLBACK_OFFER_SHOP_LANGUAGES: OfferEditorShopLanguage[] = [
  {
    label: "English (EN) — Primary",
    value: "en",
    locale: "en",
    primary: true,
  },
];
import createStyles from "../styles/volume-discount-create.module.css";
import { buyLabelsForQuantityTiers } from "../utils/buyLabelsForQuantityTiers";
import {
  countdownDatetimeLocalFromNow,
  datetimeLocalToIsoUtc,
  formatDatetimeLocalDisplay,
  isoToDatetimeLocalValue,
  parseOptionalIsoDate,
} from "../utils/countdownTimes";
import { formatShopTimezoneDisplay } from "../utils/shopTimezone";
import {
  isCampaignScheduleExpired,
  isCampaignSchedulePendingStart,
  resolveCampaignStatusFromSchedule,
} from "../utils/campaignScheduleStatus";
import { statusBadgeTone, statusLabel } from "../utils/offers-display";
import {
  BADGE_DESIGN_OPTIONS,
  BADGE_POSITION_OPTIONS,
  BADGE_SIZE_SCALE_PERCENT_MAX,
  BADGE_SIZE_SCALE_PERCENT_MIN,
  appearanceCategoryForPresetId,
  appearancePresetsForCategory,
  clampBadgeSizeScalePercent,
  isVolumeDiscountBadgeDesign,
  isVolumeDiscountBadgePosition,
  isVolumeDiscountWidgetHeaderTextAlign,
  WIDGET_HEADER_TEXT_ALIGN_OPTIONS,
  clampFontSizeScalePercent,
  clampRadioButtonSizePx,
  clampVolumeTableCellPaddingPx,
  clampVolumeTableColInlinePaddingPx,
  clampWidgetBorderRadiusPx,
  clampWidgetFontPx,
  clampWidgetFontWeight,
  CTA_BUTTON_ACTION_OPTIONS,
  applyVolumeTableAppearancePreset,
  DEFAULT_WIDGET_DISPLAY,
  FONT_SIZE_SCALE_PERCENT_MAX,
  FONT_SIZE_SCALE_PERCENT_MIN,
  normalizeVolumeDiscountWidgetDisplay,
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
  type AppearanceTemplateCategory,
  type VolumeDiscountBadgeDesign,
  type VolumeDiscountBadgePosition,
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

const QuantityBreaksTailwindPreview = lazy(() =>
  import("./QuantityBreaksTailwindPreview").then((m) => ({
    default: m.QuantityBreaksTailwindPreview,
  })),
);

function PreviewPanelFallback() {
  return (
    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
      <Text as="p" tone="subdued">
        Loading preview…
      </Text>
    </Box>
  );
}

/** Cart & checkout label — empty uses Function default badge (e.g. `13% OFF`). */
const DEFAULT_VOLUME_DISCOUNT_DISPLAY_NAME = "";

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
  /** When true, cart qty must be an exact multiple of Buy from for this tier. */
  multiples: boolean;
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
  multiples: false,
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
  shopTimezone: string,
): string {
  const fromStored = isoToDatetimeLocalValue(
    initialCampaign?.countdownEndsAt ?? null,
    shopTimezone,
  );
  if (fromStored.trim() !== "") return fromStored;
  const wd = initialCampaign
    ? normalizeVolumeDiscountWidgetDisplay(initialCampaign.widgetDisplay ?? {})
    : initialWidgetDisplayForNewCampaign(newOfferPreset);
  if (!wd.showCountdown) return "";
  return countdownDatetimeLocalFromNow(
    wd.countdownTimeAmount,
    wd.countdownTimeUnit,
    shopTimezone,
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

const CAMPAIGN_STATUS_LABEL_KEYS: Record<string, AdminUiMessageKey> = {
  active: "offers.status.active",
  draft: "offers.status.draft",
  scheduled: "offers.status.scheduled",
  archived: "offers.status.archived",
};

const ALIGN_OPTION_LABEL_KEYS: Record<"start" | "center" | "end", AdminUiMessageKey> = {
  start: "offerEditor.align.left",
  center: "offerEditor.align.center",
  end: "offerEditor.align.right",
};

const BADGE_POSITION_LABEL_KEYS: Record<VolumeDiscountBadgePosition, AdminUiMessageKey> = {
  after_label: "offerEditor.badge.position.afterLabel",
  below_label: "offerEditor.badge.position.belowLabel",
  after_subtext: "offerEditor.badge.position.afterSubtext",
  top_left: "offerEditor.badge.position.topLeft",
  top_center: "offerEditor.badge.position.topCenter",
  top_right: "offerEditor.badge.position.topRight",
  price_column: "offerEditor.badge.position.priceColumn",
};

const BADGE_DESIGN_LABEL_KEYS: Partial<
  Record<VolumeDiscountBadgeDesign, AdminUiMessageKey>
> = {
  pill: "offerEditor.badge.design.pill",
  rounded: "offerEditor.badge.design.rounded",
  square: "offerEditor.badge.design.square",
  soft: "offerEditor.badge.design.soft",
  outline: "offerEditor.badge.design.outline",
  outline_bold: "offerEditor.badge.design.outlineBold",
  ghost: "offerEditor.badge.design.ghost",
  ribbon: "offerEditor.badge.design.ribbon",
  flag: "offerEditor.badge.design.flag",
  tag: "offerEditor.badge.design.tag",
  capsule: "offerEditor.badge.design.capsule",
  chip: "offerEditor.badge.design.chip",
};

const FONT_ROLE_LABEL_KEYS: Record<WidgetFontSizeFieldKey, AdminUiMessageKey> = {
  fontSizeTitle: "offerEditor.font.role.title",
  fontSizeBuyLabel: "offerEditor.font.role.buyLabel",
  fontSizeOptionSubtext: "offerEditor.font.role.optionSubtext",
  fontSizeBadge: "offerEditor.font.role.badge",
  fontSizePrice: "offerEditor.font.role.price",
  fontSizeComparePrice: "offerEditor.font.role.comparePrice",
  fontSizeSavings: "offerEditor.font.role.savingsLine",
  fontSizeButton: "offerEditor.font.role.ctaText",
  fontSizeCountdownLabel: "offerEditor.font.role.countdownLabel",
  fontSizeCountdownValue: "offerEditor.font.role.countdownPill",
  fontSizeFootnote: "offerEditor.font.role.footnote",
};

type SaveResponse =
  | { ok: true; campaignId: string }
  | { ok: false; error: string };

type CampaignTranslateResponse =
  | {
      ok: true;
      intent: "autoTranslateCampaign";
      targetLang: string;
      fields: StorefrontTranslationFields;
      tierCopy: TierCopyFields[];
      message: string;
    }
  | {
      ok: false;
      intent?: "autoTranslateCampaign";
      error: string;
    };

export type VolumeDiscountInitialCampaign = {
  id: string;
  campaignName: string;
  displayName: string | null;
  /** Sparse per-locale storefront overrides for this offer. */
  displayNameTranslations?: SparseStorefrontTranslationsMap;
  /** Per-locale option label / subtext / badge overrides (by tier index). */
  tierCopyTranslations?: TierCopyTranslationsMap;
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
  countdownStartsAt?: string | null;
  countdownEndsAt?: string | null;
};

function tiersFromInitialCampaign(ic: VolumeDiscountInitialCampaign): TierForm[] {
  return normalizeExclusiveActiveByDefault(
    ic.tiers.map((t) => ({
      ...t,
      value: normalizeTierValueForForm(t.value),
      valueUnit: t.valueUnit === "amount" ? "amount-each" : t.valueUnit,
      badge: typeof t.badge === "string" ? t.badge : "",
      multiples: t.multiples === true,
      buyLabelText: t.buyLabelText ?? "",
      optionSubtext: t.optionSubtext ?? "",
    })),
  );
}

function volumeDiscountFormSnapshot(input: {
  campaignName: string;
  displayName: string;
  campaignStatus: "draft" | "active" | "scheduled";
  productScope: VolumeDiscountProductScope;
  productIds: string[];
  collectionIds: string[];
  quantityCondition: VolumeDiscountQuantityCondition;
  customerType: string;
  customerTags: string[];
  tiers: TierForm[];
  widgetDisplay: VolumeDiscountWidgetDisplay;
  displayNameTranslations: SparseStorefrontTranslationsMap;
  tierCopyTranslations: TierCopyTranslationsMap;
  countdownStartsAt: string | null;
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
    displayNameTranslations: input.displayNameTranslations,
    tierCopyTranslations: input.tierCopyTranslations,
    countdownStartsAt: input.countdownStartsAt,
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
  /** Plan feature gates (defaults to Free if omitted). */
  planCapabilities?: PlanCapabilities;
  /** Shopify shop IANA timezone for schedule pickers (e.g. Asia/Kolkata). */
  shopTimezone?: string;
  /** Published shop languages for the Translations tab. */
  shopLanguages?: OfferEditorShopLanguage[];
  /** Shop-wide Settings translations (placeholders / inherit defaults). */
  shopTranslations?: StorefrontTranslationsMap;
};

export function VolumeDiscountCreateView({
  onBack,
  onSuccess,
  initialCampaign,
  defaultCampaignName,
  newOfferPreset,
  planCapabilities: planCapsProp,
  shopTimezone: shopTimezoneProp,
  shopLanguages: shopLanguagesProp,
  shopTranslations: shopTranslationsProp,
}: VolumeDiscountCreateViewProps) {
  const { t } = useAdminI18n();
  const planCaps = planCapsProp ?? defaultPlanCapabilities("free");
  const shopTimezone = shopTimezoneProp?.trim() || "UTC";
  const shopTimezoneLabel = formatShopTimezoneDisplay(shopTimezone);
  const shopify = useAppBridge();
  const fetcher = useFetcher<SaveResponse>();
  const translateFetcher = useFetcher<CampaignTranslateResponse>();
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
      () => initialCampaign?.quantityCondition ?? "per-product",
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
  const [campaignTranslations, setCampaignTranslations] =
    useState<SparseStorefrontTranslationsMap>(
      () => initialCampaign?.displayNameTranslations ?? {},
    );
  const [campaignTierCopy, setCampaignTierCopy] =
    useState<TierCopyTranslationsMap>(
      () => initialCampaign?.tierCopyTranslations ?? {},
    );
  const shopLanguages = useMemo(
    () =>
      shopLanguagesProp && shopLanguagesProp.length > 0
        ? shopLanguagesProp
        : FALLBACK_OFFER_SHOP_LANGUAGES,
    [shopLanguagesProp],
  );
  const shopTranslations = shopTranslationsProp ?? {};
  const primaryLang = useMemo(() => {
    const primary = shopLanguages.find((l) => l.primary);
    return primary?.value ?? shopLanguages[0]?.value ?? "en";
  }, [shopLanguages]);
  const [selectedTransLang, setSelectedTransLang] = useState(primaryLang);
  const canEditTranslations = planCaps.translations;
  const [countdownEndsAtLocal, setCountdownEndsAtLocal] = useState(() =>
    initialCountdownEndsAtLocalForEditor(initialCampaign, newOfferPreset, shopTimezone),
  );
  const [countdownStartsAtLocal, setCountdownStartsAtLocal] = useState(() =>
    isoToDatetimeLocalValue(initialCampaign?.countdownStartsAt ?? null, shopTimezone),
  );
  const [scheduleStartEnabled, setScheduleStartEnabled] = useState(() =>
    Boolean(
      isoToDatetimeLocalValue(initialCampaign?.countdownStartsAt ?? null, shopTimezone).trim(),
    ),
  );
  const [scheduleEndEnabled, setScheduleEndEnabled] = useState(() => {
    const hasStoredEnd = Boolean(
      isoToDatetimeLocalValue(
        initialCampaign?.countdownEndsAt ?? null,
        shopTimezone,
      ).trim(),
    );
    if (hasStoredEnd) return true;
    // showCountdown without a saved end still seeds a local end for the pill —
    // keep Schedule end enabled so Save persists countdownEndsAt (storefront needs it).
    const wd = initialCampaign
      ? normalizeVolumeDiscountWidgetDisplay(initialCampaign.widgetDisplay ?? {})
      : initialWidgetDisplayForNewCampaign(newOfferPreset);
    return Boolean(wd.showCountdown);
  });
  /** Bumps preview countdown when schedule end is re-seeded. */
  const [countdownPreviewNonce, setCountdownPreviewNonce] = useState(0);
  const lastShowCountdownRef = useRef<boolean | null>(null);
  /** Skips one countdown auto-seed after undo/redo (or external snapshot apply). */
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
  const [appearanceTemplateCategory, setAppearanceTemplateCategory] =
    useState<AppearanceTemplateCategory>(() => {
      const tid = widgetDisplay.appearanceTemplateId;
      if (tid === "custom" && widgetDisplay.appearanceDecorThemeId) {
        return appearanceCategoryForPresetId(
          widgetDisplay.appearanceDecorThemeId,
        );
      }
      return appearanceCategoryForPresetId(tid);
    });

  const isVolumeTableOffer =
    widgetDisplay.widgetPresentation === "volume_table";

  useEffect(() => {
    // Keep the current tab when Custom is selected so Custom stays visible
    // under Classic / Christmas / Halloween / Ramadan / Diwali / Pongal.
    if (widgetDisplay.appearanceTemplateId === "custom") return;
    setAppearanceTemplateCategory(
      appearanceCategoryForPresetId(widgetDisplay.appearanceTemplateId),
    );
  }, [widgetDisplay.appearanceTemplateId]);

  const appearanceTemplatesInCategory = useMemo(
    () =>
      appearancePresetsForCategory(
        appearanceTemplateCategory,
        isVolumeTableOffer,
      ),
    [appearanceTemplateCategory, isVolumeTableOffer],
  );

  const selectedAppearanceTemplateLocked = !isAppearancePresetAllowedForTier(
    planCaps.appearanceTemplates,
    widgetDisplay.appearanceTemplateId,
  );

  const showAppearanceTemplateUpgrade =
    planCaps.appearanceTemplates === "classic" &&
    isSeasonalAppearanceCategory(appearanceTemplateCategory);

  /** Matches Select offer type cards: “Quantity breaks” vs “Volume discount”. */
  const offerTypePageTitle = useMemo((): string => {
    const isVolume =
      initialCampaign != null
        ? widgetDisplay.widgetPresentation === "volume_table"
        : newOfferPreset === "volume_table";
    return isVolume
      ? t("offerEditor.volumeDiscount")
      : t("offerEditor.quantityBreaks");
  }, [
    initialCampaign,
    newOfferPreset,
    t,
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
    return rows;
  }, [isVolumeTableOffer, widgetDisplay.showCountdown]);

  const fontRoleLabel = useCallback(
    (key: WidgetFontSizeFieldKey) => {
      if (isVolumeTableOffer && key === "fontSizeBuyLabel") {
        return t("offerEditor.font.role.quantityColumn");
      }
      if (isVolumeTableOffer && key === "fontSizePrice") {
        return t("offerEditor.font.role.priceColumn");
      }
      return t(FONT_ROLE_LABEL_KEYS[key]);
    },
    [isVolumeTableOffer, t],
  );

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
              if (prev.appearanceTemplateId !== "custom") {
                next.appearanceDecorThemeId = prev.appearanceTemplateId;
              }
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

    if (
      o.displayNameTranslations &&
      typeof o.displayNameTranslations === "object" &&
      !Array.isArray(o.displayNameTranslations)
    ) {
      setCampaignTranslations(
        o.displayNameTranslations as SparseStorefrontTranslationsMap,
      );
    } else {
      setCampaignTranslations({});
    }

    if (
      o.tierCopyTranslations &&
      typeof o.tierCopyTranslations === "object" &&
      !Array.isArray(o.tierCopyTranslations)
    ) {
      setCampaignTierCopy(o.tierCopyTranslations as TierCopyTranslationsMap);
    } else {
      setCampaignTierCopy({});
    }

    const ends = o.countdownEndsAt;
    setCountdownEndsAtLocal(
      typeof ends === "string" && ends.trim()
        ? isoToDatetimeLocalValue(ends, shopTimezone)
        : "",
    );
    setScheduleEndEnabled(
      typeof ends === "string" && ends.trim() !== "",
    );

    const starts = o.countdownStartsAt;
    const startLocal =
      typeof starts === "string" && starts.trim()
        ? isoToDatetimeLocalValue(starts, shopTimezone)
        : "";
    setCountdownStartsAtLocal(startLocal);
    setScheduleStartEnabled(startLocal.trim() !== "");

    setPreviewCampaignOn(o.campaignStatus === "active");
  }, [shopTimezone]);

  const bumpHistoryStacks = useCallback(() => {
    setHistoryVersion((v) => v + 1);
  }, []);

  const handleSave = useCallback(() => {
    setSaveErrorDismissed(false);
    if (
      isWidgetDisplayAppearanceAbovePlan(
        planCaps.appearanceTemplates,
        widgetDisplay,
      )
    ) {
      shopify.toast.show(
        t(
          planCaps.appearanceTemplates === "classic"
            ? "offerEditor.appearance.templateSaveBlockedFree"
            : "offerEditor.appearance.templateSaveBlockedPremium",
        ),
      );
      return;
    }
    const fd = new FormData();
    fd.set("campaignName", campaignName.trim());
    fd.set("displayName", displayName.trim());
    fd.set("productScope", productScope);
    fd.set("quantityCondition", quantityCondition);
    fd.set(
      "customerType",
      planCaps.customerTargeting ? customerType : "everyone",
    );
    fd.set(
      "customerTags",
      JSON.stringify(planCaps.customerTargeting ? customerTags : []),
    );
    const tiersForSave = tiers.map((t) => ({
      ...t,
      value: normalizeTierValueForForm(t.value),
    }));
    fd.set("tiers", JSON.stringify(tiersForSave));
    fd.set("productIds", JSON.stringify(productIds));
    fd.set("collectionIds", JSON.stringify(collectionIds));
    fd.set(
      "countdownStartsAt",
      planCaps.scheduling &&
        scheduleStartEnabled &&
        countdownStartsAtLocal.trim()
        ? datetimeLocalToIsoUtc(countdownStartsAtLocal, shopTimezone) ?? ""
        : "",
    );
    // Persist end only when Schedule → Set end date is on (not merely showCountdown).
    let endLocalForSave = countdownEndsAtLocal.trim();
    if (scheduleEndEnabled && !endLocalForSave) {
      endLocalForSave = countdownDatetimeLocalFromNow(
        widgetDisplay.countdownTimeAmount,
        widgetDisplay.countdownTimeUnit,
        shopTimezone,
      );
    }
    fd.set(
      "countdownEndsAt",
      planCaps.scheduling && scheduleEndEnabled && endLocalForSave
        ? datetimeLocalToIsoUtc(endLocalForSave, shopTimezone) ?? ""
        : "",
    );
    const startIsoForStatus =
      planCaps.scheduling &&
      scheduleStartEnabled &&
      countdownStartsAtLocal.trim()
        ? datetimeLocalToIsoUtc(countdownStartsAtLocal, shopTimezone)
        : null;
    const pendingStart = isCampaignSchedulePendingStart(
      startIsoForStatus ? parseOptionalIsoDate(startIsoForStatus) : null,
    );
    const widgetForSave = {
      ...widgetDisplay,
      showCountdown: planCaps.countdown ? widgetDisplay.showCountdown : false,
      customCss: planCaps.customCss ? widgetDisplay.customCss : "",
    };
    fd.set("widgetDisplay", JSON.stringify(widgetForSave));
    fd.set(
      "displayNameTranslations",
      JSON.stringify(
        packCampaignTranslationBlob(campaignTranslations, campaignTierCopy),
      ),
    );
    fd.set(
      "campaignStatus",
      previewCampaignOn || pendingStart ? "active" : "draft",
    );
    fetcher.submit(fd, { method: "post" });
  }, [
    campaignName,
    campaignTierCopy,
    campaignTranslations,
    collectionIds,
    countdownEndsAtLocal,
    countdownStartsAtLocal,
    customerTags,
    customerType,
    displayName,
    fetcher,
    planCaps,
    previewCampaignOn,
    productIds,
    productScope,
    quantityCondition,
    scheduleEndEnabled,
    scheduleStartEnabled,
    shopify,
    shopTimezone,
    t,
    tiers,
    widgetDisplay,
  ]);

  const handleDiscard = useCallback(() => {
    setSaveErrorDismissed(true);
    skipHistoryCommitRef.current = true;
    syncBaselineAfterDiscardRef.current = true;
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
        initialCountdownEndsAtLocalForEditor(initialCampaign, newOfferPreset, shopTimezone),
      );
      const startLocal = isoToDatetimeLocalValue(
        initialCampaign.countdownStartsAt ?? null,
        shopTimezone,
      );
      setCountdownStartsAtLocal(startLocal);
      setScheduleStartEnabled(startLocal.trim() !== "");
      const discardedWd = initialCampaign.widgetDisplay
        ? normalizeVolumeDiscountWidgetDisplay(initialCampaign.widgetDisplay)
        : { ...DEFAULT_WIDGET_DISPLAY };
      setScheduleEndEnabled(
        isoToDatetimeLocalValue(
          initialCampaign.countdownEndsAt ?? null,
          shopTimezone,
        ).trim() !== "" || Boolean(discardedWd.showCountdown),
      );
      setPreviewCampaignOn(initialCampaign.status === "active");
      setCampaignTranslations(initialCampaign.displayNameTranslations ?? {});
      setCampaignTierCopy(initialCampaign.tierCopyTranslations ?? {});
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
        initialCountdownEndsAtLocalForEditor(undefined, newOfferPreset, shopTimezone),
      );
      setCountdownStartsAtLocal("");
      setScheduleStartEnabled(false);
      setScheduleEndEnabled(false);
      setProductQuery("");
      setCollectionQuery("");
      setPreviewCampaignOn(true);
      setCampaignTranslations({});
      setCampaignTierCopy({});
    }
    setActiveTier(0);
  }, [defaultCampaignName, initialCampaign, newOfferPreset, shopTimezone]);

  useEffect(() => {
    lastShowCountdownRef.current = null;
  }, [initialCampaign?.id]);

  // Countdown pill uses Schedule end. Turning countdown on seeds end if missing.
  useEffect(() => {
    if (skipNextCountdownAutoSyncRef.current) {
      skipNextCountdownAutoSyncRef.current = false;
      lastShowCountdownRef.current = widgetDisplay.showCountdown;
      return;
    }

    const turnedOn =
      lastShowCountdownRef.current === false &&
      widgetDisplay.showCountdown === true;

    lastShowCountdownRef.current = widgetDisplay.showCountdown;

    if (!turnedOn) return;

    setScheduleEndEnabled(true);
    if (!countdownEndsAtLocal.trim()) {
      setCountdownEndsAtLocal(
        countdownDatetimeLocalFromNow(
          widgetDisplay.countdownTimeAmount,
          widgetDisplay.countdownTimeUnit,
          shopTimezone,
        ),
      );
      setCountdownPreviewNonce((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to showCountdown edge; don't clobber an edited end.
  }, [widgetDisplay.showCountdown]);

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
  const countdownStartsSnapshot =
    scheduleStartEnabled && countdownStartsAtLocal.trim() !== ""
      ? datetimeLocalToIsoUtc(countdownStartsAtLocal, shopTimezone)
      : null;
  // Schedule end only — countdown display must not block Turn on when Schedule is off.
  const countdownEndsSnapshot =
    scheduleEndEnabled && countdownEndsAtLocal.trim() !== ""
      ? datetimeLocalToIsoUtc(countdownEndsAtLocal, shopTimezone)
      : null;

  const scheduleStartsAtDate = useMemo(
    () =>
      countdownStartsSnapshot
        ? parseOptionalIsoDate(countdownStartsSnapshot)
        : null,
    [countdownStartsSnapshot],
  );
  const scheduleEndsAtDate = useMemo(
    () =>
      countdownEndsSnapshot
        ? parseOptionalIsoDate(countdownEndsSnapshot)
        : null,
    [countdownEndsSnapshot],
  );
  const schedulePendingStart = isCampaignSchedulePendingStart(
    scheduleStartsAtDate,
  );
  const scheduleExpired = isCampaignScheduleExpired(scheduleEndsAtDate);

  /** Keep Campaign status aligned with the schedule window. */
  useEffect(() => {
    const next = resolveCampaignStatusFromSchedule({
      requestedStatus:
        previewCampaignOn || schedulePendingStart ? "active" : "draft",
      startsAt: scheduleStartsAtDate,
      endsAt: scheduleEndsAtDate,
    });
    if ((next === "draft" || next === "scheduled") && previewCampaignOn) {
      setPreviewCampaignOn(false);
      return;
    }
    if (
      next === "active" &&
      !previewCampaignOn &&
      scheduleStartsAtDate &&
      !schedulePendingStart &&
      !scheduleExpired
    ) {
      /* Start time reached (or moved into the past) — go live. */
      setPreviewCampaignOn(true);
    }
  }, [
    previewCampaignOn,
    scheduleEndsAtDate,
    scheduleExpired,
    schedulePendingStart,
    scheduleStartsAtDate,
  ]);

  const editorCampaignStatus = resolveCampaignStatusFromSchedule({
    requestedStatus:
      previewCampaignOn || schedulePendingStart ? "active" : "draft",
    startsAt: scheduleStartsAtDate,
    endsAt: scheduleEndsAtDate,
  });

  /** Why “Turn on” cannot activate the offer right now (shown under Campaign status). */
  const turnOnBlockedReason = useMemo(() => {
    if (editorCampaignStatus === "active") return null;
    // Only when Schedule → Set end date is on and that end is already past.
    if (scheduleEndEnabled && scheduleExpired) return "expired" as const;
    return null;
  }, [editorCampaignStatus, scheduleEndEnabled, scheduleExpired]);

  const goToScheduleSettings = useCallback(() => {
    handleSettingsTabChange(0);
    window.setTimeout(() => {
      const el = document.getElementById("vd-offer-schedule");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!scheduleEndEnabled) {
        setScheduleEndEnabled(true);
      }
    }, 80);
  }, [handleSettingsTabChange, scheduleEndEnabled]);

  useEffect(() => {
    if (!shopLanguages.some((l) => l.value === selectedTransLang)) {
      setSelectedTransLang(primaryLang);
    }
  }, [primaryLang, selectedTransLang, shopLanguages]);

  const handleCampaignTranslationFieldChange = useCallback(
    (field: keyof StorefrontTranslationFields, value: string) => {
      if (!canEditTranslations) return;
      // Primary language copy lives in Display settings (and Discount rules for tiers).
      if (selectedTransLang === primaryLang) {
        if (field === "transHeading") {
          patchWidgetDisplay({ widgetHeading: value });
          return;
        }
        if (field === "transCta") {
          patchWidgetDisplay({ ctaLabel: value });
          return;
        }
        if (field === "transFootnote") {
          patchWidgetDisplay({ footnote: value });
          return;
        }
        if (field === "transCountdown") {
          patchWidgetDisplay({ countdownLabel: value });
          return;
        }
        if (field === "transCartDiscount") {
          setDisplayName(value);
          return;
        }
      }
      setCampaignTranslations((prev) => {
        const next: SparseStorefrontTranslationsMap = { ...prev };
        const langFields: Partial<StorefrontTranslationFields> = {
          ...(next[selectedTransLang] ?? {}),
        };
        const trimmed = value.trim();
        if (!trimmed) {
          delete langFields[field];
        } else {
          langFields[field] = value;
        }
        if (Object.keys(langFields).length === 0) {
          delete next[selectedTransLang];
        } else {
          next[selectedTransLang] = langFields;
        }
        return next;
      });
    },
    [
      canEditTranslations,
      patchWidgetDisplay,
      primaryLang,
      selectedTransLang,
    ],
  );

  const handleResetCampaignLanguage = useCallback(() => {
    if (!canEditTranslations) return;
    setCampaignTranslations((prev) => {
      const next = { ...prev };
      delete next[selectedTransLang];
      return next;
    });
    setCampaignTierCopy((prev) => {
      const next = { ...prev };
      delete next[selectedTransLang];
      return next;
    });
    shopify.toast.show(t("offerEditor.translations.toast.reset"));
  }, [canEditTranslations, selectedTransLang, shopify, t]);

  const handleAutoTranslateCampaignLanguage = useCallback(() => {
    if (!canEditTranslations) {
      shopify.toast.show(t("settings.toast.upgradeTranslations"));
      return;
    }
    if (selectedTransLang === primaryLang) {
      shopify.toast.show(t("settings.toast.englishSource"));
      return;
    }
    const englishSource = resolveCampaignEnglishSourceForAutoTranslate({
      primaryLang,
      shopTranslations,
      campaignOverrides: campaignTranslations,
      widgetHeading: widgetDisplay.widgetHeading,
      ctaLabel: widgetDisplay.ctaLabel,
      footnote: widgetDisplay.footnote,
      countdownLabel: widgetDisplay.countdownLabel,
      displayName,
    });
    const englishTiers = tiers.map((tier) => ({
      buyLabelText: tier.buyLabelText,
      optionSubtext: tier.optionSubtext,
      badge: tier.badge,
    }));
    const fd = new FormData();
    fd.set("intent", "autoTranslateCampaign");
    fd.set("targetLang", selectedTransLang);
    fd.set("sourceLang", primaryLang);
    fd.set("englishSource", JSON.stringify(englishSource));
    fd.set("englishTiers", JSON.stringify(englishTiers));
    translateFetcher.submit(fd, { method: "post" });
  }, [
    canEditTranslations,
    campaignTranslations,
    displayName,
    primaryLang,
    selectedTransLang,
    shopTranslations,
    shopify,
    t,
    tiers,
    translateFetcher,
    widgetDisplay.countdownLabel,
    widgetDisplay.ctaLabel,
    widgetDisplay.footnote,
    widgetDisplay.widgetHeading,
  ]);

  useEffect(() => {
    if (translateFetcher.state !== "idle" || !translateFetcher.data) return;
    const result = translateFetcher.data;
    if (result.ok && result.intent === "autoTranslateCampaign") {
      const sparse = sparsifyStorefrontTranslations({
        [result.targetLang]: result.fields,
      });
      setCampaignTranslations((prev) => ({
        ...prev,
        ...sparse,
      }));
      if (Array.isArray(result.tierCopy) && result.tierCopy.length > 0) {
        setCampaignTierCopy((prev) => ({
          ...prev,
          [result.targetLang]: result.tierCopy.map((row) => ({
            buyLabelText: String(row?.buyLabelText ?? "").trim(),
            optionSubtext: String(row?.optionSubtext ?? "").trim(),
            badge: String(row?.badge ?? "").trim(),
          })),
        }));
      }
      shopify.toast.show(
        result.message || t("settings.toast.autoTranslateComplete"),
      );
      return;
    }
    if (!result.ok && "error" in result && result.error) {
      shopify.toast.show(`Auto-translate error: ${result.error}`);
    }
  }, [translateFetcher.data, translateFetcher.state, shopify, t]);

  const isAutoTranslating = translateFetcher.state !== "idle";

  const activeCampaignTranslation = campaignTranslations[selectedTransLang] ?? {};
  const shopTranslationDefaults =
    shopTranslations[selectedTransLang] ||
    translationPresetForLanguage(selectedTransLang);
  const isPrimaryTransLang = selectedTransLang === primaryLang;

  const translationFieldValue = (field: keyof StorefrontTranslationFields) => {
    if (isPrimaryTransLang) {
      if (field === "transHeading") return widgetDisplay.widgetHeading;
      if (field === "transCta") return widgetDisplay.ctaLabel;
      if (field === "transFootnote") return widgetDisplay.footnote;
      if (field === "transCountdown") return widgetDisplay.countdownLabel;
      if (field === "transCartDiscount" && displayName.includes("{{")) {
        return displayName;
      }
    }
    return activeCampaignTranslation[field] ?? "";
  };
  const translationFieldPlaceholder = (
    field: keyof StorefrontTranslationFields,
  ) => {
    if (isPrimaryTransLang) {
      if (field === "transHeading") return widgetDisplay.widgetHeading || shopTranslationDefaults[field] || "";
      if (field === "transCta") return widgetDisplay.ctaLabel || shopTranslationDefaults[field] || "";
      if (field === "transFootnote") return widgetDisplay.footnote || shopTranslationDefaults[field] || "";
      if (field === "transCountdown") return widgetDisplay.countdownLabel || shopTranslationDefaults[field] || "";
    }
    return shopTranslationDefaults[field] || "";
  };

  const activeTierCopyRows = isPrimaryTransLang
    ? tiers.map((tier) => ({
        buyLabelText: tier.buyLabelText,
        optionSubtext: tier.optionSubtext,
        badge: tier.badge,
      }))
    : (campaignTierCopy[selectedTransLang] ?? []);
  const handleCampaignTierCopyFieldChange = useCallback(
    (
      tierIndex: number,
      field: keyof TierCopyFields,
      value: string,
    ) => {
      if (!canEditTranslations) return;
      // Primary language tier copy is edited on Discount rules (and mirrored here).
      if (selectedTransLang === primaryLang) {
        setTiers((prev) =>
          prev.map((tier, index) =>
            index === tierIndex ? { ...tier, [field]: value } : tier,
          ),
        );
        return;
      }
      setCampaignTierCopy((prev) => {
        const rows = [...(prev[selectedTransLang] ?? [])];
        while (rows.length <= tierIndex) {
          rows.push(emptyTierCopyFields());
        }
        const nextRow = {
          ...emptyTierCopyFields(),
          ...rows[tierIndex],
          [field]: value,
        };
        rows[tierIndex] = nextRow;
        const next = { ...prev };
        const any = rows.some(
          (r) =>
            r.buyLabelText.trim() ||
            r.optionSubtext.trim() ||
            r.badge.trim(),
        );
        if (!any) {
          delete next[selectedTransLang];
        } else {
          next[selectedTransLang] = rows;
        }
        return next;
      });
    },
    [canEditTranslations, primaryLang, selectedTransLang],
  );

  const currentFormSnapshot = useMemo(
    () =>
      volumeDiscountFormSnapshot({
        campaignName,
        displayName,
        campaignStatus: editorCampaignStatus,
        productScope,
        productIds,
        collectionIds,
        quantityCondition,
        customerType,
        customerTags: [...customerTags].sort(),
        tiers,
        widgetDisplay,
        displayNameTranslations: campaignTranslations,
        tierCopyTranslations: campaignTierCopy,
        countdownStartsAt: countdownStartsSnapshot,
        countdownEndsAt: countdownEndsSnapshot,
      }),
    [
      campaignName,
      campaignTierCopy,
      campaignTranslations,
      collectionIds,
      countdownEndsSnapshot,
      countdownStartsSnapshot,
      customerTags,
      customerType,
      displayName,
      editorCampaignStatus,
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
          ? t("offerEditor.editTitle", { type: offerTypePageTitle })
          : t("offerEditor.createTitle", { type: offerTypePageTitle })
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
          {t("offerEditor.discard")}
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
          {t("offerEditor.save")}
        </button>
      </SaveBar>
      <s-stack direction="block" gap="base">
        {saveError ? (
          <s-banner tone="critical" heading={t("offerEditor.couldNotSave")}>
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
              accessibilityLabel={t("offerEditor.backA11y")}
              onClick={() => void handleBack()}
            >
              {t("offerEditor.offerTypes")}
            </s-button>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <ButtonGroup variant="segmented">
                <Button
                  icon={UndoIcon}
                  size="slim"
                  accessibilityLabel={t("offerEditor.undo")}
                  disabled={!canUndo || saveBusy}
                  onClick={handleUndo}
                />
                <Button
                  icon={RedoIcon}
                  size="slim"
                  accessibilityLabel={t("offerEditor.redo")}
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
                {t("offerEditor.save")}
              </s-button>
            </InlineStack>
          </s-stack>

          <s-stack direction="block" alignItems="stretch">
            <s-box inlineSize="100%">
            <div className={createStyles.formWithPreview}>
              <div className={createStyles.formColumn}>
                <Box paddingBlockEnd="300">
                  <div className={createStyles.offerSettingsTabs}>
                  <Tabs
                    fitted
                    tabs={[
                      {
                        id: "rules",
                        content: t("offerEditor.tab.rules"),
                        panelID: "vd-rule-settings-panel",
                      },
                      {
                        id: "display",
                        content: t("offerEditor.tab.display"),
                        panelID: "vd-display-settings-panel",
                      },
                      {
                        id: "appearance",
                        content: t("offerEditor.tab.appearance"),
                        panelID: "vd-appearance-panel",
                      },
                      {
                        id: "translations",
                        content: t("offerEditor.tab.translations"),
                        panelID: "vd-translations-panel",
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
                            <s-heading>{t("offerEditor.campaignDetails")}</s-heading>
                            <s-text-field
                              label={t("offerEditor.campaignName")}
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
                              {t("offerEditor.campaignNameHelp")}
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
                      <s-heading>{t("offerEditor.discountRules")}</s-heading>

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
                          onInput={(e) =>
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

                      {(tier.valueUnit === "amount-each" ||
                        tier.valueUnit === "amount") && (
                        <AdminLanguageDropdown
                          label="Discount mode"
                          value={
                            tier.discountMode === "per-line"
                              ? "per-line"
                              : "per-item"
                          }
                          options={[
                            { value: "per-item", label: "Per item" },
                            { value: "per-line", label: "Per line" },
                          ]}
                          onChange={(value) =>
                            updateTier({ discountMode: value })
                          }
                          helpText="Per item: off each unit. Per line: off once for the whole line."
                        />
                      )}

                      <s-checkbox
                        label="Require exact multiples of Buy from"
                        name="tierMultiples"
                        checked={tier.multiples === true}
                        onChange={(e) =>
                          updateTier({
                            multiples: Boolean(e.currentTarget.checked),
                          })
                        }
                      />

                      <s-text-field
                        label={t("offerEditor.tier.optionLabel")}
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
                        placeholder={t("offerEditor.tier.optionLabelPlaceholder")}
                        autocomplete="off"
                      />
                      <s-paragraph color="subdued">
                        {t("offerEditor.tier.optionLabelHelp")}
                      </s-paragraph>

                      {!isVolumeTableOffer ? (
                        <>
                          <s-text-field
                            label={t("offerEditor.tier.optionSubtext")}
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
                            placeholder={t(
                              "offerEditor.tier.optionSubtextPlaceholder",
                            )}
                            autocomplete="off"
                          />
                          <s-paragraph color="subdued">
                            {t("offerEditor.tier.optionSubtextHelp")}
                          </s-paragraph>

                          <s-text-field
                            label={t("offerEditor.tier.badge")}
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
                            placeholder={t("offerEditor.tier.badgePlaceholder")}
                            autocomplete="off"
                          />
                          <s-paragraph color="subdued">
                            {t("offerEditor.tier.badgeHelp")}
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
                          {t("offerEditor.discountedProducts")}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {t("offerEditor.discountedProductsHelp")}
                        </Text>
                      </BlockStack>
                      <ChoiceList
                        title={t("offerEditor.productScope")}
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
                              ? "Select products in this offer group. With “Total quantity of all products”, qty is summed across the group (not the whole cart)."
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
                          {t("offerEditor.quantityConditions")}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {t("offerEditor.quantityConditionsHelp")}
                        </Text>
                      </BlockStack>
                      <ChoiceList
                        title={t("offerEditor.quantityBasis")}
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

                  <div id="vd-offer-schedule">
                    <CampaignStatusScheduleCard
                      schedulingLocked={!planCaps.scheduling}
                      scheduleStartEnabled={scheduleStartEnabled}
                      onScheduleStartEnabledChange={(next) => {
                        if (!planCaps.scheduling) return;
                        setScheduleStartEnabled(next);
                        if (next) {
                          const seed =
                            countdownStartsAtLocal.trim() ||
                            isoToDatetimeLocalValue(
                              new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                              shopTimezone,
                            );
                          if (!countdownStartsAtLocal.trim()) {
                            setCountdownStartsAtLocal(seed);
                          }
                          const iso = datetimeLocalToIsoUtc(seed, shopTimezone);
                          const start = iso ? parseOptionalIsoDate(iso) : null;
                          if (isCampaignSchedulePendingStart(start)) {
                            setPreviewCampaignOn(false);
                          }
                        }
                      }}
                      scheduleStartLocal={countdownStartsAtLocal}
                      onScheduleStartLocalChange={(v) => {
                        if (!planCaps.scheduling) return;
                        setCountdownStartsAtLocal(v);
                        const iso = datetimeLocalToIsoUtc(v, shopTimezone);
                        const start = iso ? parseOptionalIsoDate(iso) : null;
                        if (isCampaignSchedulePendingStart(start)) {
                          setPreviewCampaignOn(false);
                        } else if (
                          start &&
                          !isCampaignScheduleExpired(scheduleEndsAtDate)
                        ) {
                          setPreviewCampaignOn(true);
                        }
                      }}
                      scheduleEndEnabled={scheduleEndEnabled}
                      onScheduleEndEnabledChange={(next) => {
                        if (!planCaps.scheduling) return;
                        setScheduleEndEnabled(next);
                        if (!next) {
                          patchWidgetDisplay({ showCountdown: false });
                        }
                        if (next && !countdownEndsAtLocal.trim()) {
                          setCountdownEndsAtLocal(
                            countdownDatetimeLocalFromNow(
                              widgetDisplay.countdownTimeAmount,
                              widgetDisplay.countdownTimeUnit,
                              shopTimezone,
                            ),
                          );
                        }
                        if (next) {
                          const endLocal =
                            countdownEndsAtLocal.trim() ||
                            countdownDatetimeLocalFromNow(
                              widgetDisplay.countdownTimeAmount,
                              widgetDisplay.countdownTimeUnit,
                              shopTimezone,
                            );
                          const iso = datetimeLocalToIsoUtc(endLocal, shopTimezone);
                          const end = iso ? parseOptionalIsoDate(iso) : null;
                          if (isCampaignScheduleExpired(end)) {
                            setPreviewCampaignOn(false);
                          }
                        }
                      }}
                      scheduleEndLocal={countdownEndsAtLocal}
                      onScheduleEndLocalChange={(v) => {
                        if (!planCaps.scheduling) return;
                        setCountdownEndsAtLocal(v);
                        setScheduleEndEnabled(true);
                        const iso = datetimeLocalToIsoUtc(v, shopTimezone);
                        const end = iso ? parseOptionalIsoDate(iso) : null;
                        if (isCampaignScheduleExpired(end)) {
                          setPreviewCampaignOn(false);
                        } else if (
                          !isCampaignSchedulePendingStart(scheduleStartsAtDate)
                        ) {
                          setPreviewCampaignOn(true);
                        }
                      }}
                      shopTimezone={shopTimezone}
                      shopTimezoneLabel={shopTimezoneLabel}
                      showCountdown={widgetDisplay.showCountdown}
                      onShowCountdownChange={(checked) => {
                        if (!planCaps.countdown) return;
                        patchWidgetDisplay({ showCountdown: checked });
                      }}
                      countdownLabel={widgetDisplay.countdownLabel}
                      onCountdownLabelChange={(v) => {
                        if (!planCaps.countdown) return;
                        patchWidgetDisplay({ countdownLabel: v });
                      }}
                      countdownLocked={!planCaps.countdown}
                    />
                  </div>

                  <Card padding="400">
                    <BlockStack gap="300">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingSm">
                          {t("offerEditor.targetCustomer")}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t("offerEditor.targetCustomerHelp")}
                        </Text>
                      </BlockStack>
                      {!planCaps.customerTargeting ? (
                        <PlanUpgradeHint feature="customerTargeting" />
                      ) : null}
                      <AdminLanguageDropdown
                        label={t("offerEditor.customerType")}
                        disabled={!planCaps.customerTargeting}
                        options={[
                          { label: "Everyone", value: "everyone" },
                          {
                            label: "Logged-in customers",
                            value: "logged-in",
                          },
                          {
                            label: "Logged-in customers with specific tag",
                            value: "logged-in-tag-any",
                          },
                        ]}
                        value={
                          planCaps.customerTargeting
                            ? customerType
                            : "logged-in-tag-any"
                        }
                        onChange={(v) => {
                          if (!planCaps.customerTargeting) return;
                          if (isVolumeDiscountCustomerType(v)) {
                            setCustomerType(v);
                          }
                        }}
                      />
                      {(planCaps.customerTargeting
                        ? customerType === "logged-in-tag-any"
                        : true) ? (
                        <BlockStack gap="300">
                          <Text as="p" variant="bodyMd" tone="subdued">
                            Match spelling to customer tags in Shopify admin
                            (Customers). Add one tag per chip; remove with ×.
                          </Text>
                          {planCaps.customerTargeting ? (
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
                          ) : null}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!planCaps.customerTargeting) return;
                              addCustomerTag();
                            }}
                          >
                            <InlineStack gap="200" wrap blockAlign="end">
                              <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                                <TextField
                                  label="Add customer tag"
                                  value={
                                    planCaps.customerTargeting
                                      ? customerTagInput
                                      : ""
                                  }
                                  onChange={(v) => setCustomerTagInput(v)}
                                  autoComplete="off"
                                  placeholder="e.g. Wholesale"
                                  disabled={!planCaps.customerTargeting}
                                />
                              </div>
                              <Button
                                submit
                                variant="primary"
                                disabled={!planCaps.customerTargeting}
                              >
                                Add
                              </Button>
                            </InlineStack>
                          </form>
                        </BlockStack>
                      ) : null}
                    </BlockStack>
                  </Card>
                      </s-stack>
                    ) : settingsTab === 1 ? (
                      <BlockStack gap="400">
                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              {t("offerEditor.cartCheckout")}
                            </Text>
                            <TextField
                              label={t("offerEditor.displayName")}
                              name="displayName"
                              value={displayName}
                              onChange={setDisplayName}
                              multiline={2}
                              autoComplete="off"
                              helpText={t("offerEditor.displayNameHelp")}
                            />
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              {t("offerEditor.buttonSettings")}
                            </Text>
                            <TextField
                              label={t("offerEditor.textButton")}
                              name="ctaLabel"
                              value={widgetDisplay.ctaLabel}
                              onChange={(v) =>
                                patchWidgetDisplay({ ctaLabel: v })
                              }
                              autoComplete="off"
                              multiline={2}
                            />
                            <Select
                              label={t("offerEditor.buttonAction")}
                              helpText={
                                isVolumeTableOffer
                                  ? t("offerEditor.buttonAction.helpVolume")
                                  : t("offerEditor.buttonAction.help")
                              }
                              options={CTA_BUTTON_ACTION_OPTIONS.map((o) => ({
                                value: o.value,
                                label: t(
                                  `offerEditor.ctaAction.${o.value}` as AdminUiMessageKey,
                                ),
                              }))}
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
                                label={t("offerEditor.pageUrl")}
                                value={widgetDisplay.ctaButtonPageUrl}
                                onChange={(v) =>
                                  patchWidgetDisplay({
                                    ctaButtonPageUrl: v,
                                  })
                                }
                                autoComplete="off"
                                helpText={t("offerEditor.pageUrlHelp")}
                              />
                            ) : null}
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              {t("offerEditor.advanced.themeSection")}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {t("offerEditor.advanced.themeIntro")}
                            </Text>
                            <BlockStack gap="200">
                              <Checkbox
                                label={t("offerEditor.advanced.hideThemeAddToCart")}
                                helpText={t(
                                  "offerEditor.advanced.hideThemeAddToCartHelp",
                                )}
                                checked={widgetDisplay.hideThemeAddToCart}
                                onChange={(checked) =>
                                  patchWidgetDisplay({
                                    hideThemeAddToCart: checked,
                                  })
                                }
                              />
                              <Checkbox
                                label={t("offerEditor.advanced.hideThemeBuyItNow")}
                                helpText={t(
                                  "offerEditor.advanced.hideThemeBuyItNowHelp",
                                )}
                                checked={widgetDisplay.hideThemeBuyItNow}
                                onChange={(checked) =>
                                  patchWidgetDisplay({
                                    hideThemeBuyItNow: checked,
                                  })
                                }
                              />
                              <Checkbox
                                label={t(
                                  "offerEditor.advanced.hideThemeVariantPicker",
                                )}
                                helpText={t(
                                  "offerEditor.advanced.hideThemeVariantPickerHelp",
                                )}
                                checked={widgetDisplay.hideThemeVariantSelector}
                                onChange={(checked) =>
                                  patchWidgetDisplay({
                                    hideThemeVariantSelector: checked,
                                  })
                                }
                              />
                              <Checkbox
                                label={t("offerEditor.advanced.hideThemeQuantity")}
                                helpText={t(
                                  "offerEditor.advanced.hideThemeQuantityHelp",
                                )}
                                checked={widgetDisplay.hideThemeQuantitySelector}
                                onChange={(checked) =>
                                  patchWidgetDisplay({
                                    hideThemeQuantitySelector: checked,
                                  })
                                }
                              />
                              <Checkbox
                                label={t("offerEditor.advanced.hideThemePrice")}
                                helpText={t(
                                  "offerEditor.advanced.hideThemePriceHelp",
                                )}
                                checked={widgetDisplay.hideThemePrice}
                                onChange={(checked) =>
                                  patchWidgetDisplay({
                                    hideThemePrice: checked,
                                  })
                                }
                              />
                            </BlockStack>
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                            <Text as="h2" variant="headingSm">
                              {t("offerEditor.advanced.widgetSection")}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {isVolumeTableOffer
                                ? t("offerEditor.advanced.introVolume")
                                : t("offerEditor.advanced.widgetIntro")}
                            </Text>
                            <BlockStack gap="200">
                              {isVolumeTableOffer ? (
                                <Checkbox
                                  label={t(
                                    "offerEditor.advanced.hideWidgetMainCta",
                                  )}
                                  helpText={t(
                                    "offerEditor.advanced.hideWidgetMainCtaHelp",
                                  )}
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
                                    label={t(
                                      "offerEditor.advanced.hideWidgetVariantDropdown",
                                    )}
                                    helpText={t(
                                      "offerEditor.advanced.hideWidgetVariantDropdownHelp",
                                    )}
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
                                    label={t(
                                      "offerEditor.advanced.hideOutOfStockVariants",
                                    )}
                                    helpText={t(
                                      "offerEditor.advanced.hideOutOfStockVariantsHelp",
                                    )}
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
                                    label={t(
                                      "offerEditor.advanced.hideWidgetQuantity",
                                    )}
                                    helpText={t(
                                      "offerEditor.advanced.hideWidgetQuantityHelp",
                                    )}
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
                                    label={t(
                                      "offerEditor.advanced.hideWidgetLineTotal",
                                    )}
                                    helpText={t(
                                      "offerEditor.advanced.hideWidgetLineTotalHelp",
                                    )}
                                    checked={widgetDisplay.hideWidgetLineTotal}
                                    onChange={(checked) =>
                                      patchWidgetDisplay({
                                        hideWidgetLineTotal: checked,
                                      })
                                    }
                                  />
                                  <Checkbox
                                    label={t(
                                      "offerEditor.advanced.hideTierAddButtons",
                                    )}
                                    helpText={t(
                                      "offerEditor.advanced.hideTierAddButtonsHelp",
                                    )}
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
                                    label={t(
                                      "offerEditor.advanced.showPerItemPrice",
                                    )}
                                    helpText={t(
                                      "offerEditor.advanced.showPerItemPriceHelp",
                                    )}
                                    checked={widgetDisplay.cardPriceShowsUnit}
                                    onChange={(checked) =>
                                      patchWidgetDisplay({
                                        cardPriceShowsUnit: checked,
                                      })
                                    }
                                  />
                                  <Checkbox
                                    label={t(
                                      "offerEditor.advanced.hideCompareAtPrice",
                                    )}
                                    helpText={t(
                                      "offerEditor.advanced.hideCompareAtPriceHelp",
                                    )}
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
                              {t("offerEditor.widgetText")}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {t("offerEditor.widgetTextHelp")}
                            </Text>
                            <TextField
                              label={t("offerEditor.widget.headingLabel")}
                              name="widgetHeading"
                              value={widgetDisplay.widgetHeading}
                              onChange={(v) =>
                                patchWidgetDisplay({ widgetHeading: v })
                              }
                              autoComplete="off"
                              multiline={2}
                              placeholder={t(
                                "offerEditor.widget.headingPlaceholder",
                              )}
                            />
                            {!isVolumeTableOffer ? (
                              <WidgetHeaderAlignFields
                                idPrefix="vd-qb"
                                widgetHeaderLayout={
                                  widgetDisplay.widgetHeaderLayout
                                }
                                widgetHeadingAlign={
                                  widgetDisplay.widgetHeadingAlign
                                }
                                countdownAlign={widgetDisplay.countdownAlign}
                                widgetHeaderMobileStack={
                                  widgetDisplay.widgetHeaderMobileStack
                                }
                                widgetHeaderSwapOrder={
                                  widgetDisplay.widgetHeaderSwapOrder
                                }
                                patchWidgetDisplay={patchWidgetDisplay}
                              />
                            ) : (
                              <Text as="p" variant="bodySm" tone="subdued">
                                {t("offerEditor.widget.titleAlignmentNote")}
                              </Text>
                            )}
                            <TextField
                              label={t("offerEditor.widget.footnoteLabel")}
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
                      </BlockStack>
                    ) : settingsTab === 2 ? (
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
                                {t("offerEditor.widgetAppearance")}
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
                                {t("offerEditor.appearance.resetStyles")}
                              </Button>
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {isVolumeTableOffer
                                ? t("offerEditor.appearance.introVolume")
                                : t("offerEditor.appearance.intro")}
                            </Text>
                          </BlockStack>
                        </Card>

                        {isVolumeTableOffer ? (
                          <Card padding="400">
                            <BlockStack gap="400">
                              <BlockStack gap="200">
                                <Text as="h2" variant="headingSm">
                                  {t("offerEditor.widget.titleCountdown")}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {t("offerEditor.widget.titleCountdownHelp")}
                                </Text>
                              </BlockStack>

                              <BlockStack gap="300">
                                <Text as="h3" variant="headingSm">
                                  {t("offerEditor.widget.titleCountdown")}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {t("offerEditor.widget.titleCountdownSubHelp")}
                                </Text>
                                <WidgetHeaderAlignFields
                                  idPrefix="vd-volume"
                                  layoutOptionsVariant="volume_table"
                                  widgetHeaderLayout={
                                    widgetDisplay.widgetHeaderLayout
                                  }
                                  widgetHeadingAlign={
                                    widgetDisplay.widgetHeadingAlign
                                  }
                                  countdownAlign={widgetDisplay.countdownAlign}
                                  widgetHeaderMobileStack={
                                    widgetDisplay.widgetHeaderMobileStack
                                  }
                                  widgetHeaderSwapOrder={
                                    widgetDisplay.widgetHeaderSwapOrder
                                  }
                                  patchWidgetDisplay={patchWidgetDisplay}
                                  layoutHelpText={t("offerEditor.widget.layoutHelp")}
                                  headingHelpText={t(
                                    "offerEditor.widget.headingAlignHelp",
                                  )}
                                  timerHelpText={t(
                                    "offerEditor.widget.timerAlignHelp",
                                  )}
                                />
                              </BlockStack>
                            </BlockStack>
                          </Card>
                        ) : null}

                        {isVolumeTableOffer ? (
                          <Card padding="400">
                            <BlockStack gap="300">
                              <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">
                                  {t("offerEditor.appearance.templates")}
                                </Text>
                                <AppearanceTemplateCategoryTabs
                                  value={appearanceTemplateCategory}
                                  onChange={setAppearanceTemplateCategory}
                                />
                              </BlockStack>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {t("offerEditor.appearance.templatesHelpVolume")}
                              </Text>
                              {showAppearanceTemplateUpgrade ||
                              selectedAppearanceTemplateLocked ? (
                                <PlanUpgradeBanner feature="appearanceTemplates" />
                              ) : null}
                              <AppearanceTemplateGrid
                                presets={appearanceTemplatesInCategory}
                                widgetDisplay={widgetDisplay}
                                setWidgetDisplay={setWidgetDisplay}
                                patchWidgetDisplay={patchWidgetDisplay}
                                appearanceTemplates={planCaps.appearanceTemplates}
                                forVolumeTable
                                ariaLabel={t(
                                  "offerEditor.appearance.templatesAriaVolume",
                                )}
                              />
                            </BlockStack>
                          </Card>
                        ) : (
                          <Card padding="400">
                            <BlockStack gap="300">
                              <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">
                                  {t("offerEditor.appearance.templates")}
                                </Text>
                                <AppearanceTemplateCategoryTabs
                                  value={appearanceTemplateCategory}
                                  onChange={setAppearanceTemplateCategory}
                                />
                              </BlockStack>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {t("offerEditor.appearance.templatesHelp")}
                              </Text>
                              {showAppearanceTemplateUpgrade ||
                              selectedAppearanceTemplateLocked ? (
                                <PlanUpgradeBanner feature="appearanceTemplates" />
                              ) : null}
                              <AppearanceTemplateGrid
                                presets={appearanceTemplatesInCategory}
                                widgetDisplay={widgetDisplay}
                                setWidgetDisplay={setWidgetDisplay}
                                patchWidgetDisplay={patchWidgetDisplay}
                                appearanceTemplates={planCaps.appearanceTemplates}
                                forVolumeTable={false}
                                ariaLabel={t(
                                  "offerEditor.appearance.templatesAria",
                                )}
                              />
                            </BlockStack>
                          </Card>
                        )}

                        <Card padding="400">
                          <BlockStack gap="300">
                              <Text as="h3" variant="headingSm">
                                {t("offerEditor.font.type")}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {t("offerEditor.font.typeHelp")}
                              </Text>
                              <FormLayout>
                                <FormLayout.Group>
                                  <BlockStack gap="200">
                                    <Select
                                      id="vd-widget-font-scale"
                                      label={t("offerEditor.font.sizePreset")}
                                      options={WIDGET_FONT_SCALE_OPTIONS.map(
                                        (o) => ({
                                          value: o.value,
                                          label: t(
                                            `offerEditor.font.scalePreset.${o.value}` as AdminUiMessageKey,
                                          ),
                                        }),
                                      )}
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
                                    <InlineStack gap="200">
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
                                        {t("offerEditor.font.resetToPreset")}
                                      </Button>
                                    </InlineStack>
                                  </BlockStack>
                                  <RangeSlider
                                    id="vd-widget-font-scale-percent"
                                    label={t("offerEditor.font.overallScale")}
                                    helpText={t(
                                      "offerEditor.font.overallScaleHelp",
                                    )}
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
                                </FormLayout.Group>
                              </FormLayout>
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="300">
                              <Text as="h3" variant="headingSm">
                                {t("offerEditor.font.sizePx")}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {isVolumeTableOffer
                                  ? t("offerEditor.font.sizePxHelpVolume", {
                                      min: WIDGET_FONT_PX_MIN,
                                      max: WIDGET_FONT_PX_MAX,
                                    })
                                  : t("offerEditor.font.sizePxHelp", {
                                      min: WIDGET_FONT_PX_MIN,
                                      max: WIDGET_FONT_PX_MAX,
                                    })}
                              </Text>
                            <div className={createStyles.widgetFontSizeGrid}>
                              {appearanceFontSizeFields.map((row) => (
                                <div
                                  key={row.key}
                                  className={createStyles.widgetFontSizeRow}
                                >
                                  <Text as="p" variant="bodySm">
                                    {fontRoleLabel(row.key)}
                                  </Text>
                                  <div
                                    className={createStyles.widgetFontSizeControlRow}
                                  >
                                    <div
                                      className={createStyles.widgetFontSizeSliderWrap}
                                    >
                                      <RangeSlider
                                        id={`vd-widget-font-${row.key}`}
                                        label={fontRoleLabel(row.key)}
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
                                        label={fontRoleLabel(row.key)}
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
                                {t("offerEditor.font.weights")}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {isVolumeTableOffer
                                  ? t("offerEditor.font.weightsHelpVolume")
                                  : t("offerEditor.font.weightsHelp")}
                              </Text>
                              <div className={createStyles.widgetFontWeightGrid}>
                                <Select
                                  id="vd-widget-fw-strong"
                                  label={t("offerEditor.font.weightStrong")}
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
                                  label={t("offerEditor.font.weightAccent")}
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
                                    label={t("offerEditor.font.weightBody")}
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
                                  label={t("offerEditor.font.weightNormal")}
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
                                {t("offerEditor.layout.heading")}
                              </Text>
                              {isVolumeTableOffer ? (
                                <>
                                  <RangeSlider
                                    id="vd-widget-card-border-radius"
                                    label={t("offerEditor.layout.tableCornerRadius")}
                                    helpText={t(
                                      "offerEditor.layout.tableCornerRadiusHelp",
                                    )}
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
                                    label={t("offerEditor.layout.tableRowHeight")}
                                    helpText={t(
                                      "offerEditor.layout.tableRowHeightHelp",
                                    )}
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
                                    {t("offerEditor.layout.tableColumns")}
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {t("offerEditor.layout.tableColumnsHelp")}
                                  </Text>
                                  <BlockStack gap="300">
                                    <Text as="p" variant="bodySm" fontWeight="semibold">
                                      {t("offerEditor.layout.columnQuantity")}
                                    </Text>
                                    <Select
                                      id="vd-vt-col-qty-align"
                                      label={t("offerEditor.layout.textAlign")}
                                      options={WIDGET_HEADER_TEXT_ALIGN_OPTIONS.map(
                                        (o) => ({
                                          value: o.value,
                                          label: t(ALIGN_OPTION_LABEL_KEYS[o.value]),
                                        }),
                                      )}
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
                                      label={t("offerEditor.layout.leftPadding")}
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
                                      label={t("offerEditor.layout.rightPadding")}
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
                                      {t("offerEditor.layout.columnDiscount")}
                                    </Text>
                                    <Select
                                      id="vd-vt-col-discount-align"
                                      label={t("offerEditor.layout.textAlign")}
                                      options={WIDGET_HEADER_TEXT_ALIGN_OPTIONS.map(
                                        (o) => ({
                                          value: o.value,
                                          label: t(ALIGN_OPTION_LABEL_KEYS[o.value]),
                                        }),
                                      )}
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
                                      label={t("offerEditor.layout.leftPadding")}
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
                                      label={t("offerEditor.layout.rightPadding")}
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
                                      {t("offerEditor.layout.columnPricePerItem")}
                                    </Text>
                                    <Select
                                      id="vd-vt-col-price-align"
                                      label={t("offerEditor.layout.textAlign")}
                                      options={WIDGET_HEADER_TEXT_ALIGN_OPTIONS.map(
                                        (o) => ({
                                          value: o.value,
                                          label: t(ALIGN_OPTION_LABEL_KEYS[o.value]),
                                        }),
                                      )}
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
                                      label={t("offerEditor.layout.leftPadding")}
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
                                      label={t("offerEditor.layout.rightPadding")}
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
                                    label={t("offerEditor.layout.mainButtonRadius")}
                                    helpText={t(
                                      "offerEditor.layout.mainButtonRadiusHelp",
                                    )}
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
                                <FormLayout>
                                  <FormLayout.Group>
                                    <Select
                                      id="vd-badge-position"
                                      label={t("offerEditor.badge.position")}
                                      helpText={t("offerEditor.badge.positionHelp")}
                                      options={BADGE_POSITION_OPTIONS.map((o) => ({
                                        value: o.value,
                                        label: t(BADGE_POSITION_LABEL_KEYS[o.value]),
                                      }))}
                                      value={widgetDisplay.badgePosition}
                                      onChange={(v) => {
                                        if (isVolumeDiscountBadgePosition(v)) {
                                          patchWidgetDisplay({ badgePosition: v });
                                        }
                                      }}
                                    />
                                    <RangeSlider
                                      id="vd-badge-size-scale"
                                      label={t("offerEditor.badge.size")}
                                      helpText={t("offerEditor.badge.sizeHelp")}
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
                                  </FormLayout.Group>
                                  <BlockStack gap="200">
                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                      {t("offerEditor.badge.design")}
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      {t("offerEditor.badge.designHelp")}
                                    </Text>
                                    <div
                                      className={createStyles.badgeDesignGrid}
                                      style={
                                        {
                                          ["--vd-badge-bg" as string]:
                                            widgetDisplay.badgeBackgroundColor,
                                          ["--vd-badge-text" as string]:
                                            widgetDisplay.badgeTextColor,
                                        } as CSSProperties
                                      }
                                      role="listbox"
                                      aria-label={t("offerEditor.badge.design")}
                                    >
                                      {BADGE_DESIGN_OPTIONS.map((opt) => {
                                        const selected =
                                          widgetDisplay.badgeDesign === opt.value;
                                        return (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            role="option"
                                            aria-selected={selected}
                                            className={[
                                              createStyles.badgeDesignCard,
                                              selected
                                                ? createStyles.badgeDesignCardSelected
                                                : "",
                                            ]
                                              .filter(Boolean)
                                              .join(" ")}
                                            onClick={() => {
                                              if (
                                                isVolumeDiscountBadgeDesign(opt.value)
                                              ) {
                                                patchWidgetDisplay({
                                                  badgeDesign: opt.value,
                                                });
                                              }
                                            }}
                                          >
                                            <span
                                              className={createStyles.badgePill}
                                              data-badge-design={opt.value}
                                            >
                                              {t("offerEditor.badge.previewSale")}
                                            </span>
                                            <span
                                              className={createStyles.badgeDesignLabel}
                                            >
                                              {BADGE_DESIGN_LABEL_KEYS[opt.value]
                                                ? t(
                                                    BADGE_DESIGN_LABEL_KEYS[
                                                      opt.value
                                                    ] as AdminUiMessageKey,
                                                  )
                                                : opt.label}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </BlockStack>
                                  <FormLayout.Group>
                                    <RangeSlider
                                      id="vd-widget-card-border-radius"
                                      label={t("offerEditor.layout.tierCardRadius")}
                                      helpText={t(
                                        "offerEditor.layout.tierCardRadiusHelp",
                                      )}
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
                                      label={t("offerEditor.layout.mainCtaRadius")}
                                      helpText={t(
                                        "offerEditor.layout.mainCtaRadiusHelp",
                                      )}
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
                                  </FormLayout.Group>
                                  <FormLayout.Group>
                                    <RangeSlider
                                      id="vd-widget-control-border-radius"
                                      label={t("offerEditor.layout.qtyAddRadius")}
                                      helpText={t(
                                        "offerEditor.layout.qtyAddRadiusHelp",
                                      )}
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
                                      label={t("offerEditor.layout.tierRadioSize")}
                                      helpText={t(
                                        "offerEditor.layout.tierRadioSizeHelp",
                                      )}
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
                                  </FormLayout.Group>
                                </FormLayout>
                              )}
                          </BlockStack>
                        </Card>

                        <Card padding="400">
                          <BlockStack gap="400">
                              <Text as="h3" variant="headingSm">
                                {t("offerEditor.colors.title")}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {t("offerEditor.colors.help")}
                              </Text>
                            <InlineStack gap="300" wrap>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label={t("offerEditor.colors.primary")}
                                  value={widgetDisplay.primaryColor}
                                  onChange={(hex) =>
                                    patchWidgetDisplay({ primaryColor: hex })
                                  }
                                />
                              </div>
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <WidgetDisplayColorField
                                  label={t("offerEditor.colors.primaryHover")}
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
                                    label={t("offerEditor.colors.badgeBackground")}
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
                                    label={t("offerEditor.colors.badgeText")}
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
                                      ? t("offerEditor.colors.selectedRowBackground")
                                      : t("offerEditor.colors.selectedTierBackground")
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
                                      ? t("offerEditor.colors.tableBorder")
                                      : t("offerEditor.colors.cardBorder")
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
                                    label={t("offerEditor.colors.radioBorder")}
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
                                    label={t("offerEditor.colors.radioAccent")}
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
                                  label={t("offerEditor.colors.countdownBackground")}
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
                                  label={t("offerEditor.colors.countdownText")}
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
                                    label={t("offerEditor.colors.discountColumn")}
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
                                    label={t("offerEditor.colors.savingsLine")}
                                    value={widgetDisplay.savingsColor}
                                    onChange={(hex) =>
                                      patchWidgetDisplay({ savingsColor: hex })
                                    }
                                  />
                                </div>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                  <WidgetDisplayColorField
                                    label={t("offerEditor.colors.optionSubtext")}
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
                                  label={t("offerEditor.colors.mutedText")}
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
                            <InlineStack gap="200" blockAlign="center" wrap>
                              <Text as="h3" variant="headingSm">
                                {t("offerEditor.customCss.title")}
                              </Text>
                              {!planCaps.customCss ? <PlanUpgradeBadge /> : null}
                            </InlineStack>
                            {!planCaps.customCss ? (
                              <PlanUpgradeBanner feature="customCss" />
                            ) : (
                              <>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {isVolumeTableOffer
                                ? t("offerEditor.customCss.helpVolumeTable")
                                : t("offerEditor.customCss.helpTierCard")}
                            </Text>
                            <TextField
                              label={t("offerEditor.customCss.fieldLabel")}
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
                              helpText={t("offerEditor.customCss.maxChars", {
                                n: WIDGET_DISPLAY_CUSTOM_CSS_MAX_CHARS.toLocaleString(),
                              })}
                            />
                              </>
                            )}
                          </BlockStack>
                        </Card>
                      </BlockStack>
                    ) : (
                      <BlockStack gap="400">
                        <Card padding="400">
                          <BlockStack gap="400">
                            <Text as="h2" variant="headingSm">
                              {t("offerEditor.translations.title")}
                            </Text>
                            {!canEditTranslations ? (
                              <PlanUpgradeBanner feature="translations" />
                            ) : null}
                            <Text as="p" tone="subdued">
                              {t("offerEditor.translations.help")}
                            </Text>
                            <Divider />
                            <AdminLanguageDropdown
                              label={t("settings.language")}
                              options={shopLanguages.map((opt) => ({
                                label: opt.label,
                                value: opt.value,
                              }))}
                              value={selectedTransLang}
                              onChange={setSelectedTransLang}
                              disabled={
                                !canEditTranslations || shopLanguages.length === 0
                              }
                              helpText={
                                canEditTranslations
                                  ? t("offerEditor.translations.languageHelp")
                                  : t("settings.languageHelpLocked")
                              }
                            />
                            <InlineStack gap="200" wrap>
                              <Button
                                icon={AutomationIcon}
                                onClick={handleAutoTranslateCampaignLanguage}
                                loading={isAutoTranslating}
                                disabled={
                                  !canEditTranslations ||
                                  selectedTransLang === primaryLang ||
                                  isAutoTranslating
                                }
                                tone="success"
                              >
                                {t("settings.autoTranslate")}
                              </Button>
                              <Button
                                icon={ResetIcon}
                                onClick={handleResetCampaignLanguage}
                                disabled={!canEditTranslations || isAutoTranslating}
                              >
                                {t("settings.reset")}
                              </Button>
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {t("settings.autoTranslateHelp")}
                            </Text>
                            <Divider />
                            <FormLayout>
                              <FormLayout.Group>
                                <TextField
                                  label={t("settings.widgetHeading")}
                                  value={translationFieldValue("transHeading")}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transHeading",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transHeading",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                                <TextField
                                  label={t("settings.ctaText")}
                                  value={translationFieldValue("transCta")}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transCta",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transCta",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                              </FormLayout.Group>
                              <FormLayout.Group>
                                <TextField
                                  label={t("settings.qtyColumn")}
                                  value={translationFieldValue("transQty")}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transQty",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transQty",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                                <TextField
                                  label={t("settings.discountColumn")}
                                  value={translationFieldValue("transDiscount")}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transDiscount",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transDiscount",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                              </FormLayout.Group>
                              <FormLayout.Group>
                                <TextField
                                  label={t("settings.priceColumn")}
                                  value={translationFieldValue("transPrice")}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transPrice",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transPrice",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                                <TextField
                                  label={t("settings.buyPrefix")}
                                  value={translationFieldValue("transBuy")}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transBuy",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transBuy",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                              </FormLayout.Group>
                              <FormLayout.Group>
                                <TextField
                                  label={t("settings.youSave")}
                                  value={translationFieldValue("transYouSave")}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transYouSave",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transYouSave",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                                <TextField
                                  label={t("settings.addLabel")}
                                  value={translationFieldValue("transAdd")}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transAdd",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transAdd",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                              </FormLayout.Group>
                              <FormLayout.Group>
                                <TextField
                                  label={t("settings.cartDiscount")}
                                  value={translationFieldValue(
                                    "transCartDiscount",
                                  )}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transCartDiscount",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transCartDiscount",
                                  )}
                                  disabled={!canEditTranslations}
                                  helpText={t(
                                    "offerEditor.translations.cartBadgeHelp",
                                  )}
                                />
                                <TextField
                                  label={t("settings.cartDiscountQty")}
                                  value={translationFieldValue(
                                    "transCartDiscountQty",
                                  )}
                                  onChange={(v) =>
                                    handleCampaignTranslationFieldChange(
                                      "transCartDiscountQty",
                                      v,
                                    )
                                  }
                                  autoComplete="off"
                                  placeholder={translationFieldPlaceholder(
                                    "transCartDiscountQty",
                                  )}
                                  disabled={!canEditTranslations}
                                />
                              </FormLayout.Group>
                              <TextField
                                label={t("settings.countdown")}
                                value={translationFieldValue("transCountdown")}
                                onChange={(v) =>
                                  handleCampaignTranslationFieldChange(
                                    "transCountdown",
                                    v,
                                  )
                                }
                                autoComplete="off"
                                placeholder={translationFieldPlaceholder(
                                  "transCountdown",
                                )}
                                disabled={!canEditTranslations}
                              />
                              <TextField
                                label={t("settings.footnote")}
                                value={translationFieldValue("transFootnote")}
                                onChange={(v) =>
                                  handleCampaignTranslationFieldChange(
                                    "transFootnote",
                                    v,
                                  )
                                }
                                autoComplete="off"
                                multiline={3}
                                placeholder={translationFieldPlaceholder(
                                  "transFootnote",
                                )}
                                disabled={!canEditTranslations}
                              />
                              <Divider />
                              <Text as="h3" variant="headingSm">
                                {t("offerEditor.translations.tierCopyTitle")}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {t("offerEditor.translations.tierCopyHelp")}
                              </Text>
                              {tiers.map((tier, tierIndex) => {
                                const row =
                                  activeTierCopyRows[tierIndex] ??
                                  emptyTierCopyFields();
                                return (
                                  <BlockStack key={`tier-copy-${tierIndex}`} gap="200">
                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                      {t("offerEditor.translations.tierN", {
                                        n: String(tierIndex + 1),
                                      })}
                                    </Text>
                                    <TextField
                                      label={t("offerEditor.tier.optionLabel")}
                                      value={row.buyLabelText}
                                      onChange={(v) =>
                                        handleCampaignTierCopyFieldChange(
                                          tierIndex,
                                          "buyLabelText",
                                          v,
                                        )
                                      }
                                      autoComplete="off"
                                      placeholder={
                                        tier.buyLabelText.trim() ||
                                        t(
                                          "offerEditor.tier.optionLabelPlaceholder",
                                        )
                                      }
                                      disabled={!canEditTranslations}
                                    />
                                    {!isVolumeTableOffer ? (
                                      <>
                                        <TextField
                                          label={t(
                                            "offerEditor.tier.optionSubtext",
                                          )}
                                          value={row.optionSubtext}
                                          onChange={(v) =>
                                            handleCampaignTierCopyFieldChange(
                                              tierIndex,
                                              "optionSubtext",
                                              v,
                                            )
                                          }
                                          autoComplete="off"
                                          placeholder={
                                            tier.optionSubtext.trim() ||
                                            t(
                                              "offerEditor.tier.optionSubtextPlaceholder",
                                            )
                                          }
                                          disabled={!canEditTranslations}
                                        />
                                        <TextField
                                          label={t("offerEditor.tier.badge")}
                                          value={row.badge}
                                          onChange={(v) =>
                                            handleCampaignTierCopyFieldChange(
                                              tierIndex,
                                              "badge",
                                              v,
                                            )
                                          }
                                          autoComplete="off"
                                          placeholder={
                                            tier.badge.trim() ||
                                            t(
                                              "offerEditor.tier.badgePlaceholder",
                                            )
                                          }
                                          disabled={!canEditTranslations}
                                        />
                                      </>
                                    ) : null}
                                  </BlockStack>
                                );
                              })}
                            </FormLayout>
                          </BlockStack>
                        </Card>
                      </BlockStack>
                    )}
                  </Tabs>
                  </div>
                </Box>
              </div>
              <aside className={createStyles.previewColumn}>
                <BlockStack gap="400">
                  <Card padding="400">
                    <BlockStack gap="200">
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                        gap="300"
                        wrap
                      >
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="h3" variant="headingSm">
                            {t("offerEditor.campaignStatus")}
                          </Text>
                          <Badge tone={statusBadgeTone(editorCampaignStatus)}>
                            {(() => {
                              const key =
                                CAMPAIGN_STATUS_LABEL_KEYS[
                                  editorCampaignStatus.toLowerCase()
                                ];
                              return key ? t(key) : statusLabel(editorCampaignStatus);
                            })()}
                          </Badge>
                        </InlineStack>
                        <Button
                          variant="tertiary"
                          disabled={Boolean(
                            turnOnBlockedReason &&
                              editorCampaignStatus !== "active",
                          )}
                          onClick={() => {
                            setPreviewCampaignOn((v) => {
                              if (v || editorCampaignStatus === "scheduled") {
                                /* Manual off — clear start so it becomes Draft, not Scheduled. */
                                setScheduleStartEnabled(false);
                                setCountdownStartsAtLocal("");
                                return false;
                              }
                              if (scheduleExpired) {
                                return false;
                              }
                              return true;
                            });
                          }}
                        >
                          {editorCampaignStatus === "active"
                            ? t("offerEditor.turnOff")
                            : t("offerEditor.turnOn")}
                        </Button>
                      </InlineStack>
                      {turnOnBlockedReason === "expired" ? (
                        <InlineStack gap="100" blockAlign="center" wrap>
                          <Text as="p" variant="bodySm" tone="critical">
                            {t("offerEditor.expiredHint")}
                          </Text>
                          <button
                            type="button"
                            className={createStyles.scheduleJumpLink}
                            onClick={goToScheduleSettings}
                          >
                            {t("offerEditor.schedule")}
                          </button>
                        </InlineStack>
                      ) : editorCampaignStatus === "scheduled" ? (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t("offerEditor.waitingForStart")}
                          {formatDatetimeLocalDisplay(countdownStartsAtLocal)
                            ? ` (${formatDatetimeLocalDisplay(countdownStartsAtLocal)})`
                            : ""}
                          .
                        </Text>
                      ) : null}
                    </BlockStack>
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
                          {t("offerEditor.productPagePreview")}
                        </Text>
                        <ButtonGroup variant="segmented" noWrap>
                          <Button
                            pressed={previewDevice === "desktop"}
                            icon={DesktopIcon}
                            accessibilityLabel={t("offerEditor.desktopPreview")}
                            onClick={() => setPreviewDevice("desktop")}
                          />
                          <Button
                            pressed={previewDevice === "mobile"}
                            icon={MobileIcon}
                            accessibilityLabel={t("offerEditor.mobilePreview")}
                            onClick={() => setPreviewDevice("mobile")}
                          />
                        </ButtonGroup>
                      </InlineStack>
                      <Text as="p" variant="headingLg" alignment="center">
                        {widgetDisplay.widgetPresentation === "volume_table"
                          ? t("offerEditor.volumeDiscount")
                          : t("offerEditor.quantityBreaks")}
                      </Text>
                      <Box
                        padding="0"
                        background="bg-surface-secondary"
                        borderRadius="200"
                        overflowX="hidden"
                        opacity={
                          editorCampaignStatus === "active" ? undefined : "0.5"
                        }
                      >
                        <div
                          className={
                            previewDevice === "mobile"
                              ? `${createStyles.previewViewport} ${createStyles.previewViewportMobile}`
                              : `${createStyles.previewViewport} ${createStyles.previewViewportDesktop}`
                          }
                          style={
                            editorCampaignStatus === "active"
                              ? undefined
                              : { pointerEvents: "none" as const }
                          }
                        >
                          <Box
                            padding={{ xs: "300", sm: "400" }}
                            background="bg-surface"
                          >
                            <Suspense fallback={<PreviewPanelFallback />}>
                              <QuantityBreaksTailwindPreview
                                rows={productPagePreviewRows}
                                currencySymbol="$"
                                display={widgetDisplay}
                                previewDevice={previewDevice}
                                countdownPreviewNonce={countdownPreviewNonce}
                                countdownEndsAtIso={
                                  scheduleEndEnabled &&
                                  countdownEndsAtLocal.trim()
                                    ? datetimeLocalToIsoUtc(countdownEndsAtLocal, shopTimezone)
                                    : null
                                }
                                countdownStartsAtIso={
                                  scheduleStartEnabled &&
                                  countdownStartsAtLocal.trim()
                                    ? datetimeLocalToIsoUtc(
                                        countdownStartsAtLocal,
                                        shopTimezone,
                                      )
                                    : null
                                }
                              />
                            </Suspense>
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
