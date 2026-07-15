/**
 * Mirrors the offers index table: filter (tab + search) then sort.
 * Shared by admin UI and CSV export.
 */
export type OffersListTab = "all" | "active" | "draft" | "scheduled";

export type OffersListRow = {
  campaignName: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  productScope?: string;
  widgetPresentation?: string;
};

function rowTime(value: Date | string): number {
  return new Date(value).getTime();
}

function compareText(a: string, b: string, desc: boolean): number {
  const cmp = a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return desc ? -cmp : cmp;
}

function compareByModified(
  a: OffersListRow,
  b: OffersListRow,
  desc: boolean,
): number {
  const ua = rowTime(a.updatedAt);
  const ub = rowTime(b.updatedAt);
  if (ua !== ub) return desc ? ub - ua : ua - ub;
  const ca = rowTime(a.createdAt);
  const cb = rowTime(b.createdAt);
  return desc ? cb - ca : ca - cb;
}

function campaignTypeSortKey(presentation?: string): string {
  return presentation === "volume_table" ? "Volume discount" : "Quantity breaks";
}

function productScopeSortKey(scope?: string): string {
  const labels: Record<string, string> = {
    all: "All products",
    "specific-products": "Specific products",
    variants: "Specific variants",
    collections: "Specific collections",
    "group-products": "Group products",
  };
  return labels[scope ?? ""] ?? scope ?? "";
}

function parseSortValue(sort: string): { field: string; desc: boolean } {
  const parts = sort.trim().split(/\s+/);
  const field = (parts[0] || "modified").toLowerCase();
  const dir = (parts[1] || "").toLowerCase();
  if (dir === "asc") return { field, desc: false };
  if (dir === "desc") return { field, desc: true };
  /* Dates default to newest-first when direction omitted. */
  if (field === "modified" || field === "created") {
    return { field, desc: true };
  }
  return { field, desc: false };
}

export function filterSortOffersForListView<T extends OffersListRow>(
  rows: T[],
  options: {
    tab: OffersListTab;
    searchQuery: string;
    /** e.g. `modified desc`, `created desc`, `name asc`, `status asc` */
    sort: string;
  },
): T[] {
  let list = rows;
  const q = options.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((c) => c.campaignName.toLowerCase().includes(q));
  }
  if (options.tab === "active") {
    list = list.filter((c) => c.status === "active");
  } else if (options.tab === "draft") {
    list = list.filter((c) => c.status === "draft");
  } else if (options.tab === "scheduled") {
    list = list.filter((c) => c.status === "scheduled");
  }

  const { field, desc } = parseSortValue(options.sort || "modified desc");

  switch (field) {
    case "name":
      return [...list].sort((a, b) =>
        compareText(a.campaignName, b.campaignName, desc),
      );
    case "discount":
      /* All rows share the same discount type today — keep name as stable order. */
      return [...list].sort((a, b) =>
        compareText(a.campaignName, b.campaignName, desc),
      );
    case "type":
      return [...list].sort((a, b) => {
        const cmp = compareText(
          campaignTypeSortKey(a.widgetPresentation),
          campaignTypeSortKey(b.widgetPresentation),
          desc,
        );
        return cmp || compareText(a.campaignName, b.campaignName, false);
      });
    case "apply":
      return [...list].sort((a, b) => {
        const cmp = compareText(
          productScopeSortKey(a.productScope),
          productScopeSortKey(b.productScope),
          desc,
        );
        return cmp || compareText(a.campaignName, b.campaignName, false);
      });
    case "impression":
    case "cr":
    case "orders":
      /* Metrics not populated yet — keep stable name order. */
      return [...list].sort((a, b) =>
        compareText(a.campaignName, b.campaignName, false),
      );
    case "status":
      return [...list].sort((a, b) => {
        const cmp = compareText(a.status, b.status, desc);
        return cmp || compareText(a.campaignName, b.campaignName, false);
      });
    case "created":
      return [...list].sort((a, b) => {
        const da = rowTime(a.createdAt);
        const db = rowTime(b.createdAt);
        if (da !== db) return desc ? db - da : da - db;
        return compareText(a.campaignName, b.campaignName, false);
      });
    case "modified":
    default:
      return [...list].sort((a, b) => compareByModified(a, b, desc));
  }
}

export function parseOffersExportListParams(url: URL): {
  tab: OffersListTab;
  searchQuery: string;
  sort: string;
} {
  const tabRaw = url.searchParams.get("listTab") ?? "all";
  const tab: OffersListTab =
    tabRaw === "active" || tabRaw === "draft" || tabRaw === "scheduled"
      ? tabRaw
      : "all";
  const searchQuery = url.searchParams.get("listQ") ?? "";
  const sort = url.searchParams.get("listSort") ?? "modified desc";
  return { tab, searchQuery, sort };
}
