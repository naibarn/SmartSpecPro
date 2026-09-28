import { eq, and, gt, lt } from "drizzle-orm";
import { getDb } from "../../db";
import { virtualAdminApprovals, virtualAdminIncidents } from "../../../drizzle/schema";
import type { ActuatorFn, ActuatorResult } from "./types";
import { APPROVAL_REQUIRED_ACTIONS, APPROVAL_TTL } from "./types";

const registry = new Map<string, ActuatorFn>();

export function registerActuator(actionType: string, fn: ActuatorFn): void {
  registry.set(actionType, fn);
}

export function getActuator(actionType: string): ActuatorFn | undefined {
  return registry.get(actionType);
}

/**
 * Execute an action — routes through approval gate or auto-fix path.
 */
export async function executeAction(
  actionType: string,
  params: Record<string, unknown>,
  incident: { id: number; tenantId?: string | null; severity: string },
  tenantId?: string,
): Promise<ActuatorResult> {
  const fn = registry.get(actionType);
  if (!fn) {
    return { success: false, message: `Unknown action type: ${actionType}` };
  }

  // Approval-required actions create a pending record
  if (APPROVAL_REQUIRED_ACTIONS.has(actionType)) {
    return createApprovalRecord(actionType, params, incident);
  }

  // Auto-fix: execute immediately
  try {
    const result = await fn(params, incident);
    const db = await getDb();
    if (db) {
      await db
        .update(virtualAdminIncidents)
        .set({
          actionTaken: actionType,
          actionResult: result.message,
          updatedAt: new Date(),
        })
        .where(eq(virtualAdminIncidents.id, incident.id));
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action execution failed";
    return { success: false, message };
  }
}

async function createApprovalRecord(
  actionType: string,
  params: Record<string, unknown>,
  incident: { id: number; severity: string },
): Promise<ActuatorResult> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available" };

  const ttl = incident.severity === "critical" ? APPROVAL_TTL.critical : APPROVAL_TTL.default;

  await db.insert(virtualAdminApprovals).values({
    incidentId: incident.id,
    actionType,
    actionParamsJson: params,
    status: "pending",
    expiresAt: new Date(Date.now() + ttl),
  });

  // Publish SSE event via Redis (best-effort)
  try {
    const { getRedisClient } = await import("../redis");
    const redis = getRedisClient();
    if (redis) {
      await redis.publish(
        "guardian:events",
        JSON.stringify({
          type: "approval_created",
          incidentId: incident.id,
          actionType,
          status: "pending",
          timestamp: new Date().toISOString(),
        }),
      );
    }
  } catch {
    // Non-critical
  }

  return { success: true, message: "Approval requested" };
}

/**
 * Decide on a pending approval (approve/reject) with optimistic locking.
 * tenantId is required to ensure the approval's incident belongs to the
 * caller's tenant (cross-tenant isolation guard).
 */
export async function decideApproval(
  approvalId: number,
  decision: "approved" | "rejected",
  decidedBy: number,
  tenantId?: string,
  comment?: string,
): Promise<ActuatorResult> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available" };

  // Cross-tenant isolation: verify the approval's incident belongs to the caller's tenant.
  if (tenantId) {
    const ownerCheck = await db
      .select({ incidentId: virtualAdminApprovals.incidentId })
      .from(virtualAdminApprovals)
      .where(eq(virtualAdminApprovals.id, approvalId))
      .limit(1);

    if (ownerCheck.length === 0) {
      return { success: false, message: "Approval not found" };
    }

    const incidentCheck = await db
      .select({ tenantId: virtualAdminIncidents.tenantId })
      .from(virtualAdminIncidents)
      .where(eq(virtualAdminIncidents.id, ownerCheck[0].incidentId))
      .limit(1);

    if (incidentCheck.length === 0 || incidentCheck[0].tenantId !== tenantId) {
      return { success: false, message: "Approval not found" };
    }
  }

  // Optimistic locking: only update if still pending
  const result = await db
    .update(virtualAdminApprovals)
    .set({
      status: decision,
      decidedBy,
      decidedAt: new Date(),
      decisionComment: comment ?? null,
    })
    .where(
      and(
        eq(virtualAdminApprovals.id, approvalId),
        eq(virtualAdminApprovals.status, "pending"),
        gt(virtualAdminApprovals.expiresAt, new Date()),
      ),
    )
    .returning({ id: virtualAdminApprovals.id });

  if (result.length === 0) {
    return { success: false, message: "Approval already decided or expired" };
  }

  // If approved, execute the action
  if (decision === "approved") {
    const approvals = await db
      .select()
      .from(virtualAdminApprovals)
      .where(eq(virtualAdminApprovals.id, approvalId))
      .limit(1);

    if (approvals.length > 0) {
      const approval = approvals[0];
      const incidents = await db
        .select()
        .from(virtualAdminIncidents)
        .where(eq(virtualAdminIncidents.id, approval.incidentId))
        .limit(1);

      if (incidents.length > 0) {
        const incident = incidents[0];
        const fn = registry.get(approval.actionType);
        if (fn) {
          try {
            const execResult = await fn(
              (approval.actionParamsJson as Record<string, unknown>) ?? {},
              { id: incident.id, tenantId: incident.tenantId, severity: incident.severity },
            );
            await db
              .update(virtualAdminIncidents)
              .set({
                actionTaken: approval.actionType,
                actionResult: execResult.message,
                status: execResult.success ? "resolved" : "open",
                resolvedAt: execResult.success ? new Date() : null,
                resolvedBy: execResult.success ? decidedBy : null,
                updatedAt: new Date(),
              })
              .where(eq(virtualAdminIncidents.id, incident.id));
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Execution failed";
            await db
              .update(virtualAdminApprovals)
              .set({ status: "execution_failed" })
              .where(eq(virtualAdminApprovals.id, approvalId));
            await db
              .update(virtualAdminIncidents)
              .set({ actionResult: errMsg, updatedAt: new Date() })
              .where(eq(virtualAdminIncidents.id, incident.id));
            return { success: false, message: errMsg };
          }
        }
      }
    }
  }

  // Publish SSE event
  try {
    const { getRedisClient } = await import("../redis");
    const redis = getRedisClient();
    if (redis) {
      await redis.publish(
        "guardian:events",
        JSON.stringify({
          type: "approval_decided",
          approvalId,
          decision,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  } catch {
    // Non-critical
  }

  return { success: true, message: `Approval ${decision}` };
}

/**
 * Expire stale approvals. Called by scheduler/watchdog.
 */
export async function expireStaleApprovals(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const expired = await db
    .update(virtualAdminApprovals)
    .set({ status: "expired" })
    .where(
      and(
        eq(virtualAdminApprovals.status, "pending"),
        lt(virtualAdminApprovals.expiresAt, new Date()),
      ),
    )
    .returning({ id: virtualAdminApprovals.id });

  if (expired.length > 0) {
    console.warn(`[Guardian] Expired ${expired.length} approval(s); related incidents remain open for triage`);
  }
}
