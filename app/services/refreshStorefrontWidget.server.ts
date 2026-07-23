import { prisma } from "../db.server";
import { invalidateMemoryCachePrefix } from "../utils/memoryCache.server";
import { mergeCampaignConfigFromMetafieldNodes } from "../utils/volumeDiscountCampaignMetafieldChunks.server";
import { volumeDiscountCampaignSyncSelect } from "../utils/volumeDiscountCampaignSelect.server";
import {
  buildStorefrontWidgetJsonString,
  buildStorefrontWidgetValue,
  compactStorefrontShopMetafieldPayload,
  stampStorefrontWidgetRev,
} from "../utils/storefrontWidgetConfig.server";
import { loadStorefrontTranslationsForShop } from "../utils/storefrontTranslations.server";
import { patchDiscountMetafieldStorefrontTranslations } from "../utils/patchDiscountMetafieldTranslations.server";
import {
  resolveStorefrontWidgetShopGid,
  syncShopStorefrontWidgetMetafield,
} from "./shopStorefrontMetafield.server";
import { getVolumeDiscountStorefrontPayload } from "./volumeDiscountStorefrontCache.server";
import { applyDueCampaignScheduleTransitions } from "./campaignScheduleTransitions.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function runAfterResponse(promise: Promise<unknown>): void {
  void import("@vercel/functions")
    .then((mod) => {
      if (typeof mod.waitUntil === "function") {
        mod.waitUntil(promise);
        return;
      }
      void promise;
    })
    .catch(() => {
      void promise;
    });
}

const READ_DISCOUNT_MF = `#graphql
  query VolumeDiscountReadDiscountCampaigns($id: ID!) {
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
 * Rebuild storefront widget JSON from DB and persist immediately.
 * Call this on campaign save (awaited) so `/widget-config` is fresh before the admin toast.
 * Shopify shop metafield push is deferred so saves stay fast.
 */
export async function flushStorefrontWidgetPayloadNow(
  admin: AdminGraphql,
  shop: string,
): Promise<{ errors: string[] }> {
  invalidateMemoryCachePrefix(`widget:${shop}:`);

  await applyDueCampaignScheduleTransitions(shop);

  const rows = await prisma.volumeDiscountCampaign.findMany({
    where: { shop, status: "active" },
    orderBy: { createdAt: "asc" },
    select: volumeDiscountCampaignSyncSelect,
  });

  const rev = Date.now();
  let widgetJsonFull: string;
  try {
    if (rows.length === 0) {
      widgetJsonFull = stampStorefrontWidgetRev(
        JSON.stringify({ version: 1, campaigns: [] }),
        rev,
      );
    } else {
      widgetJsonFull = stampStorefrontWidgetRev(
        await buildStorefrontWidgetValue(rows, admin, shop),
        rev,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { errors: [msg] };
  }

  await prisma.volumeDiscountStorefrontPayload.upsert({
    where: { shop },
    create: { shop, payload: widgetJsonFull },
    update: { payload: widgetJsonFull },
  });

  /* Liquid metafield is secondary — do not block save response. */
  const widgetJson = compactStorefrontShopMetafieldPayload(widgetJsonFull);
  runAfterResponse(
    (async () => {
      try {
        const gid = await resolveStorefrontWidgetShopGid(admin, shop);
        await syncShopStorefrontWidgetMetafield(
          admin,
          rows,
          shop,
          widgetJsonFull,
          gid ?? undefined,
          widgetJson,
        );
      } catch (e) {
        console.warn(
          "[volume-discount] deferred shop metafield push after flush",
          shop,
          e,
        );
      }
    })(),
  );

  return { errors: [] };
}

/**
 * Updates storefront widget JSON (DB cache + shop metafield) without re-running
 * collection GraphQL or discount Function metafield writes.
 */
export async function refreshStorefrontWidgetForShop(
  admin: AdminGraphql,
  shop: string,
): Promise<{ errors: string[] }> {
  await applyDueCampaignScheduleTransitions(shop);

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
  let readErrors: string[] = [];
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
      readErrors = parsed.errors.map((e) => e.message);
    } else {
      const nodes = parsed.data?.discountNode?.metafields?.nodes ?? [];
      const merged = mergeCampaignConfigFromMetafieldNodes(nodes);
      if (merged && Array.isArray(merged.campaigns)) {
        builtCampaigns = merged.campaigns;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    readErrors = [msg];
  }

  if (!builtCampaigns.length) {
    if (readErrors.length) {
      console.warn(
        "[volume-discount] refreshStorefrontWidget discount metafield read failed, using DB campaigns",
        shop,
        readErrors.join("; "),
      );
    }
    try {
      const widgetJsonFull = await buildStorefrontWidgetValue(rows, admin, shop);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        errors: [
          readErrors[0] ??
            "Could not read discount campaigns from Shopify — use Sync all offers.",
          msg,
        ],
      };
    }
  }

  const widgetJsonFull = await buildStorefrontWidgetJsonString(rows, builtCampaigns);
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

/**
 * Pushes the latest translation sheets to the storefront without re-reading
 * Shopify discount metafields. Used after Settings save / auto-translate.
 */
export async function refreshStorefrontTranslationsForShop(
  admin: AdminGraphql,
  shop: string,
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  let translations = {};
  try {
    translations = await loadStorefrontTranslationsForShop(shop);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load translations";
    console.error("[volume-discount] refreshStorefrontTranslationsForShop", e);
    return { errors: [msg] };
  }

  const existingRow = await getVolumeDiscountStorefrontPayload(shop).catch(
    () => null,
  );

  if (!existingRow?.payload) {
    return refreshStorefrontWidgetForShop(admin, shop);
  }

  let payload: {
    version?: number;
    campaigns?: unknown[];
    translations?: unknown;
    mode?: string;
  };
  try {
    payload = JSON.parse(existingRow.payload) as typeof payload;
  } catch {
    return refreshStorefrontWidgetForShop(admin, shop);
  }

  payload.translations = translations;
  const widgetJsonFull = JSON.stringify({
    version: payload.version ?? 1,
    ...(payload.mode ? { mode: payload.mode } : {}),
    campaigns: Array.isArray(payload.campaigns) ? payload.campaigns : [],
    translations,
  });
  const widgetJson = compactStorefrontShopMetafieldPayload(widgetJsonFull);
  const gid = await resolveStorefrontWidgetShopGid(admin, shop);

  try {
    await syncShopStorefrontWidgetMetafield(
      admin,
      [],
      shop,
      widgetJsonFull,
      gid ?? undefined,
      widgetJson,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to sync storefront metafield";
    console.error("[volume-discount] refreshStorefrontTranslationsForShop sync", e);
    errors.push(msg);
  }

  invalidateMemoryCachePrefix(`widget:${shop}:`);
  invalidateMemoryCachePrefix(`cart-rules:${shop}:`);

  const discountPatch = await patchDiscountMetafieldStorefrontTranslations(
    admin,
    shop,
  );
  errors.push(...discountPatch.errors);

  return { errors };
}

export async function pushStorefrontWidgetToShop(
  admin: AdminGraphql,
  shop: string,
): Promise<{ errors: string[] }> {
  const cached = await getVolumeDiscountStorefrontPayload(shop).catch(() => null);
  // Translations path already patches discount metafields — avoid a second GraphQL round-trip.
  if (cached?.payload) {
    return refreshStorefrontTranslationsForShop(admin, shop);
  }

  const storefrontErrors = (await refreshStorefrontWidgetForShop(admin, shop))
    .errors;
  const discountErrors = (
    await patchDiscountMetafieldStorefrontTranslations(admin, shop)
  ).errors;

  return { errors: [...storefrontErrors, ...discountErrors] };
}
