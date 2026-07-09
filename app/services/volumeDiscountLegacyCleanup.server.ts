import { prisma } from "../db.server";
import { parseShopifyDiscountIds } from "../utils/volumeDiscountTier";
import { deleteAutomaticDiscounts } from "./volumeDiscountShopify.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const SHARED_DISCOUNT_TITLE = "Offrefy — Quantity breaks";

const LIST_AUTOMATIC_DISCOUNTS = `#graphql
  query VolumeDiscountListAutomaticDiscounts($after: String) {
    automaticDiscountNodes(first: 50, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        automaticDiscount {
          __typename
          ... on DiscountAutomaticApp {
            title
          }
          ... on DiscountAutomaticBasic {
            title
          }
        }
      }
    }
  }
`;

function discountTitle(node: {
  automaticDiscount?: {
    __typename?: string;
    title?: string | null;
  } | null;
}): string {
  return String(node.automaticDiscount?.title ?? "").trim();
}

function isManagedVolumeDiscountTitle(title: string): boolean {
  const t = title.toLowerCase();
  return (
    t.includes("offrefy") ||
    t.includes("quantity break") ||
    t.includes("volume discount")
  );
}

/**
 * Removes legacy per-campaign automatic discounts so the shop stays at **one**
 * shared Function discount (1/25 slots).
 * Skips listing all store discounts when DB shows no legacy ids (hot-path save).
 */
export async function purgeLegacyVolumeDiscountNodes(
  admin: AdminGraphql,
  shop: string,
  keepDiscountNodeId: string | null,
): Promise<{ deleted: string[]; errors: string[] }> {
  const campaigns = await prisma.volumeDiscountCampaign.findMany({
    where: { shop },
    select: { shopifyDiscountIds: true },
  });

  const legacyFromDb = new Set<string>();
  for (const row of campaigns) {
    for (const id of parseShopifyDiscountIds(row.shopifyDiscountIds)) {
      if (id && id !== keepDiscountNodeId) {
        legacyFromDb.add(id);
      }
    }
  }

  if (legacyFromDb.size === 0 && keepDiscountNodeId) {
    return { deleted: [], errors: [] };
  }

  if (legacyFromDb.size > 0) {
    const { errors } = await deleteAutomaticDiscounts(admin, [...legacyFromDb]);
    return { deleted: [...legacyFromDb], errors };
  }

  const toDelete = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 20; page++) {
    const res = await admin.graphql(LIST_AUTOMATIC_DISCOUNTS, {
      variables: { after },
    });
    const parsed = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        automaticDiscountNodes?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: {
            id: string;
            automaticDiscount?: {
              __typename?: string;
              title?: string | null;
            } | null;
          }[];
        };
      };
    };

    if (parsed.errors?.length) {
      return {
        deleted: [],
        errors: parsed.errors.map((e) => e.message),
      };
    }

    const connection = parsed.data?.automaticDiscountNodes;
    const nodes = connection?.nodes ?? [];

    for (const node of nodes) {
      if (!node?.id || node.id === keepDiscountNodeId) continue;
      const title = discountTitle(node);
      if (
        legacyFromDb.has(node.id) ||
        isManagedVolumeDiscountTitle(title) ||
        title === SHARED_DISCOUNT_TITLE
      ) {
        toDelete.add(node.id);
      }
    }

    const pi = connection?.pageInfo;
    if (!pi?.hasNextPage || !pi.endCursor) break;
    after = pi.endCursor;
  }

  if (!toDelete.size) {
    return { deleted: [], errors: [] };
  }

  const { errors } = await deleteAutomaticDiscounts(admin, [...toDelete]);
  return { deleted: [...toDelete], errors };
}

export function isAutomaticDiscountLimitError(messages: string[]): boolean {
  const t = messages.join(" ").toLowerCase();
  return (
    t.includes("maximum number") ||
    t.includes("max number") ||
    t.includes("limit of 25") ||
    t.includes("25 automatic") ||
    t.includes("too many automatic") ||
    (t.includes("automatic discount") && t.includes("limit"))
  );
}
