/** Shared Support Chat message shape stored in R2 (one JSON object per file). */

export type SupportChatRole = "merchant" | "agent" | "system";

export type SupportChatMessage = {
  id: string;
  conversationId: string;
  shop: string;
  role: SupportChatRole;
  body: string;
  createdAt: string;
  /** Email Message-ID when the message came from inbound email. */
  emailMessageId?: string;
  /** Origin of the write. */
  source: "admin" | "email" | "system";
};

export type SupportChatMeta = {
  conversationId: string;
  shop: string;
  createdAt: string;
  /** Updated on every message — retention is 30 days after this. */
  lastMessageAt: string;
  messageCount: number;
};

export type SupportChatWsClientMessage =
  | { type: "ping" }
  | { type: "subscribe" };

export type SupportChatWsServerMessage =
  | { type: "pong" }
  | { type: "ready"; conversationIdToken: string }
  | { type: "message"; message: SupportChatMessage }
  | { type: "error"; error: string };
