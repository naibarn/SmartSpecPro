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

type StreamScope =
  | { kind: "run"; id: string; tenantId: string }
  | { kind: "team"; id: string; tenantId: string }
  | { kind: "user"; id: number; tenantId: string };

function setupSSE(res: Response, scope: StreamScope, lastEventId?: string): { cleanup: () => void } {
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

  // Max connection duration: 30 minutes
  const maxDuration = setTimeout(() => {
    res.write('event: close\ndata: {"reason":"max_duration"}\n\n');
    cleanup();
  }, 30 * 60 * 1000);

  let polling = false;
  let cursorAt = new Date();
  let cursorId = "";
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const pollEvents = async () => {
    if (polling || res.writableEnded) return;
    polling = true;
    try {
      const { getDb } = await import("../db");
      const { agentActivityEvents } = await import("../../drizzle/schema");
      const { and, eq, gt, or, asc, sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return;

      const scopeCondition = scope.kind === "run"
        ? and(eq(agentActivityEvents.tenantId, scope.tenantId), eq(agentActivityEvents.runId, scope.id))
        : scope.kind === "team"
          ? and(eq(agentActivityEvents.tenantId, scope.tenantId), eq(agentActivityEvents.teamId, scope.id))
          : and(
              eq(agentActivityEvents.tenantId, scope.tenantId),
              sql`${agentActivityEvents.detailJson}->'realtimeEvent'->>'userId' = ${String(scope.id)}`,
            );
      const realtimeCondition = sql`${agentActivityEvents.detailJson}->'realtimeEvent' IS NOT NULL`;

      if (lastEventId) {
        const [last] = await db.select({ id: agentActivityEvents.id, createdAt: agentActivityEvents.createdAt })
          .from(agentActivityEvents)
          .where(and(eq(agentActivityEvents.id, lastEventId), scopeCondition, realtimeCondition))
          .limit(1);
        if (last) {
          cursorAt = last.createdAt;
          cursorId = last.id;
        }
        lastEventId = undefined;
      }

      const afterCursor = or(
        gt(agentActivityEvents.createdAt, cursorAt),
        and(eq(agentActivityEvents.createdAt, cursorAt), gt(agentActivityEvents.id, cursorId)),
      );
      const rows = await db.select({
        id: agentActivityEvents.id,
        createdAt: agentActivityEvents.createdAt,
        detailJson: agentActivityEvents.detailJson,
      }).from(agentActivityEvents)
        .where(and(scopeCondition, realtimeCondition, afterCursor))
        .orderBy(asc(agentActivityEvents.createdAt), asc(agentActivityEvents.id))
        .limit(100);

      for (const row of rows) {
        cursorAt = row.createdAt;
        cursorId = row.id;
        const event = (row.detailJson as Record<string, unknown> | null)?.realtimeEvent;
        if (!event || typeof event !== "object") continue;
        const payload = event as Record<string, unknown>;
        res.write(`id: ${row.id}\n`);
        res.write(`event: ${String(payload.eventType ?? "message")}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch {
      // Keep the stream open; the durable event log can be polled again.
    } finally {
      polling = false;
    }
  };
  void pollEvents();
  pollTimer = setInterval(() => void pollEvents(), 1_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    clearTimeout(maxDuration);
    if (pollTimer) clearInterval(pollTimer);
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
  setupSSE(res, { kind: "run", id: runId, tenantId }, lastEventId);
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
  setupSSE(res, { kind: "team", id: teamId, tenantId }, lastEventId);
});

orchestratorStreamRouter.get("/api/orchestrator/stream/user", async (req: Request, res: Response) => {
  const user = await authenticateSSE(req, res);
  if (!user) return;

  const lastEventId = (req.query.lastEventId as string) || (req.headers["last-event-id"] as string | undefined);
  const tenantId = resolveTenantIdVarchar(
    (req as TenantRequest).tenant?.id ?? null,
    user.currentTenantId,
  );
  if (!tenantId) {
    res.status(403).json({ error: "Tenant context required" });
    return;
  }
  setupSSE(res, { kind: "user", id: user.id, tenantId }, lastEventId);
});

export default orchestratorStreamRouter;
