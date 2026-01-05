type Json = Record<string, any>;

/**
 * Desktop App (P5): Minimal Control Plane client.
 *
 * This mirrors the SmartSpecWeb server proxy logic but runs locally.
 * For now it uses environment variables (or defaults) and a shared API key.
 */

const CONTROL_PLANE_URL = (import.meta as any).env?.VITE_CONTROL_PLANE_URL ?? "http://localhost:7070";
const CONTROL_PLANE_API_KEY = (import.meta as any).env?.VITE_CONTROL_PLANE_API_KEY ?? "";

let cached: { token: string; expMs: number } | null = null;

function nowMs() {
  return Date.now();
}

function decodeJwtExpMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof json.exp === "number") return json.exp * 1000;
  } catch {
    // ignore
  }
  return nowMs() + 5 * 60 * 1000;
}

async function mintToken(): Promise<string> {
  if (!CONTROL_PLANE_API_KEY) {
    throw new Error("VITE_CONTROL_PLANE_API_KEY is not configured");
  }
  const res = await fetch(`${CONTROL_PLANE_URL}/api/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey: CONTROL_PLANE_API_KEY }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mint token failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { token: string };
  cached = { token: data.token, expMs: decodeJwtExpMs(data.token) };
  return data.token;
}

async function getToken(): Promise<string> {
  if (cached && cached.expMs - nowMs() > 30_000) return cached.token;
  return mintToken();
}

export async function cpRequest<T = Json>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const url = `${CONTROL_PLANE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": (init?.headers as any)?.["content-type"] ?? "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Control Plane request failed (${res.status}): ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as any;
}

export const cp = {
  createProject: (name: string, description?: string) =>
    cpRequest("/api/v1/projects", { method: "POST", body: JSON.stringify({ name, description: description ?? null }) }),
  createSession: (projectId: string) =>
    cpRequest(`/api/v1/projects/${projectId}/sessions`, { method: "POST", body: JSON.stringify({}) }),
  listTasks: (sessionId: string) => cpRequest(`/api/v1/sessions/${sessionId}/tasks`, { method: "GET" }),
  evaluateGates: (sessionId: string) => cpRequest(`/api/v1/sessions/${sessionId}/gates/evaluate`, { method: "GET" }),
};
