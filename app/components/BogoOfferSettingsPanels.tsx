import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AppearanceTemplateCategoryTabs } from "./AppearanceTemplateCategoryTabs";
import { AppearanceTemplateGrid } from "./AppearanceTemplateGrid";
import { useAdminI18n } from "./AdminI18nProvider";
import { WidgetDisplayColorField } from "./WidgetDisplayColorField";
import {
  translationPresetForLanguage,
  type SparseStorefrontTranslationsMap,
  type StorefrontTranslationFields,
} from "../utils/storefrontTranslations";
import type { AdminUiMessageKey } from "../utils/adminUiMessages";
import {
  appearanceCategoryForPresetId,
  appearancePresetsForCategory,
  type AppearanceTemplateCategory,
  type VolumeDiscountWidgetDisplay,
} from "../utils/widgetDisplay";
import { CTA_BUTTON_ACTION_OPTIONS } from "../utils/widgetDisplay";
import { defaultBogoWidgetDisplay } from "../utils/bogoWidgetDisplay";
import type { BogoWidgetCopy } from "../utils/bogoWidgetCopy";

/**
 * Shopify `s-text-field` / `s-number-field` often commit to React `onChange` on blur only.
 * Listen to `onInput` as well so form dirty state (Save bar) updates while typing.
 */
function sTextFieldValue(target: EventTarget | null): string {
  if (!target || typeof target !== "object") return "";
  const el = target as HTMLElement & { value?: unknown };
  return typeof el.value === "string" ? el.value : "";
}

const BOGO_TRANS_FIELDS = [
  "transHeading",
  "transFootnote",
  "transBogoBadge",
  "transBogoBuy",
  "transBogoGetFree",
  "transBogoGet",
  "transBogoPick",
  "transBogoPickPlural",
  "transBogoAvailable",
  "transBogoFree",
  "transCta",
] as const;

const BOGO_COPY_FIELDS: Array<{
  key: keyof BogoWidgetCopy;
  label: AdminUiMessageKey;
  help?: AdminUiMessageKey;
  multiline?: boolean;
}> = [
  { key: "badgeLabel", label: "bogo.copy.badge" },
  { key: "buyLabel", label: "bogo.copy.buy" },
  { key: "getFreeLabel", label: "bogo.copy.getFree" },
  { key: "getLabel", label: "bogo.copy.get" },
  { key: "pickLabel", label: "bogo.copy.pick", help: "bogo.copy.pickHelp" },
  {
    key: "pickLabelPlural",
    label: "bogo.copy.pickPlural",
    help: "bogo.copy.pickHelp",
  },
  {
    key: "availableLabel",
    label: "bogo.copy.available",
    help: "bogo.copy.availableHelp",
  },
  { key: "freeLabel", label: "bogo.copy.free" },
];

type BogoTransField = (typeof BOGO_TRANS_FIELDS)[number];

const FALLBACK_LANGS = [
  { label: "English (EN)", value: "en" },
  { label: "French (FR)", value: "fr" },
  { label: "German (DE)", value: "de" },
  { label: "Spanish (ES)", value: "es" },
  { label: "Italian (IT)", value: "it" },
  { label: "Dutch (NL)", value: "nl" },
  { label: "Portuguese (PT)", value: "pt-PT" },
];

function InlineStackBetween({
  title,
  action,
}: {
  title: string;
  action: ReactNode;
}) {
  return (
    // Polaris web: s-stack — title + action row
    <s-stack
      direction="inline"
      gap="small"
      alignItems="center"
      justifyContent="space-between"
    >
      <s-heading>{title}</s-heading>
      {action}
    </s-stack>
  );
}

/** Product-page copy (primary language). */
export function BogoDisplayPanel({
  widgetDisplay,
  onChange,
}: {
  widgetDisplay: VolumeDiscountWidgetDisplay;
  onChange: (patch: Partial<VolumeDiscountWidgetDisplay>) => void;
}) {
  const { t } = useAdminI18n();
  return (
    // Polaris web: s-box — Display panel shell
    <s-box
      padding="large-200"
      borderWidth="base"
      borderRadius="large"
      background="base"
    >
      <s-stack direction="block" gap="base">
        <s-heading>{t("offerEditor.tab.display")}</s-heading>
        <s-paragraph color="subdued">
          {t("offerEditor.appearance.intro")}
        </s-paragraph>
        {/* Polaris web: s-text-field / s-text-area / s-checkbox — same widgetDisplay handlers */}
        <s-text-field
          label={t("settings.widgetHeading")}
          value={widgetDisplay.widgetHeading}
          onChange={(e) =>
            onChange({ widgetHeading: sTextFieldValue(e.currentTarget) })
          }
          onInput={(e) =>
            onChange({ widgetHeading: sTextFieldValue(e.currentTarget) })
          }
          autocomplete="off"
        />
        <s-text-area
          label={t("settings.footnote")}
          value={widgetDisplay.footnote}
          rows={2}
          onChange={(e) =>
            onChange({ footnote: sTextFieldValue(e.currentTarget) })
          }
          onInput={(e) =>
            onChange({ footnote: sTextFieldValue(e.currentTarget) })
          }
          autocomplete="off"
        />
        <s-checkbox
          label={t("offerEditor.showCountdown")}
          checked={widgetDisplay.showCountdown}
          onChange={(e) =>
            onChange({ showCountdown: Boolean(e.currentTarget.checked) })
          }
        />

        <s-stack direction="block" gap="small">
          <s-heading>{t("bogo.copy.title")}</s-heading>
          <s-paragraph color="subdued">{t("bogo.copy.help")}</s-paragraph>
          {BOGO_COPY_FIELDS.map((field) => (
            <s-text-field
              key={field.key}
              label={t(field.label)}
              details={field.help ? t(field.help) : undefined}
              value={widgetDisplay.bogoCopy[field.key]}
              onChange={(e) =>
                onChange({
                  bogoCopy: {
                    ...widgetDisplay.bogoCopy,
                    [field.key]: sTextFieldValue(e.currentTarget),
                  },
                })
              }
              onInput={(e) =>
                onChange({
                  bogoCopy: {
                    ...widgetDisplay.bogoCopy,
                    [field.key]: sTextFieldValue(e.currentTarget),
                  },
                })
              }
              autocomplete="off"
            />
          ))}
        </s-stack>

        <s-stack direction="block" gap="small">
          <s-heading>{t("offerEditor.buttonSettings")}</s-heading>
          <s-text-field
            label={t("offerEditor.textButton")}
            value={widgetDisplay.ctaLabel}
            onChange={(e) =>
              onChange({ ctaLabel: sTextFieldValue(e.currentTarget) })
            }
            onInput={(e) =>
              onChange({ ctaLabel: sTextFieldValue(e.currentTarget) })
            }
            autocomplete="off"
          />
          {/* Polaris web: s-select — same ctaButtonAction */}
          <s-select
            label={t("offerEditor.buttonAction")}
            details={t("offerEditor.buttonAction.help")}
            value={widgetDisplay.ctaButtonAction}
            onChange={(e) => {
              const v = String(e.currentTarget.value || "");
              if (
                v === "add_to_cart" ||
                v === "add_to_cart_open_drawer" ||
                v === "go_to_checkout" ||
                v === "go_to_page"
              ) {
                onChange({ ctaButtonAction: v });
              }
            }}
            onInput={(e) => {
              const v = String(e.currentTarget.value || "");
              if (
                v === "add_to_cart" ||
                v === "add_to_cart_open_drawer" ||
                v === "go_to_checkout" ||
                v === "go_to_page"
              ) {
                onChange({ ctaButtonAction: v });
              }
            }}
          >
            {CTA_BUTTON_ACTION_OPTIONS.map((o) => (
              <s-option key={o.value} value={o.value}>
                {t(`offerEditor.ctaAction.${o.value}` as AdminUiMessageKey)}
              </s-option>
            ))}
          </s-select>
          {widgetDisplay.ctaButtonAction === "go_to_page" ? (
            <s-url-field
              label={t("offerEditor.pageUrl")}
              value={widgetDisplay.ctaButtonPageUrl}
              autocomplete="off"
              details={t("offerEditor.pageUrlHelp")}
              onChange={(e) =>
                onChange({
                  ctaButtonPageUrl: sTextFieldValue(e.currentTarget),
                })
              }
              onInput={(e) =>
                onChange({
                  ctaButtonPageUrl: sTextFieldValue(e.currentTarget),
                })
              }
            />
          ) : null}
        </s-stack>
      </s-stack>
    </s-box>
  );
}

/** Colors / look only. */
export function BogoAppearancePanel({
  widgetDisplay,
  onChange: commitStyle,
  onApplyDisplay,
  onReset,
}: {
  widgetDisplay: VolumeDiscountWidgetDisplay;
  onChange: (patch: Partial<VolumeDiscountWidgetDisplay>) => void;
  onApplyDisplay: (next: VolumeDiscountWidgetDisplay) => void;
  onReset: () => void;
}) {
  const { t } = useAdminI18n();
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

  useEffect(() => {
    if (widgetDisplay.appearanceTemplateId === "custom") return;
    setAppearanceTemplateCategory(
      appearanceCategoryForPresetId(widgetDisplay.appearanceTemplateId),
    );
  }, [widgetDisplay.appearanceTemplateId]);

  const appearanceTemplatesInCategory = useMemo(
    () => appearancePresetsForCategory(appearanceTemplateCategory, false),
    [appearanceTemplateCategory],
  );

  const onChange = (patch: Partial<VolumeDiscountWidgetDisplay>) => {
    const decor =
      widgetDisplay.appearanceTemplateId !== "custom"
        ? widgetDisplay.appearanceTemplateId
        : widgetDisplay.appearanceDecorThemeId;
    commitStyle({
      ...patch,
      appearanceTemplateId: "custom",
      appearanceDecorThemeId: decor,
    });
  };

  return (
    // Polaris web: s-box — Appearance panel shell
    <s-box
      padding="large-200"
      borderWidth="base"
      borderRadius="large"
      background="base"
    >
      <s-stack direction="block" gap="base">
        <InlineStackBetween
          title={t("offerEditor.tab.appearance")}
          action={
            <s-button variant="tertiary" onClick={onReset}>
              {t("offerEditor.appearance.resetStyles")}
            </s-button>
          }
        />
        <s-paragraph color="subdued">
          {t("offerEditor.appearance.templatesHelp")}
        </s-paragraph>
        <AppearanceTemplateCategoryTabs
          value={appearanceTemplateCategory}
          onChange={setAppearanceTemplateCategory}
        />
        <AppearanceTemplateGrid
          presets={appearanceTemplatesInCategory}
          widgetDisplay={widgetDisplay}
          setWidgetDisplay={onApplyDisplay}
          patchWidgetDisplay={(patch) =>
            onApplyDisplay({ ...widgetDisplay, ...patch })
          }
          appearanceTemplates="all"
          forVolumeTable={false}
          forBogo
          ariaLabel={t("offerEditor.appearance.templatesAria")}
        />

        <s-stack direction="block" gap="small">
          <s-heading>{t("bogo.colors.card")}</s-heading>
          {/* Polaris web: s-color-field via WidgetDisplayColorField */}
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <WidgetDisplayColorField
              label={t("bogo.colors.surface")}
              value={widgetDisplay.bogoCopy.surfaceColor}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, surfaceColor: v },
                })
              }
            />
            <WidgetDisplayColorField
              label={t("bogo.colors.border")}
              value={widgetDisplay.bogoCopy.borderColor}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, borderColor: v },
                  cardBorderColor: v,
                })
              }
            />
            <WidgetDisplayColorField
              label={t("bogo.colors.text")}
              value={widgetDisplay.bogoCopy.textColor}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, textColor: v },
                })
              }
            />
            <WidgetDisplayColorField
              label={t("bogo.colors.muted")}
              value={widgetDisplay.bogoCopy.mutedColor}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, mutedColor: v },
                })
              }
            />
            <WidgetDisplayColorField
              label={t("bogo.colors.badgeBg")}
              value={widgetDisplay.bogoCopy.badgeBg}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, badgeBg: v },
                })
              }
            />
            <WidgetDisplayColorField
              label={t("bogo.colors.badgeText")}
              value={widgetDisplay.bogoCopy.badgeText}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, badgeText: v },
                })
              }
            />
          </s-grid>
        </s-stack>

        <s-stack direction="block" gap="small">
          <s-heading>{t("bogo.colors.panels")}</s-heading>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <WidgetDisplayColorField
              label={t("bogo.colors.buy")}
              value={widgetDisplay.bogoCopy.buyColor}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, buyColor: v },
                })
              }
            />
            <WidgetDisplayColorField
              label={t("bogo.colors.buyBg")}
              value={widgetDisplay.bogoCopy.buyBg}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, buyBg: v },
                })
              }
            />
            <WidgetDisplayColorField
              label={t("bogo.colors.get")}
              value={widgetDisplay.bogoCopy.getColor}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, getColor: v },
                })
              }
            />
            <WidgetDisplayColorField
              label={t("bogo.colors.getBg")}
              value={widgetDisplay.bogoCopy.getBg}
              onChange={(v) =>
                onChange({
                  bogoCopy: { ...widgetDisplay.bogoCopy, getBg: v },
                })
              }
            />
          </s-grid>
        </s-stack>

        <s-stack direction="block" gap="small">
          <s-heading>{t("bogo.colors.button")}</s-heading>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <WidgetDisplayColorField
              label={t("offerEditor.colors.primary")}
              value={widgetDisplay.primaryColor}
              onChange={(v) => onChange({ primaryColor: v })}
            />
            <WidgetDisplayColorField
              label={t("offerEditor.colors.primaryHover")}
              value={widgetDisplay.primaryHoverColor}
              onChange={(v) => onChange({ primaryHoverColor: v })}
            />
          </s-grid>
        </s-stack>

        <s-stack direction="block" gap="small">
          <s-heading>{t("bogo.more.title")}</s-heading>
          <s-paragraph color="subdued">{t("bogo.more.help")}</s-paragraph>
          <s-text-area
            label={t("offerEditor.customCss.fieldLabel")}
            details={t("bogo.more.customCssHelp")}
            value={widgetDisplay.customCss}
            rows={4}
            onChange={(e) =>
              onChange({ customCss: sTextFieldValue(e.currentTarget) })
            }
            onInput={(e) =>
              onChange({ customCss: sTextFieldValue(e.currentTarget) })
            }
            autocomplete="off"
          />
        </s-stack>
      </s-stack>
    </s-box>
  );
}

export function BogoTranslationsPanel({
  translations,
  selectedLang,
  onSelectedLangChange,
  onFieldChange,
  onResetLang,
  onAutoTranslate,
  autoTranslating = false,
  primaryLang = "en",
  languageOptions = FALLBACK_LANGS,
}: {
  translations: SparseStorefrontTranslationsMap;
  selectedLang: string;
  onSelectedLangChange: (lang: string) => void;
  onFieldChange: (field: BogoTransField, value: string) => void;
  onResetLang: () => void;
  onAutoTranslate?: () => void;
  autoTranslating?: boolean;
  primaryLang?: string;
  languageOptions?: { label: string; value: string }[];
}) {
  const { t } = useAdminI18n();
  const active = translations[selectedLang] ?? {};
  const preset = translationPresetForLanguage(selectedLang);
  const labels: Record<BogoTransField, string> = {
    transHeading: t("settings.widgetHeading"),
    transCta: t("settings.ctaText"),
    transFootnote: t("settings.footnote"),
    transBogoBadge: t("bogo.copy.badge"),
    transBogoBuy: t("bogo.copy.buy"),
    transBogoGetFree: t("bogo.copy.getFree"),
    transBogoGet: t("bogo.copy.get"),
    transBogoPick: t("bogo.copy.pick"),
    transBogoPickPlural: t("bogo.copy.pickPlural"),
    transBogoAvailable: t("bogo.copy.available"),
    transBogoFree: t("bogo.copy.free"),
  };
  const isPrimary = selectedLang === primaryLang;

  return (
    // Polaris web: s-box — Campaign translations shell
    <s-box
      padding="large-200"
      borderWidth="base"
      borderRadius="large"
      background="base"
    >
      <s-stack direction="block" gap="base">
        <s-heading>{t("offerEditor.translations.title")}</s-heading>
        <s-paragraph color="subdued">{t("bogo.translations.help")}</s-paragraph>
        {/* Polaris web: s-select — same selectedLang */}
        <s-select
          label={t("settings.language")}
          value={selectedLang}
          onChange={(e) =>
            onSelectedLangChange(String(e.currentTarget.value || ""))
          }
          onInput={(e) =>
            onSelectedLangChange(String(e.currentTarget.value || ""))
          }
        >
          {languageOptions.map((o) => (
            <s-option key={o.value} value={o.value}>
              {o.label}
            </s-option>
          ))}
        </s-select>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-button
            icon="automation"
            onClick={onAutoTranslate}
            loading={autoTranslating}
            disabled={!onAutoTranslate || isPrimary || autoTranslating}
          >
            {t("settings.autoTranslate")}
          </s-button>
          <s-button
            icon="reset"
            onClick={onResetLang}
            disabled={autoTranslating}
          >
            {t("settings.reset")}
          </s-button>
        </s-stack>
        <s-paragraph color="subdued">
          {t("bogo.translations.actionsHelp")}
        </s-paragraph>
        {BOGO_TRANS_FIELDS.map((field) => (
          <s-text-field
            key={field}
            label={labels[field]}
            value={String(
              active[field as keyof StorefrontTranslationFields] ?? "",
            )}
            onChange={(e) =>
              onFieldChange(field, sTextFieldValue(e.currentTarget))
            }
            onInput={(e) =>
              onFieldChange(field, sTextFieldValue(e.currentTarget))
            }
            autocomplete="off"
            placeholder={String(
              preset[field as keyof StorefrontTranslationFields] ?? "",
            )}
          />
        ))}
      </s-stack>
    </s-box>
  );
}

export function resetBogoWidgetDisplay(
  displayName: string,
): VolumeDiscountWidgetDisplay {
  return defaultBogoWidgetDisplay(displayName);
}
