import { getProxyToken, loadProxyToken } from "./authStore";

export type KiloRunResult = { jobId: string };

export type WorkflowArgType = "string" | "enum";

export interface WorkflowArgSchema {
  name: string;
  type: WorkflowArgType;
  values?: string[];
  required?: boolean;
}

export interface WorkflowSchema {
  name: string;
  description?: string;
  example?: string;
  args?: WorkflowArgSchema[];
}

export type WorkflowList = {
  workflows: string[];
  schemas?: WorkflowSchema[];
};

export type StreamMessage = {
  type: "stdout" | "done" | "error" | string;
  seq: number;
  line?: string;
  status?: string;
  returncode?: number;
  message?: string;
};

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

export async function kiloListWorkflows(workspace: string): Promise<WorkflowList> {
  await ensureToken();
  const url = new URL(`${BASE}/api/v1/kilo/workflows`);
  if (workspace) {
    url.searchParams.set("workspace", workspace);
  }

  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    return { workflows: [] };
  }
  const data = await res.json();
  if (!data.workflows) {
    data.workflows = [];
  }
  return data as WorkflowList;
}

// Backwards compatible alias used by older code paths.
export const kiloWorkflows = kiloListWorkflows;

export async function kiloStreamNdjson(
  jobId: string,
  from: number,
  onMsg: (m: StreamMessage) => void,
  signal?: AbortSignal
): Promise<void> {
  await ensureToken();
  const url = new URL(`${BASE}/api/v1/kilo/jobs/${encodeURIComponent(jobId)}/events`);
  if (from && from > 0) {
    url.searchParams.set("from", String(from));
  }

  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`events failed (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buf.indexOf("\n");
      if (idx < 0) break;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        onMsg(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }
  }
}

export async function kiloCancel(jobId: string): Promise<void> {
  await ensureToken();
  const res = await fetch(`${BASE}/api/v1/kilo/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`kiloCancel failed (${res.status}): ${text}`);
  }
}

export async function kiloSendInput(jobId: string, text: string): Promise<void> {
  await ensureToken();
  const res = await fetch(`${BASE}/api/v1/kilo/jobs/${encodeURIComponent(jobId)}/input`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`kiloSendInput failed (${res.status}): ${t}`);
  }
}
