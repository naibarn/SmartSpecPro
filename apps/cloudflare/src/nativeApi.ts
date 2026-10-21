import { Hono } from "hono";
import { handleRunnerReleaseCatalog } from "./runnerReleaseCatalog";
import { getPublicEvidenceVerificationKeys } from "@smartspec/shared/src/contentProtection";
import type { ApiRouteManifestEntry } from "./apiRouteManifest";
import type { CloudflareEnvironment } from "./contracts";
import { API_ROUTE_MANIFEST } from "./apiRouteManifest";
import { proxyAuthToOrigin } from "./authOriginProxy";
import { dispatchApplicationHttpIngress } from "./applicationHttpIngress";

export const PUBLIC_EVIDENCE_KEYS_PATH = "/.well-known/smartaihub-evidence-keys.json";
const MAX_PUBLIC_KEYS_REQUEST_BYTES = 1024;

/** Fetch-standard HTTP router. Its handlers run unchanged in workerd and Node.js. */
export const nativeApiApp = new Hono<{ Bindings: CloudflareEnvironment }>();

nativeApiApp.on(["GET", "HEAD"], ["/api/runner-releases", "/api/runner-releases/latest"], context =>
  handleRunnerReleaseCatalog(context.req.raw, context.env));

nativeApiApp.on(["GET", "HEAD"], PUBLIC_EVIDENCE_KEYS_PATH, async (context) => {
  const contentLength = context.req.header("content-length");
  if (contentLength !== undefined) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_PUBLIC_KEYS_REQUEST_BYTES) {
      return context.json({ error: "REQUEST_TOO_LARGE" }, 413, { "content-type": "application/json; charset=utf-8" });
    }
  }

  const payload = getPublicEvidenceVerificationKeys(context.env?.CONTENT_PROTECTION_PUBLIC_KEYS_JSON);
  const body = JSON.stringify(payload);
  const bodyBytes = new TextEncoder().encode(body);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bodyBytes));
  const digestBase64 = btoa(String.fromCharCode(...digest)).slice(0, 27);
  const etag = `W/"${bodyBytes.byteLength.toString(16)}-${digestBase64}"`;
  const headers = {
    "cache-control": "public, max-age=300",
    "content-type": "application/json; charset=utf-8",
    etag,
  };
  const ifNoneMatch = context.req.header("if-none-match");
  const etagValue = etag.replace(/^W\//, "");
  const isNotModified = ifNoneMatch?.split(",").some((value) => {
    const candidate = value.trim();
    return candidate === "*" || candidate.replace(/^W\//, "") === etagValue;
  });
  if (isNotModified && context.req.method === "GET") {
    return context.body(null, 304, { "cache-control": headers["cache-control"], etag });
  }
  if (context.req.method === "HEAD") return context.body(null, 200, headers);
  return context.body(body, 200, headers);
});

export type ManifestRouteDispatcherOptions = {
  manifest?: readonly ApiRouteManifestEntry[];
  nativeFetch?: (request: Request, env: CloudflareEnvironment) => Promise<Response>;
  originProxy?: (request: Request, env: CloudflareEnvironment) => Promise<Response>;
};

/** Shared manifest dispatcher. Tests can inject a proxy classification to prove rollback. */
export async function dispatchManifestRoute(
  request: Request,
  env: CloudflareEnvironment,
  options: ManifestRouteDispatcherOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const route = (options.manifest ?? API_ROUTE_MANIFEST).find((entry) => {
    const matchesPath = entry.match === "exact"
      ? url.pathname === entry.path
      : url.pathname === entry.path || url.pathname.startsWith(`${entry.path}/`);
    return matchesPath && (entry.methods === "*" || entry.methods.includes(method));
  });
  if (!route) return null;

  if (route.classification === "WORKER_COMPATIBLE_WITH_CHANGES" && route.id.startsWith("runner-releases.")) {
    if (env.CLOUDFLARE_RUNNER_RELEASE_CATALOG === undefined) {
      return (options.originProxy ?? proxyAuthToOrigin)(request, env);
    }
    const nativeFetch = options.nativeFetch ?? ((nativeRequest, nativeEnv) => nativeApiApp.fetch(nativeRequest, nativeEnv));
    return nativeFetch(request, env);
  }
  if (route.classification === "WORKER_NATIVE") {
    const nativeFetch = options.nativeFetch ?? ((nativeRequest, nativeEnv) => nativeApiApp.fetch(nativeRequest, nativeEnv));
    return nativeFetch(request, env);
  }
  if (route.classification === "ORIGIN_PROXY" || route.classification === "NATIVE_RUNTIME_ONLY") {
    if (route.classification === "NATIVE_RUNTIME_ONLY" && (route.id === "websocket" || route.id === "websocket.ws")) {
      return new Response(JSON.stringify({ error: "NATIVE_RUNTIME_ROUTE" }), {
        status: 501,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (route.classification === "ORIGIN_PROXY") {
      const applicationResponse = await dispatchApplicationHttpIngress(request, route, env);
      if (applicationResponse) return applicationResponse;
    }
    return (options.originProxy ?? ((proxyRequest, proxyEnv) => proxyAuthToOrigin(proxyRequest, proxyEnv)))(request, env);
  }
  return null;
}
