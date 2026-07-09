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
      __typename
      ... on DiscountAutomaticApp {
        metafields(first: 50, namespace: "volume_discount") {
          nodes {
            key
            value
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
          __typename?: string;
          metafields?: { nodes?: { key: string; value: string }[] };
        } | null;
      };
    };
    if (parsed.errors?.length) return null;
    const node = parsed.data?.discountNode;
    if (node?.__typename !== "DiscountAutomaticApp") return null;
    return node.metafields?.nodes ?? [];
  } catch {
    return null;
  }
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
