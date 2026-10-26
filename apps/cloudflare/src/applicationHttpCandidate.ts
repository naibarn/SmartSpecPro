import { handleApplicationHttpCanary } from "./applicationHttpCanary";
import type { ApplicationHttpBindings } from "./applicationHttpBridge";

/** Separate migration Worker: only the existing bounded, authenticated probe
 * is reachable. No application ingress, queue consumer, cron or M2 fallback. */
export function fetchApplicationHttpCandidate(request: Request, env: ApplicationHttpBindings) {
  if (env.CLOUDFLARE_ENVIRONMENT !== "production" || env.CLOUDFLARE_APPLICATION_HTTP_TRAFFIC ||
      env.CLOUDFLARE_CONTAINER_REALTIME_ROUTES) {
    return Promise.resolve(new Response(null, { status: 404, headers: { "cache-control": "no-store" } }));
  }
  return handleApplicationHttpCanary(request, env);
}
