import { normalizeCatalogIdKey } from "./discountRules.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const VARIANT_PRODUCTS_QUERY = `#graphql
  query VolumeDiscountVariantProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        product {
          id
        }
      }
    }
  }
`;

function toVariantGid(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.includes("/ProductVariant/")) return s;
  if (/^\d+$/.test(s)) return `gid://shopify/ProductVariant/${s}`;
  const m = s.match(/\/ProductVariant\/(\d+)/);
  return m ? `gid://shopify/ProductVariant/${m[1]}` : null;
}

/**
 * Resolve ProductVariant GIDs/ids → parent Product numeric id.
 * Returns Map keyed by both full GID and numeric variant id.
 */
export async function resolveVariantToProductIds(
  admin: AdminGraphql,
  variantIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const gids: string[] = [];
  const seen = new Set<string>();
  for (const raw of variantIds) {
    const gid = toVariantGid(raw);
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    gids.push(gid);
  }
  if (!gids.length) return out;

  const BATCH = 50;
  for (let i = 0; i < gids.length; i += BATCH) {
    const chunk = gids.slice(i, i + BATCH);
    try {
      const res = await admin.graphql(VARIANT_PRODUCTS_QUERY, {
        variables: { ids: chunk },
      });
      const json = (await res.json()) as {
        data?: {
          nodes?: Array<{
            id?: string;
            product?: { id?: string };
          } | null>;
        };
      };
      for (const node of json.data?.nodes ?? []) {
        if (!node?.id || !node.product?.id) continue;
        const vid = normalizeCatalogIdKey(node.id);
        const pid = normalizeCatalogIdKey(node.product.id);
        if (!vid || !pid) continue;
        out.set(node.id, pid);
        out.set(vid, pid);
      }
    } catch (e) {
      console.warn("[volume-discount] variant→product resolve failed", e);
    }
  }
  return out;
}

export function isLikelyVariantId(raw: string): boolean {
  const s = String(raw || "").trim();
  return s.includes("/ProductVariant/") || s.includes("/Variant/");
}
