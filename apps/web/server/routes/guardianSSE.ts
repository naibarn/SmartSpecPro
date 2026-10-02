import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { Router } from "express";
import { virtualAdminApprovals, virtualAdminIncidents } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";

const POLL_INTERVAL_MS = 2_000;
const MAX_CONNECTION_MS = 60 * 60 * 1_000;

export function createGuardianSSERouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!user || !["admin", "domain_admin", "system_agent"].includes(user.role)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const tenantId = String((req as any).tenant?.id ?? user.currentTenantId ?? "");
    const tenantScope = user.role === "domain_admin"
      ? undefined
      : tenantId
        ? or(eq(virtualAdminIncidents.tenantId, tenantId), isNull(virtualAdminIncidents.tenantId))
        : isNull(virtualAdminIncidents.tenantId);
    const connectedAt = new Date();
    let incidentCursorAt = connectedAt;
    let incidentCursorId = 0;
    let approvalRequestCursorAt = connectedAt;
    let approvalRequestCursorId = 0;
    let approvalDecisionCursorAt = connectedAt;
    let approvalDecisionCursorId = 0;
    let pollTimer: NodeJS.Timeout | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let durationTimer: NodeJS.Timeout | null = null;
    let pollInFlight = false;
    let closed = false;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("event: connected\ndata: {\"status\":\"connected\"}\n\n");

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (durationTimer) clearTimeout(durationTimer);
      try { res.end(); } catch { /* already closed */ }
    };

    const send = (type: string, data: Record<string, unknown>) => {
      if (!closed && !res.writableEnded) {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    const poll = async () => {
      if (pollInFlight || closed || res.writableEnded) return;
      pollInFlight = true;
      try {
        const db = await getDb();
        if (!db) throw new Error("PostgreSQL unavailable");
        const incidentCursor = or(
          gt(virtualAdminIncidents.updatedAt, incidentCursorAt),
          and(
            eq(virtualAdminIncidents.updatedAt, incidentCursorAt),
            gt(virtualAdminIncidents.id, incidentCursorId),
          ),
        );
        const incidents = await db.select().from(virtualAdminIncidents)
          .where(and(incidentCursor, tenantScope))
          .orderBy(asc(virtualAdminIncidents.updatedAt), asc(virtualAdminIncidents.id))
          .limit(100);
        for (const incident of incidents) {
          incidentCursorAt = incident.updatedAt;
          incidentCursorId = incident.id;
          const eventType = incident.status === "resolved"
            ? "incident.resolved"
            : incident.createdAt >= connectedAt
              ? "incident.created"
              : "incident.updated";
          send(eventType, {
            incidentId: incident.id,
            tenantId: incident.tenantId,
            severity: incident.severity,
            title: incident.title,
            message: incident.message,
            status: incident.status,
            sensorId: incident.sensorId,
            ruleId: incident.ruleId,
            updatedAt: incident.updatedAt.toISOString(),
          });
        }

        const requestConditions = [or(
          gt(virtualAdminApprovals.requestedAt, approvalRequestCursorAt),
          and(
            eq(virtualAdminApprovals.requestedAt, approvalRequestCursorAt),
            gt(virtualAdminApprovals.id, approvalRequestCursorId),
          ),
        )];
        if (tenantScope) requestConditions.push(tenantScope as any);
        const approvals = await db.select({
          approval: virtualAdminApprovals,
          tenantId: virtualAdminIncidents.tenantId,
        }).from(virtualAdminApprovals)
          .innerJoin(virtualAdminIncidents, eq(virtualAdminApprovals.incidentId, virtualAdminIncidents.id))
          .where(and(...requestConditions))
          .orderBy(asc(virtualAdminApprovals.requestedAt), asc(virtualAdminApprovals.id))
          .limit(100);
        for (const { approval, tenantId: approvalTenantId } of approvals) {
          if (approval.requestedAt > approvalRequestCursorAt) {
            approvalRequestCursorAt = approval.requestedAt;
            approvalRequestCursorId = approval.id;
          } else if (approval.requestedAt.getTime() === approvalRequestCursorAt.getTime()) {
            approvalRequestCursorId = Math.max(approvalRequestCursorId, approval.id);
          }
          send("approval.requested", {
            approvalId: approval.id,
            incidentId: approval.incidentId,
            tenantId: approvalTenantId,
            actionType: approval.actionType,
            status: approval.status,
            requestedAt: approval.requestedAt.toISOString(),
          });
        }

        const decisionConditions = [or(
          gt(virtualAdminApprovals.decidedAt, approvalDecisionCursorAt),
          and(
            eq(virtualAdminApprovals.decidedAt, approvalDecisionCursorAt),
            gt(virtualAdminApprovals.id, approvalDecisionCursorId),
          ),
        )];
        if (tenantScope) decisionConditions.push(tenantScope as any);
        const decisions = await db.select({
          approval: virtualAdminApprovals,
          tenantId: virtualAdminIncidents.tenantId,
        }).from(virtualAdminApprovals)
          .innerJoin(virtualAdminIncidents, eq(virtualAdminApprovals.incidentId, virtualAdminIncidents.id))
          .where(and(...decisionConditions))
          .orderBy(asc(virtualAdminApprovals.decidedAt), asc(virtualAdminApprovals.id))
          .limit(100);
        for (const { approval, tenantId: approvalTenantId } of decisions) {
          if (approval.decidedAt && approval.decidedAt > approvalDecisionCursorAt) {
            approvalDecisionCursorAt = approval.decidedAt;
            approvalDecisionCursorId = approval.id;
          } else if (approval.decidedAt && approval.decidedAt.getTime() === approvalDecisionCursorAt.getTime()) {
            approvalDecisionCursorId = Math.max(approvalDecisionCursorId, approval.id);
          }
          send("approval.decided", {
            approvalId: approval.id,
            incidentId: approval.incidentId,
            tenantId: approvalTenantId,
            actionType: approval.actionType,
            status: approval.status,
            decidedAt: approval.decidedAt?.toISOString() ?? null,
          });
        }
      } catch (error) {
        console.warn("[GuardianSSE] PostgreSQL event poll failed:", error);
      } finally {
        pollInFlight = false;
      }
    };

    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    heartbeatTimer = setInterval(() => {
      if (closed || res.writableEnded) return cleanup();
      res.write(": heartbeat\n\n");
    }, 30_000);
    durationTimer = setTimeout(() => {
      send("close", { reason: "max_duration" });
      cleanup();
    }, MAX_CONNECTION_MS);
    void poll();
    req.on("close", cleanup);
    req.on("error", cleanup);
  });

  return router;
}
