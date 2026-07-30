import { useCallback, useMemo, useState } from "react";
import {
  ActionList,
  Button,
  ButtonGroup,
  InlineStack,
  Popover,
} from "@shopify/polaris";
import {
  APPEARANCE_TEMPLATE_CATEGORY_OPTIONS,
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

export function AppearanceTemplateCategoryTabs({
  value,
  onChange,
}: AppearanceTemplateCategoryTabsProps) {
  const { t } = useAdminI18n();
  const [moreOpen, setMoreOpen] = useState(false);

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
  const moreLabel = selectedInMore
    ? (moreOptions.find((o) => o.value === value)?.label ??
      t("offerEditor.appearance.category.more"))
    : t("offerEditor.appearance.category.more");

  const closeMore = useCallback(() => setMoreOpen(false), []);
  const toggleMore = useCallback(() => setMoreOpen((open) => !open), []);

  return (
    <div className={createStyles.appearanceTemplateCategoryBar}>
      <InlineStack gap="200" blockAlign="center" wrap={false}>
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
        <Popover
          active={moreOpen}
          autofocusTarget="first-node"
          preferredAlignment="right"
          onClose={closeMore}
          activator={
            <Button
              size="slim"
              pressed={selectedInMore}
              disclosure={moreOpen ? "up" : "down"}
              onClick={toggleMore}
            >
              {moreLabel}
            </Button>
          }
        >
          <ActionList
            actionRole="menuitem"
            items={moreOptions.map((opt) => ({
              content: opt.label,
              active: value === opt.value,
              onAction: () => {
                onChange(opt.value);
                closeMore();
              },
            }))}
          />
        </Popover>
      </InlineStack>
    </div>
  );
}
