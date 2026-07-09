import { prisma } from "../db.server";
import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
import { mergeCampaignConfigFromMetafieldNodes } from "../utils/volumeDiscountCampaignMetafieldChunks.server";
import { volumeDiscountCampaignSyncSelect } from "../utils/volumeDiscountCampaignSelect.server";
import {
  buildStorefrontWidgetJsonString,
  compactStorefrontShopMetafieldPayload,
} from "../utils/storefrontWidgetConfig.server";
import {
  resolveStorefrontWidgetShopGid,
  syncShopStorefrontWidgetMetafield,
} from "./shopStorefrontMetafield.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const READ_DISCOUNT_MF = `#graphql
  query VolumeDiscountReadDiscountCampaigns($id: ID!) {
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

/**
 * Updates storefront widget JSON (DB cache + shop metafield) without re-running
 * collection GraphQL or discount Function metafield writes.
 */
export async function refreshStorefrontWidgetForShop(
  admin: AdminGraphql,
  shop: string,
): Promise<{ errors: string[] }> {
  const [rows, state] = await Promise.all([
    prisma.volumeDiscountCampaign.findMany({
      where: { shop, status: "active" },
      orderBy: { createdAt: "asc" },
      select: volumeDiscountCampaignSyncSelect,
    }),
    prisma.volumeDiscountShopState.findUnique({ where: { shop } }),
  ]);

  const emptyPayload = JSON.stringify({ version: 1, campaigns: [] });

  if (!rows.length) {
    const gid = await resolveStorefrontWidgetShopGid(admin, shop);
    await syncShopStorefrontWidgetMetafield(
      admin,
      [],
      shop,
      emptyPayload,
      gid ?? undefined,
    );
    return { errors: [] };
  }

  if (!state?.functionDiscountId) {
    return {
      errors: [
        "No Shopify discount linked yet — activate the offer or use Sync all offers.",
      ],
    };
  }

  let builtCampaigns: unknown[] = [];
  try {
    const res = await admin.graphql(READ_DISCOUNT_MF, {
      variables: { id: state.functionDiscountId },
    });
    const parsed = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        discountNode?: {
          metafields?: { nodes?: { key: string; value: string }[] };
        } | null;
      };
    };
    if (parsed.errors?.length) {
      return { errors: parsed.errors.map((e) => e.message) };
    }
    const nodes = parsed.data?.discountNode?.metafields?.nodes ?? [];
    const merged = mergeCampaignConfigFromMetafieldNodes(nodes);
    if (merged && Array.isArray(merged.campaigns)) {
      builtCampaigns = merged.campaigns;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { errors: [msg] };
  }

  if (!builtCampaigns.length) {
    return {
      errors: [
        "Could not read discount campaigns from Shopify — use Sync all offers.",
      ],
    };
  }

  const widgetJsonFull = buildStorefrontWidgetJsonString(rows, builtCampaigns);
  const widgetJson = compactStorefrontShopMetafieldPayload(widgetJsonFull);
  const gid = await resolveStorefrontWidgetShopGid(admin, shop);
  await syncShopStorefrontWidgetMetafield(
    admin,
    rows,
    shop,
    widgetJsonFull,
    gid ?? undefined,
    widgetJson,
  );
  invalidateMemoryCachePrefix(`widget:${shop}:`);
  return { errors: [] };
}
