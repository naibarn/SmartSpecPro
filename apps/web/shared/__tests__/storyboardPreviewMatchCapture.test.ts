import { describe, expect, it } from "vitest";

import {
  buildPreviewMatchCompositionPayloadFromHyperframesPreview,
  computePreviewMatchFinalCompositeConfigHash,
  computePreviewMatchCompositionHash,
  computePreviewMatchTimelineHash,
  storyboardPreviewMatchCaptureEngineSchema,
  storyboardPreviewMatchCaptureProjectionSchema,
  storyboardPreviewMatchCaptureQualitySchema,
  withPreviewMatchCompositionHashes,
} from "../storyboardPreviewMatchCapture";

function baseHyperframesPreview() {
  return {
    output: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationSeconds: 6,
    },
    text: {
      overlayPreset: "badge_cascade",
      subtitlePreset: "pill",
      textMotionPreset: "smooth",
      fontFamily: "Prompt",
    },
    audio: {
      preserveNativeAudio: true,
      musicPresetId: null,
      sfxPresetIds: [],
    },
    shots: [
      {
        id: "shot-1",
        index: 0,
        sourceClipId: "clip-1",
        sourceVideoRef: "storage://clip-1.mp4",
        mediaStartSec: 0,
        startSec: 0,
        endSec: 3,
        durationSeconds: 3,
        overlayPreset: "badge_cascade",
        animationPreset: "smooth_reveal",
        transition: "fade",
        textMotionPreset: "smooth",
        onScreenText: ["คุณแม่ทราบกันไหม"],
        subtitleCues: [
          { startSec: 0.4, endSec: 2.2, text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก" },
        ],
        subtitleText: ["display text only"],
        subtitleVtt: "WEBVTT",
        subtitleSrt: "1",
      },
    ],
  };
}

describe("storyboardPreviewMatchCapture shared contract", () => {
  it("accepts only known quality values", () => {
    expect(storyboardPreviewMatchCaptureQualitySchema.parse("standard")).toBe("standard");
    expect(storyboardPreviewMatchCaptureQualitySchema.parse("high")).toBe("high");
    expect(() => storyboardPreviewMatchCaptureQualitySchema.parse("draft")).toThrow();
  });

  it("keeps preview-match capture as a sibling render engine", () => {
    expect(storyboardPreviewMatchCaptureEngineSchema.parse("hyperframes_worker")).toBe(
      "hyperframes_worker",
    );
    expect(storyboardPreviewMatchCaptureEngineSchema.parse("preview_match_browser_capture")).toBe(
      "preview_match_browser_capture",
    );
  });

  it("validates a safe capture projection contract", () => {
    const parsed = storyboardPreviewMatchCaptureProjectionSchema.parse({
      captureJobId: "capture-1",
      engine: "preview_match_browser_capture",
      quality: "standard",
      status: "capturing",
      stage: "capture_browser",
      progressPercent: 42,
      previewCompositionHash: "pmc_12345678",
      timelineHash: "pmt_12345678",
      safeMessage: "Capturing preview runtime",
      failureCode: null,
      canCancel: true,
      canRetry: false,
      outputUrl: null,
    });

    expect(parsed.safeDiagnostics).toEqual([]);
    expect(
      storyboardPreviewMatchCaptureProjectionSchema.parse({
        ...parsed,
        status: "verification_failed",
        failureCode: "render_surface_mismatch",
      }).failureCode,
    ).toBe("render_surface_mismatch");
    expect(() =>
      storyboardPreviewMatchCaptureProjectionSchema.parse({
        ...parsed,
        failureCode: "raw_worker_stack_trace",
      }),
    ).toThrow();
  });

  it("builds a payload that preserves structured subtitle cues", () => {
    const payload = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
      baseHyperframesPreview(),
    );

    expect(payload.engine).toBe("preview_match_browser_capture");
    expect(payload.shots[0].subtitleCues).toEqual([
      { startSec: 0.4, endSec: 2.2, text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก" },
    ]);
    expect(payload.shots[0].subtitleText).toEqual(["display text only"]);
  });

  it("uses timeline start/end as the shot duration source of truth", () => {
    const preview = baseHyperframesPreview();
    preview.output.durationSeconds = 238.3;
    preview.shots[0].startSec = 30;
    preview.shots[0].endSec = 60;
    preview.shots[0].durationSeconds = 238.3;

    const payload = buildPreviewMatchCompositionPayloadFromHyperframesPreview(preview);

    expect(payload.output.durationSeconds).toBe(238.3);
    expect(payload.shots[0].durationSeconds).toBe(30);
  });

  it("changes the composition hash when render-facing fields change", () => {
    const original = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
      baseHyperframesPreview(),
    );
    const changed = buildPreviewMatchCompositionPayloadFromHyperframesPreview({
      ...baseHyperframesPreview(),
      text: {
        ...baseHyperframesPreview().text,
        overlayPreset: "premium_product_hero",
      },
    });

    expect(computePreviewMatchCompositionHash(changed)).not.toBe(
      computePreviewMatchCompositionHash(original),
    );
  });

  it("changes the composition hash when capture audio events are enabled", () => {
    const original = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
      baseHyperframesPreview(),
    );
    const changed = buildPreviewMatchCompositionPayloadFromHyperframesPreview({
      ...baseHyperframesPreview(),
      audio: {
        ...baseHyperframesPreview().audio,
        includeAudioEventsInCapture: true,
      },
    });

    expect(computePreviewMatchCompositionHash(changed)).not.toBe(
      computePreviewMatchCompositionHash(original),
    );
  });

  it("changes the timeline hash when subtitle timing changes", () => {
    const original = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
      baseHyperframesPreview(),
    );
    const changedPreview = baseHyperframesPreview();
    changedPreview.shots[0].subtitleCues[0].startSec = 1.1;
    const changed = buildPreviewMatchCompositionPayloadFromHyperframesPreview(changedPreview);

    expect(computePreviewMatchTimelineHash(changed)).not.toBe(
      computePreviewMatchTimelineHash(original),
    );
  });

  it("ignores non-rendering UI-only state when hashing", () => {
    const original = buildPreviewMatchCompositionPayloadFromHyperframesPreview({
      ...baseHyperframesPreview(),
      uiOnlyExpanded: true,
    });
    const changed = buildPreviewMatchCompositionPayloadFromHyperframesPreview({
      ...baseHyperframesPreview(),
      uiOnlyExpanded: false,
    });

    expect(computePreviewMatchCompositionHash(changed)).toBe(
      computePreviewMatchCompositionHash(original),
    );
  });

  it("hydrates config, preview, and timeline hashes into the payload", () => {
    const payload = buildPreviewMatchCompositionPayloadFromHyperframesPreview(
      baseHyperframesPreview(),
      {
        productId: "product-1",
        runId: "run-1",
        storyboardReviewId: "review-1",
      },
    );
    const hydrated = withPreviewMatchCompositionHashes(payload);

    expect(hydrated.finalCompositeConfigHash).toBe(
      computePreviewMatchFinalCompositeConfigHash({
        ...payload,
        finalCompositeConfigHash: "pending_config_hash",
        previewCompositionHash: "pending_preview_hash",
        timelineHash: "pending_timeline_hash",
      }),
    );
    expect(hydrated.previewCompositionHash).toMatch(/^pmc_/);
    expect(hydrated.timelineHash).toMatch(/^pmt_/);
  });
});
