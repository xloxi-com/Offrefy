/**
 * Support Chat Durable Object — WebSocket Hibernation for near real-time updates.
 * One DO name per conversationId; clients connect with a signed token query param
 * that the Worker validates before forwarding the upgrade here.
 */

export type SupportChatRoomEnv = Record<string, unknown>;

export class SupportChatRoom {
  constructor(
    private readonly ctx: DurableObjectState,
    _env: SupportChatRoomEnv,
  ) {
    // Hibernation API: auto-restore websockets on wake.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const payload = await request.text();
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(payload);
        } catch {
          // ignore broken sockets — hibernation cleans them up
        }
      }
      return new Response("ok");
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.send(
        JSON.stringify({
          type: "ready",
          conversationIdToken: url.searchParams.get("token") ?? "",
        }),
      );
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    } catch {
      // ignore malformed client frames
    }
  }

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ) {
    // no-op — hibernation tracks attachment
  }

  async webSocketError(_ws: WebSocket, _error: unknown) {
    // no-op
  }
}
