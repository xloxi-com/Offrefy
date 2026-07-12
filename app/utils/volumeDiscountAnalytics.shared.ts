export type AnalyticsTimeRange = "7d" | "30d" | "all" | "custom";

export type AnalyticsRangeSelection = {
  range: AnalyticsTimeRange;
  /** YYYY-MM-DD (UTC), set when range is custom */
  from: string | null;
  /** YYYY-MM-DD (UTC), set when range is custom */
  to: string | null;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDateString(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function parseIsoDateUtc(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseAnalyticsRangeFromUrl(url: URL): AnalyticsRangeSelection {
  const rangeParam = url.searchParams.get("range");
  const from = url.searchParams.get("from")?.trim() ?? "";
  const to = url.searchParams.get("to")?.trim() ?? "";

  if (
    rangeParam === "custom" &&
    isIsoDateString(from) &&
    isIsoDateString(to) &&
    from <= to
  ) {
    return { range: "custom", from, to };
  }
  if (rangeParam === "30d") return { range: "30d", from: null, to: null };
  if (rangeParam === "all") return { range: "all", from: null, to: null };
  return { range: "7d", from: null, to: null };
}

export function formatAnalyticsRangeLabel(selection: AnalyticsRangeSelection): string {
  if (selection.range === "custom" && selection.from && selection.to) {
    const from = parseIsoDateUtc(selection.from);
    const to = parseIsoDateUtc(selection.to);
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${fmt.format(from)} – ${fmt.format(to)}`;
  }
  if (selection.range === "30d") return "Last 30 days";
  if (selection.range === "all") return "All time";
  return "Last 7 days";
}

export function formatAnalyticsMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

export function formatAnalyticsCount(value: number): string {
  return value.toLocaleString();
}
