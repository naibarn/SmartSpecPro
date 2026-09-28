import { z } from "zod";
import type { VideoShotMediaBundle } from "@shared/verticalDramaShotMedia";

export const videoCapabilityModeSchema = z.object({
  id: z.string().trim().min(1).max(80),
  acceptsStartFrame: z.boolean(),
  acceptsStopFrame: z.boolean(),
  acceptsReferenceImages: z.boolean(),
  acceptsReferenceVideos: z.boolean(),
  acceptsReferenceAudio: z.boolean(),
  allowsMixedReferences: z.boolean(),
  maxImages: z.number().int().nonnegative().nullable(),
  maxVideos: z.number().int().nonnegative().nullable(),
  maxAudio: z.number().int().nonnegative().nullable(),
  maxTotalReferences: z.number().int().nonnegative().nullable(),
  maxPayloadBytes: z.number().int().positive().nullable(),
  maxVideoDurationSec: z.number().positive().nullable(),
  /**
   * Some transports expose only one ordered image array. In that contract the
   * approved Start Frame is serialized as the first reference image and uses
   * one slot from the provider's image/reference limit.
   */
  startFrameConsumesImageSlot: z.boolean().default(false),
  requiresVisualReferenceForAudio: z.boolean().default(false),
  supportedReferenceRoles: z.array(z.string().trim().min(1).max(80)).max(32),
  preservesStartStopSemanticsWithReferences: z.boolean(),
  transport: z.enum(["kie", "gemini", "veo", "generic_typed_media"]),
  nativeFieldMap: z.record(z.string().trim().min(1), z.string().trim().min(1)),
}).strict();
export type VideoCapabilityMode = z.infer<typeof videoCapabilityModeSchema>;

export const videoCapabilityProfileSchema = z.object({
  providerFamily: z.string().trim().min(1).max(80),
  modelKey: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(160),
  capabilityProfileVersion: z.string().trim().min(1).max(80),
  capabilitySource: z.enum(["runtime_catalog", "provider_manifest"]),
  modes: z.array(videoCapabilityModeSchema).min(1).max(16),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const mode of value.modes) {
    if (ids.has(mode.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["modes"], message: "capability mode ids must be unique" });
    }
    ids.add(mode.id);
  }
});
export type VideoCapabilityProfile = z.infer<typeof videoCapabilityProfileSchema>;

export type VideoCapabilityInput = {
  startFrame: boolean;
  stopFrame: boolean;
  references: VideoShotMediaBundle["references"];
};

export type VideoCapabilitySelection = {
  mode: VideoCapabilityMode;
  acceptedReferenceIds: string[];
  blockedReferenceIds: string[];
  blockingReasons: string[];
};

function counts(input: VideoCapabilityInput) {
  return input.references.reduce(
    (result, reference) => {
      result[reference.mediaType] += 1;
      return result;
    },
    { image: 0, video: 0, audio: 0 },
  );
}

function supportsReferences(mode: VideoCapabilityMode, input: VideoCapabilityInput): boolean {
  const mediaCounts = counts(input);
  const providerImageCount =
    mediaCounts.image +
    (input.startFrame && mode.startFrameConsumesImageSlot ? 1 : 0);
  const providerReferenceCount =
    input.references.length +
    (input.startFrame && mode.startFrameConsumesImageSlot ? 1 : 0);
  if (mediaCounts.image > 0 && !mode.acceptsReferenceImages) return false;
  if (mediaCounts.video > 0 && !mode.acceptsReferenceVideos) return false;
  if (mediaCounts.audio > 0 && !mode.acceptsReferenceAudio) return false;
  const mediaTypeCount = [mediaCounts.image, mediaCounts.video, mediaCounts.audio]
    .filter(count => count > 0).length;
  if (mediaTypeCount > 1 && !mode.allowsMixedReferences) return false;
  if (mode.maxImages !== null && providerImageCount > mode.maxImages) return false;
  if (mode.maxVideos !== null && mediaCounts.video > mode.maxVideos) return false;
  if (mode.maxAudio !== null && mediaCounts.audio > mode.maxAudio) return false;
  if (mode.maxTotalReferences !== null && providerReferenceCount > mode.maxTotalReferences) return false;
  if (mediaCounts.audio > 0 && mode.requiresVisualReferenceForAudio && mediaCounts.image + mediaCounts.video === 0) return false;
  if (input.references.some(reference => !mode.supportedReferenceRoles.includes(reference.role))) return false;
  return true;
}

function modeSupportsFrames(mode: VideoCapabilityMode, input: VideoCapabilityInput): boolean {
  if (input.startFrame && !mode.acceptsStartFrame) return false;
  if (input.stopFrame && !mode.acceptsStopFrame) return false;
  if (input.stopFrame && input.startFrame && !mode.acceptsStopFrame) return false;
  if (input.references.length > 0 && input.stopFrame && !mode.preservesStartStopSemanticsWithReferences) return false;
  return true;
}

export function selectVideoCapabilityMode(
  profile: VideoCapabilityProfile,
  input: VideoCapabilityInput,
): VideoCapabilitySelection {
  if (input.stopFrame && !input.startFrame) {
    return {
      mode: {
        id: "unsupported",
        acceptsStartFrame: false,
        acceptsStopFrame: false,
        acceptsReferenceImages: false,
        acceptsReferenceVideos: false,
        acceptsReferenceAudio: false,
        allowsMixedReferences: false,
        maxImages: 0,
        maxVideos: 0,
        maxAudio: 0,
        maxTotalReferences: 0,
        maxPayloadBytes: null,
        maxVideoDurationSec: null,
        startFrameConsumesImageSlot: false,
        requiresVisualReferenceForAudio: false,
        supportedReferenceRoles: [],
        preservesStartStopSemanticsWithReferences: false,
        transport: "generic_typed_media",
        nativeFieldMap: {},
      },
      acceptedReferenceIds: [],
      blockedReferenceIds: input.references.map(reference => reference.referenceId),
      blockingReasons: ["stop frame requires a real start frame"],
    };
  }
  const orderedModes = [...profile.modes].sort((a, b) => {
    const score = (mode: VideoCapabilityMode) =>
      input.stopFrame && mode.acceptsStopFrame ? 4 : 0;
    return score(b) - score(a);
  });
  const selected = orderedModes.find(mode =>
    modeSupportsFrames(mode, input) && supportsReferences(mode, input),
  );
  if (selected) {
    return {
      mode: selected,
      acceptedReferenceIds: input.references.map(reference => reference.referenceId),
      blockedReferenceIds: [],
      blockingReasons: [],
    };
  }

  const referenceIds = input.references.map(reference => reference.referenceId);
  const reasons: string[] = [];
  if (input.startFrame || input.stopFrame) reasons.push("selected model has no compatible temporal frame mode");
  if (input.references.length > 0) reasons.push("selected model has no compatible reference modality/limit mode");
  return {
    mode: {
      id: "unsupported",
      acceptsStartFrame: false,
      acceptsStopFrame: false,
      acceptsReferenceImages: false,
      acceptsReferenceVideos: false,
      acceptsReferenceAudio: false,
      allowsMixedReferences: false,
      maxImages: 0,
      maxVideos: 0,
      maxAudio: 0,
      maxTotalReferences: 0,
      maxPayloadBytes: null,
      maxVideoDurationSec: null,
      startFrameConsumesImageSlot: false,
      requiresVisualReferenceForAudio: false,
      supportedReferenceRoles: [],
      preservesStartStopSemanticsWithReferences: false,
      transport: "generic_typed_media",
      nativeFieldMap: {},
    },
    acceptedReferenceIds: [],
    blockedReferenceIds: referenceIds,
    blockingReasons: reasons,
  };
}

export function parseVideoCapabilityProfile(
  value: unknown,
): VideoCapabilityProfile | null {
  const parsed = videoCapabilityProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
