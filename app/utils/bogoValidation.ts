/**
 * Shared BOGO Buy X Get Y validation (admin form + server parse).
 * Isolated from volume-discount Function sync.
 */

const PRODUCT_GID_RE = /^gid:\/\/shopify\/Product\/\d+$/;
const COLLECTION_GID_RE = /^gid:\/\/shopify\/Collection\/\d+$/;

export function isShopifyProductGid(id: string): boolean {
  return PRODUCT_GID_RE.test(id.trim());
}

export function isShopifyCollectionGid(id: string): boolean {
  return COLLECTION_GID_RE.test(id.trim());
}

/** Positive whole number (≥ 1). Rejects decimals, zero, negatives, empty. */
export function parsePositiveWholeNumber(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

/**
 * Uses-per-order limit: empty → unlimited (null).
 * When provided must be a positive whole number (never coerce to 1).
 */
export function parseUsesPerOrderLimit(raw: string): {
  ok: true;
  value: number | null;
} | { ok: false; error: string } {
  const t = String(raw ?? "").trim();
  if (!t) return { ok: true, value: null };
  const n = parsePositiveWholeNumber(t);
  if (n == null) {
    return {
      ok: false,
      error: "Maximum uses per order must be a positive whole number, or left blank for unlimited",
    };
  }
  return { ok: true, value: n };
}

export function validateShopifyIdList(
  ids: string[],
  kind: "product" | "collection",
): string | null {
  if (ids.length === 0) return null;
  const check = kind === "product" ? isShopifyProductGid : isShopifyCollectionGid;
  const label = kind === "product" ? "product" : "collection";
  for (const id of ids) {
    if (!check(id)) {
      return `Invalid Shopify ${label} ID: ${id}`;
    }
  }
  return null;
}

export type BogoClientFormFields = {
  campaignName: string;
  startsAtIso: string;
  endsAtIso: string;
  buysRequirement: "quantity" | "amount";
  buysQuantity: string;
  buysAmount: string;
  buysScope: "products" | "collections";
  buysProductIds: string[];
  buysCollectionIds: string[];
  getsQuantity: string;
  getsScope: "products" | "collections";
  getsProductIds: string[];
  getsCollectionIds: string[];
  getsValueType: "free" | "percentage" | "amount";
  getsValue: string;
  usesPerOrderLimit: string;
};

/** Client-side preflight matching server rules (Free path emphasized). */
export function validateBogoClientForm(fields: BogoClientFormFields): string | null {
  if (!fields.campaignName.trim()) {
    return "Campaign name is required";
  }

  const startsAt = new Date(fields.startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    return "Start date is invalid";
  }
  if (fields.endsAtIso.trim()) {
    const endsAt = new Date(fields.endsAtIso);
    if (Number.isNaN(endsAt.getTime())) {
      return "End date is invalid";
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return "End date must be after the start date";
    }
  }

  if (fields.buysRequirement === "quantity") {
    if (parsePositiveWholeNumber(fields.buysQuantity) == null) {
      return "Customer buys quantity must be at least 1";
    }
  } else {
    const amount = Number.parseFloat(fields.buysAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Customer buys amount must be greater than 0";
    }
  }

  if (fields.buysScope === "products") {
    if (fields.buysProductIds.length === 0) {
      return "Select at least one product the customer buys";
    }
    const bad = validateShopifyIdList(fields.buysProductIds, "product");
    if (bad) return bad;
  } else {
    if (fields.buysCollectionIds.length === 0) {
      return "Select at least one collection the customer buys";
    }
    const bad = validateShopifyIdList(fields.buysCollectionIds, "collection");
    if (bad) return bad;
  }

  if (parsePositiveWholeNumber(fields.getsQuantity) == null) {
    return "Customer gets quantity must be at least 1";
  }

  if (fields.getsScope === "products") {
    if (fields.getsProductIds.length === 0) {
      return "Select at least one product the customer gets";
    }
    const bad = validateShopifyIdList(fields.getsProductIds, "product");
    if (bad) return bad;
  } else {
    if (fields.getsCollectionIds.length === 0) {
      return "Select at least one collection the customer gets";
    }
    const bad = validateShopifyIdList(fields.getsCollectionIds, "collection");
    if (bad) return bad;
  }

  if (fields.getsValueType === "percentage") {
    const pct = Number.parseFloat(fields.getsValue);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return "Get discount percentage must be between 1 and 100";
    }
  } else if (fields.getsValueType === "amount") {
    const amount = Number.parseFloat(fields.getsValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Get amount off must be greater than 0";
    }
  }

  const uses = parseUsesPerOrderLimit(fields.usesPerOrderLimit);
  if (!uses.ok) return uses.error;

  return null;
}

/**
 * Expected free units for same-product quantity BXGY (Shopify native).
 * Cart must hold buyQty+getQty per application; remainder stays paid.
 */
export function expectedSameProductFreeUnits(opts: {
  cartQty: number;
  buyQty: number;
  getQty: number;
  usesPerOrderLimit: number | null;
}): number {
  const buy = Math.max(1, opts.buyQty);
  const get = Math.max(1, opts.getQty);
  const group = buy + get;
  if (opts.cartQty < group) return 0;
  let apps = Math.floor(opts.cartQty / group);
  if (opts.usesPerOrderLimit != null && opts.usesPerOrderLimit > 0) {
    apps = Math.min(apps, opts.usesPerOrderLimit);
  }
  return apps * get;
}

/**
 * Cross-product free units: floor(buyEligible / buyQty) * getQty, capped by
 * available Get qty and optional usesPerOrderLimit.
 */
export function expectedCrossProductFreeUnits(opts: {
  buyEligibleQty: number;
  getEligibleQty: number;
  buyQty: number;
  getQty: number;
  usesPerOrderLimit: number | null;
}): number {
  const buy = Math.max(1, opts.buyQty);
  const get = Math.max(1, opts.getQty);
  if (opts.buyEligibleQty < buy || opts.getEligibleQty < get) return 0;
  let apps = Math.floor(opts.buyEligibleQty / buy);
  apps = Math.min(apps, Math.floor(opts.getEligibleQty / get));
  if (opts.usesPerOrderLimit != null && opts.usesPerOrderLimit > 0) {
    apps = Math.min(apps, opts.usesPerOrderLimit);
  }
  return apps * get;
}
