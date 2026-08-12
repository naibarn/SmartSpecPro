import { z } from "zod";
import {
  HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC,
  HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
} from "./hyperframes/limits";

export const WORKER_RUNTIME_PROTOCOL_VERSION = "2026-04-06";
export const WORKER_RUNTIME_FAMILY_SCHEMA_VERSION = "2026-04-08";
export const WORKER_RUNTIME_PROFILE_SCHEMA_VERSION = "2026-04-08";

export const workerRuntimeTypeValues = [
  "openclaw_gateway",
  "desktop_zeroclaw_managed",
  "nemoclaw_sandbox",
  "hiclaw_cluster",
  "hermes_agent_gateway",
] as const;

export const workerStatusValues = [
  "online",
  "offline",
  "unhealthy",
  "disabled",
  "draining",
] as const;

export const workerJobStatusValues = [
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

export const workerModeValues = [
  "per_user",
  "shared_department",
  "dedicated_gpu",
  "external_runtime",
] as const;

export const workerRuntimeModeValues = [
  "native_constrained",
  "wsl2_managed",
  "docker_isolated",
  "external_managed",
] as const;

export const workerFileScopeModeValues = [
  "workspace_scoped",
  "team_drive",
  "full_machine",
] as const;

export const workerResourceProfileValues = [
  "cpu_light",
  "cpu_heavy",
  "gpu_required",
  "large_disk_temp",
  "network_heavy",
  "long_running",
  "sandbox_required",
  "human_observable",
] as const;

export const workerScopeValues = [
  "workers:register",
  "workers:heartbeat",
  "workers:claim",
  "workers:report",
  "workers:diagnostics",
] as const;

export const workerDesktopServiceModeValues = [
  "foreground",
  "background_tray",
  "auto_start",
  "managed_startup",
  "maintenance",
] as const;

export const workerExecutionIdentityModeValues = [
  "user_bound",
  "service_identity",
] as const;

export const workerApprovalModeValues = [
  "owner_approved",
  "team_approved",
  "admin_approved",
  "preapproved_typed_jobs",
  "per_job_approval",
  "admin_only",
] as const;

export const workerBudgetAttributionModeValues = [
  "owner_budget",
  "team_budget",
  "cost_center_budget",
  "requesting_actor_budget",
  "service_cost_center_budget",
] as const;

export const workerTokenRotationTriggerValues = [
  "manual_reissue",
  "periodic_rotation",
  "policy_change",
  "revocation",
  "worker_reassignment",
  "offboarding",
  "ownership_transfer",
  "drain_event",
] as const;

export const videoAssemblyProgressStageValues = [
  "resolve_inputs",
  "stage_workspace",
  "probe_media",
  "build_edit_plan",
  "render_outputs",
  "verify_outputs",
  "upload_artifacts",
  "publish_artifacts",
  "trigger_indexing",
] as const;

export const videoAssemblyFailureCodeValues = [
  "transient_input_fetch_failed",
  "temporary_disk_pressure",
  "runtime_restart_required",
  "artifact_upload_failed",
  "index_enqueue_failed",
  "unauthorized_path",
  "unsupported_media",
  "insufficient_gpu",
  "insufficient_temp_disk",
  "adapter_contract_violation",
  "render_failed",
  "artifact_publish_failed",
] as const;

export const VIDEO_ASSEMBLY_PROGRESS_STAGES = [...videoAssemblyProgressStageValues];
export const VIDEO_ASSEMBLY_FAILURE_CODES = [...videoAssemblyFailureCodeValues];

export const localFolderIngestProgressStageValues = [
  "resolve_roots",
  "index_files",
  "extract_previews",
  "write_manifest",
  "upload_artifacts",
  "publish_artifacts",
  "trigger_indexing",
] as const;

export const localFolderIngestFailureCodeValues = [
  "temporary_disk_pressure",
  "artifact_upload_failed",
  "index_enqueue_failed",
  "unauthorized_path",
  "unsupported_media",
  "adapter_contract_violation",
  "artifact_publish_failed",
] as const;

export const LOCAL_FOLDER_INGEST_PROGRESS_STAGES = [...localFolderIngestProgressStageValues];
export const LOCAL_FOLDER_INGEST_FAILURE_CODES = [...localFolderIngestFailureCodeValues];

export const comfyImageGenerationProgressStageValues = [
  "validate_service",
  "submit_workflow",
  "poll_execution",
  "collect_outputs",
  "upload_artifacts",
  "publish_artifacts",
  "trigger_indexing",
] as const;

export const comfyImageGenerationFailureCodeValues = [
  "service_unreachable",
  "workflow_rejected",
  "execution_timeout",
  "artifact_upload_failed",
  "index_enqueue_failed",
  "adapter_contract_violation",
  "artifact_publish_failed",
  "unsupported_output",
] as const;

export const COMFY_IMAGE_GENERATION_PROGRESS_STAGES = [...comfyImageGenerationProgressStageValues];
export const COMFY_IMAGE_GENERATION_FAILURE_CODES = [...comfyImageGenerationFailureCodeValues];

export const comfyWorkflowRunProgressStageValues = [
  "validate_service",
  "submit_workflow",
  "poll_execution",
  "collect_outputs",
  "upload_artifacts",
  "publish_artifacts",
  "trigger_indexing",
] as const;

export const comfyWorkflowRunFailureCodeValues = [
  "service_unreachable",
  "workflow_rejected",
  "execution_timeout",
  "artifact_upload_failed",
  "index_enqueue_failed",
  "adapter_contract_violation",
  "artifact_publish_failed",
  "unsupported_output",
] as const;

export const COMFY_WORKFLOW_RUN_PROGRESS_STAGES = [...comfyWorkflowRunProgressStageValues];
export const COMFY_WORKFLOW_RUN_FAILURE_CODES = [...comfyWorkflowRunFailureCodeValues];

export const hyperframesFinalCompositeProgressStageValues = [
  "resolve_inputs",
  "stage_assets",
  "doctor_runtime",
  "build_composition",
  "render_browser_css",
  "verify_outputs",
  "upload_artifacts",
  "server_verify_artifacts",
  "publish_artifacts",
] as const;

export const hyperframesFinalCompositeFailureCodeValues = [
  "runtime_not_ready",
  "runtime_contract_mismatch",
  "unsupported_template",
  "unsupported_css_runtime",
  "browser_runtime_unavailable",
  "thai_font_unavailable",
  "input_fetch_failed",
  "timeline_contract_invalid",
  "render_failed",
  "artifact_upload_failed",
  "server_verification_failed",
  "artifact_publish_failed",
] as const;

export const HYPERFRAMES_FINAL_COMPOSITE_PROGRESS_STAGES = [
  ...hyperframesFinalCompositeProgressStageValues,
];
export const HYPERFRAMES_FINAL_COMPOSITE_FAILURE_CODES = [
  ...hyperframesFinalCompositeFailureCodeValues,
];

export const HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES = [
  "hyperframes-final-composite",
  "official-hyperframes-runtime",
  "browser-render",
  "thai-fonts",
  "ffmpeg-probe",
] as const;

export const localAiWorkerJobFamilyValues = [
  "local_ai_text",
  "local_ai_vision",
  "local_ai_multimodal",
] as const;

export const localAiProviderValues = [
  "ollama",
  "lm_studio",
] as const;

export const SMARTAIHUB_WORKER_MCP_TOOL_NAMES = [
  "smartaihub.worker.get_capabilities",
  "smartaihub.worker.register_capabilities",
  "smartaihub.worker.claim_job",
  "smartaihub.worker.get_job_manifest",
  "smartaihub.worker.report_progress",
  "smartaihub.worker.init_artifact_upload",
  "smartaihub.worker.complete_artifact_upload",
  "smartaihub.worker.complete_job",
  "smartaihub.worker.fail_job",
  "smartaihub.worker.release_job",
] as const;

export type WorkerRuntimeType = (typeof workerRuntimeTypeValues)[number];
export type WorkerStatus = (typeof workerStatusValues)[number];
export type WorkerJobStatus = (typeof workerJobStatusValues)[number];
export type WorkerMode = (typeof workerModeValues)[number];
export type WorkerRuntimeMode = (typeof workerRuntimeModeValues)[number];
export type WorkerFileScopeMode = (typeof workerFileScopeModeValues)[number];
export type WorkerResourceProfile = (typeof workerResourceProfileValues)[number];
export type WorkerScope = (typeof workerScopeValues)[number];
export type WorkerDesktopServiceMode = (typeof workerDesktopServiceModeValues)[number];
export type WorkerExecutionIdentityMode = (typeof workerExecutionIdentityModeValues)[number];
export type WorkerApprovalMode = (typeof workerApprovalModeValues)[number];
export type WorkerBudgetAttributionMode = (typeof workerBudgetAttributionModeValues)[number];
export type WorkerTokenRotationTrigger = (typeof workerTokenRotationTriggerValues)[number];
export type VideoAssemblyProgressStage = (typeof videoAssemblyProgressStageValues)[number];
export type VideoAssemblyFailureCode = (typeof videoAssemblyFailureCodeValues)[number];
export type LocalFolderIngestProgressStage = (typeof localFolderIngestProgressStageValues)[number];
export type LocalFolderIngestFailureCode = (typeof localFolderIngestFailureCodeValues)[number];
export type ComfyImageGenerationProgressStage =
  (typeof comfyImageGenerationProgressStageValues)[number];
export type ComfyImageGenerationFailureCode =
  (typeof comfyImageGenerationFailureCodeValues)[number];
export type ComfyWorkflowRunProgressStage =
  (typeof comfyWorkflowRunProgressStageValues)[number];
export type ComfyWorkflowRunFailureCode =
  (typeof comfyWorkflowRunFailureCodeValues)[number];
export type HyperframesFinalCompositeProgressStage =
  (typeof hyperframesFinalCompositeProgressStageValues)[number];
export type HyperframesFinalCompositeFailureCode =
  (typeof hyperframesFinalCompositeFailureCodeValues)[number];
export type HyperframesFinalCompositeCapabilityFamily =
  (typeof HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES)[number];
export type LocalAiWorkerJobFamily = (typeof localAiWorkerJobFamilyValues)[number];
export type LocalAiProvider = (typeof localAiProviderValues)[number];
export type SmartAiHubWorkerMcpToolName = (typeof SMARTAIHUB_WORKER_MCP_TOOL_NAMES)[number];

export const workerRuntimeTypeSchema = z.enum(workerRuntimeTypeValues);
export const workerStatusSchema = z.enum(workerStatusValues);
export const workerJobStatusSchema = z.enum(workerJobStatusValues);
export const workerModeSchema = z.enum(workerModeValues);
export const workerRuntimeModeSchema = z.enum(workerRuntimeModeValues);
export const workerFileScopeModeSchema = z.enum(workerFileScopeModeValues);
export const workerResourceProfileSchema = z.enum(workerResourceProfileValues);
export const workerScopeSchema = z.enum(workerScopeValues);
export const workerDesktopServiceModeSchema = z.enum(workerDesktopServiceModeValues);
export const workerExecutionIdentityModeSchema = z.enum(workerExecutionIdentityModeValues);
export const workerApprovalModeSchema = z.enum(workerApprovalModeValues);
export const workerBudgetAttributionModeSchema = z.enum(workerBudgetAttributionModeValues);
export const workerTokenRotationTriggerSchema = z.enum(workerTokenRotationTriggerValues);
export const videoAssemblyProgressStageSchema = z.enum(videoAssemblyProgressStageValues);
export const videoAssemblyFailureCodeSchema = z.enum(videoAssemblyFailureCodeValues);
export const localFolderIngestProgressStageSchema = z.enum(localFolderIngestProgressStageValues);
export const localFolderIngestFailureCodeSchema = z.enum(localFolderIngestFailureCodeValues);
export const comfyImageGenerationProgressStageSchema = z.enum(comfyImageGenerationProgressStageValues);
export const comfyImageGenerationFailureCodeSchema = z.enum(comfyImageGenerationFailureCodeValues);
export const comfyWorkflowRunProgressStageSchema = z.enum(comfyWorkflowRunProgressStageValues);
export const comfyWorkflowRunFailureCodeSchema = z.enum(comfyWorkflowRunFailureCodeValues);
export const hyperframesFinalCompositeProgressStageSchema = z.enum(
  hyperframesFinalCompositeProgressStageValues,
);
export const hyperframesFinalCompositeFailureCodeSchema = z.enum(
  hyperframesFinalCompositeFailureCodeValues,
);
export const localAiWorkerJobFamilySchema = z.enum(localAiWorkerJobFamilyValues);
export const localAiProviderSchema = z.enum(localAiProviderValues);
export const mcpWorkerToolNameSchema = z.enum(SMARTAIHUB_WORKER_MCP_TOOL_NAMES);
export const hyperframesFinalCompositeCapabilityFamilySchema = z.enum(
  HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES,
);

export const workerProtocolCompatibilitySchema = z.object({
  protocolVersion: z.string().min(1).default(WORKER_RUNTIME_PROTOCOL_VERSION),
  runtimeVersion: z.string().min(1),
  minServerProtocolVersion: z.string().min(1).nullable().optional().default(null),
  maxServerProtocolVersion: z.string().min(1).nullable().optional().default(null),
  runtimeFamilySchemaVersion: z.string().min(1).default(WORKER_RUNTIME_FAMILY_SCHEMA_VERSION),
  runtimeProfileSchemaVersion: z.string().min(1).default(WORKER_RUNTIME_PROFILE_SCHEMA_VERSION),
  minRuntimeFamilySchemaVersion: z.string().min(1).nullable().optional().default(null),
  maxRuntimeFamilySchemaVersion: z.string().min(1).nullable().optional().default(null),
  minRuntimeProfileSchemaVersion: z.string().min(1).nullable().optional().default(null),
  maxRuntimeProfileSchemaVersion: z.string().min(1).nullable().optional().default(null),
});

export const workerDeviceBindingSchema = z.object({
  deviceId: z.string().min(1),
  machineFingerprint: z.string().min(1),
  publicKey: z.string().min(1),
});

export const workerDesktopExecutionIdentitySchema = z.object({
  mode: workerExecutionIdentityModeSchema,
  approvalMode: workerApprovalModeSchema,
  budgetAttributionMode: workerBudgetAttributionModeSchema,
  tokenRotationTriggers: z.array(workerTokenRotationTriggerSchema).min(1),
});

export const workerDesktopRuntimeMetadataSchema = z.object({
  desktopVersion: z.string().min(1),
  runtimeProfile: workerRuntimeModeSchema,
  workspaceRootsSummary: z.array(
    z.object({
      root: z.string().min(1),
      accessMode: workerFileScopeModeSchema.optional(),
    }),
  ),
  gpuSnapshot: z.record(z.string(), z.unknown()),
  toolchainSummary: z.record(z.string(), z.unknown()),
  doctorSummary: z.record(z.string(), z.unknown()),
  serviceMode: workerDesktopServiceModeSchema,
  executionIdentity: workerDesktopExecutionIdentitySchema,
});

export const workerNemoClawRuntimeMetadataSchema = z.object({
  openShellVersion: z.string().min(1),
  sandboxName: z.string().min(1),
  blueprintVersion: z.string().min(1),
  inferenceProviderProfile: z.string().min(1),
  networkPolicyProfile: z.string().min(1),
  filesystemPolicyScope: z.string().min(1),
  processRestrictionProfile: z.string().min(1),
  resourceClass: z.string().min(1),
});

export const workerHiClawRuntimeMetadataSchema = z.object({
  managerEndpoint: z.string().min(1),
  clusterId: z.string().min(1),
  gatewayMode: z.string().min(1),
  credentialHandlingMode: z.string().min(1),
  sharedArtifactStoreProfile: z.string().min(1),
  humanOversightMode: z.string().min(1),
  workerPoolSummary: z.record(z.string(), z.unknown()),
  matrixVisibilityMode: z.string().min(1),
});

export const workerHermesRuntimeMetadataSchema = z.object({
  hermesVersion: z.string().min(1),
  profileName: z.string().min(1),
  profileLabel: z.string().min(1).nullable().optional().default(null),
  profilePurpose: z.string().min(1).nullable().optional().default(null),
  llmRoutingMode: z.enum(["auto", "pinned_provider"]).default("auto"),
  preferredProviderId: z.number().int().positive().nullable().optional().default(null),
  preferredProviderName: z.string().min(1).nullable().optional().default(null),
  channelStatus: z.enum(["connected", "inactive", "revoked"]).nullable().optional().default(null),
  apiServerEnabled: z.boolean().default(true),
  apiServerBaseUrl: z.string().url().nullable().optional().default(null),
  remoteEndpointPolicyExceptionId: z.string().trim().min(1).nullable().optional().default(null),
  terminalBackend: z.string().min(1),
  gatewayPlatforms: z.array(z.string().min(1)).default([]),
  supportsDelegatedHttp: z.boolean().default(false),
  supportsDelegatedMcp: z.boolean().default(false),
  supportsBoundConnector: z.boolean().default(false),
  supportsCallbacks: z.boolean().default(false),
  memorySyncEnabled: z.boolean().default(false),
  memorySyncScope: z.enum(["personal", "team_shared", "workspace_shared", "cross_channel"]).nullable().optional().default(null),
  memorySyncStatus: z.enum(["disabled", "active", "inactive", "quarantined"]).nullable().optional().default(null),
  workerAccessPolicy: z.object({
    permissionPreset: z.string().min(1).nullable().optional().default(null),
    permissionScopes: z.array(z.string().min(1)).default([]),
    quotaHourly: z.number().int().positive().nullable().optional().default(null),
    quotaDaily: z.number().int().positive().nullable().optional().default(null),
    quotaWeekly: z.number().int().positive().nullable().optional().default(null),
    quotaMonthly: z.number().int().positive().nullable().optional().default(null),
  }).nullable().optional().default(null),
  hostPlatform: z.string().min(1),
  hostExecutionMode: z.string().min(1),
}).superRefine((payload, ctx) => {
  if (payload.apiServerEnabled && !payload.apiServerBaseUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["apiServerBaseUrl"],
      message: "Hermes bridge metadata requires apiServerBaseUrl when apiServerEnabled is true",
    });
  }
  if (
    payload.apiServerBaseUrl
    && !isWorkerLoopbackUrl(payload.apiServerBaseUrl)
    && payload.remoteEndpointPolicyExceptionId
    && !isWorkerHttpsUrl(payload.apiServerBaseUrl)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["apiServerBaseUrl"],
      message: "Hermes bridge remote API server URLs must use https when an audited exception is granted",
    });
  }
  if (payload.llmRoutingMode === "pinned_provider" && !payload.preferredProviderId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["preferredProviderId"],
      message: "Hermes pinned provider routing requires preferredProviderId",
    });
  }
  if (payload.preferredProviderId && payload.llmRoutingMode !== "pinned_provider") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["llmRoutingMode"],
      message: "preferredProviderId requires llmRoutingMode to be pinned_provider",
    });
  }
  if (payload.preferredProviderName && !payload.preferredProviderId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["preferredProviderName"],
      message: "preferredProviderName requires preferredProviderId",
    });
  }
});

export interface HermesRuntimePersonaSummary {
  profileName: string | null;
  profileLabel: string | null;
  profilePurpose: string | null;
  displayLabel: string;
  displayPurpose: string;
  isGenericFallback: boolean;
}

export interface HermesRuntimeChannelSummary {
  channelStatus: "connected" | "inactive" | "revoked" | "unknown";
  displayLabel: string;
  hasCallbackSupport: boolean;
  hasDelegatedHttpSupport: boolean;
  hasDelegatedMcpSupport: boolean;
  connectedPlatforms: string[];
}

export interface HermesRuntimeMemorySyncSummary {
  memorySyncEnabled: boolean;
  memorySyncScope: "personal" | "team_shared" | "workspace_shared" | "cross_channel" | null;
  memorySyncStatus: "disabled" | "active" | "inactive" | "quarantined" | "unknown";
  displayLabel: string;
  isSharedScope: boolean;
}

export interface HermesTaskModeSummary {
  taskMode: "coordination" | "research_summary" | "channel_response" | "team_update_drafting" | "monitoring_triage" | "generic_fallback";
  scopeProfile: "worker_gateway_readonly" | "worker_gateway_content_creator" | "worker_gateway_researcher" | "worker_gateway_media_operator" | "worker_gateway_hybrid_executor" | null;
  displayLabel: string;
}

export interface HermesProviderRoutingSummary {
  llmRoutingMode: "auto" | "pinned_provider";
  preferredProviderId: number | null;
  preferredProviderName: string | null;
  displayLabel: string;
}

const HERMES_SCOPE_PROFILE_TO_TASK_MODE: Record<
  "worker_gateway_readonly" | "worker_gateway_content_creator" | "worker_gateway_researcher" | "worker_gateway_media_operator" | "worker_gateway_hybrid_executor",
  HermesTaskModeSummary["taskMode"]
> = {
  worker_gateway_readonly: "coordination",
  worker_gateway_content_creator: "team_update_drafting",
  worker_gateway_researcher: "research_summary",
  worker_gateway_media_operator: "channel_response",
  worker_gateway_hybrid_executor: "monitoring_triage",
};

export function summarizeHermesRuntimePersona(
  runtimeMetadataJson: Record<string, unknown> | null | undefined,
): HermesRuntimePersonaSummary {
  const parsed = workerHermesRuntimeMetadataSchema.safeParse(runtimeMetadataJson ?? {});
  if (!parsed.success) {
    return {
      profileName: null,
      profileLabel: null,
      profilePurpose: null,
      displayLabel: "Generic Hermes",
      displayPurpose: "Default Hermes behavior",
      isGenericFallback: true,
    };
  }

  const profileName = parsed.data.profileName?.trim() || null;
  const profileLabel = parsed.data.profileLabel?.trim() || null;
  const profilePurpose = parsed.data.profilePurpose?.trim() || null;
  const displayLabel = profileLabel ?? profileName ?? "Generic Hermes";
  const displayPurpose = profilePurpose ?? (profileName ? "Default Hermes behavior" : "No persona selected");

  return {
    profileName,
    profileLabel,
    profilePurpose,
    displayLabel,
    displayPurpose,
    isGenericFallback: profileName === null && profileLabel === null && profilePurpose === null,
  };
}

export function summarizeHermesRuntimeChannel(
  runtimeMetadataJson: Record<string, unknown> | null | undefined,
  workerStatus?: string | null,
  revokedAt?: string | null,
): HermesRuntimeChannelSummary {
  const parsed = workerHermesRuntimeMetadataSchema.safeParse(runtimeMetadataJson ?? {});
  if (!parsed.success) {
    return {
      channelStatus: "unknown",
      displayLabel: "Channel state unavailable",
      hasCallbackSupport: false,
      hasDelegatedHttpSupport: false,
      hasDelegatedMcpSupport: false,
      connectedPlatforms: [],
    };
  }

  const status = parsed.data.channelStatus
    ?? (revokedAt ? "revoked" : null)
    ?? (workerStatus === "disabled" || workerStatus === "draining" ? "inactive" : null)
    ?? ((parsed.data.supportsCallbacks || parsed.data.supportsDelegatedHttp || parsed.data.supportsDelegatedMcp || parsed.data.gatewayPlatforms.length > 0)
      ? "connected"
      : "inactive");
  const displayLabel =
    status === "connected" ? "Connected"
    : status === "revoked" ? "Revoked"
    : status === "inactive" ? "Inactive"
    : "Unknown";

  return {
    channelStatus: status,
    displayLabel,
    hasCallbackSupport: parsed.data.supportsCallbacks === true,
    hasDelegatedHttpSupport: parsed.data.supportsDelegatedHttp === true,
    hasDelegatedMcpSupport: parsed.data.supportsDelegatedMcp === true,
    connectedPlatforms: parsed.data.gatewayPlatforms.map((platform) => platform.trim().toLowerCase()).filter(Boolean),
  };
}

export function summarizeHermesRuntimeMemorySync(
  runtimeMetadataJson: Record<string, unknown> | null | undefined,
): HermesRuntimeMemorySyncSummary {
  const parsed = workerHermesRuntimeMetadataSchema.safeParse(runtimeMetadataJson ?? {});
  if (!parsed.success) {
    return {
      memorySyncEnabled: false,
      memorySyncScope: null,
      memorySyncStatus: "unknown",
      displayLabel: "Memory sync unavailable",
      isSharedScope: false,
    };
  }

  const memorySyncEnabled = parsed.data.memorySyncEnabled === true;
  const memorySyncScope = parsed.data.memorySyncScope ?? null;
  const memorySyncStatus = parsed.data.memorySyncStatus
    ?? (memorySyncEnabled ? "active" : "disabled");
  const displayLabel =
    memorySyncStatus === "active"
      ? (memorySyncScope === "personal" || !memorySyncScope ? "Personal memory sync" : "Shared memory sync")
      : memorySyncStatus === "quarantined"
        ? "Memory sync quarantined"
        : memorySyncStatus === "inactive"
          ? "Memory sync inactive"
          : "Memory sync off";

  return {
    memorySyncEnabled,
    memorySyncScope,
    memorySyncStatus,
    displayLabel,
    isSharedScope: memorySyncScope === "team_shared" || memorySyncScope === "workspace_shared" || memorySyncScope === "cross_channel",
  };
}

export function summarizeHermesTaskMode(
  scopeProfile: string | null | undefined,
): HermesTaskModeSummary {
  const normalized = typeof scopeProfile === "string" ? scopeProfile.trim() : "";
  if (!normalized) {
    return {
      taskMode: "generic_fallback",
      scopeProfile: null,
      displayLabel: "Generic fallback",
    };
  }

  const profile = normalized as keyof typeof HERMES_SCOPE_PROFILE_TO_TASK_MODE;
  const taskMode = HERMES_SCOPE_PROFILE_TO_TASK_MODE[profile] ?? "generic_fallback";
  const displayLabelMap: Record<HermesTaskModeSummary["taskMode"], string> = {
    coordination: "Coordination",
    research_summary: "Research summary",
    channel_response: "Channel response",
    team_update_drafting: "Team update drafting",
    monitoring_triage: "Monitoring triage",
    generic_fallback: "Generic fallback",
  };

  return {
    taskMode,
    scopeProfile: (profile in HERMES_SCOPE_PROFILE_TO_TASK_MODE ? profile : null) as HermesTaskModeSummary["scopeProfile"],
    displayLabel: displayLabelMap[taskMode],
  };
}

export function summarizeHermesProviderRouting(
  runtimeMetadataJson: Record<string, unknown> | null | undefined,
): HermesProviderRoutingSummary {
  const parsed = workerHermesRuntimeMetadataSchema.safeParse(runtimeMetadataJson ?? {});
  if (!parsed.success) {
    return {
      llmRoutingMode: "auto",
      preferredProviderId: null,
      preferredProviderName: null,
      displayLabel: "LLM provider auto-select",
    };
  }

  const preferredProviderId = parsed.data.preferredProviderId ?? null;
  const preferredProviderName = parsed.data.preferredProviderName?.trim() || null;
  if (parsed.data.llmRoutingMode === "pinned_provider" && preferredProviderId) {
    return {
      llmRoutingMode: "pinned_provider",
      preferredProviderId,
      preferredProviderName,
      displayLabel: preferredProviderName
        ? `Pinned to ${preferredProviderName}`
        : `Pinned provider #${preferredProviderId}`,
    };
  }

  return {
    llmRoutingMode: "auto",
    preferredProviderId,
    preferredProviderName,
    displayLabel: "LLM provider auto-select",
  };
}

const workerRegistrationPayloadBaseSchema = z.object({
  compatibility: workerProtocolCompatibilitySchema,
  runtimeType: workerRuntimeTypeSchema,
  workerMode: workerModeSchema.default("external_runtime"),
  displayName: z.string().min(1),
  externalReference: z.string().min(1),
  runtimeMode: workerRuntimeModeSchema.default("external_managed"),
  teamId: z.string().min(1).nullable().optional().default(null),
  machineId: z.string().min(1).nullable().optional().default(null),
  machineName: z.string().min(1).nullable().optional().default(null),
  dashboardUrl: z.string().url().nullable().optional().default(null),
  capabilitiesJson: z.record(z.string(), z.unknown()).default({}),
  hardwareJson: z.record(z.string(), z.unknown()).default({}),
  healthSummaryJson: z.record(z.string(), z.unknown()).default({}),
  warningFlagsJson: z.array(z.string()).default([]),
  runtimeMetadataJson: z.record(z.string(), z.unknown()).default({}),
  fileScopeMode: workerFileScopeModeSchema.default("workspace_scoped"),
  runtimeProfileName: z.string().min(1).nullable().optional().default(null),
  policyProfileName: z.string().min(1).nullable().optional().default(null),
  deviceBinding: workerDeviceBindingSchema.nullable().optional().default(null),
});

export const workerRegistrationPayloadSchema = workerRegistrationPayloadBaseSchema.superRefine(
  (payload, ctx) => {
    validateWorkerRuntimeMetadata(payload.runtimeType, payload.workerMode, payload.runtimeMetadataJson, ctx);
    if (payload.runtimeType === "hermes_agent_gateway") {
      if (payload.workerMode !== "per_user") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["workerMode"],
          message: "Hermes bridge registrations must use per_user worker mode in v1",
        });
      }
      if (payload.runtimeMode !== "external_managed") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["runtimeMode"],
          message: "Hermes bridge registrations must use external_managed runtime mode in v1",
        });
      }
      if (!payload.externalReference.startsWith("hermes://")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["externalReference"],
          message: "Hermes bridge externalReference must use hermes:// URI form",
        });
      }
    }
  },
);

export const workerHeartbeatPayloadSchema = z.object({
  compatibility: workerProtocolCompatibilitySchema,
  runtimeType: workerRuntimeTypeSchema,
  status: workerStatusSchema,
  currentJobCount: z.number().int().min(0).default(0),
  queueDepth: z.number().int().min(0).default(0),
  freeDiskBytes: z.number().int().min(0).nullable().optional().default(null),
  metricsJson: z.record(z.string(), z.unknown()).default({}),
  warningsJson: z.array(z.string()).default([]),
  runtimeMetadataJson: z.record(z.string(), z.unknown()).default({}),
});

export const workerClaimRequestSchema = z.object({
  maxJobs: z.number().int().positive().max(10).default(1),
  capabilityHints: z.array(z.string()).default([]),
});

export const workerJobEventPayloadSchema = z.object({
  eventType: z.string().min(1),
  payloadJson: z.record(z.string(), z.unknown()).default({}),
  sequenceNumber: z.number().int().positive().nullable().optional().default(null),
  leaseOwnerToken: z.string().min(1),
  assignmentAttempt: z.string().min(1).nullable().optional().default(null),
});

export const workerArtifactInitPayloadSchema = z.object({
  artifactType: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().min(1).nullable().optional().default(null),
  leaseOwnerToken: z.string().min(1),
  assignmentAttempt: z.string().min(1).nullable().optional().default(null),
});

export const workerArtifactCompletePayloadSchema = z.object({
  artifactType: z.string().min(1),
  storageRef: z.string().min(1),
  checksumSha256: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  contentType: z.string().min(1).nullable().optional().default(null),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  leaseOwnerToken: z.string().min(1),
  assignmentAttempt: z.string().min(1).nullable().optional().default(null),
});

export const workerDiagnosticsPayloadSchema = z.object({
  summaryJson: z.record(z.string(), z.unknown()).default({}),
  detailsJson: z.record(z.string(), z.unknown()).default({}),
  warningFlagsJson: z.array(z.string()).default([]),
});

export const workerGatewayEndpointSchema = z.object({
  method: z.enum(["GET", "POST"]),
  path: z.string().min(1),
  purpose: z.string().min(1),
});

export const workerGatewayCompatibilityMetadataSchema = z.object({
  contractVersion: z.string().min(1).default(WORKER_RUNTIME_PROTOCOL_VERSION),
  preferredTransport: z.literal("http").default("http"),
  authMode: z.enum(["bearer", "api_key", "internal_token"]).default("bearer"),
  embeddingsSupport: z.enum(["supported", "unsupported", "deferred"]).default("unsupported"),
  httpEndpoints: z.array(workerGatewayEndpointSchema).min(1),
});

export const DEFAULT_CLAW_GATEWAY_COMPATIBILITY = workerGatewayCompatibilityMetadataSchema.parse({
  authMode: "bearer",
  embeddingsSupport: "unsupported",
  httpEndpoints: [
    { method: "GET", path: "/v1/openapi.json", purpose: "HTTP capability discovery" },
    { method: "POST", path: "/v1/chat/completions", purpose: "OpenAI-compatible chat" },
    { method: "POST", path: "/v1/responses", purpose: "Responses API proxy" },
    { method: "GET", path: "/v1/models", purpose: "Model discovery" },
    { method: "GET", path: "/v1/credits", purpose: "Credit visibility" },
    { method: "POST", path: "/v1/knowledge/library/search", purpose: "Owner library search" },
    { method: "POST", path: "/v1/knowledge/library/upload", purpose: "Owner library upload" },
    { method: "POST", path: "/v1/knowledge/rag/search", purpose: "Owner RAG search" },
    { method: "POST", path: "/v1/knowledge/rag/ingest", purpose: "Owner RAG ingest" },
  ],
});

export const DEFAULT_HERMES_GATEWAY_COMPATIBILITY = workerGatewayCompatibilityMetadataSchema.parse({
  authMode: "bearer",
  embeddingsSupport: "unsupported",
  httpEndpoints: [
    { method: "GET", path: "/health", purpose: "Hermes API server health check" },
    { method: "POST", path: "/v1/chat/completions", purpose: "OpenAI-compatible chat bridge" },
    { method: "POST", path: "/v1/responses", purpose: "OpenAI-compatible responses bridge" },
    { method: "GET", path: "/v1/models", purpose: "Hermes model discovery" },
  ],
});

export interface WorkerRuntimeDefinition {
  runtimeType: WorkerRuntimeType;
  displayName: string;
  familyName: string;
  featureFlag: string;
  registrationSupport: "stable" | "feature_gated" | "admin_gated";
  dispatchSupport: "stable" | "limited" | "admin_gated";
  supportedRuntimeFamilySchemaVersions: string[];
  supportedRuntimeProfileSchemaVersions: string[];
  gatewayCompatibility: WorkerGatewayCompatibilityMetadata | null;
}

export const WORKER_RUNTIME_DEFINITIONS: Readonly<
  Record<WorkerRuntimeType, WorkerRuntimeDefinition>
> = {
  openclaw_gateway: {
    runtimeType: "openclaw_gateway",
    displayName: "OpenClaw Gateway",
    familyName: "OpenClaw",
    featureFlag: "openClawExternalRuntime",
    registrationSupport: "stable",
    dispatchSupport: "stable",
    supportedRuntimeFamilySchemaVersions: [WORKER_RUNTIME_FAMILY_SCHEMA_VERSION],
    supportedRuntimeProfileSchemaVersions: [WORKER_RUNTIME_PROFILE_SCHEMA_VERSION],
    gatewayCompatibility: DEFAULT_CLAW_GATEWAY_COMPATIBILITY,
  },
  desktop_zeroclaw_managed: {
    runtimeType: "desktop_zeroclaw_managed",
    displayName: "Desktop + ZeroClaw Managed Runtime",
    familyName: "Desktop + ZeroClaw",
    featureFlag: "desktopZeroClawWorker",
    registrationSupport: "feature_gated",
    dispatchSupport: "limited",
    supportedRuntimeFamilySchemaVersions: [WORKER_RUNTIME_FAMILY_SCHEMA_VERSION],
    supportedRuntimeProfileSchemaVersions: [WORKER_RUNTIME_PROFILE_SCHEMA_VERSION],
    gatewayCompatibility: null,
  },
  nemoclaw_sandbox: {
    runtimeType: "nemoclaw_sandbox",
    displayName: "NemoClaw Secure Sandbox",
    familyName: "NemoClaw",
    featureFlag: "nemoClawSecureWorkerPool",
    registrationSupport: "admin_gated",
    dispatchSupport: "admin_gated",
    supportedRuntimeFamilySchemaVersions: [WORKER_RUNTIME_FAMILY_SCHEMA_VERSION],
    supportedRuntimeProfileSchemaVersions: [WORKER_RUNTIME_PROFILE_SCHEMA_VERSION],
    gatewayCompatibility: null,
  },
  hiclaw_cluster: {
    runtimeType: "hiclaw_cluster",
    displayName: "HiClaw Collaborative Cluster",
    familyName: "HiClaw",
    featureFlag: "hiClawClusterRuntime",
    registrationSupport: "admin_gated",
    dispatchSupport: "admin_gated",
    supportedRuntimeFamilySchemaVersions: [WORKER_RUNTIME_FAMILY_SCHEMA_VERSION],
    supportedRuntimeProfileSchemaVersions: [WORKER_RUNTIME_PROFILE_SCHEMA_VERSION],
    gatewayCompatibility: null,
  },
  hermes_agent_gateway: {
    runtimeType: "hermes_agent_gateway",
    displayName: "Hermes Agent Gateway",
    familyName: "Hermes",
    featureFlag: "hermesAgentRuntime",
    registrationSupport: "feature_gated",
    dispatchSupport: "limited",
    supportedRuntimeFamilySchemaVersions: [WORKER_RUNTIME_FAMILY_SCHEMA_VERSION],
    supportedRuntimeProfileSchemaVersions: [WORKER_RUNTIME_PROFILE_SCHEMA_VERSION],
    gatewayCompatibility: DEFAULT_HERMES_GATEWAY_COMPATIBILITY,
  },
};

export function getWorkerRuntimeDefinition(runtimeType: WorkerRuntimeType): WorkerRuntimeDefinition {
  return WORKER_RUNTIME_DEFINITIONS[runtimeType];
}

function compareVersionStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function isVersionWithinWindow(
  current: string,
  minVersion: string | null | undefined,
  maxVersion: string | null | undefined,
): boolean {
  if (minVersion && compareVersionStrings(current, minVersion) < 0) {
    return false;
  }
  if (maxVersion && compareVersionStrings(current, maxVersion) > 0) {
    return false;
  }
  return true;
}

function compatibilityReason(
  supported: boolean,
  workerVersion: string,
  supportedVersions: readonly string[],
): string | null {
  if (supported) {
    return null;
  }
  return `Worker reported ${workerVersion}, server supports ${supportedVersions.join(", ")}`;
}

export interface WorkerCompatibilityEvaluationLane {
  compatible: boolean;
  workerVersion: string;
  serverVersion: string;
  supportedVersions: string[];
  reason: string | null;
}

export interface WorkerCompatibilityEvaluation {
  runtimeType: WorkerRuntimeType;
  checkedAt: string;
  compatible: boolean;
  transport: WorkerCompatibilityEvaluationLane;
  runtimeFamily: WorkerCompatibilityEvaluationLane;
  runtimeProfile: WorkerCompatibilityEvaluationLane;
}

export function evaluateWorkerCompatibility(
  runtimeType: WorkerRuntimeType,
  compatibility: WorkerProtocolCompatibility,
): WorkerCompatibilityEvaluation {
  const normalizedCompatibility = workerProtocolCompatibilitySchema.parse(compatibility);
  const definition = getWorkerRuntimeDefinition(runtimeType);
  const transportCompatible =
    normalizedCompatibility.protocolVersion === WORKER_RUNTIME_PROTOCOL_VERSION
    && isVersionWithinWindow(
      WORKER_RUNTIME_PROTOCOL_VERSION,
      normalizedCompatibility.minServerProtocolVersion,
      normalizedCompatibility.maxServerProtocolVersion,
    );
  const runtimeFamilyCompatible =
    definition.supportedRuntimeFamilySchemaVersions.includes(normalizedCompatibility.runtimeFamilySchemaVersion)
    && isVersionWithinWindow(
      WORKER_RUNTIME_FAMILY_SCHEMA_VERSION,
      normalizedCompatibility.minRuntimeFamilySchemaVersion,
      normalizedCompatibility.maxRuntimeFamilySchemaVersion,
    );
  const runtimeProfileCompatible =
    definition.supportedRuntimeProfileSchemaVersions.includes(normalizedCompatibility.runtimeProfileSchemaVersion)
    && isVersionWithinWindow(
      WORKER_RUNTIME_PROFILE_SCHEMA_VERSION,
      normalizedCompatibility.minRuntimeProfileSchemaVersion,
      normalizedCompatibility.maxRuntimeProfileSchemaVersion,
    );

  return {
    runtimeType,
    checkedAt: new Date().toISOString(),
    compatible: transportCompatible && runtimeFamilyCompatible && runtimeProfileCompatible,
    transport: {
      compatible: transportCompatible,
      workerVersion: normalizedCompatibility.protocolVersion,
      serverVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
      supportedVersions: [WORKER_RUNTIME_PROTOCOL_VERSION],
      reason: transportCompatible
        ? null
        : `Worker reported ${normalizedCompatibility.protocolVersion}, server requires ${WORKER_RUNTIME_PROTOCOL_VERSION}`,
    },
    runtimeFamily: {
      compatible: runtimeFamilyCompatible,
      workerVersion: normalizedCompatibility.runtimeFamilySchemaVersion,
      serverVersion: WORKER_RUNTIME_FAMILY_SCHEMA_VERSION,
      supportedVersions: [...definition.supportedRuntimeFamilySchemaVersions],
      reason: compatibilityReason(
        runtimeFamilyCompatible,
        normalizedCompatibility.runtimeFamilySchemaVersion,
        definition.supportedRuntimeFamilySchemaVersions,
      ),
    },
    runtimeProfile: {
      compatible: runtimeProfileCompatible,
      workerVersion: normalizedCompatibility.runtimeProfileSchemaVersion,
      serverVersion: WORKER_RUNTIME_PROFILE_SCHEMA_VERSION,
      supportedVersions: [...definition.supportedRuntimeProfileSchemaVersions],
      reason: compatibilityReason(
        runtimeProfileCompatible,
        normalizedCompatibility.runtimeProfileSchemaVersion,
        definition.supportedRuntimeProfileSchemaVersions,
      ),
    },
  };
}

const videoAssemblyInputRefSourceKindSchema = z.enum([
  "library_asset",
  "authorized_local_path",
  "staged_upload",
]);

const videoAssemblySubtitleSourcePrioritySchema = z.enum([
  "user_provided",
  "system_generated",
  "external_integration",
]);

const videoAssemblySubtitleModeSchema = z.enum([
  "burn_in",
  "soft_mux",
  "none",
]);

const videoAssemblyAspectRatioSchema = z.enum([
  "16:9",
  "9:16",
  "1:1",
  "4:5",
]);

const comfyExpectedOutputTypeSchema = z.enum([
  "images",
  "videos",
  "audio",
  "files",
  "text",
]);

const localFolderIngestWritebackModeSchema = z.enum([
  "read_search_only",
  "managed_output_only",
  "user_confirmed_root_write",
  "advanced_local_override",
]);

export function looksLikeWorkerLocalFilePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

export function isWorkerLoopbackUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.trim().toLowerCase();
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function isWorkerHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeWorkerPolicyPath(value: string): string {
  const trimmed = value.trim();
  const isUncPath = /^[\\/]{2}/.test(trimmed);
  const strippedLeadingSeparators = trimmed.replace(/^[\\/]+/, "");
  const normalizedBody = strippedLeadingSeparators
    .replace(/[\\/]+/g, "\\")
    .replace(/[\\]+$/, "")
    .toLowerCase();

  if (isUncPath) {
    return `\\\\${normalizedBody}`;
  }

  return normalizedBody;
}

export function isWorkerPathWithinAllowedRoots(
  candidatePath: string,
  allowedRoots: readonly string[],
): boolean {
  const normalizedCandidate = normalizeWorkerPolicyPath(candidatePath);
  return allowedRoots.some((root) => {
    const normalizedRoot = normalizeWorkerPolicyPath(root);
    return normalizedCandidate === normalizedRoot
      || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
  });
}

const workerStableHashSchema = z.string().trim().min(8).max(256);
const workerStorageRefSchema = z.string().trim().min(1).max(2_000);
const workerDownloadUrlSchema = z.string().trim().min(1).max(8_192).regex(/^(https?:\/\/|\/).+/);

export const hyperframesFinalCompositeAssetManifestSchema = z.object({
  sourceVideos: z.array(
    z.object({
      shotId: z.string().trim().min(1),
      storageRef: workerStorageRefSchema,
      downloadUrl: workerDownloadUrlSchema.nullable().optional().default(null),
      mediaStartSec: z.number().min(0).max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC).default(0),
      durationSec: z.number().positive().max(HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC),
      contentType: z.string().trim().min(1).default("video/mp4"),
      checksumSha256: z.string().trim().min(8).max(256).nullable().optional().default(null),
    }),
  ).min(1),
  audioRefs: z.array(
    z.object({
      role: z.enum(["source_audio", "music_bed", "sfx", "voiceover"]),
      storageRef: workerStorageRefSchema,
      downloadUrl: workerDownloadUrlSchema.nullable().optional().default(null),
      checksumSha256: z.string().trim().min(8).max(256).nullable().optional().default(null),
    }),
  ).default([]),
  subtitleRefs: z.array(
    z.object({
      shotId: z.string().trim().min(1),
      kind: z.enum(["vtt", "srt", "json"]),
      storageRef: workerStorageRefSchema,
      downloadUrl: workerDownloadUrlSchema.nullable().optional().default(null),
      checksumSha256: z.string().trim().min(8).max(256).nullable().optional().default(null),
    }),
  ).default([]),
  fontRefs: z.array(
    z.object({
      family: z.string().trim().min(1),
      storageRef: workerStorageRefSchema.nullable().optional().default(null),
      required: z.boolean().default(true),
    }),
  ).default([]),
  runtimeAssets: z.record(z.string(), z.unknown()).default({}),
});

export const hyperframesFinalCompositeShotSchema = z.object({
  shotId: z.string().trim().min(1),
  shotIndex: z.number().int().min(0),
  absoluteStartSec: z.number().min(0).max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC),
  absoluteEndSec: z.number().positive().max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC),
  durationSec: z.number().positive().max(HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC),
  mediaStartSec: z.number().min(0).max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC).default(0),
  overlayText: z.string().trim().max(2_000).nullable().optional().default(null),
  subtitleText: z.string().trim().max(8_000).nullable().optional().default(null),
  stylePresetId: z.string().trim().min(1).nullable().optional().default(null),
  transitionPresetId: z.string().trim().min(1).nullable().optional().default(null),
  textMotionPresetId: z.string().trim().min(1).nullable().optional().default(null),
}).superRefine((shot, ctx) => {
  if (shot.absoluteEndSec <= shot.absoluteStartSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["absoluteEndSec"],
      message: "shot absoluteEndSec must be greater than absoluteStartSec",
    });
  }

  const computedDuration = shot.absoluteEndSec - shot.absoluteStartSec;
  if (computedDuration - HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationSec"],
      message: `HyperFrames shots must not exceed ${HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC}s`,
    });
  }
});

export const hyperframesFinalCompositeOutputRequirementsSchema = z.object({
  format: z.literal("mp4").default("mp4"),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
  width: z.number().int().min(360).max(3840).default(1080),
  height: z.number().int().min(360).max(3840).default(1920),
  fps: z.number().int().min(24).max(60).default(30),
  requireOfficialRuntime: z.boolean().default(true),
  rejectFallbackRender: z.boolean().default(true),
  requireCssBrowserRuntime: z.boolean().default(true),
  requireServerVerification: z.boolean().default(true),
  publishToLibrary: z.boolean().default(true),
});

export const hyperframesFinalCompositeWorkerInputSchema = z.object({
  renderIntent: z.literal("hyperframes_final_composite").default("hyperframes_final_composite"),
  compositionHash: workerStableHashSchema,
  timelineHash: workerStableHashSchema,
  finalCompositeConfigHash: workerStableHashSchema,
  templateVersion: z.string().trim().min(1).max(120),
  platformContractVersion: z.string().trim().min(1).max(120),
  rendererPolicyVersion: z.string().trim().min(1).max(120),
  runtimeProfileId: z.string().trim().min(1).max(120),
  source: z.object({
    storyboardReviewId: z.number().int().positive().nullable().optional().default(null),
    productId: z.union([
      z.string().trim().min(1).max(160),
      z.number().int().positive(),
    ]).nullable().optional().default(null),
    manualProjectName: z.string().trim().min(1).max(240).nullable().optional().default(null),
    runId: z.string().trim().min(1).max(180).nullable().optional().default(null),
  }).default({}),
  finalVideoLengthSec: z.number().positive().max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC),
  shots: z.array(hyperframesFinalCompositeShotSchema).min(1).max(60),
  assetManifest: hyperframesFinalCompositeAssetManifestSchema,
  outputRequirements: hyperframesFinalCompositeOutputRequirementsSchema,
  compositionHtml: z.string().trim().min(1).nullable().optional().default(null),
  renderConfig: z.record(z.string(), z.unknown()).default({}),
}).superRefine((payload, ctx) => {
  const assetShotIds = new Set(payload.assetManifest.sourceVideos.map((video) => video.shotId));
  payload.shots.forEach((shot, index) => {
    if (!assetShotIds.has(shot.shotId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shots", index, "shotId"],
        message: "each HyperFrames shot must have a matching source video asset",
      });
    }
    if (shot.absoluteEndSec - payload.finalVideoLengthSec > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shots", index, "absoluteEndSec"],
        message: "shot end time must not exceed finalVideoLengthSec",
      });
    }
  });

  if (!payload.outputRequirements.requireOfficialRuntime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outputRequirements", "requireOfficialRuntime"],
      message: "HyperFrames final composite worker jobs must require the official runtime",
    });
  }
  if (!payload.outputRequirements.rejectFallbackRender) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outputRequirements", "rejectFallbackRender"],
      message: "HyperFrames final composite worker jobs must reject fallback renders",
    });
  }
});

export const hyperframesFinalCompositeProgressPayloadSchema = z.object({
  stage: hyperframesFinalCompositeProgressStageSchema,
  percent: z.number().min(0).max(100),
  message: z.string().trim().max(1_000).nullable().optional().default(null),
  diagnosticsJson: z.record(z.string(), z.unknown()).default({}),
});

export const hyperframesFinalCompositeFailurePayloadSchema = z.object({
  code: hyperframesFinalCompositeFailureCodeSchema,
  message: z.string().trim().min(1).max(2_000),
  recoverable: z.boolean().default(false),
  diagnosticsJson: z.record(z.string(), z.unknown()).default({}),
});

/**
 * `remotion_render_video` worker job contract (Feature 133, Phase 1 MVP,
 * section-03 — `specs/feature/133-content-video-intelligence-platform/spec.md`
 * §6) — MOVED into `@smartspec/remotion-render` (2026-07-30,
 * worker-app-remotion-render-video P1): the `apps/worker-app` Remotion
 * sidecar bundles ONLY that package (no dependency on `apps/web` at all), so
 * this file was never importable from the sidecar bundle. Re-exported here
 * (never re-declared) for this file's existing importers
 * (`workerSchedulerService.ts`, `workerRegistryService.ts`,
 * `hyperframesRenderWorker.ts`, etc.) — see
 * `packages/remotion-render/src/remotionRenderVideoSchema.ts` for the actual
 * schema/constants and its doc comment for the one documented exception
 * (the `captionPresetId` enum's 10 literal values are a narrow, cross-referenced
 * duplicate of `HyperframesFinalCompositeSubtitlePresetSchema` below, since
 * that module cannot be imported from the package).
 *
 * IMPORTANT — import from the `/render-video-schema` subpath, NOT
 * `/render-video-job`. This file is reachable from CLIENT code, and the
 * job entry bundles the Node orchestrator (`node:fs`/`node:path`/
 * `node:child_process`); pulling it into the browser graph breaks the Vite
 * build with `"join" is not exported by "__vite-browser-external"` (field
 * incident 2026-07-30). The schema bundle is built `platform: "neutral"`
 * so it can never regain a Node import silently.
 */
export {
  REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
  REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
  REMOTION_RENDER_VIDEO_FAILURE_CODES,
  REMOTION_RENDER_VIDEO_MAX_ATTEMPTS,
  REMOTION_RENDER_VIDEO_RETRY_BACKOFF_MS,
  REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS,
  REMOTION_RENDER_VIDEO_QUEUED_TTL_MS,
  REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  remotionRenderVideoProgressStageSchema,
  remotionRenderVideoFailureCodeSchema,
  remotionRenderVideoCapabilityFamilySchema,
  remotionRenderVideoWorkerInputSchema,
} from "@smartspec/remotion-render/render-video-schema";
export type {
  RemotionRenderVideoProgressStage,
  RemotionRenderVideoFailureCode,
  RemotionRenderVideoCapabilityFamily,
  RemotionRenderVideoWorkerInput,
} from "@smartspec/remotion-render/render-video-schema";

export const localAiProviderConfigSchema = z.object({
  providerId: localAiProviderSchema,
  baseUrl: z.string().url(),
  model: z.string().trim().min(1).max(240),
  localOnly: z.boolean().default(true),
  readiness: z.enum(["unknown", "ready", "blocked", "unavailable"]).default("unknown"),
  timeoutSeconds: z.number().int().min(5).max(3_600).default(600),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
}).superRefine((payload, ctx) => {
  if (payload.localOnly && !isWorkerLoopbackUrl(payload.baseUrl)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["baseUrl"],
      message: "Local AI worker providers must use a loopback baseUrl unless localOnly is explicitly disabled by a future policy gate",
    });
  }
});

export const localAiWorkerJobContractSchema = z.object({
  family: localAiWorkerJobFamilySchema,
  provider: localAiProviderConfigSchema,
  input: z.object({
    prompt: z.string().trim().min(1).max(24_000),
    textContext: z.string().trim().max(24_000).nullable().optional().default(null),
    imageRefs: z.array(
      z.object({
        storageRef: workerStorageRefSchema,
        mimeType: z.string().trim().min(1).max(120).default("image/png"),
        checksumSha256: z.string().trim().min(8).max(256).nullable().optional().default(null),
      }),
    ).default([]),
    metadataJson: z.record(z.string(), z.unknown()).default({}),
  }),
  outputTargets: z.object({
    publishTextResult: z.boolean().default(true),
    publishJsonResult: z.boolean().default(true),
    publishArtifactsToLibrary: z.boolean().default(false),
    requireServerVerification: z.boolean().default(true),
  }).default({}),
  safety: z.object({
    moderationRequired: z.boolean().default(false),
    allowLocalModelWithoutCloudModeration: z.boolean().default(false),
    safetyMetadataRequired: z.boolean().default(false),
  }).default({}),
}).superRefine((payload, ctx) => {
  if ((payload.family === "local_ai_vision" || payload.family === "local_ai_multimodal")
    && payload.input.imageRefs.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["input", "imageRefs"],
      message: `${payload.family} jobs require at least one imageRef`,
    });
  }
  if (!payload.outputTargets.publishTextResult
    && !payload.outputTargets.publishJsonResult
    && !payload.outputTargets.publishArtifactsToLibrary) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outputTargets"],
      message: "local AI worker jobs must publish at least one output target",
    });
  }
});

export const mcpWorkerCompletionPayloadSchema = z.object({
  workerJobId: z.string().trim().min(1),
  leaseOwnerToken: z.string().trim().min(1),
  assignmentAttempt: z.string({
    required_error: "assignmentAttempt is required for MCP worker completion",
  }).trim().min(1, "assignmentAttempt is required for MCP worker completion"),
  status: z.enum(["completed", "failed", "canceled"]).default("completed"),
  outputJson: z.record(z.string(), z.unknown()).default({}),
  failure: z.object({
    code: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(2_000),
    recoverable: z.boolean().default(false),
  }).nullable().optional().default(null),
  artifacts: z.array(
    z.object({
      artifactType: z.string().trim().min(1).max(120),
      storageRef: workerStorageRefSchema,
      checksumSha256: z.string().trim().min(8).max(256).nullable().optional().default(null),
      metadataJson: z.record(z.string(), z.unknown()).default({}),
    }),
  ).default([]),
});

export const videoAssemblyJobContractSchema = z.object({
  inputRefs: z.array(
    z.object({
      sourceKind: videoAssemblyInputRefSourceKindSchema,
      refId: z.string().min(1).optional(),
      path: z.string().min(1).optional(),
    }).superRefine((inputRef, ctx) => {
      if (inputRef.sourceKind === "library_asset" && !inputRef.refId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "library_asset input refs require refId",
        });
      }
      if (inputRef.sourceKind !== "library_asset" && !inputRef.path) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${inputRef.sourceKind} input refs require path`,
        });
      }
    }),
  ).min(1),
  editPlan: z.object({
    clips: z.array(
      z.object({
        sourceRef: z.string().min(1),
        trim: z.object({
          startMs: z.number().int().min(0),
          endMs: z.number().int().min(0),
        }),
      }),
    ).min(1),
    applyWatermark: z.boolean().default(false),
  }),
  subtitlePlan: z.object({
    sourcePriority: videoAssemblySubtitleSourcePrioritySchema,
    mode: videoAssemblySubtitleModeSchema,
    transcriptRef: z.string().min(1).optional(),
    subtitleRef: z.string().min(1).optional(),
  }),
  renderProfile: z.object({
    aspectRatios: z.array(videoAssemblyAspectRatioSchema).min(1),
    codecPreset: z.string().min(1),
    qualityPreset: z.string().min(1),
    gpuRequired: z.boolean().default(false),
  }),
  workspacePolicy: z.object({
    mode: workerFileScopeModeSchema,
    allowedSourceRoots: z.array(z.string().min(1)).min(1),
  }),
  outputTargets: z.object({
    renderedAssets: z.array(
      z.object({
        label: z.string().min(1),
        aspectRatio: videoAssemblyAspectRatioSchema,
        publishToLibrary: z.boolean().default(true),
      }),
    ).min(1),
    subtitlesOptional: z.boolean().default(false),
    thumbnailsOptional: z.boolean().default(false),
  }),
}).superRefine((payload, ctx) => {
  const declaredSourceRefs = new Set<string>();
  for (const inputRef of payload.inputRefs) {
    if (inputRef.refId) {
      declaredSourceRefs.add(inputRef.refId);
    }
    if (inputRef.path) {
      declaredSourceRefs.add(inputRef.path);
    }
  }

  payload.editPlan.clips.forEach((clip, index) => {
    if (!declaredSourceRefs.has(clip.sourceRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editPlan", "clips", index, "sourceRef"],
        message: "clip sourceRef must match a declared inputRef path or refId",
      });
    }
  });

  for (const [field, value] of [
    ["transcriptRef", payload.subtitlePlan.transcriptRef],
    ["subtitleRef", payload.subtitlePlan.subtitleRef],
  ] as const) {
    if (!value || !looksLikeWorkerLocalFilePath(value)) {
      continue;
    }
    if (!isWorkerPathWithinAllowedRoots(value, payload.workspacePolicy.allowedSourceRoots)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subtitlePlan", field],
        message: `${field} must stay inside an approved source root when using a local file path`,
      });
    }
  }
});

/**
 * `vertical_drama_ffmpeg_assembly` worker job contract (Vertical Drama Render
 * Queue plan, `planning/vertical-drama-render-queue/plan.md` §4.1). This job
 * type offloads the four pure-ffmpeg VD render operations (single
 * Sub-Episode, Production-Episode group, season batch, trailer) off the web
 * server's request path into the existing `worker_jobs` queue.
 *
 * Unlike `remotionRenderVideoWorkerInputSchema` / `videoAssemblyJobContractSchema`
 * (both `.strict()`), this contract is deliberately an "enqueue-time
 * resolution" envelope: the caller (a VD router mutation) resolves the full
 * internal render feed on the request path exactly as it does today, then
 * carries it as an opaque `renderFeed` blob. The executor (a later wave)
 * re-hydrates it and calls the existing `runAssemblyJob` machinery verbatim
 * — this schema only needs to validate the envelope (kind/owner/display),
 * never the complex internal render-feed shape, so it is NOT `.strict()`
 * on `renderFeed`.
 *
 * `VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES` is a distinct,
 * non-shared capability family (never `ffmpeg-probe`/`video-edit`, which are
 * shared by Remotion/Hyperframes/`video_assembly` workers) so the `.every()`
 * superset claim gate (`workerJobMatchesSelection`,
 * `server/services/workerSchedulerService.ts`) keeps this job type isolated
 * from those other worker pools.
 */
export const VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE =
  "vertical_drama_ffmpeg_assembly" as const;

export const VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES = [
  "vertical-drama-ffmpeg-assembly",
] as const;

export const VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CONTRACT_VERSION = 1 as const;

export type VerticalDramaFfmpegAssemblyCapabilityFamily =
  (typeof VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES)[number];

export const verticalDramaFfmpegAssemblyJobContractSchema = z.object({
  kind: z.enum([
    "sub_episode",
    "production_episode_group",
    "season_sub_episode",
    "trailer",
  ]),
  owner: z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    seriesId: z.string().min(1),
    episodeId: z.string().optional(),
  }),
  display: z.object({
    label: z.string().optional(),
    seriesTitle: z.string().optional(),
    episodeNumber: z.number().optional(),
    groupIndex: z.number().optional(),
  }).optional(),
  // Opaque internal render-feed blob (verticalDramaEpisodeVideoAssembly.ts's
  // `runAssemblyJob` input) — resolved on the request path by the caller and
  // re-hydrated verbatim by the executor. Not re-validated here (see
  // doc-comment above); every existing render-feed shape round-trips through
  // `z.record(z.string(), z.unknown())` unchanged.
  renderFeed: z.record(z.string(), z.unknown()),
  contractVersion: z.literal(1).default(1),
});

export type VerticalDramaFfmpegAssemblyJobContract = z.infer<
  typeof verticalDramaFfmpegAssemblyJobContractSchema
>;

export const localFolderIngestJobContractSchema = z.object({
  roots: z.array(
    z.object({
      rootId: z.string().min(1),
      name: z.string().min(1),
      path: z.string().min(1),
      requestedWritebackMode: localFolderIngestWritebackModeSchema.optional().default("managed_output_only"),
      advancedLocalMode: z.boolean().default(false),
    }),
  ).min(1).max(20),
  workspacePolicy: z.object({
    mode: workerFileScopeModeSchema,
    allowedSourceRoots: z.array(z.string().min(1)).min(1),
  }),
  ingestPolicy: z.object({
    maxDepth: z.number().int().min(1).max(12).default(5),
    maxFiles: z.number().int().min(1).max(1000).default(250),
    includePreviewText: z.boolean().default(true),
    previewFileLimit: z.number().int().min(0).max(100).default(25),
    snippetQuery: z.string().trim().min(1).max(200).optional(),
    snippetFileLimit: z.number().int().min(0).max(50).default(10),
  }),
  outputTargets: z.object({
    publishManifestToLibrary: z.boolean().default(true),
    publishSummaryToLibrary: z.boolean().default(true),
    triggerIndexing: z.boolean().default(true),
  }),
}).superRefine((payload, ctx) => {
  const seenRootIds = new Set<string>();
  const seenNormalizedPaths = new Set<string>();

  payload.roots.forEach((root, index) => {
    if (seenRootIds.has(root.rootId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roots", index, "rootId"],
        message: "rootId values must be unique within a local_folder_ingest request",
      });
    } else {
      seenRootIds.add(root.rootId);
    }

    if (!isWorkerPathWithinAllowedRoots(root.path, payload.workspacePolicy.allowedSourceRoots)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roots", index, "path"],
        message: "local_folder_ingest root paths must stay inside an approved source root",
      });
    }

    const normalizedPath = normalizeWorkerPolicyPath(root.path);
    if (seenNormalizedPaths.has(normalizedPath)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roots", index, "path"],
        message: "Duplicate local_folder_ingest root paths are not allowed",
      });
    } else {
      seenNormalizedPaths.add(normalizedPath);
    }
  });

  if (!payload.outputTargets.publishManifestToLibrary && !payload.outputTargets.publishSummaryToLibrary) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outputTargets"],
      message: "local_folder_ingest must publish at least one artifact target",
    });
  }
});

const comfyServiceBindingSchema = z.object({
  baseUrl: z.string().url(),
  submitPath: z.string().min(1).default("/prompt"),
  historyPathTemplate: z.string().min(1).default("/history/{promptId}"),
  viewPath: z.string().min(1).default("/view"),
  clientId: z.string().trim().min(1).max(128).nullable().optional().default(null),
  pollIntervalMs: z.number().int().min(250).max(30_000).default(2_000),
  timeoutSeconds: z.number().int().min(5).max(3_600).default(600),
  localOnly: z.boolean().default(true),
}).superRefine((payload, ctx) => {
  if (payload.localOnly && !isWorkerLoopbackUrl(payload.baseUrl)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["baseUrl"],
      message: "ComfyUI local-only services must bind to a loopback baseUrl",
    });
  }

  for (const [field, value] of [
    ["submitPath", payload.submitPath],
    ["historyPathTemplate", payload.historyPathTemplate],
    ["viewPath", payload.viewPath],
  ] as const) {
    if (!value.startsWith("/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} must begin with /`,
      });
    }
  }

  if (!payload.historyPathTemplate.includes("{promptId}")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["historyPathTemplate"],
      message: "historyPathTemplate must include the {promptId} placeholder",
    });
  }
});

export const comfyImageGenerationJobContractSchema = z.object({
  service: comfyServiceBindingSchema,
  workflowJson: z.record(z.string(), z.unknown()),
  generationSpec: z.object({
    promptSummary: z.string().trim().min(1).max(4_000),
    negativePromptSummary: z.string().trim().max(4_000).nullable().optional().default(null),
    width: z.number().int().min(64).max(4_096).default(1_024),
    height: z.number().int().min(64).max(4_096).default(1_024),
    batchSize: z.number().int().min(1).max(8).default(1),
    steps: z.number().int().min(1).max(200).default(30),
    cfgScale: z.number().min(0.1).max(50).default(7),
    samplerName: z.string().trim().min(1).max(100).default("euler"),
    seed: z.number().int().min(0).nullable().optional().default(null),
    modelCheckpoint: z.string().trim().min(1).max(200).nullable().optional().default(null),
    gpuRequired: z.boolean().default(true),
  }),
  outputTargets: z.object({
    publishImagesToLibrary: z.boolean().default(true),
    publishManifestToLibrary: z.boolean().default(true),
    triggerIndexing: z.boolean().default(true),
    maxImages: z.number().int().min(1).max(32).default(8),
  }),
}).superRefine((payload, ctx) => {
  if (Object.keys(payload.workflowJson).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["workflowJson"],
      message: "comfy_image_generation requires a non-empty workflowJson payload",
    });
  }

  if (!payload.outputTargets.publishImagesToLibrary && !payload.outputTargets.publishManifestToLibrary) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outputTargets"],
      message: "comfy_image_generation must publish at least one artifact target",
    });
  }
});

export const comfyWorkflowRunJobContractSchema = z.object({
  service: comfyServiceBindingSchema,
  workflowJson: z.record(z.string(), z.unknown()),
  workflowLabel: z.string().trim().min(1).max(200).nullable().optional().default(null),
  executionPolicy: z.object({
    expectedOutputTypes: z.array(comfyExpectedOutputTypeSchema).min(1).max(5).default(["images"]),
    gpuRequired: z.boolean().default(true),
    failOnMissingOutputs: z.boolean().default(true),
  }),
  outputTargets: z.object({
    publishOutputFilesToLibrary: z.boolean().default(true),
    publishManifestToLibrary: z.boolean().default(true),
    triggerIndexing: z.boolean().default(true),
    maxOutputFiles: z.number().int().min(1).max(64).default(16),
  }),
}).superRefine((payload, ctx) => {
  if (Object.keys(payload.workflowJson).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["workflowJson"],
      message: "comfy_workflow_run requires a non-empty workflowJson payload",
    });
  }

  if (
    !payload.outputTargets.publishOutputFilesToLibrary
    && !payload.outputTargets.publishManifestToLibrary
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outputTargets"],
      message: "comfy_workflow_run must publish at least one artifact target",
    });
  }
});

function validateWorkerRuntimeMetadata(
  runtimeType: WorkerRuntimeType,
  workerMode: WorkerMode,
  runtimeMetadataJson: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  if (runtimeType === "desktop_zeroclaw_managed") {
    const parsed = workerDesktopRuntimeMetadataSchema.safeParse(runtimeMetadataJson);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["runtimeMetadataJson", ...issue.path],
        });
      }
      return;
    }
    if (
      (workerMode === "shared_department" || workerMode === "dedicated_gpu")
      && parsed.data.executionIdentity.mode !== "service_identity"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runtimeMetadataJson", "executionIdentity", "mode"],
        message: "Shared or dedicated desktop workers must use service identity execution mode",
      });
    }
    return;
  }

  if (runtimeType === "nemoclaw_sandbox") {
    const parsed = workerNemoClawRuntimeMetadataSchema.safeParse(runtimeMetadataJson);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["runtimeMetadataJson", ...issue.path],
        });
      }
    }
    return;
  }

  if (runtimeType === "hiclaw_cluster") {
    const parsed = workerHiClawRuntimeMetadataSchema.safeParse(runtimeMetadataJson);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["runtimeMetadataJson", ...issue.path],
        });
      }
    }
    return;
  }

  if (runtimeType === "hermes_agent_gateway") {
    const parsed = workerHermesRuntimeMetadataSchema.safeParse(runtimeMetadataJson);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["runtimeMetadataJson", ...issue.path],
        });
      }
      return;
    }

    if (
      parsed.data.apiServerBaseUrl
      && !isWorkerLoopbackUrl(parsed.data.apiServerBaseUrl)
      && !parsed.data.remoteEndpointPolicyExceptionId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runtimeMetadataJson", "apiServerBaseUrl"],
        message: "Hermes bridge apiServerBaseUrl must default to a loopback address unless remoteEndpointPolicyExceptionId grants an audited exception",
      });
    }
    if (
      parsed.data.apiServerBaseUrl
      && !isWorkerLoopbackUrl(parsed.data.apiServerBaseUrl)
      && parsed.data.remoteEndpointPolicyExceptionId
      && !isWorkerHttpsUrl(parsed.data.apiServerBaseUrl)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runtimeMetadataJson", "apiServerBaseUrl"],
        message: "Hermes bridge remote API server URLs must use https when an audited exception is granted",
      });
    }
  }
}

export type WorkerProtocolCompatibility = z.infer<typeof workerProtocolCompatibilitySchema>;
export type WorkerRegistrationPayload = z.infer<typeof workerRegistrationPayloadSchema>;
export type WorkerHeartbeatPayload = z.infer<typeof workerHeartbeatPayloadSchema>;
export type WorkerClaimRequest = z.infer<typeof workerClaimRequestSchema>;
export type WorkerJobEventPayload = z.infer<typeof workerJobEventPayloadSchema>;
export type WorkerArtifactInitPayload = z.infer<typeof workerArtifactInitPayloadSchema>;
export type WorkerArtifactCompletePayload = z.infer<typeof workerArtifactCompletePayloadSchema>;
export type WorkerDiagnosticsPayload = z.infer<typeof workerDiagnosticsPayloadSchema>;
export type WorkerGatewayCompatibilityMetadata = z.infer<typeof workerGatewayCompatibilityMetadataSchema>;
export type HyperframesFinalCompositeAssetManifest =
  z.infer<typeof hyperframesFinalCompositeAssetManifestSchema>;
export type HyperframesFinalCompositeWorkerInput =
  z.infer<typeof hyperframesFinalCompositeWorkerInputSchema>;
export type HyperframesFinalCompositeProgressPayload =
  z.infer<typeof hyperframesFinalCompositeProgressPayloadSchema>;
export type HyperframesFinalCompositeFailurePayload =
  z.infer<typeof hyperframesFinalCompositeFailurePayloadSchema>;
export type VideoAssemblyJobContract = z.infer<typeof videoAssemblyJobContractSchema>;
export type LocalFolderIngestJobContract = z.infer<typeof localFolderIngestJobContractSchema>;
export type ComfyImageGenerationJobContract = z.infer<typeof comfyImageGenerationJobContractSchema>;
export type ComfyWorkflowRunJobContract = z.infer<typeof comfyWorkflowRunJobContractSchema>;
export type LocalAiProviderConfig = z.infer<typeof localAiProviderConfigSchema>;
export type LocalAiWorkerJobContract = z.infer<typeof localAiWorkerJobContractSchema>;

/**
 * Feature 135 — Hermes Grok media worker (namespace: `hermes_media` /
 * `hermesMedia`). NOT related to the pre-existing agent-gateway Hermes lane
 * (`queueHermesWorkerJob`, tenant flag `hermesAgentRuntime`, job type
 * `external_agent_task` — all in `server/services/workerSchedulerService.ts`
 * / `shared/featureFlags.ts`). See
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts` for the
 * grep-style guard that enforces this separation across the whole feature.
 *
 * `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY` follows the same claim-capability
 * precedent as the Remotion render worker (`REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES`
 * above): section 05 wires it into `claimWorkerJob` so only a worker that
 * declares the `hermes_media` capability (and the `hermes-media-generation`
 * family) can claim these five job types.
 */
export const HERMES_MEDIA_IMAGE_JOB_TYPE = "hermes_media_image_generate" as const;
export const HERMES_MEDIA_VIDEO_JOB_TYPE = "hermes_media_video_generate" as const;
export const HERMES_CONNECTION_AUTH_JOB_TYPE = "hermes_connection_authorize" as const;
export const HERMES_CONNECTION_PROBE_JOB_TYPE = "hermes_connection_probe" as const;
export const HERMES_CONNECTION_DISCONNECT_JOB_TYPE = "hermes_connection_disconnect" as const;
export const HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY = "hermes_media" as const;
export const HERMES_MEDIA_CAPABILITY_FAMILIES = ["hermes-media-generation"] as const;

export type HermesMediaCapabilityFamily = (typeof HERMES_MEDIA_CAPABILITY_FAMILIES)[number];
export const hermesMediaCapabilityFamilySchema = z.enum(HERMES_MEDIA_CAPABILITY_FAMILIES);
export type McpWorkerCompletionPayload = z.infer<typeof mcpWorkerCompletionPayloadSchema>;
