import { forwardApplicationHttpBridge, resolveApplicationHttpStub, type ApplicationHttpBindings } from "./applicationHttpBridge";

export const APPLICATION_HTTP_CANARY_PREFIX = "/_ops/application-canary/";
export async function sameToken(actual: string | null, expected: string | undefined) {
  if (!actual || !expected || actual.length > 4096 || expected.length < 32 || expected.length > 4096) return false;
  const hash = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [left, right] = await Promise.all([hash(actual), hash(expected)]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0; for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

type SyntheticCredentials = { email: string; password: string; tenantId: string; userId: number };
function trpcResult(value: any) {
  const data = value?.result?.data;
  return data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "json") ? data.json : data ?? null;
}
function trpcCode(value: any) { return value?.error?.data?.code ?? value?.error?.json?.data?.code ?? null; }
async function sessionJtiHash(cookie: string | null) {
  const token = cookie?.slice(cookie.indexOf("=") + 1), payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const encoded = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(encoded));
    if (typeof claims.jti !== "string" || !claims.jti || claims.jti.length > 512) return null;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(claims.jti));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

/** One exact, fixed application acceptance sequence. Credentials are sent only
 * over the private Worker-to-Container bridge and never appear in its receipt.
 * No user-selected URL/path or mutating application API is accepted. */
async function runNodeSessionAcceptance(request: Request, env: ApplicationHttpBindings) {
  let input: any;
  try {
    if (Number(request.headers.get("content-length") ?? "0") > 4096) throw Error();
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 4096) throw Error();
    input = JSON.parse(body);
  } catch { return Response.json({ error: "APPLICATION_HTTP_ACCEPTANCE_INPUT_INVALID" }, { status: 400 }); }
  const validUser = (value: any): value is SyntheticCredentials => value && typeof value.email === "string" &&
    /^[^\s@]{1,120}@[^\s@]{1,120}$/.test(value.email) && typeof value.password === "string" &&
    value.password.length >= 12 && value.password.length <= 128 && typeof value.tenantId === "string" &&
    /^[A-Za-z0-9_.-]{1,36}$/.test(value.tenantId) && Number.isSafeInteger(value.userId) && value.userId > 0;
  if (!input || Object.keys(input).sort().join(",") !== "foreignTenantId,primary,version" || input.version !== "application-auth-acceptance-v1" ||
      !validUser(input.primary) || typeof input.foreignTenantId !== "string" || !/^[A-Za-z0-9_.-]{1,36}$/.test(input.foreignTenantId) ||
      input.primary.tenantId === input.foreignTenantId) return Response.json({ error: "APPLICATION_HTTP_ACCEPTANCE_SCOPE_INVALID" }, { status: 400 });

  const call = async (path: string, method = "GET", body?: unknown, cookie?: string, bearer?: string, runtime: "node-http" | "python-http" = "node-http") => {
    const headers = new Headers({ accept: "application/json" });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (cookie) headers.set("cookie", cookie);
    if (bearer) headers.set("authorization", `Bearer ${bearer}`);
    const host = runtime === "node-http" ? "node.application.internal" : "python.application.internal";
    const response = await forwardApplicationHttpBridge(new Request(`http://${host}${path}`, {
      method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: request.signal,
    }), runtime, env);
    let json: any = null; try { json = await response.json(); } catch { /* sanitized by the summary below */ }
    const setCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()[0] ?? response.headers.get("set-cookie");
    const match = setCookie?.match(/^([^=;]+)=([^;]*)/);
    return { status: response.status, json, cookie: match && match[2] ? `${match[1]}=${match[2]}` : null };
  };
  const query = (path: string, value: unknown) => `${path}?input=${encodeURIComponent(JSON.stringify({ json: value }))}`;
  const invalid = await call("/trpc/auth.login", "POST", { json: { email: input.primary.email, password: `${input.primary.password}x` } });
  const loginA = await call("/trpc/auth.login", "POST", { json: { email: input.primary.email, password: input.primary.password } });
  const cookieA = loginA.cookie;
  const meA = cookieA ? await call("/trpc/auth.me", "GET", undefined, cookieA) : null;
  const balanceA = cookieA ? await call(query("/trpc/credits.balance", null), "GET", undefined, cookieA) : null;
  // Exercise the real authenticated Gateway catalog route without invoking a
  // provider, reserving credits, or creating a chargeable completion.
  const gatewayModels = cookieA ? await call("/v1/models", "GET", undefined, cookieA) : null;
  const foreignRead = cookieA ? await call(query("/trpc/tenantFeatureFlags.getFeatureFlags", { tenantId: input.foreignTenantId }), "GET", undefined, cookieA) : null;
  const pythonMe = cookieA ? await call("/api/users/me", "GET", undefined, undefined, cookieA.slice(cookieA.indexOf("=") + 1), "python-http") : null;
  const logoutA = cookieA ? await call("/trpc/auth.logout", "POST", { json: null }, cookieA) : null;
  const afterLogout = cookieA ? await call("/trpc/auth.me", "GET", undefined, cookieA) : null;
  const resultA = trpcResult(meA?.json), balance = trpcResult(balanceA?.json), gatewayBody = gatewayModels?.json;
  const gatewayReady = gatewayModels?.status === 200 && gatewayBody?.object === "list" && Array.isArray(gatewayBody.data) &&
    gatewayBody.data.length > 0 && gatewayBody.data.every((model: any) => typeof model?.id === "string" && model.object === "model");
  const isolationDenied = foreignRead?.status === 403 || trpcCode(foreignRead?.json) === "FORBIDDEN";
  const pythonIdentityMatches = pythonMe?.status === 200 && pythonMe.json?.id === String(input.primary.userId) && pythonMe.json?.email === input.primary.email;
  const passed = invalid.status === 401 && loginA.status === 200 && Boolean(cookieA) && resultA?.id === input.primary.userId &&
    resultA?.currentTenantId === input.primary.tenantId &&
    balanceA?.status === 200 && balance?.plan !== undefined && gatewayReady && isolationDenied && pythonIdentityMatches &&
    logoutA?.status === 200 && trpcResult(logoutA.json)?.success === true && afterLogout?.status === 200 && trpcResult(afterLogout?.json) === null;
  const checks = { invalidLoginDenied: invalid.status === 401, primaryLogin: loginA.status === 200 && Boolean(cookieA),
    primarySessionTenant: resultA?.id === input.primary.userId && resultA?.currentTenantId === input.primary.tenantId, authenticatedCreditRead: balanceA?.status === 200,
    authenticatedGatewayModelRouting: gatewayReady,
    crossTenantReadDenied: isolationDenied, pythonAuthenticatedUserRead: pythonIdentityMatches,
    logout: logoutA?.status === 200 && trpcResult(logoutA.json)?.success === true,
    revokedSessionDenied: afterLogout?.status === 200 && trpcResult(afterLogout?.json) === null,
  };
  return Response.json({ schemaVersion: "cloudflare-application-auth-acceptance-v1", passed,
    checks, revocationHashes: [await sessionJtiHash(cookieA)].filter(Boolean),
    status: { invalidLogin: invalid.status, primaryLogin: loginA.status, primarySession: meA?.status ?? 0,
      creditRead: balanceA?.status ?? 0, gatewayModels: gatewayModels?.status ?? 0, crossTenantRead: foreignRead?.status ?? 0,
      pythonAuthenticatedRead: pythonMe?.status ?? 0, logout: logoutA?.status ?? 0,
      gatewayModelCount: Array.isArray(gatewayBody?.data) ? gatewayBody.data.length : 0,
      revokedSession: afterLogout?.status ?? 0 } },
  { headers: { "cache-control": "no-store" } });
}
/** Fixed read-only migration probes, protected by a distinct immutable canary
 * capability. It neither accepts URLs/commands nor elevates app user identity.
 * VM count/lifetime/idle budgets remain enforced by the named DO controller. */
export async function handleApplicationHttpCanary(request: Request, env: ApplicationHttpBindings): Promise<Response> {
  const url = new URL(request.url), route = url.pathname.slice(APPLICATION_HTTP_CANARY_PREFIX.length);
  const hidden = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  if (!url.pathname.startsWith(APPLICATION_HTTP_CANARY_PREFIX) || !["staging", "production"].includes(env.CLOUDFLARE_ENVIRONMENT ?? "") ||
      !await sameToken(request.headers.get("x-smartaihub-application-canary-token"), env.CLOUDFLARE_APPLICATION_CANARY_TOKEN)) return hidden();
  // Cleanup has its own exact fixed action; no destination, command, query or
  // new start capability. Public and expired profiles remain fail-closed.
  if ((route === "node/stop" || route === "python/stop") && request.method === "POST" && !url.search && !request.headers.has("upgrade")) {
    try {
      const stub = resolveApplicationHttpStub(route === "node/stop" ? "node-http" : "python-http", env);
      if (!stub.stop) throw Error();
      return Response.json(await stub.stop(), { headers: { "cache-control": "no-store" } });
    } catch { return Response.json({ error: "APPLICATION_HTTP_STOP_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } }); }
  }
  if (route === "node/application-auth" && request.method === "POST" && !url.search && !request.headers.has("upgrade")) {
    try { return await runNodeSessionAcceptance(request, env); }
    catch { return Response.json({ error: "APPLICATION_HTTP_ACCEPTANCE_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } }); }
  }
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
    "node/database": { runtime: "node-http", path: "/readyz" },
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
  } catch (error) {
    // The endpoint is capability-protected; expose only a fixed set of local
    // bridge failure categories, never provider exception text or secrets.
    const codes = new Set(["APPLICATION_HTTP_CALLER_CANCELLED", "APPLICATION_HTTP_BRIDGE_DISABLED",
      "APPLICATION_HTTP_BRIDGE_PROFILE_MISMATCH", "APPLICATION_HTTP_BRIDGE_BINDING_REQUIRED",
      "APPLICATION_HTTP_BRIDGE_DESTINATION_DENIED", "APPLICATION_HTTP_PROFILE_PAIR_DENIED", "APPLICATION_HTTP_PROFILE_DENIED"]);
    const code = error instanceof Error && codes.has(error.message) ? error.message : "APPLICATION_HTTP_CANARY_UNAVAILABLE";
    return Response.json({ error: code }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
