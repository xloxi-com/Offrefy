import { prisma } from "../db.server";
import { jsonStringArrayFromDb } from "./bogoForm.server";
import { defaultBogoWidgetDisplay } from "./bogoWidgetDisplay";
import {
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "./widgetDisplay";
import {
  campaignHasTranslationOverrides,
  mergeShopAndCampaignTranslations,
  parseSparseStorefrontTranslations,
  type SparseStorefrontTranslationsMap,
  type StorefrontTranslationsMap,
} from "./storefrontTranslations";

export type BogoStorefrontCampaign = {
  id: string;
  campaignName: string;
  displayName: string | null;
  offerKind: "bogo";
  productScope: "specific-products" | "collections" | "all";
  quantityCondition: string;
  customerType: string;
  customerTags: string[];
  productIds: string[];
  collectionIds: string[];
  /** Placeholder so legacy storefront checks that expect tiers stay safe. */
  tiers: Array<{
    minQty: number;
    buyLabel: string;
    badge: string | null;
    activeByDefault: boolean;
    percent: number;
  }>;
  countdownStartsAt: string | null;
  countdownEndsAt: string | null;
  widgetDisplay: VolumeDiscountWidgetDisplay;
  /** Sparse per-locale overrides (admin Translations tab). */
  displayNameTranslations?: SparseStorefrontTranslationsMap;
  /** Merged shop + campaign translations for storefront locale resolve. */
  translations?: StorefrontTranslationsMap;
  bogo: {
    buysRequirement: "quantity" | "amount";
    buysQuantity: number | null;
    buysAmount: string | null;
    buysScope: "products" | "collections";
    buysProductIds: string[];
    buysCollectionIds: string[];
    getsQuantity: number;
    getsScope: "products" | "collections";
    getsProductIds: string[];
    getsCollectionIds: string[];
    getsValueType: "free" | "percentage" | "amount";
    getsValue: string | null;
    usesPerOrderLimit: number | null;
    /** First sellable variant per Get product — used to auto-add free/Y items. */
    getsLines?: Array<{
      productId: string;
      variantId: string;
      title: string;
      imageUrl?: string;
      priceCents?: number;
    }>;
    /** Buy product media for the equation UI (first Buy product when scoped). */
    buysLines?: Array<{
      productId: string;
      title: string;
      imageUrl?: string;
      priceCents?: number;
    }>;
  };
};

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const BOGO_PRODUCT_MEDIA_QUERY = `#graphql
  query BogoProductMedia($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        featuredImage {
          url
        }
        variants(first: 10) {
          nodes {
            id
            availableForSale
            price
          }
        }
      }
    }
  }
`;

type BogoProductNode = {
  id?: string;
  title?: string;
  featuredImage?: { url?: string | null } | null;
  variants?: {
    nodes?: Array<{
      id?: string;
      availableForSale?: boolean;
      price?: string | null;
    }>;
  };
};

function priceStringToCents(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

/** Resolve first available variant + media for Get products (auto-add + UI). */
export async function resolveBogoGetsLines(
  admin: AdminGraphql,
  productGids: string[],
): Promise<
  Array<{
    productId: string;
    variantId: string;
    title: string;
    imageUrl?: string;
    priceCents?: number;
  }>
> {
  const ids = [...new Set(productGids.map(String).filter(Boolean))];
  if (!ids.length) return [];
  try {
    const res = await admin.graphql(BOGO_PRODUCT_MEDIA_QUERY, {
      variables: { ids },
    });
    const json = (await res.json()) as {
      data?: { nodes?: Array<BogoProductNode | null> };
    };
    const out: Array<{
      productId: string;
      variantId: string;
      title: string;
      imageUrl?: string;
      priceCents?: number;
    }> = [];
    for (const node of json.data?.nodes ?? []) {
      if (!node?.id) continue;
      const variants = node.variants?.nodes ?? [];
      const pick =
        variants.find((v) => v.availableForSale && v.id) ||
        variants.find((v) => v.id);
      if (!pick?.id) continue;
      const imageUrl = String(node.featuredImage?.url || "").trim();
      const priceCents = priceStringToCents(pick.price);
      out.push({
        productId: node.id,
        variantId: pick.id,
        title: String(node.title || "").trim() || "Get item",
        ...(imageUrl ? { imageUrl } : {}),
        ...(priceCents != null ? { priceCents } : {}),
      });
    }
    return out;
  } catch (e) {
    console.warn("[bogo] resolveBogoGetsLines", e);
    return [];
  }
}

/** Buy-side product title/image/price for the BOGO equation UI. */
export async function resolveBogoBuysLines(
  admin: AdminGraphql,
  productGids: string[],
): Promise<
  Array<{
    productId: string;
    title: string;
    imageUrl?: string;
    priceCents?: number;
  }>
> {
  const ids = [...new Set(productGids.map(String).filter(Boolean))].slice(0, 3);
  if (!ids.length) return [];
  try {
    const res = await admin.graphql(BOGO_PRODUCT_MEDIA_QUERY, {
      variables: { ids },
    });
    const json = (await res.json()) as {
      data?: { nodes?: Array<BogoProductNode | null> };
    };
    const out: Array<{
      productId: string;
      title: string;
      imageUrl?: string;
      priceCents?: number;
    }> = [];
    for (const node of json.data?.nodes ?? []) {
      if (!node?.id) continue;
      const variants = node.variants?.nodes ?? [];
      const pick =
        variants.find((v) => v.availableForSale && v.id) ||
        variants.find((v) => v.id);
      const imageUrl = String(node.featuredImage?.url || "").trim();
      const priceCents = priceStringToCents(pick?.price);
      out.push({
        productId: node.id,
        title: String(node.title || "").trim() || "Product",
        ...(imageUrl ? { imageUrl } : {}),
        ...(priceCents != null ? { priceCents } : {}),
      });
    }
    return out;
  } catch (e) {
    console.warn("[bogo] resolveBogoBuysLines", e);
    return [];
  }
}

/** Attach getsLines / buysLines media onto BOGO campaigns in widget JSON. */
export async function enrichBogoWidgetJsonWithGetsLines(
  admin: AdminGraphql,
  widgetJson: string,
): Promise<string> {
  try {
    const parsed = JSON.parse(widgetJson) as {
      campaigns?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    const campaigns = Array.isArray(parsed.campaigns) ? parsed.campaigns : [];
    let changed = false;
    for (const c of campaigns) {
      if (!c || c.offerKind !== "bogo") continue;
      const bogo = c.bogo as BogoStorefrontCampaign["bogo"] | undefined;
      if (!bogo) continue;
      const needsGets =
        bogo.getsScope === "products" &&
        (!(Array.isArray(bogo.getsLines) && bogo.getsLines.length) ||
          bogo.getsLines.some((l) => !l.imageUrl));
      if (needsGets) {
        const lines = await resolveBogoGetsLines(
          admin,
          bogo.getsProductIds || [],
        );
        if (lines.length) {
          bogo.getsLines = lines;
          changed = true;
        }
      }
      const needsBuys =
        bogo.buysScope === "products" &&
        (!(Array.isArray(bogo.buysLines) && bogo.buysLines.length) ||
          bogo.buysLines.some((l) => !l.imageUrl));
      if (needsBuys) {
        const buys = await resolveBogoBuysLines(
          admin,
          bogo.buysProductIds || [],
        );
        if (buys.length) {
          bogo.buysLines = buys;
          changed = true;
        }
      }
      c.bogo = bogo;
    }
    if (!changed) return widgetJson;
    return JSON.stringify(parsed);
  } catch (e) {
    console.warn("[bogo] enrichBogoWidgetJsonWithGetsLines", e);
    return widgetJson;
  }
}

/** Active / scheduled BOGO rows for the product-page widget. */
export async function loadBogoStorefrontCampaigns(
  shop: string,
): Promise<BogoStorefrontCampaign[]> {
  const now = new Date();
  const rows = await prisma.bogoCampaign.findMany({
    where: {
      shop,
      OR: [
        { status: "active" },
        {
          status: "scheduled",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row): BogoStorefrontCampaign => {
    const buysProductIds = jsonStringArrayFromDb(row.buysProductIds);
    const buysCollectionIds = jsonStringArrayFromDb(row.buysCollectionIds);
    const getsProductIds = jsonStringArrayFromDb(row.getsProductIds);
    const getsCollectionIds = jsonStringArrayFromDb(row.getsCollectionIds);
    const productIds = [...new Set([...buysProductIds, ...getsProductIds])];
    const collectionIds = [
      ...new Set([...buysCollectionIds, ...getsCollectionIds]),
    ];

    let productScope: BogoStorefrontCampaign["productScope"] =
      "specific-products";
    if (productIds.length === 0 && collectionIds.length > 0) {
      productScope = "collections";
    } else if (productIds.length === 0 && collectionIds.length === 0) {
      productScope = "all";
    }

    const buysQty = Math.max(1, row.buysQuantity ?? 1);
    const getsQty = Math.max(1, row.getsQuantity ?? 1);
    const buyLabel =
      row.buysRequirement === "amount"
        ? `Spend ${row.buysAmount ?? "0"}`
        : `Buy ${buysQty}`;
    const getLabel =
      row.getsValueType === "free"
        ? `Get ${getsQty} free`
        : row.getsValueType === "percentage"
          ? `Get ${getsQty} at ${row.getsValue ?? "0"}% off`
          : `Get ${getsQty} with $${row.getsValue ?? "0"} off`;

    return {
      id: row.id,
      campaignName: row.campaignName,
      displayName: row.displayName,
      offerKind: "bogo",
      productScope,
      quantityCondition: "per-product",
      customerType: "everyone",
      customerTags: [],
      productIds,
      collectionIds,
      tiers: [
        {
          minQty: buysQty,
          buyLabel,
          badge: "BOGO",
          activeByDefault: true,
          percent: 0,
        },
        {
          minQty: buysQty + getsQty,
          buyLabel: getLabel,
          badge: null,
          activeByDefault: false,
          percent:
            row.getsValueType === "free"
              ? 100
              : row.getsValueType === "percentage"
                ? Number.parseFloat(row.getsValue ?? "0") || 0
                : 0,
        },
      ],
      countdownStartsAt: row.startsAt.toISOString(),
      countdownEndsAt: row.endsAt?.toISOString() ?? null,
      widgetDisplay: normalizeVolumeDiscountWidgetDisplay({
        ...defaultBogoWidgetDisplay(row.displayName || row.campaignName),
        showCountdown: Boolean(row.endsAt),
        ...((row as { widgetDisplay?: unknown }).widgetDisplay &&
        typeof (row as { widgetDisplay?: unknown }).widgetDisplay === "object"
          ? ((row as { widgetDisplay: Record<string, unknown> }).widgetDisplay)
          : {}),
      }),
      displayNameTranslations: parseSparseStorefrontTranslations(
        (row as { displayNameTranslations?: unknown }).displayNameTranslations,
      ),
      bogo: {
        buysRequirement:
          row.buysRequirement === "amount" ? "amount" : "quantity",
        buysQuantity: row.buysQuantity,
        buysAmount: row.buysAmount,
        buysScope: row.buysScope === "collections" ? "collections" : "products",
        buysProductIds,
        buysCollectionIds,
        getsQuantity: getsQty,
        getsScope: row.getsScope === "collections" ? "collections" : "products",
        getsProductIds,
        getsCollectionIds,
        getsValueType:
          row.getsValueType === "percentage" || row.getsValueType === "amount"
            ? row.getsValueType
            : "free",
        getsValue: row.getsValue,
        usesPerOrderLimit: row.usesPerOrderLimit,
      },
    };
  });
}

/** Append BOGO campaigns after volume; storefront pick prefers BOGO / specific scope. */
export async function mergeBogoIntoStorefrontWidgetJson(
  shop: string,
  widgetJson: string,
  admin?: AdminGraphql | null,
): Promise<string> {
  try {
    const parsed = JSON.parse(widgetJson) as {
      version?: number;
      campaigns?: unknown[];
      [key: string]: unknown;
    };
    const existing = Array.isArray(parsed.campaigns) ? parsed.campaigns : [];
    const withoutBogo = existing.filter(
      (c) =>
        !(
          c &&
          typeof c === "object" &&
          (c as { offerKind?: string }).offerKind === "bogo"
        ),
    );
    const shopTranslations =
      parsed.translations &&
      typeof parsed.translations === "object" &&
      !Array.isArray(parsed.translations)
        ? (parsed.translations as StorefrontTranslationsMap)
        : ({} as StorefrontTranslationsMap);

    let bogo = await loadBogoStorefrontCampaigns(shop);
    bogo = bogo.map((camp) => {
      const overrides = camp.displayNameTranslations ?? {};
      if (!campaignHasTranslationOverrides(overrides)) {
        return camp;
      }
      return {
        ...camp,
        translations: mergeShopAndCampaignTranslations(
          shopTranslations,
          overrides,
        ),
      };
    });
    if (admin) {
      bogo = await Promise.all(
        bogo.map(async (camp) => {
          const nextBogo = { ...camp.bogo };
          if (camp.bogo.getsScope === "products") {
            nextBogo.getsLines = await resolveBogoGetsLines(
              admin,
              camp.bogo.getsProductIds,
            );
          }
          if (camp.bogo.buysScope === "products") {
            nextBogo.buysLines = await resolveBogoBuysLines(
              admin,
              camp.bogo.buysProductIds,
            );
          }
          return {
            ...camp,
            bogo: nextBogo,
          };
        }),
      );
    }
    parsed.campaigns = [...withoutBogo, ...bogo];
    parsed.version = parsed.version || 1;
    return JSON.stringify(parsed);
  } catch (e) {
    console.warn("[bogo] merge into storefront widget failed", shop, e);
    return widgetJson;
  }
}
