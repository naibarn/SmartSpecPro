/**
 * Work Item Service — revision/version-safe team work primitives.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  assistantProfiles,
  teamWorkItems,
  workItemEvents,
  type TeamWorkItem,
} from "../../drizzle/schema";
import {
  buildVerificationPolicyEvidence,
  resolveVerificationPolicyForRiskClass,
  type VerificationRiskClass,
} from "./verificationPolicy";

const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;

export type WorkItemStatus =
  | "planned"
  | "in_progress"
  | "in_review"
  | "needs_revision"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled"
  | "superseded";

export class WorkItemVersionConflictError extends Error {
  constructor(
    public readonly workItemId: string,
    public readonly expectedRevisionVersion: number,
    public readonly latestRevisionVersion: number,
  ) {
    super(
      `Work item ${workItemId} revision conflict: expected ${expectedRevisionVersion}, latest ${latestRevisionVersion}`,
    );
    this.name = "WorkItemVersionConflictError";
  }
}

export class WorkItemLockConflictError extends Error {
  constructor(
    public readonly workItemId: string,
    public readonly lockOwnerMemberId: string,
    public readonly lockExpiresAt: Date | null,
  ) {
    super(`Work item ${workItemId} is locked by ${lockOwnerMemberId}`);
    this.name = "WorkItemLockConflictError";
  }
}

export class WorkItemSupersededError extends Error {
  constructor(
    public readonly workItemId: string,
    public readonly supersededByWorkItemId: string,
  ) {
    super(`Work item ${workItemId} has been superseded by ${supersededByWorkItemId}`);
    this.name = "WorkItemSupersededError";
  }
}

export interface CreateWorkItemInput {
  tenantId: string;
  teamId: string;
  roomId: string;
  runId?: string;
  routineId?: string;
  sourceType?: string;
  sourceRef?: string;
  title: string;
  objective?: string;
  status?: WorkItemStatus;
  priority?: "low" | "normal" | "high" | "urgent";
  riskClass?: "low" | "medium" | "high" | "critical";
  assignedMemberId?: string;
  reviewerMemberId?: string;
  approverMemberId?: string;
  threadRootMessageId?: string;
  activeDraftArtifactId?: string;
  artifactRefsJson?: unknown;
  dueAt?: Date;
  requiresApproval?: boolean;
  actorAssistantId?: string;
  actorUserId?: number;
  autoAssignByRole?: boolean;
}

export interface ReviseWorkItemInput {
  tenantId?: string;
  workItemId: string;
  expectedRevisionVersion: number;
  actorAssistantId: string;
  title?: string;
  objective?: string;
  status?: WorkItemStatus;
  assignedMemberId?: string;
  reviewerMemberId?: string;
  approverMemberId?: string;
  threadRootMessageId?: string;
  activeDraftArtifactId?: string;
  artifactRefsJson?: unknown;
}

export interface AcquireWorkItemLockInput {
  tenantId?: string;
  workItemId: string;
  memberId: string;
  ttlMs?: number;
  now?: Date;
}

export interface ApproveWorkItemRevisionInput {
  tenantId?: string;
  workItemId: string;
  expectedRevisionVersion: number;
  approverMemberId: string;
}

export interface RejectWorkItemRevisionInput {
  tenantId?: string;
  workItemId: string;
  expectedRevisionVersion: number;
  approverMemberId: string;
  reason?: string;
}

export type WorkItemWorkflowStep = "research" | "review" | "approval";

export interface RouteWorkItemByRoleInput {
  tenantId?: string;
  workItemId: string;
  expectedRevisionVersion: number;
  actorAssistantId: string;
  targetStep?: WorkItemWorkflowStep;
}

export interface TeamWorkflowAssignments {
  orchestratorMemberId: string | null;
  researchMemberId: string | null;
  reviewerMemberId: string | null;
  approverMemberId: string | null;
  publisherMemberId: string | null;
}

function hasArtifactRefs(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function suggestAutoAdvanceStep(workItem: TeamWorkItem): WorkItemWorkflowStep | null {
  if (
    workItem.status === "in_progress" &&
    (Boolean(workItem.activeDraftArtifactId) || hasArtifactRefs(workItem.artifactRefsJson))
  ) {
    return "review";
  }

  if (workItem.status === "needs_revision") {
    return "research";
  }

  return null;
}

async function getWorkItemOrThrow(workItemId: string): Promise<TeamWorkItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [workItem] = await db
    .select()
    .from(teamWorkItems)
    .where(eq(teamWorkItems.id, workItemId))
    .limit(1);

  if (!workItem) {
    throw new Error(`Work item ${workItemId} not found`);
  }

  return workItem;
}

async function ensureWorkItemTenant(
  workItemId: string,
  tenantId?: string,
): Promise<TeamWorkItem> {
  const workItem = await getWorkItemOrThrow(workItemId);
  if (tenantId && workItem.tenantId !== tenantId) {
    throw new Error(`Work item ${workItemId} does not belong to tenant ${tenantId}`);
  }
  return workItem;
}

async function recordWorkItemEvent(input: {
  workItemId: string;
  roomId: string;
  runId?: string | null;
  actorAssistantId?: string | null;
  actorUserId?: number | null;
  eventType: string;
  fromStatus?: WorkItemStatus | null;
  toStatus?: WorkItemStatus | null;
  revisionVersion?: number | null;
  detailJson?: Record<string, unknown> | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(workItemEvents)
    .values({
      workItemId: input.workItemId,
      roomId: input.roomId,
      runId: input.runId ?? null,
      actorAssistantId: input.actorAssistantId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      revisionVersion: input.revisionVersion ?? null,
      detailJson: input.detailJson ?? null,
    })
    .returning();
}

function pickFirstProfileId(
  profiles: Array<{
    id: string;
    memberKind: string;
    memberRole: string;
    isLead: boolean;
  }>,
  predicate: (profile: { id: string; memberKind: string; memberRole: string; isLead: boolean }) => boolean,
): string | null {
  return profiles.find(predicate)?.id ?? null;
}

function pickVerificationProfileId(
  profiles: Array<{
    id: string;
    memberKind: string;
    memberRole: string;
    isLead: boolean;
  }>,
  riskClass: VerificationRiskClass,
): string | null {
  const reviewerRolesByRisk: Record<VerificationRiskClass, string[]> = {
    low: ["reviewer", "domain", "specialist"],
    medium: ["reviewer", "validator", "qa", "domain"],
    high: ["safety", "policy", "reviewer", "validator"],
    critical: ["safety", "policy", "human", "reviewer"],
  };

  for (const role of reviewerRolesByRisk[riskClass]) {
    const profile = profiles.find((entry) => entry.memberRole === role);
    if (profile) return profile.id;
  }
  return null;
}

export async function resolveTeamWorkflowAssignments(
  teamId: string,
  tenantId: string,
  riskClass: VerificationRiskClass = "medium",
): Promise<TeamWorkflowAssignments> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const profiles = await db
    .select({
      id: assistantProfiles.id,
      memberKind: assistantProfiles.memberKind,
      memberRole: assistantProfiles.memberRole,
      isLead: assistantProfiles.isLead,
    })
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.teamId, teamId),
        eq(assistantProfiles.tenantId, tenantId),
        eq(assistantProfiles.isActive, true),
      ),
    )
    .orderBy(assistantProfiles.sortOrder);

  const orchestratorMemberId =
    pickFirstProfileId(profiles, (profile) => profile.memberKind === "assistant" && profile.memberRole === "orchestrator") ??
    pickFirstProfileId(profiles, (profile) => profile.memberKind === "assistant" && profile.isLead) ??
    pickFirstProfileId(profiles, (profile) => profile.memberKind === "assistant");

  const researchMemberId =
    pickFirstProfileId(profiles, (profile) => profile.memberRole === "researcher") ??
    pickFirstProfileId(profiles, (profile) => profile.memberKind === "assistant" && profile.memberRole === "specialist") ??
    orchestratorMemberId;

  const reviewerMemberId =
    pickVerificationProfileId(profiles, riskClass) ??
    pickFirstProfileId(profiles, (profile) => profile.memberRole === "reviewer") ??
    orchestratorMemberId ??
    researchMemberId;

  const publisherMemberId =
    pickFirstProfileId(profiles, (profile) => profile.memberRole === "publisher") ??
    orchestratorMemberId ??
    reviewerMemberId;

  return {
    orchestratorMemberId: orchestratorMemberId ?? null,
    researchMemberId: researchMemberId ?? null,
    reviewerMemberId: reviewerMemberId ?? null,
    approverMemberId: publisherMemberId ?? null,
    publisherMemberId: publisherMemberId ?? null,
  };
}

export async function createWorkItem(input: CreateWorkItemInput): Promise<TeamWorkItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const resolvedAssignments =
    input.autoAssignByRole === false
      ? null
      : await resolveTeamWorkflowAssignments(input.teamId, input.tenantId, input.riskClass ?? "medium");
  const verificationPolicy = resolveVerificationPolicyForRiskClass(input.riskClass ?? "medium", {
    requiresHumanApproval: input.requiresApproval ?? false,
  });

  const [created] = await db
    .insert(teamWorkItems)
    .values({
      tenantId: input.tenantId,
      teamId: input.teamId,
      roomId: input.roomId,
      runId: input.runId ?? null,
      routineId: input.routineId ?? null,
      sourceType: input.sourceType ?? "manual",
      sourceRef: input.sourceRef ?? null,
      title: input.title,
      objective: input.objective ?? null,
      status: input.status ?? "planned",
      revisionVersion: 1,
      threadRootMessageId: input.threadRootMessageId ?? null,
      activeDraftArtifactId: input.activeDraftArtifactId ?? null,
      priority: input.priority ?? "normal",
      riskClass: input.riskClass ?? "medium",
      assignedMemberId: input.assignedMemberId ?? resolvedAssignments?.researchMemberId ?? null,
      reviewerMemberId: input.reviewerMemberId ?? resolvedAssignments?.reviewerMemberId ?? null,
      approverMemberId: input.approverMemberId ?? resolvedAssignments?.approverMemberId ?? null,
      artifactRefsJson: input.artifactRefsJson ?? null,
      approvalState: input.requiresApproval ? "pending" : "not_required",
      dueAt: input.dueAt ?? null,
    })
    .returning();

  await recordWorkItemEvent({
    workItemId: created.id,
    roomId: created.roomId,
    runId: created.runId,
    actorAssistantId: input.actorAssistantId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: "created",
    toStatus: created.status,
    revisionVersion: created.revisionVersion,
      detailJson: {
        title: created.title,
        approvalState: created.approvalState,
        assignedMemberId: created.assignedMemberId,
        reviewerMemberId: created.reviewerMemberId,
        approverMemberId: created.approverMemberId,
        verificationPolicy: buildVerificationPolicyEvidence(verificationPolicy),
      },
    });

  return created;
}

export async function reviseWorkItem(input: ReviseWorkItemInput): Promise<TeamWorkItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await ensureWorkItemTenant(input.workItemId, input.tenantId);
  if (current.revisionVersion !== input.expectedRevisionVersion) {
    throw new WorkItemVersionConflictError(
      current.id,
      input.expectedRevisionVersion,
      current.revisionVersion,
    );
  }
  if (current.supersededByWorkItemId) {
    throw new WorkItemSupersededError(current.id, current.supersededByWorkItemId);
  }

  const nextRevisionVersion = current.revisionVersion + 1;
  const [revision] = await db
    .insert(teamWorkItems)
    .values({
      tenantId: current.tenantId,
      teamId: current.teamId,
      roomId: current.roomId,
      runId: current.runId,
      routineId: current.routineId,
      sourceType: current.sourceType,
      sourceRef: current.sourceRef,
      title: input.title ?? current.title,
      objective: input.objective ?? current.objective,
      status: input.status ?? "in_progress",
      revisionVersion: nextRevisionVersion,
      threadRootMessageId: input.threadRootMessageId ?? current.threadRootMessageId,
      activeDraftArtifactId: input.activeDraftArtifactId ?? current.activeDraftArtifactId,
      priority: current.priority,
      riskClass: current.riskClass,
      assignedMemberId: input.assignedMemberId ?? current.assignedMemberId,
      reviewerMemberId: input.reviewerMemberId ?? current.reviewerMemberId,
      approverMemberId: input.approverMemberId ?? current.approverMemberId,
      parentWorkItemId: current.id,
      artifactRefsJson: input.artifactRefsJson ?? current.artifactRefsJson,
      approvalState: current.approvalState === "not_required" ? "not_required" : "pending",
      dueAt: current.dueAt,
    })
    .returning();

  await db
    .update(teamWorkItems)
    .set({
      status: "superseded",
      supersededByWorkItemId: revision.id,
      updatedAt: new Date(),
    })
    .where(eq(teamWorkItems.id, current.id))
    .returning();

  await recordWorkItemEvent({
    workItemId: current.id,
    roomId: current.roomId,
    runId: current.runId,
    actorAssistantId: input.actorAssistantId,
    eventType: "superseded",
    fromStatus: current.status,
    toStatus: "superseded",
    revisionVersion: current.revisionVersion,
    detailJson: {
      supersededByWorkItemId: revision.id,
      verificationPolicy: buildVerificationPolicyEvidence(
        resolveVerificationPolicyForRiskClass(current.riskClass ?? "medium", {
          requiresHumanApproval: current.approvalState !== "not_required",
        }),
      ),
    },
  });

  await recordWorkItemEvent({
    workItemId: revision.id,
    roomId: revision.roomId,
    runId: revision.runId,
    actorAssistantId: input.actorAssistantId,
    eventType: "revision_created",
    fromStatus: current.status,
    toStatus: revision.status,
    revisionVersion: revision.revisionVersion,
    detailJson: {
      parentWorkItemId: current.id,
      verificationPolicy: buildVerificationPolicyEvidence(
        resolveVerificationPolicyForRiskClass(revision.riskClass ?? "medium", {
          requiresHumanApproval: revision.approvalState !== "not_required",
        }),
      ),
    },
  });

  return revision;
}

export async function acquireWorkItemLock(
  input: AcquireWorkItemLockInput,
): Promise<TeamWorkItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await ensureWorkItemTenant(input.workItemId, input.tenantId);
  const now = input.now ?? new Date();
  const lockExpiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_LOCK_TTL_MS));
  const activeLock = current.lockOwnerMemberId
    && current.lockExpiresAt
    && current.lockExpiresAt.getTime() > now.getTime()
    && current.lockOwnerMemberId !== input.memberId;

  if (activeLock) {
    throw new WorkItemLockConflictError(
      current.id,
      current.lockOwnerMemberId!,
      current.lockExpiresAt,
    );
  }

  const [updated] = await db
    .update(teamWorkItems)
    .set({
      lockOwnerMemberId: input.memberId,
      lockExpiresAt,
      updatedAt: now,
    })
    .where(eq(teamWorkItems.id, current.id))
    .returning();

  await recordWorkItemEvent({
    workItemId: updated.id,
    roomId: updated.roomId,
    runId: updated.runId,
    actorAssistantId: input.memberId,
    eventType: "lock_acquired",
    fromStatus: updated.status,
    toStatus: updated.status,
    revisionVersion: updated.revisionVersion,
    detailJson: {
      lockExpiresAt: lockExpiresAt.toISOString(),
    },
  });

  return updated;
}

export async function releaseWorkItemLock(
  workItemId: string,
  memberId: string,
  tenantId?: string,
): Promise<TeamWorkItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await ensureWorkItemTenant(workItemId, tenantId);
  if (current.lockOwnerMemberId && current.lockOwnerMemberId !== memberId) {
    throw new WorkItemLockConflictError(current.id, current.lockOwnerMemberId, current.lockExpiresAt);
  }

  const [updated] = await db
    .update(teamWorkItems)
    .set({
      lockOwnerMemberId: null,
      lockExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(teamWorkItems.id, current.id))
    .returning();

  await recordWorkItemEvent({
    workItemId: updated.id,
    roomId: updated.roomId,
    runId: updated.runId,
    actorAssistantId: memberId,
    eventType: "lock_released",
    fromStatus: updated.status,
    toStatus: updated.status,
    revisionVersion: updated.revisionVersion,
  });

  return updated;
}

function ensureApprovalTargetIsCurrent(
  workItem: TeamWorkItem,
  expectedRevisionVersion: number,
): void {
  if (workItem.revisionVersion !== expectedRevisionVersion) {
    throw new WorkItemVersionConflictError(
      workItem.id,
      expectedRevisionVersion,
      workItem.revisionVersion,
    );
  }
  if (workItem.supersededByWorkItemId) {
    throw new WorkItemSupersededError(workItem.id, workItem.supersededByWorkItemId);
  }
}

async function updateApprovalState(
  workItem: TeamWorkItem,
  input: ApproveWorkItemRevisionInput | RejectWorkItemRevisionInput,
  next: {
    approvalState: "approved" | "rejected";
    status: WorkItemStatus;
    completedAt?: Date | null;
    eventType: string;
    detailJson?: Record<string, unknown>;
  },
): Promise<TeamWorkItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(teamWorkItems)
    .set({
      approvalState: next.approvalState,
      status: next.status,
      completedAt: next.completedAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(teamWorkItems.id, workItem.id))
    .returning();

  await recordWorkItemEvent({
    workItemId: updated.id,
    roomId: updated.roomId,
    runId: updated.runId,
    actorAssistantId: input.approverMemberId,
    eventType: next.eventType,
    fromStatus: workItem.status,
    toStatus: updated.status,
    revisionVersion: updated.revisionVersion,
    detailJson: next.detailJson ?? null,
  });

  return updated;
}

export async function approveWorkItemRevision(
  input: ApproveWorkItemRevisionInput,
): Promise<TeamWorkItem> {
  const current = await ensureWorkItemTenant(input.workItemId, input.tenantId);
  ensureApprovalTargetIsCurrent(current, input.expectedRevisionVersion);

  return updateApprovalState(current, input, {
    approvalState: "approved",
    status: "completed",
    completedAt: new Date(),
    eventType: "approved",
  });
}

export async function rejectWorkItemRevision(
  input: RejectWorkItemRevisionInput,
): Promise<TeamWorkItem> {
  const current = await ensureWorkItemTenant(input.workItemId, input.tenantId);
  ensureApprovalTargetIsCurrent(current, input.expectedRevisionVersion);

  return updateApprovalState(current, input, {
    approvalState: "rejected",
    status: "needs_revision",
    completedAt: null,
    eventType: "rejected",
    detailJson: input.reason ? { reason: input.reason } : undefined,
  });
}

export async function getWorkItemWithLatestRevision(
  workItemId: string,
  tenantId?: string,
): Promise<TeamWorkItem> {
  const current = await ensureWorkItemTenant(workItemId, tenantId);
  if (!current.supersededByWorkItemId) {
    return current;
  }
  return ensureWorkItemTenant(current.supersededByWorkItemId, tenantId);
}

export async function getWorkItem(workItemId: string, tenantId?: string): Promise<TeamWorkItem> {
  return ensureWorkItemTenant(workItemId, tenantId);
}

export async function setThreadRootMessageId(
  workItemId: string,
  threadRootMessageId: string,
  tenantId?: string,
): Promise<TeamWorkItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await ensureWorkItemTenant(workItemId, tenantId);

  const [updated] = await db
    .update(teamWorkItems)
    .set({
      threadRootMessageId,
      updatedAt: new Date(),
    })
    .where(eq(teamWorkItems.id, current.id))
    .returning();

  await recordWorkItemEvent({
    workItemId: updated.id,
    roomId: updated.roomId,
    runId: updated.runId,
    eventType: "thread_root_attached",
    fromStatus: updated.status,
    toStatus: updated.status,
    revisionVersion: updated.revisionVersion,
    detailJson: { threadRootMessageId },
  });

  return updated;
}

export async function listWorkItemsByRoom(
  roomId: string,
  tenantId: string,
): Promise<TeamWorkItem[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(teamWorkItems)
    .where(and(eq(teamWorkItems.roomId, roomId), eq(teamWorkItems.tenantId, tenantId)));
}

function resolveWorkflowTransition(
  current: TeamWorkItem,
  assignments: TeamWorkflowAssignments,
  requestedStep?: WorkItemWorkflowStep,
): {
  targetStep: WorkItemWorkflowStep;
  status: WorkItemStatus;
  assignedMemberId?: string | null;
  reviewerMemberId?: string | null;
  approverMemberId?: string | null;
} {
  const targetStep =
    requestedStep ??
    (current.status === "planned" || current.status === "needs_revision" || current.status === "blocked"
      ? "research"
      : current.status === "in_progress"
        ? "review"
        : "approval");

  if (targetStep === "research") {
    return {
      targetStep,
      status: "in_progress",
      assignedMemberId: assignments.researchMemberId ?? current.assignedMemberId,
      reviewerMemberId: current.reviewerMemberId,
      approverMemberId: current.approverMemberId,
    };
  }

  if (targetStep === "review") {
    return {
      targetStep,
      status: "in_review",
      assignedMemberId: current.assignedMemberId,
      reviewerMemberId: assignments.reviewerMemberId ?? current.reviewerMemberId,
      approverMemberId: current.approverMemberId,
    };
  }

  return {
    targetStep: "approval",
    status: "awaiting_approval",
    assignedMemberId: current.assignedMemberId,
    reviewerMemberId: current.reviewerMemberId,
    approverMemberId: assignments.approverMemberId ?? current.approverMemberId,
  };
}

export async function routeWorkItemByRole(
  input: RouteWorkItemByRoleInput,
): Promise<{ workItem: TeamWorkItem; targetStep: WorkItemWorkflowStep; assignments: TeamWorkflowAssignments }> {
  const current = await ensureWorkItemTenant(input.workItemId, input.tenantId);
  const assignments = await resolveTeamWorkflowAssignments(current.teamId, current.tenantId);
  const transition = resolveWorkflowTransition(current, assignments, input.targetStep);

  const workItem = await reviseWorkItem({
    tenantId: current.tenantId,
    workItemId: current.id,
    expectedRevisionVersion: input.expectedRevisionVersion,
    actorAssistantId: input.actorAssistantId,
    status: transition.status,
    assignedMemberId: transition.assignedMemberId ?? undefined,
    reviewerMemberId: transition.reviewerMemberId ?? undefined,
    approverMemberId: transition.approverMemberId ?? undefined,
  });

  await recordWorkItemEvent({
    workItemId: workItem.id,
    roomId: workItem.roomId,
    runId: workItem.runId,
    actorAssistantId: input.actorAssistantId,
    eventType: "workflow_routed",
    fromStatus: current.status as WorkItemStatus,
    toStatus: workItem.status as WorkItemStatus,
    revisionVersion: workItem.revisionVersion,
    detailJson: {
      targetStep: transition.targetStep,
      assignedMemberId: workItem.assignedMemberId,
      reviewerMemberId: workItem.reviewerMemberId,
      approverMemberId: workItem.approverMemberId,
      verificationPolicy: buildVerificationPolicyEvidence(
        resolveVerificationPolicyForRiskClass(workItem.riskClass ?? "medium", {
          requiresHumanApproval: workItem.approvalState !== "not_required",
        }),
      ),
    },
  });

  return {
    workItem,
    targetStep: transition.targetStep,
    assignments,
  };
}
