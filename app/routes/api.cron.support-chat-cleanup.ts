import type { LoaderFunctionArgs } from "react-router";
import {
  getSupportChatEnv,
  requireSupportChatR2,
} from "../utils/supportChat.cloudflare.server";
import { cleanupInactiveConversations } from "../utils/supportChat.r2.server";

function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Manual / alternate cron entry for Support Chat retention.
 * Deletes entire conversations whose last message is older than 30 days.
 */
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const env = getSupportChatEnv(context);
  const r2 = requireSupportChatR2(env);
  if (!r2) {
    return Response.json(
      { ok: false, error: "SUPPORT_CHAT_R2 not bound" },
      { status: 503 },
    );
  }

  const result = await cleanupInactiveConversations(r2);
  return Response.json({ ok: true, ...result });
};
