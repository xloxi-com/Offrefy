/**
 * Convert between Shopify shop IANA timezone wall clocks and UTC.
 * Schedule pickers store/display times in the shop timezone (not the browser).
 */

export function normalizeIanaTimeZone(tz: string | null | undefined): string {
  const t = String(tz ?? "").trim();
  if (!t) return "UTC";
  try {
    // Throws RangeError for invalid IANA ids.
    Intl.DateTimeFormat("en-US", { timeZone: t }).format(new Date());
    return t;
  } catch {
    return "UTC";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallPartsInTimeZone(date: Date, timeZone: string): WallParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
    };
  } catch {
    return null;
  }
}

/** Offset (ms) such that: utcMs = wallAsUtcMs - offset. */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const wall = wallPartsInTimeZone(date, timeZone);
  if (!wall) return 0;
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return asUtc - date.getTime();
}

function parseWallClockLocal(local: string): WallParts | null {
  const t = local.trim();
  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? "0"),
  };
}

/**
 * Interpret `YYYY-MM-DDTHH:mm[:ss]` as a wall clock in `timeZone` → UTC ISO.
 */
export function shopWallClockToUtcIso(
  local: string,
  timeZone: string,
): string | null {
  const wall = parseWallClockLocal(local);
  if (!wall) return null;
  const tz = normalizeIanaTimeZone(timeZone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  let utcMs = wallAsUtc - timeZoneOffsetMs(new Date(wallAsUtc), tz);
  // Second pass for DST edges.
  utcMs = wallAsUtc - timeZoneOffsetMs(new Date(utcMs), tz);
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Format a UTC ISO instant as shop wall-clock `YYYY-MM-DDTHH:mm:ss`. */
export function utcIsoToShopWallClock(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const wall = wallPartsInTimeZone(d, normalizeIanaTimeZone(timeZone));
  if (!wall) return "";
  return `${wall.year}-${pad2(wall.month)}-${pad2(wall.day)}T${pad2(wall.hour)}:${pad2(wall.minute)}:${pad2(wall.second)}`;
}

/** Human label for a shop wall-clock string (no browser TZ shift). */
export function formatShopWallClockDisplay(
  local: string | null | undefined,
): string {
  const wall = parseWallClockLocal(String(local ?? ""));
  if (!wall) return "";
  const d = new Date(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Short abbreviation for UI (e.g. IST, EST) at an optional instant. */
export function shopTimeZoneAbbreviation(
  timeZone: string,
  at: Date = new Date(),
): string {
  const tz = normalizeIanaTimeZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name?.trim() || tz;
  } catch {
    return tz;
  }
}

/**
 * Label for admin UI: Shopify IANA id + short abbr when different
 * e.g. `America/New_York (EDT)`, `Asia/Kolkata (IST)`.
 */
export function formatShopTimezoneDisplay(
  timeZone: string,
  at: Date = new Date(),
): string {
  const tz = normalizeIanaTimeZone(timeZone);
  const abbr = shopTimeZoneAbbreviation(tz, at);
  if (abbr && abbr !== tz) return `${tz} (${abbr})`;
  return tz;
}

/** `now + amount×unit` as shop wall-clock datetime-local. */
export function shopWallClockFromNow(
  amount: number,
  unit: string,
  timeZone: string,
): string {
  const n = Math.max(1, Math.floor(Number(amount)) || 1);
  let mult = 86400;
  if (unit === "hours") mult = 3600;
  else if (unit === "minutes") mult = 60;
  const end = new Date(Date.now() + n * mult * 1000);
  return utcIsoToShopWallClock(end.toISOString(), timeZone);
}
