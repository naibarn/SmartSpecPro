import { getProxyToken } from "./authStore";

type Json = Record<string, any>;

/**
 * Desktop App:
 * Control Plane access MUST go through python-backend proxy:
 *  - Never ship CONTROL_PLANE_API_KEY to the client bundle
 */
const BACKEND_URL = (import.meta as any).env?.VITE_PY_BACKEND_URL ?? "http://localhost:8000";

/**
 * Legacy query-key is risky (leaks in logs). Disabled by default.
 */
const ALLOW_LEGACY_KEY = (import.meta as any).env?.VITE_ALLOW_LEGACY_KEY === "1";
const LEGACY_KEY = (import.meta as any).env?.VITE_ORCHESTRATOR_KEY ?? "";

function authHeaders(extra?: Record<string, string>) {
  const h: Record<string, string> = { ...(extra || {}) };
  const token = getProxyToken();
  if (token) {
    h["authorization"] = `Bearer ${token}`;
    h["x-proxy-token"] = token;
  }
  return h;
}

export async function proxyRequest<T = Json>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(`${BACKEND_URL}${path.startsWith("/") ? "" : "/"}${path}`);
  if (ALLOW_LEGACY_KEY && LEGACY_KEY) url.searchParams.set("key", LEGACY_KEY);

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...authHeaders(),
      "content-type": (init?.headers as any)?.["content-type"] ?? "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend proxy failed (${res.status}): ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as any;
}

export type PresignPutResponse = { artifact: { key: string; url: string; expiresInSeconds: number; headers: Record<string, string> } };
export type PresignGetResponse = { artifact: { key: string; url: string; expiresInSeconds: number } };

export const cp = {
  createProject: (name: string, description?: string) =>
    proxyRequest("/api/v1/control-plane/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name, description: description ?? null }),
    }),

  createSession: (projectId: string, name: string) =>
    proxyRequest(`/api/v1/control-plane/api/v1/projects/${projectId}/sessions`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  createIteration: (sessionId: string, number: number) =>
    proxyRequest(`/api/v1/control-plane/api/v1/sessions/${sessionId}/iterations`, {
      method: "POST",
      body: JSON.stringify({ number }),
    }),

  getSession: (sessionId: string) =>
    proxyRequest(`/api/v1/control-plane/api/v1/sessions/${sessionId}`, { method: "GET" }),

  presignPut: (sessionId: string, iteration: number, name: string, contentType?: string) =>
    proxyRequest<PresignPutResponse>(`/api/v1/control-plane/api/v1/sessions/${sessionId}/artifacts/presign-put`, {
      method: "POST",
      body: JSON.stringify({ iteration, name, contentType: contentType ?? undefined }),
    }),

  presignGet: (sessionId: string, key: string) =>
    proxyRequest<PresignGetResponse>(
      `/api/v1/control-plane/api/v1/sessions/${sessionId}/artifacts/presign-get?` + new URLSearchParams({ key }).toString(),
      { method: "GET" }
    ),
};
