import { createRequestHandler } from "react-router";
import { withHyperdrivePrisma } from "../app/db.server";
import {
  applySupportChatEnvToProcess,
  type SupportChatEnv,
} from "../app/utils/supportChat.cloudflare.server";
import { verifyChatToken } from "../app/utils/supportChat.crypto.server";
import { cleanupInactiveConversations } from "../app/utils/supportChat.r2.server";
import { SupportChatRoom } from "./support-chat-room";
import {
  handleSupportChatEmail,
  type InboundEmailMessage,
} from "./support-chat-email";

export { SupportChatRoom };

type CloudflareEnv = Record<string, unknown> &
  SupportChatEnv & {
    CRON_SECRET?: string;
    HYPERDRIVE?: { connectionString?: string };
  };

type CloudflareCtx = {
  waitUntil: (promise: Promise<unknown>) => void;
};

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/** Copy Worker bindings into process.env before app modules read them. */
function applyEnvToProcess(env: CloudflareEnv) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    // Always prefer Worker secrets/vars over any stale process.env from the isolate.
    process.env[key] = value;
  }
  // Hyperdrive provides a Worker-local pooled TCP path to Postgres (direct pg times out).
  if (env.HYPERDRIVE?.connectionString) {
    process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
    process.env.CF_HYPERDRIVE = "1";
  }
  // Fallback when secret not set yet — keeps shopifyApp() from throwing on "".
  if (!process.env.SHOPIFY_APP_URL) {
    process.env.SHOPIFY_APP_URL =
      "https://offrefy.nirojannirojan68.workers.dev";
  }
  applySupportChatEnvToProcess(env);
}

async function handleSupportChatWebSocket(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (!env.SUPPORT_CHAT_ROOM) {
    return new Response("Support chat realtime unavailable", { status: 503 });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const payload = await verifyChatToken(token);
  if (!payload) {
    return new Response("Unauthorized", { status: 401 });
  }
  const id = env.SUPPORT_CHAT_ROOM.idFromName(payload.cid);
  const stub = env.SUPPORT_CHAT_ROOM.get(id);
  const doUrl = new URL("https://support-chat-room/ws");
  doUrl.searchParams.set("token", token);
  return stub.fetch(
    new Request(doUrl.toString(), {
      headers: request.headers,
      method: request.method,
    }),
  );
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: CloudflareCtx) {
    applyEnvToProcess(env);

    const url = new URL(request.url);
    // WebSocket upgrade must be handled outside React Router.
    if (
      url.pathname === "/api/support-chat/ws" ||
      url.pathname === "/api/support-chat/ws/"
    ) {
      try {
        return await handleSupportChatWebSocket(request, env);
      } catch (error) {
        console.error("[offrefy] support-chat ws failed", error);
        return new Response("WebSocket error", { status: 500 });
      }
    }

    try {
      return await withHyperdrivePrisma(() =>
        requestHandler(request, {
          cloudflare: { env, ctx },
        }),
      );
    } catch (error) {
      console.error("[offrefy] worker fetch failed", error);
      const message = error instanceof Error ? error.message : String(error);
      return new Response(
        `Worker error: ${message}\n\nSet Worker secrets: DATABASE_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL`,
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
  },

  async email(
    message: InboundEmailMessage,
    env: CloudflareEnv,
    _ctx: CloudflareCtx,
  ) {
    applyEnvToProcess(env);
    try {
      await handleSupportChatEmail(message, env);
    } catch (error) {
      console.error("[offrefy] support-chat email failed", error);
      try {
        message.setReject("Internal error");
      } catch {
        // ignore
      }
    }
  },

  async scheduled(
    _controller: unknown,
    env: CloudflareEnv,
    ctx: CloudflareCtx,
  ) {
    applyEnvToProcess(env);
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error("[offrefy] CRON_SECRET missing; skipping scheduled sync");
      return;
    }

    const request = new Request(
      "https://offrefy.nirojannirojan68.workers.dev/api/cron/scheduled-sync",
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    ctx.waitUntil(
      withHyperdrivePrisma(() =>
        requestHandler(request, {
          cloudflare: { env, ctx },
        }),
      ).catch((error) => {
        console.error("[offrefy] scheduled sync failed", error);
      }),
    );

    // 30-day inactivity cleanup for Support Chat (entire conversation).
    if (env.SUPPORT_CHAT_R2) {
      ctx.waitUntil(
        cleanupInactiveConversations(env.SUPPORT_CHAT_R2)
          .then((result) => {
            console.log("[offrefy] support-chat cleanup", result);
          })
          .catch((error) => {
            console.error("[offrefy] support-chat cleanup failed", error);
          }),
      );
    }
  },
};
