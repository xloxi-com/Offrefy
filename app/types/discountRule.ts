import type { Prisma } from "@prisma/client";

/** Row shape for `DiscountRule` (mirrors Prisma model; stable for IDE when client cache is stale). */
export type DiscountRuleRecord = {
  id: string;
  shop: string;
  campaignId: string;
  productId: string;
  status: string;
  tiers: unknown;
  quantityCondition: string;
  customerType: string;
  customerTags: unknown;
  displayName: string | null;
  campaignName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DiscountRuleCreateInput = {
  shop: string;
  campaignId: string;
  productId: string;
  status: string;
  tiers: Prisma.InputJsonValue;
  quantityCondition: string;
  customerType: string;
  customerTags: Prisma.InputJsonValue;
  displayName?: string | null;
  campaignName?: string | null;
};

export type DiscountRuleDelegate = {
  deleteMany: (args: {
    where:
      | { shop: string }
      | { shop: string; id: { in: string[] } }
      | { shop: string; productId: { in: string[] } };
  }) => Promise<{ count: number }>;
  createMany: (args: { data: DiscountRuleCreateInput[] }) => Promise<{ count: number }>;
  findMany: (args: {
    where: {
      shop: string;
      status?: string;
      productId?: { in: string[] };
    };
    select?: {
      id?: true;
      productId?: true;
      campaignId?: true;
      status?: true;
      tiers?: true;
      quantityCondition?: true;
      customerType?: true;
      customerTags?: true;
      displayName?: true;
      campaignName?: true;
    };
  }) => Promise<
    Array<
      Pick<
        DiscountRuleRecord,
        | "id"
        | "productId"
        | "campaignId"
        | "status"
        | "tiers"
        | "quantityCondition"
        | "customerType"
        | "customerTags"
        | "displayName"
        | "campaignName"
      > &
        Partial<DiscountRuleRecord>
    >
  >;
};
