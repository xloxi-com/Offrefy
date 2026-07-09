import { prisma } from "../db.server";
import type { DiscountRuleDelegate } from "../types/discountRule";

/** Typed access to `prisma.discountRule` (works when IDE Prisma cache is stale). */
export function discountRuleDb(): DiscountRuleDelegate {
  return (prisma as unknown as { discountRule: DiscountRuleDelegate })
    .discountRule;
}
