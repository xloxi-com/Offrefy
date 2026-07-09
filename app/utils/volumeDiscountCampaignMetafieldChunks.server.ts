/**
 * Shopify JSON metafield values are capped (~128KB). Many campaigns + product GIDs exceed one blob;
 * we shard across multiple discount metafields and merge in the cart Function.
 */

/** ~128KB Shopify JSON metafield cap; stay slightly under for UTF-8 / overhead. */
export const VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_MAX_CHARS = 127_000;

/**
 * Max shards = metafield() reads in the Function input query. Shopify caps that query at
 * **complexity 30**; with cart lines + buyerIdentity, only **5**
 * discount metafields fit. Do not add keys without removing other query fields or Shopify
 * raises the limit — see `cart_lines_discounts_generate_run.graphql`.
 */
export const VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS = [
  "campaigns",
  "campaigns_1",
  "campaigns_2",
  "campaigns_3",
  "campaigns_4",
] as const;

export const VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON = JSON.stringify({ version: 0 });

export type VolumeDiscountMergedCampaignConfig = {
  version: number;
  campaigns: unknown[];
};

type MetafieldChunk = { key: string; value: string };

function greedySplitCampaigns(
  campaigns: unknown[],
  maxChars: number,
  maxFragments: number,
): unknown[][] {
  const parts: unknown[][] = [];
  let cur: unknown[] = [];

  for (const c of campaigns) {
    const next = [...cur, c];
    const testSize = JSON.stringify({
      version: 3,
      fragmentTotal: maxFragments,
      fragmentIndex: Math.min(parts.length, maxFragments - 1),
      campaigns: next,
    }).length;
    if (testSize > maxChars && cur.length > 0) {
      parts.push(cur);
      cur = [c];
    } else {
      cur = next;
    }
  }
  if (cur.length) parts.push(cur);

  const total = parts.length;
  for (let i = 0; i < parts.length; i++) {
    const s = JSON.stringify({
      version: 3,
      fragmentTotal: total,
      fragmentIndex: i,
      campaigns: parts[i],
    });
    if (s.length > maxChars) {
      throw new Error(
        "One campaign is too large for a single metafield chunk. Reduce the number of targeted products per offer or split the offer.",
      );
    }
  }

  return parts;
}

/**
 * Build one value per `VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS` entry (stubs use `version: 0`).
 */
export function splitCampaignConfigIntoMetafieldChunks(
  config: VolumeDiscountMergedCampaignConfig,
): MetafieldChunk[] {
  const { version, campaigns } = config;
  if (!Array.isArray(campaigns)) {
    return VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.map((key, i) => ({
      key,
      value:
        i === 0
          ? JSON.stringify({ version: 2, campaigns: [] })
          : VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON,
    }));
  }

  const single = JSON.stringify({ version, campaigns });
  if (single.length <= VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_MAX_CHARS) {
    return VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.map((key, i) => ({
      key,
      value: i === 0 ? single : VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON,
    }));
  }

  const maxFragments = VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.length;
  const parts = greedySplitCampaigns(
    campaigns,
    VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_MAX_CHARS,
    maxFragments,
  );

  if (parts.length > maxFragments) {
    throw new Error(
      `Campaign config needs ${parts.length} metafield chunks (max ${maxFragments}). Reduce campaigns or product lists.`,
    );
  }

  const total = parts.length;
  return VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.map((key, i) => {
    if (i >= total) {
      return { key, value: VOLUME_DISCOUNT_EMPTY_FRAGMENT_JSON };
    }
    return {
      key,
      value: JSON.stringify({
        version: 3,
        fragmentTotal: total,
        fragmentIndex: i,
        campaigns: parts[i],
      }),
    };
  });
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Merge shard metafields from the live discount into `{ version, campaigns }` for filtering/rebuild logic.
 */
export function mergeCampaignConfigFromMetafieldNodes(
  nodes: { key: string; value: string }[],
): VolumeDiscountMergedCampaignConfig | null {
  const byKey = new Map<string, string>();
  for (const n of nodes) {
    if (n?.key && typeof n.value === "string") byKey.set(n.key, n.value);
  }

  const raw0 = byKey.get(VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS[0]);
  if (!raw0) return null;

  const root = parseJsonObject(raw0);
  if (!root) return null;

  const ver = Number(root.version);
  if (!Number.isFinite(ver)) return null;
  if (ver === 0) return null;

  if (ver === 2) {
    const c = root.campaigns;
    return {
      version: 2,
      campaigns: Array.isArray(c) ? c : [],
    };
  }

  if (ver === 3) {
    const total = Number(root.fragmentTotal);
    const idx = Number(root.fragmentIndex);
    if (
      !Number.isFinite(total) ||
      total < 1 ||
      total > VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS.length ||
      !Number.isFinite(idx) ||
      idx !== 0
    ) {
      return null;
    }

    if (total === 1) {
      const c = root.campaigns;
      return {
        version: 2,
        campaigns: Array.isArray(c) ? c : [],
      };
    }

    const merged: unknown[] = [];
    for (let i = 0; i < total; i++) {
      const key = VOLUME_DISCOUNT_CAMPAIGN_METAFIELD_KEYS[i];
      const raw = byKey.get(key ?? "");
      if (!raw) return null;
      const frag = parseJsonObject(raw);
      if (!frag) return null;
      if (Number(frag.version) !== 3) return null;
      if (Number(frag.fragmentTotal) !== total) return null;
      if (Number(frag.fragmentIndex) !== i) return null;
      const part = frag.campaigns;
      if (!Array.isArray(part)) return null;
      merged.push(...part);
    }
    return { version: 2, campaigns: merged };
  }

  return null;
}
