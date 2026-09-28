import { describe, expect, it } from "vitest";
import {
  parseVideoCapabilityProfile,
  selectVideoCapabilityMode,
  type VideoCapabilityProfile,
} from "../verticalDramaVideoCapabilityProfile";

const mode = {
  id: "reference-to-video",
  acceptsStartFrame: true,
  acceptsStopFrame: false,
  acceptsReferenceImages: true,
  acceptsReferenceVideos: true,
  acceptsReferenceAudio: true,
  allowsMixedReferences: true,
  maxImages: 9,
  maxVideos: 3,
  maxAudio: 3,
  maxTotalReferences: 15,
  maxPayloadBytes: null,
  maxVideoDurationSec: 30,
  startFrameConsumesImageSlot: false,
  requiresVisualReferenceForAudio: true,
  supportedReferenceRoles: ["reference", "character", "location", "action", "soundscape"],
  preservesStartStopSemanticsWithReferences: false,
  transport: "generic_typed_media" as const,
  nativeFieldMap: { references: "content" },
};

const profile: VideoCapabilityProfile = {
  providerFamily: "seedance",
  modelKey: "seedance-2.0",
  displayName: "Seedance 2.0",
  capabilityProfileVersion: "test-1",
  capabilitySource: "provider_manifest",
  modes: [
    {
      ...mode,
      id: "text-to-video",
      acceptsStartFrame: false,
      acceptsReferenceImages: false,
      acceptsReferenceVideos: false,
      acceptsReferenceAudio: false,
      allowsMixedReferences: false,
      maxImages: 0,
      maxVideos: 0,
      maxAudio: 0,
      maxTotalReferences: 0,
      supportedReferenceRoles: [],
      preservesStartStopSemanticsWithReferences: false,
    },
    mode,
  ],
};

function reference(mediaType: "image" | "video" | "audio", order: number) {
  return {
    referenceId: `${mediaType}-${order}`,
    assetId: order + 1,
    mediaType,
    role: mediaType === "audio" ? "soundscape" as const : "reference" as const,
    source: "upload" as const,
    order,
    label: `REFERENCE_${mediaType.toUpperCase()}_${order}`,
    mediaFingerprint: "a".repeat(64),
  };
}

describe("vertical drama video capability profiles", () => {
  it("selects a declared mixed-reference mode without version-specific logic", () => {
    const result = selectVideoCapabilityMode(profile, {
      startFrame: true,
      stopFrame: false,
      references: [reference("image", 0), reference("video", 1), reference("audio", 2)],
    });
    expect(result.mode.id).toBe("reference-to-video");
    expect(result.acceptedReferenceIds).toHaveLength(3);
  });

  it("fails closed when stop semantics cannot be preserved", () => {
    const result = selectVideoCapabilityMode(profile, {
      startFrame: true,
      stopFrame: true,
      references: [reference("image", 0)],
    });
    expect(result.mode.id).toBe("unsupported");
    expect(result.blockedReferenceIds).toEqual(["image-0"]);
  });

  it("rejects incomplete profile data", () => {
    expect(parseVideoCapabilityProfile({ modelKey: "future-model" })).toBeNull();
  });

  it("fails closed for a stop frame without a real start frame", () => {
    const result = selectVideoCapabilityMode(profile, {
      startFrame: false,
      stopFrame: true,
      references: [],
    });
    expect(result.mode.id).toBe("unsupported");
    expect(result.blockingReasons).toContain("stop frame requires a real start frame");
  });

  it("accepts a future provider version through the same manifest shape", () => {
    const futureProfile = parseVideoCapabilityProfile({
      ...profile,
      modelKey: "seedance-2.6",
      capabilityProfileVersion: "seedance/2.6",
    });
    expect(futureProfile).not.toBeNull();
    expect(selectVideoCapabilityMode(futureProfile!, {
      startFrame: true,
      stopFrame: false,
      references: [reference("video", 0), reference("audio", 1)],
    }).mode.id).toBe("reference-to-video");
  });

  it("counts a unified-transport Start Frame against the image budget", () => {
    const grokProfile: VideoCapabilityProfile = {
      ...profile,
      providerFamily: "grok-imagine-video",
      modelKey: "grok-imagine-video-1-5-preview",
      modes: [{
        ...mode,
        acceptsReferenceVideos: false,
        acceptsReferenceAudio: false,
        allowsMixedReferences: false,
        maxImages: 7,
        maxVideos: 0,
        maxAudio: 0,
        maxTotalReferences: 7,
        startFrameConsumesImageSlot: true,
        transport: "kie",
        nativeFieldMap: { startFrame: "image_urls", images: "image_urls" },
      }],
    };
    expect(selectVideoCapabilityMode(grokProfile, {
      startFrame: true,
      stopFrame: false,
      references: Array.from({ length: 6 }, (_, index) => reference("image", index)),
    }).mode.id).toBe("reference-to-video");
    expect(selectVideoCapabilityMode(grokProfile, {
      startFrame: true,
      stopFrame: false,
      references: Array.from({ length: 7 }, (_, index) => reference("image", index)),
    }).mode.id).toBe("unsupported");
  });
});
