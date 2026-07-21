import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * Shopify hard-caps automatic product-discount targets at 25. Exceeding that
 * rejects the whole discount; exceeding the ~11M instruction budget fails the
 * function (InstructionCountLimitExceededError). Keep this file small and the
 * hot path allocation-free so 25 cart lines stay under budget.
 */
const MAX_TARGETS = 25;

/** @param {unknown} gid */
function productNum(gid) {
  if (typeof gid !== "string") return "";
  const i = gid.lastIndexOf("/");
  return i >= 0 ? gid.slice(i + 1) : "";
}

/** @param {unknown} raw */
function lockedIds(raw) {
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
    if (out.length >= MAX_TARGETS) break;
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

  const locked = lockedIds(input.cart?.vdLockedProductsAttr?.value);
  /** @type {Map<string, number>} */
  const lockedRank = new Map();
  for (let i = 0; i < locked.length; i++) lockedRank.set(locked[i], i);

  // Rank unique products: locked first, then cart order. Cap at 25 products.
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
        : MAX_TARGETS + i,
    });
  }

  products.sort((a, b) => a.sortKey - b.sortKey || a.lineIndexes[0] - b.lineIndexes[0]);
  if (products.length > MAX_TARGETS) products.length = MAX_TARGETS;

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
    if (targetCount >= MAX_TARGETS) break;
    const { pid, lineIndexes } = products[p];

    const firstLine = lines[lineIndexes[0]];
    const mf = firstLine?.merchandise?.product?.tiersMetafield?.jsonValue;
    const compact =
      (mf && typeof mf === "object" ? mf : null) ||
      (apiRules ? apiRules[pid] : null);
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
        if (targetCount >= MAX_TARGETS) break;
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
      if (targetCount >= MAX_TARGETS) break;
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
