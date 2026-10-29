import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFetcher, useLocation } from "react-router";

import { useAdminI18n } from "./AdminI18nProvider";
import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import { SUPPORT_EMAIL } from "../utils/supportEmail";

type UiRole = "system" | "user" | "agent" | "status";

type ChatMessage = {
  id: string;
  role: UiRole;
  text: string;
  createdAt?: string;
};

type ApiMessage = {
  id: string;
  role: "merchant" | "agent" | "system";
  body: string;
  createdAt: string;
  source?: string;
};

type SupportChatLoaderData =
  | {
      ok: true;
      mode: "r2" | "local" | "email-only";
      token: string | null;
      messages: ApiMessage[];
      realtime: boolean;
      poll?: boolean;
      emailReady?: boolean;
      replyReady?: boolean;
    }
  | { ok: false; error?: string };

type SupportChatActionData =
  | {
      ok: true;
      mode?: "r2" | "local" | "email-only";
      token?: string;
      message?: ApiMessage;
      delivered?: boolean;
      warning?: string;
    }
  | { ok: false; error?: string };

const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 420;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapApiMessage(m: ApiMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role === "merchant" ? "user" : m.role === "agent" ? "agent" : "system",
    text: m.body,
    createdAt: m.createdAt,
  };
}

function wsUrlForToken(token: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/support-chat/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Bottom-right support chat for the Offrefy admin shell.
 * Persists to R2 (Cloudflare) with email reply routing + WebSocket updates when configured;
 * falls back to email-only on local Node without R2 bindings.
 */
export function SupportEmailChat() {
  const { t } = useAdminI18n();
  const { search } = useLocation();
  const chatAction = adminEmbeddedPath("/app/support-chat", search);
  const fetcher = useFetcher<SupportChatActionData>();
  const historyFetcher = useFetcher<SupportChatLoaderData>();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [realtime, setRealtime] = useState(false);
  const [mode, setMode] = useState<"r2" | "local" | "email-only" | null>(null);
  const [shouldPoll, setShouldPoll] = useState(false);
  const [connected, setConnected] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const historyLoadedRef = useRef(false);
  const titleId = useId();
  const sending = fetcher.state !== "idle";

  const close = useCallback(() => setOpen(false), []);

  const upsertMessage = useCallback((msg: ChatMessage) => {
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Load history when panel opens (keep shop/host for authenticate.admin).
  useEffect(() => {
    if (!open) return;
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    historyFetcher.load(chatAction);
  }, [open, historyFetcher, chatAction]);

  useEffect(() => {
    if (!open) {
      historyLoadedRef.current = false;
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    }
  }, [open]);

  useEffect(() => {
    const data = historyFetcher.data;
    if (!data || historyFetcher.state !== "idle") return;
    if (!data.ok) {
      setMessages([
        {
          id: newId(),
          role: "status",
          text: data.error || t("supportChat.sendFailed"),
        },
      ]);
      return;
    }

    setMode(data.mode);
    setRealtime(Boolean(data.realtime));
    setShouldPoll(Boolean(data.poll) || data.mode === "local");
    if (data.token) setToken(data.token);

    const welcomeText =
      data.mode === "local" && data.emailReady === false
        ? t("supportChat.smtpRequired", { email: SUPPORT_EMAIL })
        : data.mode === "r2" || data.mode === "local"
          ? t("supportChat.welcomeThread", { email: SUPPORT_EMAIL })
          : t("supportChat.welcome", { email: SUPPORT_EMAIL });
    const welcome: ChatMessage = {
      id: "welcome",
      role: "system",
      text: welcomeText,
    };

    const mapped = (data.messages ?? []).map(mapApiMessage);
    // Merge poll results without wiping optimistic bubbles.
    setMessages((prev) => {
      const nextSeen = new Set<string>(["welcome"]);
      const next: ChatMessage[] = [welcome];
      for (const m of mapped) {
        nextSeen.add(m.id);
        next.push(m);
      }
      // Keep any optimistic user bubbles not yet confirmed by server.
      for (const m of prev) {
        if (m.role === "user" && !nextSeen.has(m.id) && !mapped.some((x) => x.text === m.text)) {
          next.push(m);
          nextSeen.add(m.id);
        }
      }
      seenIdsRef.current = nextSeen;
      return next;
    });
  }, [historyFetcher.data, historyFetcher.state, t]);

  // Poll for email replies (IMAP → local store) when WebSockets are unavailable.
  useEffect(() => {
    if (!open || !shouldPoll || realtime) return;
    const tick = () => {
      if (historyFetcher.state !== "idle") return;
      historyFetcher.load(chatAction);
    };
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [open, shouldPoll, realtime, historyFetcher, chatAction]);

  // WebSocket for near real-time agent replies.
  useEffect(() => {
    if (!open || !token || !realtime) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      try {
        const ws = new WebSocket(wsUrlForToken(token));
        wsRef.current = ws;
        ws.onopen = () => {
          attempt = 0;
          setConnected(true);
          ws.send(JSON.stringify({ type: "subscribe" }));
        };
        ws.onclose = () => {
          setConnected(false);
          if (cancelled) return;
          attempt += 1;
          const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 4));
          retryTimer = window.setTimeout(connect, delay);
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch {
            // ignore
          }
        };
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as {
              type?: string;
              message?: ApiMessage;
            };
            if (payload.type === "message" && payload.message) {
              upsertMessage(mapApiMessage(payload.message));
            }
          } catch {
            // ignore
          }
        };
      } catch {
        // WS unavailable (e.g. local Node) — polling not required; reopen reloads history.
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [open, token, realtime, upsertMessage]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !pendingUserId || !fetcher.data) return;

    if (fetcher.data.ok) {
      if (fetcher.data.token) setToken(fetcher.data.token);
      if (fetcher.data.message) {
        const mapped = mapApiMessage(fetcher.data.message);
        seenIdsRef.current.delete(pendingUserId);
        if (seenIdsRef.current.has(mapped.id)) {
          // Already arrived via WebSocket — drop optimistic bubble only.
          setMessages((prev) => prev.filter((m) => m.id !== pendingUserId));
        } else {
          seenIdsRef.current.add(mapped.id);
          setMessages((prev) =>
            prev.map((m) => (m.id === pendingUserId ? mapped : m)),
          );
        }
      }
      if (
        fetcher.data.mode === "email-only" ||
        fetcher.data.mode === "local" ||
        mode === "email-only" ||
        mode === "local"
      ) {
        const delivered = fetcher.data.delivered !== false;
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "status",
            text: delivered
              ? t("supportChat.sent")
              : fetcher.data.warning || t("supportChat.sentLocal"),
          },
        ]);
      }
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "status",
          text: fetcher.data.error || t("supportChat.sendFailed"),
        },
      ]);
    }
    setPendingUserId(null);
  }, [fetcher.data, fetcher.state, pendingUserId, t, mode]);

  const sendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text || sending) return;

    const userId = newId();
    seenIdsRef.current.add(userId);
    setMessages((prev) => [...prev, { id: userId, role: "user", text }]);
    setDraft("");
    setPendingUserId(userId);
    const fd = new FormData();
    fd.set("message", text);
    fetcher.submit(fd, {
      method: "POST",
      action: chatAction,
    });
  }, [draft, fetcher, sending, chatAction]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 1000,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          style={{
            position: "absolute",
            right: 0,
            bottom: 64,
            width: PANEL_WIDTH,
            maxWidth: "calc(100vw - 40px)",
            height: PANEL_HEIGHT,
            maxHeight: "min(70vh, 480px)",
            background: "#ffffff",
            border: "1px solid #e3e3e3",
            borderRadius: 12,
            boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              padding: "12px 14px",
              borderBottom: "1px solid #ebebeb",
              background: "#fafafa",
            }}
          >
            <div>
              <strong id={titleId} style={{ fontSize: 14, color: "#202223" }}>
                {t("supportChat.title")}
              </strong>
              <div style={{ fontSize: 11, color: "#6d7175", marginTop: 2 }}>
                {SUPPORT_EMAIL}
                {realtime ? (
                  <span style={{ marginLeft: 8 }}>
                    {connected
                      ? t("supportChat.live")
                      : t("supportChat.reconnecting")}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("supportChat.close")}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#6d7175",
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "#f6f6f7",
            }}
          >
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const isAgent = msg.role === "agent";
              const isStatus = msg.role === "status";
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    background: isUser
                      ? "#202223"
                      : isAgent
                        ? "#eef6ff"
                        : isStatus
                          ? "transparent"
                          : "#ffffff",
                    color: isUser
                      ? "#ffffff"
                      : isStatus
                        ? "#6d7175"
                        : "#202223",
                    border: isStatus
                      ? "none"
                      : isAgent
                        ? "1px solid #cce0f5"
                        : "1px solid #e3e3e3",
                    borderRadius: isUser
                      ? "12px 12px 4px 12px"
                      : "12px 12px 12px 4px",
                    padding: isStatus ? "2px 4px" : "8px 10px",
                    fontSize: isStatus ? 12 : 13,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {isAgent ? (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#2c6ecb",
                        marginBottom: 4,
                      }}
                    >
                      {t("supportChat.agentLabel")}
                    </div>
                  ) : null}
                  {msg.text}
                </div>
              );
            })}
            {sending ? (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 12,
                  color: "#6d7175",
                  padding: "2px 4px",
                }}
              >
                {t("supportChat.sending")}
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            style={{
              display: "flex",
              gap: 8,
              padding: 10,
              borderTop: "1px solid #ebebeb",
              background: "#ffffff",
            }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              placeholder={t("supportChat.placeholder")}
              disabled={sending}
              maxLength={4000}
              style={{
                flex: 1,
                resize: "none",
                border: "1px solid #c9cccf",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "inherit",
                lineHeight: 1.35,
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              style={{
                alignSelf: "flex-end",
                border: "none",
                borderRadius: 8,
                background:
                  sending || !draft.trim() ? "#8c9196" : "#202223",
                color: "#ffffff",
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  sending || !draft.trim() ? "not-allowed" : "pointer",
              }}
            >
              {t("supportChat.send")}
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-label={t("supportChat.open")}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          background: "#202223",
          color: "#ffffff",
          boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-3.8 3.2c-.55.46-1.4.07-1.4-.66V6.5Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path
            d="M8 9.25h8M8 12.25h5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
