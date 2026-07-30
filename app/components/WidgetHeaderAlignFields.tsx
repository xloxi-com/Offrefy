import { BlockStack, Checkbox, InlineStack, Select } from "@shopify/polaris";

import {
  isVolumeDiscountWidgetHeaderLayout,
  isVolumeDiscountWidgetHeaderTextAlign,
  widgetHeaderAlignPatch,
  widgetHeaderLayoutPatch,
  WIDGET_HEADER_LAYOUT_OPTIONS,
  WIDGET_HEADER_LAYOUT_OPTIONS_VOLUME_TABLE,
  WIDGET_HEADER_TEXT_ALIGN_OPTIONS,
  type VolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetHeaderLayout,
  type VolumeDiscountWidgetHeaderTextAlign,
} from "../utils/widgetDisplay";
import { useAdminI18n } from "./AdminI18nProvider";
import type { AdminUiMessageKey } from "../utils/adminUiMessages";

export type WidgetHeaderAlignFieldsProps = {
  widgetHeaderLayout: VolumeDiscountWidgetHeaderLayout;
  widgetHeadingAlign: VolumeDiscountWidgetHeaderTextAlign;
  countdownAlign: VolumeDiscountWidgetHeaderTextAlign;
  widgetHeaderMobileStack?: boolean;
  widgetHeaderSwapOrder?: boolean;
  patchWidgetDisplay: (patch: Partial<VolumeDiscountWidgetDisplay>) => void;
  /** Prefix ids when the same form mounts twice (e.g. volume Appearance). */
  idPrefix?: string;
  /** Use volume-table layout option labels. */
  layoutOptionsVariant?: "quantity_breaks" | "volume_table";
  headingHelpText?: string;
  timerHelpText?: string;
  layoutHelpText?: string;
  /** Extra checkboxes under the aligns (QB + volume). Default true. */
  showOrderControls?: boolean;
};

const TEXT_ALIGN_LABEL_KEYS: Record<
  VolumeDiscountWidgetHeaderTextAlign,
  AdminUiMessageKey
> = {
  start: "offerEditor.align.left",
  center: "offerEditor.align.center",
  end: "offerEditor.align.right",
};

const LAYOUT_LABEL_KEYS: Record<
  VolumeDiscountWidgetHeaderLayout,
  AdminUiMessageKey
> = {
  split: "offerEditor.widget.layoutOption.split",
  stacked: "offerEditor.widget.layoutOption.stacked",
};

const LAYOUT_LABEL_KEYS_VOLUME_TABLE: Record<
  VolumeDiscountWidgetHeaderLayout,
  AdminUiMessageKey
> = {
  split: "offerEditor.widget.layoutOptionVolume.split",
  stacked: "offerEditor.widget.layoutOptionVolume.stacked",
};

/**
 * Layout on top, then heading + timer alignment side by side.
 * Patches go through shared helpers in `widgetDisplay.ts`.
 */
export function WidgetHeaderAlignFields({
  widgetHeaderLayout,
  widgetHeadingAlign,
  countdownAlign,
  widgetHeaderMobileStack = true,
  widgetHeaderSwapOrder = false,
  patchWidgetDisplay,
  idPrefix = "vd",
  layoutOptionsVariant = "quantity_breaks",
  headingHelpText,
  timerHelpText,
  layoutHelpText,
  showOrderControls = true,
}: WidgetHeaderAlignFieldsProps) {
  const { t } = useAdminI18n();

  const layoutOptionValues =
    layoutOptionsVariant === "volume_table"
      ? WIDGET_HEADER_LAYOUT_OPTIONS_VOLUME_TABLE
      : WIDGET_HEADER_LAYOUT_OPTIONS;
  const layoutLabelKeys =
    layoutOptionsVariant === "volume_table"
      ? LAYOUT_LABEL_KEYS_VOLUME_TABLE
      : LAYOUT_LABEL_KEYS;
  const layoutOptions = layoutOptionValues.map((o) => ({
    value: o.value,
    label: t(layoutLabelKeys[o.value]),
  }));
  const textAlignOptions = WIDGET_HEADER_TEXT_ALIGN_OPTIONS.map((o) => ({
    value: o.value,
    label: t(TEXT_ALIGN_LABEL_KEYS[o.value]),
  }));

  return (
    <BlockStack gap="300">
      <Select
        id={`${idPrefix}-widget-header-layout`}
        label={t("offerEditor.widget.layoutLabel")}
        helpText={layoutHelpText}
        options={layoutOptions}
        value={widgetHeaderLayout}
        onChange={(v) => {
          if (isVolumeDiscountWidgetHeaderLayout(v)) {
            patchWidgetDisplay(widgetHeaderLayoutPatch(v));
          }
        }}
      />

      <InlineStack gap="300" wrap blockAlign="start">
        <div style={{ flex: "1 1 10rem", minWidth: "8rem" }}>
          <Select
            id={`${idPrefix}-widget-heading-align`}
            label={t("offerEditor.widget.headingAlignLabel")}
            helpText={headingHelpText}
            options={textAlignOptions}
            value={widgetHeadingAlign}
            onChange={(v) => {
              if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                patchWidgetDisplay(
                  widgetHeaderAlignPatch("widgetHeadingAlign", v),
                );
              }
            }}
          />
        </div>
        <div style={{ flex: "1 1 10rem", minWidth: "8rem" }}>
          <Select
            id={`${idPrefix}-widget-countdown-align`}
            label={t("offerEditor.widget.timerAlignLabel")}
            helpText={timerHelpText}
            options={textAlignOptions}
            value={countdownAlign}
            onChange={(v) => {
              if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                patchWidgetDisplay(widgetHeaderAlignPatch("countdownAlign", v));
              }
            }}
          />
        </div>
      </InlineStack>

      {showOrderControls ? (
        <BlockStack gap="200">
          <Checkbox
            label={t("offerEditor.widget.stackMobile")}
            checked={widgetHeaderMobileStack}
            onChange={(checked) =>
              patchWidgetDisplay({ widgetHeaderMobileStack: checked })
            }
          />
          <Checkbox
            label={t("offerEditor.widget.timerBeforeHeading")}
            checked={widgetHeaderSwapOrder}
            onChange={(checked) =>
              patchWidgetDisplay({ widgetHeaderSwapOrder: checked })
            }
          />
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}
