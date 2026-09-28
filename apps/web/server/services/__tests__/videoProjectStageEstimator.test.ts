/**
 * Feature 142 — section-04: `estimateStageTokens` (pure, zero mocks).
 * Fixtures round-trip through the real `VideoProjectDocumentSchema` so a
 * schema drift breaks this test file loudly rather than silently.
 */
import { describe, expect, it } from "vitest";

import { VideoProjectDocumentSchema, type Scene } from "@shared/videoIntelligence/projectSchemas";
import {
  STAGE_CEILING_CALLS_PER_ROUND,
  estimateStageTokens,
} from "../videoProjectStageEstimator";

function scene(overrides: Partial<Scene> = {}): Scene {
  return {
    sceneId: overrides.sceneId ?? "scene-1",
    startMs: 0,
    endMs: 5000,
    narration: "Try this product today.",
    narrationAudioAssetId: null,
    visual: { kind: "layers" },
    layers: [],
    motion: { intensity: "medium", camera: "static" },
    captionCues: [{ startMs: 0, endMs: 1000, text: "Try this product today." }],
    ...overrides,
  };
}

function document(overrides: { scenes?: Scene[]; claims?: number } = {}) {
  const scenes = overrides.scenes ?? [scene()];
  const raw = {
    schemaVersion: 1 as const,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 * scenes.length },
    content: { language: "en", platformPreset: "tiktok_9_16" as const },
    brandKitId: null,
    scenes,
    audioTracks: [],
    captions: { presetId: "no_subtitle_style" as const, burnIn: false, language: "en" },
    claims: Array.from({ length: overrides.claims ?? 0 }, (_, i) => ({
      claim: `Claim number ${i}`,
      source: "test",
      status: "approved" as const,
    })),
    qa: { targetScore: 7, maxLoops: 1 },
  };
  return VideoProjectDocumentSchema.parse(raw);
}

describe("estimateStageTokens", () => {
  it("derives sceneCount / narrationChars / captionChars / layerCount from the document", () => {
    const doc = document({
      scenes: [
        scene({
          sceneId: "scene-1",
          narration: "Hello world", // 11 chars
          captionCues: [{ startMs: 0, endMs: 1000, text: "Hello world" }], // 11 chars
          layers: [
            {
              id: "layer-1",
              type: "image",
              startFrame: 0,
              durationFrames: 10,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 0,
              src: "https://cdn.example.com/a.png",
              fit: "cover",
            },
          ],
        }),
      ],
    });

    const basis = estimateStageTokens(doc, "quality_review");

    expect(basis.sceneCount).toBe(1);
    expect(basis.narrationChars).toBe(11);
    expect(basis.captionChars).toBe(11);
    expect(basis.layerCount).toBe(1);
  });

  it("returns strictly larger token estimates for a larger document", () => {
    const small = document({ scenes: [scene({ sceneId: "scene-1" })] });
    const large = document({
      scenes: [
        scene({ sceneId: "scene-1", narration: "A".repeat(2000) }),
        scene({ sceneId: "scene-2", narration: "B".repeat(2000) }),
        scene({ sceneId: "scene-3", narration: "C".repeat(2000) }),
      ],
    });

    const smallBasis = estimateStageTokens(small, "quality_review");
    const largeBasis = estimateStageTokens(large, "quality_review");

    expect(largeBasis.estimatedInputTokens).toBeGreaterThan(smallBasis.estimatedInputTokens);
    expect(largeBasis.estimatedOutputTokens).toBeGreaterThan(smallBasis.estimatedOutputTokens);
  });

  it("returns a non-zero input estimate for a minimal one-scene document", () => {
    const doc = document({
      scenes: [scene({ narration: null, captionCues: [] })],
    });

    const basis = estimateStageTokens(doc, "quality_review");

    expect(basis.estimatedInputTokens).toBeGreaterThan(0);
  });

  it("sizes scene_plan output tokens from scene count (per-scene params), not a flat value", () => {
    const oneScene = document({ scenes: [scene({ sceneId: "scene-1" })] });
    const threeScenes = document({
      scenes: [
        scene({ sceneId: "scene-1" }),
        scene({ sceneId: "scene-2" }),
        scene({ sceneId: "scene-3" }),
      ],
    });

    const oneSceneBasis = estimateStageTokens(oneScene, "scene_plan");
    const threeScenesBasis = estimateStageTokens(threeScenes, "scene_plan");

    expect(threeScenesBasis.estimatedOutputTokens).toBeGreaterThan(oneSceneBasis.estimatedOutputTokens);
  });
});

describe("STAGE_CEILING_CALLS_PER_ROUND", () => {
  it("is 5 — 1 review + 3 LLM repair stages + 1 re-review (decision D1)", () => {
    expect(STAGE_CEILING_CALLS_PER_ROUND).toBe(5);
  });
});
