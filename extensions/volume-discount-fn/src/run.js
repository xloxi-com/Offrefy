import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * 100% safe practical cap (metafield-only, no network). Prefer partial
 * discounts over Function RuntimeError (fuel ~11M).
 */
const MAX_TARGETS = 80;
const MAX_LINES_SCAN = 320;
const MAX_TIERS_SCAN = 12;

/** @param {unknown} gid */
function productNum(gid) {
  if (typeof gid !== "string") return "";
  const i = gid.lastIndexOf("/");
  return i >= 0 ? gid.slice(i + 1) : "";
}

/**
 * @param {unknown[]} tiers
 * @param {number} qty
 */
function bestTier(tiers, qty) {
  let best = null;
  let bestM = 0;
  const n = tiers.length < MAX_TIERS_SCAN ? tiers.length : MAX_TIERS_SCAN;
  for (let i = 0; i < n; i++) {
    const t = tiers[i];
    if (!t || typeof t !== "object") continue;
    const min = (t.m | 0) > 0 ? t.m | 0 : 1;
    if (qty < min || min < bestM) continue;

    if (t.p != null) {
      const p = +t.p;
      if (p > 0 && p <= 100) {
        bestM = min;
        best = { kind: "p", p: p };
      }
      continue;
    }
    if (t.fp != null) {
      const fp = +t.fp;
      if (fp >= 0) {
        bestM = min;
        best = { kind: "fp", fp: fp };
      }
      continue;
    }
    if (t.f != null) {
      const f = +t.f;
      if (f > 0) {
        bestM = min;
        best = { kind: "f", f: f, each: t.e === 1 };
      }
    }
  }
  return best;
}

/** Cheap badge text — no template / replaceLit (fuel). */
function shortMessage(tier, displayName) {
  if (typeof displayName === "string" && displayName.length && displayName.indexOf("{{") < 0) {
    return displayName.length > 40 ? displayName.slice(0, 40) : displayName;
  }
  if (tier.kind === "p") return tier.p + "% OFF";
  return "Volume discount";
}

/**
 * @param {unknown} line
 * @param {{ kind: string, p?: number, fp?: number, f?: number, each?: boolean }} tier
 * @param {string} displayName
 */
function tierCandidate(line, tier, displayName) {
  if (!tier) return null;
  const message = shortMessage(tier, displayName);

  if (tier.kind === "p") {
    return {
      message,
      value: { percentage: { value: String(tier.p) } },
    };
  }

  if (tier.kind === "fp") {
    const lineQty = line.quantity | 0;
    const sub = parseFloat(String(line.cost?.subtotalAmount?.amount ?? "0")) || 0;
    if (!(sub > 0) || lineQty <= 0) return null;
    const discountAmt = sub - tier.fp * lineQty;
    if (!(discountAmt > 0)) return null;
    return {
      message,
      value: {
        fixedAmount: {
          amount: String(discountAmt),
          appliesToEachItem: false,
        },
      },
    };
  }

  if (tier.kind === "f") {
    return {
      message,
      value: {
        fixedAmount: {
          amount: String(tier.f),
          appliesToEachItem: !!tier.each,
        },
      },
    };
  }

  return null;
}

/** @param {unknown} mf */
function compactFromMetafield(mf) {
  return mf && typeof mf === "object" && Array.isArray(mf.t) && mf.t.length
    ? mf
    : null;
}

/**
 * Metafield-only run. No fetch/network (Basic plan cannot use Discount
 * Function network access — it errors and clears all Remise discounts).
 *
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  try {
    return runMetafieldDiscounts(input);
  } catch {
    // Never throw — empty ops beats Admin Function error + full Remise wipe.
    return { operations: [] };
  }
}

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
function runMetafieldDiscounts(input) {
  const lines = input?.cart?.lines;
  if (!lines || !lines.length) return { operations: [] };

  const classes = input.discount?.discountClasses;
  if (!classes || !classes.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  /** @type {{ pid: string, lineIndexes: number[] }[]} */
  const products = [];
  /** @type {Map<string, number>} */
  const productIndex = new Map();
  const lineLimit = lines.length < MAX_LINES_SCAN ? lines.length : MAX_LINES_SCAN;

  for (let i = 0; i < lineLimit; i++) {
    if (products.length >= MAX_TARGETS) break;
    const pid = productNum(lines[i]?.merchandise?.product?.id);
    if (!pid) continue;
    const existing = productIndex.get(pid);
    if (existing != null) {
      products[existing].lineIndexes.push(i);
      continue;
    }
    productIndex.set(pid, products.length);
    products.push({ pid, lineIndexes: [i] });
  }

  /** @type {import("../generated/api").ProductDiscountCandidate[]} */
  const candidates = [];
  let targetCount = 0;

  for (let p = 0; p < products.length; p++) {
    if (targetCount >= MAX_TARGETS) break;
    const { lineIndexes } = products[p];

    const compact = compactFromMetafield(
      lines[lineIndexes[0]]?.merchandise?.product?.tiersMetafield?.jsonValue,
    );
    if (!compact) continue;

    const ct = compact.ct;
    if (ct && ct !== "e") continue;

    const tiers = compact.t;
    const displayName =
      typeof compact.m === "string" && compact.m.length ? compact.m : "";
    const perVariant = (compact.q || "v") === "v";

    if (perVariant) {
      for (let li = 0; li < lineIndexes.length; li++) {
        if (targetCount >= MAX_TARGETS) break;
        const line = lines[lineIndexes[li]];
        const tier = bestTier(tiers, line.quantity | 0);
        if (!tier) continue;
        const cand = tierCandidate(line, tier, displayName);
        if (!cand) continue;
        candidates.push({
          message: cand.message,
          value: cand.value,
          targets: [{ cartLine: { id: line.id } }],
        });
        targetCount++;
      }
      continue;
    }

    let qty = 0;
    for (let li = 0; li < lineIndexes.length; li++) {
      qty += lines[lineIndexes[li]].quantity | 0;
    }
    const tier = bestTier(tiers, qty);
    if (!tier) continue;

    if (tier.kind === "p") {
      const cand = tierCandidate(lines[lineIndexes[0]], tier, displayName);
      if (!cand) continue;
      /** @type {{ cartLine: { id: string } }[]} */
      const targets = [];
      for (let li = 0; li < lineIndexes.length; li++) {
        if (targetCount >= MAX_TARGETS) break;
        targets.push({ cartLine: { id: lines[lineIndexes[li]].id } });
        targetCount++;
      }
      if (targets.length) {
        candidates.push({
          message: cand.message,
          value: cand.value,
          targets,
        });
      }
      continue;
    }

    for (let li = 0; li < lineIndexes.length; li++) {
      if (targetCount >= MAX_TARGETS) break;
      const line = lines[lineIndexes[li]];
      const cand = tierCandidate(line, tier, displayName);
      if (!cand) continue;
      candidates.push({
        message: cand.message,
        value: cand.value,
        targets: [{ cartLine: { id: line.id } }],
      });
      targetCount++;
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
