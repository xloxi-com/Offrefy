/** Minimal Cloudflare Worker / Durable Object globals used by Support Chat. */

interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  setWebSocketAutoResponse(pair: WebSocketRequestResponsePair): void;
}

declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string);
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface ResponseInit {
  webSocket?: WebSocket;
}
