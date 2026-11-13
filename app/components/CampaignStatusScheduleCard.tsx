import { AppHomeScheduleDateTimeField } from "./AppHomeScheduleDateTimeField";
import { useAdminI18n } from "./AdminI18nProvider";
import { PlanUpgradeHint } from "./PlanUpgradeBanner";

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
 * Optional start/end schedule card.
 * Start/end map to `countdownStartsAt` / `countdownEndsAt` in shop timezone.
 * Countdown timer controls appear when end date is enabled (or when locked, previewed).
 *
 * Polaris web components only (`s-box`, `s-stack`, `s-heading`, `s-checkbox`, …).
 * Schedule enable / date / countdown callbacks are unchanged.
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
  const tzForFields = shopTimezone?.trim() || "UTC";

  // Locked plans preview the full Premium layout (dates + countdown), all disabled.
  const startEnabled = schedulingLocked ? true : scheduleStartEnabled;
  const endEnabled = schedulingLocked ? true : scheduleEndEnabled;
  const timerLocked = schedulingLocked || countdownLocked;

  return (
    // Polaris web: s-box card shell — same schedule props / handlers
    <s-box
      padding="large-200"
      borderWidth="base"
      borderRadius="large"
      background="base"
    >
      <s-stack direction="block" gap="small">
        <s-heading>{t("offerEditor.schedule")}</s-heading>
        <s-paragraph color="subdued">
          {tzLabel
            ? t("offerEditor.schedule.timezone", { tz: tzLabel })
            : t("offerEditor.schedule.timezoneFallback")}
        </s-paragraph>

        {schedulingLocked ? (
          <PlanUpgradeHint feature="scheduling" />
        ) : null}

        {/* Polaris web: s-checkbox — same start-enabled toggle */}
        <s-checkbox
          label={t("offerEditor.schedule.setStartDate")}
          checked={startEnabled}
          disabled={schedulingLocked || undefined}
          onChange={(event) =>
            onScheduleStartEnabledChange(Boolean(event.currentTarget.checked))
          }
        />
        {startEnabled ? (
          <AppHomeScheduleDateTimeField
            label={t("offerEditor.schedule.start")}
            value={scheduleStartLocal}
            onChange={onScheduleStartLocalChange}
            shopTimezone={tzForFields}
            details={t("offerEditor.schedule.startHelp")}
            disabled={schedulingLocked}
          />
        ) : null}

        {/* Polaris web: s-checkbox — same end-enabled toggle */}
        <s-checkbox
          label={t("offerEditor.schedule.setEndDate")}
          checked={endEnabled}
          disabled={schedulingLocked || undefined}
          onChange={(event) =>
            onScheduleEndEnabledChange(Boolean(event.currentTarget.checked))
          }
        />
        {endEnabled ? (
          <AppHomeScheduleDateTimeField
            label={t("offerEditor.schedule.end")}
            value={scheduleEndLocal}
            onChange={onScheduleEndLocalChange}
            shopTimezone={tzForFields}
            details={t("offerEditor.schedule.endHelp")}
            disabled={schedulingLocked}
          />
        ) : null}

        {endEnabled ? (
          <s-stack direction="block" gap="small">
            <s-heading>{t("offerEditor.countdownTimer")}</s-heading>

            {timerLocked && !schedulingLocked ? (
              <PlanUpgradeHint feature="countdown" />
            ) : null}

            {/* Polaris web: s-checkbox — same show-countdown toggle */}
            <s-checkbox
              label={t("offerEditor.showCountdown")}
              checked={timerLocked ? true : showCountdown}
              disabled={timerLocked || undefined}
              onChange={(event) =>
                onShowCountdownChange?.(Boolean(event.currentTarget.checked))
              }
            />
            {/* Polaris web: s-text-field — same countdown label state */}
            <s-text-field
              label={t("offerEditor.timerLabel")}
              name="countdownLabel"
              value={timerLocked ? "" : countdownLabel}
              autocomplete="off"
              placeholder={t("offerEditor.timerLabelPlaceholder")}
              disabled={timerLocked || undefined}
              onChange={(event) =>
                onCountdownLabelChange?.(String(event.currentTarget.value ?? ""))
              }
              onInput={(event) =>
                onCountdownLabelChange?.(String(event.currentTarget.value ?? ""))
              }
            />
          </s-stack>
        ) : null}
      </s-stack>
    </s-box>
  );
}
