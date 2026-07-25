import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * Cap targets for instruction budget (~11M). Prefer locked products first.
 * rule_source.maxTargets can raise this (Shopify Plus / plan sync).
 */
const MAX_TARGETS_DEFAULT = 100;

/** @param {unknown} gid */
function productNum(gid) {
  if (typeof gid !== "string") return "";
  const i = gid.lastIndexOf("/");
  return i >= 0 ? gid.slice(i + 1) : "";
}

/** @param {unknown} ruleSource */
function resolveMaxTargets(ruleSource) {
  if (ruleSource && typeof ruleSource === "object") {
    const n = /** @type {{ maxTargets?: unknown }} */ (ruleSource).maxTargets;
    if (typeof n === "number" && n > 0) return n | 0;
    if (typeof n === "string" && n.trim() !== "") {
      const parsed = parseInt(n, 10);
      if (parsed > 0) return parsed;
    }
  }
  return MAX_TARGETS_DEFAULT;
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
    if (i < s.length && s.charCodeAt(i) !== 44) continue;
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

/**
 * Compact metafield tiers only (`m`/`p`/`f`/`fp`/`e`) — keep hot path cheap.
 * @param {unknown[]} tiers
 * @param {number} qty
 */
function bestTier(tiers, qty) {
  let best = null;
  let bestM = 0;
  for (let i = 0; i < tiers.length; i++) {
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

/** Literal replace — no RegExp (regex burns Function fuel). */
function replaceLit(s, find, repl) {
  let out = s;
  let i = out.indexOf(find);
  while (i >= 0) {
    out = out.slice(0, i) + repl + out.slice(i + find.length);
    i = out.indexOf(find, i + repl.length);
  }
  return out;
}

/**
 * Display name → cart/checkout message. Plain text as-is.
 * Optional `{{ discount }}` / `{{ amount }}` (no regex).
 * @param {string} displayName
 * @param {{ kind: string, p?: number, fp?: number, f?: number, each?: boolean }} tier
 * @param {number} sub
 * @param {number} lineQty
 */
function formatMessage(displayName, tier, sub, lineQty) {
  const raw = displayName || "Volume discount";
  if (raw.indexOf("{{") < 0) return raw;

  let discountRepl = "";
  let amountRepl = "";

  if (tier.kind === "p") {
    discountRepl = tier.p + "%";
    if (sub > 0) {
      amountRepl = String(Math.round((sub * tier.p) / 100 * 100) / 100);
    }
  } else if (tier.kind === "fp" && sub > 0 && lineQty > 0) {
    const d = sub - tier.fp * lineQty;
    if (d > 0) {
      amountRepl = String(Math.round(d * 100) / 100);
      discountRepl = String(Math.round((d / sub) * 10000) / 100) + "%";
    }
  } else if (tier.kind === "f") {
    const total = tier.each && lineQty > 0 ? tier.f * lineQty : tier.f;
    amountRepl = String(Math.round(total * 100) / 100);
    if (sub > 0 && total > 0) {
      discountRepl =
        String(Math.round((Math.min(total, sub) / sub) * 10000) / 100) + "%";
    }
  }

  // Fast path for the default admin template
  if (raw === "{{ discount }} OFF") return discountRepl + " OFF";

  let s = replaceLit(raw, "{{ discount }}", discountRepl);
  s = replaceLit(s, "{{discount}}", discountRepl);
  s = replaceLit(s, "{{ amount }}", amountRepl);
  s = replaceLit(s, "{{amount}}", amountRepl);
  return s;
}

/**
 * @param {unknown} line
 * @param {{ kind: string, p?: number, fp?: number, f?: number, each?: boolean }} tier
 * @param {string} displayName
 */
function tierCandidate(line, tier, displayName) {
  if (!tier) return null;
  const lineQty = line.quantity | 0;
  const sub = parseFloat(String(line.cost?.subtotalAmount?.amount ?? "0")) || 0;
  const message = formatMessage(displayName, tier, sub, lineQty);

  if (tier.kind === "p") {
    return {
      message,
      value: { percentage: { value: String(tier.p) } },
    };
  }

  if (tier.kind === "fp") {
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

/** @param {unknown} compact */
function ruleDisplayName(compact) {
  const m = compact && compact.m;
  return typeof m === "string" && m.length ? m : "Volume discount";
}

/**
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

  // Hard fuel ceiling: never attempt more products than we can afford.
  const configured = resolveMaxTargets(input.discount?.ruleSource?.jsonValue);
  const maxTargets = configured > 80 ? 80 : configured;

  const locked = lockedIds(input.cart?.vdLockedProductsAttr?.value, maxTargets);
  /** @type {Map<string, number>} */
  const lockedRank = new Map();
  for (let i = 0; i < locked.length; i++) lockedRank.set(locked[i], i);

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

  products.sort(
    (a, b) => a.sortKey - b.sortKey || a.lineIndexes[0] - b.lineIndexes[0],
  );
  if (products.length > maxTargets) products.length = maxTargets;

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
    let compact =
      mf && typeof mf === "object" && Array.isArray(mf.t) && mf.t.length
        ? mf
        : null;
    if (!compact && apiRules) {
      const alt = apiRules[pid];
      if (
        alt &&
        typeof alt === "object" &&
        Array.isArray(alt.t) &&
        alt.t.length
      ) {
        compact = alt;
      }
    }
    if (!compact) continue;

    const ct = compact.ct;
    if (ct && ct !== "e") continue;

    const tiers = compact.t;
    const displayName = ruleDisplayName(compact);
    const qtyMode = compact.q || "v";
    const perVariant = qtyMode === "v";

    if (perVariant) {
      for (let li = 0; li < lineIndexes.length; li++) {
        if (targetCount >= maxTargets) break;
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
        if (targetCount >= maxTargets) break;
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
      if (targetCount >= maxTargets) break;
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
