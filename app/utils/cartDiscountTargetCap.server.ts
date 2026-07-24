/**
 * Cart product-discount target caps.
 *
 * Shopify’s “25” limit is active automatic *discount functions* per store —
 * not targets inside one Function. Offrefy already uses a single Function, so
 * we allow a large per-cart target budget (practical “unlimited”). Real ceiling
 * is Function instruction budget (~11M).
 */

/** Practical unlimited for cart product discounts (instruction budget still applies). */
export const CART_DISCOUNT_TARGET_CAP_STANDARD = 500;

/** Alias kept for Plus / partner-dev call sites (same raised budget). */
export const CART_DISCOUNT_TARGET_CAP_PLUS = 500;

type GraphqlAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const SHOP_PLAN_QUERY = `#graphql
  query OffrefyShopPlanCap {
    shop {
      plan {
        shopifyPlus
        partnerDevelopment
      }
    }
  }
`;

export type ShopifyShopPlanCap = {
  shopifyPlus: boolean;
  partnerDevelopment: boolean;
  maxTargets: number;
};

/** Per-cart product/target budget (same raised cap for all plans). */
export function maxCartDiscountTargets(
  _shopifyPlus?: boolean,
  _partnerDevelopment?: boolean,
): number {
  return CART_DISCOUNT_TARGET_CAP_PLUS;
}

/** Read whether the shop is on Shopify Plus (Admin GraphQL). */
export async function resolveShopifyShopPlanCap(
  admin: GraphqlAdmin,
): Promise<ShopifyShopPlanCap> {
  try {
    const res = await admin.graphql(SHOP_PLAN_QUERY);
    const json = (await res.json()) as {
      data?: {
        shop?: {
          plan?: {
            shopifyPlus?: boolean | null;
            partnerDevelopment?: boolean | null;
          } | null;
        } | null;
      };
    };
    const plan = json.data?.shop?.plan;
    const shopifyPlus = plan?.shopifyPlus === true;
    const partnerDevelopment = plan?.partnerDevelopment === true;
    return {
      shopifyPlus,
      partnerDevelopment,
      maxTargets: maxCartDiscountTargets(shopifyPlus, partnerDevelopment),
    };
  } catch (error) {
    console.warn("[Offrefy] resolveShopifyShopPlanCap", error);
    return {
      shopifyPlus: false,
      partnerDevelopment: false,
      maxTargets: CART_DISCOUNT_TARGET_CAP_STANDARD,
    };
  }
}
