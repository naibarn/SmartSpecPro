import { describe, expect, it } from "vitest";

import {
  clearStagedRenderRefsFromMetadataForTest,
  clearStagedRenderRefsFromResultJsonForTest,
  isStagedRemotionRenderJobTerminalForTest,
} from "../marketplaceAutoReviewService";

describe("staged marketplace final render retry policy", () => {
  it("allows an intentional new render after the prior worker job completed", () => {
    expect(isStagedRemotionRenderJobTerminalForTest("completed")).toBe(true);
  });

  it("keeps active render jobs reusable to prevent duplicate submissions", () => {
    for (const status of [
      "pending",
      "queued",
      "claimed",
      "preparing",
      "running",
      "uploading",
      "publishing",
      "indexing",
    ]) {
      expect(isStagedRemotionRenderJobTerminalForTest(status)).toBe(false);
    }
  });

  it("treats failed and canceled jobs as terminal retry candidates", () => {
    for (const status of ["failed", "canceled", "expired"]) {
      expect(isStagedRemotionRenderJobTerminalForTest(status)).toBe(true);
    }
  });

  it("clears old video and finalization pointers before submitting a new render", () => {
    const metadata = {
      renderJobId: "old-job",
      renderEngine: "remotion_queue",
      renderSubmittedAt: 123,
      renderUrl: "https://example.test/old.mp4",
      renderResultUrl: "https://example.test/old-result.mp4",
      resultLibraryItemId: 42,
      renderArtifactProbe: { status: "passed" },
      finalRenderQaEnvelope: { qaEnvelopeId: "old-render-qa" },
      finalMediaQaEnvelope: { qaEnvelopeId: "old-media-qa" },
      renderStorageEnvelope: { storageRef: "old-render" },
      renderDistributionProfile: { profileId: "old-profile" },
      mediaArtifactInspection: { inspectionId: "old-inspection" },
      qaArtifactManifest: { manifestId: "old-manifest" },
      publishableAssetPackage: { packageId: "old-package" },
      warningOverlayVerification: { status: "passed" },
      stagedRenderAttempt: 2,
      renderCreditReservation: { creditAmount: 100 },
      stagedPipeline: { finalAssembly: { status: "ready" } },
    } as any;

    const cleared = clearStagedRenderRefsFromMetadataForTest(metadata) as any;

    for (const key of [
      "renderJobId",
      "renderEngine",
      "renderSubmittedAt",
      "renderUrl",
      "renderResultUrl",
      "resultLibraryItemId",
      "renderArtifactProbe",
      "finalRenderQaEnvelope",
      "finalMediaQaEnvelope",
      "renderStorageEnvelope",
      "renderDistributionProfile",
      "mediaArtifactInspection",
      "qaArtifactManifest",
      "publishableAssetPackage",
      "warningOverlayVerification",
    ]) {
      expect(cleared).not.toHaveProperty(key);
    }
    expect(cleared.stagedRenderAttempt).toBe(2);
    expect(cleared.renderCreditReservation).toEqual({ creditAmount: 100 });
    expect(cleared.stagedPipeline.finalAssembly.status).toBe("ready");
  });

  it("clears only old render result fields and preserves storyboard results", () => {
    const cleared = clearStagedRenderRefsFromResultJsonForTest({
      renderUrl: "https://example.test/old.mp4",
      libraryItemId: 42,
      jobId: "old-job",
      cached: true,
      publishableAssetPackage: { packageId: "old-package" },
      storyboardReviewId: "storyboard-1",
      frameUrls: ["https://example.test/frame.png"],
    });

    expect(cleared).toEqual({
      storyboardReviewId: "storyboard-1",
      frameUrls: ["https://example.test/frame.png"],
    });
  });
});
