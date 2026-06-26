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

export const USER_WORKER_JOB_STATUSES = [
  "queued",
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
  "completed",
  "failed",
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
  | "createdAt"
  | "startedAt"
  | "finishedAt"
>;

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
    limit: number;
    offset: number;
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
  }): Promise<WorkerJobRow | null>;
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
  latestEvent: SafeWorkerJobEvent | null;
  worker: WorkerSummaryRow | null;
  outputRefs: SafeWorkerOutputRef[];
  canCancel: boolean;
};

export type UserWorkerJobDetail = UserWorkerJobSummary & {
  events: SafeWorkerJobEvent[];
};

export const defaultWorkerJobMonitorRepo: WorkerJobMonitorRepository = {
  async listUserJobs(input) {
    const conditions = [
      eq(workerJobs.tenantId, input.auth.tenantId),
      eq(workerJobs.requestedByUserId, input.auth.userId),
    ];

    if (input.statuses?.length) {
      conditions.push(inArray(workerJobs.status, input.statuses) as any);
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

    return (updated as WorkerJobRow | undefined) ?? null;
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

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
    sidecarEventType: safeString(payload.eventType ?? payload.sidecarEventType) ?? null,
    message: safeString(payload.message ?? payload.safeMessage ?? payload.phaseLabel) ?? null,
    progressPercent: safeNumber(payload.progressPercent ?? payload.progress ?? payload.percent) ?? null,
    phase: safeString(payload.phase ?? payload.stage ?? payload.status) ?? null,
    shotId: safeString(payload.shotId) ?? null,
    shotIndex: safeNumber(payload.shotIndex) ?? null,
    shotTotal: safeNumber(payload.shotTotal) ?? null,
    cacheHit: safeBoolean(payload.cacheHit) ?? null,
    errorCode: safeString(payload.errorCode ?? payload.failureCode ?? payload.code) ?? null,
    rootCause: safeString(payload.rootCause) ?? null,
    concatMode: safeString(payload.concatMode) ?? null,
    createdAt: event.createdAt,
  };
}

function projectJob(
  row: WorkerJobRow & { worker: WorkerSummaryRow | null },
  eventsByJobId: Map<string, EventRow[]>,
  artifactsByJobId: Map<string, ArtifactRow[]>,
): UserWorkerJobSummary {
  const events = (eventsByJobId.get(row.id) ?? [])
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
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
    latestEvent: events[0] ?? null,
    worker: row.worker?.id ? row.worker : null,
    outputRefs,
    canCancel: ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing"].includes(status),
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

export async function listUserWorkerJobs(
  input: {
    auth: WorkerJobMonitorAuth;
    status?: UserWorkerJobStatus;
    limit?: number;
    offset?: number;
  },
  deps: { repo?: WorkerJobMonitorRepository } = {},
): Promise<{ items: UserWorkerJobSummary[] }> {
  const repo = deps.repo ?? defaultWorkerJobMonitorRepo;
  const jobs = await repo.listUserJobs({
    auth: input.auth,
    statuses: input.status ? [input.status] : undefined,
    limit: input.limit ?? 50,
    offset: input.offset ?? 0,
  });
  const jobIds = jobs.map((job) => job.id);
  const [events, artifacts] = await Promise.all([
    repo.listEvents(jobIds, 1),
    repo.listArtifacts(jobIds),
  ]);

  return {
    items: jobs.map((job) => projectJob(job, groupByJobId(events), groupByJobId(artifacts))),
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
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(projectEvent),
  };
}

export async function cancelQueuedUserWorkerJob(
  input: {
    auth: WorkerJobMonitorAuth;
    jobId: string;
  },
  deps: { repo?: WorkerJobMonitorRepository } = {},
): Promise<{ canceled: true; jobId: string }> {
  const repo = deps.repo ?? defaultWorkerJobMonitorRepo;
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
  return { canceled: true, jobId: updated.id };
}
