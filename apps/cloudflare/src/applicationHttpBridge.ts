import { applicationHttpInstanceName, validateApplicationHttpProfilePair, type ApplicationHttpProfile } from "./applicationHttpContainer";
import { isCanonicalWidgetBrowserOrigin, parseCloudflarePublicOrigins } from "../../../packages/shared/src/cloudflareOrigin";

export type ApplicationHttpNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response>; diagnostics?(): Promise<unknown> };
};
export type ApplicationHttpBindings = {
  CLOUDFLARE_ENVIRONMENT?: string;
  CLOUDFLARE_CONTAINER_POLICY?: string;
  CLOUDFLARE_APPLICATION_CANARY_TOKEN?: string;
  /** Default-off switch for staging full HTTP ingress to the bounded app Container. */
  CLOUDFLARE_APPLICATION_HTTP_TRAFFIC?: string;
  /** Explicit, default-off migration switch for the three Node WebSocket routes. */
  CLOUDFLARE_CONTAINER_REALTIME_ROUTES?: string;
  AUTH_ORIGIN_TOKEN?: string;
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS?: string;
  CLOUDFLARE_NODE_HTTP_PROFILE?: string;
  CLOUDFLARE_PYTHON_HTTP_PROFILE?: string;
  NODE_HTTP?: ApplicationHttpNamespace;
  PYTHON_HTTP?: ApplicationHttpNamespace;
};
export const applicationHttpHostname = (runtime: ApplicationHttpProfile["runtime"]) => runtime === "node-http"
  ? "node.application.internal" : "python.application.internal";

const RETIRED_PATHS = ["/agency", "/api/agency", "/api/v1/agency", "/work/request", "/work/requests", "/workpacks",
  "/workflows", "/api/workflows", "/api/v1/workflows", "/api/v1/orchestrator"];
const HOP_HEADERS = new Set(["host", "content-length", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "forwarded", "x-forwarded", "x-real-ip", "true-client-ip", "cf-connecting-ip",
  "x-cloudflare-origin-token", "x-smartaihub-public-origin"]);

export function isApplicationHttpWebSocketPath(path: string): boolean {
  return path === "/api/voice/stream" || path === "/widget/v1/ws" ||
    /^\/api\/runners\/[A-Za-z0-9._:-]+\/control$/.test(path);
}

export function validateApplicationHttpWebSocket(request: Request, expectedPublicOrigin = new URL(request.url).origin): 400 | 403 | null {
  const url = new URL(request.url);
  if (!isApplicationHttpWebSocketPath(url.pathname) || request.method !== "GET" ||
      request.headers.get("upgrade")?.toLowerCase() !== "websocket" ||
      !request.headers.get("connection")?.split(",").some(value => value.trim().toLowerCase() === "upgrade") ||
      request.headers.get("sec-websocket-version") !== "13" ||
      !/^[A-Za-z0-9+/]{22}==$/.test(request.headers.get("sec-websocket-key") ?? "")) return 400;
  const browserOrigin = request.headers.get("origin");
  if (url.pathname === "/widget/v1/ws" ? !isCanonicalWidgetBrowserOrigin(browserOrigin)
    : browserOrigin !== null && browserOrigin !== expectedPublicOrigin) return 403;
  return null;
}

export function retiredApplicationHttpPath(path: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(path).toLowerCase(); }
  catch { throw new Error("APPLICATION_HTTP_PATH_INVALID"); }
  return RETIRED_PATHS.some(prefix => decoded === prefix || decoded.startsWith(prefix + "/"));
}

/** Addresses are fixed by the private Container network binding, never a user
 * URL. Preserve application auth/internal credentials already supplied by the
 * calling service; do not mint or elevate an application identity here. */
export function prepareApplicationHttpBridgeRequest(request: Request, runtime: ApplicationHttpProfile["runtime"], env?: ApplicationHttpBindings) {
  const source = new URL(request.url);
  if (source.protocol !== "http:" || source.hostname !== applicationHttpHostname(runtime) || source.username || source.password || source.port) {
    throw new Error("APPLICATION_HTTP_BRIDGE_DESTINATION_DENIED");
  }
  const websocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
  const publicOrigin = request.headers.get("x-smartaihub-public-origin");
  if (websocket) {
    const error = validateApplicationHttpWebSocket(request, publicOrigin ?? undefined);
    const allowedOrigins = parseCloudflarePublicOrigins(env?.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS);
    let parsedOrigin: URL | null = null;
    try { parsedOrigin = publicOrigin ? new URL(publicOrigin) : null; } catch { /* invalid public origin */ }
    if (error || !parsedOrigin || parsedOrigin.origin !== publicOrigin || parsedOrigin.protocol !== "https:" ||
        !allowedOrigins?.includes(parsedOrigin.origin) || !env?.AUTH_ORIGIN_TOKEN || env.AUTH_ORIGIN_TOKEN.length < 32) {
      throw new Error("APPLICATION_HTTP_REALTIME_ATTESTATION_REQUIRED");
    }
  }
  const headers = new Headers();
  const connectionHeaders = new Set((request.headers.get("connection") ?? "").split(",").map(name => name.trim().toLowerCase()));
  request.headers.forEach((value, name) => {
    if (!HOP_HEADERS.has(name) && !connectionHeaders.has(name) && !name.startsWith("x-forwarded-") && !name.startsWith("cf-access-")) {
      headers.set(name, value);
    }
  });
  if (websocket) {
    const origin = new URL(publicOrigin!);
    headers.set("upgrade", "websocket");
    headers.set("connection", "Upgrade");
    headers.set("x-cloudflare-origin-token", env!.AUTH_ORIGIN_TOKEN!);
    headers.set("x-smartaihub-public-origin", origin.origin);
    headers.set("x-forwarded-host", origin.host);
    headers.set("x-forwarded-proto", "https");
  }
  const cookie = headers.get("cookie");
  if (cookie) {
    const applicationCookies = cookie.split(";").filter(part => !/^\s*CF_Authorization=/i.test(part)).join(";");
    if (applicationCookies.trim()) headers.set("cookie", applicationCookies); else headers.delete("cookie");
  }
  const target = new URL(runtime === "node-http" ? "http://127.0.0.1:3000" : "http://127.0.0.1:8000");
  target.pathname = source.pathname;
  target.search = source.search;
  return new Request(target, { method: request.method, headers, redirect: "manual", signal: request.signal,
    ...(request.method !== "GET" && request.method !== "HEAD" && request.body ? { body: request.body, duplex: "half" } as RequestInit : {}) });
}

/** Called only by a private WorkerEntrypoint bound to Container egress. No
 * public URL or caller-specified DO name can create another paid instance. */
export async function forwardApplicationHttpBridge(request: Request, runtime: ApplicationHttpProfile["runtime"], env: ApplicationHttpBindings): Promise<Response> {
  if (request.signal.aborted) throw new Error("APPLICATION_HTTP_CALLER_CANCELLED");
  if (retiredApplicationHttpPath(new URL(request.url).pathname)) {
    return Response.json({ error: "LEGACY_RUNTIME_RETIRED" }, { status: 410, headers: { "cache-control": "no-store" } });
  }
  const prepared = prepareApplicationHttpBridgeRequest(request, runtime, env);
  return resolveApplicationHttpStub(runtime, env).fetch(prepared);
}

/** Resolving the fixed private DO never invokes its start/HTTP forwarding path. */
export function resolveApplicationHttpStub(runtime: ApplicationHttpProfile["runtime"], env: ApplicationHttpBindings) {
  const expectedTarget = env.CLOUDFLARE_ENVIRONMENT === "staging" ? "smartspec-cloudflare-staging" :
    env.CLOUDFLARE_ENVIRONMENT === "production" ? "smartspec-cloudflare-runtime" : null;
  if (!expectedTarget || env.CLOUDFLARE_CONTAINER_POLICY !== "on-demand") throw new Error("APPLICATION_HTTP_BRIDGE_DISABLED");
  const node: ApplicationHttpProfile = JSON.parse(env.CLOUDFLARE_NODE_HTTP_PROFILE ?? "null");
  const python: ApplicationHttpProfile = JSON.parse(env.CLOUDFLARE_PYTHON_HTTP_PROFILE ?? "null");
  if (!node || !python) throw new Error("APPLICATION_HTTP_PROFILE_PAIR_DENIED");
  validateApplicationHttpProfilePair(node, python);
  const profile = runtime === "node-http" ? node : python;
  if (profile.runtime !== runtime || profile.targetId !== expectedTarget) throw new Error("APPLICATION_HTTP_BRIDGE_PROFILE_MISMATCH");
  const namespace = runtime === "node-http" ? env.NODE_HTTP : env.PYTHON_HTTP;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") throw new Error("APPLICATION_HTTP_BRIDGE_BINDING_REQUIRED");
  return namespace.get(namespace.idFromName(applicationHttpInstanceName(runtime, profile.namespace, profile.targetId)));
}
