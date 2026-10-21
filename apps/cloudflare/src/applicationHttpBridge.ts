import { applicationHttpInstanceName, validateApplicationHttpProfilePair, type ApplicationHttpProfile } from "./applicationHttpContainer";

export type ApplicationHttpNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response>; diagnostics?(): Promise<unknown> };
};
export type ApplicationHttpBindings = {
  CLOUDFLARE_ENVIRONMENT?: string;
  CLOUDFLARE_CONTAINER_POLICY?: string;
  CLOUDFLARE_APPLICATION_CANARY_TOKEN?: string;
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

export function retiredApplicationHttpPath(path: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(path).toLowerCase(); }
  catch { throw new Error("APPLICATION_HTTP_PATH_INVALID"); }
  return RETIRED_PATHS.some(prefix => decoded === prefix || decoded.startsWith(prefix + "/"));
}

/** Addresses are fixed by the private Container network binding, never a user
 * URL. Preserve application auth/internal credentials already supplied by the
 * calling service; do not mint or elevate an application identity here. */
export function prepareApplicationHttpBridgeRequest(request: Request, runtime: ApplicationHttpProfile["runtime"]) {
  const source = new URL(request.url);
  if (source.protocol !== "http:" || source.hostname !== applicationHttpHostname(runtime) || source.username || source.password || source.port) {
    throw new Error("APPLICATION_HTTP_BRIDGE_DESTINATION_DENIED");
  }
  if (request.headers.has("upgrade")) throw new Error("APPLICATION_HTTP_REALTIME_OWNER_REQUIRED");
  const headers = new Headers();
  const connectionHeaders = new Set((request.headers.get("connection") ?? "").split(",").map(name => name.trim().toLowerCase()));
  request.headers.forEach((value, name) => {
    if (!HOP_HEADERS.has(name) && !connectionHeaders.has(name) && !name.startsWith("x-forwarded-") && !name.startsWith("cf-access-")) {
      headers.set(name, value);
    }
  });
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
  const prepared = prepareApplicationHttpBridgeRequest(request, runtime);
  return resolveApplicationHttpStub(runtime, env).fetch(prepared);
}

/** Resolving the fixed private DO never invokes its start/HTTP forwarding path. */
export function resolveApplicationHttpStub(runtime: ApplicationHttpProfile["runtime"], env: ApplicationHttpBindings) {
  if (env.CLOUDFLARE_ENVIRONMENT !== "staging" || env.CLOUDFLARE_CONTAINER_POLICY !== "on-demand") throw new Error("APPLICATION_HTTP_BRIDGE_DISABLED");
  const node: ApplicationHttpProfile = JSON.parse(env.CLOUDFLARE_NODE_HTTP_PROFILE ?? "null");
  const python: ApplicationHttpProfile = JSON.parse(env.CLOUDFLARE_PYTHON_HTTP_PROFILE ?? "null");
  if (!node || !python) throw new Error("APPLICATION_HTTP_PROFILE_PAIR_DENIED");
  validateApplicationHttpProfilePair(node, python);
  const profile = runtime === "node-http" ? node : python;
  if (profile.runtime !== runtime) throw new Error("APPLICATION_HTTP_BRIDGE_PROFILE_MISMATCH");
  const namespace = runtime === "node-http" ? env.NODE_HTTP : env.PYTHON_HTTP;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") throw new Error("APPLICATION_HTTP_BRIDGE_BINDING_REQUIRED");
  return namespace.get(namespace.idFromName(applicationHttpInstanceName(runtime)));
}
