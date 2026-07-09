import { createHash } from "node:crypto";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const READ_DISCOUNT_MF = `#graphql
  query VolumeDiscountReadDiscountMetafieldFingerprint($id: ID!) {
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

/** Stable hash of discount metafield JSON — used to skip no-op Shopify updates. */
export function fingerprintMetafieldEntries(
  entries: readonly { key: string; value: string }[],
): string {
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
  const raw = sorted.map((e) => `${e.key}\0${e.value}`).join("\n");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function readLiveDiscountMetafieldFingerprint(
  admin: AdminGraphql,
  discountNodeId: string,
): Promise<string | null> {
  try {
    const res = await admin.graphql(READ_DISCOUNT_MF, {
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
    const nodes = node.metafields?.nodes ?? [];
    if (!nodes.length) return null;
    return fingerprintMetafieldEntries(nodes);
  } catch {
    return null;
  }
}
