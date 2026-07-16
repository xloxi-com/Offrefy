import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ActionList,
  BlockStack,
  Button,
  DatePicker,
  InlineStack,
  Popover,
  Text,
} from "@shopify/polaris";
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

export function AnalyticsDateRangeFilter({
  selection,
}: AnalyticsDateRangeFilterProps) {
  const { t } = useAdminI18n();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [popoverActive, setPopoverActive] = useState(false);
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

  const closePopover = useCallback(() => {
    setPopoverActive(false);
    setShowCustomPicker(false);
  }, []);

  const togglePopover = useCallback(() => {
    setPopoverActive((open) => {
      const next = !open;
      if (!next) setShowCustomPicker(false);
      return next;
    });
  }, []);

  const handlePresetChange = useCallback(
    (next: Exclude<AnalyticsTimeRange, "custom">) => {
      navigateToSelection({ range: next, from: null, to: null });
      closePopover();
    },
    [closePopover, navigateToSelection],
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
    closePopover();
  }, [closePopover, draftRange.end, draftRange.start, navigateToSelection]);

  return (
    <Popover
      active={popoverActive}
      activator={
        <Button
          onClick={togglePopover}
          disclosure="select"
          accessibilityLabel={t("analytics.range.dateRange")}
        >
          {selectedLabel}
        </Button>
      }
      onClose={closePopover}
      preferredAlignment="right"
      autofocusTarget="first-node"
    >
      {showCustomPicker ? (
        <Popover.Pane>
          <div style={{ padding: "12px 16px", minWidth: 280 }}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="headingSm">
                  {t("analytics.range.customRange")}
                </Text>
                <Button
                  variant="plain"
                  onClick={() => setShowCustomPicker(false)}
                >
                  {t("common.back")}
                </Button>
              </InlineStack>
              <DatePicker
                month={month}
                year={year}
                onChange={handleDateChange}
                onMonthChange={handleMonthChange}
                selected={draftRange}
                allowRange
                disableDatesAfter={new Date()}
              />
              <InlineStack align="end" gap="200">
                <Button onClick={closePopover}>{t("common.cancel")}</Button>
                <Button variant="primary" onClick={applyCustomRange}>
                  {t("common.apply")}
                </Button>
              </InlineStack>
            </BlockStack>
          </div>
        </Popover.Pane>
      ) : (
        <ActionList
          actionRole="menuitemradio"
          items={[
            ...presetOptions.map((option) => ({
              content: option.label,
              active: selection.range === option.value,
              onAction: () => handlePresetChange(option.value),
            })),
            {
              content: t("analytics.range.custom"),
              active: selection.range === "custom",
              onAction: openCustomPicker,
            },
          ]}
        />
      )}
    </Popover>
  );
}
