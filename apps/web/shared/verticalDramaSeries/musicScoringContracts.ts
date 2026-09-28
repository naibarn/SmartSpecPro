import { z } from "zod";

export const VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION = "176.177.v1" as const;
export const VERTICAL_DRAMA_EMOTION_SKILL_ID = "vertical-drama-emotion-score-director" as const;

export const timingBasisSchema = z.enum(["planned", "observed_asr", "human_verified", "mixed"]);
export const musicActionSchema = z.enum(["enter", "sustain", "build", "release", "accent", "exit", "silence"]);

export const sourceEvidenceRefSchema = z.object({
  sourceId: z.string().min(1),
  sourceRevision: z.string().min(1),
  regionId: z.string().min(1).optional(),
  lineId: z.string().min(1).optional(),
  acquisition: z.enum(["script", "transcript", "human_annotation", "sampled_frames", "real_audio"]),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const skillExecutionProvenanceSchema = z.object({
  skillId: z.literal(VERTICAL_DRAMA_EMOTION_SKILL_ID),
  skillVersion: z.string().min(1),
  skillContentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  mode: z.enum(["analyze_regions", "critique_plan", "revise_plan", "compile_music_caption", "critique_caption"]),
  executionId: z.string().min(1),
  modelProvider: z.string().min(1),
  modelId: z.string().min(1),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/i),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/i),
  executedAt: z.string().datetime(),
});

export const emotionRegionSchema = z.object({
  regionId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  shotId: z.string().min(1).optional(),
  lineIds: z.array(z.string().min(1)),
  narrativeEvent: z.string().min(1),
  characterEmotions: z.array(z.object({ characterId: z.string().min(1), expressed: z.string().min(1), concealed: z.string().nullable() })),
  audienceEmotion: z.string().min(1),
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  intensity: z.number().min(0).max(1),
  musicAction: musicActionSchema,
  semanticConfidence: z.number().min(0).max(1),
  timingBasis: timingBasisSchema,
  timingUncertaintyMs: z.number().int().nonnegative().nullable(),
  evidence: z.array(sourceEvidenceRefSchema).min(1),
  dialogueProtection: z.array(z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), reason: z.string().min(1) }).superRefine((value, context) => {
    if (value.endMs <= value.startMs) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "dialogue protection end must be after start" });
  })),
}).superRefine((value, context) => {
  if (value.endMs <= value.startMs) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "emotion region end must be after start" });
  if (value.timingBasis !== "planned" && value.timingUncertaintyMs === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["timingUncertaintyMs"], message: "observed timing must declare uncertainty" });
  }
});

export const musicCueProposalSchema = z.object({
  cueId: z.string().min(1),
  coveredRegionIds: z.array(z.string().min(1)).min(1),
  timelineStartMs: z.number().int().nonnegative(),
  timelineDurationMs: z.number().int().positive(),
  anchorEvent: z.string().min(1),
  allowedOffsetMs: z.number().int().nonnegative(),
  displayCaption: z.string().min(1).max(2000),
  modelInstruction: z.string().min(1).max(4000),
  instrumentalOnly: z.literal(true),
  permittedEdits: z.array(z.enum(["trim", "gain", "fade", "crossfade", "time_stretch"])),
  ducking: z.object({ attenuationDb: z.number().max(0), attackMs: z.number().nonnegative(), releaseMs: z.number().nonnegative(), holdMs: z.number().nonnegative() }),
  rightsPolicyHash: z.string().regex(/^[a-f0-9]{64}$/i),
}).superRefine((value, context) => {
  if (value.timelineDurationMs <= 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["timelineDurationMs"], message: "cue duration must be positive" });
});

export const approvedMusicScorePlanSchema = z.object({
  contractVersion: z.literal(VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION),
  planId: z.string().min(1),
  planningEpisodeKey: z.string().min(1),
  episodeId: z.string().nullable(),
  seriesId: z.string().min(1),
  cutRevisionId: z.string().nullable(),
  semanticRevision: z.string().min(1),
  timelineRevision: z.string().min(1),
  planHash: z.string().regex(/^[a-f0-9]{64}$/i),
  status: z.enum(["draft", "needs_review", "approved", "stale"]),
  regions: z.array(emotionRegionSchema),
  cues: z.array(musicCueProposalSchema),
  skill: skillExecutionProvenanceSchema,
  semanticExecutions: z.array(skillExecutionProvenanceSchema).min(1).max(7),
  critiqueDisposition: z.enum(["pending", "approved", "needs_review", "rejected", "human_resolved"]),
  captionExecutionRef: z.string().min(1).nullable(),
  captionHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  modalitiesUsed: z.array(z.enum(["script", "transcript", "human_annotation", "sampled_frames", "real_audio"])).min(1),
  inputCoverage: z.object({
    status: z.enum(["planned", "partial", "observed"]),
    matchedLines: z.number().int().nonnegative(),
    totalLines: z.number().int().nonnegative(),
  }).strict(),
  draftOnly: z.boolean(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().min(1).nullable(),
  rightsPolicyHash: z.string().regex(/^[a-f0-9]{64}$/i),
}).superRefine((value, context) => {
  const regionIds = new Set(value.regions.map(region => region.regionId));
  value.cues.forEach((cue, index) => cue.coveredRegionIds.forEach(regionId => {
    if (!regionIds.has(regionId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["cues", index, "coveredRegionIds"], message: `cue references unknown region ${regionId}` });
  }));
  if (value.status === "approved" && value.cues.some(cue => cue.rightsPolicyHash !== value.rightsPolicyHash)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cues"], message: "approved cues must use the plan rights policy hash" });
  }
  if (value.status === "approved" && !["approved", "human_resolved"].includes(value.critiqueDisposition)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["critiqueDisposition"], message: "approved plans require completed critique or recorded human resolution" });
  }
});

export type ApprovedMusicScorePlan = z.infer<typeof approvedMusicScorePlanSchema>;
export type MusicCueProposal = z.infer<typeof musicCueProposalSchema>;

export function validateApprovedMusicScorePlan(value: unknown) {
  return approvedMusicScorePlanSchema.safeParse(value);
}
