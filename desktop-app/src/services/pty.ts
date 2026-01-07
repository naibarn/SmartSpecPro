export type PtyMessage =
  | { type: "created"; sessionId: string }
  | { type: "stdout"; seq: number; data: string }
  | { type: "status"; status: string; returncode: number | null; seq: number }
  | { type: "ack"; ok: boolean }
  | { type: "error"; message: string };

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

export function openPtyWs(ticket: string): WebSocket {
  const url = new URL(`${BASE.replace(/^http/, "ws")}/api/v1/kilo/pty/ws`);
  url.searchParams.set("ticket", ticket);
  return new WebSocket(url.toString());
}

export function ptyCreate(ws: WebSocket, workspace: string, command: string) {
  ws.send(JSON.stringify({ type: "create", workspace, command }));
}

export function ptyAttach(ws: WebSocket, sessionId: string, fromSeq = 0) {
  ws.send(JSON.stringify({ type: "attach", sessionId, from: fromSeq }));
}

export function ptyInput(ws: WebSocket, data: string) {
  ws.send(JSON.stringify({ type: "input", data }));
}

export function ptySignal(ws: WebSocket, name: string) {
  ws.send(JSON.stringify({ type: "signal", name }));
}

export function ptyCancel(ws: WebSocket) {
  ws.send(JSON.stringify({ type: "cancel" }));
}

export function ptyPoll(ws: WebSocket) {
  ws.send(JSON.stringify({ type: "poll" }));
}
