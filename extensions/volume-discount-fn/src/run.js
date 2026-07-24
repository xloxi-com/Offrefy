import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * Per-cart product/target budget. Shopify’s “25” is active discount *functions*
 * per store — not targets in one Function. Default/fallback is 500 (practical
 * unlimited); rule_source.maxTargets from sync can override. Instruction
 * budget (~11M) is still the hard runtime ceiling — keep this file small.
 */
const MAX_TARGETS_STANDARD = 500;
const MAX_TARGETS_PLUS_FALLBACK = 500;

/** @param {unknown} gid */
function productNum(gid) {
  if (typeof gid !== "string") return "";
  const i = gid.lastIndexOf("/");
  return i >= 0 ? gid.slice(i + 1) : "";
}

/**
 * @param {unknown} ruleSource
 * @returns {number}
 */
function resolveMaxTargets(ruleSource) {
  if (ruleSource && typeof ruleSource === "object") {
    const n = /** @type {{ maxTargets?: unknown; shopifyPlus?: unknown }} */ (
      ruleSource
    ).maxTargets;
    if (typeof n === "number" && n > 0) {
      return n | 0;
    }
    if (typeof n === "string" && n.trim() !== "") {
      const parsed = parseInt(n, 10);
      if (parsed > 0) return parsed;
    }
    if (
      /** @type {{ shopifyPlus?: unknown }} */ (ruleSource).shopifyPlus === true
    ) {
      return MAX_TARGETS_PLUS_FALLBACK;
    }
  }
  return MAX_TARGETS_STANDARD;
}

/** @param {unknown} raw @param {number} max */
function lockedIds(raw, max) {
  const s = String(raw ?? "");
  if (!s) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  let start = 0;
  for (let i = 0; i <= s.length; i++) {
    if (i < s.length && s.charCodeAt(i) !== 44) continue; // comma
    const part = s.slice(start, i).trim();
    start = i + 1;
    if (!part) continue;
    const n = productNum(part) || part;
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** @param {unknown[]} tiers @param {number} qty */
function bestPercentTier(tiers, qty) {
  let bestP = 0;
  let bestM = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (!t || typeof t !== "object") continue;
    // Compact metafield: { m, p }  |  API payload: { minQty, percent }
    const pRaw = t.p != null ? t.p : t.percent;
    if (pRaw == null) continue;
    const mRaw = t.m != null ? t.m : t.minQty;
    const min = (mRaw | 0) > 0 ? mRaw | 0 : 1;
    if (qty >= min && min >= bestM) {
      const p = +pRaw;
      if (p > 0 && p <= 100) {
        bestM = min;
        bestP = p;
      }
    }
  }
  return bestP;
}

/** Normalize compact or API rule → tiers array. @param {unknown} compact */
function ruleTiers(compact) {
  if (!compact || typeof compact !== "object") return null;
  if (Array.isArray(compact.t)) return compact.t;
  if (Array.isArray(compact.tiers)) return compact.tiers;
  return null;
}

/**
 * Product metafield may be a cleared stub `{ t: [] }` — treat as missing so
 * API fetch rules can fill the gap.
 * @param {unknown} mf
 */
function usableRule(mf) {
  if (!mf || typeof mf !== "object") return null;
  const tiers = ruleTiers(mf);
  if (!tiers || !tiers.length) return null;
  return mf;
}

/**
 * Product metafields (`volume_discount.tiers`) are the primary rule source.
 * Optional fetch JSON body fills gaps when remote lookup mode is enabled.
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const lines = input?.cart?.lines;
  if (!lines || !lines.length) return { operations: [] };

  const classes = input.discount?.discountClasses;
  if (!classes || !classes.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const maxTargets = resolveMaxTargets(input.discount?.ruleSource?.jsonValue);
  const locked = lockedIds(input.cart?.vdLockedProductsAttr?.value, maxTargets);
  /** @type {Map<string, number>} */
  const lockedRank = new Map();
  for (let i = 0; i < locked.length; i++) lockedRank.set(locked[i], i);

  // Rank unique products: locked first, then cart order. Cap by plan max.
  /** @type {{ pid: string, lineIndexes: number[], sortKey: number }[]} */
  const products = [];
  /** @type {Map<string, number>} */
  const productIndex = new Map();

  for (let i = 0; i < lines.length; i++) {
    const pid = productNum(lines[i]?.merchandise?.product?.id);
    if (!pid) continue;
    const existing = productIndex.get(pid);
    if (existing != null) {
      products[existing].lineIndexes.push(i);
      continue;
    }
    productIndex.set(pid, products.length);
    products.push({
      pid,
      lineIndexes: [i],
      sortKey: lockedRank.has(pid)
        ? /** @type {number} */ (lockedRank.get(pid))
        : maxTargets + i,
    });
  }

  products.sort((a, b) => a.sortKey - b.sortKey || a.lineIndexes[0] - b.lineIndexes[0]);
  if (products.length > maxTargets) products.length = maxTargets;

  // Optional API rules (only when product metafield missing).
  /** @type {Record<string, unknown> | null} */
  let apiRules = null;
  const body = input.fetchResult?.body;
  if (typeof body === "string" && body.length > 2) {
    try {
      const parsed = JSON.parse(body);
      if (parsed?.rules && typeof parsed.rules === "object") {
        apiRules = parsed.rules;
      }
    } catch {
      /* ignore */
    }
  }

  /** @type {import("../generated/api").ProductDiscountCandidate[]} */
  const candidates = [];
  let targetCount = 0;

  for (let p = 0; p < products.length; p++) {
    if (targetCount >= maxTargets) break;
    const { pid, lineIndexes } = products[p];

    const firstLine = lines[lineIndexes[0]];
    const mf = firstLine?.merchandise?.product?.tiersMetafield?.jsonValue;
    const compact =
      usableRule(mf) ||
      (apiRules ? usableRule(apiRules[pid]) : null);
    if (!compact || typeof compact !== "object") continue;

    // everyone only on this hot path (logged-in filters are rare; skip to save fuel)
    const ct = compact.ct || compact.customerType;
    if (ct && ct !== "e" && ct !== "everyone") continue;

    const tiers = ruleTiers(compact);
    if (!tiers || !tiers.length) continue;

    const qtyMode = compact.q || compact.quantityCondition || "v";
    const perVariant = qtyMode === "v" || qtyMode === "per-variant";

    if (perVariant) {
      for (let li = 0; li < lineIndexes.length; li++) {
        if (targetCount >= maxTargets) break;
        const line = lines[lineIndexes[li]];
        const pct = bestPercentTier(tiers, line.quantity | 0);
        if (!pct) continue;
        const q = line.quantity | 0;
        candidates.push({
          message: q > 0 ? pct + "% OFF (qty " + q + ")" : pct + "% OFF",
          value: { percentage: { value: String(pct) } },
          targets: [{ cartLine: { id: line.id } }],
        });
        targetCount++;
      }
      continue;
    }

    // per-product / total-all / collection: sum qty across this product's lines
    let qty = 0;
    for (let li = 0; li < lineIndexes.length; li++) {
      qty += lines[lineIndexes[li]].quantity | 0;
    }
    const pct = bestPercentTier(tiers, qty);
    if (!pct) continue;
    const msg = qty > 0 ? pct + "% OFF (qty " + qty + ")" : pct + "% OFF";
    const value = { percentage: { value: String(pct) } };

    /** @type {{ cartLine: { id: string } }[]} */
    const targets = [];
    for (let li = 0; li < lineIndexes.length; li++) {
      if (targetCount >= maxTargets) break;
      targets.push({ cartLine: { id: lines[lineIndexes[li]].id } });
      targetCount++;
    }
    if (targets.length) {
      candidates.push({ message: msg, value, targets });
    }
  }

  if (!candidates.length) return { operations: [] };

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
