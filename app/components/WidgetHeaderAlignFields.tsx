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
 *
 * Polaris web: s-select / s-checkbox — same patchWidgetDisplay handlers.
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
    <s-stack direction="block" gap="small">
      {/* Polaris web: s-select — same widgetHeaderLayout patch */}
      <s-select
        id={`${idPrefix}-widget-header-layout`}
        label={t("offerEditor.widget.layoutLabel")}
        details={layoutHelpText}
        value={widgetHeaderLayout}
        onChange={(event) => {
          const v = String(event.currentTarget.value || "");
          if (isVolumeDiscountWidgetHeaderLayout(v)) {
            patchWidgetDisplay(widgetHeaderLayoutPatch(v));
          }
        }}
        onInput={(event) => {
          const v = String(event.currentTarget.value || "");
          if (isVolumeDiscountWidgetHeaderLayout(v)) {
            patchWidgetDisplay(widgetHeaderLayoutPatch(v));
          }
        }}
      >
        {layoutOptions.map((option) => (
          <s-option key={option.value} value={option.value}>
            {option.label}
          </s-option>
        ))}
      </s-select>

      <s-stack direction="inline" gap="small" alignItems="start">
        <div style={{ flex: "1 1 10rem", minWidth: "8rem" }}>
          {/* Polaris web: s-select — same widgetHeadingAlign patch */}
          <s-select
            id={`${idPrefix}-widget-heading-align`}
            label={t("offerEditor.widget.headingAlignLabel")}
            details={headingHelpText}
            value={widgetHeadingAlign}
            onChange={(event) => {
              const v = String(event.currentTarget.value || "");
              if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                patchWidgetDisplay(
                  widgetHeaderAlignPatch("widgetHeadingAlign", v),
                );
              }
            }}
            onInput={(event) => {
              const v = String(event.currentTarget.value || "");
              if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                patchWidgetDisplay(
                  widgetHeaderAlignPatch("widgetHeadingAlign", v),
                );
              }
            }}
          >
            {textAlignOptions.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>
        </div>
        <div style={{ flex: "1 1 10rem", minWidth: "8rem" }}>
          {/* Polaris web: s-select — same countdownAlign patch */}
          <s-select
            id={`${idPrefix}-widget-countdown-align`}
            label={t("offerEditor.widget.timerAlignLabel")}
            details={timerHelpText}
            value={countdownAlign}
            onChange={(event) => {
              const v = String(event.currentTarget.value || "");
              if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                patchWidgetDisplay(widgetHeaderAlignPatch("countdownAlign", v));
              }
            }}
            onInput={(event) => {
              const v = String(event.currentTarget.value || "");
              if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                patchWidgetDisplay(widgetHeaderAlignPatch("countdownAlign", v));
              }
            }}
          >
            {textAlignOptions.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>
        </div>
      </s-stack>

      {showOrderControls ? (
        <s-stack direction="block" gap="small-200">
          {/* Polaris web: s-checkbox — same widgetHeaderMobileStack */}
          <s-checkbox
            label={t("offerEditor.widget.stackMobile")}
            checked={widgetHeaderMobileStack}
            onChange={(event) =>
              patchWidgetDisplay({
                widgetHeaderMobileStack: Boolean(event.currentTarget.checked),
              })
            }
          />
          {/* Polaris web: s-checkbox — same widgetHeaderSwapOrder */}
          <s-checkbox
            label={t("offerEditor.widget.timerBeforeHeading")}
            checked={widgetHeaderSwapOrder}
            onChange={(event) =>
              patchWidgetDisplay({
                widgetHeaderSwapOrder: Boolean(event.currentTarget.checked),
              })
            }
          />
        </s-stack>
      ) : null}

      <s-paragraph color="subdued">
        {t("offerEditor.widget.timerScheduleNotice")}
      </s-paragraph>
    </s-stack>
  );
}
