import {
  BlockStack,
  Card,
  Checkbox,
  Text,
} from "@shopify/polaris";

import { PolarisDateTimeField } from "./PolarisDateTimeField";

export type CampaignStatusScheduleCardProps = {
  scheduleStartEnabled: boolean;
  onScheduleStartEnabledChange: (next: boolean) => void;
  scheduleStartLocal: string;
  onScheduleStartLocalChange: (next: string) => void;
  scheduleEndEnabled: boolean;
  onScheduleEndEnabledChange: (next: boolean) => void;
  scheduleEndLocal: string;
  onScheduleEndLocalChange: (next: string) => void;
};

/**
 * Optional start/end schedule (Polaris Card).
 * Start/end map to `countdownStartsAt` / `countdownEndsAt`.
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
}: CampaignStatusScheduleCardProps) {
  return (
    <Card padding="400">
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">
          Schedule
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Future start sets status to Scheduled until that time. End turns the
          offer to Draft automatically.
        </Text>

        <Checkbox
          label="Set start date"
          checked={scheduleStartEnabled}
          onChange={(checked) => onScheduleStartEnabledChange(checked)}
        />
        {scheduleStartEnabled ? (
          <PolarisDateTimeField
            label="Start"
            value={scheduleStartLocal}
            onChange={onScheduleStartLocalChange}
            helpText="Offer stays Scheduled until this time, then goes Active."
          />
        ) : null}

        <Checkbox
          label="Set end date"
          checked={scheduleEndEnabled}
          onChange={(checked) => onScheduleEndEnabledChange(checked)}
        />
        {scheduleEndEnabled ? (
          <PolarisDateTimeField
            label="End"
            value={scheduleEndLocal}
            onChange={onScheduleEndLocalChange}
            helpText="Offer turns Draft at this time (also used by the countdown)."
          />
        ) : null}
      </BlockStack>
    </Card>
  );
}
