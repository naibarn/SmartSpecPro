import type { CloudflareEnvironment } from "./contracts";
import { SPEC260_API_ROUTES, type Spec260ApiRoute } from "@smartspec/shared/src/emergencyRouteManifest";
import { createSpec260RouteRegistry } from "./spec260RouteRegistration";

const MAX_EMERGENCY_API_BODY_BYTES = 256 * 1024;

async function readBoundedBody(request: Request): Promise<ArrayBuffer | null | "too-large"> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_EMERGENCY_API_BODY_BYTES) return "too-large";
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_EMERGENCY_API_BODY_BYTES) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer;
}

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
}

function resolvePrivateOrigin(raw: string | undefined, incoming: URL): URL | null {
  if (!raw?.trim()) return null;
  try {
    const origin = new URL(raw);
    const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
    if ((!localHttp && origin.protocol !== "https:") || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash || origin.host === incoming.host) return null;
    return origin;
  } catch {
    return null;
  }
}

function privateHostMatches(origin: URL, expectedHost: string | undefined): boolean {
  const expected = expectedHost?.trim().toLowerCase();
  if (!expected) return false;
  try {
    const normalized = new URL(`https://${expected}`);
    return normalized.host === expected && origin.host.toLowerCase() === normalized.host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Forwards the shared route contract to the private canonical platform API.
 * The platform remains responsible for session/revocation auth, tenant and
 * record scope, audit, database transactions, and outbox admission. The edge
 * only provides an authenticated, non-recursive transport boundary.
 */
export async function proxySpec260RouteToPlatform(
  request: Request,
  route: Spec260ApiRoute,
  env: CloudflareEnvironment,
): Promise<Response> {
  const incoming = new URL(request.url);
  const origin = resolvePrivateOrigin(env.PLATFORM_EDGE_ORIGIN, incoming);
  const token = env.PLATFORM_EDGE_TOKEN?.trim();
  if (!origin || !privateHostMatches(origin, env.PLATFORM_EDGE_PRIVATE_HOST) || !token) return jsonError("EMERGENCY_PLATFORM_UNAVAILABLE", 503);

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const bounded = await readBoundedBody(request);
    if (bounded === "too-large") return jsonError("REQUEST_TOO_LARGE", 413);
    if (bounded) body = bounded;
  }

  const headers = new Headers();
  for (const name of ["accept", "authorization", "content-type", "cookie", "idempotency-key", "origin", "x-csrf-token", "x-emergency-case-token", "x-request-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Never relay caller-controlled values for the edge trust boundary.
  headers.delete("x-internal-token");
  headers.delete("x-spec260-original-host");
  headers.delete("x-spec260-original-protocol");
  headers.set("x-internal-token", token);
  headers.set("x-spec260-original-host", incoming.host);
  headers.set("x-spec260-original-protocol", incoming.protocol.slice(0, -1));
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp && /^[0-9a-fA-F:.]{3,64}$/.test(clientIp)) headers.set("x-spec260-client-ip", clientIp);
  headers.set("x-spec260-route-id", route.id);
  headers.set("x-spec260-edge-request-id", request.headers.get("cf-ray")?.slice(0, 128) ?? crypto.randomUUID());

  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  try {
    const upstream = await fetch(new Request(target, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      redirect: "manual",
    }));
    const responseHeaders = new Headers();
    for (const name of ["content-type", "retry-after", "x-request-id"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    // The registry applies the public cache policy after it has observed a
    // successful response; every private/error result stays non-cacheable.
    responseHeaders.set("cache-control", "private, no-store");
    responseHeaders.set("x-content-type-options", "nosniff");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return jsonError("EMERGENCY_PLATFORM_UNAVAILABLE", 503);
  }
}

/** The default exported Worker registry; all access checks remain canonical on the platform. */
export function createSpec260PlatformRouteRegistry(env: CloudflareEnvironment) {
  const handlers: Record<string, (request: Request) => Promise<Response>> = Object.fromEntries(SPEC260_API_ROUTES.map((route) => [
    route.id,
    (request: Request) => proxySpec260RouteToPlatform(request, route, env),
  ]));
  return createSpec260RouteRegistry(handlers, async () => "authorized");
}
