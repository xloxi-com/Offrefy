import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { DatePicker } from "@shopify/polaris";
import { Button } from "./AppButton";
import {
  formatAnalyticsRangeLabel,
  formatIsoDateUtc,
  parseIsoDateUtc,
  type AnalyticsRangeSelection,
  type AnalyticsTimeRange,
} from "../utils/volumeDiscountAnalytics.shared";
import { useAdminI18n } from "./AdminI18nProvider";

type AnalyticsDateRangeFilterProps = {
  selection: AnalyticsRangeSelection;
};

function buildAnalyticsRangePath(
  pathname: string,
  search: string,
  selection: AnalyticsRangeSelection,
): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);

  if (selection.range === "custom" && selection.from && selection.to) {
    params.set("range", "custom");
    params.set("from", selection.from);
    params.set("to", selection.to);
  } else if (selection.range === "7d") {
    params.delete("range");
    params.delete("from");
    params.delete("to");
  } else {
    params.set("range", selection.range);
    params.delete("from");
    params.delete("to");
  }

  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

/**
 * Polaris web: s-button + s-popover — same URL range navigation.
 * DatePicker kept (no App Home range picker yet).
 */
export function AnalyticsDateRangeFilter({
  selection,
}: AnalyticsDateRangeFilterProps) {
  const { t } = useAdminI18n();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const popoverId = `analytics-range-${useId().replace(/:/g, "")}`;
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const presetOptions = useMemo(
    (): Array<{
      value: Exclude<AnalyticsTimeRange, "custom">;
      label: string;
    }> => [
      { value: "today", label: t("analytics.range.today") },
      { value: "7d", label: t("analytics.range.last7") },
      { value: "30d", label: t("analytics.range.last30") },
      { value: "all", label: t("analytics.range.allTime") },
    ],
    [t],
  );

  const initialRange = useMemo(() => {
    if (selection.range === "custom" && selection.from && selection.to) {
      return {
        start: parseIsoDateUtc(selection.from),
        end: parseIsoDateUtc(selection.to),
      };
    }
    const today = new Date();
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 6);
    return { start, end: today };
  }, [selection.from, selection.range, selection.to]);

  const [draftRange, setDraftRange] = useState(initialRange);
  const [month, setMonth] = useState(initialRange.start.getUTCMonth());
  const [year, setYear] = useState(initialRange.start.getUTCFullYear());

  useEffect(() => {
    setDraftRange(initialRange);
    setMonth(initialRange.start.getUTCMonth());
    setYear(initialRange.start.getUTCFullYear());
  }, [initialRange]);

  const selectedLabel = useMemo(() => {
    if (selection.range === "custom" && selection.from && selection.to) {
      return formatAnalyticsRangeLabel(selection);
    }
    const preset = presetOptions.find((o) => o.value === selection.range);
    return preset?.label ?? formatAnalyticsRangeLabel(selection);
  }, [presetOptions, selection]);

  const navigateToSelection = useCallback(
    (next: AnalyticsRangeSelection) => {
      navigate(buildAnalyticsRangePath(pathname, search, next));
    },
    [navigate, pathname, search],
  );

  const closeCustom = useCallback(() => {
    setShowCustomPicker(false);
  }, []);

  const handlePresetChange = useCallback(
    (next: Exclude<AnalyticsTimeRange, "custom">) => {
      navigateToSelection({ range: next, from: null, to: null });
      setShowCustomPicker(false);
    },
    [navigateToSelection],
  );

  const openCustomPicker = useCallback(() => {
    setDraftRange(initialRange);
    setMonth(initialRange.start.getUTCMonth());
    setYear(initialRange.start.getUTCFullYear());
    setShowCustomPicker(true);
  }, [initialRange]);

  const handleMonthChange = useCallback((nextMonth: number, nextYear: number) => {
    setMonth(nextMonth);
    setYear(nextYear);
  }, []);

  const handleDateChange = useCallback((range: { start: Date; end: Date }) => {
    setDraftRange(range);
  }, []);

  const applyCustomRange = useCallback(() => {
    if (!draftRange.start || !draftRange.end) return;
    const from = formatIsoDateUtc(draftRange.start);
    const to = formatIsoDateUtc(draftRange.end);
    if (from > to) return;
    navigateToSelection({ range: "custom", from, to });
    setShowCustomPicker(false);
  }, [draftRange.end, draftRange.start, navigateToSelection]);

  return (
    <>
      {/* Polaris web: s-button + s-popover — date range presets */}
      <s-button
        icon="calendar"
        commandFor={popoverId}
        accessibilityLabel={t("analytics.range.dateRange")}
      >
        {selectedLabel}
      </s-button>
      <s-popover id={popoverId} inlineSize="320px">
        <s-box padding="small">
          {showCustomPicker ? (
            /* Polaris React DatePicker — custom range (no web range picker yet) */
            <s-stack direction="block" gap="small">
              <s-stack
                direction="inline"
                gap="small"
                justifyContent="space-between"
                alignItems="center"
              >
                <s-heading>{t("analytics.range.customRange")}</s-heading>
                <s-button variant="tertiary" onClick={closeCustom}>
                  {t("common.back")}
                </s-button>
              </s-stack>
              <DatePicker
                month={month}
                year={year}
                onChange={handleDateChange}
                onMonthChange={handleMonthChange}
                selected={draftRange}
                allowRange
                disableDatesAfter={new Date()}
              />
              <s-stack direction="inline" gap="small-200" justifyContent="end">
                <Button
                  onClick={() => {
                    setShowCustomPicker(false);
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" onClick={applyCustomRange}>
                  {t("common.apply")}
                </Button>
              </s-stack>
            </s-stack>
          ) : (
            <s-stack direction="block" gap="none">
              {presetOptions.map((option) => (
                <s-button
                  key={option.value}
                  variant={
                    selection.range === option.value ? "primary" : "tertiary"
                  }
                  commandFor={popoverId}
                  command="--hide"
                  onClick={() => handlePresetChange(option.value)}
                >
                  {option.label}
                </s-button>
              ))}
              <s-button
                variant={selection.range === "custom" ? "primary" : "tertiary"}
                onClick={openCustomPicker}
              >
                {t("analytics.range.custom")}
              </s-button>
            </s-stack>
          )}
        </s-box>
      </s-popover>
    </>
  );
}
