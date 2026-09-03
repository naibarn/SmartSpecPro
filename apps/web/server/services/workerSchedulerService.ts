import { and, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { getDb } from "../db";
import { workerJobs, workers } from "../../drizzle/schema";
import type {
  ComfyImageGenerationJobContract,
  ComfyWorkflowRunJobContract,
  HyperframesFinalCompositeWorkerInput,
  HermesTaskCorrelation,
  LocalFolderIngestJobContract,
  RemotionRenderVideoWorkerInput,
  VerticalDramaFfmpegAssemblyJobContract,
  WorkerResourceProfile,
  WorkerRuntimeType,
  VideoAssemblyJobContract,
} from "../../shared/workerRuntime";
import {
  COMFY_IMAGE_GENERATION_PROGRESS_STAGES,
  COMFY_WORKFLOW_RUN_PROGRESS_STAGES,
  HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES,
  HYPERFRAMES_FINAL_COMPOSITE_PROGRESS_STAGES,
  REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
  REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY,
  REMOTION_RENDER_VIDEO_MAX_ATTEMPTS,
  REMOTION_RENDER_VIDEO_RETRY_BACKOFF_MS,
  REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
  VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES,
  VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE,
  comfyImageGenerationJobContractSchema,
  comfyWorkflowRunJobContractSchema,
  getWorkerRuntimeDefinition,
  hyperframesFinalCompositeWorkerInputSchema,
  isWorkerPathWithinAllowedRoots,
  isWorkerLoopbackUrl,
  localFolderIngestJobContractSchema,
  looksLikeWorkerLocalFilePath,
  LOCAL_FOLDER_INGEST_PROGRESS_STAGES,
  remotionRenderVideoWorkerInputSchema,
  verticalDramaFfmpegAssemblyJobContractSchema,
  videoAssemblyJobContractSchema,
  workerHermesRuntimeMetadataSchema,
  hermesTaskCorrelationSchema,
  remotionExecutorCapabilityProfileSchema,
  remotionExecutorReadinessSchema,
  remotionExecutionTargetResolutionSchema,
  type RemotionExecutionTarget,
  type RemotionExecutionTargetResolution,
} from "../../shared/workerRuntime";
import { evaluateHermesRolloutReadiness } from "../../shared/featureFlags";
import { comfyMcpDispatchInputSchema } from "../../shared/comfyControlContracts";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import {
  reserveWorkerJobCredits,
  type WorkerJobBillingEnvelope,
} from "./workerBillingService";
import { refundReservation } from "./creditService";
import { isPlainObject } from "./workerPayloadSanitizer";
import { getCacheClient } from "./redisClients";

const OPENCLAW_RUNTIME_TYPE: WorkerRuntimeType = "openclaw_gateway";
const DESKTOP_RUNTIME_TYPE: WorkerRuntimeType = "desktop_zeroclaw_managed";
const NEMOCLAW_RUNTIME_TYPE: WorkerRuntimeType = "nemoclaw_sandbox";
const HICLAW_RUNTIME_TYPE: WorkerRuntimeType = "hiclaw_cluster";
const HERMES_RUNTIME_TYPE: WorkerRuntimeType = "hermes_agent_gateway";
const REMOTION_EXECUTOR_RUNTIME_TYPE: WorkerRuntimeType = "remotion_executor";

export const REMOTION_EXECUTOR_SUPPORTED_CAPABILITY_FAMILIES = [
  "remotion-render",
  "chromium-render",
  "ffmpeg-probe",
] as const;

export const OPENCLAW_SUPPORTED_JOB_TYPES = [
  "external_agent_task",
  "browser_automation_task",
  "plugin_workflow_task",
] as const;

export const OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES = [
  "persistent-agent-session",
  "plugin-automation",
  "browser-automation",
  "tool-using-research",
  "channel-assistant-handoff",
  "artifact-producing-session",
] as const;

export const HERMES_SUPPORTED_JOB_TYPES = ["external_agent_task"] as const;

export const HERMES_SUPPORTED_CAPABILITY_FAMILIES = [
  "artifact-producing-session",
  "channel-assistant-handoff",
] as const;

export const NEMOCLAW_SUPPORTED_CAPABILITY_FAMILIES = [
  "secure-sandbox-exec",
  "egress-controlled-browser",
  "restricted-filesystem-task",
  "sandboxed-agent-pool",
] as const;

export const HICLAW_SUPPORTED_CAPABILITY_FAMILIES = [
  "multi-agent-cluster",
  "manager-worker-orchestration",
  "human-in-the-loop-collaboration",
  "matrix-visible-team",
] as const;

type SupportedOpenClawJobType = (typeof OPENCLAW_SUPPORTED_JOB_TYPES)[number];
type SupportedOpenClawCapabilityFamily =
  (typeof OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES)[number];
type SupportedHermesJobType = (typeof HERMES_SUPPORTED_JOB_TYPES)[number];
type SupportedHermesCapabilityFamily =
  (typeof HERMES_SUPPORTED_CAPABILITY_FAMILIES)[number];
type SupportedNemoClawCapabilityFamily =
  (typeof NEMOCLAW_SUPPORTED_CAPABILITY_FAMILIES)[number];
type SupportedHiClawCapabilityFamily =
  (typeof HICLAW_SUPPORTED_CAPABILITY_FAMILIES)[number];

type WorkerJobRecord = Record<string, any>;
type WorkerRecord = Record<string, any>;

export interface QueueOpenClawWorkerJobInput {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  jobType: SupportedOpenClawJobType;
  title?: string | null;
  description?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  resourceProfile?: WorkerResourceProfile;
  capabilityFamilies: SupportedOpenClawCapabilityFamily[];
  inputJson?: Record<string, unknown>;
  instructionsJson?: Record<string, unknown>;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export interface WorkerSchedulerFeatureFlags {
  openClawExternalRuntime: boolean;
  desktopZeroClawWorker: boolean;
  hyperframesWorkerFinalComposite?: boolean;
  nemoClawSecureWorkerPool: boolean;
  hiClawClusterRuntime: boolean;
  hermesAgentRuntime: boolean;
  remotionDedicatedExecutorEnabled?: boolean;
}

export interface WorkerSchedulerRepository {
  findJobByIdempotencyKey: (
    tenantId: string,
    idempotencyKey: string
  ) => Promise<WorkerJobRecord | null>;
  findWorkerById: (
    tenantId: string,
    workerId: string
  ) => Promise<WorkerRecord | null>;
  insertJob: (values: Record<string, unknown>) => Promise<WorkerJobRecord>;
  /**
   * Feature 133 section-04 — narrow lookup backing `queueRemotionRenderVideoJob`'s
   * 1-concurrent-preview cap (spec §18.2). Optional: `defaultRepo` implements
   * it; other `WorkerSchedulerRepository` implementers (existing tests) are
   * unaffected since `queueRemotionRenderVideoJob` is the only caller.
   */
  findActiveRemotionPreviewJobForUser?: (
    tenantId: string,
    userId: number
  ) => Promise<WorkerJobRecord | null>;
}

export class WorkerSchedulerError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "WorkerSchedulerError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Feature 133 section-04 (spec §18.5): ≤6 remotion_render_video submissions
// Production enforcement is an atomic Redis counter so multiple web instances
// cannot each grant a full local window. Tests/local single-node development
// retain a bounded fallback only when production is not enabled.
const remotionRenderSubmissionLocal = new Map<
  string,
  { windowStart: number; count: number }
>();
async function consumeRemotionRenderSubmission(
  tenantId: string,
  userId: number | null,
  admin: boolean
): Promise<void> {
  const limit = admin ? 30 : 6;
  const subject = `${tenantId}:${userId ?? "anonymous"}`;
  if (
    process.env.NODE_ENV !== "production" &&
    !process.env.REDIS_URL &&
    !process.env.REDIS_CLOUD_URL &&
    !process.env.REDIS_UPSTASH_URL
  ) {
    const now = Date.now();
    const current = remotionRenderSubmissionLocal.get(subject);
    if (!current || now - current.windowStart >= 60_000) {
      remotionRenderSubmissionLocal.set(subject, {
        windowStart: now,
        count: 1,
      });
      return;
    }
    if (current.count >= limit)
      throw new WorkerSchedulerError(
        "rate_limited",
        429,
        `Too many remotion_render_video submissions; the limit is ${limit} per minute`
      );
    current.count += 1;
    return;
  }
  const key = `ssp:f145:remotion-submit:${createHash("sha256").update(subject).digest("hex")}`;
  try {
    const count = Number(
      await getCacheClient().eval(
        "local value = redis.call('INCR', KEYS[1]); if value == 1 then redis.call('EXPIRE', KEYS[1], 60); end; return value",
        1,
        key
      )
    );
    if (count > limit)
      throw new WorkerSchedulerError(
        "rate_limited",
        429,
        `Too many remotion_render_video submissions; the limit is ${limit} per minute`
      );
  } catch (error) {
    if (error instanceof WorkerSchedulerError) throw error;
    throw new WorkerSchedulerError(
      "rate_limit_unavailable",
      503,
      "Remotion submission rate-limit enforcement is temporarily unavailable"
    );
  }
}

export function isOpenClawDispatchEnabled(): boolean {
  const raw = process.env.OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED;
  return raw !== "false";
}

export function isDesktopWorkerDispatchEnabled(): boolean {
  const raw = process.env.DESKTOP_ZEROCLAW_WORKER_DISPATCH_ENABLED;
  return raw !== "false";
}

export function isRemotionExecutorDispatchEnabled(): boolean {
  return process.env.REMOTION_EXECUTOR_DISPATCH_ENABLED !== "false";
}

const REMOTION_EXECUTOR_HEARTBEAT_MAX_AGE_MS = 90_000;

function pickExecutorCapabilityProfile(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    [
      "capabilityFamilies",
      "claimCapability",
      "containers",
      "codecs",
      "maxWidth",
      "maxHeight",
      "maxDurationInFrames",
      "maxConcurrency",
      "supportsChromiumRendering",
      "supportsFfmpegProbe",
      "supportsFfmpegPostPass",
      "supportsFontMaterialization",
    ]
      .filter(key => key in record)
      .map(key => [key, record[key]])
  );
}

function pickExecutorReadiness(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    ["status", "observedAt", "checks", "blockingReasons"]
      .filter(key => key in record)
      .map(key => [key, record[key]])
  );
}

function isRemotionExecutorReady(
  worker: WorkerRecord | null,
  nowMs = Date.now()
): boolean {
  if (
    !worker ||
    worker.runtimeType !== REMOTION_EXECUTOR_RUNTIME_TYPE ||
    worker.status !== "online"
  )
    return false;
  const lastSeenAt =
    worker.lastSeenAt instanceof Date
      ? worker.lastSeenAt.getTime()
      : typeof worker.lastSeenAt === "string" ||
          typeof worker.lastSeenAt === "number"
        ? new Date(worker.lastSeenAt).getTime()
        : NaN;
  if (
    !Number.isFinite(lastSeenAt) ||
    nowMs - lastSeenAt > REMOTION_EXECUTOR_HEARTBEAT_MAX_AGE_MS
  )
    return false;
  const readiness = remotionExecutorReadinessSchema.safeParse(
    pickExecutorReadiness(worker.healthSummaryJson)
  );
  if (!readiness.success || readiness.data.status !== "ready") return false;
  const capabilities = remotionExecutorCapabilityProfileSchema.safeParse(
    pickExecutorCapabilityProfile(worker.capabilitiesJson)
  );
  if (!capabilities.success || capabilities.data.maxConcurrency < 1)
    return false;
  const health = worker.healthSummaryJson as
    | Record<string, unknown>
    | null
    | undefined;
  const currentJobCount =
    health && typeof health.currentJobCount === "number"
      ? health.currentJobCount
      : null;
  if (
    currentJobCount === null ||
    currentJobCount >= capabilities.data.maxConcurrency
  )
    return false;
  return true;
}

export function resolveRemotionExecutionTarget(input: {
  requestedTarget: RemotionExecutionTarget;
  preferredWorkerId?: string | null;
  tenantExecutorEnabled: boolean;
  operatorExecutorEnabled: boolean;
  preferredWorker?: WorkerRecord | null;
  nowMs?: number;
}): RemotionExecutionTargetResolution {
  const preferredWorkerId = input.preferredWorkerId?.trim() || null;
  if (input.requestedTarget === "desktop_worker") {
    return remotionExecutionTargetResolutionSchema.parse({
      requestedTarget: input.requestedTarget,
      resolvedTarget: "desktop_worker",
      reason: "explicit_desktop_worker",
      preferredWorkerId,
      selectedWorkerId: null,
      resolvedAt: new Date().toISOString(),
    });
  }
  if (input.requestedTarget === "remotion_executor") {
    if (
      !input.tenantExecutorEnabled ||
      !input.operatorExecutorEnabled ||
      !isRemotionExecutorReady(input.preferredWorker ?? null, input.nowMs)
    ) {
      throw new WorkerSchedulerError(
        "executor_unavailable",
        409,
        "The selected Remotion executor is not enabled, ready, online, fresh, or idle"
      );
    }
    return remotionExecutionTargetResolutionSchema.parse({
      requestedTarget: input.requestedTarget,
      resolvedTarget: "remotion_executor",
      reason: "explicit_remotion_executor",
      preferredWorkerId,
      selectedWorkerId: preferredWorkerId,
      resolvedAt: new Date().toISOString(),
    });
  }
  if (!input.operatorExecutorEnabled) {
    return remotionExecutionTargetResolutionSchema.parse({
      requestedTarget: input.requestedTarget,
      resolvedTarget: "desktop_worker",
      reason: "auto_operator_kill_switch",
      preferredWorkerId,
      selectedWorkerId: null,
      resolvedAt: new Date().toISOString(),
    });
  }
  if (!input.tenantExecutorEnabled) {
    return remotionExecutionTargetResolutionSchema.parse({
      requestedTarget: input.requestedTarget,
      resolvedTarget: "desktop_worker",
      reason: "auto_tenant_flag_disabled",
      preferredWorkerId,
      selectedWorkerId: null,
      resolvedAt: new Date().toISOString(),
    });
  }
  if (isRemotionExecutorReady(input.preferredWorker ?? null, input.nowMs)) {
    return remotionExecutionTargetResolutionSchema.parse({
      requestedTarget: input.requestedTarget,
      resolvedTarget: "remotion_executor",
      reason: "auto_dedicated_ready",
      preferredWorkerId,
      selectedWorkerId: preferredWorkerId,
      resolvedAt: new Date().toISOString(),
    });
  }
  return remotionExecutionTargetResolutionSchema.parse({
    requestedTarget: input.requestedTarget,
    resolvedTarget: "desktop_worker",
    reason: "auto_no_eligible_executor",
    preferredWorkerId,
    selectedWorkerId: null,
    resolvedAt: new Date().toISOString(),
  });
}

const defaultRepo: WorkerSchedulerRepository = {
  async findJobByIdempotencyKey(tenantId, idempotencyKey) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, tenantId),
          eq(workerJobs.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    return job ?? null;
  },
  async findWorkerById(tenantId, workerId) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
      .limit(1);
    return worker ?? null;
  },
  async insertJob(values) {
    const db = await getDb();
    const [job] = await db
      .insert(workerJobs)
      .values(values as any)
      .returning();
    return job;
  },
  async findActiveRemotionPreviewJobForUser(tenantId, userId) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, tenantId),
          eq(workerJobs.requestedByUserId, userId),
          eq(workerJobs.jobType, "remotion_render_video"),
          inArray(workerJobs.status, ["queued", "running"]),
          sql`${workerJobs.capabilityRequirementsJson}->>'renderProfile' = 'preview'`
        )
      )
      .limit(1);
    return job ?? null;
  },
};

function assertOpenClawEligible(input: QueueOpenClawWorkerJobInput): void {
  if (!OPENCLAW_SUPPORTED_JOB_TYPES.includes(input.jobType)) {
    throw new WorkerSchedulerError(
      "unsupported_job_type",
      400,
      `Job type ${input.jobType} is not supported by OpenClaw routing`
    );
  }

  if (
    input.resourceProfile === "gpu_required" ||
    input.resourceProfile === "sandbox_required"
  ) {
    throw new WorkerSchedulerError(
      "unsupported_resource_profile",
      400,
      `Resource profile ${input.resourceProfile} is not supported by OpenClaw routing`
    );
  }

  const requiresLocalWindowsAccess = Boolean(input.inputJson?.localWindowsPath);
  if (requiresLocalWindowsAccess) {
    throw new WorkerSchedulerError(
      "unsupported_job_scope",
      400,
      "Jobs that depend on local Windows file paths must not route to OpenClaw"
    );
  }

  const unsupportedFamily = input.capabilityFamilies.find(
    family => !OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES.includes(family)
  );
  if (unsupportedFamily) {
    throw new WorkerSchedulerError(
      "unsupported_capability_family",
      400,
      `Capability family ${unsupportedFamily} is not supported by OpenClaw routing`
    );
  }
}

function buildWorkerBillingMetadata(
  billing: WorkerJobBillingEnvelope | null
): Record<string, unknown> | null {
  if (!billing) {
    return null;
  }

  return {
    reservationId: billing.reservationId,
    reservedCredits: billing.reservedCredits,
    sourceType: billing.sourceType,
  };
}

export function workerJobMatchesSelection(
  job: WorkerJobRecord,
  workerId: string,
  capabilityHints: string[]
): boolean {
  const requirements = (job?.capabilityRequirementsJson ?? {}) as Record<
    string,
    unknown
  >;
  if (job.jobType === "llm_invoke") {
    const requiredFamilies = Array.isArray(requirements.capabilityFamilies)
      ? requirements.capabilityFamilies.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const modelRef = typeof requirements.modelRef === "string" ? requirements.modelRef : "";
    const inventoryRevision = requirements.inventoryRevision;
    // LLM jobs are never claimable on an empty hint set or an incomplete
    // server binding. This is stricter than the legacy generic matcher.
    if (!modelRef || !/^wllm_[A-Za-z0-9_-]{8,128}$/.test(modelRef) ||
      !Number.isInteger(inventoryRevision) || requiredFamilies.length === 0) {
      return false;
    }
    if (!capabilityHints.includes("llm_gateway") || !capabilityHints.includes("llm_invoke")) {
      return false;
    }
    return requiredFamilies.every((family) => capabilityHints.includes(family));
  }
  const preferredWorkerId =
    typeof requirements.preferredWorkerId === "string"
      ? requirements.preferredWorkerId
      : "";
  if (preferredWorkerId && preferredWorkerId !== workerId) {
    return false;
  }

  // Some runtime families use a compact, doctor-gated claim token while
  // retaining descriptive capability families for admission/observability.
  // When that explicit token is present it is the authoritative claim gate;
  // requiring the descriptive family strings as additional claim hints would
  // make conforming Hermes workers impossible to select.
  const requiredClaimCapability =
    typeof requirements.requiredClaimCapability === "string"
      ? requirements.requiredClaimCapability.trim()
      : "";
  // Existing queued jobs may predate `requiredClaimCapability`. Remotion
  // payloads are still versioned, so protect those rows too: an older worker
  // must not claim a job that its sidecar will reject, and a current worker
  // must not claim a payload from the retired contract either.
  if (job.jobType === "remotion_render_video") {
    const payloadContractVersion =
      isPlainObject(job.inputJson) &&
      typeof job.inputJson.platformContractVersion === "string"
        ? job.inputJson.platformContractVersion
        : "";
    if (
      payloadContractVersion !== REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION
    ) {
      return false;
    }
    return capabilityHints.includes(
      requiredClaimCapability || REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY
    );
  }

  if (requiredClaimCapability) {
    return capabilityHints.includes(requiredClaimCapability);
  }

  const requiredFamilies = Array.isArray(requirements.capabilityFamilies)
    ? requirements.capabilityFamilies.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    : [];
  if (requiredFamilies.length === 0) {
    return true;
  }
  if (capabilityHints.length === 0) {
    return false;
  }

  // Feature 133 section-04 fix (anti-mis-claim safety mechanism, spec §6.3):
  // this MUST require the claiming worker's hints to be a superset of every
  // declared required family, not just overlap on any single one. Two
  // distinct job types can legitimately share one generic capability label
  // (e.g. both "hyperframes_final_composite" and "remotion_render_video"
  // declare "ffmpeg-probe") without a worker that only advertises that one
  // shared label being qualified to run either job end-to-end. An `.some()`
  // (any-overlap) check let a hyperframes-only worker's hint set match a
  // `remotion_render_video` job purely because both lists contain
  // "ffmpeg-probe" — confirmed by
  // `server/services/__tests__/queueRemotionRenderVideoJob.test.ts`'s
  // negative-match test before this fix. `.every()` (full-superset) closes
  // that gap; every existing single-family capabilityFamilies test in this
  // file is unaffected (single-element lists behave identically under
  // `.some()` and `.every()`).
  return requiredFamilies.every(family => capabilityHints.includes(family));
}

export async function queueOpenClawWorkerJob(
  input: QueueOpenClawWorkerJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  assertOpenClawEligible(input);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isOpenClawDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "OpenClaw external runtime dispatch is disabled by operator kill switch"
    );
  }

  const tenantFlags = await getFeatureFlags(input.tenantId);
  if (!tenantFlags.openClawExternalRuntime) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      "OpenClaw external runtime dispatch is disabled for this tenant"
    );
  }

  if (input.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(
      input.tenantId,
      input.idempotencyKey
    );
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (input.preferredWorkerId) {
    const worker = await repo.findWorkerById(
      input.tenantId,
      input.preferredWorkerId
    );
    if (!worker) {
      throw new WorkerSchedulerError(
        "worker_not_found",
        404,
        `Preferred worker ${input.preferredWorkerId} was not found`
      );
    }
    if (worker.runtimeType !== OPENCLAW_RUNTIME_TYPE) {
      throw new WorkerSchedulerError(
        "worker_scope_mismatch",
        409,
        "Preferred worker is not registered as an OpenClaw gateway worker"
      );
    }
    if (worker.status === "disabled") {
      throw new WorkerSchedulerError(
        "worker_state_invalid",
        409,
        `Preferred worker ${worker.id} is disabled`
      );
    }
  }

  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const billing = input.requestedByUserId
    ? await reserveCredits({
        userId: input.requestedByUserId,
        tenantId: input.tenantId,
        requestedCredits: input.reservedCredits,
        metadata: {
          teamId: input.teamId ?? null,
          workflowRunId: input.workflowRunId ?? null,
          jobType: input.jobType,
          capabilityFamilies: input.capabilityFamilies,
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: input.tenantId,
      teamId: input.teamId ?? null,
      workerId: null,
      runtimeType: OPENCLAW_RUNTIME_TYPE,
      workflowRunId: input.workflowRunId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      requestedByPersonaId: input.requestedByPersonaId ?? null,
      requestedBySystemComponent:
        input.requestedBySystemComponent ?? "worker_scheduler",
      jobType: input.jobType,
      status: "queued",
      statusReason: input.description ?? null,
      priority: input.priority ?? 0,
      resourceProfile: input.resourceProfile ?? "cpu_light",
      capabilityRequirementsJson: {
        capabilityFamilies: input.capabilityFamilies,
        preferredWorkerId: input.preferredWorkerId ?? null,
      },
      inputJson: {
        ...(input.inputJson ?? {}),
        title: input.title ?? null,
        description: input.description ?? null,
      },
      instructionsJson: {
        intent:
          input.instructionsJson?.intent ??
          input.capabilityFamilies[0] ??
          "artifact-producing-session",
        ...(input.instructionsJson ?? {}),
        workerBilling: buildWorkerBillingMetadata(billing),
      },
      timeoutSeconds: input.timeoutSeconds ?? 3600,
      retryPolicyJson: {
        maxAttempts: 3,
        backoffSeconds: 30,
      },
      idempotencyKey: input.idempotencyKey ?? null,
    });

    return {
      created: true,
      job,
    };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}

export interface QueueDesktopVideoAssemblyJobInput extends VideoAssemblyJobContract {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export interface QueueDesktopLocalFolderIngestJobInput extends LocalFolderIngestJobContract {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export interface QueueDesktopComfyImageGenerationJobInput extends ComfyImageGenerationJobContract {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export interface QueueDesktopComfyWorkflowRunJobInput extends ComfyWorkflowRunJobContract {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export type DesktopComfyMcpJobType = "comfy_image_generation" | "comfy_video_generation" | "comfy_workflow_run";

export interface QueueDesktopComfyMcpJobInput {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  jobType: DesktopComfyMcpJobType;
  title?: string | null;
  description?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  inputJson: Record<string, unknown>;
  instructionsJson?: Record<string, unknown>;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export interface QueueDesktopHyperframesFinalCompositeJobInput extends HyperframesFinalCompositeWorkerInput {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export interface QueueNemoClawWorkerJobInput {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  jobType: string;
  title?: string | null;
  description?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  resourceProfile?: WorkerResourceProfile;
  capabilityFamilies?: SupportedNemoClawCapabilityFamily[];
  inputJson?: Record<string, unknown>;
  instructionsJson?: Record<string, unknown>;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export interface QueueHermesWorkerJobInput {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  jobType: SupportedHermesJobType;
  title?: string | null;
  description?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  resourceProfile?: WorkerResourceProfile;
  capabilityFamilies?: SupportedHermesCapabilityFamily[];
  inputJson?: Record<string, unknown>;
  instructionsJson?: Record<string, unknown>;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
  /** Bounded parent/child lineage metadata; stored in existing instructionsJson. */
  correlation?: HermesTaskCorrelation;
}

export interface QueueHiClawWorkerJobInput {
  tenantId: string;
  teamId?: string | null;
  workflowRunId?: string | null;
  requestedByUserId?: number | null;
  requestedByPersonaId?: string | null;
  requestedBySystemComponent?: string | null;
  jobType: string;
  title?: string | null;
  description?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  resourceProfile?: WorkerResourceProfile;
  capabilityFamilies?: SupportedHiClawCapabilityFamily[];
  inputJson?: Record<string, unknown>;
  instructionsJson?: Record<string, unknown>;
  idempotencyKey?: string | null;
  preferredWorkerId?: string | null;
  reservedCredits?: number | null;
}

export type QueueWorkerJobByRuntimeInput =
  | ({
      runtimeType: "openclaw_gateway";
    } & QueueOpenClawWorkerJobInput)
  | ({
      runtimeType: "desktop_zeroclaw_managed";
      jobType: "video_assembly";
    } & QueueDesktopVideoAssemblyJobInput)
  | ({
      runtimeType: "desktop_zeroclaw_managed";
      jobType: "local_folder_ingest";
    } & QueueDesktopLocalFolderIngestJobInput)
  | ({
      runtimeType: "desktop_zeroclaw_managed";
      jobType: "comfy_image_generation";
    } & QueueDesktopComfyImageGenerationJobInput)
  | ({
      runtimeType: "desktop_zeroclaw_managed";
      jobType: "comfy_workflow_run";
    } & QueueDesktopComfyWorkflowRunJobInput)
  | ({
      runtimeType: "desktop_zeroclaw_managed";
      jobType: "comfy_video_generation";
    } & QueueDesktopComfyMcpJobInput)
  | ({
      runtimeType: "desktop_zeroclaw_managed";
      jobType: "hyperframes_final_composite";
    } & QueueDesktopHyperframesFinalCompositeJobInput)
  | ({
      runtimeType: "nemoclaw_sandbox";
    } & QueueNemoClawWorkerJobInput)
  | ({
      runtimeType: "hermes_agent_gateway";
    } & QueueHermesWorkerJobInput)
  | ({
      runtimeType: "hiclaw_cluster";
    } & QueueHiClawWorkerJobInput);

function assertVideoAssemblyInputAuthorization(
  input: VideoAssemblyJobContract
): void {
  const allowedRoots = input.workspacePolicy.allowedSourceRoots;
  for (const inputRef of input.inputRefs) {
    if (inputRef.sourceKind !== "authorized_local_path" || !inputRef.path) {
      continue;
    }
    if (!isWorkerPathWithinAllowedRoots(inputRef.path, allowedRoots)) {
      throw new WorkerSchedulerError(
        "unauthorized_path",
        403,
        `Path ${inputRef.path} is outside the approved workspace roots`
      );
    }
  }

  for (const clip of input.editPlan.clips) {
    if (!looksLikeWorkerLocalFilePath(clip.sourceRef)) {
      continue;
    }
    if (!isWorkerPathWithinAllowedRoots(clip.sourceRef, allowedRoots)) {
      throw new WorkerSchedulerError(
        "unauthorized_path",
        403,
        `Clip source ${clip.sourceRef} is outside the approved workspace roots`
      );
    }
  }

  for (const supplementalRef of [
    input.subtitlePlan.transcriptRef,
    input.subtitlePlan.subtitleRef,
  ]) {
    if (!supplementalRef || !looksLikeWorkerLocalFilePath(supplementalRef)) {
      continue;
    }
    if (!isWorkerPathWithinAllowedRoots(supplementalRef, allowedRoots)) {
      throw new WorkerSchedulerError(
        "unauthorized_path",
        403,
        `Subtitle source ${supplementalRef} is outside the approved workspace roots`
      );
    }
  }
}

function buildDesktopVideoCapabilityFamilies(
  input: VideoAssemblyJobContract
): string[] {
  const families = new Set<string>(["video-edit", "file-access"]);
  if (
    input.subtitlePlan.mode === "burn_in" ||
    input.subtitlePlan.mode === "soft_mux"
  ) {
    families.add("subtitle-burn");
  }
  if (input.renderProfile.gpuRequired) {
    families.add("gpu-nvidia");
  }
  return Array.from(families);
}

function assertLocalFolderIngestInputAuthorization(
  input: LocalFolderIngestJobContract
): void {
  const allowedRoots = input.workspacePolicy.allowedSourceRoots;
  for (const root of input.roots) {
    if (!isWorkerPathWithinAllowedRoots(root.path, allowedRoots)) {
      throw new WorkerSchedulerError(
        "unauthorized_path",
        403,
        `Path ${root.path} is outside the approved workspace roots`
      );
    }
  }
}

function assertPotentialLocalFolderIngestInputAuthorization(
  rawInput: unknown
): void {
  if (!rawInput || typeof rawInput !== "object") {
    return;
  }

  const workspacePolicy = Reflect.get(rawInput, "workspacePolicy");
  const allowedRoots =
    workspacePolicy && typeof workspacePolicy === "object"
      ? Reflect.get(workspacePolicy, "allowedSourceRoots")
      : null;
  if (!Array.isArray(allowedRoots)) {
    return;
  }

  const normalizedAllowedRoots = allowedRoots.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
  if (normalizedAllowedRoots.length === 0) {
    return;
  }

  const roots = Reflect.get(rawInput, "roots");
  if (!Array.isArray(roots)) {
    return;
  }

  for (const root of roots) {
    if (!root || typeof root !== "object") {
      continue;
    }
    const path = Reflect.get(root, "path");
    if (typeof path !== "string" || path.trim().length === 0) {
      continue;
    }
    if (!isWorkerPathWithinAllowedRoots(path, normalizedAllowedRoots)) {
      throw new WorkerSchedulerError(
        "unauthorized_path",
        403,
        `Path ${path} is outside the approved workspace roots`
      );
    }
  }
}

function buildDesktopLocalFolderIngestCapabilityFamilies(): string[] {
  return ["file-access", "doc-indexing"];
}

function assertLoopbackComfyService(baseUrl: string): void {
  if (!isWorkerLoopbackUrl(baseUrl)) {
    throw new WorkerSchedulerError(
      "unsupported_job_scope",
      400,
      "ComfyUI desktop jobs require a local-only loopback service endpoint"
    );
  }
}

function buildDesktopComfyImageGenerationCapabilityFamilies(
  input: ComfyImageGenerationJobContract
): string[] {
  const families = new Set<string>(["comfyui-image-generate"]);
  if (input.generationSpec.gpuRequired) {
    families.add("gpu-nvidia");
  }
  return Array.from(families);
}

function buildDesktopComfyWorkflowRunCapabilityFamilies(
  input: ComfyWorkflowRunJobContract
): string[] {
  const families = new Set<string>(["comfyui-workflow-run"]);
  if (input.executionPolicy.expectedOutputTypes.includes("images")) {
    families.add("comfyui-image-generate");
  }
  if (input.executionPolicy.gpuRequired) {
    families.add("gpu-nvidia");
  }
  return Array.from(families);
}

function buildDesktopHyperframesFinalCompositeCapabilityFamilies(): string[] {
  return [...HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES];
}

function normalizeWorkerWorkflowRunId(
  value: string | null | undefined
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 36) {
    return trimmed;
  }
  let hash = 2166136261;
  for (let index = 0; index < trimmed.length; index += 1) {
    hash ^= trimmed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `hfw_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assertPreferredWorkerCompatible(
  worker: WorkerRecord | null,
  preferredWorkerId: string,
  runtimeType: WorkerRuntimeType,
  runtimeLabel: string
): void {
  if (!worker) {
    throw new WorkerSchedulerError(
      "worker_not_found",
      404,
      `Preferred worker ${preferredWorkerId} was not found`
    );
  }
  if (worker.runtimeType !== runtimeType) {
    throw new WorkerSchedulerError(
      "worker_scope_mismatch",
      409,
      `Preferred worker is not registered as ${runtimeLabel}`
    );
  }
  if (worker.status === "disabled" || worker.status === "draining") {
    throw new WorkerSchedulerError(
      "worker_state_invalid",
      409,
      `Preferred worker ${worker.id} is not accepting new work`
    );
  }
}

function isAbsoluteWindowsOrUncPath(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\[^\\]+\\[^\\]+/.test(trimmed);
}

function findNestedExternalLocalWindowsPath(
  value: unknown,
  trail: string[] = []
): string | null {
  if (typeof value === "string") {
    return isAbsoluteWindowsOrUncPath(value)
      ? trail.join(".") || "<root>"
      : null;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const match = findNestedExternalLocalWindowsPath(item, [
        ...trail,
        String(index),
      ]);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const match = findNestedExternalLocalWindowsPath(nestedValue, [
      ...trail,
      key,
    ]);
    if (match) {
      return match;
    }
  }

  return null;
}

function assertNoExternalLocalWindowsPath(
  inputJson: Record<string, unknown> | undefined,
  runtimeLabel: string
): void {
  if (!inputJson) {
    return;
  }
  const match = findNestedExternalLocalWindowsPath(inputJson);
  if (match) {
    throw new WorkerSchedulerError(
      "unsupported_job_scope",
      400,
      `${runtimeLabel} jobs must not depend on local Windows file paths (${match})`
    );
  }
}

export async function queueDesktopVideoAssemblyJob(
  rawInput: QueueDesktopVideoAssemblyJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const input = videoAssemblyJobContractSchema.parse(rawInput);
  assertVideoAssemblyInputAuthorization(input);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isDesktopWorkerDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Desktop ZeroClaw worker dispatch is disabled by operator kill switch"
    );
  }

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.desktopZeroClawWorker) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(DESKTOP_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(
      rawInput.tenantId,
      rawInput.idempotencyKey
    );
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(
      rawInput.tenantId,
      rawInput.preferredWorkerId
    );
    if (!worker) {
      throw new WorkerSchedulerError(
        "worker_not_found",
        404,
        `Preferred worker ${rawInput.preferredWorkerId} was not found`
      );
    }
    if (worker.runtimeType !== DESKTOP_RUNTIME_TYPE) {
      throw new WorkerSchedulerError(
        "worker_scope_mismatch",
        409,
        "Preferred worker is not registered as a Desktop + ZeroClaw worker"
      );
    }
    if (worker.status === "disabled" || worker.status === "draining") {
      throw new WorkerSchedulerError(
        "worker_state_invalid",
        409,
        `Preferred worker ${worker.id} is not accepting new work`
      );
    }
  }

  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const billing = rawInput.requestedByUserId
    ? await reserveCredits({
        userId: rawInput.requestedByUserId,
        tenantId: rawInput.tenantId,
        requestedCredits: rawInput.reservedCredits,
        metadata: {
          teamId: rawInput.teamId ?? null,
          workflowRunId: rawInput.workflowRunId ?? null,
          jobType: "video_assembly",
          capabilityFamilies: buildDesktopVideoCapabilityFamilies(input),
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: rawInput.tenantId,
      teamId: rawInput.teamId ?? null,
      workerId: null,
      runtimeType: DESKTOP_RUNTIME_TYPE,
      workflowRunId: rawInput.workflowRunId ?? null,
      requestedByUserId: rawInput.requestedByUserId ?? null,
      requestedByPersonaId: rawInput.requestedByPersonaId ?? null,
      requestedBySystemComponent:
        rawInput.requestedBySystemComponent ?? "worker_scheduler",
      jobType: "video_assembly",
      status: "queued",
      statusReason: "desktop_video_assembly",
      priority: rawInput.priority ?? 25,
      resourceProfile: rawInput.renderProfile.gpuRequired
        ? "gpu_required"
        : "cpu_heavy",
      capabilityRequirementsJson: {
        capabilityFamilies: buildDesktopVideoCapabilityFamilies(input),
        preferredWorkerId: rawInput.preferredWorkerId ?? null,
      },
      inputJson: input,
      instructionsJson: {
        intent: "video_assembly",
        workerBilling: buildWorkerBillingMetadata(billing),
        requiredProgressStages: [
          "resolve_inputs",
          "stage_workspace",
          "probe_media",
          "build_edit_plan",
          "render_outputs",
          "verify_outputs",
          "upload_artifacts",
          "publish_artifacts",
          "trigger_indexing",
        ],
      },
      timeoutSeconds: rawInput.timeoutSeconds ?? 7200,
      retryPolicyJson: {
        maxAttempts: 2,
        backoffSeconds: 60,
      },
      idempotencyKey: rawInput.idempotencyKey ?? null,
    });

    return {
      created: true,
      job,
    };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}

/**
 * Queue-only additive fields layered on top of the frozen envelope
 * `VerticalDramaFfmpegAssemblyJobContract` (`shared/workerRuntime.ts`) — same
 * pattern as `QueueRemotionRenderVideoJobInput` extending
 * `RemotionRenderVideoWorkerInput`.
 */
export interface QueueVerticalDramaFfmpegAssemblyJobInput extends VerticalDramaFfmpegAssemblyJobContract {
  tenantId: string;
  requestedByUserId?: number | null;
  priority?: number;
  idempotencyKey?: string | null;
}

const VERTICAL_DRAMA_FFMPEG_ASSEMBLY_TIMEOUT_SECONDS = 1800;

/**
 * Vertical Drama Render Queue plan (`planning/vertical-drama-render-queue/plan.md`
 * §4.1/§4.2) Wave 1: server-computed idempotency key so re-submitting the
 * same render (same kind/owner/render-feed) dedupes instead of double-queuing.
 * Reuses the same sha256-hash approach as
 * `buildRemotionRenderVideoIdempotencyKey` above.
 */
function buildVerticalDramaFfmpegAssemblyIdempotencyKey(
  input: VerticalDramaFfmpegAssemblyJobContract
): string {
  const ownerKey = input.owner.episodeId ?? input.owner.seriesId;
  const groupSuffix = input.display?.groupIndex ?? "";
  const renderFeedHash = createHash("sha256")
    .update(JSON.stringify(input.renderFeed))
    .digest("hex")
    .slice(0, 32);
  return `${VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE}:${input.kind}:${ownerKey}:${groupSuffix}:${renderFeedHash}`;
}

/**
 * Enqueue function for the `vertical_drama_ffmpeg_assembly` worker job type
 * (Vertical Drama Render Queue plan §4.1/§4.2) — Wave 1. Modeled on
 * `queueDesktopVideoAssemblyJob` above (same `DESKTOP_RUNTIME_TYPE` lane,
 * same private-const/idempotency conventions), with two deliberate
 * departures:
 *
 * - **Free (0 credits).** This is a local re-encode of media the tenant
 *   already owns — VD assembly has never charged credits — so
 *   `reserveWorkerJobCredits` is never called and `instructionsJson` carries
 *   no `workerBilling` block (contrast `queueDesktopVideoAssemblyJob`, which
 *   always reserves).
 * - **Server-computed idempotency key** (see
 *   `buildVerticalDramaFfmpegAssemblyIdempotencyKey`) rather than trusted
 *   verbatim from the caller when omitted — mirrors
 *   `queueRemotionRenderVideoJob`'s `buildRemotionRenderVideoIdempotencyKey`
 *   pattern, not `queueDesktopVideoAssemblyJob`'s caller-supplied-only key.
 *
 * `capabilityRequirementsJson.capabilityFamilies` is always
 * `VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES` (non-empty — the
 * anti-mis-claim safety mechanism, see `workerJobMatchesSelection` above)
 * and is never caller-overridable.
 *
 * Not part of `queueWorkerJobByRuntime`'s `QueueWorkerJobByRuntimeInput`
 * union: like `queueRemotionRenderVideoJob`, this is called directly by its
 * own router mutations (a later wave), not by the generic
 * runEngine/workpack-launch dispatch path that the union serves.
 */
export async function queueVerticalDramaFfmpegAssemblyJob(
  rawInput: QueueVerticalDramaFfmpegAssemblyJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const {
    tenantId: _tenantId,
    requestedByUserId: _requestedByUserId,
    priority: _priority,
    idempotencyKey: _idempotencyKey,
    ...corePayload
  } = rawInput;
  const input = verticalDramaFfmpegAssemblyJobContractSchema.parse(corePayload);
  const repo = deps.repo ?? defaultRepo;

  const idempotencyKey =
    rawInput.idempotencyKey ??
    buildVerticalDramaFfmpegAssemblyIdempotencyKey(input);

  const existing = await repo.findJobByIdempotencyKey(
    rawInput.tenantId,
    idempotencyKey
  );
  if (existing) {
    return { created: false, job: existing };
  }

  const capabilityFamilies = [
    ...VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES,
  ];

  const job = await repo.insertJob({
    tenantId: rawInput.tenantId,
    teamId: null,
    workerId: null,
    runtimeType: DESKTOP_RUNTIME_TYPE,
    workflowRunId: null,
    requestedByUserId: rawInput.requestedByUserId ?? null,
    requestedBySystemComponent:
      "vertical_drama_ffmpeg_assembly_worker_scheduler",
    jobType: VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE,
    status: "queued",
    statusReason: "vertical_drama_ffmpeg_assembly_worker",
    priority: rawInput.priority ?? 25,
    resourceProfile: "cpu_heavy",
    capabilityRequirementsJson: {
      capabilityFamilies,
      preferredWorkerId: null,
    },
    inputJson: input,
    instructionsJson: {
      intent: VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE,
      requiredProgressStages: [
        "resolve_render_feed",
        "run_ffmpeg_assembly",
        "verify_outputs",
        "publish_artifacts",
      ],
      // Free job — no workerBilling block (contrast every other
      // DESKTOP_RUNTIME_TYPE queue fn above, which always reserves credits).
    },
    timeoutSeconds: VERTICAL_DRAMA_FFMPEG_ASSEMBLY_TIMEOUT_SECONDS,
    retryPolicyJson: {
      // Not auto-retry-safe (an ffmpeg re-encode isn't idempotent to blindly
      // re-run on a worker crash mid-write) — the user re-submits instead.
      maxAttempts: 1,
      backoffSeconds: 0,
    },
    idempotencyKey,
  });

  return { created: true, job };
}

export async function queueDesktopLocalFolderIngestJob(
  rawInput: QueueDesktopLocalFolderIngestJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  assertPotentialLocalFolderIngestInputAuthorization(rawInput);
  const input = localFolderIngestJobContractSchema.parse(rawInput);
  assertLocalFolderIngestInputAuthorization(input);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isDesktopWorkerDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Desktop ZeroClaw worker dispatch is disabled by operator kill switch"
    );
  }

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.desktopZeroClawWorker) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(DESKTOP_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(
      rawInput.tenantId,
      rawInput.idempotencyKey
    );
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(
      rawInput.tenantId,
      rawInput.preferredWorkerId
    );
    if (!worker) {
      throw new WorkerSchedulerError(
        "worker_not_found",
        404,
        `Preferred worker ${rawInput.preferredWorkerId} was not found`
      );
    }
    if (worker.runtimeType !== DESKTOP_RUNTIME_TYPE) {
      throw new WorkerSchedulerError(
        "worker_scope_mismatch",
        409,
        "Preferred worker is not registered as a Desktop + ZeroClaw worker"
      );
    }
    if (worker.status === "disabled" || worker.status === "draining") {
      throw new WorkerSchedulerError(
        "worker_state_invalid",
        409,
        `Preferred worker ${worker.id} is not accepting new work`
      );
    }
  }

  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const capabilityFamilies = buildDesktopLocalFolderIngestCapabilityFamilies();
  const billing = rawInput.requestedByUserId
    ? await reserveCredits({
        userId: rawInput.requestedByUserId,
        tenantId: rawInput.tenantId,
        requestedCredits: rawInput.reservedCredits,
        metadata: {
          teamId: rawInput.teamId ?? null,
          workflowRunId: rawInput.workflowRunId ?? null,
          jobType: "local_folder_ingest",
          capabilityFamilies,
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: rawInput.tenantId,
      teamId: rawInput.teamId ?? null,
      workerId: null,
      runtimeType: DESKTOP_RUNTIME_TYPE,
      workflowRunId: rawInput.workflowRunId ?? null,
      requestedByUserId: rawInput.requestedByUserId ?? null,
      requestedByPersonaId: rawInput.requestedByPersonaId ?? null,
      requestedBySystemComponent:
        rawInput.requestedBySystemComponent ?? "worker_scheduler",
      jobType: "local_folder_ingest",
      status: "queued",
      statusReason: "desktop_local_folder_ingest",
      priority: rawInput.priority ?? 20,
      resourceProfile: "cpu_heavy",
      capabilityRequirementsJson: {
        capabilityFamilies,
        preferredWorkerId: rawInput.preferredWorkerId ?? null,
      },
      inputJson: input,
      instructionsJson: {
        intent: "local_folder_ingest",
        workerBilling: buildWorkerBillingMetadata(billing),
        requiredProgressStages: [...LOCAL_FOLDER_INGEST_PROGRESS_STAGES],
      },
      timeoutSeconds: rawInput.timeoutSeconds ?? 3600,
      retryPolicyJson: {
        maxAttempts: 2,
        backoffSeconds: 60,
      },
      idempotencyKey: rawInput.idempotencyKey ?? null,
    });

    return {
      created: true,
      job,
    };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}

export async function queueDesktopComfyImageGenerationJob(
  rawInput: QueueDesktopComfyImageGenerationJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const input = comfyImageGenerationJobContractSchema.parse(rawInput);
  assertLoopbackComfyService(input.service.baseUrl);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isDesktopWorkerDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Desktop ZeroClaw worker dispatch is disabled by operator kill switch"
    );
  }

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.desktopZeroClawWorker) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(DESKTOP_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(
      rawInput.tenantId,
      rawInput.idempotencyKey
    );
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(
      rawInput.tenantId,
      rawInput.preferredWorkerId
    );
    assertPreferredWorkerCompatible(
      worker,
      rawInput.preferredWorkerId,
      DESKTOP_RUNTIME_TYPE,
      "a Desktop + ZeroClaw worker"
    );
  }

  const capabilityFamilies =
    buildDesktopComfyImageGenerationCapabilityFamilies(input);
  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const billing = rawInput.requestedByUserId
    ? await reserveCredits({
        userId: rawInput.requestedByUserId,
        tenantId: rawInput.tenantId,
        requestedCredits: rawInput.reservedCredits,
        metadata: {
          teamId: rawInput.teamId ?? null,
          workflowRunId: rawInput.workflowRunId ?? null,
          jobType: "comfy_image_generation",
          capabilityFamilies,
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: rawInput.tenantId,
      teamId: rawInput.teamId ?? null,
      workerId: null,
      runtimeType: DESKTOP_RUNTIME_TYPE,
      workflowRunId: rawInput.workflowRunId ?? null,
      requestedByUserId: rawInput.requestedByUserId ?? null,
      requestedByPersonaId: rawInput.requestedByPersonaId ?? null,
      requestedBySystemComponent:
        rawInput.requestedBySystemComponent ?? "worker_scheduler",
      jobType: "comfy_image_generation",
      status: "queued",
      statusReason: "desktop_comfy_image_generation",
      priority: rawInput.priority ?? 22,
      resourceProfile: input.generationSpec.gpuRequired
        ? "gpu_required"
        : "cpu_heavy",
      capabilityRequirementsJson: {
        capabilityFamilies,
        preferredWorkerId: rawInput.preferredWorkerId ?? null,
      },
      inputJson: input,
      instructionsJson: {
        intent: "comfy_image_generation",
        workerBilling: buildWorkerBillingMetadata(billing),
        requiredProgressStages: [...COMFY_IMAGE_GENERATION_PROGRESS_STAGES],
      },
      timeoutSeconds:
        rawInput.timeoutSeconds ?? Math.max(input.service.timeoutSeconds, 900),
      retryPolicyJson: {
        maxAttempts: 2,
        backoffSeconds: 90,
      },
      idempotencyKey: rawInput.idempotencyKey ?? null,
    });

    return { created: true, job };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}

export async function queueDesktopComfyWorkflowRunJob(
  rawInput: QueueDesktopComfyWorkflowRunJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const input = comfyWorkflowRunJobContractSchema.parse(rawInput);
  assertLoopbackComfyService(input.service.baseUrl);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isDesktopWorkerDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Desktop ZeroClaw worker dispatch is disabled by operator kill switch"
    );
  }

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.desktopZeroClawWorker) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(DESKTOP_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(
      rawInput.tenantId,
      rawInput.idempotencyKey
    );
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(
      rawInput.tenantId,
      rawInput.preferredWorkerId
    );
    assertPreferredWorkerCompatible(
      worker,
      rawInput.preferredWorkerId,
      DESKTOP_RUNTIME_TYPE,
      "a Desktop + ZeroClaw worker"
    );
  }

  const capabilityFamilies =
    buildDesktopComfyWorkflowRunCapabilityFamilies(input);
  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const billing = rawInput.requestedByUserId
    ? await reserveCredits({
        userId: rawInput.requestedByUserId,
        tenantId: rawInput.tenantId,
        requestedCredits: rawInput.reservedCredits,
        metadata: {
          teamId: rawInput.teamId ?? null,
          workflowRunId: rawInput.workflowRunId ?? null,
          jobType: "comfy_workflow_run",
          capabilityFamilies,
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: rawInput.tenantId,
      teamId: rawInput.teamId ?? null,
      workerId: null,
      runtimeType: DESKTOP_RUNTIME_TYPE,
      workflowRunId: rawInput.workflowRunId ?? null,
      requestedByUserId: rawInput.requestedByUserId ?? null,
      requestedByPersonaId: rawInput.requestedByPersonaId ?? null,
      requestedBySystemComponent:
        rawInput.requestedBySystemComponent ?? "worker_scheduler",
      jobType: "comfy_workflow_run",
      status: "queued",
      statusReason: "desktop_comfy_workflow_run",
      priority: rawInput.priority ?? 21,
      resourceProfile: input.executionPolicy.gpuRequired
        ? "gpu_required"
        : "cpu_heavy",
      capabilityRequirementsJson: {
        capabilityFamilies,
        preferredWorkerId: rawInput.preferredWorkerId ?? null,
      },
      inputJson: input,
      instructionsJson: {
        intent: "comfy_workflow_run",
        workerBilling: buildWorkerBillingMetadata(billing),
        requiredProgressStages: [...COMFY_WORKFLOW_RUN_PROGRESS_STAGES],
      },
      timeoutSeconds:
        rawInput.timeoutSeconds ?? Math.max(input.service.timeoutSeconds, 900),
      retryPolicyJson: {
        maxAttempts: 2,
        backoffSeconds: 90,
      },
      idempotencyKey: rawInput.idempotencyKey ?? null,
    });

    return { created: true, job };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}

async function queueFeatureGatedExternalRuntimeJob(
  input: {
    runtimeType: WorkerRuntimeType;
    tenantId: string;
    teamId?: string | null;
    workflowRunId?: string | null;
    requestedByUserId?: number | null;
    requestedByPersonaId?: string | null;
    requestedBySystemComponent?: string | null;
    jobType: string;
    title?: string | null;
    description?: string | null;
    priority?: number;
    timeoutSeconds?: number;
    resourceProfile?: WorkerResourceProfile;
    capabilityFamilies: string[];
    inputJson?: Record<string, unknown>;
    instructionsJson?: Record<string, unknown>;
    idempotencyKey?: string | null;
    preferredWorkerId?: string | null;
    reservedCredits?: number | null;
  },
  config: {
    featureFlagKey: keyof WorkerSchedulerFeatureFlags;
    dispatchDisabledMessage: string;
    featureDisabledMessage: string;
    unsupportedResourceProfiles: WorkerResourceProfile[];
    defaultResourceProfile: WorkerResourceProfile;
    intent: string;
    statusReason: string;
    runtimeLabel: string;
  },
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!input.jobType.trim()) {
    throw new WorkerSchedulerError(
      "unsupported_job_type",
      400,
      "jobType is required"
    );
  }

  if (
    config.unsupportedResourceProfiles.includes(
      (input.resourceProfile ??
        config.defaultResourceProfile) as WorkerResourceProfile
    )
  ) {
    throw new WorkerSchedulerError(
      "unsupported_resource_profile",
      400,
      `Resource profile ${input.resourceProfile} is not supported by ${config.runtimeLabel} routing`
    );
  }

  assertNoExternalLocalWindowsPath(input.inputJson, config.runtimeLabel);

  const flagValue =
    process.env[`${input.runtimeType.toUpperCase()}_DISPATCH_ENABLED`];
  if (flagValue === "false") {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      config.dispatchDisabledMessage
    );
  }

  const tenantFlags = await getFeatureFlags(input.tenantId);
  if (!tenantFlags[config.featureFlagKey]) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      config.featureDisabledMessage
    );
  }

  if (input.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(
      input.tenantId,
      input.idempotencyKey
    );
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (input.preferredWorkerId) {
    const worker = await repo.findWorkerById(
      input.tenantId,
      input.preferredWorkerId
    );
    assertPreferredWorkerCompatible(
      worker,
      input.preferredWorkerId,
      input.runtimeType,
      config.runtimeLabel
    );
  }

  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const billing = input.requestedByUserId
    ? await reserveCredits({
        userId: input.requestedByUserId,
        tenantId: input.tenantId,
        requestedCredits: input.reservedCredits,
        metadata: {
          teamId: input.teamId ?? null,
          workflowRunId: input.workflowRunId ?? null,
          jobType: input.jobType,
          capabilityFamilies: input.capabilityFamilies,
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: input.tenantId,
      teamId: input.teamId ?? null,
      workerId: null,
      runtimeType: input.runtimeType,
      workflowRunId: input.workflowRunId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      requestedByPersonaId: input.requestedByPersonaId ?? null,
      requestedBySystemComponent:
        input.requestedBySystemComponent ?? "worker_scheduler",
      jobType: input.jobType.trim(),
      status: "queued",
      statusReason: config.statusReason,
      priority: input.priority ?? 15,
      resourceProfile: input.resourceProfile ?? config.defaultResourceProfile,
      capabilityRequirementsJson: {
        capabilityFamilies: input.capabilityFamilies,
        preferredWorkerId: input.preferredWorkerId ?? null,
      },
      inputJson: {
        ...(input.inputJson ?? {}),
        title: input.title ?? null,
        description: input.description ?? null,
      },
      instructionsJson: {
        intent: input.instructionsJson?.intent ?? config.intent,
        ...(input.instructionsJson ?? {}),
        workerBilling: buildWorkerBillingMetadata(billing),
      },
      timeoutSeconds: input.timeoutSeconds ?? 7200,
      retryPolicyJson: {
        maxAttempts: 2,
        backoffSeconds: 60,
      },
      idempotencyKey: input.idempotencyKey ?? null,
    });

    return { created: true, job };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}

export async function queueDesktopHyperframesFinalCompositeJob(
  rawInput: QueueDesktopHyperframesFinalCompositeJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const input = hyperframesFinalCompositeWorkerInputSchema.parse(rawInput);
  const repo = deps.repo ?? defaultRepo;

  if (!isDesktopWorkerDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Smart AI Hub Worker App dispatch is disabled by operator kill switch"
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(
      rawInput.tenantId,
      rawInput.idempotencyKey
    );
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(
      rawInput.tenantId,
      rawInput.preferredWorkerId
    );
    assertPreferredWorkerCompatible(
      worker,
      rawInput.preferredWorkerId,
      DESKTOP_RUNTIME_TYPE,
      "a Smart AI Hub Worker App desktop worker"
    );
  }

  const capabilityFamilies =
    buildDesktopHyperframesFinalCompositeCapabilityFamilies();
  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const billing = rawInput.requestedByUserId
    ? await reserveCredits({
        userId: rawInput.requestedByUserId,
        tenantId: rawInput.tenantId,
        requestedCredits: rawInput.reservedCredits,
        metadata: {
          teamId: rawInput.teamId ?? null,
          workflowRunId: rawInput.workflowRunId ?? null,
          jobType: "hyperframes_final_composite",
          capabilityFamilies,
          finalVideoLengthSec: input.finalVideoLengthSec,
          shotCount: input.shots.length,
          compositionHash: input.compositionHash,
          finalCompositeConfigHash: input.finalCompositeConfigHash,
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: rawInput.tenantId,
      teamId: rawInput.teamId ?? null,
      workerId: null,
      runtimeType: DESKTOP_RUNTIME_TYPE,
      workflowRunId: normalizeWorkerWorkflowRunId(
        rawInput.workflowRunId ?? input.source.runId
      ),
      requestedByUserId: rawInput.requestedByUserId ?? null,
      requestedByPersonaId: rawInput.requestedByPersonaId ?? null,
      requestedBySystemComponent:
        rawInput.requestedBySystemComponent ?? "hyperframes_worker_scheduler",
      jobType: "hyperframes_final_composite",
      status: "queued",
      statusReason: "hyperframes_final_composite_worker",
      priority: rawInput.priority ?? 30,
      resourceProfile: "cpu_heavy",
      capabilityRequirementsJson: {
        capabilityFamilies,
        preferredWorkerId: rawInput.preferredWorkerId ?? null,
        runtimeProfileId: input.runtimeProfileId,
        requireOfficialRuntime: input.outputRequirements.requireOfficialRuntime,
        requireCssBrowserRuntime:
          input.outputRequirements.requireCssBrowserRuntime,
        rejectFallbackRender: input.outputRequirements.rejectFallbackRender,
      },
      inputJson: input,
      instructionsJson: {
        intent: "hyperframes_final_composite",
        workerBilling: buildWorkerBillingMetadata(billing),
        requiredProgressStages: [
          ...HYPERFRAMES_FINAL_COMPOSITE_PROGRESS_STAGES,
        ],
        outputPolicy: {
          format: input.outputRequirements.format,
          aspectRatio: input.outputRequirements.aspectRatio,
          width: input.outputRequirements.width,
          height: input.outputRequirements.height,
          fps: input.outputRequirements.fps,
          requireOfficialRuntime:
            input.outputRequirements.requireOfficialRuntime,
          rejectFallbackRender: input.outputRequirements.rejectFallbackRender,
          requireCssBrowserRuntime:
            input.outputRequirements.requireCssBrowserRuntime,
          requireServerVerification:
            input.outputRequirements.requireServerVerification,
          publishToLibrary: input.outputRequirements.publishToLibrary,
        },
        verificationPolicy: {
          serverVerifiedBeforePublish:
            input.outputRequirements.requireServerVerification,
          expectedDurationSec: input.finalVideoLengthSec,
          compositionHash: input.compositionHash,
          timelineHash: input.timelineHash,
          finalCompositeConfigHash: input.finalCompositeConfigHash,
        },
        source: input.source,
      },
      timeoutSeconds: rawInput.timeoutSeconds ?? 7200,
      retryPolicyJson: {
        maxAttempts: 2,
        backoffSeconds: 120,
        reassignmentPolicy: "worker_lease_watchdog",
      },
      idempotencyKey: rawInput.idempotencyKey ?? null,
    });

    return { created: true, job };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}

/**
 * Feature 133 (Video Intelligence Platform) — section-04
 * (`specs/feature/133-content-video-intelligence-platform/sections/section-04-queue-lane-a-worker.md`
 * §5.1). Extra fields layered on top of section-03's frozen
 * `RemotionRenderVideoWorkerInput` (`shared/workerRuntime.ts`) — same
 * pattern as `QueueDesktopHyperframesFinalCompositeJobInput` extending
 * `HyperframesFinalCompositeWorkerInput`.
 */
export interface QueueRemotionRenderVideoJobInput extends RemotionRenderVideoWorkerInput {
  tenantId: string;
  teamId?: string | null;
  requestedByUserId?: number | null;
  workflowRunId?: string | null;
  priority?: number;
  timeoutSeconds?: number;
  idempotencyKey?: string | null;
  reservedCredits?: number | null;
  /**
   * Additive (not part of section-03's frozen worker input schema): admin
   * tier ×5 render-submission rate limit multiplier (spec §18.5). Callers
   * (section-07's `videoProjects.queueRender`) set this from the requesting
   * user's role, not from client-supplied input.
   */
  isAdminRequester?: boolean;
  executionTarget?: "auto" | "desktop_worker" | "remotion_executor";
  preferredWorkerId?: string | null;
}

// The sidecar owns bounded transient retries: 3 x 10 minutes per attempt plus 20s/60s
// backoff. Keep the worker lease/orphan budget at one hour so a job can spend
// the expected 30-35 minutes recovering without being marked abandoned.
const REMOTION_RENDER_VIDEO_MIN_TIMEOUT_SECONDS = 60 * 60;
const REMOTION_RENDER_VIDEO_DEFAULT_CREDITS = 5;

function buildRemotionRenderVideoIdempotencyKey(input: {
  videoProjectId: string;
  projectRevision: number;
  profile: string;
}): string {
  const raw = `${input.videoProjectId}:${input.projectRevision}:${input.profile}`;
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `remotion_render_video:${hash}`;
}

/**
 * Credits proportional to durationMs × resolution-class × cost-class (spec
 * §18.4). Deliberately simple/monotonic — the exact pricing curve is a
 * product decision for a later pass; this only needs to scale sensibly with
 * the inputs already on the parsed job payload.
 */
function estimateRemotionRenderVideoCredits(
  input: RemotionRenderVideoWorkerInput
): number {
  const durationSec =
    input.durationInFrames / Math.max(1, input.renderProfile.fps);
  const pixelCount = input.renderProfile.width * input.renderProfile.height;
  const resolutionClass =
    pixelCount <= 540 * 960 ? 1 : pixelCount <= 1080 * 1920 ? 2 : 3;
  const costClass = input.renderProfile.profile === "final" ? 2 : 1;
  return Math.max(
    REMOTION_RENDER_VIDEO_DEFAULT_CREDITS,
    Math.ceil(durationSec * resolutionClass * costClass)
  );
}

function computeRemotionRenderVideoTimeoutSeconds(
  input: RemotionRenderVideoWorkerInput
): number {
  const durationSec =
    input.durationInFrames / Math.max(1, input.renderProfile.fps);
  const sidecarRetryBudgetSeconds =
    (REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS / 1000) *
      REMOTION_RENDER_VIDEO_MAX_ATTEMPTS +
    REMOTION_RENDER_VIDEO_RETRY_BACKOFF_MS.reduce(
      (sum, delayMs) => sum + delayMs / 1000,
      0
    ) +
    120;
  // Heuristic: real render + post-passes budget, ~4x realtime plus a fixed
  // overhead, floored at the bounded sidecar retry budget and one hour.
  const scaled = Math.ceil(durationSec * 4) + 120;
  return Math.max(
    REMOTION_RENDER_VIDEO_MIN_TIMEOUT_SECONDS,
    sidecarRetryBudgetSeconds,
    scaled
  );
}

/**
 * Enqueue function for the `remotion_render_video` worker job type (Feature
 * 133 Phase 1 MVP). Modeled on `queueDesktopHyperframesFinalCompositeJob`
 * (same `DESKTOP_RUNTIME_TYPE` lane, same private-const reuse), with three
 * additions specific to this job type: a render-submission rate limit
 * (spec §18.5), an idempotency key computed server-side from
 * `(videoProjectId, projectRevision, renderProfile.profile)` rather than
 * trusted verbatim from the caller, and a 1-concurrent-preview cap (spec
 * §18.2). `capabilityRequirementsJson.capabilityFamilies` is always
 * `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` (non-empty — the anti-mis-claim
 * safety mechanism, spec §6.3, see `workerJobMatchesSelection` above) and is
 * never caller-overridable.
 *
 * Authored here; called by section-07's `videoProjects.queueRender`.
 */
export async function queueRemotionRenderVideoJob(
  rawInput: QueueRemotionRenderVideoJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<{
      remotionRenderVideoJobEnabled: boolean;
      remotionDedicatedExecutorEnabled?: boolean;
    }>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  // `remotionRenderVideoWorkerInputSchema` is `.strict()` (section-03, spec
  // §6.2 drift guard) — it rejects the queue-only additive fields
  // (tenantId, requestedByUserId, ...), so those must be stripped before
  // parsing, not merely ignored.
  const {
    tenantId: _tenantId,
    teamId: _teamId,
    requestedByUserId: _requestedByUserId,
    workflowRunId: _workflowRunId,
    priority: _priority,
    timeoutSeconds: _timeoutSeconds,
    idempotencyKey: _idempotencyKey,
    reservedCredits: _reservedCredits,
    isAdminRequester: _isAdminRequester,
    executionTarget: _executionTarget,
    preferredWorkerId: _preferredWorkerId,
    ...corePayload
  } = rawInput;
  const input = remotionRenderVideoWorkerInputSchema.parse(corePayload);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  await consumeRemotionRenderSubmission(
    rawInput.tenantId,
    rawInput.requestedByUserId ?? null,
    Boolean(rawInput.isAdminRequester)
  );

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.remotionRenderVideoJobEnabled) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      "Remotion render video job dispatch (F133B) is disabled for this tenant"
    );
  }

  // Resolve the execution target before idempotency, credit reservation, and
  // insertion. Existing callers default to the legacy desktop lane. An
  // explicit dedicated request is fail-closed; `auto` can adopt a preferred
  // dedicated executor when it is already registered and ready, otherwise it
  // preserves the legacy desktop fallback.
  const requestedTarget = rawInput.executionTarget ?? "desktop_worker";
  const preferredWorkerId = rawInput.preferredWorkerId?.trim() || null;
  const preferredWorker = preferredWorkerId
    ? await repo.findWorkerById(rawInput.tenantId, preferredWorkerId)
    : null;
  if (
    requestedTarget === "remotion_executor" &&
    !isRemotionExecutorDispatchEnabled()
  ) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Standalone Remotion executor dispatch is disabled by operator kill switch"
    );
  }
  if (
    requestedTarget === "remotion_executor" &&
    !tenantFlags.remotionDedicatedExecutorEnabled
  ) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      "Standalone Remotion executor dispatch is disabled for this tenant"
    );
  }
  if (requestedTarget === "remotion_executor") {
    assertPreferredWorkerCompatible(
      preferredWorker,
      preferredWorkerId ?? "",
      REMOTION_EXECUTOR_RUNTIME_TYPE,
      "a standalone Remotion executor worker"
    );
  }
  const targetResolution = resolveRemotionExecutionTarget({
    requestedTarget,
    preferredWorkerId,
    tenantExecutorEnabled: Boolean(
      tenantFlags.remotionDedicatedExecutorEnabled
    ),
    operatorExecutorEnabled: isRemotionExecutorDispatchEnabled(),
    preferredWorker,
  });
  const resolvedRuntimeType: WorkerRuntimeType =
    targetResolution.resolvedTarget === "remotion_executor"
      ? REMOTION_EXECUTOR_RUNTIME_TYPE
      : DESKTOP_RUNTIME_TYPE;

  if (
    resolvedRuntimeType === DESKTOP_RUNTIME_TYPE &&
    !isDesktopWorkerDispatchEnabled()
  ) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Smart AI Hub Worker App dispatch is disabled by operator kill switch"
    );
  }

  const idempotencyKey =
    rawInput.idempotencyKey ??
    buildRemotionRenderVideoIdempotencyKey({
      videoProjectId: input.videoProjectId,
      projectRevision: input.projectRevision,
      profile: input.renderProfile.profile,
    });

  const existing = await repo.findJobByIdempotencyKey(
    rawInput.tenantId,
    idempotencyKey
  );
  if (existing) {
    return { created: false, job: existing };
  }

  if (
    input.renderProfile.profile === "preview" &&
    rawInput.requestedByUserId != null
  ) {
    const findActivePreview = repo.findActiveRemotionPreviewJobForUser;
    const activePreview = findActivePreview
      ? await findActivePreview(rawInput.tenantId, rawInput.requestedByUserId)
      : null;
    if (activePreview) {
      throw new WorkerSchedulerError(
        "preview_concurrency_limit",
        409,
        "Only one queued/running remotion_render_video preview job is allowed per user at a time"
      );
    }
  }

  const capabilityFamilies = [...REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES];
  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const timeoutSeconds = Math.max(
    computeRemotionRenderVideoTimeoutSeconds(input),
    rawInput.timeoutSeconds ?? 0
  );
  const billing = rawInput.requestedByUserId
    ? await reserveCredits({
        userId: rawInput.requestedByUserId,
        tenantId: rawInput.tenantId,
        requestedCredits:
          rawInput.reservedCredits ?? estimateRemotionRenderVideoCredits(input),
        metadata: {
          teamId: rawInput.teamId ?? null,
          workflowRunId: rawInput.workflowRunId ?? null,
          jobType: "remotion_render_video",
          capabilityFamilies,
          videoProjectId: input.videoProjectId,
          projectRevision: input.projectRevision,
          renderProfile: input.renderProfile.profile,
          traceId: input.traceId,
        },
      })
    : null;

  try {
    const job = await repo.insertJob({
      tenantId: rawInput.tenantId,
      teamId: rawInput.teamId ?? null,
      workerId: null,
      runtimeType: resolvedRuntimeType,
      workflowRunId: rawInput.workflowRunId ?? null,
      requestedByUserId: rawInput.requestedByUserId ?? null,
      requestedBySystemComponent: "remotion_render_video_worker_scheduler",
      jobType: "remotion_render_video",
      status: "queued",
      statusReason: "remotion_render_video_worker",
      priority:
        rawInput.priority ??
        (input.renderProfile.profile === "final" ? 40 : 20),
      resourceProfile: "cpu_heavy",
      capabilityRequirementsJson: {
        capabilityFamilies,
        requiredClaimCapability: REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY,
        preferredWorkerId,
        executionTarget: requestedTarget,
        executionTargetResolution: targetResolution,
        // `requiredClaimCapability` is the authoritative admission gate. The
        // descriptive families remain for observability and legacy routing.
        // `renderProfile` is carried so `findActiveRemotionPreviewJobForUser`
        // can filter without deserializing inputJson.
        renderProfile: input.renderProfile.profile,
      },
      inputJson: input,
      instructionsJson: {
        intent: "remotion_render_video",
        requiredProgressStages: [...REMOTION_RENDER_VIDEO_PROGRESS_STAGES],
        workerBilling: buildWorkerBillingMetadata(billing),
      },
      timeoutSeconds,
      retryPolicyJson: {
        // Do not re-create the worker job for a renderer hiccup. The sidecar
        // performs the bounded three-attempt retry while retaining one job id
        // and one credit reservation.
        maxAttempts: 1,
        backoffSeconds: 0,
        sidecarMaxAttempts: REMOTION_RENDER_VIDEO_MAX_ATTEMPTS,
        sidecarBackoffSeconds: REMOTION_RENDER_VIDEO_RETRY_BACKOFF_MS.map(
          ms => ms / 1000
        ),
      },
      idempotencyKey,
    });

    return { created: true, job };
  } catch (error) {
    if (billing?.reservationId) {
      await refundReservation(billing.reservationId).catch(() => {});
    }
    throw error;
  }
}

export async function queueNemoClawWorkerJob(
  input: QueueNemoClawWorkerJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  return queueFeatureGatedExternalRuntimeJob(
    {
      ...input,
      runtimeType: NEMOCLAW_RUNTIME_TYPE,
      capabilityFamilies: input.capabilityFamilies?.length
        ? input.capabilityFamilies
        : ["secure-sandbox-exec"],
      resourceProfile: input.resourceProfile ?? "sandbox_required",
    },
    {
      featureFlagKey: "nemoClawSecureWorkerPool",
      dispatchDisabledMessage:
        "NemoClaw secure worker dispatch is disabled by operator kill switch",
      featureDisabledMessage: `${getWorkerRuntimeDefinition(NEMOCLAW_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
      unsupportedResourceProfiles: ["gpu_required", "human_observable"],
      defaultResourceProfile: "sandbox_required",
      intent: "secure_sandbox_exec",
      statusReason: "nemoclaw_sandbox_job",
      runtimeLabel: "a NemoClaw sandbox worker",
    },
    deps
  );
}

function assertHermesEligible(input: QueueHermesWorkerJobInput): void {
  if (!HERMES_SUPPORTED_JOB_TYPES.includes(input.jobType)) {
    throw new WorkerSchedulerError(
      "unsupported_job_type",
      400,
      `Job type ${input.jobType} is not supported by Hermes routing`
    );
  }

  const capabilityFamilies = input.capabilityFamilies ?? [];
  const unsupportedFamily = capabilityFamilies.find(
    family => !HERMES_SUPPORTED_CAPABILITY_FAMILIES.includes(family)
  );
  if (unsupportedFamily) {
    throw new WorkerSchedulerError(
      "unsupported_capability_family",
      400,
      `Capability family ${unsupportedFamily} is not supported by Hermes routing`
    );
  }
}

function readHermesDispatchReadiness(
  tenantFlags: WorkerSchedulerFeatureFlags,
  worker: WorkerRecord | null
): ReturnType<typeof evaluateHermesRolloutReadiness> {
  const runtimeMetadataSource =
    worker &&
    worker.capabilitiesJson &&
    typeof worker.capabilitiesJson === "object"
      ? (worker.capabilitiesJson as Record<string, unknown>).runtimeMetadata
      : null;
  const runtimeMetadata =
    runtimeMetadataSource &&
    typeof runtimeMetadataSource === "object" &&
    !Array.isArray(runtimeMetadataSource)
      ? runtimeMetadataSource
      : {};
  const parsed = workerHermesRuntimeMetadataSchema.safeParse(runtimeMetadata);

  return evaluateHermesRolloutReadiness({
    featureFlags: {
      hermesAgentRuntime: tenantFlags.hermesAgentRuntime,
    },
    bridgeCapabilities: parsed.success
      ? {
          apiServerEnabled: parsed.data.apiServerEnabled,
          supportsDelegatedHttp: parsed.data.supportsDelegatedHttp,
          supportsDelegatedMcp: parsed.data.supportsDelegatedMcp,
          supportsBoundConnector: parsed.data.supportsBoundConnector,
          supportsCallbacks: parsed.data.supportsCallbacks,
          gatewayPlatforms: parsed.data.gatewayPlatforms,
        }
      : {},
    remoteEndpointPolicyExceptionId: parsed.success
      ? parsed.data.remoteEndpointPolicyExceptionId
      : undefined,
  });
}

export async function queueHermesWorkerJob(
  input: QueueHermesWorkerJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  assertHermesEligible(input);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;
  const correlation = input.correlation
    ? hermesTaskCorrelationSchema.parse(input.correlation)
    : undefined;
  if (correlation && correlation.tenantId !== input.tenantId) {
    throw new WorkerSchedulerError(
      "correlation_tenant_mismatch",
      403,
      "Hermes task correlation belongs to a different tenant"
    );
  }
  if (
    correlation &&
    input.requestedByUserId &&
    correlation.requestedByUserId !== input.requestedByUserId
  ) {
    throw new WorkerSchedulerError(
      "correlation_user_mismatch",
      403,
      "Hermes task correlation belongs to a different user"
    );
  }
  const tenantFlags = await getFeatureFlags(input.tenantId);

  if (!tenantFlags.hermesAgentRuntime) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(HERMES_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`
    );
  }

  if (!input.preferredWorkerId?.trim()) {
    throw new WorkerSchedulerError(
      "preferred_worker_required",
      400,
      "Hermes dispatch requires a preferred worker so owner-bound rollout stays explicit"
    );
  }

  const preferredWorker = await repo.findWorkerById(
    input.tenantId,
    input.preferredWorkerId.trim()
  );
  assertPreferredWorkerCompatible(
    preferredWorker,
    input.preferredWorkerId.trim(),
    HERMES_RUNTIME_TYPE,
    "a Hermes agent gateway worker"
  );

  const readiness = readHermesDispatchReadiness(tenantFlags, preferredWorker);
  if (!readiness.surfaces.boundDispatch) {
    throw new WorkerSchedulerError(
      "rollout_stage_blocked",
      409,
      "Hermes dispatch is not ready for this worker until delegated HTTP, bound-connector support, and API-server readiness are all reported"
    );
  }

  return queueFeatureGatedExternalRuntimeJob(
    {
      ...input,
      instructionsJson: {
        ...(input.instructionsJson ?? {}),
        ...(correlation ? { correlation } : {}),
      },
      runtimeType: HERMES_RUNTIME_TYPE,
      preferredWorkerId: input.preferredWorkerId.trim(),
      capabilityFamilies: input.capabilityFamilies?.length
        ? input.capabilityFamilies
        : ["artifact-producing-session"],
      resourceProfile: input.resourceProfile ?? "network_heavy",
    },
    {
      featureFlagKey: "hermesAgentRuntime",
      dispatchDisabledMessage:
        "Hermes agent gateway dispatch is disabled by operator kill switch",
      featureDisabledMessage: `${getWorkerRuntimeDefinition(HERMES_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
      unsupportedResourceProfiles: ["gpu_required", "sandbox_required"],
      defaultResourceProfile: "network_heavy",
      intent: "external_connector_follow_up",
      statusReason: "hermes_agent_gateway_job",
      runtimeLabel: "a Hermes agent gateway worker",
    },
    {
      ...deps,
      repo,
      getFeatureFlags,
    }
  );
}

export async function queueHiClawWorkerJob(
  input: QueueHiClawWorkerJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  return queueFeatureGatedExternalRuntimeJob(
    {
      ...input,
      runtimeType: HICLAW_RUNTIME_TYPE,
      capabilityFamilies: input.capabilityFamilies?.length
        ? input.capabilityFamilies
        : ["multi-agent-cluster"],
      resourceProfile: input.resourceProfile ?? "human_observable",
    },
    {
      featureFlagKey: "hiClawClusterRuntime",
      dispatchDisabledMessage:
        "HiClaw cluster dispatch is disabled by operator kill switch",
      featureDisabledMessage: `${getWorkerRuntimeDefinition(HICLAW_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
      unsupportedResourceProfiles: ["gpu_required", "sandbox_required"],
      defaultResourceProfile: "human_observable",
      intent: "multi_agent_cluster",
      statusReason: "hiclaw_cluster_job",
      runtimeLabel: "a HiClaw cluster worker",
    },
    deps
  );
}

export async function queueDesktopComfyMcpJob(
  input: QueueDesktopComfyMcpJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const parsedMcpInput = comfyMcpDispatchInputSchema.safeParse({
    ...input.inputJson,
    adapter: "comfy_mcp",
  });
  if (!parsedMcpInput.success) {
    throw new WorkerSchedulerError(
      "invalid_comfy_mcp_input",
      400,
      parsedMcpInput.error.issues.map(issue => issue.message).join("; ") || "Invalid ComfyUI MCP job input",
    );
  }
  const capabilityFamilies = input.jobType === "comfy_image_generation"
    ? ["comfyui-mcp", "comfyui-image-generate", "comfyui-workflow-run", "gpu-nvidia"]
    : input.jobType === "comfy_workflow_run"
      ? ["comfyui-mcp", "comfyui-workflow-run", "gpu-nvidia"]
      : ["comfyui-mcp", "comfyui-video-generate", "comfyui-workflow-run", "gpu-nvidia"];
  return queueFeatureGatedExternalRuntimeJob(
    {
      runtimeType: DESKTOP_RUNTIME_TYPE,
      tenantId: input.tenantId,
      teamId: input.teamId,
      workflowRunId: input.workflowRunId,
      requestedByUserId: input.requestedByUserId,
      requestedByPersonaId: input.requestedByPersonaId,
      requestedBySystemComponent: input.requestedBySystemComponent,
      jobType: input.jobType,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 22,
      timeoutSeconds: input.timeoutSeconds,
      resourceProfile: "gpu_required",
      capabilityFamilies,
      inputJson: parsedMcpInput.data,
      instructionsJson: { ...(input.instructionsJson ?? {}), intent: input.jobType, adapter: "comfy_mcp" },
      idempotencyKey: input.idempotencyKey,
      preferredWorkerId: input.preferredWorkerId,
      reservedCredits: input.reservedCredits,
    },
    {
      featureFlagKey: "desktopZeroClawWorker",
      dispatchDisabledMessage: "Desktop ComfyUI MCP worker dispatch is disabled.",
      featureDisabledMessage: "Desktop ComfyUI MCP worker is not enabled for this tenant.",
      unsupportedResourceProfiles: ["sandbox_required"],
      defaultResourceProfile: "gpu_required",
      intent: input.jobType,
      statusReason: `desktop_comfy_mcp_${input.jobType}`,
      runtimeLabel: "desktop ComfyUI MCP worker",
    },
    deps,
  );
}

export async function queueDesktopComfyVideoGenerationJob(
  input: QueueDesktopComfyMcpJobInput & { jobType: "comfy_video_generation" },
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  return queueDesktopComfyMcpJob(input, deps);
}

export async function queueWorkerJobByRuntime(
  input: QueueWorkerJobByRuntimeInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (
      tenantId: string
    ) => Promise<WorkerSchedulerFeatureFlags>;
  } = {}
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  if (input.runtimeType === "openclaw_gateway") {
    return queueOpenClawWorkerJob(input, deps);
  }

  if (input.runtimeType === "desktop_zeroclaw_managed") {
    if (input.jobType === "local_folder_ingest") {
      return queueDesktopLocalFolderIngestJob(input, deps);
    }
    if (input.jobType === "comfy_image_generation") {
      if (isComfyMcpInput(input)) {
        return queueDesktopComfyMcpJob(input, deps);
      }
      return queueDesktopComfyImageGenerationJob(input, deps);
    }
    if (input.jobType === "comfy_workflow_run") {
      if (isComfyMcpInput(input)) {
        return queueDesktopComfyMcpJob(input, deps);
      }
      return queueDesktopComfyWorkflowRunJob(input, deps);
    }
    if (input.jobType === "comfy_video_generation") {
      return queueDesktopComfyVideoGenerationJob(input, deps);
    }
    if (input.jobType === "hyperframes_final_composite") {
      return queueDesktopHyperframesFinalCompositeJob(input, deps);
    }
    return queueDesktopVideoAssemblyJob(input, deps);
  }

  if (input.runtimeType === "nemoclaw_sandbox") {
    return queueNemoClawWorkerJob(input, deps);
  }

  if (input.runtimeType === "hermes_agent_gateway") {
    return queueHermesWorkerJob(input, deps);
  }

  if (input.runtimeType === "hiclaw_cluster") {
    return queueHiClawWorkerJob(input, deps);
  }

  throw new WorkerSchedulerError(
    "unsupported_runtime_type",
    400,
    `Runtime type ${(input as { runtimeType: string }).runtimeType} is not supported by the scheduler`
  );
}

function isComfyMcpInput(input: unknown): input is QueueDesktopComfyMcpJobInput {
  return Boolean(input && typeof input === "object" && "inputJson" in input && (input as { inputJson?: Record<string, unknown> }).inputJson?.adapter === "comfy_mcp");
}
