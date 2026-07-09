type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Avoid repeating Admin GraphQL on every index revalidation (create/delete/list refresh). */
const PREVIEW_URL_CACHE_MS = 10 * 60 * 1000;
const previewUrlCache = new Map<
  string,
  { value: string | null; cachedAt: number }
>();

type ProductsJson = {
  errors?: { message: string }[];
  data?: {
    products?: {
      nodes?: Array<{
        onlineStoreUrl?: string | null;
        handle?: string | null;
      } | null> | null;
    } | null;
  } | null;
};

const PUBLISHED_FIRST = `#graphql
  query StorefrontProductPreviewPublished {
    products(first: 1, query: "published_status:published") {
      nodes {
        onlineStoreUrl
        handle
      }
    }
  }
`;

const ANY_FIRST = `#graphql
  query StorefrontProductPreviewAny {
    products(first: 1) {
      nodes {
        onlineStoreUrl
        handle
      }
    }
  }
`;

function urlFromNode(
  shopDomain: string,
  node: { onlineStoreUrl?: string | null; handle?: string | null } | null | undefined,
): string | null {
  if (!node) return null;
  const direct = node.onlineStoreUrl?.trim();
  if (direct) return direct;
  const handle = node.handle?.trim();
  if (handle) {
    return `https://${shopDomain}/products/${encodeURIComponent(handle)}`;
  }
  return null;
}

/**
 * First published product’s online store URL, or first product with a handle-based fallback.
 * Used for “Preview” on offer-type cards (opens the storefront product page in a new tab).
 */
export async function storefrontProductPreviewUrl(
  admin: AdminGraphql,
  shopDomain: string,
): Promise<string | null> {
  const now = Date.now();
  const hit = previewUrlCache.get(shopDomain);
  if (hit && now - hit.cachedAt < PREVIEW_URL_CACHE_MS) {
    return hit.value;
  }

  for (const query of [PUBLISHED_FIRST, ANY_FIRST]) {
    const res = await admin.graphql(query);
    const json = (await res.json()) as ProductsJson;
    if (json.errors?.length) {
      console.warn(
        "[Offrefy] storefrontProductPreviewUrl:",
        json.errors.map((e) => e.message).join("; "),
      );
      continue;
    }
    const node = json.data?.products?.nodes?.[0];
    const url = urlFromNode(shopDomain, node ?? undefined);
    if (url) {
      previewUrlCache.set(shopDomain, { value: url, cachedAt: now });
      return url;
    }
  }
  previewUrlCache.set(shopDomain, { value: null, cachedAt: now });
  return null;
}
