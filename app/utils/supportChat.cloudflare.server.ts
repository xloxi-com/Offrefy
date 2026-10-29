import type { AppLoadContext } from "react-router";

/** Minimal R2 surface used by Support Chat (avoids hard dependency on generated Env). */
export type SupportChatR2Bucket = {
  get(key: string): Promise<{
    text(): Promise<string>;
    json<T>(): Promise<T>;
  } | null>;
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    objects: Array<{ key: string; uploaded?: Date }>;
    truncated: boolean;
    cursor?: string;
  }>;
};

export type SupportChatDurableObjectStub = {
  fetch(request: Request): Promise<Response>;
};

export type SupportChatDurableObjectNamespace = {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): SupportChatDurableObjectStub;
};

export type SupportChatEnv = {
  SUPPORT_CHAT_R2?: SupportChatR2Bucket;
  SUPPORT_CHAT_ROOM?: SupportChatDurableObjectNamespace;
  SUPPORT_CHAT_HMAC_SECRET?: string;
  SUPPORT_CHAT_REPLY_DOMAIN?: string;
  SUPPORT_EMAIL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  CRON_SECRET?: string;
  SHOPIFY_API_SECRET?: string;
  SHOPIFY_APP_URL?: string;
};

export function getSupportChatEnv(
  context?: AppLoadContext | { cloudflare?: { env?: SupportChatEnv } },
): SupportChatEnv {
  const fromContext = (
    context as { cloudflare?: { env?: SupportChatEnv } } | undefined
  )?.cloudflare?.env;
  if (fromContext) return fromContext;
  return {};
}

export function requireSupportChatR2(
  env: SupportChatEnv,
): SupportChatR2Bucket | null {
  return env.SUPPORT_CHAT_R2 ?? null;
}

export function getReplyDomain(env: SupportChatEnv): string {
  return (
    (env.SUPPORT_CHAT_REPLY_DOMAIN ?? process.env.SUPPORT_CHAT_REPLY_DOMAIN ?? "")
      .trim()
      .toLowerCase() || "chat-replies.xloxi.com"
  );
}

export function getSupportInbox(env: SupportChatEnv): string {
  return (
    (env.SUPPORT_EMAIL ?? process.env.SUPPORT_EMAIL ?? "").trim().toLowerCase() ||
    "info@xloxi.com"
  );
}

/** Apply Worker string bindings into process.env for crypto / email helpers. */
export function applySupportChatEnvToProcess(env: SupportChatEnv) {
  const keys = [
    "SUPPORT_CHAT_HMAC_SECRET",
    "SUPPORT_CHAT_REPLY_DOMAIN",
    "SUPPORT_EMAIL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_URL",
    "CRON_SECRET",
  ] as const;
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) {
      process.env[key] = value;
    }
  }
}
