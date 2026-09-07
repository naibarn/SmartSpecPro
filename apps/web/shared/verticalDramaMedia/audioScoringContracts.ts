import { z } from "zod";
import {
  VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION,
  approvedMusicScorePlanSchema,
  musicCueProposalSchema,
} from "../verticalDramaSeries/musicScoringContracts";

export const VERTICAL_DRAMA_AUDIO_WIRE_CONTRACT = "vd-music-scoring-v1" as const;
export const VERTICAL_DRAMA_MUSIC3_MODEL = "MiniMaxAI/MiniMax-Music3" as const;

const opaqueId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);
const storageRef = z.string().trim().min(1).max(512).refine(
  value => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."),
  "storageRef must be relative and traversal-free",
);
const boundedMs = z.number().int().nonnegative().max(86_400_000);

export const audioCoordinateSpaceSchema = z.enum(["source", "occurrence", "cut"]);
export const audioTimingOriginSchema = z.enum(["planned", "observed_asr", "aligned_expected", "human_verified"]);

export const audioArtifactRefSchema = z.object({
  artifactId: opaqueId,
  checksum,
  kind: z.enum(["analysis", "transcript", "edit_map", "waveform", "media", "typed_audio_qc", "music_take", "score_mix"]),
  /** Server-owned storage reference. It is never a user supplied URL. */
  storageRef: storageRef.optional(),
}).strict();

export const audioEditMapRefSchema = z.object({
  revision: opaqueId,
  hash: checksum,
  coordinateSpace: audioCoordinateSpaceSchema,
  occurrenceCount: z.number().int().nonnegative().max(10_000),
}).strict();

export const audioAnalysisArtifactRefsSchema = z.object({
  transcript: audioArtifactRefSchema.extend({ kind: z.literal("transcript") }),
  editMap: audioArtifactRefSchema.extend({ kind: z.literal("edit_map") }),
}).strict();

export const audioRuntimeRequirementSchema = z.object({
  modelName: z.literal(VERTICAL_DRAMA_MUSIC3_MODEL),
  modelRevision: opaqueId,
  capability: z.literal("genuine_minimax_music3"),
  runtimeContractVersion: opaqueId,
}).strict();

export const audioAuthorizationSnapshotSchema = z.object({
  authorizationRef: opaqueId,
  budgetReservationRef: opaqueId,
  rightsPolicyHash: checksum,
  rightsStatus: z.literal("approved_for_project"),
  bindingRevision: z.number().int().positive(),
}).strict();

const audioJobBaseSchema = z.object({
  contractVersion: z.literal(VERTICAL_DRAMA_AUDIO_WIRE_CONTRACT),
  featureContractVersion: z.literal(VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION),
  seriesId: opaqueId,
  episodeId: opaqueId,
  tenantScope: opaqueId,
  bindingRevision: z.number().int().positive(),
  idempotencyKey: opaqueId.max(128),
  draftOnly: z.boolean(),
}).strict();

export const episodeAudioAnalyzeJobPayloadSchema = audioJobBaseSchema.extend({
  kind: z.literal("episode_audio_analyze"),
  sourceSnapshotHash: checksum,
  timelineHash: checksum,
  cutMedia: audioArtifactRefSchema,
  editMap: audioEditMapRefSchema,
  requestedLanguage: z.string().trim().regex(/^[a-z]{2,8}(-[A-Z]{2})?$/),
  analysisPolicy: z.enum(["audio_only", "audio_and_frames", "human_verified_silent"]),
}).strict();

export const minimaxMusic3GenerateJobPayloadSchema = audioJobBaseSchema.extend({
  kind: z.literal("minimax_music3_generate"),
  planId: opaqueId,
  planRevision: z.number().int().positive(),
  planHash: checksum,
  timelineHash: checksum,
  selectedCueIds: z.array(opaqueId).min(1).max(6),
  approvedPlan: approvedMusicScorePlanSchema,
  selectedCues: z.array(musicCueProposalSchema).min(1).max(6),
  analysisArtifacts: audioAnalysisArtifactRefsSchema.optional(),
  captionHash: checksum,
  semanticExecutions: z.array(opaqueId).min(1).max(16),
  captionExecutionRef: opaqueId,
  runtime: audioRuntimeRequirementSchema,
  authorization: audioAuthorizationSnapshotSchema,
}).strict().superRefine((value, context) => {
  if (value.approvedPlan.status !== "approved") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["approvedPlan", "status"], message: "generation requires an approved semantic plan" });
  }
  if (value.approvedPlan.planHash !== value.planHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["planHash"], message: "plan hash does not match the approved manifest" });
  }
  const cueIds = new Set(value.selectedCueIds);
  if (value.selectedCues.some(cue => !cueIds.has(cue.cueId))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedCues"], message: "selected cue is not listed in selectedCueIds" });
  }
  if (value.draftOnly && value.authorization.rightsStatus === "approved_for_project") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["draftOnly"], message: "draft-only jobs cannot carry final project rights authorization" });
  }
});

export const episodeScoreMixJobPayloadSchema = audioJobBaseSchema.extend({
  kind: z.literal("episode_score_mix"),
  planId: opaqueId,
  planRevision: z.number().int().positive(),
  planHash: checksum,
  timelineHash: checksum,
  selectedTakeIds: z.array(opaqueId).min(1).max(6),
  sourceRefs: z.array(audioArtifactRefSchema).min(1).max(32),
  mixEnvelope: z.object({
    attackMs: z.number().int().nonnegative().max(10_000),
    releaseMs: z.number().int().nonnegative().max(10_000),
    holdMs: z.number().int().nonnegative().max(10_000),
    attenuationDb: z.number().max(0).min(-60),
  }).strict(),
  deliveryProfile: z.enum(["web_drama_v1", "feature_175_saved", "broadcast"]),
  authorization: audioAuthorizationSnapshotSchema,
  approvedPlan: approvedMusicScorePlanSchema,
}).strict().superRefine((value, context) => {
  if (value.approvedPlan.status !== "approved" || value.approvedPlan.planHash !== value.planHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["approvedPlan"], message: "mix requires the current approved plan hash" });
  }
  if (value.draftOnly) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["draftOnly"], message: "draft-only output cannot be exported as a score mix" });
  }
});

export const verticalDramaAudioJobPayloadSchema = z.union([
  episodeAudioAnalyzeJobPayloadSchema,
  minimaxMusic3GenerateJobPayloadSchema,
  episodeScoreMixJobPayloadSchema,
]);

export type VerticalDramaAudioJobPayload = z.infer<typeof verticalDramaAudioJobPayloadSchema>;
export type EpisodeAudioAnalyzeJobPayload = z.infer<typeof episodeAudioAnalyzeJobPayloadSchema>;
export type MiniMaxMusic3GenerateJobPayload = z.infer<typeof minimaxMusic3GenerateJobPayloadSchema>;
export type EpisodeScoreMixJobPayload = z.infer<typeof episodeScoreMixJobPayloadSchema>;

export function validateVerticalDramaAudioJobPayload(value: unknown) {
  return verticalDramaAudioJobPayloadSchema.safeParse(value);
}

// Keep the time primitive referenced in one place so future payloads do not
// silently accept negative or unbounded intervals.
export const audioTimeMsSchema = boundedMs;
