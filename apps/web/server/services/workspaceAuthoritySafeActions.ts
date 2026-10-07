import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { runnerNodes, workerJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { workspaceFactsFromSnapshot } from "./spec224WorkspaceSpecSet";

export const WORKSPACE_AUTHORITY_ACTIONS = [
  "SYNC_WORKSPACE_SAFELY",
  "INSPECT_LOCAL_CHANGES",
  "OPEN_CANONICAL_WORKSPACE",
  "RECOVER_WORK",
  "INTEGRATE_COMPLETED_WORK",
  "RETIRE_SAFE_WORKTREE",
  "VERIFY_PROJECT_CONVERGENCE",
] as const;

export type WorkspaceAuthorityAction = (typeof WORKSPACE_AUTHORITY_ACTIONS)[number];

export type WorkspaceAuthorityActionRequest = {
  tenantId: string;
  actorId: number;
  projectId: string;
  repositoryId: string;
  workspaceId?: string;
  action: WorkspaceAuthorityAction;
  idempotencyKey: string;
  payload: Record<string, string | number | boolean | null>;
};

export class WorkspaceAuthorityActionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "WorkspaceAuthorityActionError";
  }
}

/** Authorize from an owned, trusted Runner registration and its bound project facts. */
export async function resolveOwnedWorkspaceAuthority(input: Pick<
  WorkspaceAuthorityActionRequest, "tenantId" | "actorId" | "projectId" | "repositoryId" | "workspaceId"
>) {
  if (!input.tenantId.trim() || !Number.isSafeInteger(input.actorId) || input.actorId <= 0)
    throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_AUTHENTICATION_REQUIRED");
  const rows = await getDb().select({
    runnerId: runnerNodes.runnerId,
    ownerUserId: runnerNodes.ownerUserId,
    trustState: runnerNodes.trustState,
    status: runnerNodes.status,
    activeSessionId: runnerNodes.activeSessionId,
    currentSnapshotRevision: runnerNodes.currentSnapshotRevision,
    currentSnapshotJson: runnerNodes.currentSnapshotJson,
    snapshotObservedAt: runnerNodes.snapshotObservedAt,
    snapshotExpiresAt: runnerNodes.snapshotExpiresAt,
  }).from(runnerNodes).where(and(
    eq(runnerNodes.tenantId, input.tenantId),
    eq(runnerNodes.ownerUserId, input.actorId),
    eq(runnerNodes.trustState, "trusted"),
    isNull(runnerNodes.revokedAt),
  ));
  const matches = rows.filter(row => row.ownerUserId === input.actorId && row.trustState === "trusted")
    .flatMap(row => workspaceFactsFromSnapshot(row.currentSnapshotJson)
    .filter(fact => fact.projectId === input.projectId && fact.repositoryId === input.repositoryId &&
      (!input.workspaceId || fact.workspaceId === input.workspaceId))
    .map(fact => ({
      runnerId: row.runnerId,
      ownerUserId: row.ownerUserId,
      trustState: row.trustState,
      runnerStatus: row.status,
      activeSessionId: row.activeSessionId,
      snapshotRevision: row.currentSnapshotRevision,
      snapshotObservedAt: row.snapshotObservedAt?.toISOString() ?? null,
      snapshotExpiresAt: row.snapshotExpiresAt?.toISOString() ?? null,
      workspace: fact,
    })));
  if (!matches.length) throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_AUTHORITY_NOT_FOUND");
  const now = Date.now();
  const freshMatches = matches.filter(match => {
    const observedAt = match.snapshotObservedAt ? Date.parse(match.snapshotObservedAt) : Number.NaN;
    const expiresAt = match.snapshotExpiresAt ? Date.parse(match.snapshotExpiresAt) : Number.NaN;
    return Number.isFinite(observedAt) && Number.isFinite(expiresAt) && observedAt <= now && expiresAt > now;
  });
  if (!freshMatches.length) throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_AUTHORITY_STALE");
  // A project/repository can be registered on multiple hosts. The current
  // request has no explicit host selector, so never choose a Runner by row order.
  const runnerIds = new Set(freshMatches.map(match => match.runnerId));
  if (runnerIds.size > 1) throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_AUTHORITY_CONFLICT");
  return freshMatches[0];
}

export async function enqueueWorkspaceAuthorityAction(input: WorkspaceAuthorityActionRequest) {
  const authority = await resolveOwnedWorkspaceAuthority(input);
  const clientKey = input.idempotencyKey.trim();
  if (!clientKey || clientKey.length > 200)
    throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_IDEMPOTENCY_KEY_INVALID");
  const keyMaterial = `${input.tenantId}:${input.actorId}:${input.projectId}:${clientKey}`;
  const idempotencyKey = `workspace-action:${createHash("sha256").update(keyMaterial).digest("hex")}`;
  const correlationId = `workspace-action:${createHash("sha256").update(`${keyMaterial}:${input.action}`).digest("hex").slice(0, 48)}`;
  try {
    const job = await createControlPlaneJob({
      context: {
        tenantId: input.tenantId,
        actorType: "user",
        actorId: input.actorId,
        authorizationScope: "workspace-authority:owned-runner",
        correlationId,
        idempotencyKey,
      },
      definition: {
        contractVersion: "feature-186-v1",
        jobType: "workspace.authority.safe_action",
        executionClass: "short",
        priority: 140,
        input: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          projectId: input.projectId,
          repositoryId: input.repositoryId,
          workspaceId: input.workspaceId ?? null,
          action: input.action,
          payload: input.payload,
          authority: {
            runnerId: authority.runnerId,
            snapshotRevision: authority.snapshotRevision,
            snapshotObservedAt: authority.snapshotObservedAt,
            snapshotExpiresAt: authority.snapshotExpiresAt,
          },
        },
        retryPolicy: {
          maxAttempts: 2, baseDelayMs: 2_000, maxDelayMs: 10_000,
          jitter: "bounded", deadlineMs: 15 * 60_000,
          allowedErrorClasses: ["retryable", "timeout", "unavailable"],
        },
        timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 60_000 },
      },
    });
    return { status: job.created ? "QUEUED" as const : "REPLAY_SAFE" as const, jobId: job.jobId, authority };
  } catch (error) {
    if (error instanceof Error && error.message.includes("IDEMPOTENCY_CONFLICT"))
      throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_IDEMPOTENCY_CONFLICT");
    throw error;
  }
}

export async function getWorkspaceAuthorityActionStatus(input: {
  tenantId: string;
  actorId: number;
  jobId: string;
}) {
  const [job] = await getDb().select({
    id: workerJobs.id,
    status: workerJobs.status,
    inputJson: workerJobs.inputJson,
    outputJson: workerJobs.outputJson,
    createdAt: workerJobs.createdAt,
    finishedAt: workerJobs.finishedAt,
  }).from(workerJobs).where(and(
    eq(workerJobs.id, input.jobId),
    eq(workerJobs.tenantId, input.tenantId),
    eq(workerJobs.requestedByUserId, input.actorId),
    eq(workerJobs.jobType, "workspace.authority.safe_action"),
  )).limit(1);
  if (!job) throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_NOT_FOUND");
  const output = job.outputJson && typeof job.outputJson === "object" ? job.outputJson as Record<string, unknown> : null;
  return {
    jobId: job.id,
    status: job.status,
    receipt: output?.receipt ?? null,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}
