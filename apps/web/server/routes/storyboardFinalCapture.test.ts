import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createStoryboardFinalCaptureRouter,
  signStoryboardFinalCaptureToken,
} from "./storyboardFinalCapture";
import {
  buildPreviewMatchCompositionPayloadFromHyperframesPreview,
  withPreviewMatchCompositionHashes,
} from "../../shared/storyboardPreviewMatchCapture";
import type { StoryboardPreviewMatchCaptureRepository } from "../services/storyboardPreviewMatchCaptureService";

function makePayload() {
  return withPreviewMatchCompositionHashes(
    buildPreviewMatchCompositionPayloadFromHyperframesPreview(
      {
        output: { width: 1080, height: 1920, fps: 30, durationSeconds: 6 },
        text: {
          overlayPreset: "badge_cascade",
          subtitlePreset: "classic_box",
          subtitleFontSizePx: 34,
          textMotionPreset: "slide_right_to_left",
          fontFamily: "Prompt",
        },
        shots: [
          {
            id: "shot-1",
            index: 0,
            sourceClipId: "clip-1",
            sourceVideoRef: "/api/storage/files/media-jobs/assets/clip.mp4",
            startSec: 0,
            endSec: 6,
            durationSeconds: 6,
            overlayPreset: "badge_cascade",
            animationPreset: "glow_feature",
            textMotionPreset: "slide_right_to_left",
            onScreenText: ["hello"],
            subtitleCues: [{ startSec: 0, endSec: 2, text: "caption" }],
          },
        ],
      },
      {
        tenantId: "tenant-1",
        productId: "product-1",
        runId: "run-1",
        storyboardReviewId: "review-1",
      },
    ),
  );
}

function makeRepo(payload = makePayload()): StoryboardPreviewMatchCaptureRepository {
  const job = {
    id: "capture-1",
    tenantId: "tenant-1",
    userId: 7,
    productId: "product-1",
    runId: "run-1",
    storyboardReviewId: "review-1",
    engine: "preview_match_browser_capture",
    quality: "standard",
    status: "preparing_assets",
    stage: "prepare_assets",
    progressPercent: 10,
    failureCode: null,
    safeMessage: null,
    safeDiagnosticsJson: [],
    idempotencyKey: "idem",
    previewCompositionHash: payload.previewCompositionHash,
    timelineHash: payload.timelineHash,
    finalCompositeConfigHash: payload.finalCompositeConfigHash,
    payloadJson: payload,
    outputJson: {},
    evidenceJson: {},
    billingJson: {},
    activeAttemptId: "attempt-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    cancelledAt: null,
  };
  const attempt = {
    id: "attempt-1",
    captureJobId: "capture-1",
    attemptNumber: 1,
    status: "active",
    stage: "prepare_assets",
    failureCode: null,
    routeTokenHash: null,
    assetManifestJson: {},
    workspaceJson: {},
    outputJson: {},
    evidenceJson: {},
    startedAt: new Date(),
    completedAt: null,
    staleAt: null,
    cancelledAt: null,
    updatedAt: new Date(),
  };
  return {
    findRun: async () => null,
    findJobByIdempotencyKey: async () => null,
    findJobById: async () => null,
    findJobForInternalRoute: async input =>
      input.captureJobId === "capture-1" && input.tenantId === "tenant-1" ? job as any : null,
    findLatestJob: async () => null,
    insertJob: async values => values as any,
    updateJob: async () => null,
    markActiveAttemptStale: async () => undefined,
    insertAttempt: async values => values as any,
    findAttempt: async (_captureJobId, attemptId) => attemptId === "attempt-1" ? attempt as any : null,
  };
}

describe("storyboardFinalCapture route", () => {
  it("renders internal capture HTML when JWT claims match the attempt", async () => {
    const payload = makePayload();
    const app = express();
    app.use("/internal", createStoryboardFinalCaptureRouter({ deps: { repo: makeRepo(payload) } }));
    const token = signStoryboardFinalCaptureToken({
      captureJobId: "capture-1",
      attemptId: "attempt-1",
      tenantId: "tenant-1",
      userId: 7,
      previewCompositionHash: payload.previewCompositionHash,
      timelineHash: payload.timelineHash,
      expiresIn: "5m",
    });

    const response = await request(app)
      .get("/internal/storyboard-final-capture/capture-1")
      .set("X-Internal-Token", token);

    expect(response.status).toBe(200);
    expect(response.text).toContain("window.__storyboardCaptureReady");
    expect(response.text).toContain(payload.previewCompositionHash);
    expect(response.text).toContain("/api/storage/files/media-jobs/assets/clip.mp4");
    expect(response.text).toContain("resolveMediaUrl");
    expect(response.text).toContain("hf-preview-stage");
    expect(response.text).toContain("hf-preview-overlay-copy");
    expect(response.text).toContain("hf-sub-preview-inline");
    expect(response.text).toContain(".hf-preview-overlay-copy { position: absolute; left: 9%; top: 12.5%; width: 82%; height: 52%;");
    expect(response.text).toContain(".hf-sub-preview-inline { position: absolute; left: 7%; right: 7%; bottom: 32%;");
    expect(response.text).toContain("dataset.preset = shot.overlayPreset");
    expect(response.text).toContain("Plus Jakarta Sans");
    expect(response.text).toContain("family=Prompt");
    expect(response.text).toContain("family=Noto+Sans+Thai");
    expect(response.text).toContain('font-family: "Prompt", "Noto Sans Thai"');
    expect(response.text).toContain("const primaryFontFamily = \"Prompt\"");
    expect(response.text).toContain("waitForCaptureFonts");
    expect(response.text).toContain("document.fonts.check");
    expect(response.text).toContain("font_not_loaded:Prompt");
    expect(response.text).toContain("fontsReady: Boolean");
    expect(response.text).not.toContain("font-weight: 950");
    expect(response.text).toContain("line-height: 1.26");
    expect(response.text).toContain("padding-top: .16em");
    expect(response.text).toContain("overflow: visible;");
    expect(response.text).toContain("line-height: 1.34 !important");
    expect(response.text).toContain("padding-top: max(.28em, 12px) !important");
    expect(response.text).toContain("data-layer=\"opening_hook\"");
    expect(response.text).toContain("stage.dataset.layer");
    expect(response.text).toContain("background: #facc15");
    expect(response.text).toContain("data-preset=\"kinetic_bold_hook\"] .hf-preview-title { max-width: 96%; border-radius: 0; background: transparent");
    expect(response.text).not.toContain('data-preset="kinetic_bold_hook"] .hf-preview-title,\\n    .hf-preview-stage[data-preset="creator_top_punch"] .hf-preview-title');
    expect(response.text).toContain("previewSubtitleFontSizeCss");
    expect(response.text).toContain('hf-sub-preview-inline[data-subtitle-preset="classic_box"] .hf-sub-line { border-radius: 10px; background: rgba(0,0,0,.76); padding: 10px 14px');
    expect(response.text).toContain('hf-sub-preview-inline[data-subtitle-preset="karaoke_word"] .hf-sub-word');
    expect(response.text).toContain("renderSubtitleText");
    expect(response.text).toContain('.shot[data-transition="slide"]');
    expect(response.text).toContain('.shot[data-transition="zoom"]');
    expect(response.text).toContain('.shot[data-transition="whip"]');
    expect(response.text).toContain('frame.dataset.transition = shot.transition || "fade"');
    expect(response.text).toContain('stage.dataset.textMotion = shot.textMotionPreset');
    expect(response.text).toContain("restartMotionFor");
    expect(response.text).toContain('data-text-motion="wipe_reveal"');
    expect(response.text).toContain('data-text-motion="pop_scale"');
    expect(response.text).toContain("data-text-motion");
    expect(response.text).toContain("activeSubtitleCueForShot");
    expect(response.text).toContain("waitForVideoFrame");
    expect(response.text).toContain("syncShotVideo");
    expect(response.text).toContain("mediaTargetSecForShot");
    expect(response.text).toContain("video.autoplay = false");
    expect(response.text).toContain("video.loop = false");
    expect(response.text).not.toContain("Opening Hook 0-3s");
    expect(response.text).not.toContain("Overlay text");
    expect(response.text).not.toContain(">Subtitle<");
  });

  it("rejects tokens whose capture job claim does not match the URL", async () => {
    const app = express();
    app.use("/internal", createStoryboardFinalCaptureRouter({ deps: { repo: makeRepo() } }));

    const response = await request(app)
      .get("/internal/storyboard-final-capture/capture-1")
      .set(
        "X-Internal-Token",
        signStoryboardFinalCaptureToken({
          captureJobId: "capture-other",
          attemptId: "attempt-1",
          tenantId: "tenant-1",
          userId: 7,
          previewCompositionHash: "pmc_other",
          timelineHash: "pmt_other",
          expiresIn: "5m",
        }),
      );

    expect(response.status).toBe(401);
  });
});
