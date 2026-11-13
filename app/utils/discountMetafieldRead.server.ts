import type { DiscountCombinesWith } from "./discountCombinesWith.server";
import { mergeCampaignConfigFromMetafieldNodes } from "./volumeDiscountCampaignMetafieldChunks.server";

export type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const READ_DISCOUNT_MF_NODES = `#graphql
  query VolumeDiscountReadDiscountMetafieldNodes($id: ID!) {
    discountNode(id: $id) {
      metafields(first: 50, namespace: "volume_discount") {
        nodes {
          key
          value
        }
      }
    }
  }
`;

const READ_DISCOUNT_COMBINES_WITH = `#graphql
  query VolumeDiscountReadCombinesWith($id: ID!) {
    automaticDiscountNode(id: $id) {
      automaticDiscount {
        __typename
        ... on DiscountAutomaticApp {
          combinesWith {
            orderDiscounts
            productDiscounts
            shippingDiscounts
          }
        }
      }
    }
  }
`;

/** One Admin round-trip: live `volume_discount` metafields on the shared app discount. */
export async function readDiscountVolumeMetafieldNodes(
  admin: AdminGraphql,
  discountNodeId: string,
): Promise<{ key: string; value: string }[] | null> {
  try {
    const res = await admin.graphql(READ_DISCOUNT_MF_NODES, {
      variables: { id: discountNodeId },
    });
    const parsed = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        discountNode?: {
          metafields?: { nodes?: { key: string; value: string }[] };
        } | null;
      };
    };
    if (parsed.errors?.length) return null;
    return parsed.data?.discountNode?.metafields?.nodes ?? [];
  } catch {
    return null;
  }
}

/** Live Shopify Combinations flags on the shared automatic app discount. */
export async function readLiveDiscountCombinesWith(
  admin: AdminGraphql,
  discountNodeId: string,
): Promise<DiscountCombinesWith | null> {
  try {
    const res = await admin.graphql(READ_DISCOUNT_COMBINES_WITH, {
      variables: { id: discountNodeId },
    });
    const parsed = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        automaticDiscountNode?: {
          automaticDiscount?: {
            __typename?: string;
            combinesWith?: {
              orderDiscounts?: boolean;
              productDiscounts?: boolean;
              shippingDiscounts?: boolean;
            } | null;
          } | null;
        } | null;
      };
    };
    if (parsed.errors?.length) return null;
    const cw =
      parsed.data?.automaticDiscountNode?.automaticDiscount?.combinesWith;
    if (!cw) return null;
    return {
      productDiscounts: Boolean(cw.productDiscounts),
      orderDiscounts: Boolean(cw.orderDiscounts),
      shippingDiscounts: Boolean(cw.shippingDiscounts),
    };
  } catch {
    return null;
  }
}

export function discountCombinesWithEqual(
  a: DiscountCombinesWith,
  b: DiscountCombinesWith,
): boolean {
  return (
    a.productDiscounts === b.productDiscounts &&
    a.orderDiscounts === b.orderDiscounts &&
    a.shippingDiscounts === b.shippingDiscounts
  );
}

export function existingCampaignsByIdFromMetafieldNodes(
  nodes: { key: string; value: string }[],
): Map<string, unknown> {
  const merged = mergeCampaignConfigFromMetafieldNodes(nodes);
  const map = new Map<string, unknown>();
  if (!merged || !Array.isArray(merged.campaigns)) return map;
  for (const c of merged.campaigns) {
    if (
      c &&
      typeof c === "object" &&
      typeof (c as { id?: unknown }).id === "string"
    ) {
      map.set((c as { id: string }).id, c);
    }
  }
  return map;
}
