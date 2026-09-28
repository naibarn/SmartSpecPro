/**
 * Coverage for `videoProjectQualityMetrics.ts` — pure deterministic metric
 * helpers + the credit-cost helper (Feature 133, section-06 §5.2). No
 * mocking: every helper is `input -> output`.
 */
import { describe, expect, it } from "vitest";

import { VideoProjectDocumentSchema } from "../../../shared/videoIntelligence/projectSchemas";
import type { RenderCostEstimate } from "../../../shared/videoIntelligence/cost";
import type { ClaimValidationResult } from "../validateProjectClaims";
import {
  computeCaptionCps,
  computeClaimCoverage,
  computeDurationVsNarration,
  computeLayerCounts,
  computeQualityMetrics,
  computeSafeAreaRect,
  computeSafeAreaViolations,
  estimateVideoProjectQualityLoopCredits,
} from "../videoProjectQualityMetrics";
import { compileVideoProject } from "../videoProjectCompiler";
import { MOTION_TEMPLATE_REGISTRY, type MotionTemplate } from "../../remotion/templates";

function baseSceneLayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "layer_1",
    type: "image",
    startFrame: 0,
    durationFrames: 60,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
    src: "https://cdn.example.com/img.png",
    fit: "cover",
    ...overrides,
  };
}

function buildScene(overrides: Record<string, unknown> = {}) {
  return {
    sceneId: "SC-001",
    startMs: 0,
    endMs: 5000,
    narration: null,
    narrationAudioAssetId: null,
    visual: { kind: "layers" },
    layers: [],
    motion: { intensity: "medium", camera: "static" },
    captionCues: [],
    ...overrides,
  };
}

function buildDocument(overrides: Record<string, unknown> = {}) {
  return VideoProjectDocumentSchema.parse({
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    content: { language: "th", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [buildScene()],
    audioTracks: [],
    captions: { presetId: "classic_box", burnIn: false, language: "th" },
    claims: [],
    qa: { targetScore: 8, maxLoops: 5 },
    ...overrides,
  });
}

function emptyClaimValidation(): ClaimValidationResult {
  return {
    mappedClaims: [],
    unmappedStatements: [],
    prohibitedClaims: [],
    coverage: 1,
    blocksFinalRender: false,
  };
}

describe("computeDurationVsNarration", () => {
  it("computes per-scene duration vs narration length", () => {
    // 70 chars of narration at the module's assumed rate needs ~4667ms,
    // close enough to a 5000ms scene to stay inside the acceptable band.
    const narration = "a".repeat(70);
    const document = buildDocument({
      scenes: [buildScene({ startMs: 0, endMs: 5000, narration })],
    });

    const result = computeDurationVsNarration(document);

    expect(result).toHaveLength(1);
    expect(result[0].sceneId).toBe("SC-001");
    expect(result[0].durationMs).toBe(5000);
    expect(result[0].narrationCharCount).toBe(70);
    expect(result[0].expectedNarrationMs).not.toBeNull();
    expect(result[0].flagged).toBe(false);
  });

  it("flags a scene whose narration is far too long for its allotted duration", () => {
    const narration = "a".repeat(500);
    const document = buildDocument({
      scenes: [buildScene({ startMs: 0, endMs: 1000, narration })],
    });

    const result = computeDurationVsNarration(document);

    expect(result[0].flagged).toBe(true);
  });
});

describe("computeCaptionCps", () => {
  it("computes caption chars-per-second per scene", () => {
    const document = buildDocument({
      scenes: [
        buildScene({
          captionCues: [
            { startMs: 0, endMs: 2000, text: "ten chars." }, // 10 chars / 2s = 5 cps
          ],
        }),
      ],
    });

    const result = computeCaptionCps(document);

    expect(result).toHaveLength(1);
    expect(result[0].cueCount).toBe(1);
    expect(result[0].maxCharsPerSecond).toBe(5);
    expect(result[0].averageCharsPerSecond).toBe(5);
    expect(result[0].flaggedCueCount).toBe(0);
  });

  it("flags a cue that reads faster than the comfortable threshold", () => {
    const document = buildDocument({
      scenes: [
        buildScene({
          captionCues: [
            // 60 chars in 1s = 60 cps, far above any comfortable reading speed.
            { startMs: 0, endMs: 1000, text: "x".repeat(60) },
          ],
        }),
      ],
    });

    const result = computeCaptionCps(document);

    expect(result[0].flaggedCueCount).toBe(1);
  });
});

describe("computeLayerCounts", () => {
  it("counts layers per scene and total", () => {
    const document = buildDocument({
      scenes: [
        buildScene({ sceneId: "SC-001", layers: [baseSceneLayer({ id: "l1" }), baseSceneLayer({ id: "l2" })] }),
        buildScene({ sceneId: "SC-002", layers: [baseSceneLayer({ id: "l3" })] }),
      ],
    });

    const result = computeLayerCounts(document);

    expect(result.perScene).toEqual([
      { sceneId: "SC-001", layerCount: 2 },
      { sceneId: "SC-002", layerCount: 1 },
    ]);
    expect(result.total).toBe(3);
    expect(result.maxLayersPerScene).toBe(2);
  });

  it("spec 143 §4.8/§4.13 — excludes `hidden` layers from perScene/total (a hidden layer never reaches the compiler)", () => {
    const document = buildDocument({
      scenes: [
        buildScene({
          sceneId: "SC-001",
          layers: [baseSceneLayer({ id: "visible" }), baseSceneLayer({ id: "invisible", hidden: true })],
        }),
      ],
    });

    const result = computeLayerCounts(document);
    expect(result.perScene).toEqual([{ sceneId: "SC-001", layerCount: 1 }]);
    expect(result.total).toBe(1);
  });

  it("spec 143 §4.6 — compiledTotal matches EXACTLY what compileVideoProject emits (scene + template + caption + audio, excluding hidden)", () => {
    const document = buildDocument({
      captions: { presetId: "classic_box", burnIn: false, language: "th" },
      scenes: [
        buildScene({
          sceneId: "SC-001",
          startMs: 0,
          endMs: 5000,
          layers: [baseSceneLayer({ id: "hand1" }), baseSceneLayer({ id: "hand2", hidden: true })],
          captionCues: [
            { startMs: 0, endMs: 1000, text: "one" },
            { startMs: 1000, endMs: 2000, text: "two" },
          ],
          visual: {
            kind: "template",
            templateId: "product_hero",
            params: { assetId: "asset1", mediaKind: "image", headline: "Hello" },
          },
        }),
      ],
      audioTracks: [{ kind: "music", assetRefs: [101], gainDb: -14, ducking: true }],
    });

    const compiled = compileVideoProject(
      document,
      {
        format: document.format,
        brandKit: null,
        assetResolver: { url: () => "https://cdn.example.com/a.png", sha256: () => undefined },
      },
      { resolveTemplate: id => (MOTION_TEMPLATE_REGISTRY as Record<string, MotionTemplate>)[id] },
    );
    const compiledCount =
      compiled.kind === "single"
        ? compiled.config.layers.length
        : compiled.parts.reduce((sum, part) => sum + part.layers.length, 0);

    expect(computeLayerCounts(document).compiledTotal).toBe(compiledCount);
    // 1 visible hand-authored layer (the hidden one excluded) + product_hero's
    // template layers + 2 caption layers (burn-in off) + 1 music audio layer.
    expect(compiledCount).toBeGreaterThan(1);
  });
});

describe("computeSafeAreaViolations", () => {
  it("computes safe-area bounding-box violations against the platform preset", () => {
    const document = buildDocument({
      content: { language: "th", platformPreset: "tiktok_9_16" },
      scenes: [
        buildScene({
          // NOT full-bleed (spec 143 §4.9.1 exempts x0/y0/w100/h100) — a
          // corner box that still crosses the left/top insets.
          layers: [baseSceneLayer({ id: "corner", x: 0, y: 0, width: 30, height: 30 })],
        }),
      ],
    });

    const result = computeSafeAreaViolations(document);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sceneId: "SC-001", layerId: "corner" });
    expect(result[0].edges.length).toBeGreaterThan(0);
  });

  it("spec 143 §4.9.1 — a full-bleed layer (x0 y0 w100 h100) is EXEMPT, even without `role: 'background'`", () => {
    const document = buildDocument({
      content: { language: "th", platformPreset: "tiktok_9_16" },
      scenes: [
        buildScene({
          layers: [baseSceneLayer({ id: "full_bleed", x: 0, y: 0, width: 100, height: 100 })],
        }),
      ],
    });

    expect(computeSafeAreaViolations(document)).toEqual([]);
  });

  it("spec 143 §4.9.1 — a `role: 'background'` layer is EXEMPT even when its geometry is NOT full-bleed", () => {
    const document = buildDocument({
      content: { language: "th", platformPreset: "tiktok_9_16" },
      scenes: [
        buildScene({
          layers: [baseSceneLayer({ id: "bg", x: 0, y: 0, width: 30, height: 30, role: "background" })],
        }),
      ],
    });

    expect(computeSafeAreaViolations(document)).toEqual([]);
  });

  it("reports no violation for a layer that stays within the platform's safe area", () => {
    const document = buildDocument({
      content: { language: "th", platformPreset: "square_1_1" },
      scenes: [
        buildScene({
          layers: [baseSceneLayer({ id: "centered", x: 20, y: 20, width: 60, height: 60 })],
        }),
      ],
    });

    expect(computeSafeAreaViolations(document)).toEqual([]);
  });

  it("ignores audio layers (their box has no render effect)", () => {
    const document = buildDocument({
      content: { language: "th", platformPreset: "tiktok_9_16" },
      scenes: [
        buildScene({
          layers: [
            {
              id: "narration_audio",
              type: "audio",
              startFrame: 0,
              durationFrames: 60,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 0,
              src: "https://cdn.example.com/a.mp3",
              trimStartSec: 0,
              volume: 1,
              loop: false,
              fadeInMs: 0,
              fadeOutMs: 0,
            },
          ],
        }),
      ],
    });

    expect(computeSafeAreaViolations(document)).toEqual([]);
  });
});

describe("computeSafeAreaRect", () => {
  it("agrees with the rectangle computeSafeAreaViolations checks layers against", () => {
    const rect = computeSafeAreaRect("tiktok_9_16");
    expect(rect).toEqual({ left: 5, top: 10, right: 85, bottom: 80 });

    // A layer clamped exactly to this rect must never be flagged.
    const document = buildDocument({
      content: { language: "th", platformPreset: "tiktok_9_16" },
      scenes: [
        buildScene({
          layers: [
            baseSceneLayer({
              id: "clamped",
              x: rect.left,
              y: rect.top,
              width: rect.right - rect.left,
              height: rect.bottom - rect.top,
            }),
          ],
        }),
      ],
    });
    expect(computeSafeAreaViolations(document)).toEqual([]);
  });
});

describe("computeClaimCoverage", () => {
  it("computes claim-source join coverage from a ClaimValidationResult", () => {
    const claimValidation: ClaimValidationResult = {
      mappedClaims: [{ statement: "s1", sceneId: "SC-001", claim: "c1", status: "approved" }],
      unmappedStatements: [{ statement: "s2", sceneId: "SC-001" }],
      prohibitedClaims: [{ claim: "c2", status: "prohibited" }],
      coverage: 0.5,
      blocksFinalRender: true,
    };

    const result = computeClaimCoverage(claimValidation);

    expect(result).toEqual({
      coverage: 0.5,
      mappedCount: 1,
      unmappedCount: 1,
      prohibitedCount: 1,
    });
  });
});

describe("computeQualityMetrics", () => {
  it("carries the estimated render cost through from estimateRenderCost", () => {
    const document = buildDocument();
    const renderCost: RenderCostEstimate = { score: 1234, cls: "medium", recommendPreRender: false };

    const result = computeQualityMetrics({
      document,
      claimValidation: emptyClaimValidation(),
      renderCost,
    });

    expect(result.renderCost).toBe(renderCost);
  });

  it("aggregates every metric helper into one object", () => {
    const document = buildDocument();
    const renderCost: RenderCostEstimate = { score: 0, cls: "low", recommendPreRender: false };

    const result = computeQualityMetrics({
      document,
      claimValidation: emptyClaimValidation(),
      renderCost,
    });

    expect(result.sceneDurations).toEqual(computeDurationVsNarration(document));
    expect(result.captionCps).toEqual(computeCaptionCps(document));
    expect(result.layerCounts).toEqual(computeLayerCounts(document));
    expect(result.safeAreaViolations).toEqual(computeSafeAreaViolations(document));
    expect(result.claimCoverage).toEqual(computeClaimCoverage(emptyClaimValidation()));
  });

  it("handles empty scenes / zero-duration / no-caption edge cases", () => {
    const document = buildDocument({
      scenes: [
        buildScene({ sceneId: "SC-ZERO", startMs: 1000, endMs: 1000, narration: null, captionCues: [], layers: [] }),
      ],
    });

    const durations = computeDurationVsNarration(document);
    expect(durations[0].durationMs).toBe(0);
    expect(durations[0].narrationCharCount).toBe(0);
    expect(durations[0].expectedNarrationMs).toBeNull();
    expect(durations[0].flagged).toBe(false);

    const captions = computeCaptionCps(document);
    expect(captions[0]).toEqual({
      sceneId: "SC-ZERO",
      cueCount: 0,
      maxCharsPerSecond: 0,
      averageCharsPerSecond: 0,
      flaggedCueCount: 0,
    });

    const layers = computeLayerCounts(document);
    expect(layers).toEqual({
      perScene: [{ sceneId: "SC-ZERO", layerCount: 0 }],
      total: 0,
      maxLayersPerScene: 0,
      compiledTotal: 0,
    });

    expect(computeSafeAreaViolations(document)).toEqual([]);
  });
});

describe("estimateVideoProjectQualityLoopCredits", () => {
  it("multiplies and clamps", () => {
    expect(estimateVideoProjectQualityLoopCredits(3, 2)).toBe(6);
    expect(estimateVideoProjectQualityLoopCredits(-5, 2)).toBe(0);
  });

  it("clamps maxRounds to >= 1", () => {
    expect(estimateVideoProjectQualityLoopCredits(3, 0)).toBe(3);
    expect(estimateVideoProjectQualityLoopCredits(3, -4)).toBe(3);
  });
});
