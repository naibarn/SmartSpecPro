import {
  VideoSegmentPlannerInputSchema,
  VideoSegmentPlanSchema,
  type VideoModelSegmentCapability,
  type VideoSegment,
  type VideoSegmentPlannerInput,
  type VideoSegmentPlannerShot,
  type VideoSegmentStructureMode,
  type VideoSegmentWarning,
} from "./contracts";
import { resolveVideoModelSegmentCapability } from "./capabilityProfiles";

function stableHash(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return `vsp_${(hash >>> 0).toString(36)}`;
}

function segmentIdFor(shots: VideoSegmentPlannerShot[], index: number): string {
  return `seg_${index + 1}_${stableHash(shots.map((shot) => shot.shotId)).slice(-8)}`;
}

function warning(
  code: string,
  message: string,
  extra: Partial<VideoSegmentWarning> = {}
): VideoSegmentWarning {
  return { code, message, severity: "warning", source: "planner", ...extra };
}

function referenceUrls(
  shots: VideoSegmentPlannerShot[],
  capability: VideoModelSegmentCapability
): string[] {
  const urls = shots
    .flatMap((shot) => [
      shot.storyboardFrameUrl,
      shot.startFrameUrl,
      shot.stopFrameUrl,
    ])
    .filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls)).slice(0, capability.maxReferenceImagesPerSegment);
}

function buildSegment(
  shots: VideoSegmentPlannerShot[],
  index: number,
  input: VideoSegmentPlannerInput,
  capability: VideoModelSegmentCapability
): VideoSegment {
  const shotIds = shots.map((shot) => shot.shotId);
  const referenceImageUrls = referenceUrls(shots, capability);
  return {
    segmentId: segmentIdFor(shots, index),
    index,
    shotIds,
    durationSeconds: shots.reduce(
      (total, shot) => total + (shot.durationSeconds ?? 5),
      0
    ),
    referenceMode: input.referenceMode,
    referenceImageUrls,
    startFrameUrl: shots[0]?.startFrameUrl ?? shots[0]?.storyboardFrameUrl,
    stopFrameUrl:
      shots[shots.length - 1]?.stopFrameUrl ??
      shots[shots.length - 1]?.storyboardFrameUrl,
    subShots: shots.map((shot) => ({
      shotId: shot.shotId,
      index: shot.index,
      durationSeconds: shot.durationSeconds ?? 5,
      title: shot.title,
      visualPrompt: shot.visualPrompt,
      voiceover: shot.voiceover,
    })),
    warnings:
      referenceImageUrls.length < shotIds.length && input.referenceMode !== "segment_start_end"
        ? [
            warning(
              "reference_limit_applied",
              "Reference images were limited by the selected model capability.",
              { source: "reference", shotIds }
            ),
          ]
        : [],
  };
}

function groupShots(
  shots: VideoSegmentPlannerShot[],
  mode: VideoSegmentStructureMode,
  capability: VideoModelSegmentCapability,
  manualGroupSize?: number
): VideoSegmentPlannerShot[][] {
  if (mode === "per_shot" || !capability.supportsMultiShotPrompt) {
    return shots.map((shot) => [shot]);
  }
  const requested =
    mode === "manual_group_size"
      ? manualGroupSize ?? 1
      : mode === "compact_multi_shot"
        ? capability.maxSubShotsPerSegment
        : Math.min(3, capability.maxSubShotsPerSegment);
  const maxGroupSize = Math.max(1, Math.min(requested, capability.maxSubShotsPerSegment));
  const groups: VideoSegmentPlannerShot[][] = [];
  let current: VideoSegmentPlannerShot[] = [];
  let currentDuration = 0;

  for (const shot of shots) {
    const shotDuration = shot.durationSeconds ?? 5;
    const wouldOverflowSize = current.length >= maxGroupSize;
    const wouldOverflowDuration =
      current.length > 0 &&
      currentDuration + shotDuration > capability.maxSegmentDurationSeconds;
    if (wouldOverflowSize || wouldOverflowDuration) {
      groups.push(current);
      current = [];
      currentDuration = 0;
    }
    current.push(shot);
    currentDuration += shotDuration;
  }
  if (current.length) groups.push(current);
  return groups;
}

export function planVideoSegments(rawInput: VideoSegmentPlannerInput) {
  const input = VideoSegmentPlannerInputSchema.parse(rawInput);
  const capability =
    input.capability ??
    resolveVideoModelSegmentCapability({
      modelId: input.videoModelId,
      provider: input.provider,
      transport: input.transport,
    });
  const warnings: VideoSegmentWarning[] = [];
  let effectiveMode = input.mode;
  let fallbackReason: string | undefined;

  if (input.mode !== "per_shot" && !capability.supportsMultiShotPrompt) {
    effectiveMode = "per_shot";
    fallbackReason = "selected_model_does_not_support_multi_shot";
    warnings.push(
      warning(
        "multi_shot_not_supported",
        "Selected model does not have reviewed multi-shot capability; using per-shot segments.",
        { source: "fallback" }
      )
    );
  }

  const groups = groupShots(
    input.shots,
    effectiveMode,
    capability,
    input.manualGroupSize
  );
  const segments = groups.map((shots, index) =>
    buildSegment(shots, index, input, capability)
  );
  const plan = VideoSegmentPlanSchema.parse({
    schemaVersion: 1,
    sourceSurface: input.sourceSurface,
    mode: input.mode,
    effectiveMode,
    manualGroupSize: input.manualGroupSize,
    videoModelId: input.videoModelId,
    provider: input.provider,
    transport: input.transport,
    audioStrategy: input.audioStrategy,
    referenceMode: input.referenceMode,
    creativeBrief: input.creativeBrief,
    motionDirection: input.motionDirection,
    creativePresets: input.creativePresets,
    segments,
    fallbackReason,
    warnings,
    planHash: stableHash({
      sourceSurface: input.sourceSurface,
      mode: input.mode,
      videoModelId: input.videoModelId,
      shotIds: input.shots.map((shot) => shot.shotId),
      segments: segments.map((segment) => segment.shotIds),
    }),
  });
  return plan;
}
