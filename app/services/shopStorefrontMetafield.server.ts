import { prisma } from "../db.server";
import {
  getCachedShopGid,
  setCachedShopGid,
} from "../utils/adminGraphqlCache.server";
import {
  buildStorefrontWidgetValue,
  type VolumeDiscountCampaignStorefrontRow,
} from "../utils/storefrontWidgetConfig.server";
import { getVolumeDiscountStorefrontPayload } from "./volumeDiscountStorefrontCache.server";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const SHOP_ID = `#graphql
  query VolumeDiscountShopId {
    shop {
      id
    }
  }
`;

const METAFIELDS_SET = `#graphql
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

const METAFIELD_DEF = `#graphql
  mutation VolumeDiscountStorefrontWidgetDef(
    $definition: MetafieldDefinitionInput!
  ) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAFIELD_DEF_UPDATE_ACCESS = `#graphql
  mutation VolumeDiscountMetafieldDefAccess(
    $definition: MetafieldDefinitionUpdateInput!
  ) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAFIELD_DEF_LOOKUP = `#graphql
  query VolumeDiscountMetafieldDefLookup(
    $ownerType: MetafieldOwnerType!
    $namespace: String!
    $key: String!
  ) {
    metafieldDefinitions(
      first: 1
      ownerType: $ownerType
      namespace: $namespace
      key: $key
    ) {
      nodes {
        id
        access {
          storefront
        }
      }
    }
  }
`;

let definitionEnsured = false;
let productTiersDefinitionEnsured = false;

async function ensureMetafieldStorefrontAccess(
  admin: AdminGraphql,
  ownerType: "SHOP" | "PRODUCT",
  namespace: string,
  key: string,
): Promise<void> {
  try {
    const lookup = await admin.graphql(METAFIELD_DEF_LOOKUP, {
      variables: { ownerType, namespace, key },
    });
    const parsed = (await lookup.json()) as {
      data?: {
        metafieldDefinitions?: {
          nodes?: Array<{
            id?: string;
            access?: { storefront?: string | null };
          }>;
        };
      };
    };
    const node = parsed.data?.metafieldDefinitions?.nodes?.[0];
    if (!node?.id) return;
    if (node.access?.storefront === "PUBLIC_READ") return;
    const upd = await admin.graphql(METAFIELD_DEF_UPDATE_ACCESS, {
      variables: {
        definition: {
          id: node.id,
          access: {
            storefront: "PUBLIC_READ",
          },
        },
      },
    });
    const updJson = (await upd.json()) as {
      data?: {
        metafieldDefinitionUpdate?: {
          userErrors?: { message?: string }[];
        };
      };
    };
    const ue = updJson.data?.metafieldDefinitionUpdate?.userErrors ?? [];
    if (ue.length) {
      console.warn(
        "[Offrefy] metafieldDefinitionUpdate access:",
        ue.map((e) => e.message).join("; "),
      );
    }
  } catch (e) {
    console.warn("[Offrefy] ensureMetafieldStorefrontAccess", e);
  }
}

async function ensureStorefrontWidgetDefinition(
  admin: AdminGraphql,
): Promise<void> {
  if (definitionEnsured) return;
  const res = await admin.graphql(METAFIELD_DEF, {
    variables: {
      definition: {
        name: "Offrefy — storefront widget",
        namespace: "volume_discount",
        key: "storefront_widget",
        description: "Quantity breaks for theme app blocks (JSON).",
        type: "json",
        ownerType: "SHOP",
      },
    },
  });
  const parsed = (await res.json()) as {
    data?: {
      metafieldDefinitionCreate?: {
        userErrors?: { message?: string }[];
      };
    };
  };
  const ue =
    parsed.data?.metafieldDefinitionCreate?.userErrors ?? [];
  const already =
    ue.length === 1 &&
    (ue[0]?.message?.toLowerCase().includes("taken") ||
      ue[0]?.message?.toLowerCase().includes("already"));
  if (ue.length && !already) {
    console.warn(
      "[Offrefy] metafieldDefinitionCreate:",
      ue.map((e) => e.message).join("; "),
    );
  }
  if (already) {
    await ensureMetafieldStorefrontAccess(
      admin,
      "SHOP",
      "volume_discount",
      "storefront_widget",
    ).catch(() => {});
  }
  definitionEnsured = true;
}

/**
 * Product-level compact offer JSON for Liquid boot when shop widget is per_product
 * (large catalogs). Must be storefront-readable for theme app embeds.
 */
export async function ensureProductTiersStorefrontDefinition(
  admin: AdminGraphql,
): Promise<void> {
  if (productTiersDefinitionEnsured) return;
  const res = await admin.graphql(METAFIELD_DEF, {
    variables: {
      definition: {
        name: "Offrefy — product tiers",
        namespace: "volume_discount",
        key: "tiers",
        description: "Compact volume-discount tiers for storefront widget bootstrap.",
        type: "json",
        ownerType: "PRODUCT",
      },
    },
  });
  const parsed = (await res.json()) as {
    data?: {
      metafieldDefinitionCreate?: {
        userErrors?: { message?: string }[];
      };
    };
  };
  const ue =
    parsed.data?.metafieldDefinitionCreate?.userErrors ?? [];
  const already = ue.some((e) => {
    const m = (e?.message || "").toLowerCase();
    return m.includes("taken") || m.includes("already");
  });
  if (ue.length && !already) {
    console.warn(
      "[Offrefy] product tiers metafieldDefinitionCreate:",
      ue.map((e) => e.message).join("; "),
    );
  }
  if (already) {
    await ensureMetafieldStorefrontAccess(
      admin,
      "PRODUCT",
      "volume_discount",
      "tiers",
    ).catch(() => {});
  }
  productTiersDefinitionEnsured = true;
}

/**
 * Runs alongside discount sync so save/delete waits on one fewer sequential Admin round-trip.
 */
export async function resolveStorefrontWidgetShopGid(
  admin: AdminGraphql,
  shop?: string,
): Promise<string | null> {
  if (shop) {
    const cached = getCachedShopGid(shop);
    if (cached) return cached;
  }

  try {
    await ensureStorefrontWidgetDefinition(admin);
  } catch (e) {
    console.warn("[Offrefy] storefront widget definition:", e);
  }
  try {
    await ensureProductTiersStorefrontDefinition(admin);
  } catch (e) {
    console.warn("[Offrefy] product tiers definition:", e);
  }
  const shopRes = await admin.graphql(SHOP_ID);
  const shopJson = (await shopRes.json()) as {
    errors?: { message: string }[];
    data?: { shop?: { id?: string } | null };
  };
  if (shopJson.errors?.length) {
    console.warn(
      "[Offrefy] shop id query:",
      shopJson.errors.map((e) => e.message).join("; "),
    );
    return null;
  }
  const id = shopJson.data?.shop?.id;
  if (!id) {
    console.warn("[Offrefy] shop id missing for storefront metafield");
    return null;
  }
  if (shop) setCachedShopGid(shop, id);
  return id;
}

export async function syncShopStorefrontWidgetMetafield(
  admin: AdminGraphql,
  rows: VolumeDiscountCampaignStorefrontRow[],
  shop: string,
  /** Full widget JSON for DB cache + app-proxy fallback. */
  prebuiltWidgetJson?: string,
  /** When set (from `resolveStorefrontWidgetShopGid`), skips definition + shop id queries. */
  resolvedShopGid?: string,
  /** When set, written to the shop metafield instead of `prebuiltWidgetJson` (large catalogs). */
  shopMetafieldJson?: string,
  /** Stored on `VolumeDiscountStorefrontPayload` for instant Sync-all no-op. */
  syncRowFingerprint?: string,
): Promise<void> {
  const cacheValue =
    prebuiltWidgetJson ??
    (rows.length === 0
      ? JSON.stringify({ version: 1, campaigns: [] })
      : await buildStorefrontWidgetValue(rows, admin, shop));
  const metafieldValue = shopMetafieldJson ?? cacheValue;

  let shopId: string | null = resolvedShopGid ?? null;

  const existingRow = await getVolumeDiscountStorefrontPayload(shop).catch(
    () => null,
  );
  /** Skip Admin metafield write when DB cache already matches and shop metafield uses the same JSON. */
  const skipShopMetafieldWrite =
    shopMetafieldJson == null &&
    existingRow?.payload === cacheValue;

  if (shopId) {
    try {
      if (existingRow?.payload !== cacheValue) {
        await prisma.volumeDiscountStorefrontPayload.upsert({
          where: { shop },
          create: {
            shop,
            payload: cacheValue,
            ...(syncRowFingerprint ? { syncRowFingerprint } : {}),
          },
          update: {
            payload: cacheValue,
            ...(syncRowFingerprint ? { syncRowFingerprint } : {}),
          },
        });
      } else if (syncRowFingerprint) {
        try {
          await prisma.volumeDiscountStorefrontPayload.update({
            where: { shop },
            data: { syncRowFingerprint },
          });
        } catch {
          /* column optional until migrated */
        }
      }
    } catch (e) {
      console.warn("[Offrefy] storefront DB cache:", e);
    }
  } else {
    const [, , shopRes] = await Promise.all([
      prisma.volumeDiscountStorefrontPayload
        .upsert({
          where: { shop },
          create: {
            shop,
            payload: cacheValue,
            ...(syncRowFingerprint ? { syncRowFingerprint } : {}),
          },
          update: {
            payload: cacheValue,
            ...(syncRowFingerprint ? { syncRowFingerprint } : {}),
          },
        })
        .catch((e) => {
          console.warn("[Offrefy] storefront DB cache:", e);
        }),
      (async () => {
        try {
          await ensureStorefrontWidgetDefinition(admin);
        } catch (e) {
          console.warn("[Offrefy] storefront widget definition:", e);
        }
      })(),
      admin.graphql(SHOP_ID),
    ]);
    const shopJson = (await shopRes.json()) as {
      errors?: { message: string }[];
      data?: { shop?: { id?: string } | null };
    };
    if (shopJson.errors?.length) {
      console.warn(
        "[Offrefy] shop id query:",
        shopJson.errors.map((e) => e.message).join("; "),
      );
      return;
    }
    shopId = shopJson.data?.shop?.id ?? null;
    if (!shopId) {
      console.warn("[Offrefy] shop id missing for storefront metafield");
      return;
    }
  }

  if (skipShopMetafieldWrite) {
    return;
  }

  const setRes = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: shopId,
          namespace: "volume_discount",
          key: "storefront_widget",
          type: "json",
          value: metafieldValue,
        },
      ],
    },
  });
  const setParsed = (await setRes.json()) as {
    errors?: { message: string }[];
    data?: {
      metafieldsSet?: {
        userErrors?: { message?: string }[];
      };
    };
  };
  if (setParsed.errors?.length) {
    console.warn(
      "[Offrefy] metafieldsSet:",
      setParsed.errors.map((e) => e.message).join("; "),
    );
    return;
  }
  const sue = setParsed.data?.metafieldsSet?.userErrors ?? [];
  if (sue.length) {
    console.warn(
      "[Offrefy] metafieldsSet userErrors:",
      sue.map((e) => e.message).join("; "),
    );
  }
}
