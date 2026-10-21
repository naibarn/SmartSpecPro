import { forwardApplicationHttpBridge, isApplicationHttpWebSocketPath, validateApplicationHttpWebSocket, type ApplicationHttpBindings } from "./applicationHttpBridge";

/**
 * Optional migration route for the existing Node WebSocket handlers. It is
 * deliberately separate from ordinary HTTP routing and defaults off, so a
 * profile or Container binding alone never starts paid application compute.
 */
export async function dispatchApplicationHttpRealtime(request: Request, env: ApplicationHttpBindings): Promise<Response | undefined> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return undefined;
  const url = new URL(request.url);
  if (!isApplicationHttpWebSocketPath(url.pathname) || env.CLOUDFLARE_ENVIRONMENT !== "staging" ||
      env.CLOUDFLARE_CONTAINER_REALTIME_ROUTES !== "enabled") return undefined;

  const invalid = validateApplicationHttpWebSocket(request);
  if (invalid) return new Response(null, { status: invalid, headers: { "cache-control": "private, no-store" } });

  try {
    const headers = new Headers(request.headers);
    // The public Worker URL, never a caller forwarding header, determines the
    // tenant/cookie origin trusted by the existing Node ingress guard.
    for (const name of ["x-cloudflare-origin-token", "x-smartaihub-public-origin", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"])
      headers.delete(name);
    headers.set("x-smartaihub-public-origin", url.origin);
    return await forwardApplicationHttpBridge(
      new Request(`http://node.application.internal${url.pathname}${url.search}`, {
        method: "GET", headers, redirect: "manual", signal: request.signal,
      }),
      "node-http",
      env,
    );
  } catch {
    return Response.json({ error: "APPLICATION_HTTP_REALTIME_UNAVAILABLE" }, {
      status: 503, headers: { "cache-control": "private, no-store" },
    });
  }
}
