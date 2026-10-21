import { forwardApplicationHttpBridge, resolveApplicationHttpStub, type ApplicationHttpBindings } from "./applicationHttpBridge";

export const APPLICATION_HTTP_CANARY_PREFIX = "/_ops/application-canary/";
async function sameToken(actual: string | null, expected: string | undefined) {
  if (!actual || !expected || actual.length > 4096 || expected.length < 32 || expected.length > 4096) return false;
  const hash = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [left, right] = await Promise.all([hash(actual), hash(expected)]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0; for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
/** Fixed read-only migration probes, protected by a distinct immutable canary
 * capability. It neither accepts URLs/commands nor elevates app user identity.
 * VM count/lifetime/idle budgets remain enforced by the named DO controller. */
export async function handleApplicationHttpCanary(request: Request, env: ApplicationHttpBindings): Promise<Response> {
  const url = new URL(request.url), route = url.pathname.slice(APPLICATION_HTTP_CANARY_PREFIX.length);
  const hidden = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  if (!url.pathname.startsWith(APPLICATION_HTTP_CANARY_PREFIX) || env.CLOUDFLARE_ENVIRONMENT !== "staging" ||
      !await sameToken(request.headers.get("x-smartaihub-application-canary-token"), env.CLOUDFLARE_APPLICATION_CANARY_TOKEN)) return hidden();
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET", "cache-control": "no-store" } });
  if (url.search || request.headers.has("upgrade")) return hidden();
  if (route === "node/status" || route === "python/status") {
    try {
      const stub = resolveApplicationHttpStub(route === "node/status" ? "node-http" : "python-http", env);
      if (!stub.diagnostics) throw new Error("APPLICATION_HTTP_DIAGNOSTICS_REQUIRED");
      return Response.json(await stub.diagnostics(), { headers: { "cache-control": "no-store" } });
    } catch {
      return Response.json({ error: "APPLICATION_HTTP_DIAGNOSTICS_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  const paths: Record<string, { runtime: "node-http" | "python-http"; path: string }> = {
    "node/health": { runtime: "node-http", path: "/healthz" },
    "node/auth": { runtime: "node-http", path: "/trpc/auth.me" },
    "python/health": { runtime: "python-http", path: "/health/live" },
    "python/database": { runtime: "python-http", path: "/health" },
    "python/auth": { runtime: "python-http", path: "/api/users/me" },
  };
  const selected = paths[route]; if (!selected) return hidden();
  // Public request headers cannot acquire service/edge trust. Only the actual
  // app session or bearer credential supplied by the operator is retained.
  const headers = new Headers({ accept: "application/json" });
  for (const name of ["authorization", "cookie", "user-agent"]) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  const host = selected.runtime === "node-http" ? "node.application.internal" : "python.application.internal";
  try {
    const result = await forwardApplicationHttpBridge(new Request(`http://${host}${selected.path}`, { headers, signal: request.signal }), selected.runtime, env);
    const responseHeaders = new Headers(result.headers);
    responseHeaders.set("cache-control", "no-store"); responseHeaders.delete("set-cookie");
    return new Response(result.body, { status: result.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "APPLICATION_HTTP_CANARY_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
