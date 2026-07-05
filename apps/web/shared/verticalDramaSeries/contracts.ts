/**
 * Vertical Drama Series — Core shared contracts (spec §7, §11.5, §16).
 *
 * Pure field-only TypeScript contracts + small zod validators. NO server/db
 * imports so the client can import these directly. Field names and enum values
 * are copied verbatim from the feature spec §7 (Data Model) and §11.5.
 */

import { z } from "zod";
import type { VerticalDramaMemoryRetrievalPolicy } from "./memory";
import type { VerticalDramaAssemblyManifest } from "./assembly";
import { VERTICAL_DRAMA_DEFAULT_DURATION_PROFILE_ID } from "./assembly";

/* -------------------------------------------------------------------------- */
/* Pipeline stages & warnings (spec §11.5)                                    */
/* -------------------------------------------------------------------------- */

export type VerticalDramaPipelineStage =
  | "normalize_series_input"
  | "plan_episode_script"
  | "update_character_visual_bible"
  | "generate_or_import_character_refs"
  | "storyboard_shotgrid"
  | "start_frame_render_plan"
  | "render_or_import_start_frames"
  | "approve_start_frames"
  | "dialogue_audio_plan"
  | "video_motion_prompt_pack"
  | "create_storyboard_review_project"
  | "review_generate_repair_in_storyboard_review"
  | "render_or_import_video_clips"
  | "assemble_episode_manifest"
  | "summarize_episode_to_series_memory";

export type VerticalDramaWarning = {
  code: string;
  severity: "info" | "warning" | "error" | "blocking";
  message: string;
  targetStage?: VerticalDramaPipelineStage;
  targetShotNumber?: number;
  targetClipNumber?: number;
  repairable: boolean;
};

/* -------------------------------------------------------------------------- */
/* Series bible building blocks (spec §7.3)                                   */
/* -------------------------------------------------------------------------- */

export type VerticalDramaLocation = {
  id: string;
  name: string;
  description?: string;
};

export type VerticalDramaRelationship = {
  fromCharacterId: string;
  toCharacterId: string;
  kind: string;
  notes?: string;
};

export type VerticalDramaProp = {
  id: string;
  name: string;
  recurring: boolean;
  notes?: string;
};

export type VerticalDramaCharacter = {
  characterId: string;
  name: string;
  role: string;
  personality: string;
  backstory?: string;
  identityLock: string;
  wardrobeRules: string[];
  approvedReferenceAssetIds: string[];
  rejectedReferenceAssetIds: string[];
  visualBibleSkillRunId?: string;
  currentState: {
    emotionalState?: string;
    relationshipNotes?: string[];
    storyKnowledge?: string[];
    injuryOrWardrobeContinuity?: string[];
  };
};

export type VerticalDramaCharacterDelta = {
  characterId: string;
  episodeNumber: number;
  changedFields: string[];
  summary: string;
};

export type VerticalDramaSeriesBible = {
  logline: string;
  mainPlot: string;
  seasonArc: string;
  visualStyle: string;
  pacingStyle: string;
  cameraGrammar: string;
  locations: VerticalDramaLocation[];
  characters: VerticalDramaCharacter[];
  relationshipMap: VerticalDramaRelationship[];
  recurringProps: VerticalDramaProp[];
  continuityRules: string[];
};

/* -------------------------------------------------------------------------- */
/* Product tie-in (spec §13)                                                  */
/* -------------------------------------------------------------------------- */

export type VerticalDramaProductTieInConfig = {
  enabled: boolean;
  productName?: string;
  productDescription?: string;
  referenceAssetIds: string[];
  productSource?: "manual" | "marketplace" | "library" | "uploaded_reference";
  disclosurePolicy:
    | "not_required"
    | "show_overlay_disclosure"
    | "caption_disclosure"
    | "manual_review";
  regulatedCategory?: "none" | "health" | "beauty" | "finance" | "medical" | "baby_kids" | "other";
  allowedStoryFunctions: Array<
    "memory_trigger" | "relationship_token" | "status_symbol" | "daily_use" | "plot_clue" | "soft_cta"
  >;
  forbiddenClaims: string[];
  maxEpisodesWithTieInPerTenEpisodes: number;
  requireHumanApproval: boolean;
};

export type VerticalDramaTieInUsage = {
  enabled: boolean;
  episodeHasTieIn: boolean;
  shotNumbers: number[];
  storyFunction: string;
  placementNaturalnessScore: number;
  claimsReview: {
    unsupportedClaimsDetected: boolean;
    warnings: string[];
  };
  disclosureRequired: boolean;
  disclosureText?: string;
  approvedByUserId?: string;
};

/* -------------------------------------------------------------------------- */
/* Series memory (spec §7.3, §7.6)                                            */
/* -------------------------------------------------------------------------- */

export type VerticalDramaSeriesMemory = {
  canonicalFacts: string[];
  episodeSummaries: Array<{
    episodeId: string;
    episodeNumber: number;
    summary: string;
    cliffhanger?: string;
    characterDeltas: VerticalDramaCharacterDelta[];
    productTieInUsage?: VerticalDramaTieInUsage;
  }>;
  unresolvedHooks: string[];
  resolvedHooks: string[];
  continuityWarnings: string[];
  compactedMemoryText: string;
  retrievalPolicy: VerticalDramaMemoryRetrievalPolicy;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Series policy (spec §7.3)                                                  */
/* -------------------------------------------------------------------------- */

export type VerticalDramaSeriesPolicy = {
  visibility: "private" | "tenant" | "shared_group";
  generationMode: "dry_run" | "approval_required" | "auto_after_approval";
  maxConcurrentEpisodeRuns: number;
  maxProviderSpendPerEpisodeCredits?: number;
  requireTieInApproval: boolean;
  requireCharacterAssetApproval: boolean;
  retentionPolicyId?: string;
};

/** The three generation modes, ordered least-to-most autonomous (spec §7.3). */
export const VERTICAL_DRAMA_GENERATION_MODES = [
  "dry_run",
  "approval_required",
  "auto_after_approval",
] as const;
export type VerticalDramaGenerationMode = (typeof VERTICAL_DRAMA_GENERATION_MODES)[number];

/* -------------------------------------------------------------------------- */
/* Minimal input contracts (spec §7.2.1)                                      */
/* -------------------------------------------------------------------------- */

/** App-facing age group — narrowed projection of the wider upstream enum. */
export type VerticalDramaAppAgeGroup = "children" | "teens" | "adults";

/** Wider upstream age group (open string for forward-compat). */
export type VerticalDramaUpstreamAgeGroup =
  | "preschool"
  | "children"
  | "tweens"
  | "teens"
  | "young_adults"
  | "adults"
  | string;

export type VerticalDramaMinimalInput = {
  locale?: "th" | "en";
  storyTitle: string;
  durationSeconds?: 60;
  storyBrief: string;
  characters: Array<{
    characterId: string;
    name: string;
    role: string;
  }>;
  episodeCount?: number;
  ageControl?: {
    targetAgeGroup: VerticalDramaAppAgeGroup;
    targetRating?: string;
  };
  tieIn?: VerticalDramaProductTieInConfig;
};

/** Raw upstream (GitHub guide) minimal episode input — stored losslessly (spec §7.2.1). */
export type VerticalDramaUpstreamMinimalEpisodeInput = {
  story_title: string;
  duration_seconds: 60;
  story_brief: string;
  characters: Array<{
    character_id: string;
    name: string;
    role: string;
  }>;
  episode_count: number;
  age_control?: {
    target_age_group: VerticalDramaUpstreamAgeGroup;
    target_rating?: string;
  };
};

export const verticalDramaMinimalInputSchema = z.object({
  locale: z.enum(["th", "en"]).optional(),
  storyTitle: z.string().min(1),
  durationSeconds: z.literal(60).optional(),
  storyBrief: z.string().min(1),
  characters: z
    .array(
      z.object({
        characterId: z.string().min(1),
        name: z.string().min(1),
        role: z.string().min(1),
      }),
    )
    .min(1),
  episodeCount: z.number().int().positive().optional(),
  ageControl: z
    .object({
      targetAgeGroup: z.enum(["children", "teens", "adults"]),
      targetRating: z.string().optional(),
    })
    .optional(),
  // tieIn intentionally left as passthrough object (validated by its own schema).
  tieIn: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Maps an upstream `target_age_group` bucket into the reduced app enum
 * (spec §7.2.1): preschool/children -> children, tweens/teens -> teens,
 * young_adults/adults -> adults. Unknown values fall back to `adults`.
 */
export function mapUpstreamAgeGroup(upstream: VerticalDramaUpstreamAgeGroup): VerticalDramaAppAgeGroup {
  switch (upstream) {
    case "preschool":
    case "children":
      return "children";
    case "tweens":
    case "teens":
      return "teens";
    case "young_adults":
    case "adults":
      return "adults";
    default:
      return "adults";
  }
}

/**
 * The persisted `input.normalized.json` artifact shape. It preserves the raw
 * upstream snake_case input losslessly alongside the app-facing camelCase shape,
 * and keeps the original brief and skill-inferred fields separate so audit and
 * repair can distinguish user-supplied text from inferred values (spec §7.2.1).
 */
export type VerticalDramaNormalizedInputArtifact = {
  app: VerticalDramaMinimalInput;
  upstream: VerticalDramaUpstreamMinimalEpisodeInput;
  /** The user's original, unmodified brief text. */
  originalBrief: string;
  /** Fields the skill chain inferred (never mixed into the user-supplied brief). */
  inferred: {
    fields: string[];
    values: Record<string, unknown>;
  };
};

/* -------------------------------------------------------------------------- */
/* Series project (spec §7.2)                                                 */
/* -------------------------------------------------------------------------- */

export type VerticalDramaSeriesProject = {
  id: string;
  tenantId: string;
  ownerUserId: string;
  title: string;
  locale: "th" | "en";
  aspectRatio: "9:16";
  status: "draft" | "planning" | "active" | "paused" | "completed" | "archived";
  targetEpisodeCount: number;
  defaultEpisodeDurationSeconds: 60;
  genre: string;
  tone: string;
  targetAudience: string;
  agePolicyId?: string;
  bible: VerticalDramaSeriesBible;
  memory: VerticalDramaSeriesMemory;
  productTieIn?: VerticalDramaProductTieInConfig;
  policy: VerticalDramaSeriesPolicy;
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Episode stage output projections (spec §6.9 / §7.3)                        */
/* -------------------------------------------------------------------------- */

/** Typed projection of the `drama_script` output (spec §6.1, §6.9). */
export type VerticalDramaEpisodeScript = {
  episodeTitle: string;
  hook: string;
  structure: Array<{
    beat: string;
    description: string;
    shotNumbers?: number[];
  }>;
  sceneDialogueSummary: string;
  cliffhanger?: string;
  characterStateDeltas: VerticalDramaCharacterDelta[];
  productTieInUsage?: VerticalDramaTieInUsage;
  continuityNotes: string[];
  warnings: VerticalDramaWarning[];
};

/** Typed projection of the `storyboard_shotgrid` output (spec §6.3, §6.9). */
export type VerticalDramaShotgrid = {
  gridLayout: "3x3";
  shotCount: 9;
  shots: Array<{
    shotNumber: number;
    description: string;
    cameraSetup: string;
    characterIds: string[];
    locationId?: string;
    continuityNotes: string[];
    durationSeconds: number;
  }>;
};

/** Typed projection of `start_frame_render_plan` / `shot_start_frames` (spec §6.4, §6.9). */
export type VerticalDramaStartFramePlan = {
  mode: "single_frame_per_shot" | "contact_sheet_3x3_batch";
  selectedImageModelId: string;
  frames: Array<{
    shotNumber: number;
    imagePrompt: string;
    negativePrompt: string;
    requiredCharacterRefs: string[];
    productReferenceAssetIds: string[];
    approvedMediaAssetId?: string;
  }>;
};

/** Typed projection of the `video_motion_prompt_pack` output (spec §6.5, §6.9). */
export type VerticalDramaMotionPromptPack = {
  selectedVideoModelId: string;
  durationProfileId: string;
  motionMode:
    | "first_last_frame_bridge"
    | "first_frame_to_video"
    | "image_to_video"
    | "text_to_video"
    | "reference_to_video"
    | "prompt_only";
  clips: Array<{
    clipNumber: number;
    sourceShotNumbers: number[];
    prompt: string;
    negativeMotionPrompt?: string;
    startFrameAssetId?: string;
    endFrameAssetId?: string;
    durationSeconds: number;
    parentShotNumber?: number;
    subShotNumber?: number;
  }>;
  warnings: VerticalDramaWarning[];
};

/** Recommended dialogue/audio/subtitle plan metadata (spec §14). */
export type VerticalDramaDialogueAudioPlan = {
  audioStrategy: "separate_tts_voiceover" | "dialogue_tts" | "native_video_audio" | "silent";
  language: "th-TH" | "en-US" | string;
  voiceContinuityMap: Array<{
    characterId: string;
    speakerName: string;
    voiceProvider?: string;
    voiceModelId?: string;
    voiceId?: string;
    fallbackVoiceId?: string;
  }>;
  shotLines: Array<{
    shotNumber: number;
    clipNumber?: number;
    speakerCharacterId?: string;
    text: string;
    targetDurationSeconds: number;
    subtitleCueId?: string;
  }>;
  subtitleSafeArea: {
    position: "bottom_safe" | "middle_safe" | "top_safe";
    maxLines: number;
    avoidFaceArea: boolean;
  };
  warnings: VerticalDramaWarning[];
};

/* -------------------------------------------------------------------------- */
/* Approval checkpoints (spec §11.2)                                          */
/* -------------------------------------------------------------------------- */

export type VerticalDramaApprovalCheckpointArtifact = {
  checkpointId: string;
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  state: "pending" | "approved" | "rejected" | "repaired" | "superseded";
  approvedByUserId?: string;
  rejectedByUserId?: string;
  sourceArtifactIds: string[];
  repairRequestIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** Compact per-stage approval status projected from the durable checkpoint (spec §7.3). */
export type VerticalDramaApprovalState = Pick<
  VerticalDramaApprovalCheckpointArtifact,
  "stage" | "state" | "checkpointId"
>;

/* -------------------------------------------------------------------------- */
/* QC report (spec §16)                                                       */
/* -------------------------------------------------------------------------- */

export type VerticalDramaQcStage =
  | "script"
  | "character_visual"
  | "storyboard"
  | "start_frame_prompt"
  | "start_frame_image"
  | "video_prompt"
  | "provider_routing"
  | "video_clip"
  | "assembly"
  | "product_tie_in"
  | "storyboard_review_handoff"
  | "episode_memory_update";

/**
 * Single source of truth for QC-stage -> pipeline-stage resolution. Lives
 * here (not `server/services/verticalDramaQc.ts`) specifically so both the
 * server (QC evaluation / stale-stage computation) and the client
 * (Storyboard Review's repair-button wiring, which must resolve a
 * `recommendedRepairs[]` entry's QC stage back to a pipeline stage to call
 * `repairStageOutput`) import the exact same mapping — no duplicated,
 * driftable copy on either side.
 */
export const VERTICAL_DRAMA_QC_TO_PIPELINE_STAGE: Record<VerticalDramaQcStage, VerticalDramaPipelineStage> = {
  script: "plan_episode_script",
  character_visual: "update_character_visual_bible",
  storyboard: "storyboard_shotgrid",
  start_frame_prompt: "start_frame_render_plan",
  start_frame_image: "render_or_import_start_frames",
  video_prompt: "video_motion_prompt_pack",
  provider_routing: "render_or_import_video_clips",
  video_clip: "render_or_import_video_clips",
  assembly: "assemble_episode_manifest",
  product_tie_in: "video_motion_prompt_pack",
  storyboard_review_handoff: "create_storyboard_review_project",
  episode_memory_update: "summarize_episode_to_series_memory",
};

export type VerticalDramaQcResult = {
  qcReportId: string;
  seriesId: string;
  episodeId: string;
  runId: string;
  stage: VerticalDramaQcStage;
  passed: boolean;
  score: number;
  issues: Array<{
    issueId: string;
    severity: "info" | "warning" | "error" | "blocking";
    targetType:
      | "series"
      | "episode"
      | "character"
      | "shot"
      | "clip"
      | "asset"
      | "provider"
      | "audio"
      | "subtitle"
      | "tie_in";
    targetId?: string;
    message: string;
    evidence?: string;
  }>;
  recommendedRepairs: Array<{
    repairId: string;
    stage: VerticalDramaQcStage;
    action:
      | "rewrite_script"
      | "regenerate_character"
      | "repair_storyboard_shot"
      | "repair_start_frame_prompt"
      | "regenerate_start_frame"
      | "repair_motion_prompt"
      | "reroute_provider"
      | "regenerate_clip"
      | "repair_sub_shot"
      | "adjust_sub_shot_timing"
      | "adjust_audio_subtitle"
      | "remove_or_rewrite_tie_in"
      | "repair_assembly";
    instruction: string;
    autoRunnable: boolean;
  }>;
  createdAt: string;
};

/** GitHub-guide-equivalent alias (spec §11.5). */
export type QCResult = VerticalDramaQcResult;

/**
 * Persisted QC report row (spec §16 — the `vertical_drama_qc_reports` table).
 *
 * The run/stage-scoped durable projection of a `VerticalDramaQcResult` after it
 * has been written to the QC table. It carries the DB row `id` (as a string, in
 * keeping with the client-facing string-id convention used across these
 * contracts) alongside the deterministic `qcReportId`, and its field names /
 * shapes mirror the `vertical_drama_qc_reports` columns (stage, passed, score,
 * issues, recommendedRepairs, createdAt). Issue and repair shapes are reused
 * verbatim from `VerticalDramaQcResult` so the persisted row never drifts from
 * the evaluated result.
 */
export type VerticalDramaQcReport = {
  /** DB row id (bigserial) — absent until persisted. */
  id?: string;
  qcReportId: string;
  seriesId: string;
  episodeId: string;
  runId: string;
  stage: VerticalDramaQcStage;
  passed: boolean;
  score: number;
  issues: VerticalDramaQcResult["issues"];
  recommendedRepairs: VerticalDramaQcResult["recommendedRepairs"];
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* Episode (spec §7.3)                                                        */
/* -------------------------------------------------------------------------- */

export type VerticalDramaEpisodeStatus =
  | "draft"
  | "script_planned"
  | "characters_ready"
  | "storyboard_ready"
  | "start_frames_ready"
  | "motion_prompts_ready"
  | "storyboard_review_created"
  | "rendering"
  | "completed"
  | "needs_repair";

export type VerticalDramaEpisode = {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  status: VerticalDramaEpisodeStatus;
  targetDurationSeconds: 60;
  durationProfileId: typeof VERTICAL_DRAMA_DEFAULT_DURATION_PROFILE_ID | string;
  script?: VerticalDramaEpisodeScript;
  storyboard?: VerticalDramaShotgrid;
  startFramePlan?: VerticalDramaStartFramePlan;
  dialogueAudioPlan?: VerticalDramaDialogueAudioPlan;
  motionPromptPack?: VerticalDramaMotionPromptPack;
  assemblyManifest?: VerticalDramaAssemblyManifest;
  storyboardReviewId?: string;
  approvals: VerticalDramaApprovalState[];
  qcReports: VerticalDramaQcResult[];
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Run artifacts (spec §7.3)                                                  */
/* -------------------------------------------------------------------------- */

export type VerticalDramaArtifactStage =
  | "input_normalized"
  | "drama_script"
  | "character_visual_bible"
  | "character_assets_manifest"
  | "storyboard_shotgrid"
  | "start_frame_render_plan"
  | "contact_sheet_batch_plan"
  | "contact_sheet_assets_manifest"
  | "candidate_frame_selection"
  | "start_frame_manifest"
  | "video_motion_prompt_pack"
  | "video_clip_manifest"
  | "assembly_manifest"
  | "qc_report"
  | "readable_summary"
  | "run_log";

export type VerticalDramaRunArtifact = {
  artifactId: string;
  seriesId: string;
  episodeId: string;
  runId: string;
  stage: VerticalDramaArtifactStage;
  storageKey?: string;
  jsonPayload?: unknown;
  mediaAssetIds?: string[];
  checksumSha256?: string;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* Run-level contracts (spec §11.5)                                           */
/* -------------------------------------------------------------------------- */

export type NormalizedEpisodeInput = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  locale: "th" | "en";
  targetDurationSeconds: 60;
  aspectRatio: "9:16";
  storyBrief: string;
  memoryBundle: VerticalDramaSeriesMemory;
  characters: VerticalDramaCharacter[];
  tieIn?: VerticalDramaProductTieInConfig;
  ageControl?: VerticalDramaMinimalInput["ageControl"];
};

export type RunResult = {
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  status: "queued" | "running" | "approval_required" | "succeeded" | "failed" | "cancelled";
  next_action:
    | "approve"
    | "repair"
    | "resume_next_stage"
    | "open_storyboard_review"
    | "wait_for_provider"
    | "none";
  /** ARRAY — a stage may emit multiple artifacts. */
  artifactIds: string[];
  errors: Array<{
    code: string;
    message: string;
    targetArtifactId?: string;
    repairable: boolean;
  }>;
  warnings: VerticalDramaWarning[];
  qc?: VerticalDramaQcResult;
};

/** Episode run modes (spec §11.4). */
export const VERTICAL_DRAMA_RUN_MODES = [
  "dry_run",
  "plan_only",
  "render_images",
  "render_video",
  "full",
] as const;
export type VerticalDramaRunMode = (typeof VERTICAL_DRAMA_RUN_MODES)[number];

/** Durable episode run row projection (persisted per stage execution). */
export type VerticalDramaEpisodeRun = {
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  runMode: VerticalDramaRunMode;
  status: RunResult["status"];
  nextAction: RunResult["next_action"];
  artifactIds: string[];
  warnings: VerticalDramaWarning[];
  createdAt: string;
  updatedAt: string;
};
