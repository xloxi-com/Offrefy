import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";

import { PlanUpgradeBanner } from "./PlanUpgradeBanner";
import {
  COUNTDOWN_TIME_UNIT_OPTIONS,
  isVolumeDiscountCountdownTimeUnit,
  isVolumeDiscountWidgetHeaderLayout,
  isVolumeDiscountWidgetHeaderTextAlign,
  WIDGET_HEADER_LAYOUT_OPTIONS,
  WIDGET_HEADER_TEXT_ALIGN_OPTIONS,
  type VolumeDiscountWidgetDisplay,
} from "../utils/widgetDisplay";

export type CountdownTimerSettingsCardProps = {
  widgetDisplay: Pick<
    VolumeDiscountWidgetDisplay,
    | "showCountdown"
    | "countdownLabel"
    | "countdownTimeAmount"
    | "countdownTimeUnit"
    | "widgetHeaderLayout"
    | "widgetHeaderMobileStack"
    | "countdownAlign"
    | "widgetHeaderSwapOrder"
  >;
  patchWidgetDisplay: (patch: Partial<VolumeDiscountWidgetDisplay>) => void;
  onResetTimer: () => void;
  /** Quantity-breaks offers: layout/alignment live in this card. Volume table uses Title & countdown. */
  showLayoutControls?: boolean;
  /** When true, show upgrade banner instead of editable controls. */
  locked?: boolean;
};

/**
 * Compact Polaris card for countdown label, duration, and (optional) header layout.
 */
export function CountdownTimerSettingsCard({
  widgetDisplay,
  patchWidgetDisplay,
  onResetTimer,
  showLayoutControls = false,
  locked = false,
}: CountdownTimerSettingsCardProps) {
  return (
    <Card padding="400">
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h2" variant="headingSm">
            Countdown timer
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Label, duration, and end time (UTC). Pill colors in Appearance.
          </Text>
        </BlockStack>

        {locked ? (
          <PlanUpgradeBanner feature="countdown" />
        ) : (
          <>
            <Checkbox
              label="Show countdown"
              checked={widgetDisplay.showCountdown}
              onChange={(checked) =>
                patchWidgetDisplay({ showCountdown: checked })
              }
            />

            <TextField
              label="Timer label"
              name="countdownLabel"
              value={widgetDisplay.countdownLabel}
              onChange={(v) => patchWidgetDisplay({ countdownLabel: v })}
              autoComplete="off"
              placeholder="Sale end in"
              helpText="Shown beside the timer pill."
            />

            <InlineStack gap="300" blockAlign="end" wrap>
              <div style={{ flex: "1 1 5.5rem", minWidth: "4.5rem" }}>
                <TextField
                  label="Duration"
                  type="number"
                  name="countdownTimeAmount"
                  min={1}
                  autoComplete="off"
                  value={String(widgetDisplay.countdownTimeAmount)}
                  onChange={(v) => {
                    const n = parseInt(String(v).replace(/\D/g, ""), 10);
                    patchWidgetDisplay({
                      countdownTimeAmount:
                        Number.isFinite(n) && n >= 1 ? Math.min(9999, n) : 1,
                    });
                  }}
                />
              </div>
              <div style={{ flex: "1 1 10rem", minWidth: "8rem" }}>
                <Select
                  label="Unit"
                  options={[...COUNTDOWN_TIME_UNIT_OPTIONS]}
                  value={widgetDisplay.countdownTimeUnit}
                  onChange={(v) => {
                    if (isVolumeDiscountCountdownTimeUnit(v)) {
                      patchWidgetDisplay({ countdownTimeUnit: v });
                    }
                  }}
                />
              </div>
            </InlineStack>

            <InlineStack gap="300" blockAlign="center" wrap>
              <Text as="p" variant="bodySm" tone="subdued">
                Changes reset end from now.
              </Text>
              {widgetDisplay.showCountdown ? (
                <Button variant="plain" size="slim" onClick={onResetTimer}>
                  Reset timer
                </Button>
              ) : null}
            </InlineStack>

            {showLayoutControls ? (
              <>
                <Select
                  id="vd-widget-header-layout"
                  label="Layout"
                  options={[...WIDGET_HEADER_LAYOUT_OPTIONS]}
                  value={widgetDisplay.widgetHeaderLayout}
                  onChange={(v) => {
                    if (isVolumeDiscountWidgetHeaderLayout(v)) {
                      patchWidgetDisplay({ widgetHeaderLayout: v });
                    }
                  }}
                />
                <Checkbox
                  label="Stack on small screens"
                  checked={widgetDisplay.widgetHeaderMobileStack}
                  onChange={(checked) =>
                    patchWidgetDisplay({ widgetHeaderMobileStack: checked })
                  }
                />
                <Select
                  id="vd-widget-countdown-align"
                  label="Timer alignment"
                  options={[...WIDGET_HEADER_TEXT_ALIGN_OPTIONS]}
                  value={widgetDisplay.countdownAlign}
                  onChange={(v) => {
                    if (isVolumeDiscountWidgetHeaderTextAlign(v)) {
                      patchWidgetDisplay({ countdownAlign: v });
                    }
                  }}
                />
                <Checkbox
                  label="Timer before heading"
                  checked={widgetDisplay.widgetHeaderSwapOrder}
                  onChange={(checked) =>
                    patchWidgetDisplay({ widgetHeaderSwapOrder: checked })
                  }
                />
              </>
            ) : null}
          </>
        )}
      </BlockStack>
    </Card>
  );
}
