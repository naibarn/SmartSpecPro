import { Router } from "express";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { getRealtimeClient } from "../services/redisClients";

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPublicEventsRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /v1/events — SSE stream
  // -------------------------------------------------------------------------
  router.get("/", requireScopes("events:read"), (req, res) => {
    const auth = req.auth!;
    const tenantId = (auth as any).tenantId as string;

    // Parse optional types filter
    const typesParam = req.query.types as string | undefined;
    const typeFilter =
      typesParam && typesParam.trim()
        ? new Set(typesParam.split(",").map((t) => t.trim()).filter(Boolean))
        : null;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const channel = `events:${tenantId}`;

    // Create a dedicated subscriber connection
    let subscriber: ReturnType<typeof getRealtimeClient> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (maxDurationTimer) clearTimeout(maxDurationTimer);
      if (subscriber) {
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
      }
    };

    try {
      subscriber = getRealtimeClient().duplicate();

      void (subscriber as any).subscribe(channel, (message: string) => {
        if (res.writableEnded) return;
        try {
          const parsed = JSON.parse(message) as { type?: string } & Record<string, unknown>;
          const eventType = parsed.type as string | undefined;

          if (typeFilter && eventType && !typeFilter.has(eventType)) return;

          if (eventType) {
            res.write(`event: ${eventType}\n`);
          }
          res.write(`data: ${message}\n\n`);
        } catch {
          // Ignore malformed messages
        }
      });

      // Heartbeat every 30s
      heartbeat = setInterval(() => {
        if (res.writableEnded) {
          cleanup();
          return;
        }
        res.write(": heartbeat\n\n");
      }, 30_000);

      // Max 60-minute connection to prevent Redis connection pool exhaustion
      maxDurationTimer = setTimeout(() => {
        if (!res.writableEnded) {
          res.write("event: close\ndata: {\"reason\":\"max_duration\"}\n\n");
          res.end();
        }
        cleanup();
      }, 60 * 60 * 1000);

      req.on("close", cleanup);
    } catch (err) {
      cleanup();
      if (!res.headersSent) {
        sendApiError(res, 500, "internal_error", "Failed to connect to event stream");
      } else {
        res.end();
      }
    }
  });

  return router;
}
