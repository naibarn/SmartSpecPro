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
  sql,
} from "drizzle-orm";

import type {
  WorkerArtifactCompletePayload,
  WorkerArtifactInitPayload,
  WorkerClaimRequest,
  WorkerCompatibilityEvaluation,
  WorkerDiagnosticsPayload,
  WorkerHeartbeatPayload,
  WorkerJobEventPayload,
  WorkerJobStatus,
  WorkerProtocolCompatibility,
  WorkerRegistrationPayload,
  WorkerRuntimeType,
} from "../../shared/workerRuntime";
import {
  COMFY_IMAGE_GENERATION_FAILURE_CODES,
  COMFY_IMAGE_GENERATION_PROGRESS_STAGES,
  COMFY_WORKFLOW_RUN_FAILURE_CODES,
  COMFY_WORKFLOW_RUN_PROGRESS_STAGES,
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
  HYPERFRAMES_FINAL_COMPOSITE_FAILURE_CODES,
  HYPERFRAMES_FINAL_COMPOSITE_PROGRESS_STAGES,
  LOCAL_FOLDER_INGEST_FAILURE_CODES,
  LOCAL_FOLDER_INGEST_PROGRESS_STAGES,
  REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
  REMOTION_RENDER_VIDEO_FAILURE_CODES,
  REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
  VIDEO_ASSEMBLY_FAILURE_CODES,
  VIDEO_ASSEMBLY_PROGRESS_STAGES,
  WORKER_RUNTIME_PROTOCOL_VERSION,
  evaluateWorkerCompatibility,
  getWorkerRuntimeDefinition,
  workerHermesRuntimeMetadataSchema,
} from "../../shared/workerRuntime";
import {
  getWorkerAccessPermissionScopesForPreset,
  type WorkerAccessPermissionPreset,
  type WorkerAccessPermissionScope,
} from "../../shared/workerAccessKeys";
import {
  openClawBrowserJobPayloadSchema,
  openClawWorkflowJobPayloadSchema,
} from "../../shared/workerOpenClawPayloads";
import type {
  WorkerAccessAuthContext,
  WorkerRegistrationAuthContext,
} from "./workerAuthService";
import { issueWorkerAccessTokens } from "./workerAuthService";
import { getDb } from "../db";
import {
  groupMembers,
  hermesProviderConnections,
  runtimeProfiles,
  userGroups,
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

const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;

/**
 * implementation-progress.md gap #2 closure — defense-in-depth claim-time
 * capability assertion (spec §6.3 step 7). The PRIMARY anti-mis-claim
 * mechanism is `workerJobMatchesSelection`'s `.every()` capability-family
 * superset check (`workerSchedulerService.ts`) — but that check is a no-op
 * (`return true`) whenever the claiming worker sends an EMPTY
 * `capabilityHints` array (see its own doc comment), which is exactly what
 * many existing tests/older worker builds do. This second, independent
 * check closes that specific bypass for `remotion_render_video` jobs: no
 * worker may claim one without explicitly advertising `"remotion-render"`,
 * regardless of what `capabilityHints` contains overall.
 */
const REMOTION_RENDER_VIDEO_REQUIRED_CLAIM_CAPABILITY: (typeof REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES)[number] =
  "remotion-render";

/**
 * Feature 135 section-05 — same defense-in-depth precedent as the remotion
 * constant above, applied to every `hermes_media_*` / `hermes_connection_*`
 * job type (constants, never a regex over arbitrary job type strings).
 */
const HERMES_FABRIC_JOB_TYPES: ReadonlySet<string> = new Set([
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
]);

function isHermesFabricJobType(jobType: string): boolean {
  return HERMES_FABRIC_JOB_TYPES.has(jobType);
}
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
type WorkerClaimResult = {
  job: (WorkerJobRecord & { leaseOwnerToken: string; leaseExpiresAt: Date }) | null;
  queueDepth: number;
};

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
  /**
   * Feature 135 section-05 — narrow lookup backing the hermes claim-time
   * connection-affinity assertion (mirrors the remotion defense-in-depth
   * precedent above): resolves a hermes job's pinned `connectionId` to its
   * currently assigned worker id, so a worker can never cross-claim another
   * worker's connection's jobs. Optional: only hermes-fabric job types with
   * a `connectionId` in `capabilityRequirementsJson` ever call this.
   *
   * Code review FIX 6: `tenantId` is threaded through for defense-in-depth
   * consistency with every other tenant-scoped lookup in this repository —
   * the claim call site already has `worker.tenantId` in scope.
   */
  getHermesConnectionAssignedWorkerId?: (params: {
    tenantId: string;
    connectionId: string;
  }) => Promise<string | null>;
  renewActiveJobLeasesForWorker?: (input: { tenantId: string; workerId: string; leaseExpiresAt: Date; heartbeatAt: Date }) => Promise<number>;
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

function assertSupportedRuntimeType(runtimeType: WorkerRuntimeType) {
  return getWorkerRuntimeDefinition(runtimeType);
}

export function assertWorkerProtocolCompatibility(
  runtimeType: WorkerRuntimeType,
  compatibility: WorkerProtocolCompatibility,
): WorkerCompatibilityEvaluation {
  const current = WORKER_RUNTIME_PROTOCOL_VERSION;
  const evaluation = evaluateWorkerCompatibility(runtimeType, compatibility);
  if (!evaluation.transport.compatible) {
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
  if (!evaluation.runtimeFamily.compatible) {
    throw new WorkerRuntimeServiceError(
      "protocol_incompatible",
      409,
      evaluation.runtimeFamily.reason
        ?? `Worker runtime-family schema ${compatibility.runtimeFamilySchemaVersion} is incompatible with ${runtimeType}`,
    );
  }
  if (!evaluation.runtimeProfile.compatible) {
    throw new WorkerRuntimeServiceError(
      "protocol_incompatible",
      409,
      evaluation.runtimeProfile.reason
        ?? `Worker runtime-profile schema ${compatibility.runtimeProfileSchemaVersion} is incompatible with ${runtimeType}`,
    );
  }
  return evaluation;
}

function mergeRuntimeMetadata(
  capabilitiesJson: unknown,
  runtimeMetadataJson: Record<string, unknown>,
): Record<string, unknown> {
  const sanitizedCapabilities = sanitizeWorkerPayload(
    isPlainObject(capabilitiesJson) ? capabilitiesJson : {},
  ) as Record<string, unknown>;
  const sanitizedRuntimeMetadata = sanitizeWorkerPayload(runtimeMetadataJson) as Record<string, unknown>;
  const capabilitiesWithHeartbeatPolicy = mergeWorkerAppHeartbeatPolicy(
    sanitizedCapabilities,
    sanitizedRuntimeMetadata,
  );
  if (Object.keys(sanitizedRuntimeMetadata).length === 0) {
    return capabilitiesWithHeartbeatPolicy;
  }
  return {
    ...capabilitiesWithHeartbeatPolicy,
    runtimeMetadata: sanitizedRuntimeMetadata,
  };
}

function mergeWorkerAppHeartbeatPolicy(
  capabilitiesJson: Record<string, unknown>,
  runtimeMetadataJson: Record<string, unknown>,
): Record<string, unknown> {
  const rawClaimEnabled = runtimeMetadataJson.claimEnabled;
  const rawAcceptJobs = runtimeMetadataJson.acceptJobs;
  const nextAcceptJobs = typeof rawClaimEnabled === "boolean"
    ? rawClaimEnabled
    : typeof rawAcceptJobs === "boolean"
      ? rawAcceptJobs
      : undefined;
  const rawSharingMode = runtimeMetadataJson.sharingMode;
  const nextSharingMode = typeof rawSharingMode === "string" && rawSharingMode.trim().length > 0
    ? rawSharingMode
    : undefined;

  if (typeof nextAcceptJobs !== "boolean" && !nextSharingMode) {
    return capabilitiesJson;
  }

  const workerApp = isPlainObject(capabilitiesJson.workerApp)
    ? capabilitiesJson.workerApp
    : {};
  return {
    ...capabilitiesJson,
    workerApp: {
      ...workerApp,
      ...(typeof nextAcceptJobs === "boolean" ? { acceptJobs: nextAcceptJobs } : {}),
      ...(nextSharingMode ? { sharingMode: nextSharingMode } : {}),
    },
  };
}

function normalizeQuotaValue(value: number | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function buildWorkerAccessPolicyMetadata(
  auth: WorkerRegistrationAuthContext,
): Record<string, unknown> {
  const permissionPreset = auth.permissionPreset ?? "readonly";
  const permissionScopes = Array.isArray(auth.permissionScopes)
    ? auth.permissionScopes.filter((scope): scope is WorkerAccessPermissionScope => typeof scope === "string")
    : [];
  return {
    permissionPreset,
    permissionScopes: permissionScopes.length > 0
      ? permissionScopes
      : auth.permissionPreset === "custom"
        ? permissionScopes
        : getWorkerAccessPermissionScopesForPreset(permissionPreset as WorkerAccessPermissionPreset),
    quotaHourly: normalizeQuotaValue(auth.quotaHourly),
    quotaDaily: normalizeQuotaValue(auth.quotaDaily),
    quotaWeekly: normalizeQuotaValue(auth.quotaWeekly),
    quotaMonthly: normalizeQuotaValue(auth.quotaMonthly),
  };
}

function buildWorkerControlPlaneState(
  runtimeType: WorkerRuntimeType,
  compatibility: WorkerProtocolCompatibility,
  existingControlPlane: Record<string, unknown> = {},
  runtimeMetadataJson: Record<string, unknown> = {},
): Record<string, unknown> {
  const runtimeDefinition = getWorkerRuntimeDefinition(runtimeType);
  const controlPlane: Record<string, unknown> = {
    ...existingControlPlane,
    compatibility: evaluateWorkerCompatibility(runtimeType, compatibility),
    runtimeFamily: runtimeDefinition.familyName,
    featureFlag: runtimeDefinition.featureFlag,
    lastCompatibilityCheckAt: new Date().toISOString(),
  };

  if (runtimeType === "hermes_agent_gateway") {
    const existingRemoteEndpointPolicy = typeof controlPlane.remoteEndpointPolicy === "string"
      ? controlPlane.remoteEndpointPolicy
      : null;
    if (Object.keys(runtimeMetadataJson).length > 0) {
      const parsedRuntimeMetadata = workerHermesRuntimeMetadataSchema.safeParse(runtimeMetadataJson);
      controlPlane.remoteEndpointPolicy = parsedRuntimeMetadata.success
        && parsedRuntimeMetadata.data.remoteEndpointPolicyExceptionId
        ? "audited_exception_granted"
        : "loopback_only";
    } else {
      controlPlane.remoteEndpointPolicy = existingRemoteEndpointPolicy ?? "loopback_only";
    }
  }

  return controlPlane;
}

function buildWorkerHealthSummary(
  existingHealthSummaryJson: unknown,
  runtimeType: WorkerRuntimeType,
  compatibility: WorkerProtocolCompatibility,
  runtimeMetadataJson: Record<string, unknown> = {},
): Record<string, unknown> {
  const existingHealthSummary = sanitizeWorkerPayload(
    isPlainObject(existingHealthSummaryJson) ? existingHealthSummaryJson : {},
  ) as Record<string, unknown>;
  return {
    ...existingHealthSummary,
    controlPlane: buildWorkerControlPlaneState(
      runtimeType,
      compatibility,
      readWorkerControlPlaneState({ healthSummaryJson: existingHealthSummary }),
      runtimeMetadataJson,
    ),
  };
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
  const workerApp = readWorkerAppCapabilities(worker);
  if (typeof workerApp.acceptJobs === "boolean" && !workerApp.acceptJobs) {
    throw new WorkerRuntimeServiceError(
      "worker_state_invalid",
      409,
      `Worker ${worker.id} is configured to pause queue pickup`,
    );
  }
}

function readWorkerAppCapabilities(worker: WorkerRecord): Record<string, unknown> {
  const capabilities = isPlainObject(worker?.capabilitiesJson) ? worker.capabilitiesJson : {};
  const workerApp = isPlainObject(capabilities.workerApp) ? capabilities.workerApp : {};
  return workerApp;
}

function readWorkerSharingMode(worker: WorkerRecord): "private" | "group" | "tenant" {
  const workerApp = readWorkerAppCapabilities(worker);
  const runtimeMetadata = isPlainObject(worker?.capabilitiesJson)
    && isPlainObject(worker.capabilitiesJson.runtimeMetadata)
    ? worker.capabilitiesJson.runtimeMetadata
    : {};
  const sharingPolicy = isPlainObject(runtimeMetadata.workerSharingPolicy)
    ? runtimeMetadata.workerSharingPolicy
    : {};
  const rawMode = [
    sharingPolicy.mode,
    workerApp.ownerSharingMode,
    workerApp.sharingMode,
  ].find((value) => typeof value === "string" && value.trim().length > 0);
  if (!rawMode) {
    return worker.workerMode === "per_user" ? "private" : "tenant";
  }
  switch (String(rawMode ?? "").trim().toLowerCase()) {
    case "group":
    case "groups":
    case "group_pool":
      return "group";
    case "tenant":
    case "tenant_pool":
      return "tenant";
    default:
      return "private";
  }
}

function readWorkerSharedGroupIds(worker: WorkerRecord): number[] {
  const workerApp = readWorkerAppCapabilities(worker);
  const runtimeMetadata = isPlainObject(worker?.capabilitiesJson)
    && isPlainObject(worker.capabilitiesJson.runtimeMetadata)
    ? worker.capabilitiesJson.runtimeMetadata
    : {};
  const sharingPolicy = isPlainObject(runtimeMetadata.workerSharingPolicy)
    ? runtimeMetadata.workerSharingPolicy
    : {};
  const rawGroupIds = Array.isArray(sharingPolicy.groupIds)
    ? sharingPolicy.groupIds
    : Array.isArray(workerApp.sharedGroupIds)
      ? workerApp.sharedGroupIds
      : [];
  return rawGroupIds
    .map((value) => Number(value))
    .filter((value, index, list) => Number.isInteger(value) && value > 0 && list.indexOf(value) === index);
}

async function filterClaimableJobsForWorker(
  worker: WorkerRecord,
  candidates: WorkerJobRecord[],
): Promise<WorkerJobRecord[]> {
  const sharingMode = readWorkerSharingMode(worker);
  if (sharingMode === "tenant") {
    return candidates;
  }

  const ownerUserId = typeof worker.registeredByUserId === "number" ? worker.registeredByUserId : null;
  if (sharingMode === "private") {
    return ownerUserId == null
      ? []
      : candidates.filter((candidate) => candidate.requestedByUserId === ownerUserId);
  }

  const sharedGroupIds = readWorkerSharedGroupIds(worker);
  if (sharedGroupIds.length === 0) {
    return ownerUserId == null
      ? []
      : candidates.filter((candidate) => candidate.requestedByUserId === ownerUserId);
  }

  const requesterIds = Array.from(new Set(
    candidates
      .map((candidate) => candidate.requestedByUserId)
      .filter((value): value is number => Number.isInteger(value) && value > 0),
  ));

  if (requesterIds.length === 0) {
    return ownerUserId == null
      ? []
      : candidates.filter((candidate) => candidate.requestedByUserId === ownerUserId);
  }

  const db = await getDb();
  const memberships = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .innerJoin(userGroups, eq(userGroups.id, groupMembers.groupId))
    .where(and(
      inArray(groupMembers.groupId, sharedGroupIds),
      inArray(groupMembers.userId, requesterIds),
      eq(groupMembers.status, "active"),
      eq(userGroups.tenantId, worker.tenantId),
      isNull(userGroups.deletedAt),
    ));
  const allowedRequesterIds = new Set(memberships.map((membership) => membership.userId));
  if (ownerUserId != null) {
    allowedRequesterIds.add(ownerUserId);
  }
  return candidates.filter((candidate) =>
    typeof candidate.requestedByUserId === "number"
    && allowedRequesterIds.has(candidate.requestedByUserId));
}

function ensureLease(job: WorkerJobRecord, leaseOwnerToken: string): void {
  if (!leaseOwnerToken || !job.leaseOwnerToken || job.leaseOwnerToken !== leaseOwnerToken) {
    throw new WorkerRuntimeServiceError("stale_worker_lease", 409, "Worker lease token is stale or invalid");
  }
  if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) {
    throw new WorkerRuntimeServiceError("stale_worker_lease", 409, "Worker lease has expired");
  }
}

function buildAssignmentAttempt(jobId: string, workerId: string, leaseOwnerToken: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${jobId}:${workerId}:${leaseOwnerToken}`)
    .digest("hex")
    .slice(0, 16);
  return `attempt_${hash}`;
}

function readAssignmentAttempt(job: WorkerJobRecord): string | null {
  const output = isPlainObject(job.outputJson) ? job.outputJson : {};
  const assignmentAttempt = output.assignmentAttempt;
  return typeof assignmentAttempt === "string" && assignmentAttempt.trim()
    ? assignmentAttempt.trim()
    : null;
}

function ensureAssignmentAttempt(job: WorkerJobRecord, assignmentAttempt: string | null | undefined): void {
  if (job.jobType !== "hyperframes_final_composite") {
    return;
  }
  const activeAttempt = readAssignmentAttempt(job);
  if (!activeAttempt || !assignmentAttempt || assignmentAttempt !== activeAttempt) {
    throw new WorkerRuntimeServiceError(
      "stale_assignment_attempt",
      409,
      "Worker assignment attempt is stale or invalid",
    );
  }
}

function resolveEventStatus(eventType: string): WorkerJobStatus | null {
  return JOB_EVENT_STATUS_MAP[eventType] ?? null;
}

function assertRuntimeSpecificJobEventContract(
  job: WorkerJobRecord,
  payload: WorkerJobEventPayload,
): void {
  const openClawSchema = job.jobType === "browser_automation_task"
    ? openClawBrowserJobPayloadSchema
    : job.jobType === "plugin_workflow_task"
      ? openClawWorkflowJobPayloadSchema
      : null;

  if (openClawSchema) {
    const result = openClawSchema.safeParse(payload.payloadJson ?? {});
    if (!result.success) {
      throw new WorkerRuntimeServiceError(
        "invalid_request",
        400,
        result.error.issues.map((issue) => issue.message).join("; ") || `${job.jobType} payload is invalid`,
      );
    }
  }

  const progressStages = job.jobType === "video_assembly"
    ? VIDEO_ASSEMBLY_PROGRESS_STAGES
    : job.jobType === "local_folder_ingest"
      ? LOCAL_FOLDER_INGEST_PROGRESS_STAGES
      : job.jobType === "comfy_image_generation"
        ? COMFY_IMAGE_GENERATION_PROGRESS_STAGES
        : job.jobType === "comfy_workflow_run"
        ? COMFY_WORKFLOW_RUN_PROGRESS_STAGES
        : job.jobType === "hyperframes_final_composite"
          ? HYPERFRAMES_FINAL_COMPOSITE_PROGRESS_STAGES
          : job.jobType === "remotion_render_video"
            ? REMOTION_RENDER_VIDEO_PROGRESS_STAGES
            : null;
  const failureCodes = job.jobType === "video_assembly"
    ? VIDEO_ASSEMBLY_FAILURE_CODES
    : job.jobType === "local_folder_ingest"
      ? LOCAL_FOLDER_INGEST_FAILURE_CODES
      : job.jobType === "comfy_image_generation"
        ? COMFY_IMAGE_GENERATION_FAILURE_CODES
        : job.jobType === "comfy_workflow_run"
        ? COMFY_WORKFLOW_RUN_FAILURE_CODES
        : job.jobType === "hyperframes_final_composite"
          ? HYPERFRAMES_FINAL_COMPOSITE_FAILURE_CODES
          : job.jobType === "remotion_render_video"
            ? REMOTION_RENDER_VIDEO_FAILURE_CODES
            : null;

  if (!progressStages || !failureCodes) {
    return;
  }

  if (payload.eventType === "job.progress") {
    const stage = typeof payload.payloadJson?.stage === "string"
      ? payload.payloadJson.stage
      : "";
    if (!progressStages.includes(stage as any)) {
      throw new WorkerRuntimeServiceError(
        "invalid_request",
        400,
        `${job.jobType} progress stage ${stage || "(missing)"} is invalid`,
      );
    }
  }

  if (payload.eventType === "job.failed") {
    const failureCode = typeof payload.payloadJson?.failureCode === "string"
      ? payload.payloadJson.failureCode
      : "";
    if (!failureCodes.includes(failureCode as any)) {
      throw new WorkerRuntimeServiceError(
        "invalid_request",
        400,
        `${job.jobType} failure code ${failureCode || "(missing)"} is invalid`,
      );
    }
  }
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
  async getHermesConnectionAssignedWorkerId({ tenantId, connectionId }) {
    const db = await getDb();
    const [row] = await db
      .select({ assignedWorkerId: hermesProviderConnections.assignedWorkerId })
      .from(hermesProviderConnections)
      .where(and(eq(hermesProviderConnections.id, connectionId), eq(hermesProviderConnections.tenantId, tenantId)))
      .limit(1);
    return row?.assignedWorkerId ?? null;
  },
  async renewActiveJobLeasesForWorker(input) {
    const db = await getDb();
    const leaseIso = input.leaseExpiresAt.toISOString();
    const patch = {
      assignmentLeaseExpiresAt: leaseIso,
      lastWorkerHeartbeatAt: input.heartbeatAt.toISOString(),
    };
    const rows = await db
      .update(workerJobs)
      .set({
        leaseExpiresAt: input.leaseExpiresAt,
        outputJson: sql`coalesce(${workerJobs.outputJson}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
      })
      .where(and(
        eq(workerJobs.tenantId, input.tenantId),
        eq(workerJobs.workerId, input.workerId),
        inArray(workerJobs.status, RECLAIMABLE_JOB_STATUSES),
        isNotNull(workerJobs.leaseOwnerToken),
      ))
      .returning({ id: workerJobs.id });
    return rows.length;
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
  tokens: { executionToken: string; uploadToken: string; refreshToken: string };
  worker: WorkerRecord;
}> {
  const repo = deps.repo ?? defaultRepo;
  assertSupportedRuntimeType(input.payload.runtimeType);
  assertWorkerProtocolCompatibility(input.payload.runtimeType, input.payload.compatibility);

  const incomingRuntimeMetadata = isPlainObject(input.payload.runtimeMetadataJson)
    ? (input.payload.runtimeMetadataJson as Record<string, unknown>)
    : {};
  const authHasProviderPin = input.auth.runtimeType === "hermes_agent_gateway"
    && (input.auth.llmRoutingMode === "pinned_provider" || input.auth.preferredProviderId != null);
  const workerAccessPolicy = buildWorkerAccessPolicyMetadata(input.auth);
  const effectiveRuntimeMetadata = authHasProviderPin
    ? {
        ...incomingRuntimeMetadata,
        llmRoutingMode: input.auth.llmRoutingMode,
        preferredProviderId: input.auth.preferredProviderId ?? null,
        preferredProviderName: input.auth.preferredProviderName ?? null,
      }
    : incomingRuntimeMetadata;
  const effectiveRuntimeMetadataWithAccessPolicy = {
    ...effectiveRuntimeMetadata,
    workerAccessPolicy,
  };
  const delegatedSpendCaps = {
    hourlyCredits: normalizeQuotaValue(input.auth.quotaHourly),
    fiveHourCredits: null,
    dailyCredits: normalizeQuotaValue(input.auth.quotaDaily),
    weeklyCredits: normalizeQuotaValue(input.auth.quotaWeekly),
    monthlyCredits: normalizeQuotaValue(input.auth.quotaMonthly),
  };
  const hasDelegatedSpendCaps = Object.values(delegatedSpendCaps).some((value) => value != null);

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
    capabilitiesJson: mergeRuntimeMetadata(
      {
        ...(isPlainObject(input.payload.capabilitiesJson) ? input.payload.capabilitiesJson : {}),
        ...(hasDelegatedSpendCaps ? { delegatedSpendCaps } : {}),
      },
      effectiveRuntimeMetadataWithAccessPolicy,
    ),
    hardwareJson: sanitizeWorkerPayload(input.payload.hardwareJson) as Record<string, unknown>,
    healthSummaryJson: buildWorkerHealthSummary(
      input.payload.healthSummaryJson,
      input.payload.runtimeType,
      input.payload.compatibility,
      effectiveRuntimeMetadata,
    ),
    warningFlagsJson: sanitizeWorkerWarningFlags(input.payload.warningFlagsJson),
    fileScopeMode: input.payload.fileScopeMode,
    lastSeenAt: new Date(),
    registeredByUserId: input.auth.registeredByUserId ?? null,
  };

  const worker = existing
    ? await repo.updateWorker(existing.id, nextValues)
    : await repo.createWorker(nextValues);

  const hermesRuntimeMetadata = worker.runtimeType === "hermes_agent_gateway"
    ? workerHermesRuntimeMetadataSchema.safeParse(
      ((nextValues.capabilitiesJson as Record<string, unknown> | null | undefined)?.runtimeMetadata as Record<string, unknown> | undefined) ?? {},
    )
    : null;

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
      llmRoutingMode: hermesRuntimeMetadata?.success ? hermesRuntimeMetadata.data.llmRoutingMode : undefined,
      preferredProviderId: hermesRuntimeMetadata?.success ? hermesRuntimeMetadata.data.preferredProviderId ?? null : null,
      preferredProviderName: hermesRuntimeMetadata?.success ? hermesRuntimeMetadata.data.preferredProviderName ?? null : null,
      permissionPreset: input.auth.permissionPreset,
      permissionScopes: input.auth.permissionScopes,
      quotaHourly: input.auth.quotaHourly ?? null,
      quotaDaily: input.auth.quotaDaily ?? null,
      quotaWeekly: input.auth.quotaWeekly ?? null,
      quotaMonthly: input.auth.quotaMonthly ?? null,
      remoteEndpointPolicy: hermesRuntimeMetadata?.success && hermesRuntimeMetadata.data.remoteEndpointPolicyExceptionId
        ? "audited_exception_granted"
        : worker.runtimeType === "hermes_agent_gateway"
          ? "loopback_only"
          : undefined,
      remoteEndpointPolicyExceptionId: hermesRuntimeMetadata?.success
        ? hermesRuntimeMetadata.data.remoteEndpointPolicyExceptionId ?? null
        : null,
    },
  });

  return {
    created: !existing,
    tokens: issueWorkerAccessTokens({
      tenantId: worker.tenantId,
      workerId: worker.id,
      runtimeType: worker.runtimeType,
      teamId: worker.teamId ?? null,
      deviceBinding: input.payload.deviceBinding ?? undefined,
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
  assertWorkerProtocolCompatibility(input.payload.runtimeType, input.payload.compatibility);

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
    capabilitiesJson: mergeRuntimeMetadata(
      worker.capabilitiesJson,
      input.payload.runtimeMetadataJson ?? {},
    ),
    healthSummaryJson: buildWorkerHealthSummary(
      worker.healthSummaryJson,
      worker.runtimeType,
      input.payload.compatibility,
      input.payload.runtimeMetadataJson ?? {},
    ),
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

  if (input.payload.currentJobCount > 0 && typeof repo.renewActiveJobLeasesForWorker === "function") {
    await repo.renewActiveJobLeasesForWorker({
      tenantId: worker.tenantId,
      workerId: worker.id,
      heartbeatAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + DEFAULT_LEASE_TTL_MS),
    });
  }

  return updatedWorker;
}

export async function claimWorkerJob(
  input: {
    auth: WorkerAccessAuthContext;
    payload: WorkerClaimRequest;
    workerId: string;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<WorkerClaimResult> {
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
  const eligibleCandidates = await filterClaimableJobsForWorker(worker, candidates);
  const selectableCandidates = eligibleCandidates.filter((candidate) =>
    workerJobMatchesSelection(candidate, worker.id, input.payload.capabilityHints),
  );

  // Feature 135 section-05 — memoizes `connectionId -> assignedWorkerId`
  // lookups across this single claim call so a candidate pool with several
  // hermes jobs pinned to the same connection only resolves it once.
  const hermesConnectionAssignedWorkerIdCache = new Map<string, string | null>();

  for (const candidate of selectableCandidates) {
    // Defense-in-depth claim-time assertion (implementation-progress.md
    // gap #2, spec §6.3 step 7) — see the constant's doc comment above.
    //
    // F133-05 (LOW, pre-merge security gate) fix: `continue` to the next
    // candidate instead of `throw`ing out of the whole loop. A worker that
    // sends empty `capabilityHints` and happens to have an UNRELATED
    // `remotion_render_video` job anywhere in its candidate pool used to
    // fail claiming EVERY job in that attempt (including legitimate,
    // unrelated ones) — an availability bug, not a security bypass (the
    // primary anti-mis-claim property this check enforces is unaffected:
    // the disqualified job is still never claimed by this worker).
    if (
      candidate.jobType === "remotion_render_video"
      && !input.payload.capabilityHints.includes(REMOTION_RENDER_VIDEO_REQUIRED_CLAIM_CAPABILITY)
    ) {
      continue;
    }

    // Feature 135 section-05 — same `continue`-not-`throw` discipline as the
    // remotion fix above (an unrelated candidate later in the same pool
    // must still be claimable in this pass).
    if (isHermesFabricJobType(candidate.jobType)) {
      // Assertion 1 (capability): a worker that doesn't advertise
      // `hermes_media` may never claim a hermes job, regardless of what
      // `capabilityRequirementsJson.capabilityFamilies` says (mirrors the
      // remotion primary-check gap: that check is a no-op on an empty
      // `capabilityFamilies` array).
      if (!input.payload.capabilityHints.includes(HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY)) {
        continue;
      }

      // Assertion 2 (connection affinity): a hermes job pinned to a
      // connection may only be claimed by that connection's currently
      // assigned worker — this is layered ON TOP OF (never a replacement
      // for) the pinned `workerId` / `filterClaimableJobsForWorker` owner
      // check, closing the gap where `capabilityRequirementsJson.
      // preferredWorkerId` is intentionally null for server-scoped
      // connections (see `hermesMediaScheduler.ts`).
      const requirements = (candidate.capabilityRequirementsJson ?? {}) as Record<string, unknown>;
      const connectionId = typeof requirements.connectionId === "string" ? requirements.connectionId : null;
      if (connectionId) {
        let assignedWorkerId: string | null;
        if (hermesConnectionAssignedWorkerIdCache.has(connectionId)) {
          assignedWorkerId = hermesConnectionAssignedWorkerIdCache.get(connectionId) ?? null;
        } else {
          assignedWorkerId = repo.getHermesConnectionAssignedWorkerId
            ? await repo.getHermesConnectionAssignedWorkerId({ tenantId: worker.tenantId, connectionId })
            : null;
          hermesConnectionAssignedWorkerIdCache.set(connectionId, assignedWorkerId);
        }
        if (assignedWorkerId !== worker.id) {
          continue;
        }
      }
    }

    const leaseOwnerToken = crypto.randomBytes(12).toString("hex");
    const leaseExpiresAt = new Date(Date.now() + DEFAULT_LEASE_TTL_MS);
    const claimed = await repo.tryClaimJob(candidate.id, worker.id, leaseOwnerToken, leaseExpiresAt);
    if (claimed) {
      const assignmentAttempt = buildAssignmentAttempt(claimed.id, worker.id, claimed.leaseOwnerToken ?? leaseOwnerToken);
      const outputJson = {
        ...(isPlainObject(claimed.outputJson) ? claimed.outputJson : {}),
        assignmentAttempt,
        assignmentWorkerId: worker.id,
        assignmentLeaseExpiresAt: (claimed.leaseExpiresAt ?? leaseExpiresAt).toISOString?.()
          ?? new Date(claimed.leaseExpiresAt ?? leaseExpiresAt).toISOString(),
        assignedAt: new Date().toISOString(),
        lastWorkerEventAt: null,
        lastProgressAt: null,
        assignmentStatus: "active",
      };
      let claimedWithAttempt: WorkerJobRecord & { assignmentAttempt: string } = {
        ...claimed,
        outputJson,
        assignmentAttempt,
      };
      if (typeof repo.updateJob === "function") {
        claimedWithAttempt = {
          ...await repo.updateJob(claimed.id, { outputJson }),
          assignmentAttempt,
        };
      }
      auditLogger.log({
        eventType: "worker_job_claimed",
        userId: claimedWithAttempt.requestedByUserId ?? null,
        metadata: {
          tenantId: claimedWithAttempt.tenantId,
          workerId: worker.id,
          jobId: claimedWithAttempt.id,
          runtimeType: claimedWithAttempt.runtimeType,
          jobType: claimedWithAttempt.jobType,
          assignmentAttempt,
        },
      });
      return {
        queueDepth: Math.max(0, selectableCandidates.length - 1),
        job: {
          ...claimedWithAttempt,
          leaseOwnerToken: claimedWithAttempt.leaseOwnerToken ?? leaseOwnerToken,
          leaseExpiresAt: claimedWithAttempt.leaseExpiresAt ?? leaseExpiresAt,
          assignmentAttempt,
        },
      };
    }
  }

  return { job: null, queueDepth: selectableCandidates.length };
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
  ensureAssignmentAttempt(job, input.payload.assignmentAttempt);
  assertRuntimeSpecificJobEventContract(job, input.payload);

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
  const eventAt = new Date();
  const terminalStatus = nextStatus ? TERMINAL_JOB_STATUSES.includes(nextStatus) : false;
  const nextLeaseExpiresAt = terminalStatus
    ? job.leaseExpiresAt
    : new Date(Date.now() + DEFAULT_LEASE_TTL_MS);
  const outputJson = {
    ...(isPlainObject(job.outputJson) ? job.outputJson : {}),
    lastEventType: input.payload.eventType,
    lastEventPayload: sanitizedPayloadJson,
    lastWorkerEventAt: eventAt.toISOString(),
    lastSequenceNumber: sequenceNumber,
    lastAssignmentAttempt: input.payload.assignmentAttempt ?? readAssignmentAttempt(job),
    assignmentLeaseExpiresAt: nextLeaseExpiresAt instanceof Date
      ? nextLeaseExpiresAt.toISOString()
      : job.outputJson?.assignmentLeaseExpiresAt,
    ...(input.payload.eventType === "job.progress"
      ? { lastProgressAt: eventAt.toISOString() }
      : {}),
  };
  if (nextStatus) {
    assertStatusTransition(job.status, nextStatus);
    nextJob = await repo.updateJob(job.id, {
      status: nextStatus,
      outputJson,
      leaseExpiresAt: nextLeaseExpiresAt,
      startedAt:
        nextStatus === "running" && !job.startedAt
          ? eventAt
          : job.startedAt,
      finishedAt: terminalStatus ? eventAt : job.finishedAt,
      failureReason:
        nextStatus === "failed"
          ? String(sanitizedPayloadJson?.error ?? sanitizedPayloadJson?.message ?? "Worker job failed")
          : job.failureReason,
    });
  } else {
    nextJob = await repo.updateJob(job.id, {
      outputJson,
      leaseExpiresAt: nextLeaseExpiresAt,
    });
  }

  await repo.insertJobEvent(job.id, input.payload.eventType, {
    ...sanitizedPayloadJson,
    leaseOwnerToken: input.payload.leaseOwnerToken,
    assignmentAttempt: input.payload.assignmentAttempt ?? null,
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
  ensureAssignmentAttempt(job, input.payload.assignmentAttempt);

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
  ensureAssignmentAttempt(job, input.payload.assignmentAttempt);

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
      assignmentAttempt: input.payload.assignmentAttempt ?? readAssignmentAttempt(job),
    },
    publishedItemId: null,
  });

  if (["claimed", "preparing", "running", "uploading"].includes(job.status)) {
    await repo.updateJob(job.id, {
      status: "publishing",
      outputJson: {
        ...(isPlainObject(job.outputJson) ? job.outputJson : {}),
        lastArtifactId: artifact.id,
        lastArtifactType: artifact.artifactType,
        lastArtifactStorageRef: artifact.storageRef,
        lastAssignmentAttempt: input.payload.assignmentAttempt ?? readAssignmentAttempt(job),
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
