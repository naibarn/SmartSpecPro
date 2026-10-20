import { CLOUDFLARE_PUBLIC_ORIGIN_HEADER, isCanonicalWidgetBrowserOrigin, parseCloudflarePublicOrigins } from "../../../packages/shared/src/cloudflareOrigin";

/** Worker transport boundary for the existing Linux authentication authority. */
export type AuthOriginProxyConfig = {
  AUTH_ORIGIN?: string;
  AUTH_ORIGIN_PRIVATE_HOST?: string;
  AUTH_ORIGIN_TOKEN?: string;
  AUTH_ORIGIN_ACCESS_CLIENT_ID?: string;
  AUTH_ORIGIN_ACCESS_CLIENT_SECRET?: string;
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS?: string;
};

export type AuthOriginFetch = (request: Request) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 15_000;
const ATTESTATION_HEADER = "x-cloudflare-origin-token";
const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade",
]);
const NEVER_FORWARD_HEADERS = new Set(["host", "content-length", "x-internal-token", ATTESTATION_HEADER, CLOUDFLARE_PUBLIC_ORIGIN_HEADER]);

function validHeaderCredential(value: string | undefined): value is string {
  return Boolean(value && value.length <= 4096 && /^[\x21-\x7e]+$/.test(value));
}

function unavailable(): Response {
  return new Response(JSON.stringify({ error: "AUTH_ORIGIN_UNAVAILABLE" }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
}

function resolvePrivateOrigin(raw: string | undefined, expectedHost: string | undefined, requestUrl: URL): URL | null {
  if (!raw?.trim() || !expectedHost?.trim()) return null;
  try {
    const origin = new URL(raw);
    const expected = expectedHost.trim().toLowerCase();
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" ||
        origin.search || origin.hash || origin.host.toLowerCase() !== expected || origin.host === requestUrl.host) return null;
    // Reject host strings that URL parsing would normalize or reinterpret.
    if (new URL(`https://${expected}`).host !== expected) return null;
    return origin;
  } catch {
    return null;
  }
}

function safeForwardedHeaders(requestUrl: URL): { host: string; proto: string; port?: string } {
  return {
    host: requestUrl.host,
    proto: requestUrl.protocol.slice(0, -1),
    ...(requestUrl.port ? { port: requestUrl.port } : {}),
  };
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  const connectionHeaders = new Set((upstream.headers.get("connection") ?? "").split(",").map(value => value.trim().toLowerCase()));
  // Preserve application response headers and streaming metadata while
  // removing connection-specific headers that must not cross HTTP hops.
  upstream.headers.forEach((value, name) => {
    if (name !== "set-cookie" && !HOP_BY_HOP_HEADERS.has(name) && !connectionHeaders.has(name) &&
        !name.startsWith("cf-access-") && name !== ATTESTATION_HEADER && name !== CLOUDFLARE_PUBLIC_ORIGIN_HEADER) headers.set(name, value);
  });
  const cookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? [upstream.headers.get("set-cookie") ?? ""];
  // Access may issue its service-auth JWT as a cookie on every origin response.
  // It belongs to the private transport, never to the public application's jar.
  // The lookahead preserves commas in Expires dates when Headers combines lines.
  for (const line of cookies) for (const cookie of line.split(/,(?=\s*[^\s;,=]+=)/)) {
    if (cookie && !/^\s*CF_Authorization=/i.test(cookie)) headers.append("set-cookie", cookie.trim());
  }
  // This transport serves dynamic, potentially authenticated application data.
  // Static asset caching remains owned by the separate ASSETS binding.
  for (const name of ["cdn-cache-control", "cloudflare-cdn-cache-control", "surrogate-control"]) headers.delete(name);
  headers.set("cache-control", "private, no-store");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  return headers;
}

function isAccessResponse(upstream: Response, incoming: URL): boolean {
  const location = upstream.headers.get("location");
  if (location && upstream.status >= 300 && upstream.status < 400) {
    try {
      const target = new URL(location, incoming);
      if (target.hostname.endsWith(".cloudflareaccess.com") || target.pathname.startsWith("/cdn-cgi/access/")) return true;
    } catch { return true; }
  }
  return /^\/(?:trpc(?:[/.]|$)|api\/(?:auth|oauth)(?:\/|$))/.test(incoming.pathname) &&
    (upstream.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}

/** Keep cancellation alive for the body, rather than only until headers arrive. */
function proxyResponseBody(body: ReadableStream<Uint8Array>, abort: AbortController, cleanup: () => void): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let settled = false;
  let onAbort: () => void;
  const finish = () => {
    settled = true;
    cleanup();
    abort.signal.removeEventListener("abort", onAbort);
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => {
        if (settled) return;
        finish();
        controller.error(abort.signal.reason);
        void reader.cancel(abort.signal.reason).catch(() => {});
      };
      abort.signal.addEventListener("abort", onAbort, { once: true });
      if (abort.signal.aborted) onAbort();
    },
    async pull(controller) {
      if (settled) return;
      try {
        const result = await reader.read();
        if (settled) return;
        if (result.done) { finish(); controller.close(); }
        else controller.enqueue(result.value);
      } catch (error) {
        if (!settled) { finish(); controller.error(error); }
      }
    },
    async cancel(reason) {
      if (settled) return;
      finish();
      abort.abort(reason);
      await reader.cancel(reason);
    },
  });
}

/**
 * Proxies the incoming URL path and query to the one pinned origin. Host context
 * is derived from the Worker request URL; caller supplied Forwarded headers are
 * discarded. Tenant selection remains the responsibility of the origin's
 * existing auth/tenant authority, which must validate this host context.
 */
function prepareOriginRequest(request: Request, config: AuthOriginProxyConfig) {
  const incoming = new URL(request.url);
  const origin = resolvePrivateOrigin(config.AUTH_ORIGIN, config.AUTH_ORIGIN_PRIVATE_HOST, incoming);
  const token = config.AUTH_ORIGIN_TOKEN?.trim();
  const accessConfigured = config.AUTH_ORIGIN_ACCESS_CLIENT_ID !== undefined || config.AUTH_ORIGIN_ACCESS_CLIENT_SECRET !== undefined;
  const accessId = config.AUTH_ORIGIN_ACCESS_CLIENT_ID?.trim();
  const accessSecret = config.AUTH_ORIGIN_ACCESS_CLIENT_SECRET?.trim();
  const allowed = parseCloudflarePublicOrigins(config.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS);
  if (!origin || !validHeaderCredential(token) ||
      (config.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS !== undefined && (!allowed || !allowed.includes(incoming.origin))) ||
      (accessConfigured && (!validHeaderCredential(accessId) || !validHeaderCredential(accessSecret) || !allowed))) return null;

  const headers = new Headers();
  const connectionHeaders = new Set((request.headers.get("connection") ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
  request.headers.forEach((value, name) => {
    if (HOP_BY_HOP_HEADERS.has(name) || connectionHeaders.has(name) || NEVER_FORWARD_HEADERS.has(name) ||
        name === "forwarded" || name === "x-forwarded" || name.startsWith("x-forwarded-") || name.startsWith("x-spec260-") || name.startsWith("cf-access-")) return;
    headers.set(name, value);
  });
  const cookie = headers.get("cookie");
  if (cookie !== null) {
    const applicationCookies = cookie.split(";").filter(part => !/^\s*CF_Authorization=/i.test(part)).map(part => part.trim()).filter(Boolean).join("; ");
    if (applicationCookies) headers.set("cookie", applicationCookies);
    else headers.delete("cookie");
  }
  const forwarded = safeForwardedHeaders(incoming);
  // Never trust caller-provided proxy metadata or internal trust headers.
  for (const name of ["forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", ATTESTATION_HEADER]) headers.delete(name);
  headers.set("x-forwarded-host", forwarded.host);
  headers.set("x-forwarded-proto", forwarded.proto);
  if (forwarded.port) headers.set("x-forwarded-port", forwarded.port);
  headers.set(ATTESTATION_HEADER, token);
  headers.set(CLOUDFLARE_PUBLIC_ORIGIN_HEADER, incoming.origin);
  if (accessConfigured) {
    headers.set("cf-access-client-id", accessId!);
    headers.set("cf-access-client-secret", accessSecret!);
  }

  // Assign path/query to the pinned URL instead of resolving a combined string:
  // a pathname beginning with `//` must never be interpreted as a new authority.
  const target = new URL(origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return { incoming, target, headers, accessConfigured };
}

export async function proxyAuthToOrigin(
  request: Request,
  config: AuthOriginProxyConfig,
  fetcher: AuthOriginFetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const prepared = prepareOriginRequest(request, config);
  if (!prepared) return unavailable();
  const { incoming, target, headers, accessConfigured } = prepared;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abortFromCaller();
  else request.signal.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("auth origin timeout")), Math.max(1, timeoutMs));
  const cleanup = () => request.signal.removeEventListener("abort", abortFromCaller);
  let bodyOwnsCleanup = false;
  let rejectOnAbort: (() => void) | undefined;
  try {
    const outboundRequest = new Request(target, {
      method: request.method,
      headers,
      ...(request.method !== "GET" && request.method !== "HEAD" && request.body ? { body: request.body, duplex: "half" } as RequestInit : {}),
      redirect: "manual",
      signal: controller.signal,
    });
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = () => reject(controller.signal.reason ?? new Error("auth origin request aborted"));
      if (controller.signal.aborted) rejectOnAbort();
      else controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });
    const upstream = await Promise.race([fetcher(outboundRequest), aborted]);
    clearTimeout(timeout);
    if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
    if (accessConfigured && isAccessResponse(upstream, incoming)) {
      await upstream.body?.cancel();
      return unavailable();
    }
    const body = upstream.body ? proxyResponseBody(upstream.body, controller, cleanup) : null;
    bodyOwnsCleanup = Boolean(body);
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders(upstream) });
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timeout);
    if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
    if (!bodyOwnsCleanup) cleanup();
  }
}


export function isOriginWebSocketPath(pathname: string): boolean {
  return pathname === "/api/voice/stream" || pathname === "/widget/v1/ws" ||
    /^\/api\/runners\/[A-Za-z0-9._:-]+\/control$/.test(pathname);
}

/** Pass the Workers WebSocket pair through without reconstructing an HTTP body. */
export async function proxyWebSocketToOrigin(
  request: Request, config: AuthOriginProxyConfig, fetcher: AuthOriginFetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const url = new URL(request.url);
  if (!isOriginWebSocketPath(url.pathname)) return new Response(null, { status: 404 });
  if (request.method !== "GET" || request.headers.get("upgrade")?.toLowerCase() !== "websocket" ||
      !request.headers.get("connection")?.split(",").some(v => v.trim().toLowerCase() === "upgrade") ||
      request.headers.get("sec-websocket-version") !== "13" ||
      !/^[A-Za-z0-9+/]{22}==$/.test(request.headers.get("sec-websocket-key") ?? ""))
    return new Response(null, { status: 400 });
  // Embedded widgets intentionally originate at the customer's website. Their
  // token and per-widget Origin allowlist remain enforced by the native handler.
  const browserOrigin = request.headers.get("origin");
  if (url.pathname === "/widget/v1/ws" ? !isCanonicalWidgetBrowserOrigin(browserOrigin)
    : browserOrigin !== null && browserOrigin !== url.origin)
    return new Response(null, { status: 403 });
  const prepared = prepareOriginRequest(request, config);
  if (!prepared) return unavailable();
  prepared.headers.set("upgrade", "websocket");
  prepared.headers.set("connection", "Upgrade");
  const abort = new AbortController();
  const fromCaller = () => abort.abort(request.signal.reason);
  if (request.signal.aborted) fromCaller();
  else request.signal.addEventListener("abort", fromCaller, { once: true });
  const timeout = setTimeout(() => abort.abort(new Error("origin handshake timeout")), Math.max(1, timeoutMs));
  let upstream: Response | undefined;
  let rejectOnAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = () => reject(abort.signal.reason ?? new Error("origin handshake aborted"));
      if (abort.signal.aborted) rejectOnAbort();
      else abort.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });
    upstream = await Promise.race([fetcher(new Request(prepared.target, { method: "GET", headers: prepared.headers, redirect: "manual", signal: abort.signal })), aborted]);
    const pair = (upstream as Response & { webSocket?: { close: (code: number, reason: string) => void } }).webSocket;
    const accessCookie = /(?:^|,\s*)CF_Authorization=/i.test(upstream.headers.get("set-cookie") ?? "");
    let sensitive = false;
    upstream.headers.forEach((_value, name) => {
      if (name.startsWith("cf-access-") || name === ATTESTATION_HEADER || name === CLOUDFLARE_PUBLIC_ORIGIN_HEADER) sensitive = true;
    });
    if (upstream.status !== 101 || !pair || sensitive) {
      try { pair?.close(1008, "Origin handshake rejected"); } catch { /* unaccepted pair */ }
      await upstream.body?.cancel();
      return unavailable();
    }
    // Access legitimately sets its service JWT even on a 101 response. Preserve
    // the actual pair when replacing only its HTTP handshake headers; never
    // construct a body-bearing HTTP response or synthesize an accepted socket.
    if (accessCookie) return new Response(null, {
      status: 101, headers: responseHeaders(upstream), webSocket: pair,
    } as ResponseInit);
    return upstream;
  } catch {
    try { await upstream?.body?.cancel(); } catch { /* disconnected handshake */ }
    return unavailable();
  } finally {
    clearTimeout(timeout);
    if (rejectOnAbort) abort.signal.removeEventListener("abort", rejectOnAbort);
    request.signal.removeEventListener("abort", fromCaller);
  }
}
