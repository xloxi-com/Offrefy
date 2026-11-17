import { normalizeIanaTimeZone } from "./shopTimezone";

type GraphqlAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const SHOP_TIMEZONE_QUERY = `#graphql
  query OffrefyShopTimezone {
    shop {
      ianaTimezone
    }
  }
`;

const timezoneCache = new Map<string, { tz: string; expiresAt: number }>();
/** Timezone almost never changes — cache aggressively per shop. */
const TIMEZONE_TTL_MS = 30 * 60 * 1000;

/** Admin GraphQL → shop IANA timezone (fallback UTC). Pass `shop` for cache key. */
export async function resolveShopIanaTimezone(
  admin: GraphqlAdmin,
  shop?: string,
): Promise<string> {
  const cacheKey = shop?.trim() || "default";
  const cached = timezoneCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tz;
  }

  try {
    const res = await admin.graphql(SHOP_TIMEZONE_QUERY);
    const json = (await res.json()) as {
      data?: { shop?: { ianaTimezone?: string | null } | null } | null;
    };
    const tz = normalizeIanaTimeZone(json.data?.shop?.ianaTimezone);
    timezoneCache.set(cacheKey, {
      tz,
      expiresAt: Date.now() + TIMEZONE_TTL_MS,
    });
    return tz;
  } catch (error) {
    console.warn("[Offrefy] resolveShopIanaTimezone", error);
    return "UTC";
  }
}
