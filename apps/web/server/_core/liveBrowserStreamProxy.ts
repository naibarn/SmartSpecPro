import type { Express, Request, Response } from "express";
import { authorizeRequest } from "./authz";
import { getAppRuntimeConfig, getPreferredInternalToken } from "../services/appRuntimeConfig";
const LIVE_BROWSER_SESSION_ID_PATTERN = /^lbs_[a-z0-9]{6,}$/;
const LIVE_BROWSER_CURSOR_PATTERN = /^[a-zA-Z0-9:_-]{1,200}$/;
const HEARTBEAT_INTERVAL_MS = 15_000;

function writeSSEHeaders(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

export function registerLiveBrowserStreamRoutes(app: Express): void {
  app.get(
    "/api/live-browser/sessions/:sessionId/stream",
    async (req: Request, res: Response) => {
      const auth = await authorizeRequest(req, {
        allowBearer: true,
        allowSession: true,
      });
      if (!auth.ok) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { sessionId } = req.params;
      if (!sessionId || !LIVE_BROWSER_SESSION_ID_PATTERN.test(sessionId)) {
        return res.status(400).json({ error: "Invalid sessionId format" });
      }

      const rawLastEventId = typeof req.query.lastEventId === "string"
        ? req.query.lastEventId.trim()
        : "";
      const lastEventId = rawLastEventId && LIVE_BROWSER_CURSOR_PATTERN.test(rawLastEventId)
        ? rawLastEventId
        : undefined;
      const userId = Number(auth.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(403).json({ error: "Invalid user context" });
      }
      const tenantId = auth.mode === "session"
        ? String(auth.user?.currentTenantId || "").trim()
        : String(req.headers["x-tenant-id"] || "").trim();
      if (!tenantId) {
        return res.status(403).json({ error: "Missing tenant context" });
      }

      const controller = new AbortController();
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      };

      req.on("close", () => {
        controller.abort();
        cleanup();
      });

      try {
        const runtime = await getAppRuntimeConfig();
        const proxyToken = await getPreferredInternalToken();
        const upstreamUrl = new URL(
          `/api/v1/live-browser/sessions/${encodeURIComponent(sessionId)}/stream`,
          runtime.pythonBackendUrl,
        );
        upstreamUrl.searchParams.set("tenantId", tenantId);
        upstreamUrl.searchParams.set("userId", String(userId));
        upstreamUrl.searchParams.set("actorType", "user");
        upstreamUrl.searchParams.set("actorId", String(userId));
        if (lastEventId) {
          upstreamUrl.searchParams.set("lastEventId", lastEventId);
        }

        const upstream = await fetch(upstreamUrl, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            ...(proxyToken ? { "x-proxy-token": proxyToken } : {}),
          },
          signal: controller.signal,
        });

        if (!upstream.ok) {
          cleanup();
          const status = upstream.status >= 400 && upstream.status < 600
            ? upstream.status
            : 502;
          return res
            .status(status)
            .json({ error: `Upstream error: ${upstream.status}` });
        }

        if (!upstream.body) {
          cleanup();
          return res.status(502).json({ error: "No response body from upstream" });
        }

        writeSSEHeaders(res);
        heartbeatInterval = setInterval(() => {
          if (!res.writableEnded) {
            res.write(": keepalive\n\n");
          }
        }, HEARTBEAT_INTERVAL_MS);

        const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.writableEnded) {
              res.write(value);
            }
          }
        } catch {
          if (!res.writableEnded) {
            res.write(
              `event: stream_error\ndata: ${JSON.stringify({ message: "Upstream connection lost" })}\n\n`,
            );
          }
        } finally {
          cleanup();
          if (!res.writableEnded) {
            res.end();
          }
        }
      } catch (error: any) {
        cleanup();
        if (error?.name === "AbortError") {
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }
        if (!res.headersSent) {
          return res.status(502).json({ error: "Failed to connect to upstream" });
        }
        if (!res.writableEnded) {
          res.write(
            `event: stream_error\ndata: ${JSON.stringify({ message: "Failed to connect to upstream" })}\n\n`,
          );
          res.end();
        }
      }
    },
  );
}
