const DEFAULT_NAME_MAX = 35;

/** Table / UI display: long names get "…" so columns stay readable. */
export function truncateCampaignDisplayName(
  name: string,
  maxLength = DEFAULT_NAME_MAX,
): string {
  const t = name.trim();
  if (t.length <= maxLength) return t;
  return `${t.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function productScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    all: "All products",
    "specific-products": "Specific products",
    variants: "Specific variants",
    collections: "Specific collections",
    "group-products": "Group products",
  };
  return labels[scope] ?? scope;
}

import type { VolumeDiscountWidgetPresentation } from "./widgetDisplay";

export function campaignTypeLabel(
  presentation?: VolumeDiscountWidgetPresentation,
): string {
  if (presentation === "volume_table") return "Volume discount";
  return "Quantity breaks";
}

export function discountTypeLabel(): string {
  return "Product discount";
}

export function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function statusBadgeTone(
  status: string,
): "success" | "attention" | "warning" | "critical" | "info" | "new" | "read-only" | "enabled" {
  if (status === "active") return "success";
  if (status === "draft") return "info";
  return "warning";
}

export function statusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "draft") return "Draft";
  if (status === "archived") return "Archived";
  return status;
}
