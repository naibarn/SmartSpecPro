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
import { z } from "zod";
import { sdk } from "../_core/sdk";
import { runChannel, teamChannel, userChannel } from "../services/orchestratorEventBus";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import type { TenantRequest } from "../_core/tenant";

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
  tenantId: string,
): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const { agentActivityEvents } = await import("../../drizzle/schema");
    const { gt, eq, and } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) return;

    // Validate lastEventId is a valid UUID format
    const uuidResult = z.string().uuid().safeParse(lastEventId);
    if (!uuidResult.success) return;

    // Find the timestamp of the last received event
    const [lastEvent] = await db
      .select({ createdAt: agentActivityEvents.createdAt })
      .from(agentActivityEvents)
      .where(eq(agentActivityEvents.id, lastEventId))
      .limit(1);

    if (!lastEvent) return;

    // Fetch all events after that timestamp — with tenant isolation
    const missedEvents = await db
      .select()
      .from(agentActivityEvents)
      .where(
        and(
          eq(agentActivityEvents.runId, runId),
          eq(agentActivityEvents.tenantId, tenantId),
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
  options?: { lastEventId?: string; runId?: string; tenantId?: string },
): { cleanup: () => void } {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Replay missed events if lastEventId provided (gap recovery)
  if (options?.lastEventId && options?.runId && options?.tenantId) {
    replayMissedEvents(res, options.runId, options.lastEventId, options.tenantId);
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

  const tenantReq = req as TenantRequest;
  const tenantId = resolveTenantIdVarchar(
    tenantReq.tenant?.id ?? null,
    user.currentTenantId,
  );
  if (!tenantId) {
    res.status(403).json({ error: "Tenant context required" });
    return;
  }

  // Verify run belongs to this tenant
  const { runId } = req.params;
  try {
    const { getDb } = await import("../db");
    const { teamRuns, teamRooms } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const [run] = await db.select({ roomId: teamRuns.roomId }).from(teamRuns).where(eq(teamRuns.id, runId)).limit(1);
      if (!run) { res.status(404).json({ error: "Run not found" }); return; }
      const [room] = await db.select({ id: teamRooms.id }).from(teamRooms)
        .where(and(eq(teamRooms.id, run.roomId), eq(teamRooms.tenantId, tenantId))).limit(1);
      if (!room) { res.status(403).json({ error: "Access denied" }); return; }
    }
  } catch { /* continue — best effort */ }

  const lastEventId = (req.query.lastEventId as string) || (req.headers["last-event-id"] as string | undefined);
  setupSSE(res, runChannel(runId), { lastEventId, runId, tenantId });
});

orchestratorStreamRouter.get("/api/orchestrator/stream/team/:teamId", async (req: Request, res: Response) => {
  const user = await authenticateSSE(req, res);
  if (!user) return;

  const tenantReq = req as TenantRequest;
  const tenantId = resolveTenantIdVarchar(
    tenantReq.tenant?.id ?? null,
    user.currentTenantId,
  );
  if (!tenantId) {
    res.status(403).json({ error: "Tenant context required" });
    return;
  }

  // Verify team belongs to this tenant
  const { teamId } = req.params;
  try {
    const { getDb } = await import("../db");
    const { assistantTeams } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const [team] = await db.select({ id: assistantTeams.id }).from(assistantTeams)
        .where(and(eq(assistantTeams.id, teamId), eq(assistantTeams.tenantId, tenantId))).limit(1);
      if (!team) { res.status(403).json({ error: "Access denied" }); return; }
    }
  } catch { /* continue — best effort */ }

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
