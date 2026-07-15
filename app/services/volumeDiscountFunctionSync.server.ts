import type { VolumeDiscountCampaignSyncRow } from "../utils/volumeDiscountCampaignSelect.server";
import { volumeDiscountCampaignSyncSelect } from "../utils/volumeDiscountCampaignSelect.server";
import { prisma } from "../db.server";
import { applyDueCampaignScheduleTransitions } from "./campaignScheduleTransitions.server";
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
  ensureProductTiersStorefrontDefinition,
  resolveStorefrontWidgetShopGid,
  syncShopStorefrontWidgetMetafield,
} from "./shopStorefrontMetafield.server";
import { rebuildDiscountRulesForShop } from "../utils/discountRules.server";
import {
  buildProductRuleIndex,
  splitProductRuleIndexIntoMetafieldChunks,
} from "../utils/productRuleIndex.server";
import {
  fingerprintMetafieldEntries,
  readLiveDiscountMetafieldFingerprint,
} from "../utils/syncConfigFingerprint.server";
import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
import { mergeCampaignConfigFromMetafieldNodes } from "../utils/volumeDiscountCampaignMetafieldChunks.server";
import { getVolumeDiscountStorefrontPayload } from "./volumeDiscountStorefrontCache.server";
import {
  existingCampaignsByIdFromMetafieldNodes,
  readDiscountVolumeMetafieldNodes,
} from "../utils/discountMetafieldRead.server";
import { rowSyncFingerprint } from "../utils/syncRowFingerprint.server";
import { compactTranslationsForDiscountFunction } from "../utils/storefrontTranslations";
import { loadStorefrontTranslationsForShop } from "../utils/storefrontTranslations.server";

export type SyncShopOptions = {
  recursionDepth?: number;
  /** Edit save: collection GraphQL only for these campaign ids. */
  changedCampaignIds?: string[];
  /** Sync all: scan/delete legacy automatic discounts. */
  purgeLegacy?: boolean;
  /** Manual sync: skip fingerprint short-circuits and verify the live Shopify discount. */
  force?: boolean;
};

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const MF_NS = "volume_discount";
const MF_KEY_INPUT_VARS = "input_variables";
const MF_KEY_RULE_SOURCE = "rule_source";

const METAFIELDS_SET_MUTATION = `#graphql
  mutation VolumeDiscountShopWidgetMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function customerTagsFromRowJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === "string")
    .map((t) => t.trim())
    .filter(Boolean);
}

function collectCustomerSegmentTags(
  rows: Pick<VolumeDiscountCampaignSyncRow, "customerType" | "customerTags">[],
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
      metafields(first: 50, namespace: "volume_discount") {
        nodes {
          key
          value
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
  activeRows: VolumeDiscountCampaignSyncRow[],
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
          metafields?: { nodes?: { key: string; value: string }[] };
        } | null;
      };
    };
    if (parsed.errors?.length) return null;
    const nodes = parsed.data?.discountNode?.metafields?.nodes ?? [];
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

const VERIFY_DISCOUNT_NODE = `#graphql
  query VolumeDiscountVerifyDiscountNode($id: ID!) {
    discountNode(id: $id) {
      id
      discount {
        __typename
        ... on DiscountAutomaticApp {
          title
          status
        }
      }
    }
  }
`;

const FIND_SHARED_APP_DISCOUNT = `#graphql
  query VolumeDiscountFindSharedAppDiscount($after: String) {
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
            appDiscountType {
              functionId
            }
          }
        }
      }
    }
  }
`;

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

const SHARED_DISCOUNT_TITLE = "Offrefy — Quantity breaks";

async function discountNodeExistsInShopify(
  admin: AdminGraphql,
  discountNodeId: string,
): Promise<boolean> {
  try {
    const res = await admin.graphql(VERIFY_DISCOUNT_NODE, {
      variables: { id: discountNodeId },
    });
    const parsed = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        discountNode?: {
          id?: string;
          discount?: { __typename?: string } | null;
        } | null;
      };
    };
    if (parsed.errors?.length) return false;
    const node = parsed.data?.discountNode;
    return Boolean(
      node?.id &&
        node.discount?.__typename === "DiscountAutomaticApp",
    );
  } catch {
    return false;
  }
}

/** Re-link DB state when the stored discount id was removed in Shopify admin. */
async function clearStaleFunctionDiscountState(shop: string): Promise<void> {
  await prisma.volumeDiscountShopState.deleteMany({ where: { shop } });
  await prisma.volumeDiscountCampaign.updateMany({
    where: { shop },
    data: { shopifyDiscountIds: [] },
  });
}

/**
 * When shop state lost the discount id, adopt the shared automatic app discount
 * if it already exists in Shopify (e.g. after DB reset).
 */
async function findSharedAppDiscountNodeId(
  admin: AdminGraphql,
): Promise<string | null> {
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const res = await admin.graphql(FIND_SHARED_APP_DISCOUNT, {
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
    if (parsed.errors?.length) return null;

    const connection = parsed.data?.automaticDiscountNodes;
    for (const node of connection?.nodes ?? []) {
      if (!node?.id) continue;
      const title = String(node.automaticDiscount?.title ?? "").trim();
      if (
        node.automaticDiscount?.__typename === "DiscountAutomaticApp" &&
        (title === SHARED_DISCOUNT_TITLE ||
          title.toLowerCase().includes("offrefy"))
      ) {
        return node.id;
      }
    }

    const pi = connection?.pageInfo;
    if (!pi?.hasNextPage || !pi.endCursor) break;
    after = pi.endCursor;
  }
  return null;
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
    t.includes("resource not found") ||
    t.includes("invalid") ||
    t.includes("access denied") ||
    t.includes("access_denied")
  );
}

/**
 * Ensures the single shared Function discount exists when there are active offers
 * but no stored discount id (e.g. after install or legacy migration).
 */
const verifiedShops = new Set<string>();

export async function ensureVolumeDiscountFunctionDiscount(
  admin: AdminGraphql,
  shop: string,
): Promise<void> {
  if (verifiedShops.has(shop)) return;
  const [activeCount, state] = await Promise.all([
    prisma.volumeDiscountCampaign.count({
      where: { shop, status: "active" },
    }),
    prisma.volumeDiscountShopState.findUnique({ where: { shop } }),
  ]);
  if (activeCount === 0) {
    return;
  }
  if (state?.functionDiscountId) {
    const exists = await discountNodeExistsInShopify(
      admin,
      state.functionDiscountId,
    );
    if (exists) {
      verifiedShops.add(shop);
      return;
    }
    await clearStaleFunctionDiscountState(shop);
  }
  await syncVolumeDiscountShop(admin, shop, { force: true });
  verifiedShops.add(shop);
}

/**
 * Keeps one automatic app discount per shop; metafield holds every active campaign + tiers.
 * Avoids Shopify’s ~25 automatic discount cap from one discount per tier.
 */
export async function syncVolumeDiscountShop(
  admin: AdminGraphql,
  shop: string,
  options: SyncShopOptions = {},
): Promise<{ discountIds: string[]; errors: string[] }> {
  const recursionDepth = options.recursionDepth ?? 0;
  const incrementalIds = options.changedCampaignIds;
  const force = options.force === true;

  /* Ensure Scheduled/Ended windows are applied before we read Active rows. */
  await applyDueCampaignScheduleTransitions(shop);

  const [activeRows, stateRow] = await Promise.all([
    prisma.volumeDiscountCampaign.findMany({
      where: { shop, status: "active" },
      orderBy: { createdAt: "asc" },
      select: volumeDiscountCampaignSyncSelect,
    }),
    prisma.volumeDiscountShopState.findUnique({
      where: { shop },
    }),
  ]);

  let state = stateRow;

  if (activeRows.length === 0) {
    if (state?.functionDiscountId) {
      const shopGidPromise = resolveStorefrontWidgetShopGid(admin, shop);
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

  const rowFp = rowSyncFingerprint(activeRows);

  if (!force && !incrementalIds?.length && recursionDepth === 0) {
    try {
      const cached = await prisma.volumeDiscountStorefrontPayload.findUnique({
        where: { shop },
        select: { syncRowFingerprint: true },
      });
      if (
        cached?.syncRowFingerprint === rowFp &&
        state?.functionDiscountId
      ) {
        const exists = await discountNodeExistsInShopify(
          admin,
          state.functionDiscountId,
        );
        if (exists) {
          return { discountIds: [state.functionDiscountId], errors: [] };
        }
        await clearStaleFunctionDiscountState(shop);
        state = null;
      }
    } catch {
      /* column may be missing until migration — continue full sync */
    }
  }

  if (!state?.functionDiscountId) {
    const adoptedId = await findSharedAppDiscountNodeId(admin);
    if (adoptedId) {
      await prisma.volumeDiscountShopState.upsert({
        where: { shop },
        create: { shop, functionDiscountId: adoptedId },
        update: { functionDiscountId: adoptedId },
      });
      state = { shop, functionDiscountId: adoptedId };
    }
  } else if (force || recursionDepth > 0) {
    const exists = await discountNodeExistsInShopify(
      admin,
      state.functionDiscountId,
    );
    if (!exists) {
      await clearStaleFunctionDiscountState(shop);
      const adoptedId = await findSharedAppDiscountNodeId(admin);
      if (adoptedId) {
        await prisma.volumeDiscountShopState.upsert({
          where: { shop },
          create: { shop, functionDiscountId: adoptedId },
          update: { functionDiscountId: adoptedId },
        });
        state = { shop, functionDiscountId: adoptedId };
      } else {
        state = null;
      }
    }
  }

  const shopGidPromise = resolveStorefrontWidgetShopGid(admin, shop);
  const liveMetafieldNodes = state?.functionDiscountId
    ? await readDiscountVolumeMetafieldNodes(admin, state.functionDiscountId)
    : null;
  const existingCampaignsById = liveMetafieldNodes
    ? existingCampaignsByIdFromMetafieldNodes(liveMetafieldNodes)
    : new Map<string, unknown>();

  const reused =
    incrementalIds?.length || !state?.functionDiscountId
      ? null
      : await tryConfigByFilteringExistingMetafield(
          admin,
          state.functionDiscountId,
          activeRows,
        );

  const rowArgs = activeRows.map((r) => ({
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
  }));

  const config = reused
    ? reused
    : await buildVolumeDiscountFunctionConfig(
        rowArgs,
        admin,
        shop,
        incrementalIds?.length
          ? {
              changedCampaignIds: incrementalIds,
              existingCampaignsById,
            }
          : undefined,
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

  let campaignMfEntries: { key: string; value: string }[];
  let needsRemoteLookup = false;
  let widgetJsonFull: string;
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

    const discountFunctionTranslations = compactTranslationsForDiscountFunction(
      await loadStorefrontTranslationsForShop(shop),
    );

    const [{ errors: purgeErrors }, built, widgetJsonBuilt] = await Promise.all([
      options.purgeLegacy
        ? purgeLegacyVolumeDiscountNodes(admin, shop, keepId)
        : Promise.resolve({ deleted: [] as string[], errors: [] as string[] }),
      Promise.resolve().then(async () => {
        const oldRules = await prisma.discountRule.findMany({
          where: { shop, status: "active" },
          select: { productId: true },
        });
        const oldProductIds = new Set(
          oldRules.map((r) => r.productId).filter((id) => id !== "*")
        );

        await rebuildDiscountRulesForShop(shop, rulesInput);

        const newRules = await prisma.discountRule.findMany({
          where: { shop, status: "active" },
        });

        const metafieldsToSet: Array<{
          ownerId: string;
          namespace: string;
          key: string;
          type: string;
          value: string;
        }> = [];

        const newProductIds = new Set<string>();

        await ensureProductTiersStorefrontDefinition(admin).catch((e) => {
          console.warn("[volume-discount] product tiers storefront definition", e);
        });

        for (const row of newRules) {
          if (row.productId === "*") continue;
          newProductIds.add(row.productId);

          const productGid = `gid://shopify/Product/${row.productId}`;
          
          let tiersArray: any[] = [];
          if (Array.isArray(row.tiers)) {
            tiersArray = row.tiers;
          } else if (typeof row.tiers === "string") {
            try {
              tiersArray = JSON.parse(row.tiers);
            } catch {}
          }

          const compactTiers = tiersArray.map((t) => {
            const minQty = Number(t.minQuantity || t.minQty || 1);
            const val = Number(t.value ?? 0);
            if (t.discountType === "percentage") return { m: minQty, p: val };
            if (t.discountType === "fixed_price") return { m: minQty, fp: val };
            if (t.discountType === "fixed") return { m: minQty, f: val, ...(t.appliesToEachItem ? { e: 1 } : {}) };
            return null;
          }).filter(Boolean);

          const compactRule = {
            c: row.campaignId,
            m: (row.displayName || row.campaignName || "Volume discount").slice(0, 80),
            q: row.quantityCondition === "total-all" ? "a" : row.quantityCondition === "per-collection" ? "c" : row.quantityCondition === "per-product" ? "p" : "v",
            ct: row.customerType === "logged-in-tag-any" ? "t" : row.customerType === "logged-in" ? "l" : "e",
            tg: Array.isArray(row.customerTags) ? row.customerTags : [],
            t: compactTiers,
          };

          metafieldsToSet.push({
            ownerId: productGid,
            namespace: "volume_discount",
            key: "tiers",
            type: "json",
            value: JSON.stringify(compactRule),
          });
        }

        for (const oldId of oldProductIds) {
          if (!newProductIds.has(oldId)) {
            const productGid = `gid://shopify/Product/${oldId}`;
            metafieldsToSet.push({
              ownerId: productGid,
              namespace: "volume_discount",
              key: "tiers",
              type: "json",
              value: JSON.stringify({ t: [] }),
            });
          }
        }

        if (metafieldsToSet.length > 0) {
          const BATCH_SIZE = 25;
          for (let i = 0; i < metafieldsToSet.length; i += BATCH_SIZE) {
            const chunk = metafieldsToSet.slice(i, i + BATCH_SIZE);
            try {
              const res = await admin.graphql(METAFIELDS_SET_MUTATION, {
                variables: { metafields: chunk },
              });
              const parsed = (await res.json()) as any;
              const ue = parsed.data?.metafieldsSet?.userErrors ?? [];
              if (ue.length) {
                console.warn("[volume-discount] product metafieldsSet userErrors:", JSON.stringify(ue));
              }
            } catch (err) {
              console.error("[volume-discount] product metafieldsSet error:", err);
            }
          }
        }

        const productIndex = buildProductRuleIndex({
          campaigns: campaignsForRules,
        });
        return splitProductRuleIndexIntoMetafieldChunks(
          productIndex,
          discountFunctionTranslations,
        );
      }),
      buildStorefrontWidgetJsonString(
        activeRows,
        config.campaigns as unknown[],
      ),
    ]);
    widgetJsonFull = widgetJsonBuilt;

    if (purgeErrors.length) {
      console.warn(
        "[volume-discount] legacy discount cleanup:",
        purgeErrors.join("; "),
      );
    }

    campaignMfEntries = built.chunks;
    needsRemoteLookup = built.needsRemoteLookup;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { discountIds: [], errors: [msg] };
  }

  const widgetJson = compactStorefrontShopMetafieldPayload(widgetJsonFull);

  const inputVariables = JSON.stringify({
    customerSegmentTags: collectCustomerSegmentTags(activeRows),
  });
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
        mode: "api",
        apiPath: "/apps/volume-discount/cart-rules",
        shopDomain: shop,
      }),
    },
  ];

  const metafieldFingerprint = fingerprintMetafieldEntries(
    metafields.map((m) => ({ key: m.key, value: m.value })),
  );

  const discountIdExisting = state?.functionDiscountId;
  if (!force && discountIdExisting && liveMetafieldNodes) {
    const liveFp = fingerprintMetafieldEntries(liveMetafieldNodes);
    if (liveFp === metafieldFingerprint) {
      const cachedPayload = await getVolumeDiscountStorefrontPayload(shop);
      if (cachedPayload?.payload === widgetJsonFull) {
        try {
          await prisma.volumeDiscountStorefrontPayload.upsert({
            where: { shop },
            create: {
              shop,
              payload: widgetJsonFull,
              syncRowFingerprint: rowFp,
            },
            update: { syncRowFingerprint: rowFp },
          });
        } catch {
          /* syncRowFingerprint column optional until migrated */
        }
        return { discountIds: [discountIdExisting], errors: [] };
      }
    }
  } else if (!force && discountIdExisting) {
    const [liveFp, cachedPayload] = await Promise.all([
      readLiveDiscountMetafieldFingerprint(admin, discountIdExisting),
      getVolumeDiscountStorefrontPayload(shop),
    ]);
    if (
      liveFp === metafieldFingerprint &&
      cachedPayload?.payload === widgetJsonFull
    ) {
      return { discountIds: [discountIdExisting], errors: [] };
    }
  }

  const baseInput = {
    title: SHARED_DISCOUNT_TITLE,
    functionHandle: functionHandle(),
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
        return syncVolumeDiscountShop(admin, shop, {
          ...options,
          recursionDepth: 1,
        });
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
      variables: {
        d: {
          ...baseInput,
          startsAt: new Date().toISOString(),
        },
      },
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
        return syncVolumeDiscountShop(admin, shop, {
          ...options,
          recursionDepth: 1,
          purgeLegacy: true,
        });
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

  const gid = await shopGidPromise;
  await Promise.all([
    prisma.$transaction([
      prisma.volumeDiscountCampaign.updateMany({
        where: { shop, status: "active" },
        data: { shopifyDiscountIds: [discountId] },
      }),
      prisma.volumeDiscountCampaign.updateMany({
        where: { shop, status: { not: "active" } },
        data: { shopifyDiscountIds: [] },
      }),
    ]),
    syncShopStorefrontWidgetMetafield(
      admin,
      activeRows,
      shop,
      widgetJsonFull,
      gid ?? undefined,
      widgetJson,
      rowFp,
    ),
  ]);

  invalidateMemoryCachePrefix(`widget:${shop}:`);

  return { discountIds: [discountId], errors: [] };
}
