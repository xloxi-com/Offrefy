import { describe, test, expect } from "vitest";
import {
  MAX_LOCKED_CART_PRODUCTS,
  parseLockedProductIds,
  selectEligibleProductIds,
  capDiscountCandidates,
  cartLinesDiscountsGenerateRun,
} from "../src/run.js";

/** @param {number} count */
function makeCartLines(count) {
  /** @type {unknown[]} */
  const lines = [];
  for (let i = 1; i <= count; i++) {
    lines.push({
      id: `gid://shopify/CartLine/${i}`,
      quantity: 1,
      cost: { subtotalAmount: { amount: "10.0" } },
      merchandise: {
        id: `gid://shopify/ProductVariant/${i}`,
        product: {
          id: `gid://shopify/Product/${i}`,
          tiersMetafield: {
            jsonValue: {
              t: [{ m: 1, p: 10 }],
              q: "v",
            },
          },
        },
      },
    });
  }
  return lines;
}

describe("cart discount eligibility", () => {
  test("30 cart products: first 25 eligible, 26–30 excluded (stable locked order)", () => {
    const lines = makeCartLines(30);
    const locked = Array.from({ length: 25 }, (_, i) => String(i + 1));

    const eligible = selectEligibleProductIds(lines, locked);

    expect(eligible.size).toBe(MAX_LOCKED_CART_PRODUCTS);
    for (let i = 1; i <= 25; i++) {
      expect(eligible.has(String(i))).toBe(true);
    }
    for (let i = 26; i <= 30; i++) {
      expect(eligible.has(String(i))).toBe(false);
    }
  });

  test("adding product 26 does not remove eligibility for products 1–25", () => {
    const locked = Array.from({ length: 25 }, (_, i) => String(i + 1));

    const with25 = selectEligibleProductIds(makeCartLines(25), locked);
    const with30 = selectEligibleProductIds(makeCartLines(30), locked);

    for (let i = 1; i <= 25; i++) {
      expect(with25.has(String(i))).toBe(true);
      expect(with30.has(String(i))).toBe(true);
    }
    expect(with30.has("26")).toBe(false);
  });

  test("capDiscountCandidates keeps locked products when cart exceeds Shopify limit", () => {
    const lines = makeCartLines(30);
    const locked = Array.from({ length: 25 }, (_, i) => String(i + 1));
    /** @type {Map<string, { message: string, value: object, score: number }>} */
    const bestByLine = new Map();

    for (const line of lines) {
      bestByLine.set(line.id, {
        message: "10% OFF",
        value: { percentage: { value: 10 } },
        score: 10,
      });
    }

    const capped = capDiscountCandidates(lines, bestByLine, locked);

    expect(capped.size).toBeLessThanOrEqual(MAX_LOCKED_CART_PRODUCTS);
    for (let i = 1; i <= 25; i++) {
      expect(capped.has(`gid://shopify/CartLine/${i}`)).toBe(true);
    }
    for (let i = 26; i <= 30; i++) {
      expect(capped.has(`gid://shopify/CartLine/${i}`)).toBe(false);
    }
  });

  test("cartLinesDiscountsGenerateRun applies discounts to first 25 only in a 30-item cart", () => {
    const lines = makeCartLines(30);
    const locked = Array.from({ length: 25 }, (_, i) => String(i + 1));

    const result = cartLinesDiscountsGenerateRun({
      cart: {
        lines,
        vdLockedProductsAttr: { value: locked.join(",") },
      },
      discount: { discountClasses: ["PRODUCT"] },
    });

    expect(result.operations.length).toBe(1);
    const add = result.operations[0]?.productDiscountsAdd;
    expect(add).toBeTruthy();

    /** @type {string[]} */
    const targetLineIds = [];
    for (const cand of add?.candidates ?? []) {
      for (const t of cand.targets ?? []) {
        if (t?.cartLine?.id) targetLineIds.push(t.cartLine.id);
      }
    }

    expect(targetLineIds.length).toBeGreaterThan(0);
    expect(targetLineIds.length).toBeLessThanOrEqual(MAX_LOCKED_CART_PRODUCTS);

    for (let i = 1; i <= 25; i++) {
      expect(targetLineIds).toContain(`gid://shopify/CartLine/${i}`);
    }
    for (let i = 26; i <= 30; i++) {
      expect(targetLineIds).not.toContain(`gid://shopify/CartLine/${i}`);
    }
  });

  test("parseLockedProductIds respects max slots", () => {
    const raw = Array.from({ length: 30 }, (_, i) => String(i + 1)).join(",");
    const parsed = parseLockedProductIds(raw);
    expect(parsed.length).toBe(MAX_LOCKED_CART_PRODUCTS);
  });
});
