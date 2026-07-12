/**
 * Mirrors the offers index table: filter (tab + search) then sort.
 * Shared by admin UI and CSV export.
 */
export type OffersListTab = "all" | "active" | "draft";

export type OffersListRow = {
  campaignName: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function rowTime(value: Date | string): number {
  return new Date(value).getTime();
}

function compareCampaignName(a: string, b: string, desc: boolean): number {
  const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
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

export function filterSortOffersForListView<T extends OffersListRow>(
  rows: T[],
  options: {
    tab: OffersListTab;
    searchQuery: string;
    /** e.g. `modified desc`, `created desc`, `name asc` */
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
  }

  const sortValue = options.sort.trim() || "modified desc";
  if (sortValue.startsWith("name")) {
    const desc = sortValue.endsWith("desc");
    return [...list].sort((a, b) =>
      compareCampaignName(a.campaignName, b.campaignName, desc),
    );
  }
  if (sortValue.startsWith("created")) {
    const desc = sortValue.endsWith("desc");
    return [...list].sort((a, b) => {
      const da = rowTime(a.createdAt);
      const db = rowTime(b.createdAt);
      return desc ? db - da : da - db;
    });
  }
  const desc = !sortValue.endsWith("asc");
  return [...list].sort((a, b) => compareByModified(a, b, desc));
}

export function parseOffersExportListParams(url: URL): {
  tab: OffersListTab;
  searchQuery: string;
  sort: string;
} {
  const tabRaw = url.searchParams.get("listTab") ?? "all";
  const tab: OffersListTab =
    tabRaw === "active" || tabRaw === "draft" ? tabRaw : "all";
  const searchQuery = url.searchParams.get("listQ") ?? "";
  const sort = url.searchParams.get("listSort") ?? "modified desc";
  return { tab, searchQuery, sort };
}
