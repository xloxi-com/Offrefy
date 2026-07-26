import {
  BlockStack,
  Card,
  Checkbox,
  Text,
} from "@shopify/polaris";

import { PolarisDateTimeField } from "./PolarisDateTimeField";
import { formatDatetimeLocalDisplay } from "../utils/countdownTimes";

export type CampaignStatusScheduleCardProps = {
  scheduleStartEnabled: boolean;
  onScheduleStartEnabledChange: (next: boolean) => void;
  scheduleStartLocal: string;
  onScheduleStartLocalChange: (next: string) => void;
  scheduleEndEnabled: boolean;
  onScheduleEndEnabledChange: (next: boolean) => void;
  scheduleEndLocal: string;
  onScheduleEndLocalChange: (next: string) => void;
  /** Shopify shop IANA timezone (e.g. Asia/Kolkata). */
  shopTimezone?: string;
  /** Display label from Shopify store timezone, e.g. America/New_York (EDT). */
  shopTimezoneLabel?: string;
};

/**
 * Optional start/end schedule (Polaris Card).
 * Start/end map to `countdownStartsAt` / `countdownEndsAt` in shop timezone.
 */
export function CampaignStatusScheduleCard({
  scheduleStartEnabled,
  onScheduleStartEnabledChange,
  scheduleStartLocal,
  onScheduleStartLocalChange,
  scheduleEndEnabled,
  onScheduleEndEnabledChange,
  scheduleEndLocal,
  onScheduleEndLocalChange,
  shopTimezone,
  shopTimezoneLabel,
}: CampaignStatusScheduleCardProps) {
  const startShown = formatDatetimeLocalDisplay(scheduleStartLocal);
  const endShown = formatDatetimeLocalDisplay(scheduleEndLocal);
  const tzLabel =
    shopTimezoneLabel?.trim() || shopTimezone?.trim() || "";

  return (
    <Card padding="400">
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">
          Schedule
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {tzLabel
            ? `Times use your Shopify store timezone: ${tzLabel}. Future start sets status to Scheduled until that time. End turns the offer to Draft automatically and drives the countdown timer.`
            : "Times use your Shopify store timezone. Future start sets status to Scheduled until that time. End turns the offer to Draft automatically and drives the countdown timer."}
        </Text>

        <Checkbox
          label="Set start date"
          checked={scheduleStartEnabled}
          onChange={(checked) => onScheduleStartEnabledChange(checked)}
        />
        {scheduleStartEnabled ? (
          <BlockStack gap="100">
            <PolarisDateTimeField
              label="Start"
              value={scheduleStartLocal}
              onChange={onScheduleStartLocalChange}
              shopTimezone={shopTimezone}
              helpText="Offer stays Scheduled until this time, then goes Active."
            />
            {startShown ? (
              <Text as="p" variant="bodySm" tone="subdued">
                Selected: {startShown}
                {tzLabel ? ` · ${tzLabel}` : ""}
              </Text>
            ) : null}
          </BlockStack>
        ) : null}

        <Checkbox
          label="Set end date"
          checked={scheduleEndEnabled}
          onChange={(checked) => onScheduleEndEnabledChange(checked)}
        />
        {scheduleEndEnabled ? (
          <BlockStack gap="100">
            <PolarisDateTimeField
              label="End"
              value={scheduleEndLocal}
              onChange={onScheduleEndLocalChange}
              shopTimezone={shopTimezone}
              helpText="Offer turns Draft at this time (also used by the countdown)."
            />
            {endShown ? (
              <Text as="p" variant="bodySm" tone="subdued">
                Selected: {endShown}
                {tzLabel ? ` · ${tzLabel}` : ""}
              </Text>
            ) : null}
          </BlockStack>
        ) : null}
      </BlockStack>
    </Card>
  );
}
