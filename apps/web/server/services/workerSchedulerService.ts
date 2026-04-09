import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { workerJobs, workers } from "../../drizzle/schema";
import type {
  ComfyImageGenerationJobContract,
  ComfyWorkflowRunJobContract,
  LocalFolderIngestJobContract,
  WorkerResourceProfile,
  WorkerRuntimeType,
  VideoAssemblyJobContract,
} from "../../shared/workerRuntime";
import {
  COMFY_IMAGE_GENERATION_PROGRESS_STAGES,
  COMFY_WORKFLOW_RUN_PROGRESS_STAGES,
  comfyImageGenerationJobContractSchema,
  comfyWorkflowRunJobContractSchema,
  getWorkerRuntimeDefinition,
  isWorkerPathWithinAllowedRoots,
  isWorkerLoopbackUrl,
  localFolderIngestJobContractSchema,
  looksLikeWorkerLocalFilePath,
  LOCAL_FOLDER_INGEST_PROGRESS_STAGES,
  videoAssemblyJobContractSchema,
} from "../../shared/workerRuntime";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import {
  reserveWorkerJobCredits,
  type WorkerJobBillingEnvelope,
} from "./workerBillingService";
import { refundReservation } from "./creditService";

const OPENCLAW_RUNTIME_TYPE: WorkerRuntimeType = "openclaw_gateway";
const DESKTOP_RUNTIME_TYPE: WorkerRuntimeType = "desktop_zeroclaw_managed";
const NEMOCLAW_RUNTIME_TYPE: WorkerRuntimeType = "nemoclaw_sandbox";
const HICLAW_RUNTIME_TYPE: WorkerRuntimeType = "hiclaw_cluster";

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
  nemoClawSecureWorkerPool: boolean;
  hiClawClusterRuntime: boolean;
}

export interface WorkerSchedulerRepository {
  findJobByIdempotencyKey: (tenantId: string, idempotencyKey: string) => Promise<WorkerJobRecord | null>;
  findWorkerById: (tenantId: string, workerId: string) => Promise<WorkerRecord | null>;
  insertJob: (values: Record<string, unknown>) => Promise<WorkerJobRecord>;
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

export function isOpenClawDispatchEnabled(): boolean {
  const raw = process.env.OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED;
  return raw !== "false";
}

export function isDesktopWorkerDispatchEnabled(): boolean {
  const raw = process.env.DESKTOP_ZEROCLAW_WORKER_DISPATCH_ENABLED;
  return raw !== "false";
}

const defaultRepo: WorkerSchedulerRepository = {
  async findJobByIdempotencyKey(tenantId, idempotencyKey) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.idempotencyKey, idempotencyKey)))
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
    const [job] = await db.insert(workerJobs).values(values as any).returning();
    return job;
  },
};

function assertOpenClawEligible(input: QueueOpenClawWorkerJobInput): void {
  if (!OPENCLAW_SUPPORTED_JOB_TYPES.includes(input.jobType)) {
    throw new WorkerSchedulerError(
      "unsupported_job_type",
      400,
      `Job type ${input.jobType} is not supported by OpenClaw routing`,
    );
  }

  if (
    input.resourceProfile === "gpu_required"
    || input.resourceProfile === "sandbox_required"
  ) {
    throw new WorkerSchedulerError(
      "unsupported_resource_profile",
      400,
      `Resource profile ${input.resourceProfile} is not supported by OpenClaw routing`,
    );
  }

  const requiresLocalWindowsAccess = Boolean(input.inputJson?.localWindowsPath);
  if (requiresLocalWindowsAccess) {
    throw new WorkerSchedulerError(
      "unsupported_job_scope",
      400,
      "Jobs that depend on local Windows file paths must not route to OpenClaw",
    );
  }

  const unsupportedFamily = input.capabilityFamilies.find(
    (family) => !OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES.includes(family),
  );
  if (unsupportedFamily) {
    throw new WorkerSchedulerError(
      "unsupported_capability_family",
      400,
      `Capability family ${unsupportedFamily} is not supported by OpenClaw routing`,
    );
  }
}

function buildWorkerBillingMetadata(
  billing: WorkerJobBillingEnvelope | null,
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
  capabilityHints: string[],
): boolean {
  const requirements = (job?.capabilityRequirementsJson ?? {}) as Record<string, unknown>;
  const preferredWorkerId = typeof requirements.preferredWorkerId === "string"
    ? requirements.preferredWorkerId
    : "";
  if (preferredWorkerId && preferredWorkerId !== workerId) {
    return false;
  }

  const requiredFamilies = Array.isArray(requirements.capabilityFamilies)
    ? requirements.capabilityFamilies.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    )
    : [];
  if (requiredFamilies.length === 0 || capabilityHints.length === 0) {
    return true;
  }

  return requiredFamilies.some((family) => capabilityHints.includes(family));
}

export async function queueOpenClawWorkerJob(
  input: QueueOpenClawWorkerJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  assertOpenClawEligible(input);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isOpenClawDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "OpenClaw external runtime dispatch is disabled by operator kill switch",
    );
  }

  const tenantFlags = await getFeatureFlags(input.tenantId);
  if (!tenantFlags.openClawExternalRuntime) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      "OpenClaw external runtime dispatch is disabled for this tenant",
    );
  }

  if (input.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(input.tenantId, input.idempotencyKey);
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (input.preferredWorkerId) {
    const worker = await repo.findWorkerById(input.tenantId, input.preferredWorkerId);
    if (!worker) {
      throw new WorkerSchedulerError(
        "worker_not_found",
        404,
        `Preferred worker ${input.preferredWorkerId} was not found`,
      );
    }
    if (worker.runtimeType !== OPENCLAW_RUNTIME_TYPE) {
      throw new WorkerSchedulerError(
        "worker_scope_mismatch",
        409,
        "Preferred worker is not registered as an OpenClaw gateway worker",
      );
    }
    if (worker.status === "disabled") {
      throw new WorkerSchedulerError(
        "worker_state_invalid",
        409,
        `Preferred worker ${worker.id} is disabled`,
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
      requestedBySystemComponent: input.requestedBySystemComponent ?? "worker_scheduler",
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
        intent: input.instructionsJson?.intent ?? input.capabilityFamilies[0] ?? "artifact-producing-session",
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
      runtimeType: "nemoclaw_sandbox";
    } & QueueNemoClawWorkerJobInput)
  | ({
      runtimeType: "hiclaw_cluster";
    } & QueueHiClawWorkerJobInput);

function assertVideoAssemblyInputAuthorization(input: VideoAssemblyJobContract): void {
  const allowedRoots = input.workspacePolicy.allowedSourceRoots;
  for (const inputRef of input.inputRefs) {
    if (inputRef.sourceKind !== "authorized_local_path" || !inputRef.path) {
      continue;
    }
    if (!isWorkerPathWithinAllowedRoots(inputRef.path, allowedRoots)) {
      throw new WorkerSchedulerError(
        "unauthorized_path",
        403,
        `Path ${inputRef.path} is outside the approved workspace roots`,
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
        `Clip source ${clip.sourceRef} is outside the approved workspace roots`,
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
        `Subtitle source ${supplementalRef} is outside the approved workspace roots`,
      );
    }
  }
}

function buildDesktopVideoCapabilityFamilies(input: VideoAssemblyJobContract): string[] {
  const families = new Set<string>(["video-edit", "file-access"]);
  if (input.subtitlePlan.mode === "burn_in" || input.subtitlePlan.mode === "soft_mux") {
    families.add("subtitle-burn");
  }
  if (input.renderProfile.gpuRequired) {
    families.add("gpu-nvidia");
  }
  return Array.from(families);
}

function assertLocalFolderIngestInputAuthorization(input: LocalFolderIngestJobContract): void {
  const allowedRoots = input.workspacePolicy.allowedSourceRoots;
  for (const root of input.roots) {
    if (!isWorkerPathWithinAllowedRoots(root.path, allowedRoots)) {
      throw new WorkerSchedulerError(
        "unauthorized_path",
        403,
        `Path ${root.path} is outside the approved workspace roots`,
      );
    }
  }
}

function assertPotentialLocalFolderIngestInputAuthorization(rawInput: unknown): void {
  if (!rawInput || typeof rawInput !== "object") {
    return;
  }

  const workspacePolicy = Reflect.get(rawInput, "workspacePolicy");
  const allowedRoots = workspacePolicy && typeof workspacePolicy === "object"
    ? Reflect.get(workspacePolicy, "allowedSourceRoots")
    : null;
  if (!Array.isArray(allowedRoots)) {
    return;
  }

  const normalizedAllowedRoots = allowedRoots.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
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
        `Path ${path} is outside the approved workspace roots`,
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
      "ComfyUI desktop jobs require a local-only loopback service endpoint",
    );
  }
}

function buildDesktopComfyImageGenerationCapabilityFamilies(
  input: ComfyImageGenerationJobContract,
): string[] {
  const families = new Set<string>(["comfyui-image-generate"]);
  if (input.generationSpec.gpuRequired) {
    families.add("gpu-nvidia");
  }
  return Array.from(families);
}

function buildDesktopComfyWorkflowRunCapabilityFamilies(
  input: ComfyWorkflowRunJobContract,
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

function assertPreferredWorkerCompatible(
  worker: WorkerRecord | null,
  preferredWorkerId: string,
  runtimeType: WorkerRuntimeType,
  runtimeLabel: string,
): void {
  if (!worker) {
    throw new WorkerSchedulerError(
      "worker_not_found",
      404,
      `Preferred worker ${preferredWorkerId} was not found`,
    );
  }
  if (worker.runtimeType !== runtimeType) {
    throw new WorkerSchedulerError(
      "worker_scope_mismatch",
      409,
      `Preferred worker is not registered as ${runtimeLabel}`,
    );
  }
  if (worker.status === "disabled" || worker.status === "draining") {
    throw new WorkerSchedulerError(
      "worker_state_invalid",
      409,
      `Preferred worker ${worker.id} is not accepting new work`,
    );
  }
}

function isAbsoluteWindowsOrUncPath(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\[^\\]+\\[^\\]+/.test(trimmed);
}

function findNestedExternalLocalWindowsPath(
  value: unknown,
  trail: string[] = [],
): string | null {
  if (typeof value === "string") {
    return isAbsoluteWindowsOrUncPath(value) ? trail.join(".") || "<root>" : null;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const match = findNestedExternalLocalWindowsPath(item, [...trail, String(index)]);
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
    const match = findNestedExternalLocalWindowsPath(nestedValue, [...trail, key]);
    if (match) {
      return match;
    }
  }

  return null;
}

function assertNoExternalLocalWindowsPath(
  inputJson: Record<string, unknown> | undefined,
  runtimeLabel: string,
): void {
  if (!inputJson) {
    return;
  }
  const match = findNestedExternalLocalWindowsPath(inputJson);
  if (match) {
    throw new WorkerSchedulerError(
      "unsupported_job_scope",
      400,
      `${runtimeLabel} jobs must not depend on local Windows file paths (${match})`,
    );
  }
}

export async function queueDesktopVideoAssemblyJob(
  rawInput: QueueDesktopVideoAssemblyJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const input = videoAssemblyJobContractSchema.parse(rawInput);
  assertVideoAssemblyInputAuthorization(input);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isDesktopWorkerDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Desktop ZeroClaw worker dispatch is disabled by operator kill switch",
    );
  }

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.desktopZeroClawWorker) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(DESKTOP_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(rawInput.tenantId, rawInput.idempotencyKey);
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(rawInput.tenantId, rawInput.preferredWorkerId);
    if (!worker) {
      throw new WorkerSchedulerError(
        "worker_not_found",
        404,
        `Preferred worker ${rawInput.preferredWorkerId} was not found`,
      );
    }
    if (worker.runtimeType !== DESKTOP_RUNTIME_TYPE) {
      throw new WorkerSchedulerError(
        "worker_scope_mismatch",
        409,
        "Preferred worker is not registered as a Desktop + ZeroClaw worker",
      );
    }
    if (worker.status === "disabled" || worker.status === "draining") {
      throw new WorkerSchedulerError(
        "worker_state_invalid",
        409,
        `Preferred worker ${worker.id} is not accepting new work`,
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
      requestedBySystemComponent: rawInput.requestedBySystemComponent ?? "worker_scheduler",
      jobType: "video_assembly",
      status: "queued",
      statusReason: "desktop_video_assembly",
      priority: rawInput.priority ?? 25,
      resourceProfile: rawInput.renderProfile.gpuRequired ? "gpu_required" : "cpu_heavy",
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

export async function queueDesktopLocalFolderIngestJob(
  rawInput: QueueDesktopLocalFolderIngestJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
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
      "Desktop ZeroClaw worker dispatch is disabled by operator kill switch",
    );
  }

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.desktopZeroClawWorker) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(DESKTOP_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(rawInput.tenantId, rawInput.idempotencyKey);
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(rawInput.tenantId, rawInput.preferredWorkerId);
    if (!worker) {
      throw new WorkerSchedulerError(
        "worker_not_found",
        404,
        `Preferred worker ${rawInput.preferredWorkerId} was not found`,
      );
    }
    if (worker.runtimeType !== DESKTOP_RUNTIME_TYPE) {
      throw new WorkerSchedulerError(
        "worker_scope_mismatch",
        409,
        "Preferred worker is not registered as a Desktop + ZeroClaw worker",
      );
    }
    if (worker.status === "disabled" || worker.status === "draining") {
      throw new WorkerSchedulerError(
        "worker_state_invalid",
        409,
        `Preferred worker ${worker.id} is not accepting new work`,
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
      requestedBySystemComponent: rawInput.requestedBySystemComponent ?? "worker_scheduler",
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
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const input = comfyImageGenerationJobContractSchema.parse(rawInput);
  assertLoopbackComfyService(input.service.baseUrl);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isDesktopWorkerDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Desktop ZeroClaw worker dispatch is disabled by operator kill switch",
    );
  }

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.desktopZeroClawWorker) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(DESKTOP_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(rawInput.tenantId, rawInput.idempotencyKey);
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(rawInput.tenantId, rawInput.preferredWorkerId);
    assertPreferredWorkerCompatible(
      worker,
      rawInput.preferredWorkerId,
      DESKTOP_RUNTIME_TYPE,
      "a Desktop + ZeroClaw worker",
    );
  }

  const capabilityFamilies = buildDesktopComfyImageGenerationCapabilityFamilies(input);
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
      requestedBySystemComponent: rawInput.requestedBySystemComponent ?? "worker_scheduler",
      jobType: "comfy_image_generation",
      status: "queued",
      statusReason: "desktop_comfy_image_generation",
      priority: rawInput.priority ?? 22,
      resourceProfile: input.generationSpec.gpuRequired ? "gpu_required" : "cpu_heavy",
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
      timeoutSeconds: rawInput.timeoutSeconds ?? Math.max(input.service.timeoutSeconds, 900),
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
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const input = comfyWorkflowRunJobContractSchema.parse(rawInput);
  assertLoopbackComfyService(input.service.baseUrl);
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!isDesktopWorkerDispatchEnabled()) {
    throw new WorkerSchedulerError(
      "dispatch_disabled",
      503,
      "Desktop ZeroClaw worker dispatch is disabled by operator kill switch",
    );
  }

  const tenantFlags = await getFeatureFlags(rawInput.tenantId);
  if (!tenantFlags.desktopZeroClawWorker) {
    throw new WorkerSchedulerError(
      "feature_disabled",
      403,
      `${getWorkerRuntimeDefinition(DESKTOP_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
    );
  }

  if (rawInput.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(rawInput.tenantId, rawInput.idempotencyKey);
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (rawInput.preferredWorkerId) {
    const worker = await repo.findWorkerById(rawInput.tenantId, rawInput.preferredWorkerId);
    assertPreferredWorkerCompatible(
      worker,
      rawInput.preferredWorkerId,
      DESKTOP_RUNTIME_TYPE,
      "a Desktop + ZeroClaw worker",
    );
  }

  const capabilityFamilies = buildDesktopComfyWorkflowRunCapabilityFamilies(input);
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
      requestedBySystemComponent: rawInput.requestedBySystemComponent ?? "worker_scheduler",
      jobType: "comfy_workflow_run",
      status: "queued",
      statusReason: "desktop_comfy_workflow_run",
      priority: rawInput.priority ?? 21,
      resourceProfile: input.executionPolicy.gpuRequired ? "gpu_required" : "cpu_heavy",
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
      timeoutSeconds: rawInput.timeoutSeconds ?? Math.max(input.service.timeoutSeconds, 900),
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
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  if (!input.jobType.trim()) {
    throw new WorkerSchedulerError("unsupported_job_type", 400, "jobType is required");
  }

  if (config.unsupportedResourceProfiles.includes(
    (input.resourceProfile ?? config.defaultResourceProfile) as WorkerResourceProfile,
  )) {
    throw new WorkerSchedulerError(
      "unsupported_resource_profile",
      400,
      `Resource profile ${input.resourceProfile} is not supported by ${config.runtimeLabel} routing`,
    );
  }

  assertNoExternalLocalWindowsPath(input.inputJson, config.runtimeLabel);

  const flagValue = process.env[`${input.runtimeType.toUpperCase()}_DISPATCH_ENABLED`];
  if (flagValue === "false") {
    throw new WorkerSchedulerError("dispatch_disabled", 503, config.dispatchDisabledMessage);
  }

  const tenantFlags = await getFeatureFlags(input.tenantId);
  if (!tenantFlags[config.featureFlagKey]) {
    throw new WorkerSchedulerError("feature_disabled", 403, config.featureDisabledMessage);
  }

  if (input.idempotencyKey) {
    const existing = await repo.findJobByIdempotencyKey(input.tenantId, input.idempotencyKey);
    if (existing) {
      return { created: false, job: existing };
    }
  }

  if (input.preferredWorkerId) {
    const worker = await repo.findWorkerById(input.tenantId, input.preferredWorkerId);
    assertPreferredWorkerCompatible(worker, input.preferredWorkerId, input.runtimeType, config.runtimeLabel);
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
      requestedBySystemComponent: input.requestedBySystemComponent ?? "worker_scheduler",
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

export async function queueNemoClawWorkerJob(
  input: QueueNemoClawWorkerJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
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
      dispatchDisabledMessage: "NemoClaw secure worker dispatch is disabled by operator kill switch",
      featureDisabledMessage: `${getWorkerRuntimeDefinition(NEMOCLAW_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
      unsupportedResourceProfiles: ["gpu_required", "human_observable"],
      defaultResourceProfile: "sandbox_required",
      intent: "secure_sandbox_exec",
      statusReason: "nemoclaw_sandbox_job",
      runtimeLabel: "a NemoClaw sandbox worker",
    },
    deps,
  );
}

export async function queueHiClawWorkerJob(
  input: QueueHiClawWorkerJobInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
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
      dispatchDisabledMessage: "HiClaw cluster dispatch is disabled by operator kill switch",
      featureDisabledMessage: `${getWorkerRuntimeDefinition(HICLAW_RUNTIME_TYPE).displayName} dispatch is disabled for this tenant`,
      unsupportedResourceProfiles: ["gpu_required", "sandbox_required"],
      defaultResourceProfile: "human_observable",
      intent: "multi_agent_cluster",
      statusReason: "hiclaw_cluster_job",
      runtimeLabel: "a HiClaw cluster worker",
    },
    deps,
  );
}

export async function queueWorkerJobByRuntime(
  input: QueueWorkerJobByRuntimeInput,
  deps: {
    repo?: WorkerSchedulerRepository;
    reserveCredits?: typeof reserveWorkerJobCredits;
    getFeatureFlags?: (tenantId: string) => Promise<WorkerSchedulerFeatureFlags>;
  } = {},
): Promise<{ created: boolean; job: WorkerJobRecord }> {
  if (input.runtimeType === "openclaw_gateway") {
    return queueOpenClawWorkerJob(input, deps);
  }

  if (input.runtimeType === "desktop_zeroclaw_managed") {
    if (input.jobType === "local_folder_ingest") {
      return queueDesktopLocalFolderIngestJob(input, deps);
    }
    if (input.jobType === "comfy_image_generation") {
      return queueDesktopComfyImageGenerationJob(input, deps);
    }
    if (input.jobType === "comfy_workflow_run") {
      return queueDesktopComfyWorkflowRunJob(input, deps);
    }
    return queueDesktopVideoAssemblyJob(input, deps);
  }

  if (input.runtimeType === "nemoclaw_sandbox") {
    return queueNemoClawWorkerJob(input, deps);
  }

  if (input.runtimeType === "hiclaw_cluster") {
    return queueHiClawWorkerJob(input, deps);
  }

  throw new WorkerSchedulerError(
    "unsupported_runtime_type",
    400,
    `Runtime type ${(input as { runtimeType: string }).runtimeType} is not supported by the scheduler`,
  );
}
