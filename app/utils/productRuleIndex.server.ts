/**
 * Compact product → rule index for discount metafield chunks + product tiers MF.
 * Keep keys as Shopify product numeric ids (never variant ids).
 */

import type { FunctionTierConfig } from "./volumeDiscountFunctionConfig.server";
import type { DiscountFunctionCartTranslations } from "./storefrontTranslations";
import {
  VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS,
  VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_MAX_CHARS,
  VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON,
} from "./volumeDiscountCampaignMetafieldChunks.server";

/** Compact tier for metafield / Function (min bytes). */
export type CompactProductRule = {
  c: string;
  m: string;
  q: string;
  ct: string;
  tg?: string[];
  /** Variant allowlist (numeric ids) when productScope is variants. */
  vs?: string[];
  /** Collection numeric ids this product belongs to (for per-collection qty). */
  cx?: string[];
  t: Array<
    | { m: number; p: number; u?: number }
    | { m: number; f: number; e?: number; u?: number }
    | { m: number; fp: number; u?: number }
  >;
};

const Q_MAP: Record<string, string> = {
  "per-variant": "v",
  "per-product": "p",
  "total-all": "a",
  "per-collection": "c",
};

const CT_MAP: Record<string, string> = {
  everyone: "e",
  "logged-in": "l",
  "logged-in-tag-any": "t",
};

function compactTiers(tiers: FunctionTierConfig[]): CompactProductRule["t"] {
  const out: CompactProductRule["t"] = [];
  for (const t of tiers) {
    const u = t.multiples === true ? ({ u: 1 } as const) : {};
    if (t.percent != null) {
      out.push({ m: t.minQty, p: t.percent, ...u });
    } else if (t.fixedPricePerUnit != null) {
      out.push({ m: t.minQty, fp: t.fixedPricePerUnit, ...u });
    } else if (t.fixedAmount != null) {
      out.push({
        m: t.minQty,
        f: t.fixedAmount,
        ...(t.appliesToEachItem ? { e: 1 } : {}),
        ...u,
      });
    }
  }
  return out;
}

/** Qty mode letter for compact metafields. */
export function compactQtyMode(
  productScope: string,
  quantityCondition: string,
): string {
  const scope = String(productScope || "");
  const q = String(quantityCondition || "per-variant");
  // Group products + total-all → sum only group members (same campaign), not whole cart.
  if (scope === "group-products" && (q === "total-all" || q === "a")) {
    return "g";
  }
  return Q_MAP[q] ?? "v";
}

export type ProductRuleIndex = Record<string, CompactProductRule>;

export type ProductRuleCampaignInput = {
  id: string;
  campaignName: string;
  displayName?: string | null;
  productScope: string;
  quantityCondition: string;
  customerType: string;
  customerTags: string[];
  /** Product numeric ids / GIDs (already product-scoped for variants). */
  productIds: string[];
  variantIds?: string[];
  collectionIdsByProduct?: Record<string, string[]>;
  tiers: FunctionTierConfig[];
};

export function buildProductRuleIndex(args: {
  campaigns: ProductRuleCampaignInput[];
}): ProductRuleIndex {
  const index: ProductRuleIndex = {};
  const score = (tiers: FunctionTierConfig[]) => {
    const t = tiers.find((x) => x.minQty <= 1) ?? tiers[0];
    if (!t) return 0;
    if (t.percent != null) return t.percent;
    if (t.fixedAmount != null) return t.fixedAmount;
    if (t.fixedPricePerUnit != null) return t.fixedPricePerUnit;
    return 0;
  };

  for (const campaign of args.campaigns) {
    const label =
      (campaign.displayName && campaign.displayName.trim()) ||
      campaign.campaignName;
    const compact: CompactProductRule = {
      c: campaign.id,
      m: label.slice(0, 80),
      q: compactQtyMode(campaign.productScope, campaign.quantityCondition),
      ct: CT_MAP[campaign.customerType] ?? "e",
      ...(campaign.customerTags.length ? { tg: campaign.customerTags } : {}),
      ...(campaign.variantIds?.length ? { vs: campaign.variantIds } : {}),
      t: compactTiers(campaign.tiers),
    };

    const scope = String(campaign.productScope ?? "all");
    const keys = new Set<string>();
    if (scope === "all") {
      keys.add("*");
    } else {
      for (const raw of campaign.productIds) {
        const s = String(raw).trim();
        const m = s.match(/\/Product\/(\d+)/);
        if (m) {
          keys.add(m[1]!);
          continue;
        }
        // Prefer Product/ over Variant/ — callers should pass product ids for variants scope.
        const any = s.match(/\/(\d+)\s*$/);
        keys.add(any ? any[1]! : /^\d+$/.test(s) ? s : s);
      }
    }

    for (const pid of keys) {
      const withCx: CompactProductRule = {
        ...compact,
        ...(campaign.collectionIdsByProduct?.[pid]?.length
          ? { cx: campaign.collectionIdsByProduct[pid] }
          : {}),
      };
      const prev = index[pid];
      if (!prev || score(campaign.tiers) > scoreFromCompact(prev)) {
        index[pid] = withCx;
      }
    }
  }

  return index;
}

function scoreFromCompact(rule: CompactProductRule): number {
  const t = rule.t[0];
  if (!t) return 0;
  if ("p" in t) return t.p;
  if ("f" in t) return t.f;
  if ("fp" in t) return t.fp;
  return 0;
}

function greedySplitRules(
  rules: ProductRuleIndex,
  maxChars: number,
  maxFragments: number,
): ProductRuleIndex[] {
  const entries = Object.entries(rules);
  const parts: ProductRuleIndex[] = [];
  let cur: ProductRuleIndex = {};

  for (const [pid, rule] of entries) {
    const next = { ...cur, [pid]: rule };
    const testSize = JSON.stringify({
      version: 4,
      fragmentTotal: maxFragments,
      fragmentIndex: Math.min(parts.length, maxFragments - 1),
      rules: next,
    }).length;
    if (testSize > maxChars && Object.keys(cur).length > 0) {
      parts.push(cur);
      cur = { [pid]: rule };
    } else {
      cur = next;
    }
  }
  if (Object.keys(cur).length) parts.push(cur);

  const total = parts.length;
  for (let i = 0; i < parts.length; i++) {
    const s = JSON.stringify({
      version: 4,
      fragmentTotal: total,
      fragmentIndex: i,
      rules: parts[i],
    });
    if (s.length > maxChars) {
      throw new Error(
        "One product's discount rule is too large for a metafield chunk. Reduce tier count or label length.",
      );
    }
  }

  return parts;
}

export type ProductRuleMetafieldBuild = {
  chunks: { key: string; value: string }[];
  productCount: number;
  needsRemoteLookup: boolean;
};

/**
 * Shard product-index JSON across discount metafields (v4).
 * If more than 5 shards are required, sets `needsRemoteLookup` — Function should use network access + API.
 */
export function splitProductRuleIndexIntoMetafieldChunks(
  rules: ProductRuleIndex,
  storefrontTranslations?: DiscountFunctionCartTranslations,
): ProductRuleMetafieldBuild {
  const attachTranslations = (payload: Record<string, unknown>) => {
    if (
      storefrontTranslations &&
      Object.keys(storefrontTranslations).length > 0
    ) {
      payload.storefrontTranslations = storefrontTranslations;
    }
    return payload;
  };

  const productCount = Object.keys(rules).length;
  if (productCount === 0) {
    return {
      chunks: VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.map((key, i) => ({
        key,
        value:
          i === 0
            ? JSON.stringify(attachTranslations({ version: 4, rules: {} }))
            : VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON,
      })),
      productCount: 0,
      needsRemoteLookup: false,
    };
  }

  const single = JSON.stringify(attachTranslations({ version: 4, rules }));
  if (single.length <= VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_MAX_CHARS) {
    return {
      chunks: VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.map((key, i) => ({
        key,
        value: i === 0 ? single : VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON,
      })),
      productCount,
      needsRemoteLookup: false,
    };
  }

  const maxFragments = VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.length;
  const parts = greedySplitRules(
    rules,
    VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_MAX_CHARS,
    maxFragments,
  );

  if (parts.length > maxFragments) {
    return {
      chunks: [
        {
          key: VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS[0]!,
          value: JSON.stringify({
            version: 4,
            remote: true,
            productCount,
          }),
        },
        ...VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.slice(1).map((key) => ({
          key,
          value: VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON,
        })),
      ],
      productCount,
      needsRemoteLookup: true,
    };
  }

  const total = parts.length;
  const chunks = VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.map((key, i) => {
    if (i >= total) {
      return { key, value: VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON };
    }
    return {
      key,
      value: JSON.stringify(
        attachTranslations({
          version: 4,
          fragmentTotal: total,
          fragmentIndex: i,
          rules: parts[i],
        }),
      ),
    };
  });

  return { chunks, productCount, needsRemoteLookup: false };
}

/** Build one compact rule object for a product tiers metafield write. */
export function buildCompactRuleForProduct(args: {
  campaign: ProductRuleCampaignInput;
  productId: string;
}): CompactProductRule {
  const { campaign, productId } = args;
  const label =
    (campaign.displayName && campaign.displayName.trim()) ||
    campaign.campaignName;
  return {
    c: campaign.id,
    m: label.slice(0, 80),
    q: compactQtyMode(campaign.productScope, campaign.quantityCondition),
    ct: CT_MAP[campaign.customerType] ?? "e",
    ...(campaign.customerTags.length ? { tg: campaign.customerTags } : {}),
    ...(campaign.variantIds?.length ? { vs: campaign.variantIds } : {}),
    ...(campaign.collectionIdsByProduct?.[productId]?.length
      ? { cx: campaign.collectionIdsByProduct[productId] }
      : {}),
    t: compactTiers(campaign.tiers),
  };
}
