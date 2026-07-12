import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  BlockStack,
  Button,
  ButtonGroup,
  DatePicker,
  Modal,
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
  const [customModalOpen, setCustomModalOpen] = useState(false);

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

  const customLabel = useMemo(() => {
    if (selection.range === "custom" && selection.from && selection.to) {
      return formatAnalyticsRangeLabel(selection);
    }
    return "Custom range";
  }, [selection]);

  const navigateToSelection = useCallback(
    (next: AnalyticsRangeSelection) => {
      navigate(buildAnalyticsRangePath(pathname, search, next));
    },
    [navigate, pathname, search],
  );

  const handlePresetChange = useCallback(
    (next: AnalyticsTimeRange) => {
      if (next === "custom") {
        setDraftRange(initialRange);
        setMonth(initialRange.start.getUTCMonth());
        setYear(initialRange.start.getUTCFullYear());
        setCustomModalOpen(true);
        return;
      }
      setCustomModalOpen(false);
      navigateToSelection({ range: next, from: null, to: null });
    },
    [initialRange, navigateToSelection],
  );

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
    setCustomModalOpen(false);
    navigateToSelection({ range: "custom", from, to });
  }, [draftRange.end, draftRange.start, navigateToSelection]);

  return (
    <>
      <ButtonGroup variant="segmented" noWrap>
        <Button
          pressed={selection.range === "7d"}
          onClick={() => handlePresetChange("7d")}
        >
          Last 7 days
        </Button>
        <Button
          pressed={selection.range === "30d"}
          onClick={() => handlePresetChange("30d")}
        >
          Last 30 days
        </Button>
        <Button
          pressed={selection.range === "all"}
          onClick={() => handlePresetChange("all")}
        >
          All time
        </Button>
        <Button
          pressed={selection.range === "custom"}
          onClick={() => handlePresetChange("custom")}
        >
          {customLabel}
        </Button>
      </ButtonGroup>
      <Modal
        open={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        title="Custom date range"
        primaryAction={{
          content: "Apply",
          onAction: applyCustomRange,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setCustomModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">
              Select a custom date range
            </Text>
            <DatePicker
              month={month}
              year={year}
              onChange={handleDateChange}
              onMonthChange={handleMonthChange}
              selected={draftRange}
              allowRange
              disableDatesAfter={new Date()}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}
