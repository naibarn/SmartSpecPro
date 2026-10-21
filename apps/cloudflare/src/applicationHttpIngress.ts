import { CLOUDFLARE_PUBLIC_ORIGIN_HEADER, parseCloudflarePublicOrigins } from "../../../packages/shared/src/cloudflareOrigin";
import { applicationHttpHostname, resolveApplicationHttpStub, retiredApplicationHttpPath, type ApplicationHttpBindings } from "./applicationHttpBridge";
import type { ApiRouteManifestEntry } from "./apiRouteManifest";

const HOP_HEADERS = new Set(["connection", "content-length", "host", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "forwarded", "x-real-ip", "true-client-ip", "cf-connecting-ip"]);

/**
 * Full HTTP API ingress is an explicit staging-only migration switch. The
 * existing application Container remains on its bounded on-demand lifecycle;
 * production and the origin fallback are never selected implicitly.
 */
export async function dispatchApplicationHttpIngress(
  request: Request, route: ApiRouteManifestEntry, env: ApplicationHttpBindings,
): Promise<Response | null> {
  if (env.CLOUDFLARE_APPLICATION_HTTP_TRAFFIC !== "staging-full-http-v1") return null;
  if (env.CLOUDFLARE_ENVIRONMENT !== "staging" || env.CLOUDFLARE_CONTAINER_POLICY !== "on-demand" ||
      route.classification !== "ORIGIN_PROXY" || request.headers.has("upgrade")) {
    return Response.json({ error: "APPLICATION_HTTP_INGRESS_NOT_ADMITTED" }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const incoming = new URL(request.url);
  try {
    if (retiredApplicationHttpPath(incoming.pathname)) {
      return Response.json({ error: "LEGACY_RUNTIME_RETIRED" }, { status: 410, headers: { "cache-control": "no-store" } });
    }
  } catch {
    return Response.json({ error: "APPLICATION_HTTP_PATH_INVALID" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const allowedOrigins = parseCloudflarePublicOrigins(env.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS);
  const token = env.AUTH_ORIGIN_TOKEN?.trim();
  if (!allowedOrigins?.includes(incoming.origin) || !token || token.length < 32 || token.length > 4096 || !/^[\x21-\x7e]+$/.test(token)) {
    return Response.json({ error: "APPLICATION_HTTP_INGRESS_CONFIG_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const headers = new Headers();
  const connectionHeaders = new Set((request.headers.get("connection") ?? "").split(",").map(value => value.trim().toLowerCase()));
  request.headers.forEach((value, name) => {
    if (HOP_HEADERS.has(name) || connectionHeaders.has(name) || name.startsWith("x-forwarded-") ||
        name.startsWith("cf-access-") || name.startsWith("x-spec260-") ||
        ["x-cloudflare-origin-token", CLOUDFLARE_PUBLIC_ORIGIN_HEADER, "x-internal-token"].includes(name)) return;
    headers.set(name, value);
  });
  const cookies = headers.get("cookie");
  if (cookies !== null) {
    const applicationCookies = cookies.split(";").map(value => value.trim()).filter(value => value && !/^CF_Authorization=/i.test(value));
    if (applicationCookies.length) headers.set("cookie", applicationCookies.join("; "));
    else headers.delete("cookie");
  }
  headers.set("x-cloudflare-origin-token", token);
  headers.set(CLOUDFLARE_PUBLIC_ORIGIN_HEADER, incoming.origin);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");
  if (incoming.port) headers.set("x-forwarded-port", incoming.port);

  const target = new URL(`http://${applicationHttpHostname("node-http")}`);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const upstreamRequest = new Request(target, {
    method: request.method, headers, redirect: "manual", signal: request.signal,
    ...(request.method !== "GET" && request.method !== "HEAD" && request.body
      ? { body: request.body, duplex: "half" } as RequestInit : {}),
  });
  try {
    const upstream = await resolveApplicationHttpStub("node-http", env).fetch(upstreamRequest);
    const responseHeaders = new Headers();
    const connectionHeaders = new Set((upstream.headers.get("connection") ?? "").split(",").map(value => value.trim().toLowerCase()));
    upstream.headers.forEach((value, name) => {
      if (!HOP_HEADERS.has(name) && !connectionHeaders.has(name) && !name.startsWith("cf-access-") &&
          !["x-cloudflare-origin-token", CLOUDFLARE_PUBLIC_ORIGIN_HEADER].includes(name)) responseHeaders.append(name, value);
    });
    const cookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? [upstream.headers.get("set-cookie") ?? ""];
    for (const cookie of cookies) if (cookie) responseHeaders.append("set-cookie", cookie);
    responseHeaders.set("cache-control", "private, no-store");
    responseHeaders.set("pragma", "no-cache");
    responseHeaders.set("expires", "0");
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    // Never replay a write against the legacy origin after a Container failure.
    return Response.json({ error: "APPLICATION_HTTP_INGRESS_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
