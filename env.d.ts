/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL?: string;
    DIRECT_URL?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    CRON_SECRET?: string;
    SUPPORT_CHAT_HMAC_SECRET?: string;
    SUPPORT_CHAT_REPLY_DOMAIN?: string;
    SUPPORT_CHAT_DATA_DIR?: string;
    SUPPORT_EMAIL?: string;
    SUPPORT_SMTP_HOST?: string;
    SUPPORT_SMTP_PORT?: string;
    SUPPORT_SMTP_USER?: string;
    SUPPORT_SMTP_PASS?: string;
    SUPPORT_SMTP_FROM?: string;
    SUPPORT_IMAP_HOST?: string;
    SUPPORT_IMAP_PORT?: string;
    SUPPORT_IMAP_USER?: string;
    SUPPORT_IMAP_PASS?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
  }
}

declare module "virtual:react-router/server-build" {
  import type { ServerBuild } from "react-router";
  const build: ServerBuild;
  export default build;
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare?: {
      env?: import("./app/utils/supportChat.cloudflare.server").SupportChatEnv &
        Record<string, unknown>;
      ctx?: { waitUntil(promise: Promise<unknown>): void };
    };
  }
}
