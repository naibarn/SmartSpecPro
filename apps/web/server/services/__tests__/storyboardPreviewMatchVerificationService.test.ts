import { describe, expect, it } from "vitest";

import {
  redactPreviewMatchCaptureEvidence,
  verifyPreviewMatchCaptureArtifacts,
} from "../storyboardPreviewMatchVerificationService";

describe("storyboardPreviewMatchVerificationService", () => {
  it("returns publishable artifact ids only after output policy passes", () => {
    const result = verifyPreviewMatchCaptureArtifacts({
      captureJobId: "capture-1",
      quality: "high",
      expected: {
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: 6,
        previewCompositionHash: "pmc_1",
        timelineHash: "pmt_1",
      },
      artifact: {
        id: "artifact-1",
        contentHash: "sha256:abc",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: 6,
        hasAudio: true,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.failureCode).toBeNull();
    expect(result.publishableArtifactIds).toEqual(["artifact-1"]);
    expect(result.evidenceRef).toMatch(/^spmc_ev_/);
  });

  it("blocks publish when native audio is required but the MP4 has no audio stream", () => {
    const result = verifyPreviewMatchCaptureArtifacts({
      captureJobId: "capture-1",
      quality: "standard",
      expected: {
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: 6,
        previewCompositionHash: "pmc_1",
        timelineHash: "pmt_1",
        requireAudioTrack: true,
      },
      artifact: {
        id: "artifact-1",
        contentHash: "sha256:abc",
        mimeType: "video/mp4",
        sizeBytes: 1000,
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: 6,
        hasAudio: false,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.safeDiagnostics).toContain("Encoded artifact is missing the required audio stream.");
  });

  it("blocks publish and returns safe diagnostics for invalid artifacts", () => {
    const result = verifyPreviewMatchCaptureArtifacts({
      captureJobId: "capture-1",
      quality: "standard",
      expected: {
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: 6,
        previewCompositionHash: "pmc_1",
        timelineHash: "pmt_1",
      },
      artifact: {
        id: "artifact-1",
        mimeType: "video/webm",
        width: 320,
        height: 320,
        fps: 12,
        durationSeconds: 1,
      },
      evidence: {
        signedUrl: "https://cdn.example/video.mp4?X-Amz-Signature=secret",
        localPath: "file:///tmp/capture.mp4",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("verification_failed");
    expect(result.publishableArtifactIds).toEqual([]);
    expect(result.safeDiagnostics.length).toBeGreaterThan(0);
    expect(result.evidence).toEqual(expect.objectContaining({
      signedUrl: "[redacted]",
      localPath: "[redacted]",
    }));
  });

  it("redacts nested sensitive keys and strings", () => {
    expect(
      redactPreviewMatchCaptureEvidence({
        ok: true,
        nested: { token: "secret", url: "https://x.test/a?Signature=secret" },
      }),
    ).toEqual({
      ok: true,
      nested: { token: "[redacted]", url: "[redacted]" },
    });
  });
});
