import {
  BlockStack,
  Card,
  Checkbox,
  InlineStack,
  Text,
  TextField,
} from "@shopify/polaris";

import { useAdminI18n } from "./AdminI18nProvider";
import { PlanUpgradeBadge } from "./PlanUpgradeBadge";
import { PlanUpgradeBanner } from "./PlanUpgradeBanner";
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
  /** When true, show upgrade banner instead of editable countdown controls. */
  countdownLocked?: boolean;
};

/**
 * Optional start/end schedule (Polaris Card).
 * Start/end map to `countdownStartsAt` / `countdownEndsAt` in shop timezone.
 * Countdown timer controls appear only when end date is enabled.
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
  countdownLocked = false,
}: CampaignStatusScheduleCardProps) {
  const { t } = useAdminI18n();
  const tzLabel =
    shopTimezoneLabel?.trim() || shopTimezone?.trim() || "";

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

        <Checkbox
          label={t("offerEditor.schedule.setStartDate")}
          checked={scheduleStartEnabled}
          onChange={(checked) => onScheduleStartEnabledChange(checked)}
        />
        {scheduleStartEnabled ? (
          <PolarisDateTimeField
            label={t("offerEditor.schedule.start")}
            value={scheduleStartLocal}
            onChange={onScheduleStartLocalChange}
            shopTimezone={shopTimezone}
            helpText={t("offerEditor.schedule.startHelp")}
          />
        ) : null}

        <Checkbox
          label={t("offerEditor.schedule.setEndDate")}
          checked={scheduleEndEnabled}
          onChange={(checked) => onScheduleEndEnabledChange(checked)}
        />
        {scheduleEndEnabled ? (
          <PolarisDateTimeField
            label={t("offerEditor.schedule.end")}
            value={scheduleEndLocal}
            onChange={onScheduleEndLocalChange}
            shopTimezone={shopTimezone}
            helpText={t("offerEditor.schedule.endHelp")}
          />
        ) : null}

        {scheduleEndEnabled ? (
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center" wrap>
              <Text as="h2" variant="headingSm">
                {t("offerEditor.countdownTimer")}
              </Text>
              {countdownLocked ? <PlanUpgradeBadge /> : null}
            </InlineStack>

            {countdownLocked ? (
              <PlanUpgradeBanner feature="countdown" />
            ) : (
              <>
                <Checkbox
                  label={t("offerEditor.showCountdown")}
                  checked={showCountdown}
                  onChange={(checked) => onShowCountdownChange?.(checked)}
                />
                <TextField
                  label={t("offerEditor.timerLabel")}
                  name="countdownLabel"
                  value={countdownLabel}
                  onChange={(v) => onCountdownLabelChange?.(v)}
                  autoComplete="off"
                  placeholder={t("offerEditor.timerLabelPlaceholder")}
                />
              </>
            )}
          </BlockStack>
        ) : null}
      </BlockStack>
    </Card>
  );
}
