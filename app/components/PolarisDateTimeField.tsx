import {
  BlockStack,
  Box,
  Button,
  DatePicker,
  InlineStack,
  Popover,
  TextField,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";

export type PolarisDateTimeFieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  helpText?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse `YYYY-MM-DDTHH:mm:ss` (datetime-local) into local Date + time string. */
function parseDatetimeLocal(raw: string): {
  date: Date;
  time: string;
} | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
  };
}

function toDatetimeLocalValue(date: Date, timeHms: string): string {
  const parts = timeHms.trim().split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0] ?? "0", 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] ?? "0", 10) || 0));
  const s = Math.min(59, Math.max(0, parseInt(parts[2] ?? "0", 10) || 0));
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatDisplay(raw: string): string {
  const parsed = parseDatetimeLocal(raw);
  if (!parsed) return "";
  return parsed.date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Polaris date + time picker (Popover + DatePicker + time TextField).
 * Value is datetime-local: `YYYY-MM-DDTHH:mm:ss`.
 */
export function PolarisDateTimeField({
  label,
  value,
  onChange,
  helpText,
}: PolarisDateTimeFieldProps) {
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => parseDatetimeLocal(value), [value]);
  const selectedDate = parsed?.date ?? new Date();
  const timeValue = parsed?.time ?? "00:00:00";

  const [{ month, year }, setMonthYear] = useState(() => ({
    month: selectedDate.getMonth(),
    year: selectedDate.getFullYear(),
  }));

  useEffect(() => {
    if (!open) return;
    setMonthYear({
      month: selectedDate.getMonth(),
      year: selectedDate.getFullYear(),
    });
  }, [open, selectedDate]);

  const emit = useCallback(
    (date: Date, timeHms: string) => {
      onChange(toDatetimeLocalValue(date, timeHms));
    },
    [onChange],
  );

  const handleDateChange = useCallback(
    (range: { start: Date; end: Date }) => {
      emit(range.start, timeValue);
    },
    [emit, timeValue],
  );

  const handleTimeChange = useCallback(
    (nextTime: string) => {
      const existingSec = timeValue.split(":")[2] ?? "00";
      const normalized =
        nextTime.length === 5
          ? `${nextTime}:${existingSec}`
          : nextTime || `00:00:${existingSec}`;
      emit(selectedDate, normalized);
    },
    [emit, selectedDate, timeValue],
  );

  const handleMonthChange = useCallback((m: number, y: number) => {
    setMonthYear({ month: m, year: y });
  }, []);

  const handleToday = useCallback(() => {
    const now = new Date();
    setMonthYear({ month: now.getMonth(), year: now.getFullYear() });
    emit(now, timeValue);
  }, [emit, timeValue]);

  const handleClear = useCallback(() => {
    onChange("");
    setOpen(false);
  }, [onChange]);

  const activator = (
    <TextField
      label={label}
      value={formatDisplay(value)}
      onChange={() => {}}
      onFocus={() => setOpen(true)}
      autoComplete="off"
      readOnly
      helpText={helpText}
      connectedRight={
        <Button
          icon={CalendarIcon}
          accessibilityLabel={`Pick ${label.toLowerCase()}`}
          onClick={() => setOpen((v) => !v)}
        />
      }
    />
  );

  return (
    <Popover
      active={open}
      activator={activator}
      onClose={() => setOpen(false)}
      preferredAlignment="left"
      fullWidth={false}
    >
      <Box padding="300">
        <BlockStack gap="300">
          <DatePicker
            month={month}
            year={year}
            onChange={handleDateChange}
            onMonthChange={handleMonthChange}
            selected={selectedDate}
          />
          <TextField
            label="Time"
            type="time"
            value={timeValue.slice(0, 5)}
            onChange={handleTimeChange}
            autoComplete="off"
            helpText="Hours and minutes (store local time)."
          />
          <InlineStack align="space-between" blockAlign="center">
            <Button variant="plain" onClick={handleClear}>
              Clear
            </Button>
            <Button variant="plain" onClick={handleToday}>
              Today
            </Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Popover>
  );
}
