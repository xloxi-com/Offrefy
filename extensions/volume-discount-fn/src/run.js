import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * ONE automatic Product Discount → unlimited campaigns/products.
 *
 * Rules are read at runtime from discount metafields (namespace `volume_discount`,
 * keys `campaigns` … `campaigns_4`). The existing admin app sync writes active
 * campaigns + tiers there when merchants save offers.
 *
 * Simplified mental model (per-product tiers):
 *   { rules: [{ campaignId, productId, tiers: [{ minQuantity, discountType, value }] }] }
 * The live metafield uses a richer campaign shape (scope, quantityCondition, customerType)
 * but applies the same idea: match cart lines → pick highest qualifying tier → discount line.
 *
 * Metafield limits: ~64–128 KB per value. Sync shards across 5 keys. Beyond that,
 * use Function network access to fetch rules from your app database/API.
 */

/** Normalize tiers from metafield (supports minQty or minQuantity + discountType/value). */
function normalizeCampaignTiers(rawTiers) {
  if (!Array.isArray(rawTiers)) return [];
  const out = [];
  for (const t of rawTiers) {
    if (!t || typeof t !== "object") continue;
    if (t.minQty != null || t.percent != null || t.fixedAmount != null) {
      out.push(t);
      continue;
    }
    const minQty = Math.max(
      1,
      Math.floor(Number(t.minQuantity ?? t.minQty ?? 1)),
    );
    const type = String(t.discountType ?? "percentage").toLowerCase();
    const value = Number(t.value);
    if (!Number.isFinite(value)) continue;
    if (type === "percentage" || type === "percent") {
      out.push({ minQty, percent: value });
    } else if (type === "fixed" || type === "fixed_amount") {
      out.push({
        minQty,
        fixedAmount: value,
        appliesToEachItem: Boolean(t.appliesToEachItem),
      });
    }
  }
  return out;
}

function isActiveCampaign(campaign) {
  const status = String(campaign.status ?? "active").toLowerCase();
  return status === "active";
}

const CAMPAIGN_FRAG_KEYS = [
  "campaignsFrag0",
  "campaignsFrag1",
  "campaignsFrag2",
  "campaignsFrag3",
  "campaignsFrag4",
];

/** @param {unknown} code */
function normalizeCurrencyCode(code) {
  if (typeof code !== "string" || code.length < 3) return "USD";
  return code.slice(0, 3).toUpperCase();
}

/** @param {unknown} cart @param {unknown} line */
function lineCurrency(cart, line) {
  const lineCode = line?.cost?.subtotalAmount?.currencyCode;
  if (typeof lineCode === "string" && lineCode.length >= 3) {
    return normalizeCurrencyCode(lineCode);
  }
  const cartCode = cart?.cost?.subtotalAmount?.currencyCode;
  if (typeof cartCode === "string" && cartCode.length >= 3) {
    return normalizeCurrencyCode(cartCode);
  }
  return "USD";
}

/** @param {number} n @param {string} currencyCode */
function formatMoney(n, currencyCode) {
  if (!Number.isFinite(n)) return "";
  const code = normalizeCurrencyCode(currencyCode);
  const rounded = Math.round(n * 100) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rounded);
  } catch {
    const sym =
      { USD: "$", EUR: "€", GBP: "£", INR: "₹", CAD: "$", AUD: "$" }[code] ??
      `${code} `;
    const sign = rounded < 0 ? "-" : "";
    return `${sign}${sym}${Math.abs(rounded).toFixed(2)}`;
  }
}

/** @param {unknown} p */
function formatPercentValue(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** @param {unknown} line @param {unknown} tier */
function lineDiscountMoney(line, tier) {
  const sub = parseFloat(String(line?.cost?.subtotalAmount?.amount ?? "0"));
  const qty = Math.max(0, Number(line?.quantity ?? 0));
  if (!Number.isFinite(sub) || sub <= 0 || qty <= 0) return null;

  if (tier?.percent != null) {
    const pct = Number(tier.percent);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return (sub * pct) / 100;
  }
  if (tier?.fixedPricePerUnit != null) {
    const fp = Number(tier.fixedPricePerUnit);
    if (!Number.isFinite(fp) || fp < 0) return null;
    return Math.max(0, sub - fp * qty);
  }
  const fx = Number(tier?.fixedAmount);
  if (!Number.isFinite(fx) || fx <= 0) return null;
  return tier.appliesToEachItem ? Math.min(fx * qty, sub) : Math.min(fx, sub);
}

/** @param {string} template @param {unknown} cart @param {unknown} line @param {unknown} tier */
function interpolateDisplayTemplate(template, cart, line, tier) {
  if (!template || !/\{\{\s*(discount|amount)\s*\}\}/i.test(template)) {
    return template;
  }
  const currency = lineCurrency(cart, line);
  const dollars = lineDiscountMoney(line, tier);

  let discountRepl = "";
  if (tier?.percent != null) {
    const p = Number(tier.percent);
    if (Number.isFinite(p) && p > 0) discountRepl = `${formatPercentValue(p)}%`;
  } else if (dollars != null && dollars > 0) {
    const sub = parseFloat(String(line?.cost?.subtotalAmount?.amount ?? "0"));
    if (Number.isFinite(sub) && sub > 0) {
      const effPct = (dollars / sub) * 100;
      if (effPct > 0) discountRepl = `${formatPercentValue(effPct)}%`;
    }
  }

  const amountRepl =
    dollars != null && Number.isFinite(dollars) ? formatMoney(dollars, currency) : "";

  return template
    .replace(/\{\{\s*discount\s*\}\}/gi, discountRepl)
    .replace(/\{\{\s*amount\s*\}\}/gi, amountRepl);
}

/** Fast badge text for percentage tiers (avoids money/regex work in hot loops). */
function percentDiscountMessage(label, pct, suffix) {
  const p = formatPercentValue(pct);
  const core =
    label.indexOf("{{") >= 0
      ? label.replace(/\{\{\s*discount\s*\}\}/gi, `${p}%`)
      : label;
  return suffix ? `${core}${suffix}` : core;
}

/** @param {string} label @param {unknown} cart @param {unknown} line @param {unknown} tier @param {string} [suffix] */
function discountMessage(label, cart, line, tier, suffix) {
  if (tier?.percent != null && label.indexOf("{{") >= 0) {
    return percentDiscountMessage(label, Number(tier.percent), suffix);
  }
  const core = interpolateDisplayTemplate(label, cart, line, tier);
  return suffix ? `${core}${suffix}` : core;
}

/** Built-in cart-badge copy when metafield translations are missing (mirrors app presets). */
const CART_BADGE_LANG_FALLBACKS = {
  en: {
    cartDiscount: "{{ discount }} OFF",
    cartDiscountQty: "(qty {{ qty }})",
  },
  es: {
    cartDiscount: "{{ discount }} DE DESCUENTO",
    cartDiscountQty: "(cant. {{ qty }})",
  },
  fr: {
    cartDiscount: "{{ discount }} DE RÉDUCTION",
    cartDiscountQty: "(qté {{ qty }})",
  },
  de: {
    cartDiscount: "{{ discount }} RABATT",
    cartDiscountQty: "(Menge {{ qty }})",
  },
  ta: {
    cartDiscount: "{{ discount }} தள்ளுபடி",
    cartDiscountQty: "(அளவு {{ qty }})",
  },
  nl: {
    cartDiscount: "{{ discount }} KORTING",
    cartDiscountQty: "(aantal {{ qty }})",
  },
};

/** @param {unknown} locale */
function localeBase(locale) {
  return String(locale || "en")
    .toLowerCase()
    .split(/[-_]/)[0];
}

/** @param {unknown} input */
function buyerLocale(input) {
  const fromCart = input?.cart?.vdLocaleAttr?.value;
  if (fromCart != null) {
    const trimmed = String(fromCart).trim();
    if (trimmed) return localeBase(trimmed);
  }
  const code = input?.localization?.language?.isoCode;
  if (!code) return "en";
  return localeBase(code);
}

/** @param {unknown} value */
function normalizeCartTranslationsMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

/** @param {unknown} head0 @param {unknown} [extra] */
function loadStorefrontTranslations(head0, extra) {
  const fromHead = normalizeCartTranslationsMap(head0?.storefrontTranslations);
  const fromExtra = normalizeCartTranslationsMap(extra);
  return { ...fromExtra, ...fromHead };
}

/** @param {string} base @param {Record<string, unknown>} translations */
function cartTranslationEntry(base, translations) {
  const entry = translations[base] || translations[localeBase(base)];
  if (entry && typeof entry === "object") return entry;
  return CART_BADGE_LANG_FALLBACKS[base] ?? null;
}

/** @param {string} template */
function isEnglishCartDiscountTemplate(template) {
  const t = String(template ?? "").trim().toLowerCase();
  return (
    t === "{{ discount }} off" ||
    t === "{{discount}} off" ||
    t.includes(" off") ||
    t.includes("(qty ")
  );
}

/** @param {string} template */
function isEnglishQtyTemplate(template) {
  const t = String(template ?? "").trim().toLowerCase();
  return t === "(qty {{ qty }})" || t.includes("(qty ");
}

/** @param {string} locale @param {Record<string, unknown>} translations @param {string} fallback */
function resolveCartDiscountTemplate(locale, translations, fallback) {
  const base = localeBase(locale);
  const entry = cartTranslationEntry(base, translations);
  if (entry) {
    const raw =
      entry.cartDiscount != null
        ? entry.cartDiscount
        : entry.transCartDiscount;
    const text = String(raw ?? "").trim();
    if (text && (base === "en" || !isEnglishCartDiscountTemplate(text))) {
      return text;
    }
  }
  const fb = String(fallback ?? "").trim();
  if (base !== "en" && isEnglishCartDiscountTemplate(fb)) {
    const preset = CART_BADGE_LANG_FALLBACKS[base];
    if (preset?.cartDiscount) return preset.cartDiscount;
  }
  return fb || "{{ discount }} OFF";
}

/** @param {string} locale @param {Record<string, unknown>} translations @param {number} qty */
function buildQtySuffix(locale, translations, qty) {
  const n = Math.max(0, Math.floor(Number(qty)));
  if (n <= 0) return "";
  const base = localeBase(locale);
  const entry = cartTranslationEntry(base, translations);
  let template = "(qty {{ qty }})";
  if (entry) {
    const raw =
      entry.cartDiscountQty != null
        ? entry.cartDiscountQty
        : entry.transCartDiscountQty;
    const text = String(raw ?? "").trim();
    if (text && (base === "en" || !isEnglishQtyTemplate(text))) {
      template = text;
    }
  } else if (base !== "en") {
    const preset = CART_BADGE_LANG_FALLBACKS[base];
    if (preset?.cartDiscountQty) template = preset.cartDiscountQty;
  }
  const body = template.replace(/\{\{\s*qty\s*\}\}/gi, String(n));
  return ` ${body}`;
}

/**
 * Merge sharded discount metafields into a campaign array.
 * @param {unknown} discount
 * @returns {unknown[]}
 */
function loadCampaignsFromDiscount(discount) {
  const frags = CAMPAIGN_FRAG_KEYS.map((k) => discount?.[k]?.jsonValue);
  const head = frags[0];
  if (!head || typeof head !== "object") return [];
  if (head.version === 0) return [];

  if (head.version === 2) {
    return Array.isArray(head.campaigns) ? head.campaigns : [];
  }

  if (head.version === 3) {
    const total = Number(head.fragmentTotal);
    if (!Number.isFinite(total) || total < 1) return [];
    if (total === 1) {
      return Array.isArray(head.campaigns) ? head.campaigns : [];
    }
    const merged = [];
    for (let i = 0; i < total; i++) {
      const f = frags[i];
      if (!f || typeof f !== "object") return [];
      if (f.version !== 3) return [];
      if (Number(f.fragmentTotal) !== total) return [];
      if (Number(f.fragmentIndex) !== i) return [];
      const part = f.campaigns;
      if (!Array.isArray(part)) return [];
      merged.push(...part);
    }
    return merged;
  }

  return Array.isArray(head.campaigns) ? head.campaigns : [];
}

/**
 * Merge v4 product-index shards + optional API fetch body + product-level metafields into a rules map.
 * @param {unknown} discount
 * @param {unknown} fetchResult
 * @param {unknown[]} lines
 * @returns {{ rules: Record<string, unknown>, fetchTranslations: Record<string, unknown> }}
 */
function loadProductRulesMap(discount, fetchResult, lines) {
  /** @type {Record<string, unknown>} */
  const rules = {};
  /** @type {Record<string, unknown>} */
  let fetchTranslations = {};

  const frags = CAMPAIGN_FRAG_KEYS.map((k) => discount?.[k]?.jsonValue);
  const head = frags[0];
  if (head && typeof head === "object") {
    fetchTranslations = {
      ...fetchTranslations,
      ...normalizeCartTranslationsMap(head.storefrontTranslations),
    };
    const ver = Number(head.version);
    if (ver === 4) {
      const total = Number(head.fragmentTotal) || 1;
      if (total === 1) {
        const r = head.rules;
        if (r && typeof r === "object" && !Array.isArray(r)) {
          Object.assign(rules, r);
        }
      } else {
        for (let i = 0; i < total; i++) {
          const f = frags[i];
          if (!f || typeof f !== "object") continue;
          const part = f.rules;
          if (part && typeof part === "object" && !Array.isArray(part)) {
            Object.assign(rules, part);
          }
        }
      }
    }
  }

  const fetchBody = fetchResult?.body;
  if (typeof fetchBody === "string" && fetchBody.length > 0) {
    try {
      const parsed = JSON.parse(fetchBody);
      const apiRules = parsed?.rules;
      if (apiRules && typeof apiRules === "object" && !Array.isArray(apiRules)) {
        for (const [pid, rule] of Object.entries(apiRules)) {
          const compact = apiRuleToCompact(rule);
          if (compact) rules[pid] = compact;
        }
      }
      fetchTranslations = normalizeCartTranslationsMap(
        parsed?.storefrontTranslations,
      );
    } catch {
      void 0;
    }
  }

  for (const line of lines ?? []) {
    const product = line.merchandise?.product;
    const pid = numericTailFromGid(product?.id);
    const tiersMetafield = product?.tiersMetafield?.jsonValue;
    if (pid && tiersMetafield && typeof tiersMetafield === "object") {
      rules[pid] = tiersMetafield;
    }
  }

  return { rules, fetchTranslations };
}

/** @param {unknown} rule */
function apiRuleToCompact(rule) {
  if (!rule || typeof rule !== "object") return null;
  const r = rule;
  const tiers = Array.isArray(r.tiers) ? r.tiers : [];
  /** @type {unknown[]} */
  const t = [];
  for (const tier of tiers) {
    if (!tier || typeof tier !== "object") continue;
    const minQty = Math.max(1, Math.floor(Number(tier.minQty ?? tier.minQuantity ?? 1)));
    if (tier.percent != null) {
      t.push({ m: minQty, p: Number(tier.percent) });
    } else if (tier.fixedPricePerUnit != null) {
      t.push({ m: minQty, fp: Number(tier.fixedPricePerUnit) });
    } else if (tier.fixedAmount != null) {
      t.push({
        m: minQty,
        f: Number(tier.fixedAmount),
        ...(tier.appliesToEachItem ? { e: 1 } : {}),
      });
    }
  }
  const qMap = { "per-variant": "v", "per-product": "p", "total-all": "a", "per-collection": "c" };
  const ctMap = { everyone: "e", "logged-in": "l", "logged-in-tag-any": "t" };
  return {
    c: String(r.campaignId ?? ""),
    m: String(r.label ?? "Volume discount").slice(0, 80),
    q: qMap[String(r.quantityCondition ?? "per-variant")] ?? "v",
    ct: ctMap[String(r.customerType ?? "everyone")] ?? "e",
    ...(Array.isArray(r.customerTags) && r.customerTags.length
      ? { tg: r.customerTags.map(String) }
      : {}),
    t,
  };
}

const Q_REVERSE = { v: "per-variant", p: "per-product", a: "total-all", c: "per-collection" };

/** @param {unknown} compact */
function expandCompactTiers(compact) {
  if (!compact || typeof compact !== "object" || !Array.isArray(compact.t)) return [];
  const out = [];
  for (const tier of compact.t) {
    if (!tier || typeof tier !== "object") continue;
    const minQty = Math.max(1, Math.floor(Number(tier.m ?? 1)));
    if (tier.p != null) {
      out.push({ minQty, percent: Number(tier.p) });
    } else if (tier.fp != null) {
      out.push({ minQty, fixedPricePerUnit: Number(tier.fp) });
    } else if (tier.f != null) {
      out.push({
        minQty,
        fixedAmount: Number(tier.f),
        appliesToEachItem: tier.e === 1,
      });
    }
  }
  return out;
}

/** @param {unknown} compact @param {boolean} authenticated @param {Map<string, boolean>} customerTagMap */
function compactCustomerMatches(compact, authenticated, customerTagMap) {
  const ct = String(compact.ct ?? "e");
  const tags = Array.isArray(compact.tg) ? compact.tg.map(String) : [];
  if (ct === "e") return true;
  if (ct === "l") return authenticated;
  if (ct === "t") {
    if (!authenticated || !tags.length) return false;
    return tags.some((tag) => customerTagMap.get(tag) === true);
  }
  return false;
}

/** @param {unknown} gid */
function numericTailFromGid(gid) {
  if (typeof gid !== "string") return "";
  const m = gid.match(/\/(\d+)\s*$/);
  return m ? m[1] : "";
}

/** Shopify caps automatic product discount candidates (~25 cart lines). */
export const MAX_DISCOUNT_CART_LINES = 25;
export const MAX_LOCKED_CART_PRODUCTS = 25;

/** @param {unknown} raw */
export function parseLockedProductIds(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const part of s.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const n = numericTailFromGid(trimmed) || trimmed;
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.slice(0, MAX_LOCKED_CART_PRODUCTS);
}

/**
 * Pick up to 25 product IDs that may receive discounts (locked cart products first).
 * Locked slots come from the `vd_locked_products` cart attribute (storefront sync).
 * @param {unknown[]} lines
 * @param {string[]} lockedProductIds
 */
export function selectEligibleProductIds(lines, lockedProductIds) {
  /** @type {Map<string, number>} */
  const lockedRank = new Map();
  lockedProductIds.forEach((id, i) => lockedRank.set(id, i));

  /** @type {{ prodNum: string, sortKey: number, lineIndex: number }[]} */
  const ranked = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const prodNum = numericTailFromGid(lines[i]?.merchandise?.product?.id);
    if (!prodNum || seen.has(prodNum)) continue;
    seen.add(prodNum);
    ranked.push({
      prodNum,
      sortKey: lockedRank.has(prodNum)
        ? lockedRank.get(prodNum)
        : MAX_LOCKED_CART_PRODUCTS + i,
      lineIndex: i,
    });
  }

  ranked.sort((a, b) => a.sortKey - b.sortKey || a.lineIndex - b.lineIndex);

  /** @type {Set<string>} */
  const eligible = new Set();
  for (const row of ranked) {
    if (eligible.size >= MAX_LOCKED_CART_PRODUCTS) break;
    eligible.add(row.prodNum);
  }
  return eligible;
}

/**
 * Cap discounted cart lines while keeping locked products prioritized.
 * Shopify rejects the entire automatic discount when >25 targets are returned.
 * @param {unknown[]} lines
 * @param {Map<string, { message: string, value: object, score: number }>} bestByLine
 * @param {string[]} lockedProductIds
 */
export function capDiscountCandidates(lines, bestByLine, lockedProductIds) {
  /** @type {Map<string, number>} */
  const lockedRank = new Map();
  lockedProductIds.forEach((id, i) => lockedRank.set(id, i));

  /** @type {{ lineId: string, cand: { message: string, value: object, score: number }, sortKey: number, lineIndex: number, prodNum: string }[]} */
  const ranked = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cand = bestByLine.get(line.id);
    if (!cand) continue;
    const prodNum = numericTailFromGid(line?.merchandise?.product?.id);
    if (!prodNum) continue;

    ranked.push({
      lineId: line.id,
      cand,
      prodNum,
      sortKey: lockedRank.has(prodNum)
        ? lockedRank.get(prodNum)
        : MAX_LOCKED_CART_PRODUCTS + i,
      lineIndex: i,
    });
  }

  ranked.sort((a, b) => a.sortKey - b.sortKey || a.lineIndex - b.lineIndex);

  /** @type {Map<string, { message: string, value: object, score: number }>} */
  const cappedBestByLine = new Map();
  /** @type {Set<string>} */
  const discountedProducts = new Set();

  for (const row of ranked) {
    if (cappedBestByLine.size >= MAX_DISCOUNT_CART_LINES) break;
    const isNewProduct = !discountedProducts.has(row.prodNum);
    if (isNewProduct && discountedProducts.size >= MAX_LOCKED_CART_PRODUCTS) {
      continue;
    }
    cappedBestByLine.set(row.lineId, row.cand);
    discountedProducts.add(row.prodNum);
  }
  return cappedBestByLine;
}

/**
 * Hard cap grouped candidates — Shopify drops all discounts if limits are exceeded.
 * @param {import("../generated/api").ProductDiscountCandidate[]} candidates
 */
function capGroupedCandidates(candidates) {
  /** @type {typeof candidates} */
  const out = [];
  let targetCount = 0;

  for (const cand of candidates) {
    if (out.length >= MAX_DISCOUNT_CART_LINES) break;
    const targets = [];
    for (const t of cand.targets ?? []) {
      if (targetCount >= MAX_DISCOUNT_CART_LINES) break;
      targets.push(t);
      targetCount++;
    }
    if (targets.length) {
      out.push({ message: cand.message, value: cand.value, targets });
    }
  }

  return out;
}

/**
 * Build O(1) lookup set from product/variant GIDs (includes numeric tails).
 * @param {unknown} rawIds
 */
function buildProductIdMatchSet(rawIds) {
  /** @type {Set<string>} */
  const set = new Set();
  if (rawIds == null) return set;
  const ids = Array.isArray(rawIds) ? rawIds : [];
  for (const raw of ids) {
    const s = String(raw).trim();
    if (!s) continue;
    set.add(s);
    const pn = numericTailFromGid(s);
    if (pn) {
      set.add(pn);
      set.add(`gid://shopify/Product/${pn}`);
      set.add(`gid://shopify/ProductVariant/${pn}`);
    }
  }
  return set;
}

/**
 * Match line product/variant to pre-built id set (GID, numeric tail, or substring).
 * @param {string} productId
 * @param {string} variantId
 * @param {Set<string>} set
 */
function lineMatchesProductIdSet(productId, variantId, set) {
  if (!set.size) return false;
  if (set.has(productId) || set.has(variantId)) return true;
  const pn = numericTailFromGid(productId);
  const vn = numericTailFromGid(variantId);
  if (pn && set.has(pn)) return true;
  if (vn && set.has(vn)) return true;
  if (pn && set.has(`gid://shopify/Product/${pn}`)) return true;
  if (vn && set.has(`gid://shopify/ProductVariant/${vn}`)) return true;
  return false;
}

/**
 * Match line product/variant to campaign productIds (GID, numeric tail, or substring).
 * @param {string} productId
 * @param {string} variantId
 * @param {unknown} rawIds
 */
function lineMatchesProductIds(productId, variantId, rawIds) {
  return lineMatchesProductIdSet(
    productId,
    variantId,
    buildProductIdMatchSet(rawIds),
  );
}

/** Pick highest compact tier ({m,p}) for qty without sorting/copying. */
function pickCompactTier(tiers, qty) {
  let best = null;
  let bestM = 0;
  for (const t of tiers) {
    if (!t || typeof t !== "object") continue;
    const m = Math.max(1, Math.floor(Number(t.m ?? 1)));
    if (qty >= m && m >= bestM) {
      best = t;
      bestM = m;
    }
  }
  return best;
}

/** @param {number} p */
function formatPct(p) {
  const n = Math.round(Number(p) * 100) / 100;
  return Number.isInteger(n) ? String(n) : String(n);
}

/** Lean badge for percentage tiers (no regex / Intl). */
function pctBadge(pct, qty) {
  const q = Math.max(0, Math.floor(Number(qty)));
  return q > 0 ? `${formatPct(pct)}% OFF (qty ${q})` : `${formatPct(pct)}% OFF`;
}

/**
 * Fast path: per-product metafield rules only, eligible lines only, ≤25 targets.
 * @param {unknown[]} eligibleLines
 * @param {Record<string, unknown>} productRules
 * @param {boolean} authenticated
 * @param {Map<string, boolean>} customerTagMap
 * @param {string[]} lockedProductIds
 */
function applyProductRulesLean(
  eligibleLines,
  productRules,
  authenticated,
  customerTagMap,
  lockedProductIds = [],
) {
  /** @type {Map<string, unknown[]>} */
  const byProduct = new Map();
  /** @type {Map<string, number>} */
  const firstLineIndex = new Map();
  for (let i = 0; i < eligibleLines.length; i++) {
    const line = eligibleLines[i];
    const m = line?.merchandise;
    if (!m?.product?.id) continue;
    const pid = numericTailFromGid(m.product.id);
    if (!pid) continue;
    const list = byProduct.get(pid);
    if (list) list.push(line);
    else {
      byProduct.set(pid, [line]);
      firstLineIndex.set(pid, i);
    }
  }

  /** @type {Map<string, number>} */
  const lockedRank = new Map();
  lockedProductIds.forEach((id, i) => lockedRank.set(id, i));

  const productOrder = [...byProduct.keys()].sort((a, b) => {
    const ra = lockedRank.has(a)
      ? lockedRank.get(a)
      : MAX_LOCKED_CART_PRODUCTS + (firstLineIndex.get(a) ?? 0);
    const rb = lockedRank.has(b)
      ? lockedRank.get(b)
      : MAX_LOCKED_CART_PRODUCTS + (firstLineIndex.get(b) ?? 0);
    return ra - rb || (firstLineIndex.get(a) ?? 0) - (firstLineIndex.get(b) ?? 0);
  });

  /** @type {Map<string, { message: string, value: object }>} */
  const bestByLine = new Map();
  let targetBudget = MAX_DISCOUNT_CART_LINES;

  for (const pid of productOrder) {
    const productLines = byProduct.get(pid);
    if (!productLines) continue;
    if (targetBudget <= 0) break;
    const compact = productRules[pid] ?? productRules["*"];
    if (!compact || typeof compact !== "object") continue;
    if (!compactCustomerMatches(compact, authenticated, customerTagMap)) continue;

    const tiers = compact.t;
    if (!Array.isArray(tiers) || !tiers.length) continue;

    const qtyMode = String(compact.q ?? "v");

    if (qtyMode === "v") {
      for (const line of productLines) {
        if (targetBudget <= 0) break;
        const tier = pickCompactTier(tiers, line.quantity);
        if (!tier || tier.p == null) continue;
        const pct = Number(tier.p);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
        bestByLine.set(line.id, {
          message: pctBadge(pct, line.quantity),
          value: { percentage: { value: pct } },
        });
        targetBudget--;
      }
      continue;
    }

    let qty = 0;
    if (qtyMode === "p") {
      for (const line of productLines) qty += line.quantity || 0;
    } else {
      for (const line of productLines) qty += line.quantity || 0;
    }

    const tier = pickCompactTier(tiers, qty);
    if (!tier || tier.p == null) continue;
    const pct = Number(tier.p);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
    const msg = pctBadge(pct, qty);
    const value = { percentage: { value: pct } };

    for (const line of productLines) {
      if (targetBudget <= 0) break;
      bestByLine.set(line.id, { message: msg, value });
      targetBudget--;
    }
  }

  return bestByLine;
}

/**
 * Load rules from line metafields only (skips shard merge + fetch JSON when possible).
 * @param {unknown[]} eligibleLines
 * @param {unknown} discount
 * @param {unknown} fetchResult
 */
function loadProductRulesLean(eligibleLines, discount, fetchResult) {
  /** @type {Record<string, unknown>} */
  const rules = {};
  for (const line of eligibleLines) {
    const pid = numericTailFromGid(line?.merchandise?.product?.id);
    const mf = line?.merchandise?.product?.tiersMetafield?.jsonValue;
    if (pid && mf && typeof mf === "object") rules[pid] = mf;
  }
  if (Object.keys(rules).length > 0) {
    return { rules, fromMetafields: true };
  }
  const full = loadProductRulesMap(discount, fetchResult, eligibleLines);
  return { rules: full.rules, fromMetafields: false, fetchTranslations: full.fetchTranslations };
}

/** @param {unknown[]} tiers */
function sortTiersByMinQty(tiers) {
  return [...tiers].sort(
    (a, b) => Number(a?.minQty ?? 0) - Number(b?.minQty ?? 0),
  );
}

/** Highest tier where quantity >= minQty. Expects tiers pre-sorted by minQty ascending. */
function pickTierFromSorted(sorted, qty) {
  let best = null;
  for (const t of sorted) {
    const minQty = Math.max(1, Math.floor(Number(t?.minQty ?? 1)));
    if (qty >= minQty) best = t;
    else break;
  }
  return best;
}

/** @param {unknown[]} tiers @param {number} qty */
function pickTier(tiers, qty) {
  return pickTierFromSorted(sortTiersByMinQty(tiers), qty);
}

/** @param {unknown} line @param {unknown} tier */
function tierScore(line, tier) {
  if (!tier) return -1;
  const sub = parseFloat(String(line.cost.subtotalAmount.amount));
  const qty = line.quantity;
  if (tier.percent != null) return Number(tier.percent);
  if (tier.fixedPricePerUnit != null) {
    const fp = Number(tier.fixedPricePerUnit);
    if (!Number.isFinite(fp) || fp < 0 || qty <= 0 || sub <= 0) return 0;
    const unit = sub / qty;
    if (unit <= fp) return 0;
    return ((sub - fp * qty) / sub) * 100;
  }
  const fx = Number(tier.fixedAmount);
  if (Number.isFinite(fx) && fx > 0 && sub > 0) {
    const disc = tier.appliesToEachItem
      ? Math.min(fx * qty, sub)
      : Math.min(fx, sub);
    return (disc / sub) * 100;
  }
  return 0;
}

/** @param {unknown} line @param {unknown} tier */
function tierToDiscountValue(line, tier) {
  if (!tier) return null;
  if (tier.percent != null) {
    const p = Number(tier.percent);
    if (!Number.isFinite(p) || p <= 0 || p > 100) return null;
    return { percentage: { value: p } };
  }
  if (tier.fixedPricePerUnit != null) {
    const fp = Number(tier.fixedPricePerUnit);
    const qty = line.quantity;
    const sub = parseFloat(String(line.cost.subtotalAmount.amount));
    if (!Number.isFinite(fp) || fp < 0 || qty <= 0 || sub <= 0) return null;
    const discountAmt = Math.max(0, sub - fp * qty);
    if (discountAmt <= 0) return null;
    return {
      fixedAmount: { amount: String(discountAmt), appliesToEachItem: false },
    };
  }
  const fx = Number(tier.fixedAmount);
  if (!Number.isFinite(fx) || fx <= 0) return null;
  return {
    fixedAmount: {
      amount: String(fx),
      appliesToEachItem: Boolean(tier.appliesToEachItem),
    },
  };
}

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const lines = input?.cart?.lines ?? [];
  if (!lines.length) return { operations: [] };

  const classes = input.discount?.discountClasses ?? [];
  const hasProductClass = classes.includes(DiscountClass.Product);
  if (!hasProductClass) return { operations: [] };

  const lockedProductIds = parseLockedProductIds(
    input?.cart?.vdLockedProductsAttr?.value,
  );
  const eligibleProductIds = selectEligibleProductIds(lines, lockedProductIds);

  /** @type {typeof lines} */
  const eligibleLines = [];
  for (const line of lines) {
    const pid = numericTailFromGid(line?.merchandise?.product?.id);
    if (pid && eligibleProductIds.has(pid)) eligibleLines.push(line);
  }
  if (!eligibleLines.length) return { operations: [] };

  const leanRules = loadProductRulesLean(
    eligibleLines,
    input.discount,
    input.fetchResult,
  );
  const productRules = leanRules.rules;
  const hasProductRules = Object.keys(productRules).length > 0;

  if (hasProductRules && leanRules.fromMetafields) {
    const authenticated = Boolean(input.cart.buyerIdentity?.isAuthenticated);
    /** @type {Map<string, boolean>} */
    const customerTagMap = new Map();
    const tagRows = input.cart.buyerIdentity?.customer?.hasTags ?? [];
    if (Array.isArray(tagRows)) {
      for (const row of tagRows) {
        if (row && typeof row.tag === "string") {
          customerTagMap.set(row.tag, Boolean(row.hasTag));
        }
      }
    }

    const bestByLine = applyProductRulesLean(
      eligibleLines,
      productRules,
      authenticated,
      customerTagMap,
      lockedProductIds,
    );

    if (!bestByLine.size) return { operations: [] };

    const cappedBestByLine = capDiscountCandidates(
      eligibleLines,
      bestByLine,
      lockedProductIds,
    );

    /** @type {import("../generated/api").ProductDiscountCandidate[]} */
    const candidates = [];
    for (const [lineId, cand] of cappedBestByLine) {
      candidates.push({
        message: cand.message,
        value: cand.value,
        targets: [{ cartLine: { id: lineId } }],
      });
    }

    return {
      operations: [
        {
          productDiscountsAdd: {
            candidates: capGroupedCandidates(candidates),
            selectionStrategy: ProductDiscountSelectionStrategy.All,
          },
        },
      ],
    };
  }

  const { rules: fullRules, fetchTranslations } = hasProductRules
    ? { rules: productRules, fetchTranslations: leanRules.fetchTranslations ?? {} }
    : loadProductRulesMap(input.discount, input.fetchResult, eligibleLines);
  const hasRules = Object.keys(fullRules).length > 0;

  const campaigns = hasRules
    ? []
    : loadCampaignsFromDiscount(input.discount);

  if (!hasRules && !campaigns.length) {
    return { operations: [] };
  }

  const head0 =
    input.discount?.campaignsFrag0?.jsonValue &&
    typeof input.discount.campaignsFrag0.jsonValue === "object"
      ? input.discount.campaignsFrag0.jsonValue
      : null;
  const cfgVersion = Number(head0?.version) || 1;
  const locale = buyerLocale(input);
  const storefrontTranslations = loadStorefrontTranslations(
    head0,
    fetchTranslations,
  );

  const authenticated = Boolean(input.cart.buyerIdentity?.isAuthenticated);
  /** @type {Map<string, boolean>} */
  const customerTagMap = new Map();
  const tagRows = input.cart.buyerIdentity?.customer?.hasTags ?? [];
  if (Array.isArray(tagRows)) {
    for (const row of tagRows) {
      if (row && typeof row.tag === "string") {
        customerTagMap.set(row.tag, Boolean(row.hasTag));
      }
    }
  }

  const cartTotalQty = eligibleLines.reduce((s, l) => s + (l.quantity || 0), 0);

  /** @type {Map<string, { message: string, value: object, score: number }>} */
  const bestByLine = new Map();

  if (hasRules) {
    /** @type {Map<string, { line: typeof lines[0], productKey: string }[]>} */
    const linesByProduct = new Map();
    for (const line of eligibleLines) {
      const m = line.merchandise;
      if (
        !m ||
        typeof m.id !== "string" ||
        !m.product ||
        typeof m.product.id !== "string"
      ) {
        continue;
      }
      const productKey = numericTailFromGid(m.product.id);
      if (!productKey) continue;
      const list = linesByProduct.get(productKey);
      if (list) list.push({ line, productKey });
      else linesByProduct.set(productKey, [{ line, productKey }]);
    }

    for (const [productKey, entries] of linesByProduct) {
      const compact =
        fullRules[productKey] ??
        fullRules["*"];
      if (!compact || typeof compact !== "object") continue;
      if (!compactCustomerMatches(compact, authenticated, customerTagMap)) {
        continue;
      }

      const sortedTiers = sortTiersByMinQty(expandCompactTiers(compact));
      if (!sortedTiers.length) continue;

      const label = resolveCartDiscountTemplate(
        locale,
        storefrontTranslations,
        String(compact.m ?? "Volume discount"),
      );
      const qtyMode = Q_REVERSE[String(compact.q ?? "v")] ?? "per-variant";

      if (qtyMode === "total-all") {
        const tier = pickTierFromSorted(sortedTiers, cartTotalQty);
        if (!tier) continue;
        for (const { line } of entries) {
          const value = tierToDiscountValue(line, tier);
          if (!value) continue;
          const sc = tierScore(line, tier);
          const msg = discountMessage(
            label,
            input.cart,
            line,
            tier,
            buildQtySuffix(locale, storefrontTranslations, cartTotalQty),
          );
          const prev = bestByLine.get(line.id);
          if (!prev || sc > prev.score) {
            bestByLine.set(line.id, { message: msg, value, score: sc });
          }
        }
      } else if (qtyMode === "per-product") {
        const totalQty = entries.reduce((s, e) => s + e.line.quantity, 0);
        const tier = pickTierFromSorted(sortedTiers, totalQty);
        if (!tier) continue;
        for (const { line } of entries) {
          const value = tierToDiscountValue(line, tier);
          if (!value) continue;
          const sc = tierScore(line, tier);
          const msg = discountMessage(
            label,
            input.cart,
            line,
            tier,
            buildQtySuffix(locale, storefrontTranslations, totalQty),
          );
          const prev = bestByLine.get(line.id);
          if (!prev || sc > prev.score) {
            bestByLine.set(line.id, { message: msg, value, score: sc });
          }
        }
      } else {
        for (const { line } of entries) {
          const tier = pickTierFromSorted(sortedTiers, line.quantity);
          if (!tier) continue;
          const value = tierToDiscountValue(line, tier);
          if (!value) continue;
          const sc = tierScore(line, tier);
          const msg = discountMessage(label, input.cart, line, tier, "");
          const prev = bestByLine.get(line.id);
          if (!prev || sc > prev.score) {
            bestByLine.set(line.id, { message: msg, value, score: sc });
          }
        }
      }
    }
  }

  /** @param {unknown} campaign */
  const customerMatches = (campaign) => {
    const t = String(campaign.customerType ?? "everyone");
    const tags = Array.isArray(campaign.customerTags)
      ? campaign.customerTags.map(String)
      : [];
    if (t === "everyone") return true;
    if (t === "logged-in") return authenticated;
    if (t === "logged-in-tag-any") {
      if (!authenticated || !tags.length) return false;
      return tags.some((tag) => customerTagMap.get(tag) === true);
    }
    return false;
  };

  /** @type {Map<string, { message: string, value: object, score: number }>} */
  const bestByLineCampaign = bestByLine;

  if (!hasRules) {
    /** Pre-parse cart lines once for campaign matching (avoids re-walking per campaign). */
    /** @type {{ line: typeof lines[0], variantId: string, productId: string }[]} */
    const parsedLines = [];
    for (const line of eligibleLines) {
      const m = line.merchandise;
      if (
        !m ||
        typeof m.id !== "string" ||
        !m.product ||
        typeof m.product.id !== "string"
      ) {
        continue;
      }
      parsedLines.push({
        line,
        variantId: m.id,
        productId: m.product.id,
      });
    }

    for (const campaign of campaigns) {
    if (!campaign || typeof campaign !== "object") continue;
    if (!isActiveCampaign(campaign)) continue;
    if (!customerMatches(campaign)) continue;

    const scope = String(campaign.productScope ?? "all");
    let qtyMode = String(campaign.quantityCondition ?? "per-variant");
    if (cfgVersion < 2 && qtyMode === "per-product") qtyMode = "per-variant";

    const sortedTiers = sortTiersByMinQty(normalizeCampaignTiers(campaign.tiers));
    if (!sortedTiers.length) continue;

    const displayRaw =
      campaign.displayName != null ? String(campaign.displayName).trim() : "";
    const label = resolveCartDiscountTemplate(
      locale,
      storefrontTranslations,
      displayRaw || String(campaign.campaignName ?? "Volume discount"),
    );

    const scopeAll = scope === "all";
    const productIdSet =
      scopeAll || scope === "collections"
        ? null
        : buildProductIdMatchSet(campaign.productIds);

    /** @type {{ line: typeof lines[0], variantId: string, productId: string }[]} */
    const inScope = [];
    for (const entry of parsedLines) {
      const prodNum = numericTailFromGid(entry.productId);
      if (prodNum && !eligibleProductIds.has(prodNum)) continue;
      let ok = scopeAll;
      if (
        !ok &&
        (scope === "variants" ||
          scope === "specific-products" ||
          scope === "group-products" ||
          scope === "collections")
      ) {
        ok = lineMatchesProductIdSet(
          entry.productId,
          entry.variantId,
          productIdSet ?? new Set(),
        );
      }
      if (ok) inScope.push(entry);
    }
    if (!inScope.length) continue;

    /** @param {{ line: typeof lines[0] }[]} entries @param {unknown} tier @param {string} suffix */
    const applyTier = (entries, tier, suffix) => {
      if (!tier) return;
      for (const { line } of entries) {
        const value = tierToDiscountValue(line, tier);
        if (!value) continue;
        const sc = tierScore(line, tier);
        const msg = discountMessage(label, input.cart, line, tier, suffix);
        const prev = bestByLineCampaign.get(line.id);
        if (!prev || sc > prev.score) {
          bestByLineCampaign.set(line.id, { message: msg, value, score: sc });
        }
      }
    };

    if (qtyMode === "total-all") {
      applyTier(
        inScope,
        pickTierFromSorted(sortedTiers, cartTotalQty),
        buildQtySuffix(locale, storefrontTranslations, cartTotalQty),
      );
    } else if (qtyMode === "per-collection") {
      const groups = Array.isArray(campaign.collectionGroups)
        ? campaign.collectionGroups
        : [];
      if (!groups.length && scope === "collections") {
        const totalQty = inScope.reduce((s, x) => s + x.line.quantity, 0);
        applyTier(
          inScope,
          pickTierFromSorted(sortedTiers, totalQty),
          buildQtySuffix(locale, storefrontTranslations, totalQty),
        );
      } else {
        for (const g of groups) {
          if (!g || typeof g !== "object") continue;
          const gSet = buildProductIdMatchSet(g.productIds);
          /** @type {typeof inScope} */
          const grp = [];
          for (const x of inScope) {
            if (lineMatchesProductIdSet(x.productId, x.variantId, gSet)) {
              grp.push(x);
            }
          }
          if (!grp.length) continue;
          const totalQty = grp.reduce((s, x) => s + x.line.quantity, 0);
          applyTier(
            grp,
            pickTierFromSorted(sortedTiers, totalQty),
            buildQtySuffix(locale, storefrontTranslations, totalQty),
          );
        }
      }
    } else if (qtyMode === "per-product") {
      const byProduct = new Map();
      for (const x of inScope) {
        const list = byProduct.get(x.productId);
        if (list) list.push(x);
        else byProduct.set(x.productId, [x]);
      }
      for (const [, grp] of byProduct) {
        const totalQty = grp.reduce((s, x) => s + x.line.quantity, 0);
        applyTier(
          grp,
          pickTierFromSorted(sortedTiers, totalQty),
          buildQtySuffix(locale, storefrontTranslations, totalQty),
        );
      }
    } else {
      for (const entry of inScope) {
        applyTier([entry], pickTierFromSorted(sortedTiers, entry.line.quantity), "");
      }
    }
  }
  }

  const cappedBestByLine = capDiscountCandidates(
    eligibleLines,
    bestByLine,
    lockedProductIds,
  );

  const grouped = new Map();
  for (const [lineId, cand] of cappedBestByLine) {
    const { message, value } = cand;
    const key = JSON.stringify({ message, value });
    let group = grouped.get(key);
    if (!group) {
      group = { message, value, targets: [] };
      grouped.set(key, group);
    }
    group.targets.push({ cartLine: { id: lineId } });
  }

  const candidates = capGroupedCandidates(Array.from(grouped.values()));
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
