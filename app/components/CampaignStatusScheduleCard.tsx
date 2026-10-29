import {
  BlockStack,
  Card,
  Checkbox,
  Text,
  TextField,
} from "@shopify/polaris";

import { useAdminI18n } from "./AdminI18nProvider";
import { PlanUpgradeHint } from "./PlanUpgradeBanner";
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
  /** Shopify shop IANA timezone (e.g. Asia/Kolkata). */
  shopTimezone?: string;
  /** Display label from Shopify store timezone, e.g. America/New_York (EDT). */
  shopTimezoneLabel?: string;
  /** Storefront countdown pill (shown when end date is enabled). */
  showCountdown?: boolean;
  onShowCountdownChange?: (next: boolean) => void;
  countdownLabel?: string;
  onCountdownLabelChange?: (next: string) => void;
  /** When true, schedule controls are visible but disabled (Free plan). */
  schedulingLocked?: boolean;
  /** When true, countdown controls are visible but disabled. */
  countdownLocked?: boolean;
};

/**
 * Optional start/end schedule (Polaris Card).
 * Start/end map to `countdownStartsAt` / `countdownEndsAt` in shop timezone.
 * Countdown timer controls appear when end date is enabled (or when locked, previewed).
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
  showCountdown = true,
  onShowCountdownChange,
  countdownLabel = "",
  onCountdownLabelChange,
  schedulingLocked = false,
  countdownLocked = false,
}: CampaignStatusScheduleCardProps) {
  const { t } = useAdminI18n();
  const tzLabel =
    shopTimezoneLabel?.trim() || shopTimezone?.trim() || "";

  // Locked plans preview the full Premium layout (dates + countdown), all disabled.
  const startEnabled = schedulingLocked ? true : scheduleStartEnabled;
  const endEnabled = schedulingLocked ? true : scheduleEndEnabled;
  const timerLocked = schedulingLocked || countdownLocked;

  return (
    <Card padding="400">
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">
          {t("offerEditor.schedule")}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {tzLabel
            ? t("offerEditor.schedule.timezone", { tz: tzLabel })
            : t("offerEditor.schedule.timezoneFallback")}
        </Text>

        {schedulingLocked ? (
          <PlanUpgradeHint feature="scheduling" />
        ) : null}

        <Checkbox
          label={t("offerEditor.schedule.setStartDate")}
          checked={startEnabled}
          disabled={schedulingLocked}
          onChange={(checked) => onScheduleStartEnabledChange(checked)}
        />
        {startEnabled ? (
          <PolarisDateTimeField
            label={t("offerEditor.schedule.start")}
            value={scheduleStartLocal}
            onChange={onScheduleStartLocalChange}
            shopTimezone={shopTimezone}
            helpText={t("offerEditor.schedule.startHelp")}
            disabled={schedulingLocked}
          />
        ) : null}

        <Checkbox
          label={t("offerEditor.schedule.setEndDate")}
          checked={endEnabled}
          disabled={schedulingLocked}
          onChange={(checked) => onScheduleEndEnabledChange(checked)}
        />
        {endEnabled ? (
          <PolarisDateTimeField
            label={t("offerEditor.schedule.end")}
            value={scheduleEndLocal}
            onChange={onScheduleEndLocalChange}
            shopTimezone={shopTimezone}
            helpText={t("offerEditor.schedule.endHelp")}
            disabled={schedulingLocked}
          />
        ) : null}

        {endEnabled ? (
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t("offerEditor.countdownTimer")}
            </Text>

            {timerLocked && !schedulingLocked ? (
              <PlanUpgradeHint feature="countdown" />
            ) : null}

            <Checkbox
              label={t("offerEditor.showCountdown")}
              checked={timerLocked ? true : showCountdown}
              disabled={timerLocked}
              onChange={(checked) => onShowCountdownChange?.(checked)}
            />
            <TextField
              label={t("offerEditor.timerLabel")}
              name="countdownLabel"
              value={timerLocked ? "" : countdownLabel}
              onChange={(v) => onCountdownLabelChange?.(v)}
              autoComplete="off"
              placeholder={t("offerEditor.timerLabelPlaceholder")}
              disabled={timerLocked}
            />
          </BlockStack>
        ) : null}
      </BlockStack>
    </Card>
  );
}
