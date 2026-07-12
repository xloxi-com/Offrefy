import type { LoaderFunctionArgs } from "react-router";
import { enqueueOrderAnalyticsReconcileForAllShops } from "../services/orderAnalyticsReconcile.server";
import { runDueScheduledSyncs } from "../services/scheduledVolumeDiscountSync.server";
function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDueScheduledSyncs();
  enqueueOrderAnalyticsReconcileForAllShops();
  return Response.json({ ok: true, ...result });};
