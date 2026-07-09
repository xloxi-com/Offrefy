/** Seeds new-campaign form: `?preset=quantity` (default) vs `?preset=volume`. */
export type VolumeDiscountNewOfferPreset =
  | "quantity_breaks"
  | "volume_table";

/** Tier row stored in DB `tiers` JSON and used for Shopify discount creation. */
export type TierPayload = {
  buyFrom: string;
  discountMode: string;
  value: string;
  /** `%` | `amount-each` | `fixed-price` | legacy `amount` */
  valueUnit: string;
  badge: string;
  multiples: boolean;
  activeByDefault: boolean;
  /**
   * Widget tier line (e.g. “Buy 10–14”). Empty = auto from quantities.
   */
  buyLabelText: string;
  /** Optional line under the option label on the widget (e.g. for tiers with no “You save” line). */
  optionSubtext: string;
};

export type VolumeDiscountProductScope =
  | "all"
  | "specific-products"
  | "variants"
  | "collections"
  | "group-products";

const SCOPES: VolumeDiscountProductScope[] = [
  "all",
  "specific-products",
  "variants",
  "collections",
  "group-products",
];

export function isVolumeDiscountProductScope(
  value: string,
): value is VolumeDiscountProductScope {
  return (SCOPES as string[]).includes(value);
}

export type VolumeDiscountQuantityCondition =
  | "total-all"
  | "per-collection"
  | "per-product"
  | "per-variant";

const QTY_CONDITIONS: VolumeDiscountQuantityCondition[] = [
  "total-all",
  "per-collection",
  "per-product",
  "per-variant",
];

export function isVolumeDiscountQuantityCondition(
  value: string,
): value is VolumeDiscountQuantityCondition {
  return (QTY_CONDITIONS as string[]).includes(value);
}

/** Stored on `VolumeDiscountCampaign.customerType` and in the discount Function metafield. */
export const VOLUME_DISCOUNT_CUSTOMER_TYPES = [
  "everyone",
  "logged-in",
  "logged-in-tag-any",
] as const;

export type VolumeDiscountCustomerType =
  (typeof VOLUME_DISCOUNT_CUSTOMER_TYPES)[number];

export function isVolumeDiscountCustomerType(
  value: string,
): value is VolumeDiscountCustomerType {
  return (VOLUME_DISCOUNT_CUSTOMER_TYPES as readonly string[]).includes(value);
}

/** Normalize legacy or unknown DB values to a supported customer type. */
export function normalizeVolumeDiscountCustomerType(
  raw: string,
): VolumeDiscountCustomerType {
  if (isVolumeDiscountCustomerType(raw)) return raw;
  if (raw === "logged-in-b2b") return "logged-in";
  if (raw === "logged-in-tag-none" || raw === "b2c") return "everyone";
  return "everyone";
}
