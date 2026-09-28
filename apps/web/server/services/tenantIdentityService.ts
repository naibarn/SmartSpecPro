import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  connectedDevices,
  creditTransactions,
  marketplaceExtensionPairings,
  mcpOAuthGrants,
  mcpOAuthRefreshTokens,
  tenantIdentityActions,
  tenantIdentityEvents,
  tenants,
  users,
  workerDelegatedSessions,
  workerJobs,
} from "../../drizzle/schema";
import { createJobControlPlane } from "./jobControlPlane";
import { JobControlPlaneError } from "./jobControlPlaneTypes";

export const TENANT_MOVE_CONFIRMATION = "MOVE TENANT";

const QUEUEABLE_JOB_STATUSES = ["pending", "queued", "retry_scheduled"] as const;
const ACTIVE_JOB_STATUSES = [
  "leased", "claimed", "preparing", "running", "waiting_external",
  "uploading", "publishing", "indexing",
] as const;

export type TenantMoveActor = {
  actorId: number;
  authorizationScope: string;
  correlationId?: string;
};

export type TenantMoveInput = TenantMoveActor & {
  userId: number;
  targetTenantId: string;
  reason: string;
  confirmation: string;
  actionId: string;
};

export type TenantMoveResult = {
  actionId: string;
  userId: number;
  sourceTenantId: string;
  targetTenantId: string;
  status: "completed";
  queuedJobsCancelled: number;
  creditsReset: number;
  sessionsRevoked: number;
  effectiveAt: string;
  created: boolean;
};

function bounded(value: unknown, field: string, max: number): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) {
    throw new JobControlPlaneError("INVALID_INPUT", `${field} is invalid`);
  }
  return normalized;
}

export function buildTenantMoveTargetHash(input: {
  userId: number;
  targetTenantId: string;
  reason: string;
  confirmation: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      userId: input.userId,
      targetTenantId: input.targetTenantId,
      reason: input.reason,
      confirmation: input.confirmation,
    }), "utf8")
    .digest("hex");
}

function actionOutcome(row: { outcomeJson: Record<string, unknown> }): TenantMoveResult {
  return row.outcomeJson as unknown as TenantMoveResult;
}

function isQueueable(status: string): boolean {
  return (QUEUEABLE_JOB_STATUSES as readonly string[]).includes(status);
}

function isActive(status: string): boolean {
  return (ACTIVE_JOB_STATUSES as readonly string[]).includes(status);
}

async function markActionFailure(
  database: any,
  userId: number,
  actionId: string,
  phase: "blocked" | "paused",
  code: string,
): Promise<void> {
  await database.update(tenantIdentityActions)
    .set({ phase, safeErrorCode: code, updatedAt: new Date() })
    .where(and(eq(tenantIdentityActions.userId, userId), eq(tenantIdentityActions.actionId, actionId)));
}

/**
 * Move one user's tenant binding through a durable fence. The fence is
 * written before queue cancellation, so new user-owned canonical jobs are
 * rejected while this operation is between cancellation and identity commit.
 */
export async function moveUserTenant(input: TenantMoveInput): Promise<TenantMoveResult> {
  const actionId = bounded(input.actionId, "actionId", 128);
  const targetTenantId = bounded(input.targetTenantId, "targetTenantId", 36);
  const reason = bounded(input.reason, "reason", 500);
  if (input.confirmation.trim() !== TENANT_MOVE_CONFIRMATION) {
    throw new JobControlPlaneError("CONFIRMATION_REQUIRED", "Tenant move confirmation is required");
  }
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0 || !Number.isSafeInteger(input.actorId) || input.actorId <= 0) {
    throw new JobControlPlaneError("INVALID_INPUT", "User identity is invalid");
  }

  const database = await getDb();
  if (!database) throw new JobControlPlaneError("DATABASE_UNAVAILABLE", "Database unavailable");
  const commandTargetHash = buildTenantMoveTargetHash({
    userId: input.userId,
    targetTenantId,
    reason,
    confirmation: input.confirmation.trim(),
  });

  const preparation = await database.transaction(async (tx: any) => {
    const [existing] = await tx.select().from(tenantIdentityActions)
      .where(and(eq(tenantIdentityActions.userId, input.userId), eq(tenantIdentityActions.actionId, actionId)))
      .limit(1);
    if (existing) {
      if (existing.commandTargetHash !== commandTargetHash) {
        throw new JobControlPlaneError("IDEMPOTENCY_CONFLICT", "Action key was used for another tenant move");
      }
      if (existing.phase === "completed") return { completed: actionOutcome(existing) };
    } else {
      await tx.insert(tenantIdentityActions).values({
        id: randomUUID(),
        userId: input.userId,
        actionId,
        commandTargetHash,
        phase: "pending",
        fencingVersion: 0,
        authorizationDecision: "allowed_system_admin",
        reason,
        outcomeJson: {},
      }).onConflictDoNothing();
    }

    const [action] = await tx.select().from(tenantIdentityActions)
      .where(and(eq(tenantIdentityActions.userId, input.userId), eq(tenantIdentityActions.actionId, actionId)))
      .limit(1);
    if (!action || action.commandTargetHash !== commandTargetHash) {
      throw new JobControlPlaneError("IDEMPOTENCY_CONFLICT", "Action key was used for another tenant move");
    }

    await tx.execute(sql`SELECT 1 FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`);
    const [user] = await tx.select({
      id: users.id,
      currentTenantId: users.currentTenantId,
      credits: users.credits,
      isSystemUser: users.isSystemUser,
      isDisabled: users.isDisabled,
    }).from(users).where(eq(users.id, input.userId)).limit(1);
    const [targetTenant] = await tx.select({ id: tenants.id }).from(tenants)
      .where(and(eq(tenants.id, targetTenantId), eq(tenants.isActive, true))).limit(1);
    if (!user || !user.currentTenantId) throw new JobControlPlaneError("TENANT_NOT_BOUND", "User has no source tenant");
    if (user.isSystemUser || user.id === -1) throw new JobControlPlaneError("SYSTEM_USER_PROTECTED", "System user cannot be moved");
    if (user.isDisabled) throw new JobControlPlaneError("USER_DISABLED", "Disabled user cannot be moved");
    if (!targetTenant) throw new JobControlPlaneError("TARGET_TENANT_INVALID", "Target tenant is not active");
    if (user.currentTenantId === targetTenantId) throw new JobControlPlaneError("TENANT_ALREADY_BOUND", "User is already bound to the target tenant");

    await tx.update(tenantIdentityActions).set({
      sourceTenantId: user.currentTenantId,
      targetTenantId,
      phase: "fenced",
      fencingVersion: (action.fencingVersion ?? 0) + 1,
      safeErrorCode: null,
      updatedAt: new Date(),
    }).where(eq(tenantIdentityActions.id, action.id));

    const jobs = await tx.select({ id: workerJobs.id, status: workerJobs.status, attempt: workerJobs.attempt })
      .from(workerJobs)
      .where(and(
        eq(workerJobs.tenantId, user.currentTenantId),
        eq(workerJobs.requestedByUserId, input.userId),
        sql`"status" NOT IN ('succeeded', 'completed', 'failed', 'cancelled', 'canceled', 'expired')`,
      ));
    const activeJobs = jobs.filter(job => isActive(job.status));
    return {
      sourceTenantId: user.currentTenantId,
      targetTenantId,
      priorCredits: user.credits,
      actionId: action.id,
      activeJobs,
      queueableJobs: jobs.filter(job => isQueueable(job.status)),
    };
  });

  if ("completed" in preparation) return preparation.completed;
  if (preparation.activeJobs.length > 0) {
    await markActionFailure(database, input.userId, actionId, "blocked", "ACTIVE_JOB_BLOCKED");
    throw new JobControlPlaneError("ACTIVE_JOB_BLOCKED", "Active canonical jobs must finish before tenant move");
  }

  const controlPlane = createJobControlPlane();
  let queuedJobsCancelled = 0;
  try {
    for (const job of preparation.queueableJobs) {
      await controlPlane.cancel(
        job.id,
        "tenant_move_fence",
        `tenant-move:${input.userId}:${actionId}:${job.id}`,
        input.actorId,
        { tenantId: preparation.sourceTenantId, requestedByUserId: input.userId, authorizationScope: input.authorizationScope },
      );
      queuedJobsCancelled += 1;
    }
  } catch {
    await markActionFailure(database, input.userId, actionId, "paused", "QUEUE_CANCELLATION_FAILED");
    throw new JobControlPlaneError("QUEUE_CANCELLATION_FAILED", "Queued canonical work could not be cancelled");
  }

  return database.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT 1 FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`);
    const [user] = await tx.select({ id: users.id, currentTenantId: users.currentTenantId, credits: users.credits })
      .from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user || user.currentTenantId !== preparation.sourceTenantId) {
      await tx.update(tenantIdentityActions).set({ phase: "blocked", safeErrorCode: "SOURCE_TENANT_CHANGED", updatedAt: new Date() })
        .where(and(eq(tenantIdentityActions.userId, input.userId), eq(tenantIdentityActions.actionId, actionId)));
      throw new JobControlPlaneError("SOURCE_TENANT_CHANGED", "User tenant changed during move");
    }

    const remaining = await tx.select({ id: workerJobs.id, status: workerJobs.status })
      .from(workerJobs).where(and(
        eq(workerJobs.tenantId, preparation.sourceTenantId),
        eq(workerJobs.requestedByUserId, input.userId),
        sql`"status" NOT IN ('succeeded', 'completed', 'failed', 'cancelled', 'canceled', 'expired')`,
      ));
    if (remaining.some(job => isActive(job.status) || isQueueable(job.status))) {
      await tx.update(tenantIdentityActions).set({ phase: "blocked", safeErrorCode: "QUEUE_CANCELLATION_INCOMPLETE", updatedAt: new Date() })
        .where(and(eq(tenantIdentityActions.userId, input.userId), eq(tenantIdentityActions.actionId, actionId)));
      throw new JobControlPlaneError("QUEUE_CANCELLATION_INCOMPLETE", "Canonical work appeared during tenant move");
    }

    const now = new Date();
    const priorCredits = user.credits;
    await tx.update(users).set({
      currentTenantId: targetTenantId,
      credits: 0,
      sessionRevokedAt: now,
      tenantIdentityMigrationReason: reason.slice(0, 120),
      tenantIdentityMigratedAt: now,
      updatedAt: now,
    }).where(and(eq(users.id, input.userId), eq(users.currentTenantId, preparation.sourceTenantId)));

    if (priorCredits > 0) {
      await tx.insert(creditTransactions).values({
        userId: input.userId,
        amount: -priorCredits,
        type: "adjustment",
        description: "Tenant move credit reset",
        balanceAfter: 0,
        referenceId: `tenant-move:${input.userId}:${actionId}`,
        idempotencyKey: `tenant-move-credit:${input.userId}:${actionId}`,
        sourceType: "admin",
        tenantId: preparation.sourceTenantId,
        metadata: { action: "tenant_move_credit_reset", actorId: input.actorId },
      }).onConflictDoNothing();
    }

    const revokeReason = `tenant_move:${actionId}`;
    const deviceResult = await tx.update(connectedDevices).set({
      status: "revoked", revokedAt: now, revokedByUserId: input.actorId,
      revocationReason: revokeReason, updatedAt: now,
    }).where(and(eq(connectedDevices.ownerUserId, input.userId), eq(connectedDevices.tenantId, preparation.sourceTenantId), eq(connectedDevices.status, "active"))).returning({ id: connectedDevices.id });
    await tx.update(mcpOAuthRefreshTokens).set({ revokedAt: now }).where(sql`"grantId" IN (SELECT "id" FROM "mcp_oauth_grants" WHERE "userId" = ${input.userId} AND "tenantId" = ${preparation.sourceTenantId}) AND "revokedAt" IS NULL`);
    await tx.update(mcpOAuthGrants).set({ status: "revoked", revokedAt: now, revokedByUserId: input.actorId, revocationReason: revokeReason, updatedAt: now })
      .where(and(eq(mcpOAuthGrants.userId, input.userId), eq(mcpOAuthGrants.tenantId, preparation.sourceTenantId), eq(mcpOAuthGrants.status, "active")));
    await tx.update(marketplaceExtensionPairings).set({ status: "revoked", updatedAt: now })
      .where(and(eq(marketplaceExtensionPairings.userId, input.userId), eq(marketplaceExtensionPairings.tenantId, preparation.sourceTenantId), eq(marketplaceExtensionPairings.status, "active")));
    await tx.update(workerDelegatedSessions).set({ revokedAt: now, updatedAt: now })
      .where(and(eq(workerDelegatedSessions.ownerUserId, input.userId), eq(workerDelegatedSessions.tenantId, preparation.sourceTenantId), sql`"revokedAt" IS NULL`));

    const eventKey = `tenant-move:${input.userId}:${actionId}`;
    await tx.insert(tenantIdentityEvents).values({
      id: randomUUID(), userId: input.userId, actorType: "system_admin", actorId: input.actorId,
      oldTenantId: preparation.sourceTenantId, newTenantId: targetTenantId, action: "tenant_move",
      reason, priorCredits, currentCredits: 0, creditResetStatus: priorCredits > 0 ? "reset" : "not_needed",
      sessionRevocationStatus: "revoked", actionIdempotencyKey: actionId, eventKey,
      correlationId: input.correlationId ?? null, createdAt: now,
    }).onConflictDoNothing();

    const result: TenantMoveResult = {
      actionId, userId: input.userId, sourceTenantId: preparation.sourceTenantId, targetTenantId,
      status: "completed", queuedJobsCancelled, creditsReset: priorCredits,
      sessionsRevoked: deviceResult.length, effectiveAt: now.toISOString(), created: true,
    };
    await tx.update(tenantIdentityActions).set({
      phase: "completed", outcomeJson: result, safeErrorCode: null, effectiveAt: now, updatedAt: now,
    }).where(and(eq(tenantIdentityActions.userId, input.userId), eq(tenantIdentityActions.actionId, actionId)));
    return result;
  });
}

export async function getTenantMoveAction(input: { userId: number; actionId: string }) {
  const database = await getDb();
  if (!database) throw new JobControlPlaneError("DATABASE_UNAVAILABLE", "Database unavailable");
  const [row] = await database.select({
    actionId: tenantIdentityActions.actionId,
    userId: tenantIdentityActions.userId,
    phase: tenantIdentityActions.phase,
    targetTenantId: tenantIdentityActions.targetTenantId,
    safeErrorCode: tenantIdentityActions.safeErrorCode,
    outcomeJson: tenantIdentityActions.outcomeJson,
  }).from(tenantIdentityActions).where(and(eq(tenantIdentityActions.userId, input.userId), eq(tenantIdentityActions.actionId, input.actionId))).limit(1);
  return row ?? null;
}
