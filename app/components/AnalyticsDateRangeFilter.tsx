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

type AnalyticsDateRangeFilterProps = {
  selection: AnalyticsRangeSelection;
};

const PRESET_OPTIONS: Array<{
  value: Exclude<AnalyticsTimeRange, "custom">;
  label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

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
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [popoverActive, setPopoverActive] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

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

  const selectedLabel = useMemo(
    () => formatAnalyticsRangeLabel(selection),
    [selection],
  );

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
          accessibilityLabel="Date range"
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
                  Custom range
                </Text>
                <Button
                  variant="plain"
                  onClick={() => setShowCustomPicker(false)}
                >
                  Back
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
                <Button onClick={closePopover}>Cancel</Button>
                <Button variant="primary" onClick={applyCustomRange}>
                  Apply
                </Button>
              </InlineStack>
            </BlockStack>
          </div>
        </Popover.Pane>
      ) : (
        <ActionList
          actionRole="menuitemradio"
          items={[
            ...PRESET_OPTIONS.map((option) => ({
              content: option.label,
              active: selection.range === option.value,
              onAction: () => handlePresetChange(option.value),
            })),
            {
              content: "Custom",
              active: selection.range === "custom",
              onAction: openCustomPicker,
            },
          ]}
        />
      )}
    </Popover>
  );
}
