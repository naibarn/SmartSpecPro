/**
 * Vertical Drama Series — Storyboard Review handoff contracts (spec §4.3, §12).
 *
 * Every approved episode plan produces a Storyboard Review project. Handoff is
 * idempotent (§12.1). These contracts describe the task metadata carried into
 * Storyboard Review and the backlink to the owning series/episode.
 */

import type { VideoRoutingDecision } from "./providerRouting";
import type { VerticalDramaTieInUsage } from "./contracts";

/** Idempotency key format for the handoff (spec §12.1). */
export const VERTICAL_DRAMA_HANDOFF_IDEMPOTENCY_PREFIX = "vertical-drama" as const;

/** Build the Storyboard Review handoff idempotency key (spec §12.1). */
export function buildVerticalDramaHandoffKey(
  seriesId: string,
  episodeId: string,
  episodePlanHash: string,
): string {
  return `${VERTICAL_DRAMA_HANDOFF_IDEMPOTENCY_PREFIX}:${seriesId}:episode:${episodeId}:handoff:${episodePlanHash}`;
}

/** Per-task extra params attached to Storyboard Review tasks (spec §12). */
export type VerticalDramaTaskExtraParams = {
  source: "vertical_drama_series";
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  shotNumber: number;
  clipNumber?: number;
  parentShotNumber?: number; // set when this task is a sub-shot of a decomposed main shot (§7.4)
  subShotNumber?: number; // 1-based order within the parent shot
  subShotCount?: number; // total sub-shots for the parent shot
  subShotTransitionIn?: "cut" | "match_cut" | "smash_cut" | "continuous";
  durationProfileId: string;
  motionMode:
    | "first_last_frame_bridge"
    | "first_frame_to_video"
    | "image_to_video"
    | "text_to_video"
    | "reference_to_video"
    | "prompt_only";
  characterReferenceAssetIds: string[];
  productReferenceAssetIds?: string[];
  startFrameAssetId?: string;
  endFrameAssetId?: string;
  contactSheetIds: string[];
  candidateFrameAssetIds: string[];
  selectedStartFrameCandidateId?: string;
  selectedEndFrameCandidateId?: string;
  promptSetId?: string;
  referenceFrameRoles: Array<"start" | "stop" | "character" | "product" | "style">;
  dialogueAudioPlanId?: string;
  subtitleCueIds?: string[];
  videoPromptSkillId: "vertical-drama-video-motion-prompt-pack";
  storyboardSkillId: "vertical-drama-storyboard-shotgrid";
  characterBibleSkillId: "vertical-drama-character-visual-bible";
  dialogueAudioSkillId: "vertical-drama-dialogue-audio-planner";
  productTieIn?: VerticalDramaTieInUsage;
  continuityWarnings: string[];
  providerRoutingDecision?: VideoRoutingDecision;
  assemblyManifestId?: string;
};

/** The handoff record linking an episode plan to a Storyboard Review project (spec §4.3). */
export type VerticalDramaStoryboardHandoff = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  idempotencyKey: string;
  episodePlanHash: string;
  storyboardReviewId?: string;
  taskExtraParamsByShot: VerticalDramaTaskExtraParams[];
  createdAt: string;
  updatedAt: string;
};
