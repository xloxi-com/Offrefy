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

/** Admin GraphQL → shop IANA timezone (fallback UTC). */
export async function resolveShopIanaTimezone(
  admin: GraphqlAdmin,
): Promise<string> {
  try {
    const res = await admin.graphql(SHOP_TIMEZONE_QUERY);
    const json = (await res.json()) as {
      data?: { shop?: { ianaTimezone?: string | null } | null } | null;
    };
    return normalizeIanaTimeZone(json.data?.shop?.ianaTimezone);
  } catch (error) {
    console.warn("[Offrefy] resolveShopIanaTimezone", error);
    return "UTC";
  }
}
