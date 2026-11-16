import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { Tabs } from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { useAdminI18n } from "./AdminI18nProvider";
import { PolarisDateTimeField } from "./PolarisDateTimeField";
import { BogoLivePreview } from "./BogoLivePreview";
import {
  BogoAppearancePanel,
  BogoDisplayPanel,
  BogoTranslationsPanel,
  resetBogoWidgetDisplay,
} from "./BogoOfferSettingsPanels";
import type {
  BogoBuysRequirement,
  BogoCampaignStatus,
  BogoGetsValueType,
  BogoItemScope,
} from "../types/bogo";
import {
  datetimeLocalToIsoUtc,
  isoToDatetimeLocalValue,
} from "../utils/countdownTimes";
import { defaultBogoWidgetDisplay } from "../utils/bogoWidgetDisplay";
import { validateBogoClientForm } from "../utils/bogoValidation";
import { formatShopTimezoneDisplay } from "../utils/shopTimezone";
import {
  parseSparseStorefrontTranslations,
  resolveCampaignEnglishSourceForAutoTranslate,
  sparsifyStorefrontTranslations,
  type SparseStorefrontTranslationsMap,
  type StorefrontTranslationFields,
} from "../utils/storefrontTranslations";
import {
  appearanceCategoryForPresetId,
  applyBogoAppearancePreset,
  isVolumeDiscountAppearancePresetId,
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "../utils/widgetDisplay";
import createStyles from "../styles/volume-discount-create.module.css";

/**
 * Shopify `s-text-field` / `s-number-field` often commit to React `onChange` on blur only.
 * Listen to `onInput` as well so form dirty state (Save bar) updates while typing.
 */
function sTextFieldValue(target: EventTarget | null): string {
  if (!target || typeof target !== "object") return "";
  const el = target as HTMLElement & { value?: unknown };
  return typeof el.value === "string" ? el.value : "";
}

const BOGO_SAVE_BAR_ID = "bogo-offer-save-bar";

type BogoFormSnapshot = {
  campaignName: string;
  displayName: string;
  status: BogoCampaignStatus;
  startsAtLocal: string;
  endsAtLocal: string;
  buysRequirement: BogoBuysRequirement;
  buysQuantity: string;
  buysAmount: string;
  buysScope: BogoItemScope;
  buysProductIds: string[];
  buysCollectionIds: string[];
  getsQuantity: string;
  getsScope: BogoItemScope;
  getsProductIds: string[];
  getsCollectionIds: string[];
  getsValueType: BogoGetsValueType;
  getsValue: string;
  usesPerOrderLimit: string;
  widgetDisplay: VolumeDiscountWidgetDisplay;
  displayNameTranslations: SparseStorefrontTranslationsMap;
  combinesWithProductDiscounts: boolean;
  combinesWithOrderDiscounts: boolean;
  combinesWithShippingDiscounts: boolean;
};

function bogoFormSnapshot(s: BogoFormSnapshot): string {
  return JSON.stringify({
    ...s,
    buysProductIds: [...s.buysProductIds].sort(),
    buysCollectionIds: [...s.buysCollectionIds].sort(),
    getsProductIds: [...s.getsProductIds].sort(),
    getsCollectionIds: [...s.getsCollectionIds].sort(),
  });
}

export type BogoCreateViewCampaign = {
  id: string;
  campaignName: string;
  displayName: string | null;
  status: string;
  startsAt: string;
  endsAt: string | null;
  buysRequirement: string;
  buysQuantity: number | null;
  buysAmount: string | null;
  buysScope: string;
  buysProductIds: string[];
  buysCollectionIds: string[];
  getsQuantity: number;
  getsScope: string;
  getsProductIds: string[];
  getsCollectionIds: string[];
  getsValueType: string;
  getsValue: string | null;
  usesPerOrderLimit: number | null;
  widgetDisplay?: unknown;
  displayNameTranslations?: unknown;
  combinesWithProductDiscounts?: boolean;
  combinesWithOrderDiscounts?: boolean;
  combinesWithShippingDiscounts?: boolean;
};

export type BogoCreateViewProps = {
  onBack: () => void;
  onSuccess: () => void;
  defaultCampaignName: string;
  initialCampaign?: BogoCreateViewCampaign | null;
  /** Shopify shop IANA timezone for schedule wall clocks. */
  shopTimezone?: string;
};

type ActionData =
  | { ok: true; campaignId: string }
  | {
      ok: true;
      intent: "autoTranslateCampaign";
      targetLang: string;
      fields: StorefrontTranslationFields;
      message?: string;
    }
  | { ok: false; error: string; intent?: string };

export function BogoCreateView({
  onBack,
  onSuccess,
  defaultCampaignName,
  initialCampaign = null,
  shopTimezone: shopTimezoneProp,
}: BogoCreateViewProps) {
  const { t } = useAdminI18n();
  const shopify = useAppBridge();
  const fetcher = useFetcher<ActionData>();
  const translateFetcher = useFetcher<ActionData>();
  const isEdit = Boolean(initialCampaign?.id);
  const primaryTransLang = "en";
  const shopTimezone = shopTimezoneProp?.trim() || "UTC";
  const shopTimezoneLabel = formatShopTimezoneDisplay(shopTimezone);

  const [campaignName, setCampaignName] = useState(
    () => initialCampaign?.campaignName ?? defaultCampaignName,
  );
  const [displayName, setDisplayName] = useState(
    () => initialCampaign?.displayName ?? "",
  );
  const [status, setStatus] = useState<BogoCampaignStatus>(() => {
    const s = String(initialCampaign?.status ?? "active").toLowerCase();
    if (s === "draft" || s === "scheduled" || s === "archived" || s === "active") {
      return s;
    }
    return "active";
  });
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    isoToDatetimeLocalValue(
      initialCampaign?.startsAt ?? new Date().toISOString(),
      shopTimezone,
    ),
  );
  const [endsAtLocal, setEndsAtLocal] = useState(() =>
    isoToDatetimeLocalValue(initialCampaign?.endsAt ?? null, shopTimezone),
  );

  const [buysRequirement, setBuysRequirement] = useState<BogoBuysRequirement>(
    () =>
      initialCampaign?.buysRequirement === "amount" ? "amount" : "quantity",
  );
  const [buysQuantity, setBuysQuantity] = useState(
    () => String(initialCampaign?.buysQuantity ?? 1),
  );
  const [buysAmount, setBuysAmount] = useState(
    () => initialCampaign?.buysAmount ?? "",
  );
  const [buysScope, setBuysScope] = useState<BogoItemScope>(() =>
    initialCampaign?.buysScope === "collections" ? "collections" : "products",
  );
  const [buysProductIds, setBuysProductIds] = useState<string[]>(
    () => [...(initialCampaign?.buysProductIds ?? [])],
  );
  const [buysCollectionIds, setBuysCollectionIds] = useState<string[]>(
    () => [...(initialCampaign?.buysCollectionIds ?? [])],
  );

  const [getsQuantity, setGetsQuantity] = useState(
    () => String(initialCampaign?.getsQuantity ?? 1),
  );
  const [getsScope, setGetsScope] = useState<BogoItemScope>(() =>
    initialCampaign?.getsScope === "collections" ? "collections" : "products",
  );
  const [getsProductIds, setGetsProductIds] = useState<string[]>(
    () => [...(initialCampaign?.getsProductIds ?? [])],
  );
  const [getsCollectionIds, setGetsCollectionIds] = useState<string[]>(
    () => [...(initialCampaign?.getsCollectionIds ?? [])],
  );
  const [getsValueType, setGetsValueType] = useState<BogoGetsValueType>(() => {
    const v = initialCampaign?.getsValueType;
    if (v === "percentage" || v === "amount") return v;
    return "free";
  });
  const [getsValue, setGetsValue] = useState(
    () => initialCampaign?.getsValue ?? "",
  );
  const [usesPerOrderLimit, setUsesPerOrderLimit] = useState(
    () =>
      initialCampaign?.usesPerOrderLimit != null
        ? String(initialCampaign.usesPerOrderLimit)
        : "",
  );
  const [combineProduct, setCombineProduct] = useState(
    () => initialCampaign?.combinesWithProductDiscounts !== false,
  );
  const [combineOrder, setCombineOrder] = useState(
    () => initialCampaign?.combinesWithOrderDiscounts === true,
  );
  const [combineShipping, setCombineShipping] = useState(
    () => initialCampaign?.combinesWithShippingDiscounts !== false,
  );

  const [widgetDisplay, setWidgetDisplay] = useState<VolumeDiscountWidgetDisplay>(
    () => {
      const bogoDefaults = defaultBogoWidgetDisplay(
        initialCampaign?.displayName ?? defaultCampaignName,
      );
      const raw = initialCampaign?.widgetDisplay;
      const saved =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      return normalizeVolumeDiscountWidgetDisplay({
        ...bogoDefaults,
        ...saved,
      });
    },
  );

  useEffect(() => {
    setWidgetDisplay((prev) => {
      const id = prev.appearanceTemplateId;
      if (
        !isVolumeDiscountAppearancePresetId(id) ||
        appearanceCategoryForPresetId(id) !== "classic"
      ) {
        return prev;
      }
      const next = applyBogoAppearancePreset(prev, id);
      if (JSON.stringify(next.bogoCopy) === JSON.stringify(prev.bogoCopy)) {
        return prev;
      }
      return next;
    });
  }, [widgetDisplay.appearanceTemplateId]);
  const [campaignTranslations, setCampaignTranslations] =
    useState<SparseStorefrontTranslationsMap>(() =>
      parseSparseStorefrontTranslations(
        initialCampaign?.displayNameTranslations,
      ),
    );
  const [selectedTransLang, setSelectedTransLang] = useState("en");
  const [settingsTab, setSettingsTab] = useState(0);

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitLocked, setSubmitLocked] = useState(false);
  const saving = fetcher.state !== "idle" || submitLocked;

  const formBaselineKey = initialCampaign?.id ?? `new:${defaultCampaignName}`;

  const currentFormValues = useMemo(
    (): BogoFormSnapshot => ({
      campaignName,
      displayName,
      status,
      startsAtLocal,
      endsAtLocal,
      buysRequirement,
      buysQuantity,
      buysAmount,
      buysScope,
      buysProductIds,
      buysCollectionIds,
      getsQuantity,
      getsScope,
      getsProductIds,
      getsCollectionIds,
      getsValueType,
      getsValue,
      usesPerOrderLimit,
      widgetDisplay,
      displayNameTranslations: campaignTranslations,
      combinesWithProductDiscounts: combineProduct,
      combinesWithOrderDiscounts: combineOrder,
      combinesWithShippingDiscounts: combineShipping,
    }),
    [
      buysAmount,
      buysCollectionIds,
      buysProductIds,
      buysQuantity,
      buysRequirement,
      buysScope,
      campaignName,
      campaignTranslations,
      combineOrder,
      combineProduct,
      combineShipping,
      displayName,
      endsAtLocal,
      getsCollectionIds,
      getsProductIds,
      getsQuantity,
      getsScope,
      getsValue,
      getsValueType,
      startsAtLocal,
      status,
      usesPerOrderLimit,
      widgetDisplay,
    ],
  );

  const currentFormSnapshot = useMemo(
    () => bogoFormSnapshot(currentFormValues),
    [currentFormValues],
  );

  const baselineKeyRef = useRef(formBaselineKey);
  const baselineSnapshotRef = useRef<string | null>(null);
  const baselineValuesRef = useRef(currentFormValues);
  if (
    baselineSnapshotRef.current === null ||
    baselineKeyRef.current !== formBaselineKey
  ) {
    baselineKeyRef.current = formBaselineKey;
    baselineSnapshotRef.current = currentFormSnapshot;
    baselineValuesRef.current = currentFormValues;
  }
  const formIsDirty = currentFormSnapshot !== baselineSnapshotRef.current;

  const applyFormValues = useCallback((v: BogoFormSnapshot) => {
    setCampaignName(v.campaignName);
    setDisplayName(v.displayName);
    setStatus(v.status);
    setStartsAtLocal(v.startsAtLocal);
    setEndsAtLocal(v.endsAtLocal);
    setBuysRequirement(v.buysRequirement);
    setBuysQuantity(v.buysQuantity);
    setBuysAmount(v.buysAmount);
    setBuysScope(v.buysScope);
    setBuysProductIds([...v.buysProductIds]);
    setBuysCollectionIds([...v.buysCollectionIds]);
    setGetsQuantity(v.getsQuantity);
    setGetsScope(v.getsScope);
    setGetsProductIds([...v.getsProductIds]);
    setGetsCollectionIds([...v.getsCollectionIds]);
    setGetsValueType(v.getsValueType);
    setGetsValue(v.getsValue);
    setUsesPerOrderLimit(v.usesPerOrderLimit);
    setWidgetDisplay(v.widgetDisplay);
    setCampaignTranslations(v.displayNameTranslations);
    setCombineProduct(v.combinesWithProductDiscounts);
    setCombineOrder(v.combinesWithOrderDiscounts);
    setCombineShipping(v.combinesWithShippingDiscounts);
  }, []);

  const handleDiscard = useCallback(() => {
    applyFormValues(baselineValuesRef.current);
    setFormError(null);
  }, [applyFormValues]);

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

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    setSubmitLocked(false);
    if (!fetcher.data) return;
    if (fetcher.data.ok) {
      if (
        "intent" in fetcher.data &&
        fetcher.data.intent === "autoTranslateCampaign"
      ) {
        return;
      }
      baselineSnapshotRef.current = currentFormSnapshot;
      baselineValuesRef.current = currentFormValues;
      onSuccess();
      return;
    }
    setFormError(fetcher.data.error);
    shopify.toast.show(fetcher.data.error);
    // Snapshot refs only read on success; omit from deps to avoid re-firing onSuccess.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [fetcher.data, fetcher.state, onSuccess, shopify]);

  useEffect(() => {
    if (translateFetcher.state !== "idle" || !translateFetcher.data) return;
    const result = translateFetcher.data;
    if (result.ok && "intent" in result && result.intent === "autoTranslateCampaign") {
      const sparse = sparsifyStorefrontTranslations({
        [result.targetLang]: result.fields,
      });
      setCampaignTranslations((prev) => ({
        ...prev,
        ...sparse,
      }));
      shopify.toast.show(
        result.message || t("settings.toast.autoTranslateComplete"),
      );
      return;
    }
    if (!result.ok && result.error) {
      shopify.toast.show(result.error);
    }
  }, [translateFetcher.data, translateFetcher.state, shopify, t]);

  const handleAutoTranslate = useCallback(() => {
    if (selectedTransLang === primaryTransLang) {
      shopify.toast.show(t("settings.toast.englishSource"));
      return;
    }
    const englishSource = resolveCampaignEnglishSourceForAutoTranslate({
      primaryLang: primaryTransLang,
      campaignOverrides: campaignTranslations,
      widgetHeading: widgetDisplay.widgetHeading,
      ctaLabel: widgetDisplay.ctaLabel,
      footnote: widgetDisplay.footnote,
      displayName,
      bogoBadge: widgetDisplay.bogoCopy.badgeLabel,
      bogoBuy: widgetDisplay.bogoCopy.buyLabel,
      bogoGetFree: widgetDisplay.bogoCopy.getFreeLabel,
      bogoGet: widgetDisplay.bogoCopy.getLabel,
      bogoPick: widgetDisplay.bogoCopy.pickLabel,
      bogoPickPlural: widgetDisplay.bogoCopy.pickLabelPlural,
      bogoAvailable: widgetDisplay.bogoCopy.availableLabel,
      bogoFree: widgetDisplay.bogoCopy.freeLabel,
    });
    const fd = new FormData();
    fd.set("intent", "autoTranslateCampaign");
    fd.set("targetLang", selectedTransLang);
    fd.set("sourceLang", primaryTransLang);
    fd.set("englishSource", JSON.stringify(englishSource));
    fd.set("englishTiers", "[]");
    translateFetcher.submit(fd, { method: "post" });
  }, [
    campaignTranslations,
    displayName,
    primaryTransLang,
    selectedTransLang,
    shopify,
    t,
    translateFetcher,
    widgetDisplay.bogoCopy,
    widgetDisplay.ctaLabel,
    widgetDisplay.footnote,
    widgetDisplay.widgetHeading,
  ]);

  /* Ensure App Bridge SaveBar does not linger on Offers after leaving editor. */
  useEffect(() => {
    return () => {
      void shopify.saveBar.hide?.(BOGO_SAVE_BAR_ID);
    };
  }, [shopify]);

  const openResourcePicker = useCallback(
    async (opts: {
      type: "product" | "collection";
      selectionIds: string[];
    }): Promise<string[] | undefined> => {
      const resourcePicker = (
        shopify as unknown as {
          resourcePicker?: (args: {
            type: "product" | "collection";
            multiple: boolean;
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
        selectionIds: opts.selectionIds.map((id) => ({ id })),
      });
      if (!selected?.length) return undefined;
      return selected.map((r) => r.id);
    },
    [shopify],
  );

  const browseBuys = useCallback(async () => {
    if (buysScope === "collections") {
      const ids = await openResourcePicker({
        type: "collection",
        selectionIds: buysCollectionIds,
      });
      if (ids) setBuysCollectionIds(ids);
      return;
    }
    const ids = await openResourcePicker({
      type: "product",
      selectionIds: buysProductIds,
    });
    if (ids) setBuysProductIds(ids);
  }, [buysCollectionIds, buysProductIds, buysScope, openResourcePicker]);

  const browseGets = useCallback(async () => {
    if (getsScope === "collections") {
      const ids = await openResourcePicker({
        type: "collection",
        selectionIds: getsCollectionIds,
      });
      if (ids) setGetsCollectionIds(ids);
      return;
    }
    const ids = await openResourcePicker({
      type: "product",
      selectionIds: getsProductIds,
    });
    if (ids) setGetsProductIds(ids);
  }, [getsCollectionIds, getsProductIds, getsScope, openResourcePicker]);

  const buildFormData = useCallback(() => {
    const fd = new FormData();
    fd.set("campaignName", campaignName);
    fd.set("displayName", displayName);
    fd.set("status", status);
    fd.set(
      "startsAt",
      datetimeLocalToIsoUtc(startsAtLocal, shopTimezone) ||
        new Date().toISOString(),
    );
    fd.set(
      "endsAt",
      datetimeLocalToIsoUtc(endsAtLocal, shopTimezone) ?? "",
    );
    fd.set("buysRequirement", buysRequirement);
    fd.set("buysQuantity", buysQuantity);
    fd.set("buysAmount", buysAmount);
    fd.set("buysScope", buysScope);
    fd.set("buysProductIds", JSON.stringify(buysProductIds));
    fd.set("buysCollectionIds", JSON.stringify(buysCollectionIds));
    fd.set("getsQuantity", getsQuantity);
    fd.set("getsScope", getsScope);
    fd.set("getsProductIds", JSON.stringify(getsProductIds));
    fd.set("getsCollectionIds", JSON.stringify(getsCollectionIds));
    fd.set("getsValueType", getsValueType);
    fd.set("getsValue", getsValue);
    fd.set("usesPerOrderLimit", usesPerOrderLimit);
    fd.set("widgetDisplay", JSON.stringify(widgetDisplay));
    fd.set(
      "displayNameTranslations",
      JSON.stringify(sparsifyStorefrontTranslations(campaignTranslations)),
    );
    fd.set("combinesWithProduct", combineProduct ? "1" : "0");
    fd.set("combinesWithOrder", combineOrder ? "1" : "0");
    fd.set("combinesWithShipping", combineShipping ? "1" : "0");
    return fd;
  }, [
    buysAmount,
    buysCollectionIds,
    buysProductIds,
    buysQuantity,
    buysRequirement,
    buysScope,
    campaignName,
    campaignTranslations,
    combineOrder,
    combineProduct,
    combineShipping,
    displayName,
    endsAtLocal,
    getsCollectionIds,
    getsProductIds,
    getsQuantity,
    getsScope,
    getsValue,
    getsValueType,
    shopTimezone,
    startsAtLocal,
    status,
    usesPerOrderLimit,
    widgetDisplay,
  ]);

  const submit = useCallback(
    (nextStatus?: BogoCampaignStatus) => {
      if (submitLocked || fetcher.state !== "idle") return;
      setFormError(null);
      const startsAtIso =
        datetimeLocalToIsoUtc(startsAtLocal, shopTimezone) ||
        new Date().toISOString();
      const endsAtIso =
        datetimeLocalToIsoUtc(endsAtLocal, shopTimezone) ?? "";
      const clientError = validateBogoClientForm({
        campaignName,
        startsAtIso,
        endsAtIso,
        buysRequirement,
        buysQuantity,
        buysAmount,
        buysScope,
        buysProductIds,
        buysCollectionIds,
        getsQuantity,
        getsScope,
        getsProductIds,
        getsCollectionIds,
        getsValueType,
        getsValue,
        usesPerOrderLimit,
      });
      if (clientError) {
        setFormError(clientError);
        shopify.toast.show(clientError);
        return;
      }
      setSubmitLocked(true);
      const fd = buildFormData();
      if (nextStatus) fd.set("status", nextStatus);
      fetcher.submit(fd, { method: "post" });
    },
    [
      buildFormData,
      buysAmount,
      buysCollectionIds,
      buysProductIds,
      buysQuantity,
      buysRequirement,
      buysScope,
      campaignName,
      endsAtLocal,
      fetcher,
      getsCollectionIds,
      getsProductIds,
      getsQuantity,
      getsScope,
      getsValue,
      getsValueType,
      shopTimezone,
      shopify,
      startsAtLocal,
      submitLocked,
      usesPerOrderLimit,
    ],
  );

  const statusOptions = useMemo(
    () => [
      { label: t("offers.status.active"), value: "active" },
      { label: t("offers.status.draft"), value: "draft" },
      { label: t("offers.status.scheduled"), value: "scheduled" },
    ],
    [t],
  );

  const buysCount =
    buysScope === "collections"
      ? buysCollectionIds.length
      : buysProductIds.length;
  const getsCount =
    getsScope === "collections"
      ? getsCollectionIds.length
      : getsProductIds.length;

  const title = isEdit ? t("bogo.editTitle") : t("bogo.createTitle");

  return (
    <s-page inlineSize="base" heading={title}>
      <SaveBar
        id={BOGO_SAVE_BAR_ID}
        open={formIsDirty}
        discardConfirmation
      >
        <button type="button" disabled={saving} onClick={handleDiscard}>
          {t("offerEditor.discard")}
        </button>
        <button
          type="button"
          variant="primary"
          disabled={saving || (isEdit && !formIsDirty)}
          onClick={() => submit()}
        >
          {t("common.save")}
        </button>
      </SaveBar>

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
            accessibilityLabel={t("offers.back")}
            onClick={() => void handleBack()}
          >
            {t("offers.back")}
          </s-button>
          {/* Polaris web: s-stack — draft + save actions */}
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-button
              variant="secondary"
              disabled={saving}
              onClick={() => submit("draft")}
            >
              {t("bogo.saveDraft")}
            </s-button>
            <s-button
              variant="primary"
              disabled={saving || (isEdit && !formIsDirty)}
              loading={fetcher.state !== "idle"}
              onClick={() => submit()}
            >
              {t("common.save")}
            </s-button>
          </s-stack>
        </s-stack>

        {formError ? (
          // Polaris web: s-banner — same formError dismiss
          <s-banner
            tone="critical"
            dismissible
            onDismiss={() => setFormError(null)}
          >
            {formError}
          </s-banner>
        ) : null}

        <div
          className={createStyles.formWithPreview}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(18rem, 30rem)",
            gap: "1rem",
            alignItems: "start",
            width: "100%",
          }}
        >
          <div className={createStyles.formColumn} style={{ minWidth: 0 }}>
            {/* Polaris web: s-stack — BOGO editor form column */}
            <s-stack direction="block" gap="base">
              <s-banner tone="info">{t("bogo.shopifyNote")}</s-banner>

              <div
                className={createStyles.offerSettingsTabs}
                style={{ width: "100%", minHeight: "2.75rem" }}
              >
                <Tabs
                  fitted
                  tabs={[
                    {
                      id: "rules",
                      content: t("offerEditor.tab.rules"),
                      panelID: "bogo-rules-panel",
                    },
                    {
                      id: "display",
                      content: t("offerEditor.tab.display"),
                      panelID: "bogo-display-panel",
                    },
                    {
                      id: "appearance",
                      content: t("offerEditor.tab.appearance"),
                      panelID: "bogo-appearance-panel",
                    },
                    {
                      id: "translations",
                      content: t("offerEditor.tab.translations"),
                      panelID: "bogo-translations-panel",
                    },
                  ]}
                  selected={settingsTab}
                  onSelect={setSettingsTab}
                >
                  {settingsTab === 0 ? (
                    // Polaris web: Rules tab — same campaign / buys / gets / combinations handlers
                    <s-stack direction="block" gap="base">
                      <s-box
                        padding="large-200"
                        borderWidth="base"
                        borderRadius="large"
                        background="base"
                      >
                        <s-stack direction="block" gap="base">
                          <s-heading>{t("bogo.section.campaign")}</s-heading>
                          <s-text-field
                            label={t("bogo.field.campaignName")}
                            value={campaignName}
                            onChange={(e) =>
                              setCampaignName(sTextFieldValue(e.currentTarget))
                            }
                            onInput={(e) =>
                              setCampaignName(sTextFieldValue(e.currentTarget))
                            }
                            autocomplete="off"
                          />
                          <s-select
                            label={t("bogo.field.status")}
                            value={status}
                            onChange={(e) =>
                              setStatus(
                                String(e.currentTarget.value || "") as BogoCampaignStatus,
                              )
                            }
                            onInput={(e) =>
                              setStatus(
                                String(e.currentTarget.value || "") as BogoCampaignStatus,
                              )
                            }
                          >
                            {statusOptions.map((o) => (
                              <s-option key={o.value} value={o.value}>
                                {o.label}
                              </s-option>
                            ))}
                          </s-select>
                          <s-stack direction="block" gap="small-200">
                            <s-paragraph color="subdued">
                              {shopTimezoneLabel
                                ? t("offerEditor.schedule.timezone", {
                                    tz: shopTimezoneLabel,
                                  })
                                : t("offerEditor.schedule.timezoneFallback")}
                            </s-paragraph>
                            <PolarisDateTimeField
                              label={`${t("bogo.field.startsAt")} *`}
                              value={startsAtLocal}
                              onChange={setStartsAtLocal}
                              shopTimezone={shopTimezone}
                            />
                            <PolarisDateTimeField
                              label={t("bogo.field.endsAt")}
                              value={endsAtLocal}
                              onChange={setEndsAtLocal}
                              shopTimezone={shopTimezone}
                              helpText={t("bogo.field.endsAtHelp")}
                            />
                          </s-stack>
                        </s-stack>
                      </s-box>

                      <s-box
                        padding="large-200"
                        borderWidth="base"
                        borderRadius="large"
                        background="base"
                      >
                        <s-stack direction="block" gap="base">
                          <s-heading>{t("bogo.section.customerBuys")}</s-heading>
                          <s-select
                            label={t("bogo.field.buysRequirement")}
                            value={buysRequirement}
                            onChange={(e) =>
                              setBuysRequirement(
                                String(e.currentTarget.value || "") as BogoBuysRequirement,
                              )
                            }
                            onInput={(e) =>
                              setBuysRequirement(
                                String(e.currentTarget.value || "") as BogoBuysRequirement,
                              )
                            }
                          >
                            <s-option value="quantity">
                              {t("bogo.buys.quantity")}
                            </s-option>
                            <s-option value="amount">
                              {t("bogo.buys.amount")}
                            </s-option>
                          </s-select>
                          {buysRequirement === "quantity" ? (
                            <s-number-field
                              label={t("bogo.field.buysQuantity")}
                              min={1}
                              step={1}
                              value={buysQuantity}
                              onChange={(e) =>
                                setBuysQuantity(String(e.currentTarget.value ?? ""))
                              }
                              onInput={(e) =>
                                setBuysQuantity(String(e.currentTarget.value ?? ""))
                              }
                              autocomplete="off"
                            />
                          ) : (
                            <s-number-field
                              label={t("bogo.field.buysAmount")}
                              min={0.01}
                              step={0.01}
                              value={buysAmount}
                              onChange={(e) =>
                                setBuysAmount(String(e.currentTarget.value ?? ""))
                              }
                              onInput={(e) =>
                                setBuysAmount(String(e.currentTarget.value ?? ""))
                              }
                              autocomplete="off"
                            />
                          )}
                          <s-select
                            label={t("bogo.field.itemScope")}
                            value={buysScope}
                            onChange={(e) =>
                              setBuysScope(
                                String(e.currentTarget.value || "") as BogoItemScope,
                              )
                            }
                            onInput={(e) =>
                              setBuysScope(
                                String(e.currentTarget.value || "") as BogoItemScope,
                              )
                            }
                          >
                            <s-option value="products">
                              {t("bogo.scope.products")}
                            </s-option>
                            <s-option value="collections">
                              {t("bogo.scope.collections")}
                            </s-option>
                          </s-select>
                          <s-stack
                            direction="inline"
                            gap="small"
                            alignItems="center"
                          >
                            <s-button onClick={browseBuys}>
                              {t("bogo.browse")}
                            </s-button>
                            <s-text color="subdued">
                              {buysScope === "collections"
                                ? t("bogo.selectedCollections", {
                                    n: buysCount,
                                  })
                                : t("bogo.selectedProducts", {
                                    n: buysCount,
                                  })}
                            </s-text>
                          </s-stack>
                        </s-stack>
                      </s-box>

                      <s-box
                        padding="large-200"
                        borderWidth="base"
                        borderRadius="large"
                        background="base"
                      >
                        <s-stack direction="block" gap="base">
                          <s-heading>{t("bogo.section.customerGets")}</s-heading>
                          <s-number-field
                            label={t("bogo.field.getsQuantity")}
                            min={1}
                            step={1}
                            value={getsQuantity}
                            onChange={(e) =>
                              setGetsQuantity(String(e.currentTarget.value ?? ""))
                            }
                            onInput={(e) =>
                              setGetsQuantity(String(e.currentTarget.value ?? ""))
                            }
                            autocomplete="off"
                          />
                          <s-select
                            label={t("bogo.field.itemScope")}
                            value={getsScope}
                            onChange={(e) =>
                              setGetsScope(
                                String(e.currentTarget.value || "") as BogoItemScope,
                              )
                            }
                            onInput={(e) =>
                              setGetsScope(
                                String(e.currentTarget.value || "") as BogoItemScope,
                              )
                            }
                          >
                            <s-option value="products">
                              {t("bogo.scope.products")}
                            </s-option>
                            <s-option value="collections">
                              {t("bogo.scope.collections")}
                            </s-option>
                          </s-select>
                          <s-stack
                            direction="inline"
                            gap="small"
                            alignItems="center"
                          >
                            <s-button onClick={browseGets}>
                              {t("bogo.browse")}
                            </s-button>
                            <s-text color="subdued">
                              {getsScope === "collections"
                                ? t("bogo.selectedCollections", {
                                    n: getsCount,
                                  })
                                : t("bogo.selectedProducts", {
                                    n: getsCount,
                                  })}
                            </s-text>
                          </s-stack>
                          <s-select
                            label={t("bogo.field.getsValueType")}
                            value={getsValueType}
                            onChange={(e) =>
                              setGetsValueType(
                                String(e.currentTarget.value || "") as BogoGetsValueType,
                              )
                            }
                            onInput={(e) =>
                              setGetsValueType(
                                String(e.currentTarget.value || "") as BogoGetsValueType,
                              )
                            }
                          >
                            <s-option value="free">{t("bogo.gets.free")}</s-option>
                            <s-option value="percentage">
                              {t("bogo.gets.percentage")}
                            </s-option>
                            <s-option value="amount">
                              {t("bogo.gets.amount")}
                            </s-option>
                          </s-select>
                          {getsValueType !== "free" ? (
                            <s-number-field
                              label={
                                getsValueType === "percentage"
                                  ? t("bogo.field.getsPercent")
                                  : t("bogo.field.getsAmount")
                              }
                              min={getsValueType === "percentage" ? 1 : 0.01}
                              max={
                                getsValueType === "percentage" ? 100 : undefined
                              }
                              step={getsValueType === "percentage" ? 1 : 0.01}
                              value={getsValue}
                              onChange={(e) =>
                                setGetsValue(String(e.currentTarget.value ?? ""))
                              }
                              onInput={(e) =>
                                setGetsValue(String(e.currentTarget.value ?? ""))
                              }
                              autocomplete="off"
                            />
                          ) : null}
                          <s-number-field
                            label={t("bogo.field.usesPerOrderLimit")}
                            details={t("bogo.field.usesPerOrderLimitHelp")}
                            min={1}
                            step={1}
                            value={usesPerOrderLimit}
                            onChange={(e) =>
                              setUsesPerOrderLimit(
                                String(e.currentTarget.value ?? ""),
                              )
                            }
                            onInput={(e) =>
                              setUsesPerOrderLimit(
                                String(e.currentTarget.value ?? ""),
                              )
                            }
                            autocomplete="off"
                          />
                        </s-stack>
                      </s-box>

                      <s-box
                        padding="large-200"
                        borderWidth="base"
                        borderRadius="large"
                        background="base"
                      >
                        <s-stack direction="block" gap="small">
                          <s-heading>{t("settings.combinations")}</s-heading>
                          <s-paragraph color="subdued">
                            {t("bogo.combinationsHelp")}
                          </s-paragraph>
                          <s-stack direction="block" gap="small-200">
                            <s-checkbox
                              label={t("settings.combineProduct")}
                              details={t("settings.combineProductHelp")}
                              checked={combineProduct}
                              onChange={(e) =>
                                setCombineProduct(
                                  Boolean(e.currentTarget.checked),
                                )
                              }
                            />
                            <s-checkbox
                              label={t("settings.combineOrder")}
                              details={t("settings.combineOrderHelp")}
                              checked={combineOrder}
                              onChange={(e) =>
                                setCombineOrder(
                                  Boolean(e.currentTarget.checked),
                                )
                              }
                            />
                            <s-checkbox
                              label={t("settings.combineShipping")}
                              details={t("settings.combineShippingHelp")}
                              checked={combineShipping}
                              onChange={(e) =>
                                setCombineShipping(
                                  Boolean(e.currentTarget.checked),
                                )
                              }
                            />
                          </s-stack>
                        </s-stack>
                      </s-box>
                    </s-stack>
                  ) : null}

                  {settingsTab === 1 ? (
                    // Polaris web: Display tab — cart/checkout + BogoDisplayPanel
                    <s-stack direction="block" gap="base">
                      <s-box
                        padding="large-200"
                        borderWidth="base"
                        borderRadius="large"
                        background="base"
                      >
                        <s-stack direction="block" gap="base">
                          <s-heading>{t("offerEditor.cartCheckout")}</s-heading>
                          <s-text-field
                            label={t("bogo.field.displayName")}
                            details={t("bogo.field.displayNameHelp")}
                            value={displayName}
                            onChange={(e) =>
                              setDisplayName(sTextFieldValue(e.currentTarget))
                            }
                            onInput={(e) =>
                              setDisplayName(sTextFieldValue(e.currentTarget))
                            }
                            autocomplete="off"
                          />
                        </s-stack>
                      </s-box>
                      <BogoDisplayPanel
                        widgetDisplay={widgetDisplay}
                        onChange={(patch) =>
                          setWidgetDisplay((prev) =>
                            normalizeVolumeDiscountWidgetDisplay({
                              ...prev,
                              ...patch,
                            }),
                          )
                        }
                      />
                    </s-stack>
                  ) : null}

                  {settingsTab === 2 ? (
                    <BogoAppearancePanel
                      widgetDisplay={widgetDisplay}
                      onChange={(patch) =>
                        setWidgetDisplay((prev) =>
                          normalizeVolumeDiscountWidgetDisplay({
                            ...prev,
                            ...patch,
                          }),
                        )
                      }
                      onApplyDisplay={(next) =>
                        setWidgetDisplay(
                          normalizeVolumeDiscountWidgetDisplay(next),
                        )
                      }
                      onReset={() =>
                        setWidgetDisplay(resetBogoWidgetDisplay(displayName))
                      }
                    />
                  ) : null}

                  {settingsTab === 3 ? (
                    <BogoTranslationsPanel
                      translations={{
                        ...campaignTranslations,
                        en: {
                          ...(campaignTranslations.en ?? {}),
                          transHeading: widgetDisplay.widgetHeading,
                          transCta: widgetDisplay.ctaLabel,
                          transFootnote: widgetDisplay.footnote,
                          transBogoBadge: widgetDisplay.bogoCopy.badgeLabel,
                          transBogoBuy: widgetDisplay.bogoCopy.buyLabel,
                          transBogoGetFree: widgetDisplay.bogoCopy.getFreeLabel,
                          transBogoGet: widgetDisplay.bogoCopy.getLabel,
                          transBogoPick: widgetDisplay.bogoCopy.pickLabel,
                          transBogoPickPlural: widgetDisplay.bogoCopy.pickLabelPlural,
                          transBogoAvailable: widgetDisplay.bogoCopy.availableLabel,
                          transBogoFree: widgetDisplay.bogoCopy.freeLabel,
                        },
                      }}
                      selectedLang={selectedTransLang}
                      primaryLang={primaryTransLang}
                      onSelectedLangChange={setSelectedTransLang}
                      autoTranslating={translateFetcher.state !== "idle"}
                      onAutoTranslate={handleAutoTranslate}
                      onFieldChange={(field, value) => {
                        if (selectedTransLang === primaryTransLang) {
                          if (field === "transHeading") {
                            setWidgetDisplay((prev) =>
                              normalizeVolumeDiscountWidgetDisplay({
                                ...prev,
                                widgetHeading: value,
                              }),
                            );
                            return;
                          }
                          if (field === "transCta") {
                            setWidgetDisplay((prev) =>
                              normalizeVolumeDiscountWidgetDisplay({
                                ...prev,
                                ctaLabel: value,
                              }),
                            );
                            return;
                          }
                          if (field === "transFootnote") {
                            setWidgetDisplay((prev) =>
                              normalizeVolumeDiscountWidgetDisplay({
                                ...prev,
                                footnote: value,
                              }),
                            );
                            return;
                          }
                          const copyKey = {
                            transBogoBadge: "badgeLabel",
                            transBogoBuy: "buyLabel",
                            transBogoGetFree: "getFreeLabel",
                            transBogoGet: "getLabel",
                            transBogoPick: "pickLabel",
                            transBogoPickPlural: "pickLabelPlural",
                            transBogoAvailable: "availableLabel",
                            transBogoFree: "freeLabel",
                          }[field];
                          if (copyKey) {
                            setWidgetDisplay((prev) =>
                              normalizeVolumeDiscountWidgetDisplay({
                                ...prev,
                                bogoCopy: { ...prev.bogoCopy, [copyKey]: value },
                              }),
                            );
                            return;
                          }
                        }
                        setCampaignTranslations((prev) => {
                          const next: SparseStorefrontTranslationsMap = {
                            ...prev,
                          };
                          const langFields = {
                            ...(next[selectedTransLang] ?? {}),
                          };
                          if (!value.trim()) {
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
                      }}
                      onResetLang={() => {
                        setCampaignTranslations((prev) => {
                          const next = { ...prev };
                          delete next[selectedTransLang];
                          return next;
                        });
                        shopify.toast.show(t("bogo.translations.toast.reset"));
                      }}
                    />
                  ) : null}
                </Tabs>
              </div>
            </s-stack>
          </div>

          <aside
            className={createStyles.previewColumn}
            style={{
              position: "sticky",
              top: "0.75rem",
              alignSelf: "start",
              minWidth: 0,
            }}
          >
            <BogoLivePreview
              campaignName={campaignName}
              displayName={displayName}
              status={status}
              buysRequirement={buysRequirement}
              buysQuantity={buysQuantity}
              buysAmount={buysAmount}
              buysScope={buysScope}
              buysCount={buysCount}
              getsQuantity={getsQuantity}
              getsScope={getsScope}
              getsCount={getsCount}
              getsValueType={getsValueType}
              getsValue={getsValue}
              usesPerOrderLimit={usesPerOrderLimit}
              widgetDisplay={widgetDisplay}
              previewDevice={previewDevice}
              onPreviewDeviceChange={setPreviewDevice}
              onStatusChange={setStatus}
            />
          </aside>
        </div>
      </div>
    </s-page>
  );
}
