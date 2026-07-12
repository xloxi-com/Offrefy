import { handleRequest as vercelHandleRequest } from "@vercel/react-router/entry.server";
import type { AppLoadContext, EntryContext } from "react-router";
import { addDocumentResponseHeaders } from "./shopify.server";
import { ensureLocalScheduledSyncTicker } from "./services/scheduledVolumeDiscountSync.server";

ensureLocalScheduledSyncTicker();

/** Allow slow DB / tunnel; aborting the stream early can yield incomplete HTML. */
export const streamTimeout = 25000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  loadContext?: AppLoadContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  return vercelHandleRequest(
    request,
    responseStatusCode,
    responseHeaders,
    reactRouterContext,
    loadContext,
  );
}
