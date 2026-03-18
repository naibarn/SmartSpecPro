/**
 * Orchestrator SSE Streaming Routes — real-time event streams.
 *
 * Endpoints:
 * - GET /api/orchestrator/stream/run/:runId
 * - GET /api/orchestrator/stream/team/:teamId
 * - GET /api/orchestrator/stream/user
 */

import { Router, type Request, type Response } from "express";
import { runChannel, teamChannel, userChannel } from "../services/orchestratorEventBus";

const orchestratorStreamRouter = Router();

const HEARTBEAT_INTERVAL_MS = 15_000;

function setupSSE(
  res: Response,
  channelName: string,
  lastEventId?: string,
): { cleanup: () => void } {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  // Subscribe to Redis channel
  let subscriber: any = null;

  (async () => {
    try {
      const { getRedisClient } = await import("../services/redis");
      const redis = getRedisClient();
      if (!redis) return;

      // Create a duplicate connection for subscription
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
    if (subscriber) {
      subscriber.unsubscribe(channelName).catch(() => {});
      subscriber.quit().catch(() => {});
    }
  };

  res.on("close", cleanup);

  return { cleanup };
}

orchestratorStreamRouter.get("/api/orchestrator/stream/run/:runId", (req: Request, res: Response) => {
  const { runId } = req.params;
  const lastEventId = req.headers["last-event-id"] as string | undefined;
  setupSSE(res, runChannel(runId), lastEventId);
});

orchestratorStreamRouter.get("/api/orchestrator/stream/team/:teamId", (req: Request, res: Response) => {
  const { teamId } = req.params;
  const lastEventId = req.headers["last-event-id"] as string | undefined;
  setupSSE(res, teamChannel(teamId), lastEventId);
});

orchestratorStreamRouter.get("/api/orchestrator/stream/user", (req: Request, res: Response) => {
  // TODO: Extract userId from JWT/session
  const userId = (req as any).userId ?? 0;
  const lastEventId = req.headers["last-event-id"] as string | undefined;
  setupSSE(res, userChannel(userId), lastEventId);
});

export default orchestratorStreamRouter;
