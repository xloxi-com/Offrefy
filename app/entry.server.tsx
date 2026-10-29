import { isbot } from "isbot";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToReadableStream } from "react-dom/server";
import { addDocumentResponseHeaders } from "./shopify.server";
import { ensureLocalScheduledSyncTicker } from "./services/scheduledVolumeDiscountSync.server";

const isCloudflareWorker =
  typeof navigator !== "undefined" &&
  navigator.userAgent === "Cloudflare-Workers";

// Local Node/Vercel only — Workers forbid timers at module scope.
if (!isCloudflareWorker) {
  ensureLocalScheduledSyncTicker();
}

/** Allow slow DB / tunnel; aborting the stream early can yield incomplete HTML. */
export const streamTimeout = 25000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  _loadContext?: AppLoadContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);

  // Workers have no Node pipeable streams — use Web Streams for CF + Node.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), streamTimeout + 1000);

  let shellErrored = false;
  try {
    const body = await renderToReadableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        signal: controller.signal,
        onError(error) {
          shellErrored = true;
          console.error(error);
          responseStatusCode = 500;
        },
      },
    );

    if (isbot(request.headers.get("user-agent") ?? "")) {
      await body.allReady;
    }

    responseHeaders.set("Content-Type", "text/html");
    return new Response(body, {
      headers: responseHeaders,
      status: shellErrored ? 500 : responseStatusCode,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
