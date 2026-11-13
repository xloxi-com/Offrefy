import { prisma } from "../db.server";
import type { BogoCampaignInput } from "../types/bogo";
import {
  buildAutomaticBxgyInput,
  previousItemsFromRow,
  type BxgyItemsPrevious,
} from "../utils/bogoBxgyInput";
import { jsonStringArrayFromDb } from "../utils/bogoForm.server";
import { deleteAutomaticDiscounts } from "./volumeDiscountShopify.server";

export { buildAutomaticBxgyInput } from "../utils/bogoBxgyInput";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const CREATE_BXGY = `#graphql
  mutation BogoDiscountAutomaticBxgyCreate($automaticBxgyDiscount: DiscountAutomaticBxgyInput!) {
    discountAutomaticBxgyCreate(automaticBxgyDiscount: $automaticBxgyDiscount) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const UPDATE_BXGY = `#graphql
  mutation BogoDiscountAutomaticBxgyUpdate($id: ID!, $automaticBxgyDiscount: DiscountAutomaticBxgyInput!) {
    discountAutomaticBxgyUpdate(id: $id, automaticBxgyDiscount: $automaticBxgyDiscount) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const ACTIVATE = `#graphql
  mutation BogoDiscountAutomaticActivate($id: ID!) {
    discountAutomaticActivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const DEACTIVATE = `#graphql
  mutation BogoDiscountAutomaticDeactivate($id: ID!) {
    discountAutomaticDeactivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

async function graphqlJson<T>(
  admin: AdminGraphql,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data?: T; errors?: { message: string }[] }> {
  const res = await admin.graphql(query, { variables });
  return (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
}

function collectUserErrors(
  errors: { message?: string; code?: string }[] | undefined,
  graphqlErrors: { message: string }[] | undefined,
): string[] {
  const out: string[] = [];
  if (graphqlErrors?.length) {
    out.push(...graphqlErrors.map((e) => e.message));
  }
  for (const e of errors ?? []) {
    if (e.message) out.push(e.message);
  }
  return out;
}

function isMissingDiscountError(errors: string[]): boolean {
  const blob = errors.join(" ").toLowerCase();
  return (
    blob.includes("not found") ||
    blob.includes("does not exist") ||
    blob.includes("invalid id") ||
    blob.includes("doesn't exist")
  );
}

function rowToInput(row: {
  campaignName: string;
  displayName: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  buysRequirement: string;
  buysQuantity: number | null;
  buysAmount: string | null;
  buysScope: string;
  buysProductIds: unknown;
  buysCollectionIds: unknown;
  getsQuantity: number;
  getsScope: string;
  getsProductIds: unknown;
  getsCollectionIds: unknown;
  getsValueType: string;
  getsValue: string | null;
  usesPerOrderLimit: number | null;
  widgetDisplay?: unknown;
  displayNameTranslations?: unknown;
  combinesWithProductDiscounts?: boolean | null;
  combinesWithOrderDiscounts?: boolean | null;
  combinesWithShippingDiscounts?: boolean | null;
}): BogoCampaignInput {
  const status = String(row.status).toLowerCase();
  return {
    campaignName: row.campaignName,
    displayName: row.displayName ?? row.campaignName,
    status:
      status === "active" ||
      status === "scheduled" ||
      status === "archived" ||
      status === "draft"
        ? status
        : "draft",
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    buysRequirement: row.buysRequirement === "amount" ? "amount" : "quantity",
    buysQuantity: row.buysQuantity,
    buysAmount: row.buysAmount,
    buysScope: row.buysScope === "collections" ? "collections" : "products",
    buysProductIds: jsonStringArrayFromDb(row.buysProductIds),
    buysCollectionIds: jsonStringArrayFromDb(row.buysCollectionIds),
    getsQuantity: row.getsQuantity,
    getsScope: row.getsScope === "collections" ? "collections" : "products",
    getsProductIds: jsonStringArrayFromDb(row.getsProductIds),
    getsCollectionIds: jsonStringArrayFromDb(row.getsCollectionIds),
    getsValueType:
      row.getsValueType === "percentage" || row.getsValueType === "amount"
        ? row.getsValueType
        : "free",
    getsValue: row.getsValue,
    usesPerOrderLimit: row.usesPerOrderLimit,
    widgetDisplay:
      row.widgetDisplay &&
      typeof row.widgetDisplay === "object" &&
      !Array.isArray(row.widgetDisplay)
        ? (row.widgetDisplay as Record<string, unknown>)
        : {},
    displayNameTranslations:
      row.displayNameTranslations &&
      typeof row.displayNameTranslations === "object" &&
      !Array.isArray(row.displayNameTranslations)
        ? (row.displayNameTranslations as Record<string, Record<string, string>>)
        : {},
    combinesWithProductDiscounts: row.combinesWithProductDiscounts !== false,
    combinesWithOrderDiscounts: row.combinesWithOrderDiscounts === true,
    combinesWithShippingDiscounts: row.combinesWithShippingDiscounts !== false,
  };
}

async function createBxgy(
  admin: AdminGraphql,
  automaticBxgyDiscount: Record<string, unknown>,
): Promise<{ id: string | null; errors: string[] }> {
  const json = await graphqlJson<{
    discountAutomaticBxgyCreate?: {
      automaticDiscountNode?: { id?: string | null } | null;
      userErrors?: { message?: string; code?: string }[];
    };
  }>(admin, CREATE_BXGY, { automaticBxgyDiscount });

  const errors = collectUserErrors(
    json.data?.discountAutomaticBxgyCreate?.userErrors,
    json.errors,
  );
  const id =
    json.data?.discountAutomaticBxgyCreate?.automaticDiscountNode?.id ?? null;
  return { id, errors };
}

async function updateBxgy(
  admin: AdminGraphql,
  id: string,
  automaticBxgyDiscount: Record<string, unknown>,
): Promise<{ id: string | null; errors: string[] }> {
  const json = await graphqlJson<{
    discountAutomaticBxgyUpdate?: {
      automaticDiscountNode?: { id?: string | null } | null;
      userErrors?: { message?: string; code?: string }[];
    };
  }>(admin, UPDATE_BXGY, { id, automaticBxgyDiscount });

  const errors = collectUserErrors(
    json.data?.discountAutomaticBxgyUpdate?.userErrors,
    json.errors,
  );
  const nodeId =
    json.data?.discountAutomaticBxgyUpdate?.automaticDiscountNode?.id ?? null;
  return { id: nodeId, errors };
}

/**
 * Soft-fail activate/deactivate — already-active / already-inactive are fine.
 * Never call activate for scheduled offers: Shopify sets startsAt to now.
 */
function isBenignActivationError(errors: string[]): boolean {
  const blob = errors.join(" ").toLowerCase();
  return (
    blob.includes("already active") ||
    blob.includes("already inactive") ||
    blob.includes("already been activated") ||
    blob.includes("already been deactivated")
  );
}

async function softActivate(
  admin: AdminGraphql,
  id: string,
): Promise<string[]> {
  const json = await graphqlJson<{
    discountAutomaticActivate?: { userErrors?: { message?: string }[] };
  }>(admin, ACTIVATE, { id });
  const errors = collectUserErrors(
    json.data?.discountAutomaticActivate?.userErrors,
    json.errors,
  );
  if (!errors.length) return [];
  if (isBenignActivationError(errors) || isMissingDiscountError(errors)) {
    return [];
  }
  return errors;
}

async function softDeactivate(
  admin: AdminGraphql,
  id: string,
): Promise<string[]> {
  const json = await graphqlJson<{
    discountAutomaticDeactivate?: { userErrors?: { message?: string }[] };
  }>(admin, DEACTIVATE, { id });
  const errors = collectUserErrors(
    json.data?.discountAutomaticDeactivate?.userErrors,
    json.errors,
  );
  if (!errors.length) return [];
  /* Preserve missing so draft/sync callers can clear the stale GID. */
  if (isBenignActivationError(errors)) return [];
  return errors;
}

export type SyncBogoResult = {
  shopifyDiscountId: string | null;
  errors: string[];
};

export type SyncBogoOptions = {
  /** Product/collection membership before the Prisma write (required for accurate update diffs). */
  previousBuys?: BxgyItemsPrevious | null;
  previousGets?: BxgyItemsPrevious | null;
};

/**
 * Creates or updates the native automatic BXGY discount for one BOGO campaign.
 * Persists shopifyDiscountId. Draft/archived → deactivate remote (keep GID).
 * Active/scheduled → create or update; scheduled relies on startsAt (never activate).
 *
 * Rollback / reconciliation:
 * - Create failure → mark draft, clear GID
 * - Update failure with missing remote → recreate once, then delete old GID if still present
 * - Other update failures → keep existing remote discount; return Shopify errors (no silent recreate)
 */
export async function syncBogoCampaignToShopify(
  admin: AdminGraphql,
  shop: string,
  campaignId: string,
  options?: SyncBogoOptions,
): Promise<SyncBogoResult> {
  const row = await prisma.bogoCampaign.findFirst({
    where: { id: campaignId, shop },
  });
  if (!row) {
    return { shopifyDiscountId: null, errors: ["BOGO offer not found"] };
  }

  const status = String(row.status).toLowerCase();
  const existingId =
    typeof row.shopifyDiscountId === "string" && row.shopifyDiscountId
      ? row.shopifyDiscountId
      : null;

  if (status === "draft" || status === "archived") {
    if (existingId) {
      const errors = await softDeactivate(admin, existingId);
      if (errors.length && !isMissingDiscountError(errors)) {
        return { shopifyDiscountId: existingId, errors };
      }
      if (errors.length && isMissingDiscountError(errors)) {
        await prisma.bogoCampaign.update({
          where: { id: campaignId },
          data: { shopifyDiscountId: null },
        });
        return { shopifyDiscountId: null, errors: [] };
      }
    }
    return { shopifyDiscountId: existingId, errors: [] };
  }

  const data = rowToInput(row);
  const combinesWith = {
    productDiscounts: data.combinesWithProductDiscounts,
    orderDiscounts: data.combinesWithOrderDiscounts,
    shippingDiscounts: data.combinesWithShippingDiscounts,
  };
  const inferredPrevious = previousItemsFromRow(row);
  /*
   * Prefer pre-write membership from the edit action. Without it (status toggle /
   * schedule flip), Prisma already matches desired IDs — omit items on update so
   * Shopify keeps existing product/collection attachments.
   */
  const hasPreviousSnapshot =
    options?.previousBuys != null || options?.previousGets != null;

  const startsInFuture = data.startsAt.getTime() > Date.now() + 60_000;
  const wantLive =
    status === "active" || (status === "scheduled" && !startsInFuture);

  if (existingId) {
    const updateInput = buildAutomaticBxgyInput(data, {
      isCreate: false,
      combinesWith,
      previousBuys: options?.previousBuys ?? inferredPrevious.buys,
      previousGets: options?.previousGets ?? inferredPrevious.gets,
    });

    if (!hasPreviousSnapshot) {
      const buys = updateInput.customerBuys as Record<string, unknown>;
      const gets = updateInput.customerGets as Record<string, unknown>;
      if (buys && typeof buys === "object") delete buys.items;
      if (gets && typeof gets === "object") delete gets.items;
    }

    const updated = await updateBxgy(admin, existingId, updateInput);
    if (!updated.errors.length) {
      const activationErrors = await alignActivation(
        admin,
        existingId,
        status,
        wantLive,
        startsInFuture,
      );
      return {
        shopifyDiscountId: existingId,
        errors: activationErrors,
      };
    }

    /* Only recreate when the remote discount is gone — never on validation/API errors. */
    if (!isMissingDiscountError(updated.errors)) {
      return {
        shopifyDiscountId: existingId,
        errors: updated.errors,
      };
    }

    const created = await createBxgy(
      admin,
      buildAutomaticBxgyInput(data, { isCreate: true, combinesWith }),
    );
    if (created.errors.length || !created.id) {
      await prisma.bogoCampaign.update({
        where: { id: campaignId },
        data: { status: "draft", shopifyDiscountId: null },
      });
      return {
        shopifyDiscountId: null,
        errors: created.errors.length
          ? [
              ...updated.errors,
              ...created.errors,
              "Shopify BXGY missing remotely; recreate failed and offer set to draft",
            ]
          : [
              ...updated.errors,
              "Shopify BXGY missing remotely; recreate failed and offer set to draft",
            ],
      };
    }

    await prisma.bogoCampaign.update({
      where: { id: campaignId },
      data: { shopifyDiscountId: created.id },
    });

    const deleted = await deleteAutomaticDiscounts(admin, [existingId]);
    if (deleted.errors.length && !isMissingDiscountError(deleted.errors)) {
      console.warn(
        "[bogo] orphan old BXGY after recreate",
        existingId,
        deleted.errors.join("; "),
      );
    }

    const activationErrors = await alignActivation(
      admin,
      created.id,
      status,
      wantLive,
      startsInFuture,
    );
    return { shopifyDiscountId: created.id, errors: activationErrors };
  }

  const created = await createBxgy(
    admin,
    buildAutomaticBxgyInput(data, { isCreate: true, combinesWith }),
  );
  if (created.errors.length || !created.id) {
    await prisma.bogoCampaign.update({
      where: { id: campaignId },
      data: { status: "draft", shopifyDiscountId: null },
    });
    return {
      shopifyDiscountId: null,
      errors: created.errors.length
        ? created.errors
        : ["Shopify BXGY create failed"],
    };
  }

  await prisma.bogoCampaign.update({
    where: { id: campaignId },
    data: { shopifyDiscountId: created.id },
  });

  const activationErrors = await alignActivation(
    admin,
    created.id,
    status,
    wantLive,
    startsInFuture,
  );
  return { shopifyDiscountId: created.id, errors: activationErrors };
}

async function alignActivation(
  admin: AdminGraphql,
  discountId: string,
  status: string,
  wantLive: boolean,
  startsInFuture: boolean,
): Promise<string[]> {
  if (status === "scheduled" || startsInFuture) {
    /*
     * Future startsAt → Shopify SCHEDULED. Do not activate (would force startsAt=now)
     * and do not deactivate (would kill the schedule).
     */
    return [];
  }
  if (wantLive) {
    return softActivate(admin, discountId);
  }
  return softDeactivate(admin, discountId);
}

/** Deletes Shopify BXGY (if any) then the Prisma row. Skips DB delete when Shopify hard-fails. */
export async function deleteBogoCampaign(
  admin: AdminGraphql,
  shop: string,
  campaignIds: string[],
): Promise<{ errors: string[] }> {
  const rows = await prisma.bogoCampaign.findMany({
    where: { shop, id: { in: campaignIds } },
    select: { id: true, shopifyDiscountId: true },
  });

  const errors: string[] = [];
  const deletableDbIds: string[] = [];

  for (const row of rows) {
    const gid =
      typeof row.shopifyDiscountId === "string" && row.shopifyDiscountId
        ? row.shopifyDiscountId
        : null;
    if (!gid) {
      deletableDbIds.push(row.id);
      continue;
    }
    const deleted = await deleteAutomaticDiscounts(admin, [gid]);
    if (deleted.errors.length && !isMissingDiscountError(deleted.errors)) {
      errors.push(
        `Offer ${row.id}: Shopify delete failed (${deleted.errors.join("; ")}); local row kept`,
      );
      continue;
    }
    deletableDbIds.push(row.id);
  }

  if (deletableDbIds.length) {
    await prisma.bogoCampaign.deleteMany({
      where: { shop, id: { in: deletableDbIds } },
    });
  }
  return { errors };
}

export async function setBogoCampaignsStatus(
  admin: AdminGraphql,
  shop: string,
  campaignIds: string[],
  status: "active" | "draft",
): Promise<{ errors: string[]; synced: number }> {
  const rows = await prisma.bogoCampaign.findMany({
    where: { shop, id: { in: campaignIds } },
    select: { id: true },
  });
  if (rows.length === 0) {
    return { errors: ["No BOGO offers found"], synced: 0 };
  }
  await prisma.bogoCampaign.updateMany({
    where: { shop, id: { in: rows.map((r) => r.id) } },
    data: { status },
  });
  const errors: string[] = [];
  let synced = 0;
  for (const row of rows) {
    const result = await syncBogoCampaignToShopify(admin, shop, row.id);
    if (result.errors.length) errors.push(...result.errors);
    else synced += 1;
  }
  return { errors, synced };
}

/** Flip scheduled→active / active→draft for due BOGO windows (plan-capped). */
export async function applyDueBogoScheduleTransitions(
  shop: string,
): Promise<{ flipped: number; idsNeedingSync: string[] }> {
  const now = new Date();
  const dueActive = await prisma.bogoCampaign.findMany({
    where: {
      shop,
      status: "scheduled",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { id: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  const dueEnded = await prisma.bogoCampaign.findMany({
    where: {
      shop,
      status: { in: ["active", "scheduled"] },
      endsAt: { lte: now },
    },
    select: { id: true },
  });

  const activatedIds: string[] = [];
  if (dueActive.length) {
    const { resolveShopPlan, countActiveCampaigns } = await import(
      "../utils/shopPlan.server"
    );
    const { getMaxActiveCampaigns } = await import("../utils/pricingPlans");
    const [plan, activeCount] = await Promise.all([
      resolveShopPlan(shop),
      countActiveCampaigns(shop),
    ]);
    const max = getMaxActiveCampaigns(plan);
    const room = max == null ? dueActive.length : Math.max(0, max - activeCount);
    const allow = dueActive.slice(0, room).map((r) => r.id);
    if (allow.length) {
      await prisma.bogoCampaign.updateMany({
        where: { id: { in: allow } },
        data: { status: "active" },
      });
      activatedIds.push(...allow);
    }
  }
  if (dueEnded.length) {
    await prisma.bogoCampaign.updateMany({
      where: { id: { in: dueEnded.map((r) => r.id) } },
      data: { status: "draft" },
    });
  }

  const idsNeedingSync = [
    ...new Set([...activatedIds, ...dueEnded.map((r) => r.id)]),
  ];
  return {
    flipped: activatedIds.length + dueEnded.length,
    idsNeedingSync,
  };
}

/**
 * Sync BXGY for campaign IDs that already flipped in DB.
 * Pass `idsNeedingSync` from `applyDueBogoScheduleTransitions` — do NOT re-run
 * transitions here (second pass would find nothing and skip Shopify activate).
 */
export async function syncDueBogoScheduleToShopify(
  admin: AdminGraphql,
  shop: string,
  idsNeedingSync?: string[],
): Promise<{ errors: string[] }> {
  const ids =
    idsNeedingSync ??
    (await applyDueBogoScheduleTransitions(shop)).idsNeedingSync;
  const errors: string[] = [];
  for (const id of ids) {
    const result = await syncBogoCampaignToShopify(admin, shop, id);
    errors.push(...result.errors);
  }
  return { errors };
}

/** Exposed for tests / rare direct update without recreate. */
export async function updateBxgyRaw(
  admin: AdminGraphql,
  id: string,
  automaticBxgyDiscount: Record<string, unknown>,
): Promise<{ errors: string[] }> {
  const result = await updateBxgy(admin, id, automaticBxgyDiscount);
  return { errors: result.errors };
}
