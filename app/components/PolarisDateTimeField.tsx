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

import { formatDatetimeLocalDisplay } from "../utils/countdownTimes";
import { utcIsoToShopWallClock } from "../utils/shopTimezone";

export type PolarisDateTimeFieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  helpText?: string;
  /** When set, “Today” uses this shop IANA timezone (not the browser). */
  shopTimezone?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parse wall-clock `YYYY-MM-DDTHH:mm[:ss]` into calendar Date + time string.
 * Digits are treated as opaque wall-clock parts (shop TZ), not browser-local ISO.
 */
function parseDatetimeLocal(raw: string): {
  date: Date;
  time: string;
} | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? "0"),
  );
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d,
    time: `${pad2(Number(m[4]))}:${pad2(Number(m[5]))}:${pad2(Number(m[6] ?? "0"))}`,
  };
}

function toDatetimeLocalValue(date: Date, timeHms: string): string {
  const parts = timeHms.trim().split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0] ?? "0", 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] ?? "0", 10) || 0));
  const s = Math.min(59, Math.max(0, parseInt(parts[2] ?? "0", 10) || 0));
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(h)}:${pad2(m)}:${pad2(s)}`;
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
  shopTimezone,
}: PolarisDateTimeFieldProps) {
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => parseDatetimeLocal(value), [value]);
  const selectedDate = parsed?.date ?? new Date();
  const timeValue = parsed?.time ?? "00:00:00";
  const timeHelp = shopTimezone
    ? "Hours, minutes, and seconds (Shopify store timezone)."
    : "Hours, minutes, and seconds (store local time).";

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

  const shopNowWallClock = useCallback((): {
    date: Date;
    time: string;
    wall: string;
  } | null => {
    let wall = "";
    if (shopTimezone) {
      wall = utcIsoToShopWallClock(new Date().toISOString(), shopTimezone);
    } else {
      const n = new Date();
      wall = `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}T${pad2(n.getHours())}:${pad2(n.getMinutes())}:${pad2(n.getSeconds())}`;
    }
    const parsedNow = parseDatetimeLocal(wall);
    if (!parsedNow) return null;
    return { date: parsedNow.date, time: parsedNow.time, wall };
  }, [shopTimezone]);

  const emit = useCallback(
    (date: Date, timeHms: string) => {
      onChange(toDatetimeLocalValue(date, timeHms));
    },
    [onChange],
  );

  const handleDateChange = useCallback(
    (range: { start: Date; end: Date }) => {
      // Keep an existing non-midnight time; otherwise fill shop “now”.
      const keepTime =
        timeValue !== "00:00:00" && timeValue !== "00:00"
          ? timeValue
          : shopNowWallClock()?.time ?? timeValue;
      emit(range.start, keepTime);
    },
    [emit, shopNowWallClock, timeValue],
  );

  const handleTimeChange = useCallback(
    (nextTime: string) => {
      const raw = String(nextTime || "").trim();
      // Browsers may emit HH:mm or HH:mm:ss depending on step / locale UI.
      if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
        emit(selectedDate, raw);
        return;
      }
      if (/^\d{2}:\d{2}$/.test(raw)) {
        const existingSec = timeValue.split(":")[2] ?? "00";
        emit(selectedDate, `${raw}:${existingSec}`);
        return;
      }
      emit(selectedDate, raw || timeValue || "00:00:00");
    },
    [emit, selectedDate, timeValue],
  );

  const handleMonthChange = useCallback((m: number, y: number) => {
    setMonthYear({ month: m, year: y });
  }, []);

  const handleToday = useCallback(() => {
    const now = shopNowWallClock();
    if (!now) return;
    setMonthYear({ month: now.date.getMonth(), year: now.date.getFullYear() });
    // Write full wall-clock (date + current shop time) in one shot.
    onChange(now.wall);
  }, [onChange, shopNowWallClock]);

  const handleClear = useCallback(() => {
    onChange("");
    setOpen(false);
  }, [onChange]);

  const activator = (
    <TextField
      label={label}
      value={formatDatetimeLocalDisplay(value)}
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
            key={`vd-time-${timeValue}`}
            label="Time"
            type="time"
            step={1}
            value={timeValue}
            onChange={handleTimeChange}
            autoComplete="off"
            helpText={timeHelp}
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
