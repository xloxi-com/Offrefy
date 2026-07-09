/**
 * Mirrors the offers index table: filter (tab + search) then sort.
 * Used so CSV export order matches what the merchant sees.
 */
export type OffersListTab = "all" | "active" | "draft";

export type OffersListRow = {
  campaignName: string;
  status: string;
  createdAt: Date;
};

export function filterSortOffersForListView<T extends OffersListRow>(
  rows: T[],
  options: {
    tab: OffersListTab;
    searchQuery: string;
    /** e.g. `created desc`, `name asc` — same values as Index `sortSelected` */
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

  const sortValue = options.sort.trim() || "created desc";
  if (sortValue.startsWith("name")) {
    const desc = sortValue.endsWith("desc");
    return [...list].sort((a, b) => {
      const cmp = a.campaignName.localeCompare(b.campaignName);
      return desc ? -cmp : cmp;
    });
  }
  const desc = sortValue.endsWith("desc");
  return [...list].sort((a, b) => {
    const da = a.createdAt.getTime();
    const db = b.createdAt.getTime();
    return desc ? db - da : da - db;
  });
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
  const sort = url.searchParams.get("listSort") ?? "created desc";
  return { tab, searchQuery, sort };
}
