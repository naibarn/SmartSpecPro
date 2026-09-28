import { assertCanonicalProject, type CanonicalNleProject, type ManagedAssetRef } from "./nleProject";

export const MEDIA_JOB_PROTOCOL = "smartaihub.media.job" as const;
export const MEDIA_JOB_VERSION = "1.0" as const;

export const MEDIA_OPERATIONS = [
  "media.probe",
  "media.proxy",
  "media.waveform",
  "media.thumbnail",
  "media.analysis",
  "media.silence_detect",
  "media.reframe",
  "media.composition_scan",
  "media.speaker_scan",
  "media.transcribe",
  "media.align",
  "media.audio_mix",
  "media.audio_extract",
  "media.audio_export",
  "media.ai_music",
  "media.ai_media_studio",
  "media.privacy_track",
  "media.recording_normalize",
  "video.render_still",
  "video.render",
] as const;
export type MediaOperation = (typeof MEDIA_OPERATIONS)[number];
export const MEDIA_ANALYSIS_KINDS = ["silence_detect", "reframe", "composition_scan", "speaker_scan", "transcribe", "align", "audio_mix"] as const;

/**
 * Claim-time capability token for one editor operation.  The protocol token
 * remains a compatibility marker, while this token prevents a Worker from
 * claiming a job it cannot actually execute (for example an AI adapter job
 * on an FFmpeg-only installation).
 */
export function mediaOperationClaimCapability(operation: MediaOperation): string {
  return `editor-media-operation-${operation.replaceAll(".", "-")}`;
}

export type FailureCategory =
  | "validation" | "authorization" | "capability" | "asset" | "execution"
  | "verification" | "upload" | "publication" | "cancellation" | "timeout"
  | "lease-lost" | "lease_lost" | "stale_revision";

export const MEDIA_JOB_STATUSES = ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing", "completed", "failed", "canceled", "expired"] as const;
export type MediaJobStatus = (typeof MEDIA_JOB_STATUSES)[number];
const MEDIA_JOB_TRANSITIONS: Readonly<Record<MediaJobStatus, readonly MediaJobStatus[]>> = {
  queued: ["claimed", "canceled", "expired"],
  claimed: ["preparing", "failed", "expired"],
  preparing: ["running", "failed", "canceled", "expired"],
  running: ["uploading", "failed", "canceled", "expired"],
  uploading: ["publishing", "failed", "canceled", "expired"],
  publishing: ["indexing", "completed", "failed"],
  indexing: ["completed", "failed"],
  completed: [],
  failed: [],
  canceled: [],
  expired: [],
};

export function canTransitionMediaJobStatus(from: MediaJobStatus, to: MediaJobStatus): boolean {
  return MEDIA_JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface MediaJobEnvelope {
  protocol: typeof MEDIA_JOB_PROTOCOL;
  version: typeof MEDIA_JOB_VERSION;
  jobId: string;
  tenantId: string;
  projectId?: string;
  revisionId?: string;
  timelineVersion?: number;
  traceId?: string;
  contractHash?: string;
  protectionIntent?: {
    choice: "on" | "off";
    choiceSource?: "per_export" | "user_default" | "disabled_by_user";
    requireBeforePublish?: boolean;
  };
  analysisKind?: string;
  operation: MediaOperation;
  /** Operation-discriminated, server-validated settings. Never contains local paths or secrets. */
  options?: Record<string, unknown>;
  inputs: {
    assets: ManagedAssetRef[];
    project?: CanonicalNleProject;
    /** Optional media-kind hints used by headless workers when a signed URL
     * does not preserve the source file extension. */
    assetKinds?: Record<string, "video" | "audio" | "image">;
  };
  plan: {
    planHash: string;
    profileVersion: string;
    stages: Array<{ id: string; operation: string; dependsOn: string[] }>;
    outputRoles: string[];
  };
  requirements: { capabilities: string[]; resourceProfile: string; maxDurationSeconds?: number };
  retry: { maxAttempts: number; backoffSeconds: number };
  billing: { required: boolean; estimateCredits: number };
  /** Server/worker execution metadata; excluded from contract identity. */
  attempt?: number;
  lease?: { ownerToken?: string; expiresAt?: string };
  renewedUrls?: Record<string, string>;
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const ASSET_NAMESPACES = new Set<ManagedAssetRef["namespace"]>(["media_asset", "library_item", "worker_artifact"]);

export function validateMediaJobEnvelope(value: unknown): MediaJobEnvelope {
  if (!value || typeof value !== "object") throw new Error("MEDIA_JOB_INVALID");
  const envelope = value as Partial<MediaJobEnvelope>;
  const allowedKeys = new Set(["protocol", "version", "jobId", "tenantId", "projectId", "revisionId", "timelineVersion", "traceId", "contractHash", "protectionIntent", "analysisKind", "operation", "options", "inputs", "plan", "requirements", "retry", "billing", "attempt", "lease", "renewedUrls"]);
  const unknownKey = Object.keys(value as Record<string, unknown>).find((key) => !allowedKeys.has(key));
  if (unknownKey) throw new Error(`MEDIA_JOB_UNKNOWN_FIELD:${unknownKey}`);
  if (envelope.protocol !== MEDIA_JOB_PROTOCOL || envelope.version !== MEDIA_JOB_VERSION) {
    throw new Error("MEDIA_JOB_VERSION_UNSUPPORTED");
  }
  if (!envelope.jobId || !SAFE_ID.test(envelope.jobId) || !envelope.tenantId || !SAFE_ID.test(envelope.tenantId)) {
    throw new Error("MEDIA_JOB_ID_INVALID");
  }
  if ((envelope.projectId !== undefined && !SAFE_ID.test(envelope.projectId)) || (envelope.revisionId !== undefined && !SAFE_ID.test(envelope.revisionId))) {
    throw new Error("MEDIA_JOB_ID_INVALID");
  }
  if ((envelope.timelineVersion !== undefined && (!Number.isSafeInteger(envelope.timelineVersion) || envelope.timelineVersion < 0)) || (envelope.traceId !== undefined && !SAFE_ID.test(envelope.traceId)) || (envelope.contractHash !== undefined && !SAFE_ID.test(envelope.contractHash)) || (envelope.analysisKind !== undefined && !MEDIA_ANALYSIS_KINDS.includes(envelope.analysisKind as (typeof MEDIA_ANALYSIS_KINDS)[number]))) {
    throw new Error("MEDIA_JOB_ID_INVALID");
  }
  if (envelope.operation === "media.analysis" && !envelope.analysisKind) throw new Error("MEDIA_OPERATION_UNSUPPORTED");
  if (!envelope.operation || !MEDIA_OPERATIONS.includes(envelope.operation)) {
    throw new Error("MEDIA_OPERATION_UNSUPPORTED");
  }
  if (envelope.attempt !== undefined && (!Number.isInteger(envelope.attempt) || envelope.attempt < 1)) {
    throw new Error("MEDIA_JOB_EXECUTION_METADATA_INVALID");
  }
  if (envelope.renewedUrls !== undefined && (typeof envelope.renewedUrls !== "object" || envelope.renewedUrls === null || Array.isArray(envelope.renewedUrls) || Object.values(envelope.renewedUrls).some(url => typeof url !== "string" || !/^https:\/\//i.test(url)))) {
    throw new Error("MEDIA_JOB_EXECUTION_METADATA_INVALID");
  }
  if (envelope.options !== undefined && (typeof envelope.options !== "object" || envelope.options === null || Array.isArray(envelope.options))) {
    throw new Error("MEDIA_JOB_OPTIONS_INVALID");
  }
  if (envelope.protectionIntent !== undefined) {
    const intent = envelope.protectionIntent;
    if (!intent || typeof intent !== "object" || Array.isArray(intent) || !["on", "off"].includes(intent.choice)) {
      throw new Error("MEDIA_JOB_PROTECTION_INVALID");
    }
    if (intent.choiceSource !== undefined && !["per_export", "user_default", "disabled_by_user"].includes(intent.choiceSource)) {
      throw new Error("MEDIA_JOB_PROTECTION_INVALID");
    }
    if (intent.requireBeforePublish !== undefined && typeof intent.requireBeforePublish !== "boolean") {
      throw new Error("MEDIA_JOB_PROTECTION_INVALID");
    }
  }
  // Renewed signed URLs are short-lived execution metadata. They are allowed
  // only in this server-injected field and remain excluded from the immutable
  // contract hash; URLs in project/input data are rejected before deeper shape
  // validation so the failure category stays security-specific.
  const { renewedUrls: _renewedUrls, ...contractInput } = value as Record<string, unknown>;
  void _renewedUrls;
  const serialized = JSON.stringify(contractInput);
  if (/https?:\/\/|(?:^|[\\/])(?:home|Users|tmp|var)(?:[\\/])|(?:^|[\\/])\.\.(?:[\\/])|<script|child_process/i.test(serialized)) {
    throw new Error("MEDIA_JOB_UNSAFE_INPUT");
  }
  if (!envelope.inputs || !Array.isArray(envelope.inputs.assets) || !envelope.plan) {
    throw new Error("MEDIA_JOB_INVALID");
  }
  if (envelope.inputs.assetKinds !== undefined && (
    typeof envelope.inputs.assetKinds !== "object" ||
    envelope.inputs.assetKinds === null ||
    Array.isArray(envelope.inputs.assetKinds) ||
    Object.entries(envelope.inputs.assetKinds).some(([id, kind]) =>
      !SAFE_ID.test(id) || !["video", "audio", "image"].includes(kind as string),
    )
  )) {
    throw new Error("MEDIA_JOB_ASSET_INVALID");
  }
  if (envelope.inputs.assets.some(asset => !asset || !ASSET_NAMESPACES.has(asset.namespace) || (typeof asset.id !== "string" && (!Number.isSafeInteger(asset.id) || asset.id <= 0)) || (typeof asset.id === "string" && !SAFE_ID.test(asset.id)))) {
    throw new Error("MEDIA_JOB_ASSET_INVALID");
  }
  if (envelope.inputs.project !== undefined) {
    try {
      assertCanonicalProject(envelope.inputs.project);
    } catch {
      throw new Error("MEDIA_JOB_PROJECT_INVALID");
    }
  }
  if (!SAFE_ID.test(envelope.plan.planHash) || !SAFE_ID.test(envelope.plan.profileVersion) || !Array.isArray(envelope.plan.stages) || !Array.isArray(envelope.plan.outputRoles) || envelope.plan.outputRoles.length === 0 || envelope.plan.outputRoles.some(role => !SAFE_ID.test(role)) || new Set(envelope.plan.outputRoles).size !== envelope.plan.outputRoles.length || envelope.plan.stages.some(stage => !stage || !SAFE_ID.test(stage.id) || !MEDIA_OPERATIONS.includes(stage.operation as MediaOperation) || !Array.isArray(stage.dependsOn) || stage.dependsOn.some(dep => !SAFE_ID.test(dep)))) {
    throw new Error("MEDIA_JOB_PLAN_INVALID");
  }
  const stageIds = new Set(envelope.plan.stages.map((stage) => stage.id));
  if (stageIds.size !== envelope.plan.stages.length || envelope.plan.stages.some((stage) => stage.dependsOn.some((dependency) => dependency === stage.id || !stageIds.has(dependency)))) {
    throw new Error("MEDIA_JOB_PLAN_INVALID");
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stagesById = new Map(envelope.plan.stages.map((stage) => [stage.id, stage]));
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const stage = stagesById.get(id);
    if (!stage) return false;
    visiting.add(id);
    for (const dependency of stage.dependsOn) if (!visit(dependency)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  if (envelope.plan.stages.some((stage) => !visit(stage.id))) throw new Error("MEDIA_JOB_PLAN_INVALID");
  if (!envelope.requirements || !Array.isArray(envelope.requirements.capabilities) || envelope.requirements.capabilities.some(capability => typeof capability !== "string" || !SAFE_ID.test(capability)) || typeof envelope.requirements.resourceProfile !== "string" || !SAFE_ID.test(envelope.requirements.resourceProfile)) {
    throw new Error("MEDIA_JOB_REQUIREMENTS_INVALID");
  }
  if (envelope.requirements.maxDurationSeconds !== undefined && (!Number.isFinite(envelope.requirements.maxDurationSeconds) || envelope.requirements.maxDurationSeconds <= 0)) {
    throw new Error("MEDIA_JOB_REQUIREMENTS_INVALID");
  }
  if (!envelope.retry || !Number.isInteger(envelope.retry.maxAttempts) || envelope.retry.maxAttempts < 0 || !Number.isFinite(envelope.retry.backoffSeconds) || envelope.retry.backoffSeconds < 0 || !envelope.billing || typeof envelope.billing.required !== "boolean" || !Number.isFinite(envelope.billing.estimateCredits) || envelope.billing.estimateCredits < 0) {
    throw new Error("MEDIA_JOB_POLICY_INVALID");
  }
  return envelope as MediaJobEnvelope;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
}

/** Stable representation excludes execution metadata and the self-referential hash field. */
export function immutableMediaJobDocument(envelope: MediaJobEnvelope): string {
  const { attempt, lease, renewedUrls, contractHash, ...contract } = envelope as MediaJobEnvelope & Record<string, unknown>;
  void attempt; void lease; void renewedUrls; void contractHash;
  return JSON.stringify(sortValue(contract));
}

export async function computeMediaContractHash(envelope: MediaJobEnvelope): Promise<string> {
  const bytes = new TextEncoder().encode(immutableMediaJobDocument(envelope));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
