export type MediaEvent =
  | { sessionId: string; type: "image"; title?: string; url: string; mime?: string; meta?: any; artifactKey?: string }
  | { sessionId: string; type: "video"; title?: string; url: string; mime?: string; meta?: any; artifactKey?: string }
  | { sessionId: string; type: "file"; title?: string; url: string; mime?: string; meta?: any; artifactKey?: string };

export type MediaMessage =
  | { type: "event"; seq: number; event: MediaEvent }
  | { type: "status"; mediaSeq: number }
  | { type: "ack"; seq: number }
  | { type: "error"; message: string };

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";
const KEY = import.meta.env.VITE_ORCHESTRATOR_KEY || "";

export function openMediaWs(): WebSocket {
  const url = new URL(`${BASE.replace(/^http/, "ws")}/api/v1/kilo/media/ws`);
  if (KEY) url.searchParams.set("key", KEY);
  return new WebSocket(url.toString());
}

export function mediaAttach(ws: WebSocket, sessionId: string, fromSeq = 0) {
  ws.send(JSON.stringify({ type: "attach", sessionId, from: fromSeq }));
}

export function mediaEmit(ws: WebSocket, event: MediaEvent) {
  ws.send(JSON.stringify({ type: "emit", event }));
}
