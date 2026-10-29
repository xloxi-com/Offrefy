import { createRequestHandler } from "react-router";

type CloudflareEnv = {
  CRON_SECRET?: string;
};

type CloudflareCtx = {
  waitUntil: (promise: Promise<unknown>) => void;
};

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: CloudflareCtx,
  ) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  async scheduled(
    _controller: unknown,
    env: CloudflareEnv,
    ctx: CloudflareCtx,
  ) {
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error("[offrefy] CRON_SECRET missing; skipping scheduled sync");
      return;
    }
    const request = new Request(
      "https://offrefy.internal/api/cron/scheduled-sync",
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    ctx.waitUntil(
      requestHandler(request, {
        cloudflare: { env, ctx },
      }),
    );
  },
};
