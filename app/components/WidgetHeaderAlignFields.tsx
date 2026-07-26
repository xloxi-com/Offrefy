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
  const layoutOptions =
    layoutOptionsVariant === "volume_table"
      ? WIDGET_HEADER_LAYOUT_OPTIONS_VOLUME_TABLE
      : WIDGET_HEADER_LAYOUT_OPTIONS;

  return (
    <BlockStack gap="300">
      <Select
        id={`${idPrefix}-widget-header-layout`}
        label="Layout"
        helpText={layoutHelpText}
        options={[...layoutOptions]}
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
            label="Widget heading alignment"
            helpText={headingHelpText}
            options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
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
            label="Timer alignment"
            helpText={timerHelpText}
            options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
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
            label="Stack on small screens"
            checked={widgetHeaderMobileStack}
            onChange={(checked) =>
              patchWidgetDisplay({ widgetHeaderMobileStack: checked })
            }
          />
          <Checkbox
            label="Timer before heading"
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
