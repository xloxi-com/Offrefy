import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import {
  getSupportChatEnv,
  requireSupportChatR2,
} from "../utils/supportChat.cloudflare.server";
import {
  loadLocalConversation,
  postLocalMerchantMessage,
} from "../utils/supportChat.local.service.server";
import {
  loadConversationForShop,
  postMerchantMessage,
} from "../utils/supportChat.service.server";
import { smtpConfigured } from "../utils/supportEmail.smtp.server";
import { imapConfigured } from "../utils/supportChat.imap.server";

const SHOP_EMAIL_QUERY = `#graphql
  query SupportChatShopEmail {
    shop {
      email
      contactEmail
    }
  }
`;

async function resolveMerchantReplyTo(
  admin: { graphql: (q: string) => Promise<Response> },
): Promise<string | null> {
  try {
    const json = await (await admin.graphql(SHOP_EMAIL_QUERY)).json();
    const shop = json?.data?.shop;
    return (
      String(shop?.contactEmail ?? "").trim() ||
      String(shop?.email ?? "").trim() ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Always return HTTP 200 JSON for chat business results.
 * Cloudflare trycloudflare tunnels replace origin 502 with a full Bad Gateway
 * HTML page, which replaces the entire embedded Shopify app iframe.
 */
function chatJson(body: Record<string, unknown>, status = 200) {
  const safeStatus = status >= 500 ? 200 : status;
  return Response.json(
    status >= 500 ? { ...body, ok: false } : body,
    {
      status: safeStatus,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/** Load conversation history (+ IMAP sync on local Node). */
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const env = getSupportChatEnv(context);

    if (requireSupportChatR2(env)) {
      const result = await loadConversationForShop(env, session.shop);
      if (!result.ok) {
        return chatJson({ ok: false, error: result.error });
      }
      return chatJson({
        ok: true,
        mode: "r2" as const,
        token: result.token,
        messages: result.messages.map((m) => ({
          id: m.id,
          role: m.role,
          body: m.body,
          createdAt: m.createdAt,
          source: m.source,
        })),
        realtime: result.realtime,
      });
    }

    // Local Node: file store + IMAP reply sync
    const local = await loadLocalConversation(session.shop);
    return chatJson({
      ok: true,
      mode: "local" as const,
      token: null,
      messages: local.messages.map((m) => ({
        id: m.id,
        role: m.role,
        body: m.body,
        createdAt: m.createdAt,
        source: m.source,
      })),
      realtime: false,
      poll: true,
      emailReady: smtpConfigured(),
      replyReady: imapConfigured(),
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[support-chat] loader failed", error);
    return chatJson({
      ok: false,
      error: "Could not load chat. Please try again.",
    });
  }
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return chatJson({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const env = getSupportChatEnv(context);

    let messageRaw: unknown = "";
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      messageRaw = body?.message;
    } else {
      const form = await request.formData();
      messageRaw = form.get("message");
    }

    const replyTo = await resolveMerchantReplyTo(admin);

    if (requireSupportChatR2(env)) {
      const result = await postMerchantMessage(env, {
        shop: session.shop,
        rawBody: messageRaw,
        merchantReplyTo: replyTo,
      });
      if (!result.ok) {
        return chatJson({ ok: false, error: result.error });
      }
      return chatJson({
        ok: true,
        mode: "r2" as const,
        token: result.token,
        message: {
          id: result.message.id,
          role: result.message.role,
          body: result.message.body,
          createdAt: result.message.createdAt,
          source: result.message.source,
        },
        delivered: true,
      });
    }

    const local = await postLocalMerchantMessage({
      shop: session.shop,
      rawBody: messageRaw,
      merchantReplyTo: replyTo,
    });
    if (!local.ok) {
      return chatJson({ ok: false, error: local.error });
    }

    return chatJson({
      ok: true,
      mode: "local" as const,
      delivered: local.delivered,
      message: {
        id: local.message.id,
        role: local.message.role,
        body: local.message.body,
        createdAt: local.message.createdAt,
        source: local.message.source,
      },
      ...(local.delivered ? {} : { warning: local.warning }),
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[support-chat] action failed", error);
    return chatJson({
      ok: false,
      error: "Could not send. Please try again.",
    });
  }
};
