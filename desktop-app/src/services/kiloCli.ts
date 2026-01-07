import { getProxyToken, loadProxyToken } from "./authStore";

export type KiloRunResult = { jobId: string };
export type WorkflowList = { workflows: string[] };

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

function authHeaders(): Record<string, string> {
  const t = getProxyToken();
  if (!t) return {};
  return { authorization: `Bearer ${t}`, "x-proxy-token": t };
}

async function ensureToken() {
  if (!getProxyToken()) await loadProxyToken();
}

export async function kiloRun(workspace: string, command: string): Promise<KiloRunResult> {
  await ensureToken();
  const res = await fetch(`${BASE}/api/v1/kilo/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ workspace, command }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`kiloRun failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function kiloWorkflows(): Promise<WorkflowList> {
  await ensureToken();
  const res = await fetch(`${BASE}/api/v1/kilo/workflows`, { headers: authHeaders() });
  if (!res.ok) return { workflows: [] };
  return res.json();
}

export async function kiloEvents(jobId: string, onMsg: (m: any) => void): Promise<void> {
  await ensureToken();
  const res = await fetch(`${BASE}/api/v1/kilo/jobs/${jobId}/events`, { headers: authHeaders() });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`events failed (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8");
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    while (true) {
      const idx = buf.indexOf("\n");
      if (idx < 0) break;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        onMsg(JSON.parse(line));
      } catch {
        // ignore malformed
      }
    }
  }
}
