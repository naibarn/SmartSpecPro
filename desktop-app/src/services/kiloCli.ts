export type KiloRunResult = { jobId: string };
export type WorkflowList = { workflows: string[] };

const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";
const KEY = import.meta.env.VITE_ORCHESTRATOR_KEY || ""; // optional (recommended)

function headers(): Record<string, string> {
  const h: Record<string, string> = {};
  if (KEY) h["x-orchestrator-key"] = KEY;
  return h;
}

export async function kiloRun(workspace: string, command: string): Promise<KiloRunResult> {
  const res = await fetch(`${BASE}/api/v1/kilo/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({ workspace, command }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function kiloCancel(jobId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/v1/kilo/cancel/${jobId}`, { method: "POST", headers: headers() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function kiloSendInput(jobId: string, text: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/v1/kilo/input/${jobId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function kiloListWorkflows(workspace: string): Promise<WorkflowList> {
  const url = new URL(`${BASE}/api/v1/kilo/workflows`);
  url.searchParams.set("workspace", workspace);
  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type StreamMessage =
  | { type: "stdout"; seq: number; line: string }
  | { type: "done"; status: string; returncode: number | null; lastSeq?: number };

export async function kiloStreamNdjson(jobId: string, fromSeq: number, onMsg: (m: StreamMessage) => void, signal?: AbortSignal) {
  const url = new URL(`${BASE}/api/v1/kilo/stream/${jobId}`);
  url.searchParams.set("from", String(fromSeq));

  const res = await fetch(url.toString(), { headers: headers(), signal });
  if (!res.ok || !res.body) throw new Error(await res.text());

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
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
        // ignore malformed
      }
    }
  }
}
