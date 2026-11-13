export type BogoCampaignStatus =
  | "draft"
  | "active"
  | "scheduled"
  | "archived";

export type BogoBuysRequirement = "quantity" | "amount";
export type BogoItemScope = "products" | "collections";
export type BogoGetsValueType = "free" | "percentage" | "amount";

export type BogoCampaignInput = {
  campaignName: string;
  displayName: string;
  status: BogoCampaignStatus;
  startsAt: Date;
  endsAt: Date | null;
  buysRequirement: BogoBuysRequirement;
  buysQuantity: number | null;
  buysAmount: string | null;
  buysScope: BogoItemScope;
  buysProductIds: string[];
  buysCollectionIds: string[];
  getsQuantity: number;
  getsScope: BogoItemScope;
  getsProductIds: string[];
  getsCollectionIds: string[];
  getsValueType: BogoGetsValueType;
  getsValue: string | null;
  usesPerOrderLimit: number | null;
  /** Normalized widget appearance JSON (VolumeDiscountWidgetDisplay shape). */
  widgetDisplay: Record<string, unknown>;
  /** Sparse per-locale overrides: { en: { transHeading, transCta, … } }. */
  displayNameTranslations: Record<string, Record<string, string>>;
  /** Shopify Combinations — stack with other discount classes. */
  combinesWithProductDiscounts: boolean;
  combinesWithOrderDiscounts: boolean;
  combinesWithShippingDiscounts: boolean;
};

export type BogoCampaignRecord = BogoCampaignInput & {
  id: string;
  shop: string;
  shopifyDiscountId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OfferKind = "volume" | "bogo";
