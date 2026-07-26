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
function idNum(gid) {
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
    // multiples (u:1): only complete packs of minQty
    if (t.u === 1 && min > 0 && qty % min !== 0) continue;

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
 * "All products" campaigns sync as DiscountRule productId "*" and do not write
 * per-product tiers metafields. Compact rule lives on rule_source.w instead.
 * @param {unknown} ruleSource
 */
function wildcardFromRuleSource(ruleSource) {
  if (!ruleSource || typeof ruleSource !== "object") return null;
  return compactFromMetafield(
    /** @type {{ w?: unknown }} */ (ruleSource).w,
  );
}

/**
 * @param {unknown} compact
 * @param {boolean} isAuthenticated
 * @param {Set<string>} customerTagSet
 */
function customerAllows(compact, isAuthenticated, customerTagSet) {
  const ct = compact && compact.ct;
  if (!ct || ct === "e") return true;
  if (ct === "l") return isAuthenticated;
  if (ct === "t") {
    if (!isAuthenticated) return false;
    const need = Array.isArray(compact.tg) ? compact.tg : [];
    if (!need.length) return false;
    for (let i = 0; i < need.length; i++) {
      if (customerTagSet.has(String(need[i]))) return true;
    }
    return false;
  }
  return false;
}

/**
 * Variant allowlist: when `vs` is present, only those variant ids qualify.
 * @param {unknown} compact
 * @param {string} variantId
 */
function variantAllows(compact, variantId) {
  const vs = compact && compact.vs;
  if (!Array.isArray(vs) || !vs.length) return true;
  if (!variantId) return false;
  for (let i = 0; i < vs.length; i++) {
    if (String(vs[i]) === variantId) return true;
  }
  return false;
}

/**
 * @param {unknown} compact
 * @returns {string[]}
 */
function collectionIdsOf(compact) {
  const cx = compact && compact.cx;
  if (!Array.isArray(cx) || !cx.length) return [];
  const out = [];
  for (let i = 0; i < cx.length; i++) {
    const s = String(cx[i] || "");
    if (s) out.push(s);
  }
  return out;
}

/**
 * Metafield-only run. No fetch/network (Basic plan cannot use Discount
 * Function network access — it errors and clears all Remise discounts).
 * Plus / Basic both use product tiers MF; wildcard rule_source.w covers
 * productScope "all" offers (needed on Plus DEV stores where network is blocked).
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

  const buyer = input?.cart?.buyerIdentity;
  const isAuthenticated = buyer?.isAuthenticated === true;
  /** @type {Set<string>} */
  const customerTagSet = new Set();
  const tagRows = buyer?.customer?.hasTags;
  if (Array.isArray(tagRows)) {
    for (let i = 0; i < tagRows.length; i++) {
      const row = tagRows[i];
      if (row && row.hasTag === true && row.tag) {
        customerTagSet.add(String(row.tag));
      }
    }
  }

  const wildcard = wildcardFromRuleSource(
    input.discount?.ruleSource?.jsonValue,
  );

  const lineLimit = lines.length < MAX_LINES_SCAN ? lines.length : MAX_LINES_SCAN;

  /**
   * Pre-scan lines once: resolve compact rule + ids for qty aggregation.
   * @type {{ lineIndex: number, pid: string, vid: string, qty: number, compact: object }[]}
   */
  const resolved = [];
  let cartQtyAll = 0;

  for (let i = 0; i < lineLimit; i++) {
    const line = lines[i];
    const merch = line?.merchandise;
    if (!merch || merch.__typename === "CustomProduct") continue;
    const pid = idNum(merch?.product?.id);
    const vid = idNum(merch?.id);
    if (!pid) continue;
    const qty = line.quantity | 0;
    cartQtyAll += qty;

    const compact =
      compactFromMetafield(merch?.product?.tiersMetafield?.jsonValue) ||
      wildcard;
    if (!compact) continue;
    if (!customerAllows(compact, isAuthenticated, customerTagSet)) continue;
    if (!variantAllows(compact, vid)) continue;

    resolved.push({ lineIndex: i, pid, vid, qty, compact });
  }

  if (!resolved.length) return { operations: [] };

  /** @type {Map<string, number>} campaignId → sum qty (group / shared) */
  const qtyByCampaign = new Map();
  /** @type {Map<string, number>} "campaignId|collectionId" → sum qty */
  const qtyByCampaignCollection = new Map();
  /** @type {Map<string, number>} productId → sum qty */
  const qtyByProduct = new Map();

  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    const cid = String(r.compact.c || "");
    if (cid) {
      qtyByCampaign.set(cid, (qtyByCampaign.get(cid) || 0) + r.qty);
      const cxs = collectionIdsOf(r.compact);
      for (let j = 0; j < cxs.length; j++) {
        const key = cid + "|" + cxs[j];
        qtyByCampaignCollection.set(
          key,
          (qtyByCampaignCollection.get(key) || 0) + r.qty,
        );
      }
    }
    qtyByProduct.set(r.pid, (qtyByProduct.get(r.pid) || 0) + r.qty);
  }

  /**
   * @param {object} compact
   * @param {string} pid
   * @param {number} lineQty
   */
  function qtyForCompact(compact, pid, lineQty) {
    const q = compact.q || "v";
    if (q === "v") return lineQty;
    if (q === "p") return qtyByProduct.get(pid) || lineQty;
    if (q === "a") return cartQtyAll;
    if (q === "g") {
      const cid = String(compact.c || "");
      return cid ? qtyByCampaign.get(cid) || lineQty : lineQty;
    }
    if (q === "c") {
      const cid = String(compact.c || "");
      const cxs = collectionIdsOf(compact);
      if (!cid || !cxs.length) {
        // Fallback: same-campaign group when collection ids missing
        return qtyByCampaign.get(cid) || lineQty;
      }
      let best = 0;
      for (let i = 0; i < cxs.length; i++) {
        const n = qtyByCampaignCollection.get(cid + "|" + cxs[i]) || 0;
        if (n > best) best = n;
      }
      return best || lineQty;
    }
    return qtyByProduct.get(pid) || lineQty;
  }

  /** Group resolved lines by product for target emission (same as before). */
  /** @type {{ pid: string, entries: typeof resolved }[]} */
  const products = [];
  /** @type {Map<string, number>} */
  const productIndex = new Map();

  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    const existing = productIndex.get(r.pid);
    if (existing != null) {
      products[existing].entries.push(r);
      continue;
    }
    if (products.length >= MAX_TARGETS) break;
    productIndex.set(r.pid, products.length);
    products.push({ pid: r.pid, entries: [r] });
  }

  /** @type {import("../generated/api").ProductDiscountCandidate[]} */
  const candidates = [];
  let targetCount = 0;

  for (let p = 0; p < products.length; p++) {
    if (targetCount >= MAX_TARGETS) break;
    const { pid, entries } = products[p];
    const compact = entries[0].compact;
    const tiers = compact.t;
    const displayName =
      typeof compact.m === "string" && compact.m.length ? compact.m : "";
    const qMode = compact.q || "v";

    if (qMode === "v") {
      for (let li = 0; li < entries.length; li++) {
        if (targetCount >= MAX_TARGETS) break;
        const entry = entries[li];
        const line = lines[entry.lineIndex];
        const tier = bestTier(tiers, entry.qty);
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

    // Shared qty modes: one tier decision for the product's eligible lines
    const qty = qtyForCompact(compact, pid, entries[0].qty);
    const tier = bestTier(tiers, qty);
    if (!tier) continue;

    if (tier.kind === "p") {
      const cand = tierCandidate(lines[entries[0].lineIndex], tier, displayName);
      if (!cand) continue;
      /** @type {{ cartLine: { id: string } }[]} */
      const targets = [];
      for (let li = 0; li < entries.length; li++) {
        if (targetCount >= MAX_TARGETS) break;
        targets.push({ cartLine: { id: lines[entries[li].lineIndex].id } });
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

    for (let li = 0; li < entries.length; li++) {
      if (targetCount >= MAX_TARGETS) break;
      const line = lines[entries[li].lineIndex];
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
