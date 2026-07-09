import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/** Shopify store cap for automatic discount *candidates* in this flow (spec: max 25). */
const MAX_DISCOUNTS = 25;

/**
 * Cart-first: walk `cart.lines` in order, look up discount by `product_id`, emit one
 * candidate per line (variant = that line). Stops after 25 candidates.
 *
 * Targeting: Shopify Cart Line Discount API uses `{ cartLine: { id } }` only — each
 * line is one variant; that is strict variant-level targeting.
 *
 * Strategy: JSON asks for "FIRST", but `ProductDiscountSelectionStrategy.First`
 * applies only the *first candidate* to the whole cart. To honor up to 25 distinct
 * line discounts, we use **All**. Switch to `First` if you intentionally want a
 * single winning discount for the entire cart.
 */
export function dynamicProductDiscountRun(input) {
  const lines = input?.cart?.lines ?? [];
  if (!lines.length) {
    return { operations: [] };
  }

  const classes = input.discount?.discountClasses ?? [];
  const hasProductClass = classes.includes(DiscountClass.Product);
  const db = parseDiscountDatabase(input.discount?.customDiscounts?.jsonValue);
  if (!hasProductClass && db.length === 0) {
    return { operations: [] };
  }

  const productToRule = buildProductToDiscountMap(db);

  /** @type {import("../generated/api").ProductDiscountCandidate[]} */
  const candidates = [];

  for (const line of lines) {
    if (candidates.length >= MAX_DISCOUNTS) break;

    const m = line.merchandise;
    if (
      !m ||
      typeof m.id !== "string" ||
      !m.product ||
      typeof m.product.id !== "string"
    ) {
      continue;
    }

    const productKey = canonicalProductGid(m.product.id);
    if (!productKey) continue;

    const row = productToRule.get(productKey);
    if (!row) continue;

    const value = valueFromRow(row);
    if (!value) continue;

    const label =
      row.type === "fixed"
        ? `Product discount (${row.value} off)`
        : `Product discount (${row.value}%)`;

    candidates.push({
      message: label,
      targets: [{ cartLine: { id: line.id } }],
      value,
    });
  }

  if (!candidates.length) {
    return { operations: [] };
  }

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

/**
 * Safe parse; invalid JSON → [].
 * @param {unknown} raw
 * @returns {{ product_id: string, type: string, value: number, priority?: number }[]}
 */
function parseDiscountDatabase(raw) {
  if (raw == null) return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const product_id = String(
      /** @type {{ product_id?: unknown }} */ (item).product_id ?? "",
    ).trim();
    const typeRaw = String(
      /** @type {{ type?: unknown }} */ (item).type ?? "percentage",
    ).toLowerCase();
    const type = typeRaw === "fixed" ? "fixed" : "percentage";
    const value = Number(
      /** @type {{ value?: unknown }} */ (item).value,
    );
    if (!product_id || !Number.isFinite(value)) continue;
    const priority = /** @type {{ priority?: unknown }} */ (item).priority;
    out.push({
      product_id,
      type,
      value,
      ...(priority != null && Number.isFinite(Number(priority))
        ? { priority: Number(priority) }
        : {}),
    });
  }
  return out;
}

/**
 * One rule per product: higher `priority` wins; tie-break stable index.
 * Duplicate `product_id` in config → first after sort (highest priority).
 * @param {{ product_id: string, type: string, value: number, priority?: number }[]} rows
 * @returns {Map<string, typeof rows[0]>}
 */
function buildProductToDiscountMap(rows) {
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const pa = Number(a.row.priority ?? 0);
    const pb = Number(b.row.priority ?? 0);
    if (pb !== pa) return pb - pa;
    const va = Number(a.row.value ?? 0);
    const vb = Number(b.row.value ?? 0);
    if (vb !== va) return vb - va;
    return a.index - b.index;
  });

  const map = new Map();
  for (const { row } of indexed) {
    const k = canonicalProductGid(row.product_id);
    if (!k || map.has(k)) continue;
    map.set(k, row);
  }
  return map;
}

/** @param {unknown} gidOrId */
function canonicalProductGid(gidOrId) {
  const s = String(gidOrId ?? "").trim();
  if (!s) return "";
  const m = s.match(/\/Product\/(\d+)/);
  if (m) return `gid://shopify/Product/${m[1]}`;
  if (/^\d+$/.test(s)) return `gid://shopify/Product/${s}`;
  return "";
}

/**
 * @param {{ type: string, value: number }} row
 * @returns {import("../generated/api").ProductDiscountCandidateValue | null}
 */
function valueFromRow(row) {
  if (row.type === "fixed") {
    const amt = Math.max(0, Number(row.value));
    if (!Number.isFinite(amt)) return null;
    return {
      fixedAmount: {
        amount: String(amt),
        appliesToEachItem: false,
      },
    };
  }
  const pct = Math.min(100, Math.max(0, Number(row.value)));
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return {
    percentage: {
      value: String(pct),
    },
  };
}
