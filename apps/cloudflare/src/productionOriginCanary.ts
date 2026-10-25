import { sameToken as matchesApplicationCanaryToken } from "./applicationHttpCanary";
import {
  proxyAuthToOrigin,
  type AuthOriginProxyConfig,
} from "./authOriginProxy";
export const PRODUCTION_ORIGIN_CANARY_PREFIX =
  "/_ops/application-canary/ingress/";
/** The runtime hostname has no tenant identity. Probe only fixed anonymous apex
 * GETs using the existing immutable canary capability; never accept a URL,
 * tenant ID, user session or write request from the caller. */
export async function handleProductionOriginCanary(
  request: Request,
  env: AuthOriginProxyConfig & { CLOUDFLARE_APPLICATION_CANARY_TOKEN?: string },
) {
  const url = new URL(request.url);
  const hidden = () =>
    new Response(null, {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  if (
    url.origin !== "https://runtime.smartaihub.app" ||
    url.search ||
    request.headers.has("upgrade") ||
    !(await matchesApplicationCanaryToken(
      request.headers.get("x-smartaihub-application-canary-token"),
      env.CLOUDFLARE_APPLICATION_CANARY_TOKEN,
    ))
  )
    return hidden();
  if (request.method !== "GET")
    return new Response(null, {
      status: 405,
      headers: { allow: "GET", "cache-control": "no-store" },
    });
  const routes: Record<string, string> = { web: "/", auth: "/trpc/auth.me" };
  const path =
    routes[url.pathname.slice(PRODUCTION_ORIGIN_CANARY_PREFIX.length)];
  if (!path) return hidden();
  const upstream = await proxyAuthToOrigin(
    new Request(`https://smartaihub.app${path}`, {
      headers: {
        accept: path === "/" ? "text/html" : "application/json",
        "user-agent": "SmartAIHub-Migration-Preflight/1.0",
      },
      signal: request.signal,
    }),
    env,
  );
  const headers = new Headers(upstream.headers);
  headers.delete("set-cookie");
  headers.set("x-smartaihub-ingress", "cloudflare-worker");
  headers.set("x-smartaihub-application-runtime", "linux-origin");
  return new Response(upstream.body, { status: upstream.status, headers });
}
