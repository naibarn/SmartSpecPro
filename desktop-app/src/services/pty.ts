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

export function ptyKill(ws: WebSocket) {
  ws.send(JSON.stringify({ type: "kill" }));
}

export function ptyPoll(ws: WebSocket) {
  ws.send(JSON.stringify({ type: "poll" }));
}

export function ptyResize(ws: WebSocket, rows: number, cols: number) {
  ws.send(JSON.stringify({ type: "resize", rows, cols }));
}

// REST API for session management
export async function listPtySessions(): Promise<{ sessions: Array<{
  session_id: string;
  workspace: string;
  command: string;
  status: string;
  created_at: number;
  returncode: number | null;
}> }> {
  const res = await fetch(`${BASE}/api/v1/kilo/pty/sessions`);
  if (!res.ok) {
    throw new Error(`Failed to list sessions: ${res.status}`);
  }
  return res.json();
}

export async function cleanupPtySession(sessionId: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/api/v1/kilo/pty/sessions/${sessionId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to cleanup session: ${res.status}`);
  }
  return res.json();
}
