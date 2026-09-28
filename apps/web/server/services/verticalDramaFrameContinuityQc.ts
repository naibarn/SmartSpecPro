/**
 * Feature 137/138 shared start-frame vision QC.
 *
 * The service deliberately separates the provider-facing vision response from
 * the deterministic issue/score mapping.  Vision is advisory only: the result
 * can surface warnings and a suggested repair. The service itself stays
 * side-effect bounded and advisory; the paid I2V router may apply a separate
 * deterministic precondition to a multi-character anchor while old plans
 * (which do not carry `sceneContinuity`) remain byte-compatible.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import {
  calculateCreditsForLLM,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import {
  executeVisionAwareJsonCallWithRetry,
  type VisionAwareImageInput,
} from "./verticalDramaStoryBible";
import { resolveStartFramePlanModel } from "./verticalDramaImproveScript";
import type { VdSceneVisualState } from "@shared/verticalDramaSeries/sceneContinuity";
import {
  evaluateSceneContinuityAnalysis,
  deviceOrientationAnalysisSchema,
  sceneContinuityAnalysisSchema,
  type FrameContinuityQcEvaluation,
  type FrameContinuityQcIssue,
  type DeviceOrientationAnalysis,
  type SceneContinuityAnalysis,
} from "@shared/verticalDramaSeries/frameContinuity";

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-start-frame-video-safety-qa");
const SKILL_VERSION = "vertical-drama-start-frame-video-safety-qa@2";

const videoSafetyCharacterSchema = z
  .object({
    character: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    face_readable: z.boolean().optional(),
    facing: z.string().trim().min(1).max(40).optional(),
    eyes_visible: z.string().trim().min(1).max(40).optional(),
    occlusion: z.string().trim().min(1).max(40).optional(),
    face_size: z.string().trim().min(1).max(40).optional(),
    overlapped_by_other_face: z.boolean().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .passthrough();

export const videoSafetyAnalysisSchema = z.object({
  characters: z.array(videoSafetyCharacterSchema).max(20).default([]),
  faces_separated: z.boolean().optional(),
  face_touching_frame_edge: z.boolean().optional(),
  action_matches_intent: z.boolean().optional(),
  action_mismatch_note: z.string().max(500).nullable().optional(),
  video_safe_verdict: z.enum(["safe", "conditional", "risky"]).optional(),
  reasons: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
}).passthrough();

export type VideoSafetyAnalysis = z.infer<typeof videoSafetyAnalysisSchema>;

const frameQcOutputSchema = z.object({
  scene_continuity: sceneContinuityAnalysisSchema.optional(),
  video_safety: videoSafetyAnalysisSchema.optional(),
  device_orientation: deviceOrientationAnalysisSchema.optional(),
}).passthrough();

export type FrameQcVisionOutput = z.infer<typeof frameQcOutputSchema>;

let cachedSkillPrompt: string | null = null;

function loadSkillPrompt(): string {
  if (cachedSkillPrompt) return cachedSkillPrompt;
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (content?.trim()) {
      cachedSkillPrompt = content;
      return content;
    }
  }
  throw new Error(`Could not locate ${SKILL_FOLDER_PATH}/skill.md`);
}

function compactState(state?: VdSceneVisualState): Record<string, unknown> | undefined {
  if (!state) return undefined;
  return {
    location_key: state.locationKey,
    lighting_state: state.lightingState,
    fixed_elements: state.fixedElements,
    spatial_layout: state.spatialLayout,
    staging_axis: state.stagingAxis,
    wardrobe_in_scene: state.wardrobeInScene,
    active_props: state.activeProps,
    palette_mood: state.paletteMood,
  };
}

export function buildFrameContinuityQcUserPrompt(input: {
  shotNumber: number;
  anchorShotNumber?: number;
  sceneState?: VdSceneVisualState;
  locationKey?: string;
  requiredCharacterRefs?: string[];
  requestVideoSafety?: boolean;
  requestDeviceOrientation?: boolean;
}): string {
  const requestedFields = [
    "scene_continuity",
    ...(input.requestVideoSafety ? ["video_safety"] : []),
    ...(input.requestDeviceOrientation ? ["device_orientation"] : []),
  ];
  return [
    "Analyze the attached current frame against the optional neighbor/location references.",
    "Return ONLY compact JSON. This is advisory QA: describe visible evidence and do not invent measurements.",
    JSON.stringify({
      shot_number: input.shotNumber,
      anchor_shot_number: input.anchorShotNumber,
      location_key: input.locationKey,
      required_character_refs: input.requiredCharacterRefs ?? [],
      scene_state: compactState(input.sceneState),
      requested_fields: requestedFields,
      device_orientation_contract: input.requestDeviceOrientation
        ? "Inspect the physical handset separately from any floating call overlay. Return rear only when the back shell and rear camera lens cluster face the camera, physical_display_visible is false, and the remote face is inside a separate floating call screen."
        : undefined,
    }, null, 2),
  ].join("\n\n");
}

export type RunFrameContinuityQcInput = {
  userId: number;
  tenantId: string;
  publicUrl?: string | null;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  currentFrameUrl?: string;
  neighborFrameUrl?: string;
  locationReferenceUrl?: string;
  sceneState?: VdSceneVisualState;
  anchorShotNumber?: number;
  locationKey?: string;
  requiredCharacterRefs?: string[];
  requestVideoSafety?: boolean;
  requestDeviceOrientation?: boolean;
  idempotencyKey?: string;
};

export type RunFrameContinuityQcResult = {
  analysis?: SceneContinuityAnalysis;
  videoSafety?: VideoSafetyAnalysis;
  deviceOrientation?: DeviceOrientationAnalysis;
  evaluation: FrameContinuityQcEvaluation;
  usedVision: boolean;
  model?: string;
  skillVersion: string;
  creditsUsed: number;
};

/** Run one shared vision call when at least one reference image is available. */
export async function runFrameContinuityQc(
  input: RunFrameContinuityQcInput,
): Promise<RunFrameContinuityQcResult> {
  const images: VisionAwareImageInput[] = [];
  if (input.currentFrameUrl) images.push({ label: `CURRENT FRAME (shot ${input.shotNumber})`, url: input.currentFrameUrl });
  if (input.neighborFrameUrl) images.push({ label: `SAME-SCENE NEIGHBOR (shot ${input.anchorShotNumber ?? "unknown"})`, url: input.neighborFrameUrl });
  if (input.locationReferenceUrl) images.push({ label: "APPROVED LOCATION REFERENCE", url: input.locationReferenceUrl });
  if (images.length === 0) {
    return {
      evaluation: evaluateSceneContinuityAnalysis(
        undefined,
        undefined,
        input.requestDeviceOrientation === true,
      ),
      usedVision: false,
      skillVersion: SKILL_VERSION,
      creditsUsed: 0,
    };
  }

  const model = await resolveStartFramePlanModel(input.seriesId);
  const userPrompt = buildFrameContinuityQcUserPrompt(input);
  const visionResult = await executeVisionAwareJsonCallWithRetry<FrameQcVisionOutput>({
    model,
    systemPrompt: loadSkillPrompt(),
    userPromptText: userPrompt,
    hasVision: true,
    images,
    userId: input.userId,
    tenantId: input.tenantId,
    publicUrl: input.publicUrl,
    schema: frameQcOutputSchema,
    firstAttemptMaxTokens: 1800,
    retryMaxTokens: 2400,
  });
  const usage = visionResult.response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );
  if (creditsUsed > 0 && !(await hasEnoughCredits(input.userId, creditsUsed))) {
    throw new Error(`Insufficient credits for frame continuity QC (required: ${creditsUsed})`);
  }
  if (creditsUsed > 0) {
    await deductCredits({
      userId: input.userId,
      tenantId: input.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — frame continuity QC (episode #${input.episodeId}, shot #${input.shotNumber})`,
      sourceType: "vision_analysis",
      idempotencyKey: input.idempotencyKey,
      metadata: {
        feature: "vertical_drama_scene_continuity_qc",
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        shotNumber: input.shotNumber,
        model,
      },
    });
  }
  return {
    analysis: visionResult.data.scene_continuity,
    videoSafety: visionResult.data.video_safety,
    deviceOrientation: visionResult.data.device_orientation,
    evaluation: evaluateSceneContinuityAnalysis(
      visionResult.data.scene_continuity,
      visionResult.data.device_orientation,
      input.requestDeviceOrientation === true,
    ),
    usedVision: true,
    model,
    skillVersion: SKILL_VERSION,
    creditsUsed,
  };
}

export { evaluateSceneContinuityAnalysis };
export type {
  DeviceOrientationAnalysis,
  FrameContinuityQcEvaluation,
  FrameContinuityQcIssue,
  SceneContinuityAnalysis,
};
