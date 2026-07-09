import type {
  TierPayload,
  VolumeDiscountCustomerType,
  VolumeDiscountProductScope,
} from "../types/volumeDiscount";
import { normalizeVolumeDiscountCustomerType } from "../types/volumeDiscount";
import { normalizeTiersFromDb } from "./volumeDiscountTier";
import {
  getCachedCollectionProductIds,
  setCachedCollectionProductIds,
} from "./adminGraphqlCache.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type FunctionTierConfig = {
  minQty: number;
  percent?: number;
  fixedAmount?: number;
  appliesToEachItem?: boolean;
  /** Target sale price per unit (shop currency); discount = line subtotal − this × qty */
  fixedPricePerUnit?: number;
};

export type FunctionCampaignConfig = {
  id: string;
  campaignName: string;
  /** Shown on cart / storefront when set; otherwise `campaignName` is used */
  displayName?: string | null;
  productScope: VolumeDiscountProductScope;
  quantityCondition:
    | "total-all"
    | "per-collection"
    | "per-product"
    | "per-variant";
  customerType: VolumeDiscountCustomerType;
  /** Tags to match for `logged-in-tag-any` (subset of shop-wide segment tags in the Function input query). */
  customerTags: string[];
  productIds: string[];
  tiers: FunctionTierConfig[];
};

function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

/** Same semantics as CSV / widget: accept "percent" etc., not only "%". */
function isPercentValueUnit(valueUnit: string): boolean {
  const u = valueUnit.trim().toLowerCase();
  return (
    u === "%" || u === "percent" || u === "percentage" || u === "pct"
  );
}

/** Keep product targeting compact so large offer sets still fit metafield chunk limits. */
function compactProductIdsForDiscountFunction(ids: string[]): string[] {
  const out = new Set<string>();
  for (const raw of ids) {
    const s = raw.trim();
    if (!s) continue;
    const numericTail = s.match(/\/(\d+)\s*$/)?.[1];
    if (numericTail) {
      out.add(numericTail);
      continue;
    }
    if (/^\d+$/.test(s)) {
      out.add(s);
      continue;
    }
    out.add(s.trim());
  }
  return [...out];
}

function minQtyFromBuyFrom(buyFrom: string): number {
  const s = buyFrom.trim();
  const leading = s.match(/^(\d+)/);
  if (leading) {
    return Math.max(1, Math.floor(parseInt(leading[1], 10) || 1));
  }
  const n = parseInt(s, 10);
  return Math.max(1, Math.floor(Number.isFinite(n) ? n : 1));
}

function tierToFunctionTier(t: TierPayload): FunctionTierConfig | null {
  const minQty = minQtyFromBuyFrom(t.buyFrom);
  const raw = parseFloat(t.value);
  if (!Number.isFinite(raw) || raw < 0) return null;

  if (isPercentValueUnit(t.valueUnit)) {
    let pct = raw;
    if (pct > 0 && pct <= 1) pct = pct * 100;
    if (pct < 0 || pct > 100) return null;
    return { minQty, percent: pct };
  }

  if (t.valueUnit === "fixed-price") {
    if (raw <= 0) return null;
    return { minQty, fixedPricePerUnit: raw };
  }

  if (t.valueUnit === "amount-each") {
    return { minQty, fixedAmount: raw, appliesToEachItem: true };
  }

  // Legacy: valueUnit "amount" (or older saves) — respect Discount mode
  return {
    minQty,
    fixedAmount: raw,
    appliesToEachItem: t.discountMode === "per-item",
  };
}

function bestTiersFromPayload(tiers: TierPayload[]): FunctionTierConfig[] {
  const out: FunctionTierConfig[] = [];
  for (const t of tiers) {
    const ft = tierToFunctionTier(t);
    if (ft) out.push(ft);
  }
  out.sort((a, b) => a.minQty - b.minQty);
  return out;
}

const COLLECTION_PRODUCTS = `#graphql
  query VolumeDiscountCollectionProducts($id: ID!, $after: String) {
    collection(id: $id) {
      products(first: 250, after: $after) {
        edges {
          node {
            id
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

async function productIdsForCollection(
  admin: AdminGraphql,
  collectionGid: string,
  shop?: string,
): Promise<string[]> {
  if (shop) {
    const cached = getCachedCollectionProductIds(shop, collectionGid);
    if (cached) return cached;
  }

  const ids: string[] = [];
  let after: string | null = null;
  const maxPages = 40;

  for (let page = 0; page < maxPages; page++) {
    const res = await admin.graphql(COLLECTION_PRODUCTS, {
      variables: { id: collectionGid, after },
    });
    const json = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        collection?: {
          products?: {
            edges?: { node?: { id: string } | null }[];
            pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
          } | null;
        } | null;
      };
    };

    if (json.errors?.length) break;
    const edges = json.data?.collection?.products?.edges ?? [];
    for (const e of edges) {
      if (e?.node?.id) ids.push(e.node.id);
    }
    const pi = json.data?.collection?.products?.pageInfo;
    if (!pi?.hasNextPage || !pi.endCursor) break;
    after = pi.endCursor;
  }

  if (shop && ids.length) {
    setCachedCollectionProductIds(shop, collectionGid, ids);
  }

  return ids;
}

const COLLECTION_GRAPHQL_CONCURRENCY = 20;

async function resolveCollectionProductIds(
  admin: AdminGraphql,
  collectionGids: string[],
  shop?: string,
): Promise<Map<string, string[]>> {
  const unique = [...new Set(collectionGids)];
  const map = new Map<string, string[]>();
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += COLLECTION_GRAPHQL_CONCURRENCY) {
    const chunk = unique.slice(i, i + COLLECTION_GRAPHQL_CONCURRENCY);
    const pairs = await Promise.all(
      chunk.map(
        async (cid) =>
          [cid, await productIdsForCollection(admin, cid, shop)] as const,
      ),
    );
    for (const [cid, ids] of pairs) {
      map.set(cid, ids);
    }
  }
  return map;
}

/**
 * Build JSON consumed by the Discount Function (one metafield for all active campaigns).
 */
export async function buildVolumeDiscountFunctionConfig(
  args: {
    id: string;
    campaignName: string;
    displayName?: string | null;
    productScope: string;
    quantityCondition: string;
    customerType: string;
    customerTags: unknown;
    productIds: unknown;
    collectionIds: unknown;
    tiers: unknown;
  }[],
  admin: AdminGraphql,
  shop?: string,
): Promise<{ version: number; campaigns: unknown[] }> {
  const collectionGids: string[] = [];
  for (const row of args) {
    if ((row.productScope as VolumeDiscountProductScope) === "collections") {
      collectionGids.push(...jsonStringArray(row.collectionIds));
    }
  }
  const collectionProducts = await resolveCollectionProductIds(
    admin,
    collectionGids,
    shop,
  );

  const campaigns: unknown[] = [];

  for (const row of args) {
    const scope = row.productScope as VolumeDiscountProductScope;
    let productIds = jsonStringArray(row.productIds);
    const colIds =
      scope === "collections" ? jsonStringArray(row.collectionIds) : [];

    if (scope === "collections") {
      const expanded: string[] = [];
      for (const cid of colIds) {
        expanded.push(...(collectionProducts.get(cid) ?? []));
      }
      productIds = compactProductIdsForDiscountFunction([...new Set(expanded)]);
    } else {
      productIds = compactProductIdsForDiscountFunction(productIds);
    }

    const rawQ = String(row.quantityCondition ?? "per-variant");
    const q =
      rawQ === "total-all"
        ? "total-all"
        : rawQ === "per-collection"
          ? "per-collection"
          : rawQ === "per-product"
            ? "per-product"
            : "per-variant";
    const cust = normalizeVolumeDiscountCustomerType(
      String(row.customerType ?? "everyone"),
    );
    const tagList = jsonStringArray(row.customerTags);
    const tierList = bestTiersFromPayload(normalizeTiersFromDb(row.tiers));
    if (tierList.length === 0) continue;

    const displayName =
      typeof row.displayName === "string" && row.displayName.trim() !== ""
        ? row.displayName.trim()
        : null;

    /** Always send for `collections` scope so per-collection mode always has buckets (avoids empty metafield). */
    const collectionGroups =
      scope === "collections" && colIds.length > 0
        ? colIds.map((cid) => ({
            collectionId: cid,
            productIds: compactProductIdsForDiscountFunction([
              ...(collectionProducts.get(cid) ?? []),
            ]),
          }))
        : undefined;

    campaigns.push({
      id: row.id,
      campaignId: row.id,
      status: "active",
      campaignName: row.campaignName,
      displayName,
      productScope: scope,
      quantityCondition: q,
      customerType: cust,
      customerTags: tagList,
      productIds,
      ...(collectionGroups?.length ? { collectionGroups } : {}),
      tiers: tierList,
    });
  }

  return { version: 2, campaigns };
}
