import { Router } from "express";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { getDb } from "../db";
import { publicApiEvents } from "../../drizzle/schema";

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPublicEventsRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /v1/events — SSE stream
  // -------------------------------------------------------------------------
  router.get("/", requireScopes("events:read"), async (req, res) => {
    const auth = req.auth!;
    const tenantId = (auth as any).tenantId as string;

    // Parse optional types filter
    const typesParam = req.query.types as string | undefined;
    const typeFilter =
      typesParam && typesParam.trim()
        ? new Set(typesParam.split(",").map((t) => t.trim()).filter(Boolean))
        : null;

    let lastSeenId: number;
    try {
      lastSeenId = (await getDb().select({ id: publicApiEvents.id })
        .from(publicApiEvents)
        .where(eq(publicApiEvents.tenantId, tenantId))
        .orderBy(desc(publicApiEvents.id))
        .limit(1))[0]?.id ?? 0;
    } catch {
      sendApiError(res, 503, "service_unavailable", "Event stream is temporarily unavailable");
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollInFlight = false;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (maxDurationTimer) clearTimeout(maxDurationTimer);
      if (pollTimer) clearInterval(pollTimer);
    };

    const poll = async () => {
      if (closed || pollInFlight || res.writableEnded) return;
      pollInFlight = true;
      try {
        const predicates = [eq(publicApiEvents.tenantId, tenantId), gt(publicApiEvents.id, lastSeenId)];
        const rows = await getDb().select().from(publicApiEvents)
          .where(and(...predicates))
          .orderBy(asc(publicApiEvents.id))
          .limit(100);
        for (const row of rows) {
          lastSeenId = row.id;
          if (typeFilter && !typeFilter.has(row.eventType)) continue;
          const message = JSON.stringify({ type: row.eventType, ...row.payload });
          res.write(`event: ${row.eventType}\ndata: ${message}\n\n`);
        }
      } catch (err) {
        console.error("[PublicEvents] PostgreSQL poll failed:", err);
      } finally {
        pollInFlight = false;
      }
    };

    try {
      pollTimer = setInterval(() => void poll(), 2_000);

      // Heartbeat every 30s
      heartbeat = setInterval(() => {
        if (res.writableEnded) {
          cleanup();
          return;
        }
        res.write(": heartbeat\n\n");
      }, 30_000);

      // Bound each stream so clients periodically reconnect with fresh auth.
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
