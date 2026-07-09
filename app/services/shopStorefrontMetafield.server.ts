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

let definitionEnsured = false;

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
        access: {
          admin: "MERCHANT_READ_WRITE",
          storefront: "PUBLIC_READ",
        },
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
  definitionEnsured = true;
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
          create: { shop, payload: cacheValue },
          update: { payload: cacheValue },
        });
      }
    } catch (e) {
      console.warn("[Offrefy] storefront DB cache:", e);
    }
  } else {
    const [, , shopRes] = await Promise.all([
      prisma.volumeDiscountStorefrontPayload
        .upsert({
          where: { shop },
          create: { shop, payload: cacheValue },
          update: { payload: cacheValue },
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
