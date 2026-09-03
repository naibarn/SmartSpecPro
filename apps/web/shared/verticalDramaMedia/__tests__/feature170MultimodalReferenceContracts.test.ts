import { describe, expect, it } from "vitest";
import { referenceFramePackSchema, shotVideoGenerationJobPayloadSchema } from "../contracts";

const fingerprint = "b".repeat(64);
const imageFrame = {
  assetId: "image-1",
  revision: "rev-1",
  fingerprint,
  storageKey: "series/1/image.png",
  width: 1080,
  height: 1920,
  contentType: "image/png" as const,
};

describe("Feature 170 worker media contract", () => {
  it("reads legacy image-only packs and accepts the new typed array", () => {
    const legacy = referenceFramePackSchema.parse({
      packId: "pack-legacy",
      packRevision: "rev-1",
      frames: [],
      lastFrame: null,
      referenceVideoAssetId: null,
      referenceAudioAssetId: null,
    });
    expect(legacy.references).toBeUndefined();

    const next = referenceFramePackSchema.parse({
      ...legacy,
      contractVersion: "vd-shot-media/1",
      bundleRevision: 2,
      bundleFingerprint: fingerprint,
      references: [
        { assetId: "video-1", fingerprint, mediaType: "video", role: "action", order: 0, label: "REFERENCE_VIDEO_01", segment: { inPointSec: 0, outPointSec: 2 } },
        { assetId: "audio-1", fingerprint, mediaType: "audio", role: "soundscape", order: 1, label: "REFERENCE_AUDIO_01" },
      ],
    });
    expect(next.references?.map((item) => item.mediaType)).toEqual(["video", "audio"]);
  });

  it("accepts an optional image-only stop frame without breaking old payloads", () => {
    const payload = shotVideoGenerationJobPayloadSchema.parse({
      kind: "shot_video_generation",
      seriesId: "series-1",
      binding: {
        seriesId: "series-1",
        rootId: "root-1",
        rootFingerprint: "root-fingerprint",
        bindingRevision: 1,
        workspaceMode: "managed_local",
        status: "active",
      },
      episodeId: "episode-1",
      shotId: "shot-1",
      shotRevision: "shot-rev-1",
      startFrame: imageFrame,
      stopFrame: { ...imageFrame, assetId: "image-stop" },
      referenceFrames: null,
      workflowRequest: {
        intent: "shot_generation",
        workflowFamily: "family-1",
        requestedWorkflowId: null,
        startFrame: imageFrame,
        stopFrame: { ...imageFrame, assetId: "image-stop" },
        referenceFrames: null,
        policyRevision: "policy-1",
      },
      workflowResolution: {
        resolutionId: "resolution-1",
        selectedWorkflowId: "workflow-1",
        selectedBy: "admin_default",
        policyRevision: "policy-1",
        capabilitySnapshotRevision: "capability-1",
        immutable: true,
      },
      budget: { maxDurationMs: 8000, minDurationMs: 1000, maxBrollMs: 0, preserveNarrativeAudio: true },
      idempotencyKey: "idempotency-1",
    });
    expect(payload.stopFrame?.assetId).toBe("image-stop");
  });

  it("carries mixed typed references and the stop frame in one worker payload", () => {
    const payload = shotVideoGenerationJobPayloadSchema.parse({
      kind: "shot_video_generation",
      seriesId: "series-1",
      binding: {
        seriesId: "series-1",
        rootId: "root-1",
        rootFingerprint: "root-fingerprint",
        bindingRevision: 1,
        workspaceMode: "managed_local",
        status: "active",
      },
      episodeId: "episode-1",
      shotId: "shot-1",
      shotRevision: "shot-rev-1",
      startFrame: imageFrame,
      stopFrame: { ...imageFrame, assetId: "image-stop" },
      referenceFrames: {
        packId: "pack-1",
        packRevision: "rev-1",
        frames: [],
        lastFrame: null,
        referenceVideoAssetId: null,
        referenceAudioAssetId: null,
        contractVersion: "vd-shot-media/1",
        bundleRevision: 2,
        bundleFingerprint: fingerprint,
        references: [
          { assetId: "video-1", fingerprint, mediaType: "video", role: "action", order: 0, label: "REFERENCE_VIDEO_01" },
          { assetId: "audio-1", fingerprint, mediaType: "audio", role: "soundscape", order: 1, label: "REFERENCE_AUDIO_01" },
        ],
      },
      workflowRequest: {
        intent: "shot_generation",
        workflowFamily: "family-1",
        requestedWorkflowId: null,
        startFrame: imageFrame,
        stopFrame: { ...imageFrame, assetId: "image-stop" },
        referenceFrames: null,
        policyRevision: "policy-1",
      },
      workflowResolution: {
        resolutionId: "resolution-1",
        selectedWorkflowId: "workflow-1",
        selectedBy: "admin_default",
        policyRevision: "policy-1",
        capabilitySnapshotRevision: "capability-1",
        immutable: true,
      },
      budget: { maxDurationMs: 8000, minDurationMs: 1000, maxBrollMs: 0, preserveNarrativeAudio: true },
      idempotencyKey: "idempotency-2",
    });
    expect(payload.referenceFrames?.references?.map(item => item.mediaType)).toEqual(["video", "audio"]);
    expect(payload.stopFrame?.assetId).toBe("image-stop");
  });
});
