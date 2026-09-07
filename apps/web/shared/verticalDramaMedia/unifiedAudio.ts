import { z } from "zod";
import { canonicalJsonStringify, sha256Hex } from "../verticalDramaSeries/artifacts";

/** Feature 180 v2 wire contract. Keep this module provider neutral. */
export const UNIFIED_AUDIO_SCHEMA_VERSION = "unified-audio.v2" as const;
export const UNIFIED_AUDIO_TTS_JOB_TYPE = "tts_utterance_generate" as const;
export const UNIFIED_AUDIO_TRAINING_JOB_TYPE = "voice_training_run" as const;

const id = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const modelId = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);
const revision = z.number().int().positive();
const text = z.string().max(16_384);
const locale = z.string().regex(/^[a-z]{2,8}(?:-[A-Z][A-Z0-9]{1,7})?$/);
const timeMs = z.number().int().nonnegative().max(86_400_000);
const percent = z.number().finite().min(0).max(1);

export const audioScopeSchema = z.discriminatedUnion("scopeType", [
  z.object({ scopeType: z.literal("standalone"), workspaceId: id, projectId: id, projectRevision: revision }).strict(),
  z.object({ scopeType: z.literal("series_episode"), workspaceId: id, projectId: id, seriesId: id, episodeId: id, episodeRevision: revision }).strict(),
  z.object({ scopeType: z.literal("production_episode"), workspaceId: id, projectId: id, seriesId: id, productionGroupId: id, groupRevision: revision }).strict(),
]);
export type AudioScope = z.infer<typeof audioScopeSchema>;

export const voiceOwnerScopeSchema = z.discriminatedUnion("ownerScopeType", [
  z.object({ ownerScopeType: z.literal("project"), workspaceId: id, projectId: id }).strict(),
  z.object({ ownerScopeType: z.literal("series"), workspaceId: id, seriesId: id }).strict(),
]);
export type VoiceOwnerScope = z.infer<typeof voiceOwnerScopeSchema>;

export const audioArtifactRefSchema = z.discriminatedUnion("location", [
  z.object({ location: z.literal("managed"), artifactId: id, revision, checksum, kind: id }).strict(),
  z.object({ location: z.literal("worker_local"), artifactId: id, ownerWorkerId: id, bindingRevision: revision, revision, checksum, kind: id }).strict(),
]);
export type AudioArtifactRef = z.infer<typeof audioArtifactRefSchema>;

const sourceMappingSchema = z.object({ sourceId: id, startMs: timeMs, endMs: timeMs }).strict().superRefine((value, ctx) => {
  if (value.endMs <= value.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "endMs must be greater than startMs" });
});

export const utteranceRefSchema = z.object({
  utteranceId: id,
  revision,
  sourceKind: z.enum(["authored_line", "subtitle_cue", "narration"]),
  sourceArtifact: audioArtifactRefSchema.nullable(),
  sourceTextHash: checksum,
  effectiveText: text,
  locale,
  speakerRef: id.nullable(),
  shotId: id.nullable(),
  sourceMappings: z.array(sourceMappingSchema).max(100),
  timelineTransformRef: id.nullable(),
}).strict();
export type UtteranceRef = z.infer<typeof utteranceRefSchema>;

export const voiceReferenceSchema = z.object({
  referenceAudioArtifactId: id,
  artifactRef: audioArtifactRefSchema,
  derivedFromArtifactId: id.nullable(),
  selectedRange: z.object({ startMs: timeMs, endMs: timeMs }).strict().nullable(),
  language: locale.nullable(),
  qualityReportArtifactId: id.nullable(),
  consentId: id,
  consentRevision: revision,
  referenceTranscript: text.nullable(),
  referenceTranscriptArtifactId: id.nullable(),
  referenceTranscriptHash: checksum.nullable(),
  transcriptSource: z.enum(["manual", "import", "asr"]).nullable(),
  transcriptVerified: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.selectedRange && value.selectedRange.endMs <= value.selectedRange.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedRange", "endMs"], message: "reference range must be positive" });
  if (value.referenceTranscript !== null && value.referenceTranscriptArtifactId !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["referenceTranscript"], message: "transcript text and artifact are mutually exclusive" });
  if (value.referenceTranscriptArtifactId !== null && value.referenceTranscriptHash === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["referenceTranscriptHash"], message: "transcript artifact requires hash" });
  if (value.transcriptVerified && value.referenceTranscript === null && value.referenceTranscriptArtifactId === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transcriptVerified"], message: "verified transcript requires text or artifact" });
});
export type VoiceReference = z.infer<typeof voiceReferenceSchema>;

export const voiceConsentSchema = z.object({
  consentId: id,
  revision,
  scope: voiceOwnerScopeSchema,
  subjectType: z.enum(["synthetic", "licensed_actor", "user_owned"]),
  status: z.enum(["pending", "granted", "expired", "revoked"]),
  evidenceArtifactId: id.nullable(),
  allowedOperations: z.array(z.enum(["inference", "training", "provider_clone"])).min(1).max(3),
  allowedProviders: z.array(id).max(32),
  allowedLocales: z.array(locale).max(32),
  grantedByUserId: id.nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export type VoiceConsent = z.infer<typeof voiceConsentSchema>;

export const voiceProfileSchema = z.object({
  voiceProfileId: id,
  revision,
  ownerScope: voiceOwnerScopeSchema,
  displayName: z.string().trim().min(1).max(120),
  subjectType: z.enum(["synthetic", "licensed_actor", "user_owned"]),
  defaultLocale: locale,
  references: z.array(voiceReferenceSchema).max(20),
  defaultReferenceAudioArtifactId: id.nullable(),
  consentIds: z.array(id).max(20),
  status: z.enum(["draft", "ready", "disabled", "revoked", "archived"]),
}).strict();
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const voiceBindingSchema = z.object({
  voiceBindingId: id,
  revision,
  voiceProfileId: id,
  voiceProfileRevision: revision,
  target: z.enum(["worker_local", "server_cloud"]),
  providerId: id,
  modelId,
  modelRevision: id,
  runtimeRevision: id,
  mode: z.enum(["catalog_voice", "reference_clone", "transcript_clone", "trained_voice", "synthetic_design"]),
  selectedReferenceAudioArtifactIds: z.array(id).max(20),
  consentSnapshot: z.object({ consentId: id, revision, status: z.literal("granted"), policyHash: checksum }).strict().nullable(),
  providerVoiceId: id.nullable(),
  trainedModelArtifactId: id.nullable(),
  locale,
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  approval: z.enum(["pending", "approved", "disabled", "revoked"]),
  capabilitySnapshotHash: checksum,
}).strict().superRefine((value, ctx) => {
  const clone = value.mode === "reference_clone" || value.mode === "transcript_clone";
  if (clone && value.selectedReferenceAudioArtifactIds.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedReferenceAudioArtifactIds"], message: "clone mode requires a reference" });
  if (value.mode === "transcript_clone" && value.consentSnapshot === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["consentSnapshot"], message: "clone mode requires consent" });
  if (value.mode === "trained_voice" && value.trainedModelArtifactId === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trainedModelArtifactId"], message: "trained mode requires a model artifact" });
  if (value.mode === "catalog_voice" && value.providerVoiceId === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["providerVoiceId"], message: "catalog mode requires provider voice id" });
});
export type VoiceBinding = z.infer<typeof voiceBindingSchema>;

export const executionPolicySchema = z.object({
  mode: z.enum(["local_only", "cloud_only", "prefer_local", "prefer_cloud"]),
  allowedBindingIds: z.array(id).min(1).max(16),
  allowFallback: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(3).default(1),
  maxCostCredits: z.number().int().nonnegative().max(1_000_000),
  maxRuntimeMs: z.number().int().positive().max(86_400_000),
  priority: z.enum(["interactive", "timeline", "production", "benchmark", "download"]),
  privacyPolicyRef: id,
}).strict();
export type ExecutionPolicy = z.infer<typeof executionPolicySchema>;

export const outputSpecSchema = z.object({ format: z.enum(["wav", "pcm16", "mp3"]), sampleRate: z.number().int().positive().max(192000), channels: z.union([z.literal(1), z.literal(2)]), wordTimestamps: z.boolean() }).strict();

export const ttsRequestSchema = z.object({
  schemaVersion: z.literal(UNIFIED_AUDIO_SCHEMA_VERSION),
  type: z.literal("audio.tts"),
  jobId: id,
  idempotencyKey: id.max(128),
  scope: audioScopeSchema,
  approvedPlanId: id,
  approvedPlanRevision: revision,
  approvedPlanHash: checksum,
  utterance: utteranceRefSchema,
  voiceProfileId: id,
  voiceProfileRevision: revision,
  voiceBindingId: id,
  voiceBindingRevision: revision,
  executionPolicy: executionPolicySchema,
  output: outputSpecSchema,
}).strict();
export type TtsRequest = z.infer<typeof ttsRequestSchema>;

export const ttsResultSchema = z.object({
  schemaVersion: z.literal(UNIFIED_AUDIO_SCHEMA_VERSION),
  jobId: id,
  attemptId: id,
  status: z.enum(["completed", "failed", "canceled", "blocked"]),
  target: z.enum(["worker_local", "server_cloud"]),
  providerId: id,
  modelId,
  modelRevision: id,
  runtimeRevision: id,
  audioArtifact: audioArtifactRefSchema.nullable(),
  timingArtifact: audioArtifactRefSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  sampleRate: z.number().int().positive().nullable(),
  channels: z.union([z.literal(1), z.literal(2)]).nullable(),
  seed: z.number().int().nonnegative().nullable(),
  provenance: z.object({ voiceProfileId: id, voiceProfileRevision: revision, voiceBindingId: id, voiceBindingRevision: revision, consentId: id.nullable(), consentRevision: revision.nullable(), referenceAudioArtifactIds: z.array(id), referenceHashes: z.array(checksum), policyHash: checksum, inputHash: checksum }).strict(),
  metrics: z.object({ synthesisRuntimeMs: z.number().int().nonnegative().nullable(), timeToFirstAudioMs: z.number().int().nonnegative().nullable(), rtf: z.number().finite().nonnegative().nullable(), peakVramMb: z.number().int().nonnegative().nullable() }).strict(),
  failureCode: id.nullable(),
}).strict();
export type TtsResult = z.infer<typeof ttsResultSchema>;

export const voiceDatasetSchema = z.object({
  datasetId: id,
  revision,
  ownerScope: voiceOwnerScopeSchema,
  manifestArtifact: audioArtifactRefSchema,
  sampleCount: z.number().int().positive().max(10_000),
  sourceRecordingCount: z.number().int().positive().max(10_000),
  split: z.object({ train: z.number().int().positive(), validation: z.number().int().positive(), test: z.number().int().positive() }).strict(),
  consentIds: z.array(id).min(1).max(20),
  status: z.enum(["draft", "frozen", "revoked", "archived"]),
}).strict().superRefine((value, ctx) => {
  if (value.split.train + value.split.validation + value.split.test !== value.sampleCount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["split"], message: "dataset split must equal sample count" });
  if (value.sourceRecordingCount < 3 && value.status === "frozen") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceRecordingCount"], message: "frozen training dataset requires three source recordings" });
});
export type VoiceDataset = z.infer<typeof voiceDatasetSchema>;

export const voiceTrainingRecipeSchema = z.object({
  providerId: id,
  modelId,
  baseModelRevision: id,
  recipeId: id,
  recipeVersion: id,
  method: z.enum(["lora", "sft", "provider_managed"]),
  seed: z.number().int().nonnegative(),
  precision: z.enum(["fp16", "bf16", "fp32"]),
  maxSteps: z.number().int().positive().max(1_000_000),
  maxWalltimeMs: z.number().int().positive().max(7 * 86_400_000),
  maxCostCredits: z.number().int().nonnegative().max(10_000_000),
  packageLockHash: checksum,
}).strict();
export type VoiceTrainingRecipe = z.infer<typeof voiceTrainingRecipeSchema>;

export const voiceTrainingRunSchema = z.object({
  schemaVersion: z.literal(UNIFIED_AUDIO_SCHEMA_VERSION),
  type: z.literal("audio.voice_train"),
  jobId: id,
  idempotencyKey: id.max(128),
  scope: audioScopeSchema,
  dataset: voiceDatasetSchema,
  recipe: voiceTrainingRecipeSchema,
  target: z.enum(["worker_local", "server_cloud"]),
  consentPolicyHash: checksum,
  approvedBudgetCredits: z.number().int().nonnegative(),
}).strict();
export type VoiceTrainingRun = z.infer<typeof voiceTrainingRunSchema>;

export function hashUnifiedAudioInput(input: unknown): string {
  return sha256Hex(canonicalJsonStringify(input));
}

export function canUseVoiceBinding(binding: VoiceBinding, profile: VoiceProfile, consent: VoiceConsent | null): boolean {
  if (binding.voiceProfileId !== profile.voiceProfileId || binding.voiceProfileRevision !== profile.revision) return false;
  if (binding.approval !== "approved" || profile.status === "revoked" || profile.status === "archived") return false;
  if (binding.mode === "catalog_voice" || binding.mode === "synthetic_design") return true;
  return consent?.status === "granted" && consent.allowedOperations.includes("inference") && binding.consentSnapshot?.revision === consent.revision;
}

export function resolveExecutionTarget(policy: ExecutionPolicy, bindings: readonly VoiceBinding[]): VoiceBinding {
  const eligible = bindings.filter((binding) => policy.allowedBindingIds.includes(binding.voiceBindingId));
  const local = eligible.find((binding) => binding.target === "worker_local");
  const cloud = eligible.find((binding) => binding.target === "server_cloud");
  const selected = policy.mode === "local_only" ? local : policy.mode === "cloud_only" ? cloud : policy.mode === "prefer_local" ? local ?? (policy.allowFallback ? cloud : undefined) : cloud ?? (policy.allowFallback ? local : undefined);
  if (!selected) throw new Error("AUDIO_EXECUTION_TARGET_UNAVAILABLE");
  return selected;
}

export function calculateRtf(synthesisRuntimeMs: number | null, durationMs: number | null): number | null {
  if (synthesisRuntimeMs === null || durationMs === null || durationMs <= 0) return null;
  return synthesisRuntimeMs / durationMs;
}

export const unifiedAudioFailureCodeValues = [
  "VOICE_SCOPE_MISMATCH", "VOICE_PROFILE_STALE", "VOICE_BINDING_STALE", "REFERENCE_NOT_FINALIZED", "REFERENCE_TRANSCRIPT_REQUIRED", "REFERENCE_TRANSCRIPT_UNVERIFIED", "REFERENCE_QUALITY_REVIEW_REQUIRED", "VOICE_MODE_UNSUPPORTED", "VOICE_CONSENT_REQUIRED", "VOICE_CONSENT_REVOKED", "TTS_PROVIDER_UNAVAILABLE", "TTS_PROVIDER_TIMEOUT", "TTS_OUTPUT_INVALID", "TTS_TIMING_OVERFLOW", "AUDIO_EXECUTION_TARGET_UNAVAILABLE", "GPU_RESOURCE_UNAVAILABLE", "TRAINING_UNAVAILABLE", "TRAINING_CONSENT_REQUIRED", "TRAINING_DATASET_INVALID", "TRAINING_CHECKPOINT_INVALID", "TRAINING_EVALUATION_REQUIRED", "STALE_INPUT", "CANCELED", "ARTIFACT_NOT_FOUND", "CREDIT_RESERVATION_FAILED",
] as const;
export const unifiedAudioFailureCodeSchema = z.enum(unifiedAudioFailureCodeValues);
export type UnifiedAudioFailureCode = z.infer<typeof unifiedAudioFailureCodeSchema>;
