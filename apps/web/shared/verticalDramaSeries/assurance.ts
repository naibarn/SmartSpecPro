import { z } from "zod";
import {
  OrchestraRuntimeBudgetSchema,
  OrchestraTaskKindSchema,
  type OrchestraRuntimeBudget,
  type OrchestraTaskKind,
} from "../agentRuntime/orchestraSchemas";
import {
  isSupportedRuntimeContractVersion,
  type AgentRuntimeEntryPoint,
  type AgentRuntimeOriginSurface,
  type AgentRuntimeSurface,
} from "../agentRuntime/types";
import { supportsSkillCapabilityCaller } from "../agentRuntime/skillManifest";
import {
  ProductionContextSnapshotRefSchema,
  type ProductionContextSnapshotRef,
} from "./verticalDramaAssuranceContext";
import { canonicalJsonStringify, sha256Hex } from "./artifacts";

export const VERTICAL_DRAMA_ASSURANCE_SCHEMA_VERSION = 1;
export const VERTICAL_DRAMA_ASSURANCE_TASK_KINDS = [
  "premise_expansion", "story_architecture", "full_story", "draft_qc",
  "draft_repair", "start_frame_prompt", "reference_image_prompt",
  "video_prompt_qc", "broll_assembly_qc", "season_qc",
] as const;
export const VerticalDramaAssuranceTaskKindSchema = z.enum(VERTICAL_DRAMA_ASSURANCE_TASK_KINDS);
export type VerticalDramaAssuranceTaskKind = z.infer<typeof VerticalDramaAssuranceTaskKindSchema>;

export const VERTICAL_DRAMA_ASSURANCE_STATES = [
  "queued", "running", "awaiting_action", "succeeded", "recovered",
  "retryable_failed", "fatal_failed", "cancelled", "stale", "reconciliation_required",
] as const;
export const VerticalDramaAssuranceStateSchema = z.enum(VERTICAL_DRAMA_ASSURANCE_STATES);
export type VerticalDramaAssuranceState = z.infer<typeof VerticalDramaAssuranceStateSchema>;
export const VerticalDramaAssuranceDispositionSchema = z.enum(["verified", "recovered_needs_repair", "blocked", "retryable"]);
export type VerticalDramaAssuranceDisposition = z.infer<typeof VerticalDramaAssuranceDispositionSchema>;
export const VerticalDramaAssuranceReadinessSchema = z.enum(["draft", "verified", "provider_ready", "production_ready"]);
export type VerticalDramaAssuranceReadiness = z.infer<typeof VerticalDramaAssuranceReadinessSchema>;
export const VerticalDramaAssuranceModeSchema = z.enum(["agent_active", "agent_shadow", "legacy_deterministic", "recovered_result"]);
export type VerticalDramaAssuranceMode = z.infer<typeof VerticalDramaAssuranceModeSchema>;

export const VERTICAL_DRAMA_ASSURANCE_ERROR_CODES = [
  "VD_ASSURANCE_REQUEST_INVALID", "VD_ASSURANCE_TENANT_MISMATCH",
  "VD_ASSURANCE_CONTEXT_MISSING", "VD_ASSURANCE_CONTEXT_STALE",
  "VD_ASSURANCE_SOURCE_NOT_READY", "VD_ASSURANCE_ROLE_INVALID",
  "VD_ASSURANCE_EVIDENCE_STATUS_INVALID", "VD_ASSURANCE_TASK_UNMAPPED",
  "VD_ASSURANCE_CAPABILITY_UNAVAILABLE", "VD_ASSURANCE_RUNTIME_VERSION_UNSUPPORTED",
  "VD_ASSURANCE_SIDE_EFFECT_POLICY_INVALID",
  "VD_ASSURANCE_RUNTIME_UNAVAILABLE", "VD_ASSURANCE_RUNTIME_TIMEOUT",
  "VD_ASSURANCE_MANIFEST_MISSING", "VD_ASSURANCE_MANIFEST_INCOMPATIBLE",
  "VD_ASSURANCE_MANIFEST_UNTRUSTED", "VD_ASSURANCE_OUTPUT_SCHEMA_INVALID",
  "VD_ASSURANCE_OUTPUT_IDENTITY_MISMATCH", "VD_ASSURANCE_GUARDRAIL_BLOCKED",
  "VD_ASSURANCE_TOOL_DENIED", "VD_ASSURANCE_RECURSION_LIMIT",
  "VD_ASSURANCE_BUDGET_EXCEEDED", "VD_ASSURANCE_RUNTIME_INTERRUPTED",
  "VD_ASSURANCE_USAGE_UNKNOWN", "VD_ASSURANCE_FINAL_GATE_BLOCKED",
  "VD_ASSURANCE_PREDECESSOR_MISSING", "VD_ASSURANCE_PREDECESSOR_STALE",
  "VD_ASSURANCE_STAGE_INPUT_MISMATCH", "VD_ASSURANCE_SCENE_ANCHOR_REQUIRED",
  "VD_ASSURANCE_REFERENCE_ROLE_CONFLICT", "VD_ASSURANCE_PROMPT_BUDGET_EXCEEDED",
  "VD_ASSURANCE_REFERENCE_MANIFEST_MISMATCH", "VD_ASSURANCE_SPEAKER_POSITION_DRIFT",
  "VD_ASSURANCE_MEDIA_NOT_DURABLE", "VD_ASSURANCE_BROLL_BINDING_STALE",
  "VD_ASSURANCE_ASSEMBLY_NOT_READY", "VD_ASSURANCE_STORY_INCOMPLETE",
  "VD_ASSURANCE_SEASON_QC_BLOCKED",
] as const;
export const VerticalDramaAssuranceErrorCodeSchema = z.enum(VERTICAL_DRAMA_ASSURANCE_ERROR_CODES);
export type VerticalDramaAssuranceErrorCode = z.infer<typeof VerticalDramaAssuranceErrorCodeSchema>;

export const VerticalDramaAssuranceSourceRefSchema = z.object({
  packId: z.number().int().positive(),
  version: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type VerticalDramaAssuranceSourceRef = z.infer<typeof VerticalDramaAssuranceSourceRefSchema>;

export const VerticalDramaAssuranceRequestSchema = z.object({
  schemaVersion: z.literal(VERTICAL_DRAMA_ASSURANCE_SCHEMA_VERSION),
  tenantId: z.string().trim().min(1),
  userId: z.union([z.number().int().positive(), z.string().trim().min(1)]),
  taskKind: VerticalDramaAssuranceTaskKindSchema,
  runtimeTaskKind: OrchestraTaskKindSchema,
  sourceRef: VerticalDramaAssuranceSourceRefSchema.nullable(),
  contextSnapshotRef: ProductionContextSnapshotRefSchema,
  inputRefs: z.array(z.string().trim().min(1)).min(1).max(256),
  contractVersion: z.number().int().positive(),
  runtimeContractVersion: z.number().int().positive(),
  outputContractVersion: z.number().int().positive(),
  rulePackIds: z.array(z.string().trim().min(1)).max(64).default([]),
  policyHash: z.string().regex(/^[a-f0-9]{64}$/),
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
  compatibilityMode: z.enum(["native", "legacy_wrapped"]),
  requiredReadiness: VerticalDramaAssuranceReadinessSchema,
  idempotencyKey: z.string().trim().min(1).max(256),
  attemptId: z.string().trim().min(1).max(128),
  budget: OrchestraRuntimeBudgetSchema,
  sideEffectPolicy: z.enum(["none", "candidate_only", "provider_ready"]),
  legacyInputRef: z.unknown().optional(),
}).strict().superRefine((value, ctx) => {
  if (!isSupportedRuntimeContractVersion(value.runtimeContractVersion)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["runtimeContractVersion"], message: "VD_ASSURANCE_RUNTIME_VERSION_UNSUPPORTED" });
  }
});
export type VerticalDramaAssuranceRequest = z.infer<typeof VerticalDramaAssuranceRequestSchema>;

export const VerticalDramaAssuranceFindingSchema = z.object({
  code: VerticalDramaAssuranceErrorCodeSchema,
  message: z.string().min(1),
}).strict();
export type VerticalDramaAssuranceFinding = z.infer<typeof VerticalDramaAssuranceFindingSchema>;

export const VerticalDramaAssuranceResultSchema = z.object({
  executionId: z.string().min(1), attemptId: z.string().min(1),
  state: VerticalDramaAssuranceStateSchema, disposition: VerticalDramaAssuranceDispositionSchema,
  readiness: VerticalDramaAssuranceReadinessSchema,
  findings: z.array(VerticalDramaAssuranceFindingSchema).default([]),
  mode: VerticalDramaAssuranceModeSchema,
  fallbackReason: VerticalDramaAssuranceErrorCodeSchema.nullable().default(null),
  traceId: z.string().min(1).nullable().default(null), nextAction: z.string().min(1),
}).strict();
export type VerticalDramaAssuranceResult = z.infer<typeof VerticalDramaAssuranceResultSchema>;

export const VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS = {
  premise_expansion: "vd.assurance.story-findings.v1",
  story_architecture: "vd.assurance.story-findings.v1",
  full_story: "vd.assurance.story-findings.v1",
  season_qc: "vd.assurance.season-findings.v1",
  draft_qc: "vd.assurance.draft-qc-findings.v1",
  draft_repair: "vd.assurance.draft-repair-proposal.v1",
  start_frame_prompt: "vd.assurance.prompt-findings.v1",
  reference_image_prompt: "vd.assurance.prompt-findings.v1",
  video_prompt_qc: "vd.assurance.prompt-findings.v1",
  broll_assembly_qc: "vd.assurance.media-findings.v1",
} as const satisfies Record<VerticalDramaAssuranceTaskKind, string>;

export const VerticalDramaAgentProposalSchema = z.object({
  schemaRef: z.string().min(1),
  taskKind: VerticalDramaAssuranceTaskKindSchema,
  attemptId: z.string().min(1),
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  inputRefs: z.array(z.string().min(1)).max(256),
  findings: z.array(z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)).max(256).default([]),
  }).strict()).max(256).default([]),
}).strict();
export type VerticalDramaAgentProposal = z.infer<typeof VerticalDramaAgentProposalSchema>;

type RuntimeTaskMapping = { runtimeTaskKind: OrchestraTaskKind; outputAuthority: string; outputSchemaRef: string };
export const VERTICAL_DRAMA_RUNTIME_TASK_MAP: Record<VerticalDramaAssuranceTaskKind, RuntimeTaskMapping> = {
  premise_expansion: { runtimeTaskKind: "structured_generation", outputAuthority: "existing_story_contracts_and_domain_gates", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.premise_expansion },
  story_architecture: { runtimeTaskKind: "structured_generation", outputAuthority: "existing_story_contracts_and_domain_gates", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.story_architecture },
  full_story: { runtimeTaskKind: "structured_generation", outputAuthority: "existing_story_contracts_and_domain_gates", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.full_story },
  season_qc: { runtimeTaskKind: "structured_generation", outputAuthority: "existing_story_contracts_and_domain_gates", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.season_qc },
  draft_qc: { runtimeTaskKind: "skill_execution", outputAuthority: "node_qc_and_domain_final_gate", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.draft_qc },
  draft_repair: { runtimeTaskKind: "skill_execution", outputAuthority: "node_qc_and_domain_final_gate", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.draft_repair },
  video_prompt_qc: { runtimeTaskKind: "skill_execution", outputAuthority: "node_qc_and_domain_final_gate", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.video_prompt_qc },
  broll_assembly_qc: { runtimeTaskKind: "skill_execution", outputAuthority: "node_qc_and_domain_final_gate", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.broll_assembly_qc },
  start_frame_prompt: { runtimeTaskKind: "image_prompt", outputAuthority: "existing_prompt_composer_and_image_contract", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.start_frame_prompt },
  reference_image_prompt: { runtimeTaskKind: "image_prompt", outputAuthority: "existing_prompt_composer_and_image_contract", outputSchemaRef: VERTICAL_DRAMA_ASSURANCE_OUTPUT_SCHEMAS.reference_image_prompt },
};

export type VerticalDramaAssuranceCapabilityManifest = {
  taskTypes: readonly string[]; surfaceSupport: readonly AgentRuntimeSurface[];
  supportedOriginSurfaces: readonly AgentRuntimeOriginSurface[];
  supportedEntryPoints: readonly AgentRuntimeEntryPoint[];
};
export type VerticalDramaTaskCapabilityMapResult =
  | { ok: true; mapping: { domainTaskKind: VerticalDramaAssuranceTaskKind; runtimeTaskKind: OrchestraTaskKind; requiredManifestTaskType: OrchestraTaskKind; outputAuthority: string; outputSchemaRef: string } }
  | { ok: false; finding: VerticalDramaAssuranceFinding };

export function mapVerticalDramaTaskToRuntimeCapability(task: unknown, manifest?: VerticalDramaAssuranceCapabilityManifest | null): VerticalDramaTaskCapabilityMapResult {
  const parsedTask = VerticalDramaAssuranceTaskKindSchema.safeParse(task);
  if (!parsedTask.success) return { ok: false, finding: { code: "VD_ASSURANCE_TASK_UNMAPPED", message: "Vertical Drama assurance task is not mapped to a runtime capability" } };
  const mapping = VERTICAL_DRAMA_RUNTIME_TASK_MAP[parsedTask.data];
  if (!OrchestraTaskKindSchema.safeParse(mapping.runtimeTaskKind).success) return { ok: false, finding: { code: "VD_ASSURANCE_TASK_UNMAPPED", message: "Mapped runtime task is unsupported" } };
  if (manifest) {
    const callerSupported = supportsSkillCapabilityCaller(manifest as never, { surface: "skill", originSurface: "media_production", entryPoint: "execute_custom_skill" });
    if (!manifest.taskTypes.includes(mapping.runtimeTaskKind) || !callerSupported) return { ok: false, finding: { code: "VD_ASSURANCE_CAPABILITY_UNAVAILABLE", message: "Runtime capability manifest does not support this assurance task" } };
  }
  return { ok: true, mapping: { domainTaskKind: parsedTask.data, runtimeTaskKind: mapping.runtimeTaskKind, requiredManifestTaskType: mapping.runtimeTaskKind, outputAuthority: mapping.outputAuthority, outputSchemaRef: mapping.outputSchemaRef } };
}

export const AssuranceUiProjectionSchema = z.object({
  state: VerticalDramaAssuranceStateSchema, disposition: VerticalDramaAssuranceDispositionSchema,
  readiness: VerticalDramaAssuranceReadinessSchema, requiredReadiness: VerticalDramaAssuranceReadinessSchema,
  nextAction: z.string().min(1), verified: z.boolean(), canInspect: z.boolean(), canEdit: z.boolean(),
  canCancel: z.boolean(), canRetry: z.boolean(), canRepair: z.boolean(), canContinue: z.boolean(), canPaidContinue: z.boolean(),
}).strict();
export type AssuranceUiProjection = z.infer<typeof AssuranceUiProjectionSchema>;

export const VerticalDramaAssuranceApiErrorSchema = z.object({
  schemaVersion: z.literal(1),
  surface: z.literal("vertical_drama_assurance"),
  errorCode: VerticalDramaAssuranceErrorCodeSchema,
  userMessageKey: z.string().min(1),
  nextAction: z.string().min(1),
  projection: AssuranceUiProjectionSchema.nullable(),
}).strict();
export type VerticalDramaAssuranceApiError = z.infer<typeof VerticalDramaAssuranceApiErrorSchema>;

export const VerticalDramaAssuranceTimingSchema = z.object({
  startedAt: z.string().datetime().nullable(),
  heartbeatAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  eventCursor: z.number().int().nonnegative().nullable(),
}).strict();
export type VerticalDramaAssuranceTiming = z.infer<typeof VerticalDramaAssuranceTimingSchema>;

const readinessRank: Record<VerticalDramaAssuranceReadiness, number> = { draft: 0, verified: 1, provider_ready: 2, production_ready: 3 };
export function buildAssuranceUiProjection(input: {
  state: VerticalDramaAssuranceState; disposition: VerticalDramaAssuranceDisposition;
  readiness: VerticalDramaAssuranceReadiness; requiredReadiness: VerticalDramaAssuranceReadiness;
  sourceCurrent: boolean; contextCurrent: boolean; hasRecoveredResult: boolean;
}): AssuranceUiProjection {
  const current = input.sourceCurrent && input.contextCurrent;
  const verified = input.state === "succeeded" && input.disposition === "verified";
  const canContinue = verified && current && readinessRank[input.readiness] >= readinessRank[input.requiredReadiness];
  const running = input.state === "queued" || input.state === "running";
  const recovered = input.state === "recovered" && input.hasRecoveredResult && current;
  const retryable = input.state === "retryable_failed" || recovered || input.state === "stale";
  const nextAction = input.state === "reconciliation_required" ? "reconcile" : input.state === "stale" ? "retry_from_fresh_context" : canContinue ? "continue" : recovered ? "repair" : retryable ? "retry" : running ? "inspect_progress" : "start_new_run";
  return AssuranceUiProjectionSchema.parse({
    state: input.state, disposition: input.disposition, readiness: input.readiness, requiredReadiness: input.requiredReadiness,
    nextAction, verified, canInspect: true, canEdit: !verified || !canContinue, canCancel: running,
    canRetry: retryable && input.state !== "reconciliation_required", canRepair: recovered,
    canContinue, canPaidContinue: canContinue,
  });
}

export function wrapLegacyVerticalDramaAssuranceRequest(input: { request: VerticalDramaAssuranceRequest; legacyPayload: unknown }): VerticalDramaAssuranceRequest {
  return VerticalDramaAssuranceRequestSchema.parse({ ...input.request, compatibilityMode: "legacy_wrapped", legacyInputRef: input.legacyPayload });
}

/** Immutable accepted-artifact lineage; optional projections preserve legacy payloads. */
export const VerticalDramaAssuredArtifactKindSchema = z.enum([
  "story_architecture", "full_story", "deep_episode_story", "shot_contract",
  "start_frame_prompt", "reference_image_prompt", "video_motion_prompt_pack",
  "provider_video_prompt", "start_frame_media", "reference_media", "video_media",
  "broll_binding_manifest", "assembly_manifest", "post_generation_qc", "season_qc",
]);
export type VerticalDramaAssuredArtifactKind = z.infer<typeof VerticalDramaAssuredArtifactKindSchema>;

const lineageHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const VerticalDramaAssuredArtifactRefSchema = z.object({
  kind: VerticalDramaAssuredArtifactKindSchema,
  artifactId: z.string().trim().min(1),
  version: z.string().trim().min(1),
  fingerprint: lineageHashSchema,
  semanticRole: z.string().trim().min(1).optional(),
  orderedIndex: z.number().int().nonnegative().optional(),
}).strict();
export type VerticalDramaAssuredArtifactRef = z.infer<typeof VerticalDramaAssuredArtifactRefSchema>;

export const VerticalDramaArtifactAssuranceLineageSchema = z.object({
  schemaVersion: z.literal(1),
  executionId: z.string().min(1),
  attemptId: z.string().min(1),
  taskKind: VerticalDramaAssuranceTaskKindSchema,
  contextSnapshotRef: ProductionContextSnapshotRefSchema,
  predecessorRefs: z.array(VerticalDramaAssuredArtifactRefSchema),
  contractVersion: z.string().min(1),
  outputContractVersion: z.string().min(1),
  policyHash: lineageHashSchema,
  modelPolicy: z.string().min(1),
  providerProfileHash: lineageHashSchema.optional(),
  inputFingerprint: lineageHashSchema,
  outputFingerprint: lineageHashSchema,
  promptHash: lineageHashSchema.optional(),
  referenceManifestFingerprint: lineageHashSchema.optional(),
  assuranceMode: VerticalDramaAssuranceModeSchema,
  disposition: VerticalDramaAssuranceDispositionSchema,
  readiness: VerticalDramaAssuranceReadinessSchema,
  findingCodes: z.array(VerticalDramaAssuranceErrorCodeSchema),
  verifiedAt: z.string().datetime(),
}).strict();
export type VerticalDramaArtifactAssuranceLineage = z.infer<typeof VerticalDramaArtifactAssuranceLineageSchema>;

const NON_IDENTITY_STAGE_KEYS = new Set([
  "capturedAt", "createdAt", "updatedAt", "verifiedAt", "traceId", "queueId",
  "providerUrl", "signedUrl", "temporaryUrl", "pollingStatus", "providerStatus",
]);
const SET_LIKE_STAGE_KEYS = new Set(["findingCodes", "policyTags", "rulePackIds"]);

function stableArtifactRefKey(ref: VerticalDramaAssuredArtifactRef): string {
  return [ref.kind, ref.artifactId, ref.version, ref.fingerprint, ref.semanticRole ?? "", ref.orderedIndex ?? ""].join("\u0000");
}

/** Ordered references retain their ordinal; set-like references are sorted. */
export function normalizeVerticalDramaPredecessorRefs(refs: readonly VerticalDramaAssuredArtifactRef[]): VerticalDramaAssuredArtifactRef[] {
  const parsed = refs.map(ref => VerticalDramaAssuredArtifactRefSchema.parse(ref));
  const unordered = parsed.filter(ref => ref.orderedIndex == null).sort((left, right) => stableArtifactRefKey(left).localeCompare(stableArtifactRefKey(right)));
  const ordered = parsed.filter(ref => ref.orderedIndex != null).sort((left, right) => left.orderedIndex! - right.orderedIndex! || stableArtifactRefKey(left).localeCompare(stableArtifactRefKey(right)));
  return [...unordered, ...ordered];
}

function normalizeStageValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map(item => normalizeStageValue(item));
    return key && SET_LIKE_STAGE_KEYS.has(key)
      ? [...normalized].sort((left, right) => canonicalJsonStringify(left).localeCompare(canonicalJsonStringify(right)))
      : normalized;
  }
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (NON_IDENTITY_STAGE_KEYS.has(childKey) || /(?:^|_)(?:signed|provider|temporary)?url$/i.test(childKey)) continue;
    result[childKey] = normalizeStageValue(childValue, childKey);
  }
  return result;
}

export function fingerprintVerticalDramaStageInput(input: {
  taskKind: VerticalDramaAssuranceTaskKind;
  contextSnapshotRef: ProductionContextSnapshotRef;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  contractVersion: string;
  policyHash: string;
  modelPolicy: string;
  stageInput: unknown;
}): string {
  return sha256Hex(canonicalJsonStringify({
    taskKind: input.taskKind,
    contextSnapshotRef: ProductionContextSnapshotRefSchema.parse(input.contextSnapshotRef),
    predecessorRefs: normalizeVerticalDramaPredecessorRefs(input.predecessorRefs),
    contractVersion: input.contractVersion,
    policyHash: input.policyHash,
    modelPolicy: input.modelPolicy,
    stageInput: normalizeStageValue(input.stageInput),
  }));
}

/** Exact provider-formatted prompt bytes are identity; URLs and polling state are not. */
export function fingerprintVerticalDramaProviderPrompt(input: {
  prompt: string;
  formatterVersion: string;
  model: string;
  capability: unknown;
  startFrame: VerticalDramaAssuredArtifactRef | null;
  referenceManifestFingerprint: string;
  providerOptions?: unknown;
}): string {
  return sha256Hex(canonicalJsonStringify({
    prompt: input.prompt,
    formatterVersion: input.formatterVersion,
    model: input.model,
    capability: normalizeStageValue(input.capability),
    startFrame: input.startFrame ? VerticalDramaAssuredArtifactRefSchema.parse(input.startFrame) : null,
    referenceManifestFingerprint: input.referenceManifestFingerprint,
    providerOptions: normalizeStageValue(input.providerOptions),
  }));
}

export function buildVerticalDramaArtifactAssuranceLineage(input: {
  request: VerticalDramaAssuranceRequest;
  result: VerticalDramaAssuranceResult;
  outputContractVersion: string;
  output: unknown;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  modelPolicy: string;
  stageInput: unknown;
  promptHash?: string;
  referenceManifestFingerprint?: string;
  providerProfileHash?: string;
  verifiedAt?: string;
}): VerticalDramaArtifactAssuranceLineage {
  const request = VerticalDramaAssuranceRequestSchema.parse(input.request);
  const result = VerticalDramaAssuranceResultSchema.parse(input.result);
  const predecessors = normalizeVerticalDramaPredecessorRefs(input.predecessorRefs);
  const inputFingerprint = fingerprintVerticalDramaStageInput({
    taskKind: request.taskKind,
    contextSnapshotRef: request.contextSnapshotRef,
    predecessorRefs: predecessors,
    contractVersion: String(request.contractVersion),
    policyHash: request.policyHash,
    modelPolicy: input.modelPolicy,
    stageInput: input.stageInput,
  });
  return VerticalDramaArtifactAssuranceLineageSchema.parse({
    schemaVersion: 1,
    executionId: result.executionId,
    attemptId: result.attemptId,
    taskKind: request.taskKind,
    contextSnapshotRef: request.contextSnapshotRef,
    predecessorRefs: predecessors,
    contractVersion: String(request.contractVersion),
    outputContractVersion: input.outputContractVersion,
    policyHash: request.policyHash,
    modelPolicy: input.modelPolicy,
    providerProfileHash: input.providerProfileHash,
    inputFingerprint,
    outputFingerprint: sha256Hex(canonicalJsonStringify(normalizeStageValue(input.output))),
    promptHash: input.promptHash,
    referenceManifestFingerprint: input.referenceManifestFingerprint,
    assuranceMode: result.mode,
    disposition: result.disposition,
    readiness: result.readiness,
    findingCodes: [...new Set(result.findings.map(finding => finding.code))].sort(),
    verifiedAt: input.verifiedAt ?? new Date().toISOString(),
  });
}

export class VerticalDramaArtifactLineageError extends Error {
  constructor(readonly code: VerticalDramaAssuranceErrorCode, message: string) {
    super(message);
    this.name = "VerticalDramaArtifactLineageError";
  }
}

const lineageReadinessRank: Record<VerticalDramaAssuranceReadiness, number> = { draft: 0, verified: 1, provider_ready: 2, production_ready: 3 };

export function assertVerticalDramaArtifactLineageCurrent(input: {
  lineage: VerticalDramaArtifactAssuranceLineage;
  expectedContext: ProductionContextSnapshotRef;
  expectedPredecessors: VerticalDramaAssuredArtifactRef[];
  expectedInputFingerprint: string;
  requiredReadiness: VerticalDramaAssuranceReadiness;
}): void {
  const lineage = VerticalDramaArtifactAssuranceLineageSchema.parse(input.lineage);
  const context = ProductionContextSnapshotRefSchema.parse(input.expectedContext);
  if (canonicalJsonStringify(lineage.contextSnapshotRef) !== canonicalJsonStringify(context)) {
    throw new VerticalDramaArtifactLineageError("VD_ASSURANCE_PREDECESSOR_STALE", "Artifact lineage belongs to a stale production context");
  }
  if (canonicalJsonStringify(lineage.predecessorRefs) !== canonicalJsonStringify(normalizeVerticalDramaPredecessorRefs(input.expectedPredecessors))) {
    throw new VerticalDramaArtifactLineageError("VD_ASSURANCE_PREDECESSOR_STALE", "Artifact lineage predecessors are no longer current");
  }
  if (lineage.inputFingerprint !== input.expectedInputFingerprint) {
    throw new VerticalDramaArtifactLineageError("VD_ASSURANCE_STAGE_INPUT_MISMATCH", "Artifact lineage input no longer matches the current stage input");
  }
  if (lineageReadinessRank[lineage.readiness] < lineageReadinessRank[input.requiredReadiness]) {
    throw new VerticalDramaArtifactLineageError("VD_ASSURANCE_PREDECESSOR_MISSING", "Artifact lineage does not meet the required readiness");
  }
}

export type { OrchestraRuntimeBudget, ProductionContextSnapshotRef };
