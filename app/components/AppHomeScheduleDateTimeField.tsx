import { useCallback, useEffect, useId, useMemo, useState } from "react";

import {
  normalizeIanaTimeZone,
  utcIsoToShopWallClock,
} from "../utils/shopTimezone";

export type AppHomeScheduleDateTimeFieldProps = {
  label: string;
  /** Shop wall-clock `YYYY-MM-DDTHH:mm[:ss]` (empty allowed when optional). */
  value: string;
  onChange: (next: string) => void;
  /** Shopify shop IANA timezone — values are wall clocks in this zone. */
  shopTimezone: string;
  optional?: boolean;
  details?: string;
  required?: boolean;
  error?: string;
  /** Locks date/time controls without changing onChange handlers. */
  disabled?: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseWall(raw: string): {
  date: string;
  hour24: number;
  minute: number;
} | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return {
    date: m[1],
    hour24: Math.min(23, Math.max(0, Number.parseInt(m[2], 10) || 0)),
    minute: Math.min(59, Math.max(0, Number.parseInt(m[3], 10) || 0)),
  };
}

function to12Hour(hour24: number): { hour12: number; period: "AM" | "PM" } {
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const h = hour24 % 12;
  return { hour12: h === 0 ? 12 : h, period };
}

function to24Hour(hour12: number, period: "AM" | "PM"): number {
  const h = Math.min(12, Math.max(1, hour12));
  if (period === "AM") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

function joinWall(date: string, hour24: number, minute: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return `${date}T${pad2(hour24)}:${pad2(minute)}:00`;
}

function shopNowWall(shopTimezone: string): string {
  return utcIsoToShopWallClock(new Date().toISOString(), shopTimezone);
}

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => pad2(i));

/**
 * Compact Starts/Ends row using App Home v1.1 only:
 * `s-date-field` + narrow `s-select`s (hour / minute / AM·PM) on one grid row.
 */
export function AppHomeScheduleDateTimeField({
  label,
  value,
  onChange,
  shopTimezone,
  optional = false,
  details,
  required = false,
  error,
  disabled = false,
}: AppHomeScheduleDateTimeFieldProps) {
  const autoId = useId().replace(/:/g, "");
  const tz = normalizeIanaTimeZone(shopTimezone);
  const parsed = useMemo(() => parseWall(value), [value]);
  const dateValue = parsed?.date ?? "";
  const hour24 = parsed?.hour24 ?? 0;
  const minute = parsed?.minute ?? 0;
  const { hour12, period } = to12Hour(hour24);
  const defaultViewMonth = dateValue
    ? dateValue.slice(0, 7)
    : shopNowWall(tz).slice(0, 7);
  const [viewMonth, setViewMonth] = useState(defaultViewMonth);
  useEffect(() => {
    if (dateValue) setViewMonth(dateValue.slice(0, 7));
  }, [dateValue]);
  const timeDisabled = disabled || (optional && !parsed);

  const emit = useCallback(
    (nextDate: string, nextHour24: number, nextMinute: number) => {
      if (!nextDate) {
        if (optional) onChange("");
        return;
      }
      onChange(joinWall(nextDate, nextHour24, nextMinute));
    },
    [onChange, optional],
  );

  const ensureDefaults = useCallback((): {
    date: string;
    hour24: number;
    minute: number;
  } => {
    if (parsed) {
      return {
        date: parsed.date,
        hour24: parsed.hour24,
        minute: parsed.minute,
      };
    }
    const now = parseWall(shopNowWall(tz));
    return {
      date: now?.date ?? "",
      hour24: now?.hour24 ?? 0,
      minute: now?.minute ?? 0,
    };
  }, [parsed, tz]);

  const onDateChange = useCallback(
    (e: Event & { currentTarget: { value: string } }) => {
      const nextDate = String(e.currentTarget.value || "").trim();
      if (!nextDate) {
        if (optional) onChange("");
        return;
      }
      const d = ensureDefaults();
      emit(nextDate, d.hour24, d.minute);
    },
    [emit, ensureDefaults, onChange, optional],
  );

  const setHour = useCallback(
    (raw: string) => {
      const d = ensureDefaults();
      const nextH12 = Number.parseInt(raw, 10) || 12;
      const { period: p } = to12Hour(d.hour24);
      emit(d.date, to24Hour(nextH12, p), d.minute);
    },
    [emit, ensureDefaults],
  );

  const setMinute = useCallback(
    (raw: string) => {
      const d = ensureDefaults();
      const nextM = Number.parseInt(raw, 10) || 0;
      emit(d.date, d.hour24, nextM);
    },
    [emit, ensureDefaults],
  );

  const setPeriod = useCallback(
    (raw: string) => {
      const d = ensureDefaults();
      const nextPeriod = raw === "PM" ? "PM" : "AM";
      const { hour12: h12 } = to12Hour(d.hour24);
      emit(d.date, to24Hour(h12, nextPeriod), d.minute);
    },
    [emit, ensureDefaults],
  );

  return (
    <s-stack direction="block" gap="small-100">
      <s-grid
        gridTemplateColumns="minmax(10rem, 1fr) 4.5rem 4.5rem 4.75rem"
        gap="small-200"
        alignItems="end"
      >
        <s-date-field
          label={label}
          name={`${autoId}-date`}
          value={dateValue}
          defaultView={defaultViewMonth}
          view={viewMonth}
          required={required && !optional}
          error={error}
          placeholder="YYYY-MM-DD"
          disabled={disabled || undefined}
          onChange={onDateChange}
          onInput={onDateChange}
          onViewChange={(e) => {
            const next = String(
              (e.currentTarget as { view?: string }).view || "",
            ).trim();
            if (/^\d{4}-\d{2}$/.test(next)) setViewMonth(next);
          }}
        />
        <s-select
          label="Hour"
          name={`${autoId}-hour`}
          labelAccessibilityVisibility="exclusive"
          value={String(hour12)}
          disabled={timeDisabled || undefined}
          onChange={(e) => setHour(e.currentTarget.value)}
          onInput={(e) => setHour(e.currentTarget.value)}
        >
          {HOUR_OPTIONS.map((h) => (
            <s-option key={h} value={h}>
              {h}
            </s-option>
          ))}
        </s-select>
        <s-select
          label="Minute"
          name={`${autoId}-minute`}
          labelAccessibilityVisibility="exclusive"
          value={pad2(minute)}
          disabled={timeDisabled || undefined}
          onChange={(e) => setMinute(e.currentTarget.value)}
          onInput={(e) => setMinute(e.currentTarget.value)}
        >
          {MINUTE_OPTIONS.map((m) => (
            <s-option key={m} value={m}>
              {m}
            </s-option>
          ))}
        </s-select>
        <s-select
          label="AM/PM"
          name={`${autoId}-period`}
          labelAccessibilityVisibility="exclusive"
          value={period}
          disabled={timeDisabled || undefined}
          onChange={(e) => setPeriod(e.currentTarget.value)}
          onInput={(e) => setPeriod(e.currentTarget.value)}
        >
          <s-option value="AM">AM</s-option>
          <s-option value="PM">PM</s-option>
        </s-select>
      </s-grid>

      {details || optional ? (
        <s-stack direction="inline" gap="small-200" alignItems="center">
          {details ? (
            <s-paragraph color="subdued">{details}</s-paragraph>
          ) : null}
          {optional && !disabled ? (
            <s-button
              variant="tertiary"
              type="button"
              onClick={() => onChange("")}
            >
              Clear
            </s-button>
          ) : null}
        </s-stack>
      ) : null}
    </s-stack>
  );
}
