import crypto from "crypto";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  isNotNull,
  lt,
  or,
} from "drizzle-orm";

import type {
  WorkerArtifactCompletePayload,
  WorkerArtifactInitPayload,
  WorkerClaimRequest,
  WorkerDiagnosticsPayload,
  WorkerHeartbeatPayload,
  WorkerJobEventPayload,
  WorkerJobStatus,
  WorkerProtocolCompatibility,
  WorkerRegistrationPayload,
  WorkerRuntimeType,
} from "../../shared/workerRuntime";
import { WORKER_RUNTIME_PROTOCOL_VERSION } from "../../shared/workerRuntime";
import type {
  WorkerAccessAuthContext,
  WorkerRegistrationAuthContext,
} from "./workerAuthService";
import { issueWorkerAccessTokens } from "./workerAuthService";
import { getDb } from "../db";
import {
  runtimeProfiles,
  workerArtifacts,
  workerHeartbeats,
  workerJobEvents,
  workerJobs,
  workerPolicies,
  workers,
} from "../../drizzle/schema";
import { storagePresignPut } from "../storage";
import {
  billingEnvelopeFromMetadata,
  reconcileWorkerJobCredits,
} from "./workerBillingService";
import { publishWorkerArtifacts } from "./workerArtifactService";
import { getDelegatedWorkerDownstreamCreditsUsed } from "./delegatedWorkerPlatformService";
import { workerJobMatchesSelection } from "./workerSchedulerService";
import { auditLogger } from "./auditLogger";
import {
  isPlainObject,
  sanitizeWorkerPayload,
  sanitizeWorkerWarningFlags,
} from "./workerPayloadSanitizer";

const SUPPORTED_RUNTIME_TYPE: WorkerRuntimeType = "openclaw_gateway";
const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;
const RECLAIMABLE_JOB_STATUSES: WorkerJobStatus[] = [
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
];
const TERMINAL_JOB_STATUSES: WorkerJobStatus[] = [
  "completed",
  "failed",
  "canceled",
  "expired",
];
const JOB_EVENT_STATUS_MAP: Record<string, WorkerJobStatus | null> = {
  "job.progress": null,
  "job.preparing": "preparing",
  "job.running": "running",
  "job.uploading": "uploading",
  "job.publishing": "publishing",
  "job.indexing": "indexing",
  "job.completed": "completed",
  "job.failed": "failed",
  "job.canceled": "canceled",
};
const ALLOWED_JOB_TRANSITIONS: Record<WorkerJobStatus, WorkerJobStatus[]> = {
  queued: ["claimed"],
  claimed: ["preparing", "running", "failed", "canceled"],
  preparing: ["running", "uploading", "failed", "canceled"],
  running: ["uploading", "publishing", "indexing", "completed", "failed", "canceled"],
  uploading: ["publishing", "indexing", "completed", "failed", "canceled"],
  publishing: ["indexing", "completed", "failed", "canceled"],
  indexing: ["completed", "failed", "canceled"],
  completed: [],
  failed: [],
  canceled: [],
  expired: [],
};
type WorkerRecord = Record<string, any>;
type WorkerJobRecord = Record<string, any>;
type WorkerJobEventRecord = Record<string, any>;
type WorkerArtifactRecord = Record<string, any>;

function sanitizeDashboardUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) {
    return null;
  }
  try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function readWorkerControlPlaneState(worker: WorkerRecord): Record<string, unknown> {
  if (!isPlainObject(worker?.healthSummaryJson)) {
    return {};
  }
  const controlPlane = worker.healthSummaryJson.controlPlane;
  return isPlainObject(controlPlane) ? controlPlane : {};
}

function readWorkerRevokedAt(worker: WorkerRecord): string | null {
  const controlPlane = readWorkerControlPlaneState(worker);
  return typeof controlPlane.revokedAt === "string" && controlPlane.revokedAt.trim()
    ? controlPlane.revokedAt
    : null;
}

export interface WorkerRuntimeRepository {
  createWorker: (values: Record<string, any>) => Promise<WorkerRecord>;
  findArtifact: (workerJobId: string, storageRef: string) => Promise<WorkerArtifactRecord | null>;
  findRuntimeProfileByName: (runtimeType: WorkerRuntimeType, name: string | null) => Promise<Record<string, any> | null>;
  findWorkerByExternalReference: (tenantId: string, externalReference: string) => Promise<WorkerRecord | null>;
  findWorkerPolicyByName: (tenantId: string, runtimeType: WorkerRuntimeType, name: string | null) => Promise<Record<string, any> | null>;
  getJobById: (tenantId: string, jobId: string) => Promise<WorkerJobRecord | null>;
  getRuntimeProfileById: (id: string) => Promise<Record<string, any> | null>;
  getWorkerById: (tenantId: string, workerId: string) => Promise<WorkerRecord | null>;
  getWorkerPolicyById: (id: string) => Promise<Record<string, any> | null>;
  insertArtifact: (values: Record<string, any>) => Promise<WorkerArtifactRecord>;
  insertHeartbeat: (values: Record<string, any>) => Promise<void>;
  insertJobEvent: (workerJobId: string, eventType: string, payloadJson: Record<string, unknown>) => Promise<WorkerJobEventRecord>;
  listClaimableJobs: (tenantId: string, runtimeType: WorkerRuntimeType, teamId: string | null, capabilityHints: string[]) => Promise<WorkerJobRecord[]>;
  listJobEvents: (workerJobId: string) => Promise<WorkerJobEventRecord[]>;
  tryClaimJob: (jobId: string, workerId: string, leaseOwnerToken: string, leaseExpiresAt: Date) => Promise<WorkerJobRecord | null>;
  updateJob: (jobId: string, values: Record<string, any>) => Promise<WorkerJobRecord>;
  updateWorker: (workerId: string, values: Record<string, any>) => Promise<WorkerRecord>;
  updateWorkerDiagnostics: (workerId: string, values: Record<string, any>) => Promise<WorkerRecord>;
}

export class WorkerRuntimeServiceError extends Error {
  code: string;
  statusCode: number;
  type: string;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    type = "invalid_request_error",
  ) {
    super(message);
    this.name = "WorkerRuntimeServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.type = type;
  }
}

function compareProtocolVersions(left: string, right: string): number {
  return left.localeCompare(right);
}

function assertSupportedRuntimeType(runtimeType: WorkerRuntimeType): void {
  if (runtimeType !== SUPPORTED_RUNTIME_TYPE) {
    throw new WorkerRuntimeServiceError(
      "invalid_request",
      400,
      `Runtime type ${runtimeType} is not supported by this control-plane profile`,
    );
  }
}

export function assertWorkerProtocolCompatibility(
  compatibility: WorkerProtocolCompatibility,
): void {
  const current = WORKER_RUNTIME_PROTOCOL_VERSION;
  if (compatibility.protocolVersion !== current) {
    throw new WorkerRuntimeServiceError(
      "protocol_incompatible",
      409,
      `Worker protocol ${compatibility.protocolVersion} is incompatible with server protocol ${current}`,
    );
  }
  if (
    compatibility.minServerProtocolVersion
    && compareProtocolVersions(current, compatibility.minServerProtocolVersion) < 0
  ) {
    throw new WorkerRuntimeServiceError(
      "protocol_incompatible",
      409,
      `Server protocol ${current} is below worker minimum ${compatibility.minServerProtocolVersion}`,
    );
  }
  if (
    compatibility.maxServerProtocolVersion
    && compareProtocolVersions(current, compatibility.maxServerProtocolVersion) > 0
  ) {
    throw new WorkerRuntimeServiceError(
      "protocol_incompatible",
      409,
      `Server protocol ${current} is above worker maximum ${compatibility.maxServerProtocolVersion}`,
    );
  }
}

function requireWorkerRecord(
  worker: WorkerRecord | null,
  workerId: string,
): WorkerRecord {
  if (!worker) {
    throw new WorkerRuntimeServiceError("not_found", 404, `Worker ${workerId} was not found`, "not_found_error");
  }
  return worker;
}

function requireJobRecord(
  job: WorkerJobRecord | null,
  jobId: string,
): WorkerJobRecord {
  if (!job) {
    throw new WorkerRuntimeServiceError("not_found", 404, `Worker job ${jobId} was not found`, "not_found_error");
  }
  return job;
}

function ensureWorkerScopedAccess(
  auth: WorkerAccessAuthContext,
  worker: WorkerRecord,
  requestedWorkerId: string,
): void {
  if (worker.id !== auth.workerId || requestedWorkerId !== auth.workerId) {
    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Worker token does not match the requested worker", "auth_error");
  }
  if (worker.tenantId !== auth.tenantId || worker.runtimeType !== auth.runtimeType) {
    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Worker token does not match the requested tenant/runtime", "auth_error");
  }
  if (readWorkerRevokedAt(worker)) {
    throw new WorkerRuntimeServiceError("worker_auth_invalid", 401, "Worker token has been revoked", "auth_error");
  }
}

function ensureJobScopedAccess(
  auth: WorkerAccessAuthContext,
  job: WorkerJobRecord,
): void {
  if (job.tenantId !== auth.tenantId || job.runtimeType !== auth.runtimeType) {
    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Worker token does not match the requested job scope", "auth_error");
  }
  if (job.workerId && job.workerId !== auth.workerId) {
    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Worker token does not own the requested job", "auth_error");
  }
}

function ensureWorkerCanClaim(worker: WorkerRecord): void {
  if (worker.status === "disabled" || worker.status === "draining") {
    throw new WorkerRuntimeServiceError(
      "worker_state_invalid",
      409,
      `Worker ${worker.id} cannot claim jobs while ${worker.status}`,
    );
  }
}

function ensureLease(job: WorkerJobRecord, leaseOwnerToken: string): void {
  if (!leaseOwnerToken || !job.leaseOwnerToken || job.leaseOwnerToken !== leaseOwnerToken) {
    throw new WorkerRuntimeServiceError("stale_worker_lease", 409, "Worker lease token is stale or invalid");
  }
  if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) {
    throw new WorkerRuntimeServiceError("stale_worker_lease", 409, "Worker lease has expired");
  }
}

function resolveEventStatus(eventType: string): WorkerJobStatus | null {
  return JOB_EVENT_STATUS_MAP[eventType] ?? null;
}

function assertStatusTransition(
  currentStatus: WorkerJobStatus,
  nextStatus: WorkerJobStatus,
): void {
  const allowed = ALLOWED_JOB_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new WorkerRuntimeServiceError(
      "worker_state_invalid",
      409,
      `Worker job cannot transition from ${currentStatus} to ${nextStatus}`,
    );
  }
}

function isTerminalJobStatus(
  status: WorkerJobStatus,
): status is "completed" | "failed" | "canceled" | "expired" {
  return TERMINAL_JOB_STATUSES.includes(status);
}

function readEventSequenceNumber(event: WorkerJobEventRecord): number | null {
  const value = event?.payloadJson?.sequenceNumber;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "artifact.bin";
}

function buildArtifactStorageRef(
  jobId: string,
  auth: WorkerAccessAuthContext,
  payload: WorkerArtifactInitPayload,
): string {
  const basis = payload.checksumSha256
    ?? `${payload.artifactType}:${payload.fileName}:${payload.sizeBytes}:${payload.contentType}`;
  const digest = crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24);
  return `worker-artifacts/${auth.tenantId}/${jobId}/${digest}-${sanitizeFileName(payload.fileName)}`;
}

const defaultRepo: WorkerRuntimeRepository = {
  async createWorker(values) {
    const db = await getDb();
    const [worker] = await db.insert(workers).values(values as any).returning();
    return worker;
  },
  async findArtifact(workerJobId, storageRef) {
    const db = await getDb();
    const [artifact] = await db
      .select()
      .from(workerArtifacts)
      .where(and(eq(workerArtifacts.workerJobId, workerJobId), eq(workerArtifacts.storageRef, storageRef)))
      .limit(1);
    return artifact ?? null;
  },
  async findRuntimeProfileByName(runtimeType, name) {
    if (!name) return null;
    const db = await getDb();
    const [profile] = await db
      .select()
      .from(runtimeProfiles)
      .where(and(eq(runtimeProfiles.runtimeType, runtimeType), eq(runtimeProfiles.name, name)))
      .limit(1);
    return profile ?? null;
  },
  async findWorkerByExternalReference(tenantId, externalReference) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.externalReference, externalReference)))
      .limit(1);
    return worker ?? null;
  },
  async findWorkerPolicyByName(tenantId, runtimeType, name) {
    if (!name) return null;
    const db = await getDb();
    const [policy] = await db
      .select()
      .from(workerPolicies)
      .where(
        and(
          eq(workerPolicies.tenantId, tenantId),
          eq(workerPolicies.runtimeType, runtimeType),
          eq(workerPolicies.name, name),
        ),
      )
      .limit(1);
    return policy ?? null;
  },
  async getJobById(tenantId, jobId) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.id, jobId), eq(workerJobs.tenantId, tenantId)))
      .limit(1);
    return job ?? null;
  },
  async getRuntimeProfileById(id) {
    const db = await getDb();
    const [profile] = await db
      .select()
      .from(runtimeProfiles)
      .where(eq(runtimeProfiles.id, id))
      .limit(1);
    return profile ?? null;
  },
  async getWorkerById(tenantId, workerId) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.id, workerId), eq(workers.tenantId, tenantId)))
      .limit(1);
    return worker ?? null;
  },
  async getWorkerPolicyById(id) {
    const db = await getDb();
    const [policy] = await db
      .select()
      .from(workerPolicies)
      .where(eq(workerPolicies.id, id))
      .limit(1);
    return policy ?? null;
  },
  async insertArtifact(values) {
    const db = await getDb();
    const [artifact] = await db.insert(workerArtifacts).values(values as any).returning();
    return artifact;
  },
  async insertHeartbeat(values) {
    const db = await getDb();
    await db.insert(workerHeartbeats).values(values as any);
  },
  async insertJobEvent(workerJobId, eventType, payloadJson) {
    const db = await getDb();
    const [event] = await db.insert(workerJobEvents).values({
      workerJobId,
      eventType,
      payloadJson,
    }).returning();
    return event;
  },
  async listClaimableJobs(tenantId, runtimeType, teamId) {
    const db = await getDb();
    const now = new Date();
    const conditions = [
      eq(workerJobs.tenantId, tenantId),
      eq(workerJobs.runtimeType, runtimeType),
      or(
        eq(workerJobs.status, "queued"),
        and(
          inArray(workerJobs.status, RECLAIMABLE_JOB_STATUSES),
          isNotNull(workerJobs.leaseExpiresAt),
          lt(workerJobs.leaseExpiresAt, now),
        ),
      ),
    ];

    if (teamId) {
      conditions.push(or(eq(workerJobs.teamId, teamId), isNull(workerJobs.teamId)));
    }

    return db
      .select()
      .from(workerJobs)
      .where(and(...conditions))
      .orderBy(desc(workerJobs.priority), asc(workerJobs.createdAt))
      .limit(10);
  },
  async listJobEvents(workerJobId) {
    const db = await getDb();
    return db
      .select()
      .from(workerJobEvents)
      .where(eq(workerJobEvents.workerJobId, workerJobId))
      .orderBy(asc(workerJobEvents.createdAt));
  },
  async tryClaimJob(jobId, workerId, leaseOwnerToken, leaseExpiresAt) {
    const db = await getDb();
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(workerJobs)
        .where(eq(workerJobs.id, jobId))
        .limit(1);
      if (!current) return null;

      const currentLeaseExpiresAt = current.leaseExpiresAt ? new Date(current.leaseExpiresAt) : null;
      const isReclaimable =
        RECLAIMABLE_JOB_STATUSES.includes(current.status)
        && currentLeaseExpiresAt
        && currentLeaseExpiresAt.getTime() < Date.now();
      if (current.status !== "queued" && !isReclaimable) {
        return null;
      }

      const whereConditions = [eq(workerJobs.id, jobId), eq(workerJobs.status, current.status)];
      if (current.workerId) {
        whereConditions.push(eq(workerJobs.workerId, current.workerId));
      } else {
        whereConditions.push(isNull(workerJobs.workerId));
      }
      if (current.leaseOwnerToken) {
        whereConditions.push(eq(workerJobs.leaseOwnerToken, current.leaseOwnerToken));
      } else {
        whereConditions.push(isNull(workerJobs.leaseOwnerToken));
      }

      const [claimed] = await tx
        .update(workerJobs)
        .set({
          workerId,
          status: "claimed",
          statusReason: null,
          leaseOwnerToken,
          leaseExpiresAt,
        })
        .where(and(...whereConditions))
        .returning();
      return claimed ?? null;
    });
  },
  async updateJob(jobId, values) {
    const db = await getDb();
    const [job] = await db
      .update(workerJobs)
      .set(values)
      .where(eq(workerJobs.id, jobId))
      .returning();
    if (!job) {
      throw new WorkerRuntimeServiceError("not_found", 404, `Worker job ${jobId} was not found`, "not_found_error");
    }
    return job;
  },
  async updateWorker(workerId, values) {
    const db = await getDb();
    const [worker] = await db
      .update(workers)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(workers.id, workerId))
      .returning();
    if (!worker) {
      throw new WorkerRuntimeServiceError("not_found", 404, `Worker ${workerId} was not found`, "not_found_error");
    }
    return worker;
  },
  async updateWorkerDiagnostics(workerId, values) {
    const db = await getDb();
    const [worker] = await db
      .update(workers)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(workers.id, workerId))
      .returning();
    if (!worker) {
      throw new WorkerRuntimeServiceError("not_found", 404, `Worker ${workerId} was not found`, "not_found_error");
    }
    return worker;
  },
};

export function getDefaultWorkerRuntimeRepository(): WorkerRuntimeRepository {
  return defaultRepo;
}

export async function registerWorker(
  input: {
    auth: WorkerRegistrationAuthContext;
    payload: WorkerRegistrationPayload;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<{
  created: boolean;
  tokens: { executionToken: string; uploadToken: string };
  worker: WorkerRecord;
}> {
  const repo = deps.repo ?? defaultRepo;
  assertSupportedRuntimeType(input.payload.runtimeType);
  assertWorkerProtocolCompatibility(input.payload.compatibility);

  if (input.auth.runtimeType && input.auth.runtimeType !== input.payload.runtimeType) {
    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Registration token runtime does not match the payload runtime", "auth_error");
  }
  if (input.auth.teamId && input.payload.teamId && input.auth.teamId !== input.payload.teamId) {
    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Registration token team does not match the payload team", "auth_error");
  }

  const runtimeProfile = await repo.findRuntimeProfileByName(
    input.payload.runtimeType,
    input.payload.runtimeProfileName ?? null,
  );
  const policyProfile = await repo.findWorkerPolicyByName(
    input.auth.tenantId,
    input.payload.runtimeType,
    input.payload.policyProfileName ?? null,
  );

  const existing = await repo.findWorkerByExternalReference(
    input.auth.tenantId,
    input.payload.externalReference,
  );
  const nextValues = {
    tenantId: input.auth.tenantId,
    teamId: input.payload.teamId ?? input.auth.teamId ?? null,
    runtimeType: input.payload.runtimeType,
    workerMode: input.payload.workerMode,
    machineId: input.payload.machineId ?? null,
    machineName: input.payload.machineName ?? null,
    displayName: input.payload.displayName,
    status: "online",
    runtimeVersion: input.payload.compatibility.runtimeVersion,
    runtimeMode: input.payload.runtimeMode,
    runtimeProfileId: runtimeProfile?.id ?? null,
    policyProfileId: policyProfile?.id ?? null,
    externalReference: input.payload.externalReference,
    dashboardUrl: sanitizeDashboardUrl(input.payload.dashboardUrl ?? null),
    capabilitiesJson: sanitizeWorkerPayload(input.payload.capabilitiesJson) as Record<string, unknown>,
    hardwareJson: sanitizeWorkerPayload(input.payload.hardwareJson) as Record<string, unknown>,
    healthSummaryJson: sanitizeWorkerPayload(input.payload.healthSummaryJson) as Record<string, unknown>,
    warningFlagsJson: sanitizeWorkerWarningFlags(input.payload.warningFlagsJson),
    fileScopeMode: input.payload.fileScopeMode,
    lastSeenAt: new Date(),
    registeredByUserId: input.auth.registeredByUserId ?? null,
  };

  const worker = existing
    ? await repo.updateWorker(existing.id, nextValues)
    : await repo.createWorker(nextValues);

  auditLogger.log({
    eventType: "worker_registered",
    userId: input.auth.registeredByUserId ?? null,
    metadata: {
      tenantId: worker.tenantId,
      workerId: worker.id,
      runtimeType: worker.runtimeType,
      teamId: worker.teamId ?? null,
      created: !existing,
      externalReference: worker.externalReference,
    },
  });

  return {
    created: !existing,
    tokens: issueWorkerAccessTokens({
      tenantId: worker.tenantId,
      workerId: worker.id,
      runtimeType: worker.runtimeType,
      teamId: worker.teamId ?? null,
    }),
    worker,
  };
}

export async function recordWorkerHeartbeat(
  input: {
    auth: WorkerAccessAuthContext;
    payload: WorkerHeartbeatPayload;
    workerId: string;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<WorkerRecord> {
  const repo = deps.repo ?? defaultRepo;
  assertSupportedRuntimeType(input.payload.runtimeType);
  assertWorkerProtocolCompatibility(input.payload.compatibility);

  const worker = requireWorkerRecord(
    await repo.getWorkerById(input.auth.tenantId, input.workerId),
    input.workerId,
  );
  ensureWorkerScopedAccess(input.auth, worker, input.workerId);

  const nextStatus =
    worker.status === "disabled" || worker.status === "draining"
      ? worker.status
      : input.payload.status;
  const updatedWorker = await repo.updateWorker(worker.id, {
    status: nextStatus,
    runtimeVersion: input.payload.compatibility.runtimeVersion,
    warningFlagsJson: sanitizeWorkerWarningFlags(input.payload.warningsJson),
    lastSeenAt: new Date(),
  });

  await repo.insertHeartbeat({
    workerId: worker.id,
    runtimeType: worker.runtimeType,
    status: nextStatus,
    metricsJson: sanitizeWorkerPayload(input.payload.metricsJson) as Record<string, unknown>,
    warningsJson: sanitizeWorkerWarningFlags(input.payload.warningsJson),
    currentJobCount: input.payload.currentJobCount,
    queueDepth: input.payload.queueDepth,
    freeDiskBytes: input.payload.freeDiskBytes,
  });

  return updatedWorker;
}

export async function claimWorkerJob(
  input: {
    auth: WorkerAccessAuthContext;
    payload: WorkerClaimRequest;
    workerId: string;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<{ job: (WorkerJobRecord & { leaseOwnerToken: string; leaseExpiresAt: Date }) | null }> {
  const repo = deps.repo ?? defaultRepo;
  const worker = requireWorkerRecord(
    await repo.getWorkerById(input.auth.tenantId, input.workerId),
    input.workerId,
  );
  ensureWorkerScopedAccess(input.auth, worker, input.workerId);
  ensureWorkerCanClaim(worker);

  const candidates = await repo.listClaimableJobs(
    input.auth.tenantId,
    input.auth.runtimeType,
    worker.teamId ?? null,
    input.payload.capabilityHints,
  );

  for (const candidate of candidates) {
    if (!workerJobMatchesSelection(candidate, worker.id, input.payload.capabilityHints)) {
      continue;
    }
    const leaseOwnerToken = crypto.randomBytes(12).toString("hex");
    const leaseExpiresAt = new Date(Date.now() + DEFAULT_LEASE_TTL_MS);
    const claimed = await repo.tryClaimJob(candidate.id, worker.id, leaseOwnerToken, leaseExpiresAt);
    if (claimed) {
      auditLogger.log({
        eventType: "worker_job_claimed",
        userId: claimed.requestedByUserId ?? null,
        metadata: {
          tenantId: claimed.tenantId,
          workerId: worker.id,
          jobId: claimed.id,
          runtimeType: claimed.runtimeType,
          jobType: claimed.jobType,
        },
      });
      return {
        job: {
          ...claimed,
          leaseOwnerToken: claimed.leaseOwnerToken ?? leaseOwnerToken,
          leaseExpiresAt: claimed.leaseExpiresAt ?? leaseExpiresAt,
        },
      };
    }
  }

  return { job: null };
}

export async function recordWorkerJobEvent(
  input: {
    auth: WorkerAccessAuthContext;
    jobId: string;
    payload: WorkerJobEventPayload;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<{ accepted: boolean; job: WorkerJobRecord; replayed: boolean }> {
  const repo = deps.repo ?? defaultRepo;
  const job = requireJobRecord(
    await repo.getJobById(input.auth.tenantId, input.jobId),
    input.jobId,
  );
  ensureJobScopedAccess(input.auth, job);
  ensureLease(job, input.payload.leaseOwnerToken);

  const sequenceNumber = input.payload.sequenceNumber;
  if (!sequenceNumber) {
    throw new WorkerRuntimeServiceError("invalid_request", 400, "Worker job events require a positive sequenceNumber");
  }

  const existingEvents = await repo.listJobEvents(job.id);
  if (existingEvents.some((event) => readEventSequenceNumber(event) === sequenceNumber)) {
    return { accepted: false, job, replayed: true };
  }
  const maxSeenSequence = existingEvents.reduce(
    (maxValue, event) => Math.max(maxValue, readEventSequenceNumber(event) ?? 0),
    0,
  );
  if (sequenceNumber < maxSeenSequence) {
    throw new WorkerRuntimeServiceError("worker_state_invalid", 409, "Worker job event sequence is stale");
  }

  let nextJob = job;
  const nextStatus = resolveEventStatus(input.payload.eventType);
  const sanitizedPayloadJson = sanitizeWorkerPayload(input.payload.payloadJson) as Record<string, unknown>;
  if (nextStatus) {
    assertStatusTransition(job.status, nextStatus);
    nextJob = await repo.updateJob(job.id, {
      status: nextStatus,
      outputJson: {
        ...(job.outputJson ?? {}),
        lastEventType: input.payload.eventType,
        lastEventPayload: sanitizedPayloadJson,
        lastSequenceNumber: sequenceNumber,
      },
      startedAt:
        nextStatus === "running" && !job.startedAt
          ? new Date()
          : job.startedAt,
      finishedAt: TERMINAL_JOB_STATUSES.includes(nextStatus) ? new Date() : job.finishedAt,
      failureReason:
        nextStatus === "failed"
          ? String(sanitizedPayloadJson?.error ?? sanitizedPayloadJson?.message ?? "Worker job failed")
          : job.failureReason,
    });
  }

  await repo.insertJobEvent(job.id, input.payload.eventType, {
    ...sanitizedPayloadJson,
    leaseOwnerToken: input.payload.leaseOwnerToken,
    sequenceNumber,
  });

  if (repo === defaultRepo && nextStatus && isTerminalJobStatus(nextStatus)) {
    const billing = billingEnvelopeFromMetadata(job.instructionsJson?.workerBilling);
    const actualCreditsUsedRaw = sanitizedPayloadJson?.actualCreditsUsed
      ?? sanitizedPayloadJson?.creditsUsed
      ?? sanitizedPayloadJson?.totalCreditsUsed;
    try {
      if (nextStatus === "completed") {
        await publishWorkerArtifacts({
          tenantId: job.tenantId,
          jobId: job.id,
          actorUserId: job.requestedByUserId ?? null,
        });
      }

      if (job.requestedByUserId) {
        const delegatedDownstreamCreditsUsed = await getDelegatedWorkerDownstreamCreditsUsed(
          job.tenantId,
          job.requestedByUserId,
          job.id,
        );
        await reconcileWorkerJobCredits({
          userId: job.requestedByUserId,
          tenantId: job.tenantId,
          jobId: job.id,
          billing,
          finalStatus: nextStatus,
          actualCreditsUsed:
            delegatedDownstreamCreditsUsed > 0
              ? 0
              : typeof actualCreditsUsedRaw === "number"
                ? actualCreditsUsedRaw
                : Number(actualCreditsUsedRaw ?? 0),
          metadata: {
            eventType: input.payload.eventType,
            workerId: job.workerId,
            runtimeType: job.runtimeType,
            delegatedDownstreamCreditsUsed,
          },
        });
      }
    } catch (error) {
      if (nextStatus === "completed") {
        await repo.updateJob(job.id, {
          status: "failed",
          failureReason:
            error instanceof Error
              ? error.message
              : "Worker job post-processing failed",
          finishedAt: new Date(),
        });
      }
      throw error;
    }
  }

  if (nextStatus && TERMINAL_JOB_STATUSES.includes(nextStatus)) {
    const auditEventType = nextStatus === "completed"
      ? "worker_job_completed"
      : nextStatus === "failed"
        ? "worker_job_failed"
        : "worker_job_canceled";
    auditLogger.log({
      eventType: auditEventType,
      userId: job.requestedByUserId ?? null,
      metadata: {
        tenantId: job.tenantId,
        workerId: job.workerId,
        jobId: job.id,
        runtimeType: job.runtimeType,
        jobType: job.jobType,
        eventType: input.payload.eventType,
        finalStatus: nextStatus,
      },
    });
  }

  return { accepted: true, job: nextJob, replayed: false };
}

export async function initWorkerArtifactUpload(
  input: {
    auth: WorkerAccessAuthContext;
    jobId: string;
    payload: WorkerArtifactInitPayload;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<{
  key: string;
  method: "presigned" | "server";
  storageRef: string;
  uploadUrl: string | null;
}> {
  const repo = deps.repo ?? defaultRepo;
  const job = requireJobRecord(
    await repo.getJobById(input.auth.tenantId, input.jobId),
    input.jobId,
  );
  ensureJobScopedAccess(input.auth, job);
  ensureLease(job, input.payload.leaseOwnerToken);

  const storageRef = buildArtifactStorageRef(input.jobId, input.auth, input.payload);
  const presigned = await storagePresignPut(
    storageRef,
    input.payload.contentType,
    input.payload.sizeBytes,
  );

  return {
    key: presigned?.key ?? storageRef,
    method: presigned ? "presigned" : "server",
    storageRef,
    uploadUrl: presigned?.url ?? null,
  };
}

export async function completeWorkerArtifact(
  input: {
    auth: WorkerAccessAuthContext;
    jobId: string;
    payload: WorkerArtifactCompletePayload;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<{ artifact: WorkerArtifactRecord; created: boolean }> {
  const repo = deps.repo ?? defaultRepo;
  const job = requireJobRecord(
    await repo.getJobById(input.auth.tenantId, input.jobId),
    input.jobId,
  );
  ensureJobScopedAccess(input.auth, job);
  ensureLease(job, input.payload.leaseOwnerToken);

  const existing = await repo.findArtifact(job.id, input.payload.storageRef);
  if (existing) {
    const existingChecksum = String(existing.metadataJson?.checksumSha256 ?? "");
    if (existingChecksum && existingChecksum !== input.payload.checksumSha256) {
      throw new WorkerRuntimeServiceError(
        "invalid_request",
        409,
        "Artifact storageRef already exists with a different checksum",
      );
    }
    return { artifact: existing, created: false };
  }

  const artifact = await repo.insertArtifact({
    workerJobId: job.id,
    artifactType: input.payload.artifactType,
    storageRef: input.payload.storageRef,
    metadataJson: {
      ...(sanitizeWorkerPayload(input.payload.metadataJson ?? {}) as Record<string, unknown>),
      checksumSha256: input.payload.checksumSha256,
      contentType: input.payload.contentType ?? null,
      sizeBytes: input.payload.sizeBytes,
    },
    publishedItemId: null,
  });

  if (["claimed", "preparing", "running", "uploading"].includes(job.status)) {
    await repo.updateJob(job.id, {
      status: "publishing",
      outputJson: {
        ...(job.outputJson ?? {}),
        lastArtifactId: artifact.id,
        lastArtifactType: artifact.artifactType,
        lastArtifactStorageRef: artifact.storageRef,
      },
    });
  }

  return { artifact, created: true };
}

export async function recordWorkerDiagnostics(
  input: {
    auth: WorkerAccessAuthContext;
    payload: WorkerDiagnosticsPayload;
    workerId: string;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<{ accepted: true; worker: WorkerRecord }> {
  const repo = deps.repo ?? defaultRepo;
  const worker = requireWorkerRecord(
    await repo.getWorkerById(input.auth.tenantId, input.workerId),
    input.workerId,
  );
  ensureWorkerScopedAccess(input.auth, worker, input.workerId);

  const updatedWorker = await repo.updateWorkerDiagnostics(worker.id, {
    healthSummaryJson: {
      ...(isPlainObject(worker.healthSummaryJson) ? worker.healthSummaryJson : {}),
      summary: sanitizeWorkerPayload(input.payload.summaryJson) as Record<string, unknown>,
      details: sanitizeWorkerPayload(input.payload.detailsJson) as Record<string, unknown>,
      capturedAt: new Date().toISOString(),
      controlPlane: readWorkerControlPlaneState(worker),
    },
    warningFlagsJson: sanitizeWorkerWarningFlags(input.payload.warningFlagsJson),
    lastSeenAt: new Date(),
  });

  auditLogger.log({
    eventType: "worker_diagnostics_received",
    userId: worker.registeredByUserId ?? null,
    metadata: {
      tenantId: worker.tenantId,
      workerId: worker.id,
      runtimeType: worker.runtimeType,
      warningCount: sanitizeWorkerWarningFlags(input.payload.warningFlagsJson).length,
    },
  });

  return { accepted: true, worker: updatedWorker };
}
