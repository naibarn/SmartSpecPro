import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "../db";
import {
  libraryItems,
  workerArtifacts,
  workerJobEvents,
  workerJobs,
  workers,
  type WorkerJob,
} from "../../drizzle/schema";
import { HYPERFRAMES_FINAL_VIDEO_MIN_BYTES } from "./hyperframesWorkerVerificationService";
import { createJobControlPlane } from "./jobControlPlane";

export const USER_WORKER_JOB_STATUSES = [
  "pending",
  "queued",
  "leased",
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
  "waiting_external",
  "completed",
  "succeeded",
  "failed",
  "retry_scheduled",
  "cancelled",
  "canceled",
  "expired",
] as const;

export type UserWorkerJobStatus = (typeof USER_WORKER_JOB_STATUSES)[number];

export type WorkerJobMonitorAuth = {
  tenantId: string;
  userId: number;
};

type JsonRecord = Record<string, unknown>;

type WorkerJobRow = Pick<
  WorkerJob,
  | "id"
  | "tenantId"
  | "workerId"
  | "runtimeType"
  | "workflowRunId"
  | "requestedByUserId"
  | "jobType"
  | "status"
  | "statusReason"
  | "resourceProfile"
  | "outputJson"
  | "failureReason"
  | "inputJson"
  | "progressJson"
  | "createdAt"
  | "startedAt"
  | "finishedAt"
>;

// Vertical Drama Render Queue plan §4.5, Wave 3 — `cancelQueuedJob`'s
// `.returning()` (no column list) already returns EVERY `workerJobs` column
// at runtime, including `inputJson`; this widened type just lets
// `cancelQueuedUserWorkerJob` read it back to detect + reset a canceled
// `vertical_drama_ffmpeg_assembly` job's linked VD state (§4.5) without
// re-querying the row.
type WorkerJobRowWithInput = WorkerJobRow & Pick<WorkerJob, "inputJson">;

type WorkerSummaryRow = {
  id: string | null;
  displayName: string | null;
  machineName: string | null;
  status: string | null;
  runtimeType: string | null;
  lastSeenAt: Date | null;
};

type EventRow = {
  id: string;
  workerJobId: string;
  eventSequence: number | null;
  eventType: string;
  payloadJson: JsonRecord;
  createdAt: Date;
};

type ArtifactRow = {
  id: string;
  workerJobId: string;
  artifactType: string;
  storageRef: string;
  metadataJson: JsonRecord;
  publishedItemId: number | null;
  sourceUrl?: string | null;
  createdAt: Date;
};

export type WorkerJobMonitorRepository = {
  listUserJobs(input: {
    auth: WorkerJobMonitorAuth;
    statuses?: UserWorkerJobStatus[];
    jobType?: string;
    limit: number;
    offset: number;
  }): Promise<Array<WorkerJobRow & { worker: WorkerSummaryRow | null }>>;
  listUserJobsByIds?(input: {
    auth: WorkerJobMonitorAuth;
    jobIds: string[];
  }): Promise<Array<WorkerJobRow & { worker: WorkerSummaryRow | null }>>;
  getUserJob(input: {
    auth: WorkerJobMonitorAuth;
    jobId: string;
  }): Promise<(WorkerJobRow & { worker: WorkerSummaryRow | null }) | null>;
  listEvents(jobIds: string[], limitPerJob?: number): Promise<EventRow[]>;
  listArtifacts(jobIds: string[]): Promise<ArtifactRow[]>;
  cancelQueuedJob(input: {
    auth: WorkerJobMonitorAuth;
    jobId: string;
  }): Promise<WorkerJobRowWithInput | null>;
};

export type SafeWorkerJobEvent = {
  id: string;
  eventType: string;
  sidecarEventType: string | null;
  message: string | null;
  progressPercent: number | null;
  phase: string | null;
  shotId: string | null;
  shotIndex: number | null;
  shotTotal: number | null;
  cacheHit: boolean | null;
  errorCode: string | null;
  rootCause: string | null;
  concatMode: string | null;
  createdAt: Date;
};

export type SafeWorkerOutputRef = {
  artifactId?: string;
  artifactType: string;
  storageRef?: string;
  publishedItemId?: number | null;
  sourceUrl?: string | null;
  downloadUrl?: string | null;
  contentHash?: string;
  mimeType?: string;
  sizeBytes?: number;
  verificationState?: string;
  createdAt?: Date;
};

export type SafeWorkerJobOrchestration = {
  planId: string | null;
  stepId: string | null;
  stepIndex: number | null;
  totalSteps: number | null;
  dependsOnJobIds: string[];
  metadataState: "none" | "valid" | "degraded";
};

export type UserWorkerJobSummary = {
  id: string;
  jobType: string;
  status: UserWorkerJobStatus;
  statusReason: string | null;
  failureReason: string | null;
  runtimeType: string;
  resourceProfile: string;
  workflowRunId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  progressPercent: number | null;
  progressPhase: string | null;
  orchestration: SafeWorkerJobOrchestration;
  latestEvent: SafeWorkerJobEvent | null;
  worker: WorkerSummaryRow | null;
  outputRefs: SafeWorkerOutputRef[];
  canCancel: boolean;
};

export type UserWorkerJobDetail = UserWorkerJobSummary & {
  events: SafeWorkerJobEvent[];
};

export type UserWorkerTaskGroup = {
  groupId: string;
  groupKind: "plan" | "workflow" | "single";
  title: string;
  status: UserWorkerJobStatus;
  progressPercent: number | null;
  completedSteps: number;
  totalSteps: number;
  activeStepId: string | null;
  latestEvent: SafeWorkerJobEvent | null;
  metadataState: "clean" | "degraded";
  jobs: UserWorkerJobSummary[];
};

export type UserWorkerTaskGroupsPage = {
  groups: UserWorkerTaskGroup[];
  hasMore: boolean;
  nextOffset: number;
  sourceTruncated: boolean;
};

const OPEN_USER_WORKER_JOB_STATUSES: UserWorkerJobStatus[] = [
  "pending",
  "queued",
  "leased",
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
  "waiting_external",
  "retry_scheduled",
];

const MAX_TASK_GROUP_SOURCE_JOBS = 500;
const MAX_DEPENDENCY_JOBS = 200;

export const defaultWorkerJobMonitorRepo: WorkerJobMonitorRepository = {
  async listUserJobs(input) {
    const conditions = [
      eq(workerJobs.tenantId, input.auth.tenantId),
      eq(workerJobs.requestedByUserId, input.auth.userId),
    ];

    if (input.statuses?.length) {
      conditions.push(inArray(workerJobs.status, input.statuses) as any);
    }
    if (input.jobType) {
      conditions.push(eq(workerJobs.jobType, input.jobType));
    }

    return await db
      .select({
        id: workerJobs.id,
        tenantId: workerJobs.tenantId,
        workerId: workerJobs.workerId,
        runtimeType: workerJobs.runtimeType,
        workflowRunId: workerJobs.workflowRunId,
        requestedByUserId: workerJobs.requestedByUserId,
        jobType: workerJobs.jobType,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
        resourceProfile: workerJobs.resourceProfile,
        outputJson: workerJobs.outputJson,
        failureReason: workerJobs.failureReason,
        inputJson: workerJobs.inputJson,
        progressJson: workerJobs.progressJson,
        createdAt: workerJobs.createdAt,
        startedAt: workerJobs.startedAt,
        finishedAt: workerJobs.finishedAt,
        worker: {
          id: workers.id,
          displayName: workers.displayName,
          machineName: workers.machineName,
          status: workers.status,
          runtimeType: workers.runtimeType,
          lastSeenAt: workers.lastSeenAt,
        },
      })
      .from(workerJobs)
      .leftJoin(workers, eq(workers.id, workerJobs.workerId))
      .where(and(...conditions))
      .orderBy(desc(workerJobs.createdAt))
      .limit(input.limit)
      .offset(input.offset) as Array<WorkerJobRow & { worker: WorkerSummaryRow | null }>;
  },

  async listUserJobsByIds(input) {
    const jobIds = Array.from(new Set(input.jobIds)).slice(0, MAX_DEPENDENCY_JOBS);
    if (jobIds.length === 0) return [];

    return await db
      .select({
        id: workerJobs.id,
        tenantId: workerJobs.tenantId,
        workerId: workerJobs.workerId,
        runtimeType: workerJobs.runtimeType,
        workflowRunId: workerJobs.workflowRunId,
        requestedByUserId: workerJobs.requestedByUserId,
        jobType: workerJobs.jobType,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
        resourceProfile: workerJobs.resourceProfile,
        outputJson: workerJobs.outputJson,
        failureReason: workerJobs.failureReason,
        inputJson: workerJobs.inputJson,
        progressJson: workerJobs.progressJson,
        createdAt: workerJobs.createdAt,
        startedAt: workerJobs.startedAt,
        finishedAt: workerJobs.finishedAt,
        worker: {
          id: workers.id,
          displayName: workers.displayName,
          machineName: workers.machineName,
          status: workers.status,
          runtimeType: workers.runtimeType,
          lastSeenAt: workers.lastSeenAt,
        },
      })
      .from(workerJobs)
      .leftJoin(workers, eq(workers.id, workerJobs.workerId))
      .where(and(
        inArray(workerJobs.id, jobIds),
        eq(workerJobs.tenantId, input.auth.tenantId),
        eq(workerJobs.requestedByUserId, input.auth.userId),
      ))
      .orderBy(desc(workerJobs.createdAt))
      .limit(MAX_DEPENDENCY_JOBS) as Array<WorkerJobRow & { worker: WorkerSummaryRow | null }>;
  },

  async getUserJob(input) {
    const [row] = await db
      .select({
        id: workerJobs.id,
        tenantId: workerJobs.tenantId,
        workerId: workerJobs.workerId,
        runtimeType: workerJobs.runtimeType,
        workflowRunId: workerJobs.workflowRunId,
        requestedByUserId: workerJobs.requestedByUserId,
        jobType: workerJobs.jobType,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
        resourceProfile: workerJobs.resourceProfile,
        outputJson: workerJobs.outputJson,
        failureReason: workerJobs.failureReason,
        inputJson: workerJobs.inputJson,
        progressJson: workerJobs.progressJson,
        createdAt: workerJobs.createdAt,
        startedAt: workerJobs.startedAt,
        finishedAt: workerJobs.finishedAt,
        worker: {
          id: workers.id,
          displayName: workers.displayName,
          machineName: workers.machineName,
          status: workers.status,
          runtimeType: workers.runtimeType,
          lastSeenAt: workers.lastSeenAt,
        },
      })
      .from(workerJobs)
      .leftJoin(workers, eq(workers.id, workerJobs.workerId))
      .where(and(
        eq(workerJobs.id, input.jobId),
        eq(workerJobs.tenantId, input.auth.tenantId),
        eq(workerJobs.requestedByUserId, input.auth.userId),
      ))
      .limit(1);

    return (row as (WorkerJobRow & { worker: WorkerSummaryRow | null }) | undefined) ?? null;
  },

  async listEvents(jobIds, limitPerJob = 25) {
    if (jobIds.length === 0) return [];
    const rows = await db
      .select({
        id: workerJobEvents.id,
        workerJobId: workerJobEvents.workerJobId,
        eventSequence: workerJobEvents.eventSequence,
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
        createdAt: workerJobEvents.createdAt,
      })
      .from(workerJobEvents)
      .where(inArray(workerJobEvents.workerJobId, jobIds))
      .orderBy(desc(workerJobEvents.createdAt));

    const countByJob = new Map<string, number>();
    return (rows as EventRow[]).filter((row: EventRow) => {
      const count = countByJob.get(row.workerJobId) ?? 0;
      if (count >= limitPerJob) return false;
      countByJob.set(row.workerJobId, count + 1);
      return true;
    });
  },

  async listArtifacts(jobIds) {
    if (jobIds.length === 0) return [];
    return await db
      .select({
        id: workerArtifacts.id,
        workerJobId: workerArtifacts.workerJobId,
        artifactType: workerArtifacts.artifactType,
        storageRef: workerArtifacts.storageRef,
        metadataJson: workerArtifacts.metadataJson,
        publishedItemId: workerArtifacts.publishedItemId,
        sourceUrl: libraryItems.sourceUrl,
        createdAt: workerArtifacts.createdAt,
      })
      .from(workerArtifacts)
      .leftJoin(libraryItems, eq(workerArtifacts.publishedItemId, libraryItems.id))
      .where(inArray(workerArtifacts.workerJobId, jobIds))
      .orderBy(desc(workerArtifacts.createdAt)) as ArtifactRow[];
  },

  async cancelQueuedJob(input) {
    const [updated] = await db
      .update(workerJobs)
      .set({
        status: "canceled",
        statusReason: "Canceled by requester",
        leaseOwnerToken: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      })
      .where(and(
        eq(workerJobs.id, input.jobId),
        eq(workerJobs.tenantId, input.auth.tenantId),
        eq(workerJobs.requestedByUserId, input.auth.userId),
        inArray(workerJobs.status, [
          "queued",
          "claimed",
          "preparing",
          "running",
          "uploading",
          "publishing",
          "indexing",
        ]),
      ))
      .returning();

    return (updated as WorkerJobRowWithInput | undefined) ?? null;
  },
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function safeBoundedString(value: unknown, maxLength: number): string | undefined {
  const result = safeString(value);
  return result && result.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(result)
    ? result
    : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeInteger(value: unknown, min: number, max: number): number | undefined {
  const result = safeNumber(value);
  return result !== undefined && Number.isInteger(result) && result >= min && result <= max
    ? result
    : undefined;
}

function safePercent(value: unknown): number | undefined {
  const result = safeNumber(value);
  return result === undefined ? undefined : Math.max(0, Math.min(100, result));
}

function safeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isHyperframesFinalVideoType(value: unknown): boolean {
  return value === "hyperframes_final_video";
}

function hasValidHyperframesFinalVideoSize(sizeBytes: unknown): boolean {
  const size = safeNumber(sizeBytes);
  return typeof size === "number" && size >= HYPERFRAMES_FINAL_VIDEO_MIN_BYTES;
}

function isVerifiedArtifact(artifact: ArtifactRow): boolean {
  if (isHyperframesFinalVideoType(artifact.artifactType)) {
    const metadata = asRecord(artifact.metadataJson);
    if (!hasValidHyperframesFinalVideoSize(metadata.sizeBytes ?? metadata.size)) {
      return false;
    }
  }
  const metadata = asRecord(artifact.metadataJson);
  const verificationState = safeString(metadata.verificationState ?? metadata.verificationStatus ?? metadata.status);
  return artifact.publishedItemId != null
    || verificationState === "verified"
    || verificationState === "passed"
    || verificationState === "server_verification_passed";
}

function projectOutputJson(outputJson: unknown): SafeWorkerOutputRef[] {
  const output = asRecord(outputJson);
  const refs = Array.isArray(output.outputRefs)
    ? output.outputRefs
    : Array.isArray(output.artifacts)
      ? output.artifacts
      : Array.isArray(output.publishedArtifacts)
        ? output.publishedArtifacts
        : [];

  return refs.reduce<SafeWorkerOutputRef[]>((items, ref) => {
      const record = asRecord(ref);
      const artifactType = safeString(record.artifactType ?? record.type) ?? "output";
      if (isHyperframesFinalVideoType(artifactType) && !hasValidHyperframesFinalVideoSize(record.sizeBytes ?? record.size)) {
        return items;
      }
      const verificationState = safeString(record.verificationState ?? record.verificationStatus);
      const publishedItemId = safeNumber(record.publishedItemId);
      if (!publishedItemId && verificationState !== "verified" && verificationState !== "passed") {
        return items;
      }
      items.push({
        artifactType,
        publishedItemId: publishedItemId ?? null,
        sourceUrl: safeString(record.sourceUrl ?? record.source_url),
        downloadUrl: safeString(record.downloadUrl),
        contentHash: safeString(record.contentHash ?? record.sha256),
        mimeType: safeString(record.mimeType),
        sizeBytes: safeNumber(record.sizeBytes),
        verificationState,
      });
      return items;
    }, []);
}

function projectArtifact(artifact: ArtifactRow): SafeWorkerOutputRef | null {
  if (!isVerifiedArtifact(artifact)) return null;
  const metadata = asRecord(artifact.metadataJson);
  return {
    artifactId: artifact.id,
    artifactType: artifact.artifactType,
    storageRef: artifact.storageRef,
    publishedItemId: artifact.publishedItemId,
    sourceUrl: safeString(metadata.sourceUrl ?? metadata.source_url ?? artifact.sourceUrl),
    downloadUrl: safeString(metadata.downloadUrl),
    contentHash: safeString(metadata.contentHash ?? metadata.sha256),
    mimeType: safeString(metadata.mimeType ?? metadata.contentType),
    sizeBytes: safeNumber(metadata.sizeBytes ?? metadata.size),
    verificationState: safeString(metadata.verificationState ?? metadata.verificationStatus ?? metadata.status),
    createdAt: artifact.createdAt,
  };
}

function projectEvent(event: EventRow): SafeWorkerJobEvent {
  const payload = asRecord(event.payloadJson);
  return {
    id: event.id,
    eventType: event.eventType,
    sidecarEventType: safeBoundedString(payload.eventType ?? payload.sidecarEventType, 128) ?? null,
    message: safeBoundedString(payload.message ?? payload.safeMessage ?? payload.phaseLabel, 500) ?? null,
    progressPercent: safePercent(payload.progressPercent ?? payload.progress ?? payload.percent) ?? null,
    phase: safeBoundedString(payload.phase ?? payload.stage ?? payload.status, 128) ?? null,
    shotId: safeBoundedString(payload.shotId, 128) ?? null,
    shotIndex: safeInteger(payload.shotIndex, 0, 10_000) ?? null,
    shotTotal: safeInteger(payload.shotTotal, 0, 10_000) ?? null,
    cacheHit: safeBoolean(payload.cacheHit) ?? null,
    errorCode: safeBoundedString(payload.errorCode ?? payload.failureCode ?? payload.code, 128) ?? null,
    rootCause: safeBoundedString(payload.rootCause, 500) ?? null,
    concatMode: safeBoundedString(payload.concatMode, 128) ?? null,
    createdAt: event.createdAt,
  };
}

function projectOrchestration(row: WorkerJobRow): SafeWorkerJobOrchestration {
  const orchestration = asRecord(asRecord(row.inputJson).orchestration);
  if (Object.keys(orchestration).length === 0) {
    return {
      planId: null,
      stepId: null,
      stepIndex: null,
      totalSteps: null,
      dependsOnJobIds: [],
      metadataState: "none",
    };
  }

  const planId = safeBoundedString(orchestration.planId, 128);
  const stepId = safeBoundedString(orchestration.stepId, 128);
  const rawDependencies = orchestration.dependsOnJobIds;
  const dependencies = Array.isArray(rawDependencies)
    ? rawDependencies.map(value => safeBoundedString(value, 128))
    : [];
  const dependenciesValid = rawDependencies === undefined || (
    Array.isArray(rawDependencies) &&
    rawDependencies.length <= MAX_DEPENDENCY_JOBS &&
    dependencies.every(value => value !== undefined)
  );
  const parsedStepIndex = safeInteger(orchestration.stepIndex, 1, 200)
    ?? (stepId?.match(/:step:(\d+)$/)?.[1]
      ? safeInteger(Number(stepId.match(/:step:(\d+)$/)?.[1]), 1, 200)
      : undefined);
  const rawStepIndex = orchestration.stepIndex;
  const stepIndexValid = rawStepIndex === undefined || parsedStepIndex !== undefined;
  const totalSteps = safeInteger(orchestration.totalSteps, 1, 200);
  const totalStepsValid = orchestration.totalSteps === undefined || totalSteps !== undefined;
  const metadataState = planId && stepId && dependenciesValid && stepIndexValid && totalStepsValid
    ? "valid"
    : "degraded";

  return {
    planId: metadataState === "valid" ? planId : null,
    stepId: metadataState === "valid" ? stepId : null,
    stepIndex: metadataState === "valid" ? parsedStepIndex ?? null : null,
    totalSteps: metadataState === "valid" ? totalSteps ?? null : null,
    dependsOnJobIds: metadataState === "valid"
      ? dependencies.filter((value): value is string => value !== undefined)
      : [],
    metadataState,
  };
}

function projectProgress(row: WorkerJobRow): {
  progressPercent: number | null;
  progressPhase: string | null;
} {
  const progress = asRecord(row.progressJson);
  return {
    progressPercent: safePercent(
      progress.progressPercent ?? progress.progress ?? progress.percent
    ) ?? null,
    progressPhase: safeBoundedString(
      progress.phase ?? progress.stage ?? progress.status,
      128
    ) ?? null,
  };
}

function projectJob(
  row: WorkerJobRow & { worker: WorkerSummaryRow | null },
  eventsByJobId: Map<string, EventRow[]>,
  artifactsByJobId: Map<string, ArtifactRow[]>,
): UserWorkerJobSummary {
  const events = (eventsByJobId.get(row.id) ?? [])
    .slice()
    .sort((a, b) => (b.eventSequence ?? Number.MAX_SAFE_INTEGER) - (a.eventSequence ?? Number.MAX_SAFE_INTEGER) || b.createdAt.getTime() - a.createdAt.getTime())
    .map(projectEvent);
  const artifactRefs = (artifactsByJobId.get(row.id) ?? [])
    .map(projectArtifact)
    .filter((ref): ref is SafeWorkerOutputRef => ref != null);
  const rawOutputRefs = [...artifactRefs, ...projectOutputJson(row.outputJson)];
  const outputRefs = Array.from(
    rawOutputRefs.reduce((map, ref) => {
      const key = ref.publishedItemId
        ? `pub:${ref.publishedItemId}`
        : ref.artifactId
          ? `art:${ref.artifactId}`
          : `typ:${ref.artifactType}`;
      if (!map.has(key) || (!map.get(key)!.downloadUrl && ref.downloadUrl)) {
        map.set(key, ref);
      }
      return map;
    }, new Map<string, SafeWorkerOutputRef>()).values()
  );
  const status =
    row.jobType === "hyperframes_final_composite" &&
    row.status === "completed" &&
    outputRefs.length === 0
      ? "failed"
      : row.status;
  const orchestration = projectOrchestration(row);
  const persistedProgress = projectProgress(row);
  const latestEvent = events[0] ?? null;

  return {
    id: row.id,
    jobType: row.jobType,
    status: status as UserWorkerJobStatus,
    statusReason: row.statusReason,
    failureReason:
      status === "failed" && !row.failureReason
        ? "HyperFrames final video verification failed."
        : row.failureReason,
    runtimeType: row.runtimeType,
    resourceProfile: row.resourceProfile,
    workflowRunId: row.workflowRunId,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    progressPercent: latestEvent?.progressPercent ?? persistedProgress.progressPercent,
    progressPhase: latestEvent?.phase ?? persistedProgress.progressPhase,
    orchestration,
    latestEvent,
    worker: row.worker?.id ? row.worker : null,
    outputRefs,
    canCancel: ["pending", "queued", "leased", "running", "waiting_external", "retry_scheduled", "claimed", "preparing", "uploading", "publishing", "indexing"].includes(status),
  };
}

function groupByJobId<T extends { workerJobId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const items = grouped.get(row.workerJobId) ?? [];
    items.push(row);
    grouped.set(row.workerJobId, items);
  }
  return grouped;
}

function isSuccessfulStatus(status: UserWorkerJobStatus): boolean {
  return status === "completed" || status === "succeeded";
}

function isTerminalStatus(status: UserWorkerJobStatus): boolean {
  return isSuccessfulStatus(status) || ["failed", "cancelled", "canceled", "expired"].includes(status);
}

function compareTaskJobs(a: UserWorkerJobSummary, b: UserWorkerJobSummary): number {
  const aIndex = a.orchestration.stepIndex ?? Number.MAX_SAFE_INTEGER;
  const bIndex = b.orchestration.stepIndex ?? Number.MAX_SAFE_INTEGER;
  return aIndex - bIndex
    || a.createdAt.getTime() - b.createdAt.getTime()
    || a.id.localeCompare(b.id);
}

function taskGroupKey(job: UserWorkerJobSummary): {
  groupId: string;
  groupKind: UserWorkerTaskGroup["groupKind"];
  title: string;
} {
  if (job.orchestration.metadataState === "valid" && job.orchestration.planId) {
    return {
      groupId: `plan:${job.orchestration.planId}`,
      groupKind: "plan",
      title: `Plan ${job.orchestration.planId}`,
    };
  }
  if (job.orchestration.metadataState !== "degraded" && job.workflowRunId) {
    return {
      groupId: `workflow:${job.workflowRunId}`,
      groupKind: "workflow",
      title: `Workflow ${job.workflowRunId}`,
    };
  }
  return {
    groupId: `job:${job.id}`,
    groupKind: "single",
    title: job.jobType,
  };
}

function aggregateTaskStatus(jobs: UserWorkerJobSummary[], totalSteps: number): UserWorkerJobStatus {
  if (jobs.some(job => job.status === "failed")) return "failed";
  if (jobs.some(job => job.status === "expired")) return "expired";
  if (jobs.some(job => ["cancelled", "canceled"].includes(job.status))) return "canceled";

  const activeJobs = jobs.filter(job => !isTerminalStatus(job.status));
  if (activeJobs.length > 0) {
    for (const status of [
      "running", "publishing", "uploading", "indexing", "preparing", "claimed",
      "leased", "waiting_external", "retry_scheduled", "queued", "pending",
    ] as UserWorkerJobStatus[]) {
      if (activeJobs.some(job => job.status === status)) return status;
    }
    return activeJobs[0].status;
  }
  return jobs.length >= totalSteps && jobs.every(job => isSuccessfulStatus(job.status))
    ? "succeeded"
    : "queued";
}

function latestTaskEvent(jobs: UserWorkerJobSummary[]): SafeWorkerJobEvent | null {
  return jobs
    .map(job => job.latestEvent)
    .filter((event): event is SafeWorkerJobEvent => event != null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0]
    ?? null;
}

function aggregateTaskProgress(jobs: UserWorkerJobSummary[], totalSteps: number): number | null {
  if (totalSteps <= 0) return null;
  const knownProgress = jobs.reduce((sum, job) => (
    sum + (isSuccessfulStatus(job.status) ? 100 : job.progressPercent ?? 0)
  ), 0);
  return Math.max(0, Math.min(100, Math.round(knownProgress / totalSteps)));
}

/**
 * Pure server-side grouping used by both the task-group query and focused
 * tests. It accepts only already scoped/safe summaries.
 */
export function groupUserWorkerJobs(jobs: UserWorkerJobSummary[]): UserWorkerTaskGroup[] {
  const groups = new Map<string, {
    groupKind: UserWorkerTaskGroup["groupKind"];
    title: string;
    jobs: UserWorkerJobSummary[];
  }>();

  for (const job of jobs) {
    const key = taskGroupKey(job);
    const group = groups.get(key.groupId) ?? {
      groupKind: key.groupKind,
      title: key.title,
      jobs: [],
    };
    group.jobs.push(job);
    groups.set(key.groupId, group);
  }

  return Array.from(groups.entries())
    .map(([groupId, group]) => {
      const orderedJobs = group.jobs.slice().sort(compareTaskJobs);
      const explicitTotal = Math.max(
        ...orderedJobs.map(job => job.orchestration.totalSteps ?? 0),
        0,
      );
      const totalSteps = Math.max(explicitTotal, orderedJobs.length, 1);
      const activeStep = orderedJobs.find(job => !isTerminalStatus(job.status));
      return {
        groupId,
        groupKind: group.groupKind,
        title: group.title,
        status: aggregateTaskStatus(orderedJobs, totalSteps),
        progressPercent: aggregateTaskProgress(orderedJobs, totalSteps),
        completedSteps: orderedJobs.filter(job => isSuccessfulStatus(job.status)).length,
        totalSteps,
        activeStepId: activeStep?.orchestration.stepId ?? activeStep?.id ?? null,
        latestEvent: latestTaskEvent(orderedJobs),
        metadataState: orderedJobs.some(job => job.orchestration.metadataState === "degraded")
          ? "degraded"
          : "clean",
        jobs: orderedJobs,
      } satisfies UserWorkerTaskGroup;
    })
    .sort((a, b) => {
      const aDate = Math.max(...a.jobs.map(job => job.createdAt.getTime()), 0);
      const bDate = Math.max(...b.jobs.map(job => job.createdAt.getTime()), 0);
      return bDate - aDate || a.groupId.localeCompare(b.groupId);
    });
}

async function projectJobRows(
  repo: WorkerJobMonitorRepository,
  jobs: Array<WorkerJobRow & { worker: WorkerSummaryRow | null }>,
  eventLimit = 1,
): Promise<UserWorkerJobSummary[]> {
  const jobIds = jobs.map(job => job.id);
  const [events, artifacts] = await Promise.all([
    repo.listEvents(jobIds, eventLimit),
    repo.listArtifacts(jobIds),
  ]);
  const eventsByJobId = groupByJobId(events);
  const artifactsByJobId = groupByJobId(artifacts);
  return jobs.map(job => projectJob(job, eventsByJobId, artifactsByJobId));
}

function rowIsInScope(
  row: WorkerJobRow,
  auth: WorkerJobMonitorAuth,
): boolean {
  return row.tenantId === auth.tenantId && row.requestedByUserId === auth.userId;
}

async function resolveDependencyRows(
  repo: WorkerJobMonitorRepository,
  auth: WorkerJobMonitorAuth,
  initialRows: Array<WorkerJobRow & { worker: WorkerSummaryRow | null }>,
): Promise<Array<WorkerJobRow & { worker: WorkerSummaryRow | null }>> {
  if (!repo.listUserJobsByIds) return initialRows;

  const rowsById = new Map(initialRows.map(row => [row.id, row]));
  let pending = Array.from(new Set(initialRows.flatMap(row => projectOrchestration(row).dependsOnJobIds)));
  let rounds = 0;
  while (pending.length > 0 && rounds < 4 && rowsById.size < MAX_TASK_GROUP_SOURCE_JOBS + MAX_DEPENDENCY_JOBS) {
    const dependencyRows = await repo.listUserJobsByIds({
      auth,
      jobIds: pending.slice(0, MAX_DEPENDENCY_JOBS),
    });
    const nextPending: string[] = [];
    for (const row of dependencyRows) {
      if (!rowIsInScope(row, auth) || rowsById.has(row.id)) continue;
      rowsById.set(row.id, row);
      nextPending.push(...projectOrchestration(row).dependsOnJobIds);
    }
    pending = Array.from(new Set(nextPending.filter(id => !rowsById.has(id))));
    rounds += 1;
  }
  return Array.from(rowsById.values());
}

export async function listUserWorkerJobs(
  input: {
    auth: WorkerJobMonitorAuth;
    status?: UserWorkerJobStatus;
    jobType?: string;
    limit?: number;
    offset?: number;
  },
  deps: { repo?: WorkerJobMonitorRepository } = {},
): Promise<{ items: UserWorkerJobSummary[] }> {
  const repo = deps.repo ?? defaultWorkerJobMonitorRepo;
  const jobs = await repo.listUserJobs({
    auth: input.auth,
    statuses: input.status ? [input.status] : undefined,
    ...(input.jobType ? { jobType: input.jobType } : {}),
    limit: input.limit ?? 50,
    offset: input.offset ?? 0,
  });

  return {
    items: await projectJobRows(repo, jobs),
  };
}

export async function listUserWorkerTaskGroups(
  input: {
    auth: WorkerJobMonitorAuth;
    limit?: number;
    offset?: number;
  },
  deps: { repo?: WorkerJobMonitorRepository } = {},
): Promise<UserWorkerTaskGroupsPage> {
  const repo = deps.repo ?? defaultWorkerJobMonitorRepo;
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const offset = Math.max(0, input.offset ?? 0);
  const sourceLimit = MAX_TASK_GROUP_SOURCE_JOBS + 1;
  const openRows = await repo.listUserJobs({
    auth: input.auth,
    statuses: OPEN_USER_WORKER_JOB_STATUSES,
    limit: sourceLimit,
    offset: 0,
  });
  const sourceTruncated = openRows.length > MAX_TASK_GROUP_SOURCE_JOBS;
  const scopedOpenRows = openRows
    .slice(0, MAX_TASK_GROUP_SOURCE_JOBS)
    .filter(row => rowIsInScope(row, input.auth));
  const allRows = await resolveDependencyRows(repo, input.auth, scopedOpenRows);
  const summaries = await projectJobRows(repo, allRows);
  const openJobIds = new Set(scopedOpenRows.map(row => row.id));
  const allGroups = groupUserWorkerJobs(summaries).filter(group =>
    group.jobs.some(job => openJobIds.has(job.id))
  );
  const end = offset + limit;

  return {
    groups: allGroups.slice(offset, end),
    hasMore: allGroups.length > end,
    nextOffset: end,
    sourceTruncated,
  };
}

export async function getUserWorkerJobDetail(
  input: {
    auth: WorkerJobMonitorAuth;
    jobId: string;
  },
  deps: { repo?: WorkerJobMonitorRepository } = {},
): Promise<UserWorkerJobDetail> {
  const repo = deps.repo ?? defaultWorkerJobMonitorRepo;
  const job = await repo.getUserJob(input);
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Worker job not found" });
  }

  const [events, artifacts] = await Promise.all([
    repo.listEvents([job.id], 100),
    repo.listArtifacts([job.id]),
  ]);
  const summary = projectJob(job, groupByJobId(events), groupByJobId(artifacts));
  return {
    ...summary,
    events: events
      .slice()
      .sort((a, b) => (a.eventSequence ?? Number.MAX_SAFE_INTEGER) - (b.eventSequence ?? Number.MAX_SAFE_INTEGER) || a.createdAt.getTime() - b.createdAt.getTime())
      .map(projectEvent),
  };
}

export async function cancelQueuedUserWorkerJob(
  input: {
    auth: WorkerJobMonitorAuth;
    jobId: string;
  },
  deps: { repo?: WorkerJobMonitorRepository; controlPlane?: Pick<ReturnType<typeof createJobControlPlane>, "cancel"> } = {},
): Promise<{ canceled: true; jobId: string }> {
  const repo = deps.repo ?? defaultWorkerJobMonitorRepo;
  const current = await repo.getUserJob(input);
  const controlPlane = deps.controlPlane ?? (repo === defaultWorkerJobMonitorRepo ? createJobControlPlane() : undefined);
  if (current && controlPlane && [
    "pending", "queued", "retry_scheduled", "leased", "running", "waiting_external",
    "claimed", "preparing", "uploading", "publishing", "indexing",
  ].includes(current.status)) {
    const actionId = `user-cancel:${input.auth.tenantId}:${input.auth.userId}:${input.jobId}`;
    await controlPlane.cancel(
      input.jobId,
      "cancelled_by_request",
      actionId,
      input.auth.userId,
      { tenantId: input.auth.tenantId, requestedByUserId: input.auth.userId },
    );
    const cancelled = await repo.getUserJob(input);
    if (cancelled) await resetCancelledDomainProjection(input, cancelled as WorkerJobRowWithInput);
    return { canceled: true, jobId: input.jobId };
  }
  const updated = await repo.cancelQueuedJob(input);
  if (!updated) {
    const current = await repo.getUserJob(input);
    if (!current) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Worker job not found" });
    }
    throw new TRPCError({
      code: "CONFLICT",
      message: "Only active jobs can be canceled.",
    });
  }

  return finalizeLegacyCancelledJob(input, updated);
}

async function finalizeLegacyCancelledJob(
  input: { auth: WorkerJobMonitorAuth; jobId: string },
  updated: WorkerJobRowWithInput,
): Promise<{ canceled: true; jobId: string }> {
  // Vertical Drama Render Queue plan §4.5 — a canceled
  // `vertical_drama_ffmpeg_assembly` job leaves its linked episode/series
  // state stuck on "pending"/"processing" unless reset here. Best-effort
  // ONLY: any failure in this block must never fail the cancel itself,
  // since the `worker_jobs` row is already terminal at this point. Lazy
  // `await import(...)` for cross-service wiring.
  try {
    const { VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE, verticalDramaFfmpegAssemblyJobContractSchema } =
      await import("../../shared/workerRuntime");
    if (updated.jobType === VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE) {
      const { resetVerticalDramaFfmpegAssemblyStateOnCancel } = await import(
        "./verticalDramaFfmpegAssemblyRunner"
      );
      const contract = verticalDramaFfmpegAssemblyJobContractSchema.parse(updated.inputJson);
      await resetVerticalDramaFfmpegAssemblyStateOnCancel(contract);
    }
    if (updated.jobType === "remotion_render_video") {
      const { resetEpisodePreviewStateOnCancel } = await import(
        "./verticalDramaEpisodePreview"
      );
      await resetEpisodePreviewStateOnCancel({
        tenantId: input.auth.tenantId,
        userId: input.auth.userId,
        jobId: updated.id,
        inputJson: updated.inputJson,
      });
    }
  } catch (error) {
    console.error(
      `[workerJobMonitorService] Failed to reset VD state for canceled job ${updated.id}:`,
      error,
    );
  }

  return { canceled: true, jobId: updated.id };
}

async function resetCancelledDomainProjection(
  input: { auth: WorkerJobMonitorAuth; jobId: string },
  updated: WorkerJobRowWithInput,
): Promise<void> {
  if (!updated.inputJson) return;
  try {
    const { VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE, verticalDramaFfmpegAssemblyJobContractSchema } =
      await import("../../shared/workerRuntime");
    if (updated.jobType === VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE) {
      const { resetVerticalDramaFfmpegAssemblyStateOnCancel } = await import("./verticalDramaFfmpegAssemblyRunner");
      await resetVerticalDramaFfmpegAssemblyStateOnCancel(verticalDramaFfmpegAssemblyJobContractSchema.parse(updated.inputJson));
    }
    if (updated.jobType === "remotion_render_video") {
      const { resetEpisodePreviewStateOnCancel } = await import("./verticalDramaEpisodePreview");
      await resetEpisodePreviewStateOnCancel({ tenantId: input.auth.tenantId, userId: input.auth.userId, jobId: updated.id, inputJson: updated.inputJson });
    }
  } catch (error) {
    console.error(`[workerJobMonitorService] Failed to reset VD state for canceled job ${updated.id}:`, error);
  }
}
