import { getProxyToken, loadProxyToken } from "./authStore";

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

export type WsChannel = "pty" | "media";
export type WsTicketResponse = { ticket: string; expires_at: number; ttl_seconds: number };

function authHeaders(): Record<string, string> {
  const t = getProxyToken();
  if (!t) return {};
  return { authorization: `Bearer ${t}`, "x-proxy-token": t };
}

export async function createWsTicket(channel: WsChannel, ttlSeconds = 60): Promise<WsTicketResponse> {
  if (!getProxyToken()) {
    await loadProxyToken();
  }

  const res = await fetch(`${BASE}/api/v1/kilo/ws-ticket`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ channel, ttl_seconds: ttlSeconds }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ws-ticket failed (${res.status}): ${text}`);
  }
  return res.json();
}
