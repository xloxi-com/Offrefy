import { prisma } from "../db.server";
import {
  filterSortOffersForListView,
  type OffersListTab,
} from "./offersTableViewOrder.server";
import { stringifyJsonStringArrayForCsv } from "./csvTiersEasy.server";
import { tiersJsonToCompactCsvCell } from "./csvTierCompact.server";
import {
  escapeCsvField,
  VOLUME_DISCOUNT_CSV_HEADERS,
} from "./volumeDiscountCsv.server";

/**
 * UTF-8 CSV with BOM for Excel; rows match list filters/sort.
 * Short column set for easy edit — see `VOLUME_DISCOUNT_CSV_HEADERS`.
 * Returns `null` when there are no matching offers (avoid empty header-only files).
 */
export async function buildVolumeDiscountOffersCsvExport(
  shop: string,
  listView: { tab: OffersListTab; searchQuery: string; sort: string },
): Promise<string | null> {
  const allRows = await prisma.volumeDiscountCampaign.findMany({
    where: { shop },
    select: {
      campaignName: true,
      displayName: true,
      status: true,
      productScope: true,
      quantityCondition: true,
      customerType: true,
      customerTags: true,
      productIds: true,
      collectionIds: true,
      tiers: true,
      countdownStartsAt: true,
      countdownEndsAt: true,
      createdAt: true,
    },
  });
  const rows = filterSortOffersForListView(allRows, listView);
  if (rows.length === 0) {
    return null;
  }

  const headerLine = VOLUME_DISCOUNT_CSV_HEADERS.map(escapeCsvField).join(",");
  const lines = [headerLine];
  for (const c of rows) {
    const line = [
      escapeCsvField(c.campaignName),
      escapeCsvField(c.displayName ?? ""),
      escapeCsvField(c.status),
      escapeCsvField(c.productScope),
      escapeCsvField(c.quantityCondition),
      escapeCsvField(c.customerType),
      escapeCsvField(stringifyJsonStringArrayForCsv(c.customerTags)),
      escapeCsvField(stringifyJsonStringArrayForCsv(c.productIds)),
      escapeCsvField(stringifyJsonStringArrayForCsv(c.collectionIds)),
      escapeCsvField(tiersJsonToCompactCsvCell(c.tiers)),
      escapeCsvField(
        c.countdownStartsAt ? c.countdownStartsAt.toISOString() : "",
      ),
      escapeCsvField(
        c.countdownEndsAt ? c.countdownEndsAt.toISOString() : "",
      ),
    ].join(",");
    lines.push(line);
  }

  return `\uFEFF${lines.join("\r\n")}`;
}
