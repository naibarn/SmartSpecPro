import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { getDb } from "../db";
import { runnerNodes, workerJobs } from "../../drizzle/schema";
import {
  runnerCompanionStateSchema,
  type RunnerApprovalView,
  type RunnerCompanionState,
  type RunnerDeviceView,
  type RunnerEvidenceView,
  type RunnerTaskStatus,
  type RunnerTaskView,
} from "../../shared/runnerCompanion";
import { CLOUDFLARE_STAGING_EXECUTOR_PROFILE } from "./cloudflareStagingExecutorIdentityService";
import { canonicalizeStoredStatus } from "./jobControlPlane";
import { listTaskObservability } from "./taskObservabilityReadModel";
import {
  listUserWorkerJobs,
  type SafeWorkerOutputRef,
  type UserWorkerJobSummary,
} from "./workerJobMonitorService";
import { runnerReadinessForDisplay } from "./runnerGateway";

export type RunnerCompanionScope = {
  tenantId: string;
  userId: number;
};

type JsonRecord = Record<string, unknown>;

const MAX_COMPANION_EVIDENCE = 100;
const MAX_TASK_EVIDENCE_IDS = 32;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function boundedDate(value: unknown): string | null {
  return typeof value === "string" && iso(value) ? iso(value) : null;
}

function platformView(snapshot: JsonRecord) {
  const platform = record(snapshot.platform);
  const os = text(platform.os, 40);
  const architecture = text(platform.architecture, 40);
  const target = text(platform.target, 80);
  return os && architecture && target ? { os, architecture, target } : null;
}

function capabilityInventory(snapshot: JsonRecord): JsonRecord[] {
  return Array.isArray(snapshot.capabilityInventory)
    ? snapshot.capabilityInventory
        .flatMap(value => {
          const item = record(value);
          return Object.keys(item).length > 0 ? [item] : [];
        })
        .slice(0, 128)
    : [];
}

export function mapRunnerDeviceView(row: {
  runnerId: string;
  deviceId: string | null;
  displayName: string;
  profile: string;
  nodeKind: string;
  trustState: string;
  status: string;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
  activeSessionId: string | null;
  currentSnapshotRevision: string | null;
  snapshotObservedAt: Date | null;
  snapshotExpiresAt: Date | null;
  currentSnapshotJson: Record<string, unknown> | null;
}): RunnerDeviceView {
  const snapshot = record(row.currentSnapshotJson);
  const readiness = runnerReadinessForDisplay({
    status: row.status,
    profile: row.profile,
    revokedAt: row.revokedAt,
    lastSeenAt: row.lastSeenAt,
    snapshotObservedAt: row.snapshotObservedAt,
    snapshotExpiresAt: row.snapshotExpiresAt,
    activeSessionId: row.activeSessionId,
    currentSnapshotJson: row.currentSnapshotJson,
  });
  const capabilities = capabilityInventory(snapshot);
  const snapshotCurrent =
    readiness.snapshotCurrent && Boolean(row.currentSnapshotRevision);
  const connectivity =
    row.revokedAt || row.trustState === "revoked"
      ? "revoked"
      : readiness.status === "offline"
        ? "offline"
        : readiness.status === "degraded"
          ? "stale"
          : readiness.status === "online"
            ? "online"
            : "degraded";
  const continuity =
    row.nodeKind !== "local_device"
      ? "not_applicable"
      : !row.activeSessionId
        ? "missing"
        : snapshot.runnerSessionId === row.activeSessionId && snapshotCurrent
          ? "current"
          : "stale";
  const capabilityState =
    !row.currentSnapshotRevision || !row.snapshotExpiresAt
      ? "missing"
      : snapshotCurrent
        ? "fresh"
        : "stale";

  return {
    runnerId: row.runnerId,
    deviceId: text(row.deviceId),
    displayName: text(row.displayName, 160) ?? "SmartAIHub Runner",
    profile: text(row.profile, 80) ?? "unknown",
    nodeKind: text(row.nodeKind, 80) ?? "unknown",
    pairing:
      row.trustState === "revoked" || row.revokedAt
        ? "revoked"
        : row.trustState === "trusted"
          ? "paired"
          : "pending",
    connectivity,
    trustState:
      row.trustState === "trusted" ||
      row.trustState === "revoked" ||
      row.trustState === "quarantined"
        ? row.trustState
        : "pending",
    session: { active: Boolean(row.activeSessionId), continuity },
    capabilities: {
      state: capabilityState,
      revision: text(row.currentSnapshotRevision),
      observedAt: iso(row.snapshotObservedAt),
      expiresAt: iso(row.snapshotExpiresAt),
      count: capabilities.length,
      availableCount: capabilities.filter(
        item => item.availabilityState === "available"
      ).length,
    },
    platform: platformView(snapshot),
    lastSeenAt: iso(row.lastSeenAt),
  };
}

function approvalRecord(progressJson: unknown): JsonRecord | null {
  const progress = record(progressJson);
  const externalWait = record(progress.externalWait);
  const metadata = record(externalWait.metadata);
  const approval = record(metadata.approval);
  return text(approval.requestId, 160) ? approval : null;
}

function inputIsRequired(
  progressJson: unknown,
  statusReason: string | null
): boolean {
  if (statusReason?.toLowerCase().includes("input")) return true;
  const progress = record(progressJson);
  const externalWait = record(progress.externalWait);
  const metadata = record(externalWait.metadata);
  return (
    Object.keys(record(metadata.inputRequest)).length > 0 ||
    metadata.inputRequired === true
  );
}

function approvalView(jobId: string, approval: JsonRecord): RunnerApprovalView {
  const state =
    approval.state === "pending" ||
    approval.state === "approved" ||
    approval.state === "rejected"
      ? approval.state
      : "unknown";
  return {
    approvalId: text(approval.requestId, 160) ?? `job:${jobId}:approval`,
    jobId,
    state,
    actionId: text(approval.actionId, 160),
    requestedAt: boundedDate(approval.requestedAt),
    resolvedAt: boundedDate(approval.resolvedAt),
    source: "canonical_job_external_wait",
  };
}

function taskStatus(input: {
  status: string;
  statusReason: string | null;
  runnerSessionState: string | null;
  approvalState?: string;
  inputRequired: boolean;
}): RunnerTaskStatus {
  const reason = input.statusReason?.toLowerCase() ?? "";
  const sessionState = input.runnerSessionState?.toLowerCase() ?? "";
  const status = input.status.toLowerCase();

  // The durable worker status is authoritative once it is terminal. Progress
  // metadata can be stale after a reconnect and must not reopen a terminal
  // task as an approval/input wait in the companion projection.
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (["succeeded", "completed"].includes(status)) return "completed";
  if (status === "failed") return "failed";
  if (status === "expired") return "expired";
  if (reason.includes("unknown_outcome") || sessionState === "unknown_outcome")
    return "unknown_outcome";
  if (reason.startsWith("cancel_requested")) return "cancel_requested";
  if (input.approvalState === "pending") return "waiting_for_approval";
  if (input.inputRequired) return "waiting_for_input";
  if (status === "waiting_external") return "waiting_external";
  if (["pending", "queued", "retry_scheduled"].includes(status))
    return "queued";
  if (
    [
      "leased",
      "claimed",
      "preparing",
      "running",
      "uploading",
      "publishing",
      "indexing",
    ].includes(status)
  )
    return "running";
  return "unknown_outcome";
}

function nextAction(status: RunnerTaskStatus): RunnerTaskView["nextAction"] {
  switch (status) {
    case "waiting_for_approval":
      return "approve";
    case "waiting_for_input":
      return "provide_input";
    case "queued":
    case "running":
    case "waiting_external":
      return "wait";
    case "completed":
      return "review_result";
    case "failed":
    case "expired":
    case "unknown_outcome":
      return "review_result";
    default:
      return "none";
  }
}

function evidenceId(output: SafeWorkerOutputRef): string | null {
  if (output.artifactId) return `artifact:${output.artifactId}`;
  if (output.publishedItemId != null)
    return `published:${output.publishedItemId}`;
  return null;
}

function mapEvidence(
  jobId: string,
  output: SafeWorkerOutputRef
): RunnerEvidenceView | null {
  const id = evidenceId(output);
  if (!id) return null;
  return {
    evidenceId: id,
    jobId,
    kind: text(output.artifactType, 100) ?? "output",
    verificationState: text(output.verificationState, 80),
    contentHash: text(output.contentHash, 128),
    mimeType: text(output.mimeType, 160),
    sizeBytes:
      Number.isSafeInteger(output.sizeBytes) && Number(output.sizeBytes) >= 0
        ? Number(output.sizeBytes)
        : null,
    createdAt: iso(output.createdAt),
    source: "canonical_worker_output",
  };
}

function updatedAt(job: UserWorkerJobSummary): string {
  const values = [
    job.createdAt,
    job.startedAt,
    job.finishedAt,
    job.latestEvent?.createdAt,
  ]
    .filter((value): value is Date => value instanceof Date)
    .map(value => value.getTime());
  return new Date(Math.max(...values, 0)).toISOString();
}

function mapTaskView(
  job: UserWorkerJobSummary,
  observation:
    | {
        runnerId: string | null;
        runnerSessionState: string | null;
        stage: string | null;
        attempt: number;
        maxAttempts: number;
      }
    | undefined,
  approval: JsonRecord | null,
  inputRequired: boolean,
  progressEvidenceIds: string[]
): RunnerTaskView {
  const status = taskStatus({
    status: job.status,
    statusReason: job.statusReason,
    runnerSessionState: observation?.runnerSessionState ?? null,
    approvalState: text(approval?.state, 40) ?? undefined,
    inputRequired,
  });
  const progressPercent = job.progressPercent;
  const phase = job.progressPhase ?? observation?.stage ?? null;
  return {
    jobId: job.id,
    jobType: job.jobType,
    canonicalStatus: canonicalizeStoredStatus(job.status),
    status,
    runnerId: observation?.runnerId ?? null,
    runnerSessionState: observation?.runnerSessionState ?? null,
    attempt: observation?.attempt ?? null,
    maxAttempts: observation?.maxAttempts ?? null,
    progress: {
      percent: progressPercent,
      phase,
      source:
        progressPercent !== null || job.progressPhase !== null
          ? "canonical_worker_job"
          : phase !== null
            ? "canonical_task_observability"
            : "unreported",
    },
    attention: {
      required: job.operatorReviewRequired,
      reason: text(job.operatorReviewReason, 300),
    },
    nextAction: nextAction(status),
    outputEvidenceIds: progressEvidenceIds,
    createdAt: job.createdAt.toISOString(),
    updatedAt: updatedAt(job),
  };
}

export async function getRunnerCompanionState(
  scope: RunnerCompanionScope
): Promise<RunnerCompanionState> {
  if (
    !scope.tenantId.trim() ||
    !Number.isSafeInteger(scope.userId) ||
    scope.userId <= 0
  ) {
    throw new Error("RUNNER_COMPANION_SCOPE_REQUIRED");
  }
  const db = getDb();
  const [runnerRows, taskProjection, jobProjection] = await Promise.all([
    db
      .select()
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.tenantId, scope.tenantId),
          ne(runnerNodes.profile, CLOUDFLARE_STAGING_EXECUTOR_PROFILE),
          or(
            isNull(runnerNodes.ownerUserId),
            eq(runnerNodes.ownerUserId, scope.userId)
          )
        )
      )
      .orderBy(desc(runnerNodes.updatedAt))
      .limit(100),
    listTaskObservability({ scope: { ...scope, isAdmin: false } }),
    listUserWorkerJobs({ auth: scope, limit: 50 }),
  ]);
  const observationByJobId = new Map(
    taskProjection.items.map(item => [item.id, item])
  );
  const jobIds = jobProjection.items.map(job => job.id);
  const approvalRows =
    jobIds.length === 0
      ? []
      : await db
          .select({
            id: workerJobs.id,
            progressJson: workerJobs.progressJson,
          })
          .from(workerJobs)
          .where(
            and(
              eq(workerJobs.tenantId, scope.tenantId),
              eq(workerJobs.requestedByUserId, scope.userId),
              inArray(workerJobs.id, jobIds)
            )
          )
          .limit(jobIds.length);
  const approvalByJobId = new Map(
    approvalRows.map(row => [row.id, approvalRecord(row.progressJson)])
  );
  const progressByJobId = new Map(
    approvalRows.map(row => [row.id, row.progressJson])
  );
  const evidence: RunnerEvidenceView[] = [];
  const evidenceKeys = new Set<string>();
  const approvals: RunnerApprovalView[] = [];
  const tasks = jobProjection.items.map(job => {
    const jobEvidence: string[] = [];
    for (const output of job.outputRefs) {
      const view = mapEvidence(job.id, output);
      if (
        !view ||
        evidenceKeys.has(view.evidenceId) ||
        evidence.length >= MAX_COMPANION_EVIDENCE ||
        jobEvidence.length >= MAX_TASK_EVIDENCE_IDS
      )
        continue;
      evidenceKeys.add(view.evidenceId);
      evidence.push(view);
      jobEvidence.push(view.evidenceId);
    }
    const approval = approvalByJobId.get(job.id) ?? null;
    const task = mapTaskView(
      job,
      observationByJobId.get(job.id),
      approval,
      inputIsRequired(progressByJobId.get(job.id), job.statusReason),
      jobEvidence
    );
    // Keep resolved approval history, but never expose stale pending approval
    // metadata as an actionable approval after the task is terminal.
    if (
      approval &&
      (approval.state !== "pending" || task.status === "waiting_for_approval")
    )
      approvals.push(approvalView(job.id, approval));
    return task;
  });
  const devices = runnerRows.map(row => mapRunnerDeviceView(row));
  const now = new Date().toISOString();
  return runnerCompanionStateSchema.parse({
    schemaVersion: "runner-companion.v1",
    generatedAt: now,
    scope: "owner",
    devices,
    tasks,
    approvals,
    evidence,
    reconciliation: {
      asOf: taskProjection.snapshot.asOf,
      expiresAt: taskProjection.snapshot.expiresAt,
      projectionToken: taskProjection.snapshot.projectionToken,
      consistency: taskProjection.snapshot.consistency,
      eventContinuity: "not_claimed",
    },
  });
}
