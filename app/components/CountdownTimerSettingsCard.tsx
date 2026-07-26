import {
  BlockStack,
  Card,
  Checkbox,
  InlineStack,
  Text,
  TextField,
} from "@shopify/polaris";

import { PlanUpgradeBanner } from "./PlanUpgradeBanner";
import { PlanUpgradeBadge } from "./PlanUpgradeBadge";
import { formatDatetimeLocalDisplay } from "../utils/countdownTimes";
import type { VolumeDiscountWidgetDisplay } from "../utils/widgetDisplay";

export type CountdownTimerSettingsCardProps = {
  widgetDisplay: Pick<
    VolumeDiscountWidgetDisplay,
    "showCountdown" | "countdownLabel"
  >;
  patchWidgetDisplay: (patch: Partial<VolumeDiscountWidgetDisplay>) => void;
  /** Schedule start (datetime-local); shown when set. */
  scheduleStartEnabled?: boolean;
  scheduleStartLocal?: string;
  /** Schedule end (datetime-local); drives the live countdown. */
  scheduleEndEnabled?: boolean;
  scheduleEndLocal?: string;
  /** When true, show upgrade banner instead of editable controls. */
  locked?: boolean;
};

/**
 * Countdown label + schedule times (start/end come from Schedule card).
 */
export function CountdownTimerSettingsCard({
  widgetDisplay,
  patchWidgetDisplay,
  scheduleStartEnabled = false,
  scheduleStartLocal = "",
  scheduleEndEnabled = false,
  scheduleEndLocal = "",
  locked = false,
}: CountdownTimerSettingsCardProps) {
  const startLabel =
    scheduleStartEnabled && scheduleStartLocal.trim()
      ? formatDatetimeLocalDisplay(scheduleStartLocal)
      : "";
  const endLabel =
    scheduleEndEnabled && scheduleEndLocal.trim()
      ? formatDatetimeLocalDisplay(scheduleEndLocal)
      : "";

  return (
    <Card padding="400">
      <BlockStack gap="300">
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text as="h2" variant="headingSm">
              Countdown timer
            </Text>
            {locked ? <PlanUpgradeBadge /> : null}
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            Uses Schedule end for the live pill (shows immediately — no wait for
            start). Pill colors in Appearance.
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

            <BlockStack gap="100">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Scheduled times
              </Text>
              {startLabel ? (
                <Text as="p" variant="bodySm">
                  Start: {startLabel}
                </Text>
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  Start: not set (Schedule → Set start date)
                </Text>
              )}
              {endLabel ? (
                <Text as="p" variant="bodySm">
                  End: {endLabel}
                </Text>
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  End: not set (Schedule → Set end date). Required for the
                  countdown pill.
                </Text>
              )}
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
