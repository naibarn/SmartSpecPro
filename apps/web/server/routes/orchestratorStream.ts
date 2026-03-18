/**
 * Orchestrator SSE Streaming Routes — real-time event streams.
 *
 * Endpoints:
 * - GET /api/orchestrator/stream/run/:runId
 * - GET /api/orchestrator/stream/team/:teamId
 * - GET /api/orchestrator/stream/user
 *
 * All endpoints require JWT authentication.
 */

import { Router, type Request, type Response } from "express";
import { sdk } from "../_core/sdk";
import { runChannel, teamChannel, userChannel } from "../services/orchestratorEventBus";

const orchestratorStreamRouter = Router();

const HEARTBEAT_INTERVAL_MS = 15_000;

/** Authenticate the request — returns user or sends 401 and returns null. */
async function authenticateSSE(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

/** Replay missed events from the DB since lastEventId for a given runId. */
async function replayMissedEvents(
  res: Response,
  runId: string,
  lastEventId: string,
): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const { agentActivityEvents } = await import("../../drizzle/schema");
    const { gt, eq, and } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) return;

    // Find the timestamp of the last received event
    const [lastEvent] = await db
      .select({ createdAt: agentActivityEvents.createdAt })
      .from(agentActivityEvents)
      .where(eq(agentActivityEvents.id, lastEventId))
      .limit(1);

    if (!lastEvent) return;

    // Fetch all events after that timestamp
    const missedEvents = await db
      .select()
      .from(agentActivityEvents)
      .where(
        and(
          eq(agentActivityEvents.runId, runId),
          gt(agentActivityEvents.createdAt, lastEvent.createdAt),
        ),
      )
      .orderBy(agentActivityEvents.createdAt)
      .limit(200);

    for (const event of missedEvents) {
      const payload = {
        eventId: event.id,
        eventType: event.eventType,
        runId: event.runId,
        actorId: event.assistantId ?? "system",
        ts: event.createdAt.toISOString(),
        data: event.detailJson ?? {},
        visibility: event.visibility ?? "transparent",
      };
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.eventType}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  } catch {
    // Replay is best-effort — continue with live stream
  }
}

function setupSSE(
  res: Response,
  channelName: string,
  options?: { lastEventId?: string; runId?: string },
): { cleanup: () => void } {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Replay missed events if lastEventId provided (gap recovery)
  if (options?.lastEventId && options?.runId) {
    replayMissedEvents(res, options.runId, options.lastEventId);
  }

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  // Max connection duration: 30 minutes
  const maxDuration = setTimeout(() => {
    res.write('event: close\ndata: {"reason":"max_duration"}\n\n');
    cleanup();
  }, 30 * 60 * 1000);

  // Subscribe to Redis channel
  let subscriber: any = null;

  (async () => {
    try {
      const { getRedisClient } = await import("../services/redis");
      const redis = getRedisClient();
      if (!redis) return;

      subscriber = redis.duplicate();
      await subscriber.subscribe(channelName);

      subscriber.on("message", (ch: string, message: string) => {
        try {
          const event = JSON.parse(message);
          res.write(`id: ${event.eventId}\n`);
          res.write(`event: ${event.eventType}\n`);
          res.write(`data: ${message}\n\n`);
        } catch {
          // Skip malformed messages
        }
      });
    } catch {
      // Redis not available
    }
  })();

  const cleanup = () => {
    clearInterval(heartbeat);
    clearTimeout(maxDuration);
    if (subscriber) {
      subscriber.unsubscribe(channelName).catch(() => {});
      subscriber.quit().catch(() => {});
    }
    res.end();
  };

  res.on("close", cleanup);

  return { cleanup };
}

orchestratorStreamRouter.get("/api/orchestrator/stream/run/:runId", async (req: Request, res: Response) => {
  const user = await authenticateSSE(req, res);
  if (!user) return;

  const { runId } = req.params;
  const lastEventId = (req.query.lastEventId as string) || (req.headers["last-event-id"] as string | undefined);
  setupSSE(res, runChannel(runId), { lastEventId, runId });
});

orchestratorStreamRouter.get("/api/orchestrator/stream/team/:teamId", async (req: Request, res: Response) => {
  const user = await authenticateSSE(req, res);
  if (!user) return;

  const { teamId } = req.params;
  const lastEventId = (req.query.lastEventId as string) || (req.headers["last-event-id"] as string | undefined);
  setupSSE(res, teamChannel(teamId), { lastEventId });
});

orchestratorStreamRouter.get("/api/orchestrator/stream/user", async (req: Request, res: Response) => {
  const user = await authenticateSSE(req, res);
  if (!user) return;

  const lastEventId = (req.query.lastEventId as string) || (req.headers["last-event-id"] as string | undefined);
  setupSSE(res, userChannel(user.id), { lastEventId });
});

export default orchestratorStreamRouter;
