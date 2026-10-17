/** Worker transport boundary for the existing Linux authentication authority. */
export type AuthOriginProxyConfig = {
  AUTH_ORIGIN?: string;
  AUTH_ORIGIN_PRIVATE_HOST?: string;
  AUTH_ORIGIN_TOKEN?: string;
};

export type AuthOriginFetch = (request: Request) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 15_000;
const ATTESTATION_HEADER = "x-cloudflare-origin-token";
const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade",
]);
const NEVER_FORWARD_HEADERS = new Set(["host", "content-length", "x-internal-token", ATTESTATION_HEADER]);

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
  // Preserve application response headers and streaming metadata while
  // removing connection-specific headers that must not cross HTTP hops.
  upstream.headers.forEach((value, name) => {
    if (name !== "set-cookie" && !HOP_BY_HOP_HEADERS.has(name)) headers.set(name, value);
  });
  const cookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (cookies?.length) for (const cookie of cookies) headers.append("set-cookie", cookie);
  else {
    const cookie = upstream.headers.get("set-cookie");
    if (cookie) headers.append("set-cookie", cookie);
  }
  return headers;
}

/**
 * Proxies the incoming URL path and query to the one pinned origin. Host context
 * is derived from the Worker request URL; caller supplied Forwarded headers are
 * discarded. Tenant selection remains the responsibility of the origin's
 * existing auth/tenant authority, which must validate this host context.
 */
export async function proxyAuthToOrigin(
  request: Request,
  config: AuthOriginProxyConfig,
  fetcher: AuthOriginFetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const incoming = new URL(request.url);
  const origin = resolvePrivateOrigin(config.AUTH_ORIGIN, config.AUTH_ORIGIN_PRIVATE_HOST, incoming);
  const token = config.AUTH_ORIGIN_TOKEN?.trim();
  if (!origin || !token) return unavailable();

  const headers = new Headers();
  const connectionHeaders = new Set((request.headers.get("connection") ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
  request.headers.forEach((value, name) => {
    if (HOP_BY_HOP_HEADERS.has(name) || connectionHeaders.has(name) || NEVER_FORWARD_HEADERS.has(name) ||
        name === "forwarded" || name === "x-forwarded" || name.startsWith("x-forwarded-") || name.startsWith("x-spec260-")) return;
    headers.set(name, value);
  });
  const forwarded = safeForwardedHeaders(incoming);
  // Never trust caller-provided proxy metadata or internal trust headers.
  for (const name of ["forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", ATTESTATION_HEADER]) headers.delete(name);
  headers.set("x-forwarded-host", forwarded.host);
  headers.set("x-forwarded-proto", forwarded.proto);
  if (forwarded.port) headers.set("x-forwarded-port", forwarded.port);
  headers.set(ATTESTATION_HEADER, token);

  // Assign path/query to the pinned URL instead of resolving a combined string:
  // a pathname beginning with `//` must never be interpreted as a new authority.
  const target = new URL(origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abortFromCaller();
  else request.signal.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("auth origin timeout")), Math.max(1, timeoutMs));
  try {
    const outboundRequest = new Request(target, {
      method: request.method,
      headers,
      ...(request.method !== "GET" && request.method !== "HEAD" && request.body ? { body: request.body, duplex: "half" } as RequestInit : {}),
      redirect: "manual",
      signal: controller.signal,
    });
    const aborted = new Promise<never>((_resolve, reject) => {
      const rejectOnAbort = () => reject(controller.signal.reason ?? new Error("auth origin request aborted"));
      if (controller.signal.aborted) rejectOnAbort();
      else controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });
    const upstream = await Promise.race([fetcher(outboundRequest), aborted]);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders(upstream) });
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abortFromCaller);
  }
}
