import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../db";
import { workerArtifacts, workerJobEvents, workerJobs } from "../../drizzle/schema";
import type { WorkerResourceProfile, WorkerRuntimeType } from "../../shared/workerRuntime";
import { sanitizeWorkerPayload } from "./workerPayloadSanitizer";
import {
  HERMES_SUPPORTED_JOB_TYPES,
  OPENCLAW_SUPPORTED_JOB_TYPES,
  queueWorkerJobByRuntime,
  WorkerSchedulerError,
} from "./workerSchedulerService";
import { publishWorkerArtifacts, type WorkerArtifactPublicationResult } from "./workerArtifactService";
import { safeEnqueueLibraryIndexJob } from "./libraryService";

type WorkerJobRecord = Record<string, any>;
type WorkerArtifactRecord = Record<string, any>;
type WorkerJobEventRecord = Record<string, any>;

const TERMINAL_WORKER_JOB_STATUSES = new Set([
  "completed",
  "failed",
  "canceled",
  "expired",
] as const);

export const workflowWorkerDispatchRequestSchema = z.object({
  runtimeType: z.enum([
    "openclaw_gateway",
    "desktop_zeroclaw_managed",
    "nemoclaw_sandbox",
    "hiclaw_cluster",
  ] as const).optional(),
  jobType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  timeoutSeconds: z.number().int().min(1).max(86_400).optional(),
  resourceProfile: z.enum([
    "cpu_light",
    "cpu_heavy",
    "gpu_required",
    "large_disk_temp",
    "network_heavy",
    "long_running",
    "sandbox_required",
    "human_observable",
  ] as const).optional(),
  capabilityFamilies: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  preferredWorkerId: z.string().trim().max(64).optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
  reservedCredits: z.number().min(0).max(1_000_000).optional(),
  workflowRunId: z.string().trim().max(64).optional(),
  requestedByPersonaId: z.string().trim().max(64).optional(),
  requestedBySystemComponent: z.string().trim().max(100).optional(),
  teamId: z.string().trim().max(64).optional(),
  jobRequest: z.record(z.unknown()).optional(),
  inputJson: z.record(z.unknown()).optional(),
  instructionsJson: z.record(z.unknown()).optional(),
});

export const workflowWorkerPublishRequestSchema = z.object({
  publishArtifacts: z.boolean().optional(),
});

export interface WorkflowWorkerRuntimeActor {
  userId: number;
  tenantId: string;
  role?: string | null;
}

export interface WorkflowWorkerRuntimeRepository {
  getJobById: (tenantId: string, jobId: string) => Promise<WorkerJobRecord | null>;
  listArtifactsByJobId: (jobId: string) => Promise<WorkerArtifactRecord[]>;
  listJobEventsByJobId: (jobId: string) => Promise<WorkerJobEventRecord[]>;
}

export class WorkflowWorkerRuntimeError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "WorkflowWorkerRuntimeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const defaultRepo: WorkflowWorkerRuntimeRepository = {
  async getJobById(tenantId, jobId) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.id, jobId)))
      .limit(1);
    return job ?? null;
  },
  async listArtifactsByJobId(jobId) {
    const db = await getDb();
    return db
      .select()
      .from(workerArtifacts)
      .where(eq(workerArtifacts.workerJobId, jobId))
      .orderBy(asc(workerArtifacts.createdAt));
  },
  async listJobEventsByJobId(jobId) {
    const db = await getDb();
    return db
      .select()
      .from(workerJobEvents)
      .where(eq(workerJobEvents.workerJobId, jobId))
      .orderBy(desc(workerJobEvents.createdAt))
      .limit(25);
  },
};

function isAdminLikeRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "domain_admin";
}

function assertActorCanAccessJob(actor: WorkflowWorkerRuntimeActor, job: WorkerJobRecord): void {
  if (job.tenantId !== actor.tenantId) {
    throw new WorkflowWorkerRuntimeError("not_found", 404, `Worker job ${job.id} was not found`);
  }

  if (job.requestedByUserId === actor.userId) {
    return;
  }

  if (isAdminLikeRole(actor.role)) {
    return;
  }

  throw new WorkflowWorkerRuntimeError("forbidden", 403, "You do not have access to this worker job");
}

function serializeDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function simplifyArtifactRecord(artifact: WorkerArtifactRecord): Record<string, unknown> {
  return {
    artifactId: String(artifact.id),
    artifactType: typeof artifact.artifactType === "string" ? artifact.artifactType : null,
    storageRef: typeof artifact.storageRef === "string" ? artifact.storageRef : null,
    publishedItemId:
      typeof artifact.publishedItemId === "number" && Number.isInteger(artifact.publishedItemId)
        ? artifact.publishedItemId
        : null,
    metadata: sanitizeWorkerPayload(artifact.metadataJson ?? {}),
    createdAt: serializeDate(artifact.createdAt),
  };
}

function simplifyEventRecord(event: WorkerJobEventRecord): Record<string, unknown> {
  return {
    eventId: String(event.id),
    eventType: typeof event.eventType === "string" ? event.eventType : null,
    payload: sanitizeWorkerPayload(event.payloadJson ?? {}),
    createdAt: serializeDate(event.createdAt),
  };
}

function simplifyPublicationResult(result: WorkerArtifactPublicationResult): Record<string, unknown> {
  return {
    artifactId: result.artifactId,
    publishedItemId: result.publishedItemId,
    created: result.created,
    indexStatus: result.indexStatus,
    safeServing: result.safeServing,
  };
}

function simplifyJobRecord(job: WorkerJobRecord): Record<string, unknown> {
  return {
    id: String(job.id),
    tenantId: String(job.tenantId),
    teamId: job.teamId ?? null,
    workerId: job.workerId ?? null,
    runtimeType: job.runtimeType ?? null,
    workflowRunId: job.workflowRunId ?? null,
    requestedByUserId: job.requestedByUserId ?? null,
    requestedByPersonaId: job.requestedByPersonaId ?? null,
    requestedBySystemComponent: job.requestedBySystemComponent ?? null,
    jobType: job.jobType ?? null,
    status: job.status ?? null,
    statusReason: job.statusReason ?? null,
    priority: job.priority ?? null,
    resourceProfile: job.resourceProfile ?? null,
    failureReason: job.failureReason ?? null,
    timeoutSeconds: job.timeoutSeconds ?? null,
    capabilityRequirements: sanitizeWorkerPayload(job.capabilityRequirementsJson ?? {}),
    input: sanitizeWorkerPayload(job.inputJson ?? {}),
    instructions: sanitizeWorkerPayload(job.instructionsJson ?? {}),
    output: sanitizeWorkerPayload(job.outputJson ?? {}),
    createdAt: serializeDate(job.createdAt),
    startedAt: serializeDate(job.startedAt),
    finishedAt: serializeDate(job.finishedAt),
  };
}

function resolveRuntimeType(jobType: string, runtimeType?: WorkerRuntimeType): WorkerRuntimeType {
  if (runtimeType) {
    return runtimeType;
  }

  if (
    jobType === "video_assembly"
    || jobType === "local_folder_ingest"
    || jobType === "comfy_image_generation"
    || jobType === "comfy_workflow_run"
  ) {
    return "desktop_zeroclaw_managed";
  }

  if (OPENCLAW_SUPPORTED_JOB_TYPES.includes(jobType as any)) {
    return "openclaw_gateway";
  }

  throw new WorkflowWorkerRuntimeError(
    "unsupported_runtime_type",
    400,
    `Job type ${jobType} requires an explicit supported runtimeType`,
  );
}

function coerceCapabilityFamilies(
  runtimeType: WorkerRuntimeType,
  capabilityFamilies: string[] | undefined,
): string[] {
  if (Array.isArray(capabilityFamilies) && capabilityFamilies.length > 0) {
    return capabilityFamilies;
  }
  if (runtimeType === "openclaw_gateway") {
    return ["artifact-producing-session"];
  }
  if (runtimeType === "nemoclaw_sandbox") {
    return ["secure-sandbox-exec"];
  }
  if (runtimeType === "hiclaw_cluster") {
    return ["multi-agent-cluster"];
  }
  return [];
}

export async function dispatchWorkflowWorkerJob(
  input: {
    actor: WorkflowWorkerRuntimeActor;
    payload: z.infer<typeof workflowWorkerDispatchRequestSchema>;
  },
  deps: {
    queueWorkerJobByRuntime?: typeof queueWorkerJobByRuntime;
  } = {},
): Promise<Record<string, unknown>> {
  const queueJob = deps.queueWorkerJobByRuntime ?? queueWorkerJobByRuntime;
  const runtimeType = resolveRuntimeType(input.payload.jobType, input.payload.runtimeType);

  try {
    if (runtimeType === "desktop_zeroclaw_managed") {
      if (
        input.payload.jobType !== "video_assembly"
        && input.payload.jobType !== "local_folder_ingest"
        && input.payload.jobType !== "comfy_image_generation"
        && input.payload.jobType !== "comfy_workflow_run"
      ) {
        throw new WorkflowWorkerRuntimeError(
          "unsupported_job_type",
          400,
          "Desktop workflow dispatch currently supports only video_assembly, local_folder_ingest, comfy_image_generation, and comfy_workflow_run jobs",
        );
      }

      const jobRequest = input.payload.jobRequest ?? input.payload.inputJson ?? {};
      const result = await queueJob({
        runtimeType,
        jobType: input.payload.jobType as
          | "video_assembly"
          | "local_folder_ingest"
          | "comfy_image_generation"
          | "comfy_workflow_run",
        ...(jobRequest as Record<string, unknown>),
        tenantId: input.actor.tenantId,
        teamId: input.payload.teamId ?? null,
        workflowRunId: input.payload.workflowRunId ?? null,
        requestedByUserId: input.actor.userId,
        requestedByPersonaId: input.payload.requestedByPersonaId ?? null,
        requestedBySystemComponent: input.payload.requestedBySystemComponent ?? "workflow_runtime_node",
        priority: input.payload.priority,
        timeoutSeconds: input.payload.timeoutSeconds,
        idempotencyKey: input.payload.idempotencyKey ?? null,
        preferredWorkerId: input.payload.preferredWorkerId ?? null,
        reservedCredits: input.payload.reservedCredits ?? null,
      } as any);

      return {
        created: result.created,
        workerJobId: result.job.id,
        status: result.job.status,
        runtimeType: result.job.runtimeType,
        jobType: result.job.jobType,
        workerJob: simplifyJobRecord(result.job),
      };
    }

    if (runtimeType === "nemoclaw_sandbox" || runtimeType === "hiclaw_cluster") {
      const result = await queueJob({
        runtimeType,
        tenantId: input.actor.tenantId,
        teamId: input.payload.teamId ?? null,
        workflowRunId: input.payload.workflowRunId ?? null,
        requestedByUserId: input.actor.userId,
        requestedByPersonaId: input.payload.requestedByPersonaId ?? null,
        requestedBySystemComponent: input.payload.requestedBySystemComponent ?? "workflow_runtime_node",
        jobType: input.payload.jobType,
        title: input.payload.title ?? null,
        description: input.payload.description ?? null,
        priority: input.payload.priority,
        timeoutSeconds: input.payload.timeoutSeconds,
        resourceProfile: input.payload.resourceProfile as WorkerResourceProfile | undefined,
        capabilityFamilies: coerceCapabilityFamilies(runtimeType, input.payload.capabilityFamilies) as any,
        inputJson: input.payload.inputJson ?? input.payload.jobRequest ?? {},
        instructionsJson: input.payload.instructionsJson ?? {},
        idempotencyKey: input.payload.idempotencyKey ?? null,
        preferredWorkerId: input.payload.preferredWorkerId ?? null,
        reservedCredits: input.payload.reservedCredits ?? null,
      } as any);

      return {
        created: result.created,
        workerJobId: result.job.id,
        status: result.job.status,
        runtimeType: result.job.runtimeType,
        jobType: result.job.jobType,
        workerJob: simplifyJobRecord(result.job),
      };
    }

    const baseQueueInput = {
      tenantId: input.actor.tenantId,
      teamId: input.payload.teamId ?? null,
      workflowRunId: input.payload.workflowRunId ?? null,
      requestedByUserId: input.actor.userId,
      requestedByPersonaId: input.payload.requestedByPersonaId ?? null,
      requestedBySystemComponent: input.payload.requestedBySystemComponent ?? "workflow_runtime_node",
      title: input.payload.title ?? null,
      description: input.payload.description ?? null,
      priority: input.payload.priority,
      timeoutSeconds: input.payload.timeoutSeconds,
      resourceProfile: input.payload.resourceProfile as WorkerResourceProfile | undefined,
      inputJson: input.payload.inputJson ?? input.payload.jobRequest ?? {},
      instructionsJson: input.payload.instructionsJson ?? {},
      idempotencyKey: input.payload.idempotencyKey ?? null,
      preferredWorkerId: input.payload.preferredWorkerId ?? null,
      reservedCredits: input.payload.reservedCredits ?? null,
    };

    const result = runtimeType === "hermes_agent_gateway"
      ? await queueJob({
        runtimeType: "hermes_agent_gateway",
        ...baseQueueInput,
        jobType: input.payload.jobType as (typeof HERMES_SUPPORTED_JOB_TYPES)[number],
        capabilityFamilies: coerceCapabilityFamilies("hermes_agent_gateway", input.payload.capabilityFamilies) as any,
      })
      : await queueJob({
        runtimeType: "openclaw_gateway",
        ...baseQueueInput,
        jobType: input.payload.jobType as (typeof OPENCLAW_SUPPORTED_JOB_TYPES)[number],
        capabilityFamilies: coerceCapabilityFamilies("openclaw_gateway", input.payload.capabilityFamilies) as any,
      });

    return {
      created: result.created,
      workerJobId: result.job.id,
      status: result.job.status,
      runtimeType: result.job.runtimeType,
      jobType: result.job.jobType,
      workerJob: simplifyJobRecord(result.job),
    };
  } catch (error) {
    if (error instanceof WorkflowWorkerRuntimeError || error instanceof WorkerSchedulerError) {
      throw error;
    }
    throw new WorkflowWorkerRuntimeError(
      "dispatch_failed",
      500,
      error instanceof Error ? error.message : "Failed to dispatch worker job",
    );
  }
}

export async function getWorkflowWorkerJobStatus(
  input: {
    actor: WorkflowWorkerRuntimeActor;
    jobId: string;
  },
  deps: {
    repo?: WorkflowWorkerRuntimeRepository;
  } = {},
): Promise<Record<string, unknown>> {
  const repo = deps.repo ?? defaultRepo;
  const job = await repo.getJobById(input.actor.tenantId, input.jobId);
  if (!job) {
    throw new WorkflowWorkerRuntimeError("not_found", 404, `Worker job ${input.jobId} was not found`);
  }

  assertActorCanAccessJob(input.actor, job);
  const [artifacts, events] = await Promise.all([
    repo.listArtifactsByJobId(job.id),
    repo.listJobEventsByJobId(job.id),
  ]);

  const publishedArtifacts = Array.isArray(job.outputJson?.publishedArtifacts)
    ? sanitizeWorkerPayload(job.outputJson?.publishedArtifacts)
    : [];

  return {
    workerJobId: job.id,
    status: job.status,
    runtimeType: job.runtimeType,
    jobType: job.jobType,
    terminal: TERMINAL_WORKER_JOB_STATUSES.has(job.status),
    failureReason: typeof job.failureReason === "string" ? job.failureReason : null,
    workerJob: simplifyJobRecord(job),
    artifacts: artifacts.map(simplifyArtifactRecord),
    artifactRefs: artifacts.map(simplifyArtifactRecord),
    recentEvents: events.map(simplifyEventRecord),
    publishedArtifacts,
  };
}

export async function publishWorkflowWorkerArtifacts(
  input: {
    actor: WorkflowWorkerRuntimeActor;
    jobId: string;
  },
  deps: {
    repo?: WorkflowWorkerRuntimeRepository;
    publishWorkerArtifacts?: typeof publishWorkerArtifacts;
  } = {},
): Promise<Record<string, unknown>> {
  const repo = deps.repo ?? defaultRepo;
  const publish = deps.publishWorkerArtifacts ?? publishWorkerArtifacts;

  const job = await repo.getJobById(input.actor.tenantId, input.jobId);
  if (!job) {
    throw new WorkflowWorkerRuntimeError("not_found", 404, `Worker job ${input.jobId} was not found`);
  }
  assertActorCanAccessJob(input.actor, job);

  const results = await publish({
    tenantId: input.actor.tenantId,
    jobId: input.jobId,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role ?? "user",
  });

  return {
    workerJobId: input.jobId,
    publishedArtifacts: results.map(simplifyPublicationResult),
    publishedItemIds: results.map((result) => result.publishedItemId),
    publishedCount: results.length,
  };
}

export async function triggerWorkflowWorkerRagIndex(
  input: {
    actor: WorkflowWorkerRuntimeActor;
    jobId: string;
  },
  deps: {
    repo?: WorkflowWorkerRuntimeRepository;
    safeEnqueueLibraryIndexJob?: typeof safeEnqueueLibraryIndexJob;
  } = {},
): Promise<Record<string, unknown>> {
  const repo = deps.repo ?? defaultRepo;
  const enqueueIndex = deps.safeEnqueueLibraryIndexJob ?? safeEnqueueLibraryIndexJob;

  const job = await repo.getJobById(input.actor.tenantId, input.jobId);
  if (!job) {
    throw new WorkflowWorkerRuntimeError("not_found", 404, `Worker job ${input.jobId} was not found`);
  }
  assertActorCanAccessJob(input.actor, job);

  const artifacts = await repo.listArtifactsByJobId(job.id);
  const publishedArtifacts = artifacts.filter(
    (artifact) => typeof artifact.publishedItemId === "number" && Number.isInteger(artifact.publishedItemId),
  );

  const indexingJobs = await Promise.all(
    publishedArtifacts.map(async (artifact) => {
      const indexJob = await enqueueIndex({
        libraryItemId: artifact.publishedItemId,
        tenantId: input.actor.tenantId,
        jobType: "workflow_worker_reindex",
        domain: "library",
        operation: "index",
        source: "workflow.worker_runtime_reindex",
        sourceMetadata: {
          workerJobId: job.id,
          workerArtifactId: artifact.id,
          runtimeType: job.runtimeType,
          requestedByUserId: job.requestedByUserId ?? input.actor.userId,
        },
        allowThrottle: true,
      });

      return {
        artifactId: String(artifact.id),
        publishedItemId: artifact.publishedItemId,
        status: indexJob.status,
        jobId: indexJob.jobId,
        created: indexJob.created,
        dedupeKey: indexJob.dedupeKey,
      };
    }),
  );

  return {
    workerJobId: input.jobId,
    publishedItemIds: publishedArtifacts.map((artifact) => artifact.publishedItemId),
    indexingJobs,
    indexedCount: indexingJobs.length,
  };
}
