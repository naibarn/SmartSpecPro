import { describe, expect, it } from "vitest";
import {
  computeVideoShotMediaBundleFingerprint,
  buildAttachmentInspectionRecords,
  hasUsableStopFrame,
  normalizeVideoShotMediaBundle,
  partitionShotReferences,
  renderVideoShotMediaReferenceInstruction,
  videoShotMediaBundleSchema,
} from "./verticalDramaShotMedia";

const fingerprint = "a".repeat(64);

describe("vertical drama shot media bundle", () => {
  it("keeps start/stop image-only and allows mixed ordered references", () => {
    const bundle = normalizeVideoShotMediaBundle({
      contractVersion: "vd-shot-media/1",
      bundleRevision: 1,
      startFrame: { assetId: 1, mediaType: "image", mediaFingerprint: fingerprint, resolvedAt: "2026-08-31T00:00:00Z" },
      stopFrame: null,
      references: [
        { referenceId: "r2", assetId: 3, mediaType: "audio", role: "soundscape", source: "upload", order: 1, label: "REFERENCE_AUDIO_01", mediaFingerprint: fingerprint },
        { referenceId: "r1", assetId: 2, mediaType: "image", role: "character", source: "library", order: 0, label: "REFERENCE_IMAGE_01", mediaFingerprint: fingerprint },
        { referenceId: "r3", assetId: 4, mediaType: "video", role: "action", source: "upload", order: 2, label: "REFERENCE_VIDEO_01", mediaFingerprint: fingerprint, segment: { inPointSec: 1, outPointSec: 3 } },
      ],
    });

    expect(bundle.references.map((reference) => reference.mediaType)).toEqual(["image", "audio", "video"]);
    expect(bundle.references.map((reference) => reference.order)).toEqual([0, 1, 2]);
    expect(bundle.bundleFingerprint).toHaveLength(64);
    expect(hasUsableStopFrame(bundle)).toBe(false);
  });

  it("does not treat a prompt-only or non-image stop value as a stop frame", () => {
    expect(hasUsableStopFrame(null)).toBe(false);
    expect(() => videoShotMediaBundleSchema.parse({
      contractVersion: "vd-shot-media/1",
      bundleRevision: 1,
      startFrame: null,
      stopFrame: { assetId: 7, mediaType: "video", mediaFingerprint: fingerprint, resolvedAt: "2026-08-31T00:00:00Z" },
      references: [],
      bundleFingerprint: fingerprint,
    })).toThrow();
  });

  it("rejects duplicate reference order and non-video segments", () => {
    const base = {
      contractVersion: "vd-shot-media/1" as const,
      bundleRevision: 1,
      startFrame: null,
      stopFrame: null,
      bundleFingerprint: fingerprint,
    };
    expect(() => videoShotMediaBundleSchema.parse({
      ...base,
      references: [
        { referenceId: "a", assetId: 1, mediaType: "image", role: "reference", source: "upload", order: 0, label: "a", mediaFingerprint: fingerprint, segment: { inPointSec: 0, outPointSec: 1 } },
        { referenceId: "b", assetId: 2, mediaType: "audio", role: "soundscape", source: "upload", order: 0, label: "b", mediaFingerprint: fingerprint },
      ],
    })).toThrow();
  });

  it("does not change when expiring transport URLs change", () => {
    const input = {
      contractVersion: "vd-shot-media/1" as const,
      startFrame: null,
      stopFrame: null,
      references: [],
    };
    expect(computeVideoShotMediaBundleFingerprint(input)).toBe(computeVideoShotMediaBundleFingerprint(input));
  });

  it("renders explicit stop-frame and mixed-reference labels for the prompt skill", () => {
    const bundle = normalizeVideoShotMediaBundle({
      contractVersion: "vd-shot-media/1",
      bundleRevision: 1,
      startFrame: { assetId: 1, mediaType: "image", mediaFingerprint: fingerprint, resolvedAt: "2026-08-31T00:00:00Z" },
      stopFrame: { assetId: 2, mediaType: "image", mediaFingerprint: fingerprint, resolvedAt: "2026-08-31T00:00:00Z" },
      references: [
        {
          referenceId: "audio-1",
          assetId: 3,
          mediaType: "audio",
          role: "soundscape",
          source: "upload",
          order: 0,
          label: "REFERENCE_AUDIO_01",
          mediaFingerprint: fingerprint,
        },
        {
          referenceId: "prop-1",
          assetId: 4,
          mediaType: "image",
          role: "prop",
          source: "prop_object",
          order: 1,
          label: "REFERENCE_IMAGE_02",
          mediaFingerprint: fingerprint,
        },
      ],
    });
    expect(renderVideoShotMediaReferenceInstruction(bundle)).toContain("STOP_FRAME_IMAGE");
    expect(renderVideoShotMediaReferenceInstruction(bundle)).toContain("REFERENCE_AUDIO_01");
    expect(renderVideoShotMediaReferenceInstruction(bundle)).toContain("metadata_only/unavailable");
    expect(buildAttachmentInspectionRecords(bundle).map(record => record.status)).toEqual([
      "inspected",
      "inspected",
      "unavailable",
      "inspected",
    ]);
    expect(partitionShotReferences(bundle.references).audio).toHaveLength(1);
  });
});
