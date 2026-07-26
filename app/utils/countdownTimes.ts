import {
  formatShopWallClockDisplay,
  shopWallClockFromNow,
  shopWallClockToUtcIso,
  utcIsoToShopWallClock,
} from "./shopTimezone";

/**
 * Human duration input like `1d 23h 43m 4s` (order flexible; units optional).
 */
export function parseDurationToSeconds(input: string): number | null {
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  const re = /(\d+)\s*(d|h|m|s)\b/g;
  let total = 0;
  let found = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    found = true;
    const n = parseInt(m[1]!, 10);
    if (Number.isNaN(n) || n < 0) return null;
    const u = m[2]!;
    if (u === "d") total += n * 86400;
    else if (u === "h") total += n * 3600;
    else if (u === "m") total += n * 60;
    else total += n;
  }
  if (!found) return null;
  return total;
}

/** Admin “Unit” for the timer pill (matches `VolumeDiscountCountdownTimeUnit`). */
export type CountdownDisplayUnit = "days" | "hours" | "minutes";

export function normalizeCountdownDisplayUnit(
  raw: string | undefined | null,
): CountdownDisplayUnit {
  const s = String(raw ?? "").trim();
  if (s === "hours" || s === "minutes") return s;
  return "days";
}

/** Omit `0d` / `0h` / `0m`; always show seconds (e.g. `23h 58m 44s`, `5m 3s`, `0s`). */
function formatDhmsParts(
  d: number,
  h: number,
  m: number,
  s: number,
): string {
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function splitSecondsToDhms(sec: number): {
  d: number;
  h: number;
  m: number;
  s: number;
} {
  let t = sec;
  const d = Math.floor(t / 86400);
  t -= d * 86400;
  const h = Math.floor(t / 3600);
  t -= h * 3600;
  const m = Math.floor(t / 60);
  const s = t % 60;
  return { d, h, m, s };
}

const SECONDS_PER_DAY = 86400;

/**
 * Live timer pill — follows admin “Unit” for *which fields you edit*, but the pill
 * always rolls **≥24h** into **days** (e.g. 72h → `3d 0s`). Under 24h, **Minutes**
 * unit keeps padded `Xm Ys` / `1h 05s` style.
 * Zero `d` / `h` / `m` segments are omitted.
 */
export function formatCountdownForUnit(
  totalSeconds: number,
  unit: CountdownDisplayUnit,
): string {
  const sec = Math.max(0, Math.floor(totalSeconds));

  if (unit === "minutes" && sec < SECONDS_PER_DAY) {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const h = Math.floor(sec / 3600);
    const rem = sec % 3600;
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    if (h > 0) {
      const parts: string[] = [`${h}h`];
      if (m > 0) parts.push(`${pad2(m)}m`);
      parts.push(`${pad2(s)}s`);
      return parts.join(" ");
    }
    if (m > 0) {
      return `${m}m ${pad2(s)}s`;
    }
    return `${pad2(s)}s`;
  }

  const { d, h, m, s } = splitSecondsToDhms(sec);
  return formatDhmsParts(d, h, m, s);
}

/** @deprecated Prefer `formatCountdownForUnit(sec, "days")` — same as days layout. */
export function formatCountdownDhms(totalSeconds: number): string {
  return formatCountdownForUnit(totalSeconds, "days");
}

export function isoToDatetimeLocalValue(
  iso: string | null | undefined,
  timeZone?: string,
): string {
  if (!iso) return "";
  if (timeZone) return utcIsoToShopWallClock(iso, timeZone);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  // Include seconds so preview / reset round-trips keep sub-minute accuracy (minute-only drifted up to ~59s).
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Human-readable label for `YYYY-MM-DDTHH:mm:ss` wall-clock values (shop or browser). */
export function formatDatetimeLocalDisplay(
  local: string | null | undefined,
): string {
  return formatShopWallClockDisplay(local);
}

/**
 * Parse `YYYY-MM-DDTHH:mm[:ss]` as a *local* calendar time (not UTC).
 * Prefer `shopWallClockToUtcIso` when a shop IANA timezone is known.
 */
export function parseDatetimeLocalAsLocalDate(
  local: string,
): Date | null {
  const t = local.trim();
  if (!t) return null;
  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? "0"),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Seconds per admin “Unit” (days / hours / minutes) for volume-discount countdown. */
export function volumeDiscountCountdownSecondsPerUnit(unit: string): number {
  if (unit === "hours") return 3600;
  if (unit === "minutes") return 60;
  return 86400;
}

/** Value for `datetime-local` state: end = now + amount × unit (shop TZ when provided). */
export function countdownDatetimeLocalFromNow(
  amount: number,
  unit: string,
  timeZone?: string,
): string {
  if (timeZone) return shopWallClockFromNow(amount, unit, timeZone);
  const n = Math.max(1, Math.floor(Number(amount)) || 1);
  const mult = volumeDiscountCountdownSecondsPerUnit(unit);
  const end = new Date(Date.now() + n * mult * 1000);
  return isoToDatetimeLocalValue(end.toISOString());
}

/** Interpret wall-clock string → ISO UTC (shop TZ when provided). */
export function datetimeLocalToIsoUtc(
  local: string,
  timeZone?: string,
): string | null {
  if (timeZone) return shopWallClockToUtcIso(local, timeZone);
  const d = parseDatetimeLocalAsLocalDate(local);
  if (!d) return null;
  return d.toISOString();
}

export function parseOptionalIsoDate(raw: string): Date | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}
