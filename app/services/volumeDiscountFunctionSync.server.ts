import type { VolumeDiscountCampaign } from "@prisma/client";
import { prisma } from "../db.server";
import { buildVolumeDiscountFunctionConfig } from "../utils/volumeDiscountFunctionConfig.server";
import {
  isAutomaticDiscountLimitError,
  purgeLegacyVolumeDiscountNodes,
} from "./volumeDiscountLegacyCleanup.server";
import { deleteAutomaticDiscounts } from "./volumeDiscountShopify.server";
import {
  buildStorefrontWidgetJsonString,
  compactStorefrontShopMetafieldPayload,
} from "../utils/storefrontWidgetConfig.server";
import {
  resolveStorefrontWidgetShopGid,
  syncShopStorefrontWidgetMetafield,
} from "./shopStorefrontMetafield.server";
import { rebuildDiscountRulesForShop } from "../utils/discountRules.server";
import {
  buildProductRuleIndex,
  splitProductRuleIndexIntoMetafieldChunks,
} from "../utils/productRuleIndex.server";
import { mergeCampaignConfigFromMetafieldNodes } from "../utils/volumeDiscountCampaignMetafieldChunks.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const MF_NS = "volume_discount";
const MF_KEY_INPUT_VARS = "input_variables";
const MF_KEY_RULE_SOURCE = "rule_source";

function customerTagsFromRowJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === "string")
    .map((t) => t.trim())
    .filter(Boolean);
}

function collectCustomerSegmentTags(
  rows: VolumeDiscountCampaign[],
): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.customerType !== "logged-in-tag-any") {
      continue;
    }
    for (const t of customerTagsFromRowJson(r.customerTags)) {
      s.add(t);
    }
  }
  return [...s];
}

/** Read current Function metafield JSON from the live discount (one round-trip). */
const READ_APP_DISCOUNT_METAFIELDS = `#graphql
  query VolumeDiscountReadAppDiscountMetafields($id: ID!) {
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
 * After removing offer(s) from the DB, the live discount metafield still holds the previous
 * campaign list. Filter it down to remaining active ids to avoid re-resolving every collection
 * (which is slow and feels like the app is "overloading" on delete).
 */
async function tryConfigByFilteringExistingMetafield(
  admin: AdminGraphql,
  discountNodeId: string,
  activeRows: VolumeDiscountCampaign[],
): Promise<{ version: number; campaigns: unknown[] } | null> {
  if (activeRows.length === 0) return null;
  try {
    const res = await admin.graphql(READ_APP_DISCOUNT_METAFIELDS, {
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
    const merged = mergeCampaignConfigFromMetafieldNodes(nodes);
    if (!merged) return null;
    if (Number(merged.version) >= 4) return null;
    const oldCampaigns = merged.campaigns;
    if (!Array.isArray(oldCampaigns)) return null;

    const activeIds = new Set(activeRows.map((r) => r.id));
    const filtered: unknown[] = [];
    for (const c of oldCampaigns) {
      if (
        c &&
        typeof c === "object" &&
        typeof (c as { id?: unknown }).id === "string" &&
        activeIds.has((c as { id: string }).id)
      ) {
        filtered.push(c);
      }
    }
    if (filtered.length !== activeRows.length) return null;
    const kept = new Set(
      filtered.map((c) => String((c as { id: string }).id)),
    );
    for (const id of activeIds) {
      if (!kept.has(id)) return null;
    }
    return { version: 2, campaigns: filtered };
  } catch {
    return null;
  }
}

const CREATE_APP_DISCOUNT = `#graphql
  mutation VolumeDiscountAppCreate($d: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $d) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_APP_DISCOUNT = `#graphql
  mutation VolumeDiscountAppUpdate($id: ID!, $d: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $d) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function functionHandle(): string {
  return (
    process.env.SHOPIFY_VOLUME_DISCOUNT_FUNCTION_HANDLE?.trim() ||
    "volume-discount-fn"
  );
}

/** Shopify returns this when the stored discount id was deleted in admin but our DB still references it. */
function isStaleDiscountError(messages: string[]): boolean {
  const t = messages.join(" ").toLowerCase();
  return (
    t.includes("does not exist") ||
    t.includes("couldn't find") ||
    t.includes("could not find") ||
    t.includes("not found") ||
    t.includes("no longer exists") ||
    t.includes("resource not found")
  );
}

/**
 * Ensures the single shared Function discount exists when there are active offers
 * but no stored discount id (e.g. after install or legacy migration).
 */
export async function ensureVolumeDiscountFunctionDiscount(
  admin: AdminGraphql,
  shop: string,
): Promise<void> {
  const [activeCount, state] = await Promise.all([
    prisma.volumeDiscountCampaign.count({
      where: { shop, status: "active" },
    }),
    prisma.volumeDiscountShopState.findUnique({ where: { shop } }),
  ]);
  if (activeCount === 0 || state?.functionDiscountId) return;
  await syncVolumeDiscountShop(admin, shop);
}

/**
 * Keeps one automatic app discount per shop; metafield holds every active campaign + tiers.
 * Avoids Shopify’s ~25 automatic discount cap from one discount per tier.
 */
export async function syncVolumeDiscountShop(
  admin: AdminGraphql,
  shop: string,
  recursionDepth = 0,
): Promise<{ discountIds: string[]; errors: string[] }> {
  const [activeRows, state] = await Promise.all([
    prisma.volumeDiscountCampaign.findMany({
      where: { shop, status: "active" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.volumeDiscountShopState.findUnique({
      where: { shop },
    }),
  ]);

  if (activeRows.length === 0) {
    if (state?.functionDiscountId) {
      const shopGidPromise = resolveStorefrontWidgetShopGid(admin);
      const [{ errors: delErr }, gid] = await Promise.all([
        deleteAutomaticDiscounts(admin, [state.functionDiscountId]),
        shopGidPromise,
      ]);
      if (delErr.length) {
        return { discountIds: [], errors: delErr };
      }
      await prisma.volumeDiscountShopState.deleteMany({ where: { shop } });
      await prisma.volumeDiscountCampaign.updateMany({
        where: { shop },
        data: { shopifyDiscountIds: [] },
      });
      await syncShopStorefrontWidgetMetafield(
        admin,
        [],
        shop,
        undefined,
        gid ?? undefined,
      );
    } else {
      await syncShopStorefrontWidgetMetafield(admin, [], shop);
    }
    return { discountIds: [], errors: [] };
  }

  /* Shop GID + metafield read are independent; overlap them before any heavy collection GraphQL. */
  const shopGidPromise = resolveStorefrontWidgetShopGid(admin);
  const reused = await (state?.functionDiscountId
    ? tryConfigByFilteringExistingMetafield(
        admin,
        state.functionDiscountId,
        activeRows,
      )
    : Promise.resolve(null));
  const config = reused
    ? reused
    : await buildVolumeDiscountFunctionConfig(
        activeRows.map((r: VolumeDiscountCampaign) => ({
          id: r.id,
          campaignName: r.campaignName,
          displayName: r.displayName,
          productScope: r.productScope,
          quantityCondition: r.quantityCondition,
          customerType: r.customerType,
          customerTags: r.customerTags,
          productIds: r.productIds,
          collectionIds: r.collectionIds,
          tiers: r.tiers,
        })),
        admin,
      );

  if (!config.campaigns.length) {
    await shopGidPromise.catch(() => {});
    await syncShopStorefrontWidgetMetafield(admin, [], shop);
    return {
      discountIds: [],
      errors: ["No valid tiers on active offers — add at least one tier"],
    };
  }

  const keepId = state?.functionDiscountId ?? null;
  const { errors: purgeErrors } = await purgeLegacyVolumeDiscountNodes(
    admin,
    shop,
    keepId,
  );
  if (purgeErrors.length) {
    console.warn(
      "[volume-discount] legacy discount cleanup:",
      purgeErrors.join("; "),
    );
  }

  let campaignMfEntries: { key: string; value: string }[];
  let needsRemoteLookup = false;
  try {
    const campaignsForRules = (config.campaigns as {
      id: string;
      campaignName: string;
      displayName?: string | null;
      productScope: string;
      quantityCondition: string;
      customerType: string;
      customerTags: string[];
      productIds: string[];
      tiers: import("../utils/volumeDiscountFunctionConfig.server").FunctionTierConfig[];
    }[]) ?? [];

    const rulesInput = campaignsForRules.map((c) => ({
      id: c.id,
      campaignName: c.campaignName,
      displayName: c.displayName,
      productScope: c.productScope,
      quantityCondition: c.quantityCondition,
      customerType: c.customerType,
      customerTags: c.customerTags,
      productIds: c.productIds,
      tiers: c.tiers,
    }));

    const [, built] = await Promise.all([
      rebuildDiscountRulesForShop(shop, rulesInput),
      Promise.resolve().then(() => {
        const productIndex = buildProductRuleIndex({
          campaigns: campaignsForRules,
        });
        return splitProductRuleIndexIntoMetafieldChunks(productIndex);
      }),
    ]);

    campaignMfEntries = built.chunks;
    needsRemoteLookup = built.needsRemoteLookup;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { discountIds: [], errors: [msg] };
  }

  const inputVariables = JSON.stringify({
    customerSegmentTags: collectCustomerSegmentTags(activeRows),
  });
  const startsAt = new Date().toISOString();
  const metafields = [
    ...campaignMfEntries.map((entry) => ({
      namespace: MF_NS,
      key: entry.key,
      type: "json" as const,
      value: entry.value,
    })),
    {
      namespace: MF_NS,
      key: MF_KEY_INPUT_VARS,
      type: "json",
      value: inputVariables,
    },
    {
      namespace: MF_NS,
      key: MF_KEY_RULE_SOURCE,
      type: "json",
      value: JSON.stringify({
        mode: needsRemoteLookup ? "api" : "metafield",
        apiPath: "/apps/volume-discount/cart-rules",
        shopDomain: shop,
      }),
    },
  ];

  const baseInput = {
    title: "Offrefy — Quantity breaks",
    functionHandle: functionHandle(),
    startsAt,
    discountClasses: ["PRODUCT"],
    combinesWith: {
      productDiscounts: true,
      orderDiscounts: false,
      shippingDiscounts: true,
    },
    metafields,
  };

  let discountId: string;

  if (state?.functionDiscountId) {
    const res = await admin.graphql(UPDATE_APP_DISCOUNT, {
      variables: {
        id: state.functionDiscountId,
        d: baseInput,
      },
    });
    const parsed = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        discountAutomaticAppUpdate?: {
          automaticAppDiscount?: { discountId?: string } | null;
          userErrors?: { message: string }[];
        };
      };
    };
    const gqlErrors = parsed.errors?.map((e) => e.message) ?? [];
    const ue =
      parsed.data?.discountAutomaticAppUpdate?.userErrors ?? [];
    const ueMsgs = ue.map((e) => e.message || "Shopify error");
    const allUpdateMsgs = [...gqlErrors, ...ueMsgs];
    if (allUpdateMsgs.length) {
      await shopGidPromise.catch(() => {});
      if (
        recursionDepth === 0 &&
        isStaleDiscountError(allUpdateMsgs)
      ) {
        await prisma.volumeDiscountShopState.deleteMany({
          where: { shop },
        });
        return syncVolumeDiscountShop(admin, shop, 1);
      }
      return {
        discountIds: [],
        errors: allUpdateMsgs,
      };
    }
    discountId =
      parsed.data?.discountAutomaticAppUpdate?.automaticAppDiscount
        ?.discountId ?? state.functionDiscountId;
  } else {
    const res = await admin.graphql(CREATE_APP_DISCOUNT, {
      variables: { d: baseInput },
    });
    const parsed = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        discountAutomaticAppCreate?: {
          automaticAppDiscount?: { discountId?: string } | null;
          userErrors?: { message: string }[];
        };
      };
    };
    if (parsed.errors?.length) {
      await shopGidPromise.catch(() => {});
      return {
        discountIds: [],
        errors: [parsed.errors.map((e) => e.message).join("; ")],
      };
    }
    const ue =
      parsed.data?.discountAutomaticAppCreate?.userErrors ?? [];
    const ueMsgs = ue.map((e) => e.message || "Shopify error");
    if (ueMsgs.length) {
      await shopGidPromise.catch(() => {});
      if (recursionDepth === 0 && isAutomaticDiscountLimitError(ueMsgs)) {
        await purgeLegacyVolumeDiscountNodes(admin, shop, null);
        return syncVolumeDiscountShop(admin, shop, 1);
      }
      if (isAutomaticDiscountLimitError(ueMsgs)) {
        return {
          discountIds: [],
          errors: [
            ...ueMsgs,
            "Shopify allows 25 automatic discounts per store. Legacy per-offer discounts were removed; use Bulk actions → Sync all offers if this persists.",
          ],
        };
      }
      return {
        discountIds: [],
        errors: ueMsgs,
      };
    }
    const id =
      parsed.data?.discountAutomaticAppCreate?.automaticAppDiscount
        ?.discountId;
    if (!id) {
      await shopGidPromise.catch(() => {});
      return { discountIds: [], errors: ["Shopify did not return discount id"] };
    }
    discountId = id;
    await prisma.volumeDiscountShopState.upsert({
      where: { shop },
      create: { shop, functionDiscountId: discountId },
      update: { functionDiscountId: discountId },
    });
  }

  await prisma.$transaction([
    prisma.volumeDiscountCampaign.updateMany({
      where: { shop, status: "active" },
      data: { shopifyDiscountIds: [discountId] },
    }),
    prisma.volumeDiscountCampaign.updateMany({
      where: { shop, status: { not: "active" } },
      data: { shopifyDiscountIds: [] },
    }),
  ]);

  const widgetJsonFull = buildStorefrontWidgetJsonString(
    activeRows,
    config.campaigns as unknown[],
  );
  const widgetJson = compactStorefrontShopMetafieldPayload(widgetJsonFull);
  const gid = await shopGidPromise;
  await syncShopStorefrontWidgetMetafield(
    admin,
    activeRows,
    shop,
    widgetJsonFull,
    gid ?? undefined,
    widgetJson,
  );

  return { discountIds: [discountId], errors: [] };
}
