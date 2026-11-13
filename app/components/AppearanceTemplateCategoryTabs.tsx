import { useMemo } from "react";
import { Button, ButtonGroup } from "./AppButton";
import {
  APPEARANCE_TEMPLATE_CATEGORY_OPTIONS,
  isAppearanceTemplateCategory,
  type AppearanceTemplateCategory,
} from "../utils/widgetDisplay";
import createStyles from "../styles/volume-discount-create.module.css";
import { useAdminI18n } from "./AdminI18nProvider";
import type { AdminUiMessageKey } from "../utils/adminUiMessages";

/** Categories shown as primary segmented tabs (fit typical admin column). */
const PRIMARY_CATEGORY_VALUES: AppearanceTemplateCategory[] = [
  "classic",
  "christmas",
  "newyear",
  "halloween",
];

const CATEGORY_LABEL_KEYS: Record<AppearanceTemplateCategory, AdminUiMessageKey> = {
  classic: "offerEditor.appearance.category.classic",
  christmas: "offerEditor.appearance.category.christmas",
  newyear: "offerEditor.appearance.category.newyear",
  halloween: "offerEditor.appearance.category.halloween",
  ramadan: "offerEditor.appearance.category.ramadan",
  diwali: "offerEditor.appearance.category.diwali",
  pongal: "offerEditor.appearance.category.pongal",
  valentine: "offerEditor.appearance.category.valentine",
  easter: "offerEditor.appearance.category.easter",
};

type AppearanceTemplateCategoryTabsProps = {
  value: AppearanceTemplateCategory;
  onChange: (category: AppearanceTemplateCategory) => void;
};

/**
 * Category tabs (Polaris s-button group) + overflow via Polaris s-select.
 */
export function AppearanceTemplateCategoryTabs({
  value,
  onChange,
}: AppearanceTemplateCategoryTabsProps) {
  const { t } = useAdminI18n();

  const primaryOptions = useMemo(
    () =>
      APPEARANCE_TEMPLATE_CATEGORY_OPTIONS.filter((o) =>
        PRIMARY_CATEGORY_VALUES.includes(o.value),
      ).map((o) => ({ value: o.value, label: t(CATEGORY_LABEL_KEYS[o.value]) })),
    [t],
  );

  const moreOptions = useMemo(
    () =>
      APPEARANCE_TEMPLATE_CATEGORY_OPTIONS.filter(
        (o) => !PRIMARY_CATEGORY_VALUES.includes(o.value),
      ).map((o) => ({ value: o.value, label: t(CATEGORY_LABEL_KEYS[o.value]) })),
    [t],
  );

  const selectedInMore = moreOptions.some((o) => o.value === value);
  const moreSelectValue = selectedInMore ? value : "";
  const moreLabel = t("offerEditor.appearance.category.more");

  const handleMoreChange = (raw: string) => {
    if (!raw || !isAppearanceTemplateCategory(raw)) return;
    if (PRIMARY_CATEGORY_VALUES.includes(raw)) return;
    onChange(raw);
  };

  return (
    <div className={createStyles.appearanceTemplateCategoryBar}>
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <ButtonGroup variant="segmented" noWrap>
          {primaryOptions.map((opt) => (
            <Button
              key={opt.value}
              size="slim"
              pressed={value === opt.value}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </ButtonGroup>
        {/* Polaris web: s-select — overflow categories (“More”) */}
        <div className={createStyles.appearanceCategoryMoreSelect}>
          <s-select
            label={moreLabel}
            labelAccessibilityVisibility="exclusive"
            icon="select"
            placeholder={moreLabel}
            value={moreSelectValue}
            onChange={(e) =>
              handleMoreChange(String(e.currentTarget.value || ""))
            }
            onInput={(e) =>
              handleMoreChange(String(e.currentTarget.value || ""))
            }
          >
            {moreOptions.map((opt) => (
              <s-option key={opt.value} value={opt.value}>
                {opt.label}
              </s-option>
            ))}
          </s-select>
        </div>
      </s-stack>
    </div>
  );
}
