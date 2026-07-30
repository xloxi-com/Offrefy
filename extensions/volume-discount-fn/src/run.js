import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * Prefer partial discounts over Function RuntimeError (fuel ~11M).
 * Cap high enough for ~50 distinct cart products with light messaging.
 */
const MAX_TARGETS = 50;
const MAX_LINES_SCAN = 55;
const MAX_TIERS_SCAN = 8;

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

/** Literal replace — no RegExp (regex burns Function fuel). */
function replaceLit(s, find, repl) {
  const i = s.indexOf(find);
  if (i < 0) return s;
  return s.slice(0, i) + repl + s.slice(i + find.length);
}

/**
 * Fuel-light money label (USD `$` fast path; else CODE + amount).
 * @param {number} amount
 * @param {string} [currencyCode]
 */
function formatMoneyLabel(amount, currencyCode) {
  const n = Math.round(amount * 100) / 100;
  const num = n.toFixed(2);
  if (!currencyCode || currencyCode === "USD") return "$" + num;
  if (currencyCode === "EUR") return "€" + num;
  if (currencyCode === "GBP") return "£" + num;
  return currencyCode + " " + num;
}

/**
 * Fill `{{ discount }}` / `{{ amount }}` once (fuel-safe).
 * @param {string} raw
 * @param {string} discountRepl
 * @param {string} amountRepl
 */
function fillTemplate(raw, discountRepl, amountRepl) {
  let s = raw;
  if (discountRepl && s.indexOf("{{") >= 0) {
    if (s.indexOf("{{ discount }}") >= 0) {
      s = replaceLit(s, "{{ discount }}", discountRepl);
    } else if (s.indexOf("{{discount}}") >= 0) {
      s = replaceLit(s, "{{discount}}", discountRepl);
    }
  }
  if (amountRepl && s.indexOf("{{") >= 0) {
    if (s.indexOf("{{ amount }}") >= 0) {
      s = replaceLit(s, "{{ amount }}", amountRepl);
    } else if (s.indexOf("{{amount}}") >= 0) {
      s = replaceLit(s, "{{amount}}", amountRepl);
    }
  }
  return s.length > 40 ? s.slice(0, 40) : s;
}

/** @param {string} raw */
function hasAmountToken(raw) {
  return raw.indexOf("{{ amount }}") >= 0 || raw.indexOf("{{amount}}") >= 0;
}

/** Cached default % badges — shared across all lines (huge merge win). */
const pctMsgCache = Object.create(null);
/** @param {number} p */
function defaultPctMessage(p) {
  const hit = pctMsgCache[p];
  if (hit) return hit;
  const msg = p + "% OFF";
  pctMsgCache[p] = msg;
  return msg;
}

/**
 * Fuel-first labels: prefer short numeric badges over full template fills.
 * @param {string} displayName
 * @param {{ kind: string, p?: number, fp?: number, f?: number, each?: boolean }} tier
 * @param {number} [sub]
 * @param {number} [lineQty]
 * @param {string} [currencyCode]
 */
function formatMessage(displayName, tier, sub, lineQty, currencyCode) {
  const raw =
    typeof displayName === "string" && displayName.length
      ? displayName
      : "";

  if (tier.kind === "p") {
    if (!raw) return defaultPctMessage(tier.p);
    if (raw.indexOf("{{") < 0) return raw.length > 40 ? raw.slice(0, 40) : raw;
    let money = "";
    const subAmt = sub || 0;
    if (hasAmountToken(raw) && subAmt > 0) {
      money = formatMoneyLabel((subAmt * tier.p) / 100, currencyCode);
    }
    return fillTemplate(raw, tier.p + "%", money);
  }

  if (!raw) {
    if (tier.kind === "fp" || tier.kind === "f") {
      const qty = lineQty | 0;
      const subAmt = sub || 0;
      if (tier.kind === "fp") {
        if (!(subAmt > 0) || qty <= 0) return "Volume discount";
        const discountAmt = subAmt - tier.fp * qty;
        if (!(discountAmt > 0)) return "Volume discount";
        return formatMoneyLabel(discountAmt, currencyCode);
      }
      const total = tier.each && qty > 0 ? tier.f * qty : tier.f;
      return formatMoneyLabel(total, currencyCode);
    }
    return defaultPctMessage(tier.p);
  }

  const qty = lineQty | 0;
  const subAmt = sub || 0;

  if (tier.kind === "fp") {
    if (!(subAmt > 0) || qty <= 0) return "Volume discount";
    const discountAmt = subAmt - tier.fp * qty;
    if (!(discountAmt > 0)) return "Volume discount";
    const money = formatMoneyLabel(discountAmt, currencyCode);
    if (raw.indexOf("{{") < 0) return raw;
    const pct =
      String(Math.round((discountAmt / subAmt) * 10000) / 100) + "%";
    return fillTemplate(raw, pct, money);
  }

  if (tier.kind === "f") {
    const total = tier.each && qty > 0 ? tier.f * qty : tier.f;
    const money = formatMoneyLabel(total, currencyCode);
    if (raw.indexOf("{{") < 0) return raw;
    let pct = money;
    if (subAmt > 0 && total > 0) {
      pct =
        String(Math.round((Math.min(total, subAmt) / subAmt) * 10000) / 100) +
        "%";
    }
    return fillTemplate(raw, pct, money);
  }

  return "Volume discount";
}

/**
 * Fixed-amount / fixed-price candidate (needs line cost).
 * Percent without {{ amount }} uses the cheap bucket path instead.
 * @param {unknown} line
 * @param {{ kind: string, p?: number, fp?: number, f?: number, each?: boolean }} tier
 * @param {string} displayName
 */
function fixedTierCandidate(line, tier, displayName) {
  if (!tier || (tier.kind !== "fp" && tier.kind !== "f")) return null;

  const lineQty = line.quantity | 0;
  const sub = parseFloat(String(line.cost?.subtotalAmount?.amount ?? "0")) || 0;
  const currencyCode = String(line.cost?.subtotalAmount?.currencyCode ?? "");
  const message = formatMessage(
    displayName,
    tier,
    sub,
    lineQty,
    currencyCode,
  );

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

/**
 * Percent + {{ amount }} needs per-line message (line cost).
 * @param {unknown} line
 * @param {{ kind: string, p?: number }} tier
 * @param {string} displayName
 */
function percentAmountCandidate(line, tier, displayName) {
  const lineQty = line.quantity | 0;
  const sub = parseFloat(String(line.cost?.subtotalAmount?.amount ?? "0")) || 0;
  const currencyCode = String(line.cost?.subtotalAmount?.currencyCode ?? "");
  return {
    message: formatMessage(displayName, tier, sub, lineQty, currencyCode),
    value: { percentage: { value: String(tier.p) } },
  };
}

/** @param {unknown} mf */
function compactFromMetafield(mf) {
  return mf && typeof mf === "object" && Array.isArray(mf.t) && mf.t.length
    ? mf
    : null;
}

/**
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
 * @param {Record<string, 1>|null} customerTagSet
 */
function customerAllows(compact, isAuthenticated, customerTagSet) {
  const ct = compact && compact.ct;
  if (!ct || ct === "e") return true;
  if (ct === "l") return isAuthenticated;
  if (ct === "t") {
    if (!isAuthenticated || !customerTagSet) return false;
    const need = Array.isArray(compact.tg) ? compact.tg : [];
    if (!need.length) return false;
    for (let i = 0; i < need.length; i++) {
      if (customerTagSet[String(need[i])]) return true;
    }
    return false;
  }
  return false;
}

/**
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
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  try {
    return runMetafieldDiscounts(input);
  } catch {
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
  /** @type {Record<string, 1>|null} */
  let customerTagSet = null;
  const tagRows = buyer?.customer?.hasTags;
  if (Array.isArray(tagRows) && tagRows.length) {
    customerTagSet = Object.create(null);
    for (let i = 0; i < tagRows.length; i++) {
      const row = tagRows[i];
      if (row && row.hasTag === true && row.tag) {
        customerTagSet[String(row.tag)] = 1;
      }
    }
  }

  const ruleSource = input.discount?.ruleSource?.jsonValue;
  const wildcard = wildcardFromRuleSource(ruleSource);

  const lineLimit =
    lines.length < MAX_LINES_SCAN ? lines.length : MAX_LINES_SCAN;

  /**
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

  /** @type {{ pid: string, entries: typeof resolved }[]} */
  const products = [];
  /** @type {Record<string, number>} */
  const productIndex = Object.create(null);
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    const existing = productIndex[r.pid];
    if (existing != null) {
      products[existing].entries.push(r);
      continue;
    }
    if (products.length >= MAX_TARGETS) break;
    productIndex[r.pid] = products.length;
    products.push({ pid: r.pid, entries: [r] });
  }

  let needProductQty = false;
  let needCampaignQty = false;
  let needCollectionQty = false;
  for (let p = 0; p < products.length; p++) {
    const q = products[p].entries[0].compact.q || "v";
    if (q === "p" && products[p].entries.length > 1) needProductQty = true;
    else if (q === "a" || q === "g") needCampaignQty = true;
    else if (q === "c") {
      needCampaignQty = true;
      needCollectionQty = true;
    }
  }

  /** @type {Record<string, number>} */
  const qtyByCampaign = Object.create(null);
  /** @type {Record<string, number>} */
  const qtyByCampaignCollection = Object.create(null);
  /** @type {Record<string, number>} */
  const qtyByProduct = Object.create(null);

  if (needProductQty || needCampaignQty || needCollectionQty) {
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      if (needCampaignQty) {
        const cid = String(r.compact.c || "");
        if (cid) {
          qtyByCampaign[cid] = (qtyByCampaign[cid] || 0) + r.qty;
          if (needCollectionQty) {
            const cxs = collectionIdsOf(r.compact);
            for (let j = 0; j < cxs.length; j++) {
              const key = cid + "|" + cxs[j];
              qtyByCampaignCollection[key] =
                (qtyByCampaignCollection[key] || 0) + r.qty;
            }
          }
        }
      }
      if (needProductQty) {
        qtyByProduct[r.pid] = (qtyByProduct[r.pid] || 0) + r.qty;
      }
    }
  }

  /**
   * @param {object} compact
   * @param {string} pid
   * @param {number} lineQty
   * @param {number} entryCount
   */
  function qtyForCompact(compact, pid, lineQty, entryCount) {
    const q = compact.q || "v";
    if (q === "v") return lineQty;
    if (q === "p") {
      if (entryCount <= 1) return lineQty;
      return qtyByProduct[pid] || lineQty;
    }
    if (q === "a") return cartQtyAll;
    if (q === "g") {
      const cid = String(compact.c || "");
      return cid ? qtyByCampaign[cid] || lineQty : lineQty;
    }
    if (q === "c") {
      const cid = String(compact.c || "");
      const cxs = collectionIdsOf(compact);
      if (!cid || !cxs.length) {
        return qtyByCampaign[cid] || lineQty;
      }
      let best = 0;
      for (let i = 0; i < cxs.length; i++) {
        const n = qtyByCampaignCollection[cid + "|" + cxs[i]] || 0;
        if (n > best) best = n;
      }
      return best || lineQty;
    }
    return qtyByProduct[pid] || lineQty;
  }

  /** @type {import("../generated/api").ProductDiscountCandidate[]} */
  const candidates = [];
  /**
   * Merge identical %-off into one candidate (huge fuel win on large carts).
   * Key = percent only when message is the shared default; else percent|msg.
   * @type {Record<string, import("../generated/api").ProductDiscountCandidate>}
   */
  const percentBuckets = Object.create(null);
  let targetCount = 0;

  /**
   * @param {number} p
   * @param {string} msg
   * @param {boolean} useDefaultMsg
   * @param {string} lineId
   */
  function pushPercentTarget(p, msg, useDefaultMsg, lineId) {
    if (targetCount >= MAX_TARGETS) return;
    const key = useDefaultMsg ? String(p) : String(p) + "|" + msg;
    let bucket = percentBuckets[key];
    if (!bucket) {
      bucket = {
        message: msg,
        value: { percentage: { value: String(p) } },
        targets: [],
      };
      percentBuckets[key] = bucket;
      candidates.push(bucket);
    }
    bucket.targets.push({ cartLine: { id: lineId } });
    targetCount++;
  }

  for (let p = 0; p < products.length; p++) {
    if (targetCount >= MAX_TARGETS) break;
    const { pid, entries } = products[p];
    const compact = entries[0].compact;
    const tiers = compact.t;
    const displayName = typeof compact.m === "string" ? compact.m : "";
    const useDefaultMsg = !displayName;
    const percentNeedsPerLineMessage =
      !useDefaultMsg && hasAmountToken(displayName);
    const qMode = compact.q || "v";

    if (qMode === "v") {
      for (let li = 0; li < entries.length; li++) {
        if (targetCount >= MAX_TARGETS) break;
        const entry = entries[li];
        const line = lines[entry.lineIndex];
        const tier = bestTier(tiers, entry.qty);
        if (!tier) continue;
        if (tier.kind === "p") {
          if (percentNeedsPerLineMessage) {
            const cand = percentAmountCandidate(line, tier, displayName);
            candidates.push({
              message: cand.message,
              value: cand.value,
              targets: [{ cartLine: { id: line.id } }],
            });
            targetCount++;
            continue;
          }
          const msg = useDefaultMsg
            ? defaultPctMessage(tier.p)
            : formatMessage(displayName, tier);
          pushPercentTarget(tier.p, msg, useDefaultMsg, line.id);
          continue;
        }
        const cand = fixedTierCandidate(line, tier, displayName);
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

    const qty = qtyForCompact(compact, pid, entries[0].qty, entries.length);
    const tier = bestTier(tiers, qty);
    if (!tier) continue;

    if (tier.kind === "p") {
      if (percentNeedsPerLineMessage) {
        for (let li = 0; li < entries.length; li++) {
          if (targetCount >= MAX_TARGETS) break;
          const line = lines[entries[li].lineIndex];
          const cand = percentAmountCandidate(line, tier, displayName);
          candidates.push({
            message: cand.message,
            value: cand.value,
            targets: [{ cartLine: { id: line.id } }],
          });
          targetCount++;
        }
        continue;
      }
      const msg = useDefaultMsg
        ? defaultPctMessage(tier.p)
        : formatMessage(displayName, tier);
      for (let li = 0; li < entries.length; li++) {
        if (targetCount >= MAX_TARGETS) break;
        pushPercentTarget(
          tier.p,
          msg,
          useDefaultMsg,
          lines[entries[li].lineIndex].id,
        );
      }
      continue;
    }

    for (let li = 0; li < entries.length; li++) {
      if (targetCount >= MAX_TARGETS) break;
      const line = lines[entries[li].lineIndex];
      const cand = fixedTierCandidate(line, tier, displayName);
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
