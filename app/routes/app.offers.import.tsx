import type { Prisma } from "@prisma/client";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { prisma } from "../db.server";
import { syncVolumeDiscountShop } from "../services/volumeDiscountFunctionSync.server";
import { authenticate } from "../shopify.server";
import {
  csvRecordGet,
  csvRowsToRecords,
  parseCsv,
  parseVolumeDiscountFormFromCsvRecord,
} from "../utils/volumeDiscountCsv.server";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";

const SYNC_RETRY_ATTEMPTS = 3;
const SYNC_RETRY_BASE_MS = 500;

async function syncVolumeDiscountShopWithRetry(
  admin: Parameters<typeof syncVolumeDiscountShop>[0],
  shop: string,
): Promise<{ errors: string[] }> {
  let lastErrors: string[] = [];
  for (let i = 0; i < SYNC_RETRY_ATTEMPTS; i++) {
    const { errors } = await syncVolumeDiscountShop(admin, shop);
    if (errors.length === 0) return { errors: [] };
    lastErrors = errors;
    if (i < SYNC_RETRY_ATTEMPTS - 1) {
      await new Promise((r) =>
        setTimeout(r, SYNC_RETRY_BASE_MS * (i + 1)),
      );
    }
  }
  return { errors: lastErrors };
}

function formFlag(value: FormDataEntryValue | null): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

export type OffersImportActionData =
  | {
      ok: true;
      imported: number;
      updated: number;
      skipped: number;
      errors: { row: number; message: string }[];
      /** Present when rows requested `active` but Shopify sync failed after retries. */
      activationNotice?: string;
    }
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  return redirect(adminEmbeddedPath("/app", url.search));
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<OffersImportActionData> => {
  const { admin, session } = await authenticate.admin(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, error: "Could not read the upload (try again)" };
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a CSV file to import" };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "File is too large (max 5 MB)" };
  }

  const overwriteCampaign = formFlag(form.get("overwriteCampaign"));

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "Could not read the uploaded file" };
  }

  const table = parseCsv(text);
  const records = csvRowsToRecords(table);
  if (records.length === 0) {
    return { ok: false, error: "No data rows found in the CSV" };
  }

  const existingRows = await prisma.volumeDiscountCampaign.findMany({
    where: { shop: session.shop },
    select: { id: true, campaignName: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  /** Most recently updated offer per campaign name (shop-wide). */
  const idByCampaignName = new Map<string, string>();
  for (const row of existingRows) {
    if (!idByCampaignName.has(row.campaignName)) {
      idByCampaignName.set(row.campaignName, row.id);
    }
  }

  const errors: { row: number; message: string }[] = [];
  const createdIds: string[] = [];
  const updatedIds: string[] = [];
  let skipped = 0;
  const activateIds = new Set<string>();

  const IMPORT_CREATE_BATCH = 8;

  async function importOneRecord(
    rec: Record<string, string>,
    rowNum: number,
  ): Promise<void> {
    if (!csvRecordGet(rec, "campaignName").trim()) {
      errors.push({ row: rowNum, message: "Missing campaign name" });
      return;
    }

    const parsed = parseVolumeDiscountFormFromCsvRecord(rec);
    if (!parsed.ok) {
      errors.push({ row: rowNum, message: parsed.error });
      return;
    }

    const d = parsed.data;
    const wantsActive = d.campaignStatus === "active";
    const name = d.campaignName.trim();
    const existingId = idByCampaignName.get(name);

    const rowData = {
      campaignName: d.campaignName,
      displayName: d.displayName || null,
      status: wantsActive ? "active" : "draft",
      productScope: d.productScope,
      quantityCondition: d.quantityCondition,
      customerType: d.customerType,
      customerTags: d.customerTags,
      productIds: d.productIds,
      collectionIds: d.collectionIds,
      tiers: d.tiers,
      widgetDisplay: d.widgetDisplay as unknown as Prisma.InputJsonValue,
      countdownStartsAt: d.countdownStartsAt,
      countdownEndsAt: d.countdownEndsAt,
    };

    if (existingId && !overwriteCampaign) {
      skipped += 1;
      return;
    }

    if (existingId && overwriteCampaign) {
      await prisma.volumeDiscountCampaign.update({
        where: { id: existingId, shop: session.shop },
        data: rowData,
      });
      updatedIds.push(existingId);
      if (wantsActive) {
        activateIds.add(existingId);
      } else {
        activateIds.delete(existingId);
      }
      return;
    }

    const record = await prisma.volumeDiscountCampaign.create({
      data: {
        shop: session.shop,
        ...rowData,
        shopifyDiscountIds: [],
      } as Prisma.VolumeDiscountCampaignUncheckedCreateInput,
    });
    createdIds.push(record.id);
    idByCampaignName.set(name, record.id);
    if (wantsActive) {
      activateIds.add(record.id);
    }
  }

  for (let i = 0; i < records.length; i += IMPORT_CREATE_BATCH) {
    const chunk = records.slice(i, i + IMPORT_CREATE_BATCH);
    await Promise.all(
      chunk.map((rec, j) => importOneRecord(rec, i + j + 2)),
    );
  }

  let activationNotice: string | undefined;
  if (activateIds.size > 0 || updatedIds.length > 0) {
    const { errors: syncErrors } = await syncVolumeDiscountShopWithRetry(
      admin,
      session.shop,
    );
    if (syncErrors.length) {
      activationNotice =
        activateIds.size > 0
          ? `Offers are marked active in the app, but Shopify could not update the automatic discount after ${SYNC_RETRY_ATTEMPTS} tries: ${syncErrors.join(" ")}. Use Bulk actions → Activate on those offers to retry, or check that the Volume Discount function is deployed.`
          : `Offers updated, but Shopify sync failed: ${syncErrors.join(" ")}. Use Sync all to retry.`;
    }
  }

  return {
    ok: true,
    imported: createdIds.length,
    updated: updatedIds.length,
    skipped,
    errors,
    ...(activationNotice ? { activationNotice } : {}),
  };
};

export default function OffersImportStub() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
