/**
 * Coverage for `videoProjectRepairApplier.ts` (Feature 142, section-06 §5.1).
 * Pure, zero-module-mocks: only injected effect doubles
 * (`makeRepairEffects()` returning `vi.fn()`s), in the style of
 * `videoProjectQualityLoop.test.ts`. Every fixture round-trips through the
 * real `VideoProjectDocumentSchema`.
 */
import { describe, expect, it, vi } from "vitest";

import {
  applyRepairs,
  assertReviewRevisionCurrent,
  createRepairRoundSession,
  parseRepairTargetRef,
  REPAIR_STAGE_ORDER,
  type RepairEffects,
  type RepairRewrite,
} from "../videoProjectRepairApplier";
import { VideoProjectDocumentSchema, type VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import type { VideoProjectReview } from "../videoProjectQualityLoop";
import {
  computeLayerCounts,
  computeSafeAreaViolations,
  type VideoProjectQualityMetrics,
} from "../videoProjectQualityMetrics";
import type { ResolvedCatalogFacts } from "../validateProjectClaims";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function textLayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "layer_text",
    type: "text",
    startFrame: 0,
    durationFrames: 60,
    x: 10,
    y: 10,
    width: 50,
    height: 20,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 1,
    content: "on-screen text",
    fontFamily: "Inter",
    fontSizePx: 48,
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "normal",
    ...overrides,
  };
}

function imageLayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "layer_image",
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
    src: "https://cdn.example.com/bg.png",
    fit: "cover",
    ...overrides,
  };
}

function motionGraphicLayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "layer_shape",
    type: "motionGraphic",
    startFrame: 0,
    durationFrames: 60,
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
    shape: "circle",
    color: "#ffffff",
    loopAnimation: "spin",
    ...overrides,
  };
}

function scene(overrides: Record<string, unknown> = {}) {
  return {
    sceneId: "SC-1",
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

function document(overrides: Record<string, unknown> = {}): VideoProjectDocument {
  return VideoProjectDocumentSchema.parse({
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 15000 },
    content: { language: "en", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [scene()],
    audioTracks: [],
    captions: { presetId: "classic_box", burnIn: false, language: "en" },
    claims: [],
    qa: { targetScore: 8, maxLoops: 3 },
    ...overrides,
  });
}

function review(overrides: Partial<VideoProjectReview> = {}): VideoProjectReview {
  return { score: 5, scorecard: {}, issues: [], ...overrides };
}

function metrics(): VideoProjectQualityMetrics {
  return {
    sceneDurations: [],
    captionCps: [],
    layerCounts: { perScene: [], total: 0, maxLayersPerScene: 0, compiledTotal: 0 },
    safeAreaViolations: [],
    claimCoverage: { coverage: 1, mappedCount: 0, unmappedCount: 0, prohibitedCount: 0 },
    renderCost: { score: 0, cls: "low", recommendPreRender: false },
  };
}

function makeRepairEffects(rewrites: RepairRewrite[] = []): RepairEffects & { rewriteForStage: ReturnType<typeof vi.fn> } {
  return {
    rewriteForStage: vi.fn(async () => rewrites),
  };
}

const noopRecompute = () => metrics();

/* -------------------------------------------------------------------------- */
/* parseRepairTargetRef                                                      */
/* -------------------------------------------------------------------------- */

describe("parseRepairTargetRef", () => {
  it("parses narration/cue/layer/param refs", () => {
    expect(parseRepairTargetRef("scene:SC-1:narration")).toEqual({ sceneId: "SC-1", slot: { kind: "narration" } });
    expect(parseRepairTargetRef("scene:SC-1:cue:2")).toEqual({ sceneId: "SC-1", slot: { kind: "cue", cueIndex: 2 } });
    expect(parseRepairTargetRef("scene:SC-1:layer:l1")).toEqual({ sceneId: "SC-1", slot: { kind: "layer", layerId: "l1" } });
    expect(parseRepairTargetRef("scene:SC-1:param:headline")).toEqual({
      sceneId: "SC-1",
      slot: { kind: "param", paramKey: "headline" },
    });
  });

  it("returns null for an unparseable ref", () => {
    expect(parseRepairTargetRef("not-a-ref")).toBeNull();
    expect(parseRepairTargetRef("scene:SC-1:unknown")).toBeNull();
    expect(parseRepairTargetRef("scene:SC-1:cue:not-a-number")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* captions handler — zero cost                                              */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — captions (zero cost)", () => {
  it("splits a cue that exceeds the chars-per-second ceiling", async () => {
    const longText = "a".repeat(60) + " " + "b".repeat(60);
    const doc = document({
      scenes: [scene({ captionCues: [{ startMs: 0, endMs: 2000, text: longText }] })],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "captions", instruction: "fix pacing" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.applied).toEqual(["captions"]);
    expect(result.document.scenes[0].captionCues.length).toBeGreaterThan(1);
  });

  it("keeps every split cue inside its scene's time range and non-overlapping", async () => {
    const longText = "a".repeat(80) + " " + "b".repeat(80);
    const doc = document({
      scenes: [scene({ startMs: 1000, endMs: 4000, captionCues: [{ startMs: 0, endMs: 3000, text: longText }] })],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "captions", instruction: "fix" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    const cues = result.document.scenes[0].captionCues;
    expect(cues.length).toBeGreaterThan(1);
    for (let i = 0; i < cues.length; i++) {
      expect(cues[i].startMs).toBeGreaterThanOrEqual(0);
      expect(cues[i].endMs).toBeLessThanOrEqual(3000);
      if (i > 0) expect(cues[i].startMs).toBeGreaterThanOrEqual(cues[i - 1].endMs);
    }
  });

  it("leaves a cue already under the ceiling byte-identical", async () => {
    const doc = document({
      scenes: [scene({ captionCues: [{ startMs: 0, endMs: 5000, text: "short and comfy" }] })],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "captions", instruction: "fix" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.skipped).toEqual(["captions"]);
    expect(result.document.scenes[0].captionCues).toEqual(doc.scenes[0].captionCues);
  });

  it("makes ZERO LLM calls for captions/scenes/motion repairs", async () => {
    const longText = "a".repeat(60) + " " + "b".repeat(60);
    const doc = document({
      scenes: [scene({ captionCues: [{ startMs: 0, endMs: 2000, text: longText }] })],
    });
    const effects = makeRepairEffects();

    await applyRepairs({
      document: doc,
      review: review({
        repairInstructions: [
          { stage: "captions", instruction: "fix" },
          { stage: "scenes", instruction: "fix" },
          { stage: "motion", instruction: "fix" },
        ],
      }),
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(effects.rewriteForStage).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* scenes handler — zero cost                                                */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — scenes (zero cost)", () => {
  it("adjusts boundaries for duration-vs-narration fit", async () => {
    // Scene 1 is too short for its narration (needs ~4000ms at 15 chars/sec
    // for a 60-char narration); scene 2 has slack to give up.
    const doc = document({
      scenes: [
        scene({ sceneId: "SC-1", startMs: 0, endMs: 1000, narration: "x".repeat(60) }),
        scene({ sceneId: "SC-2", startMs: 1000, endMs: 10000, narration: null }),
      ],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "scenes", instruction: "retime" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.applied).toEqual(["scenes"]);
    const [s1, s2] = result.document.scenes;
    expect(s1.endMs).toBeGreaterThan(1000);
    expect(s2.startMs).toBe(s1.endMs);
  });

  it("moves only SHARED boundaries — first startMs, last endMs and total duration are invariant", async () => {
    const doc = document({
      scenes: [
        scene({ sceneId: "SC-1", startMs: 0, endMs: 1000, narration: "x".repeat(60) }),
        scene({ sceneId: "SC-2", startMs: 1000, endMs: 10000, narration: null }),
      ],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "scenes", instruction: "retime" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    const scenes = result.document.scenes;
    expect(scenes[0].startMs).toBe(0);
    expect(scenes[scenes.length - 1].endMs).toBe(10000);
  });

  it("a scene whose neighbours have no slack is skipped, not force-fitted", async () => {
    const doc = document({
      scenes: [
        scene({ sceneId: "SC-1", startMs: 0, endMs: 500, narration: "x".repeat(200) }),
        scene({ sceneId: "SC-2", startMs: 500, endMs: 1500, narration: null }),
      ],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "scenes", instruction: "retime" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    // SC-2 has only 1000ms total — MIN_SCENE_DURATION_MS(1000) leaves zero
    // slack, so nothing can be moved; the stage is a documented no-op.
    expect(result.skipped).toEqual(["scenes"]);
  });

  it("spec 143 §4.9.2 (AC9) — retiming a scene boundary preserves every layer's ABSOLUTE start time", async () => {
    // SC-1 needs to borrow 3000ms from SC-2 (identical setup to the first
    // test in this block): SC-1.endMs 1000 -> 4000, SC-2.startMs 1000 -> 4000.
    // A layer on SC-2 at scene-relative startFrame 240 (8000ms @ 30fps) sits
    // at ABSOLUTE 1000 + 8000 = 9000ms before the retime.
    const doc = document({
      scenes: [
        scene({ sceneId: "SC-1", startMs: 0, endMs: 1000, narration: "x".repeat(60) }),
        scene({
          sceneId: "SC-2",
          startMs: 1000,
          endMs: 10000,
          narration: null,
          layers: [textLayer({ id: "l1", startFrame: 240 })],
        }),
      ],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "scenes", instruction: "retime" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    const [s1, s2] = result.document.scenes;
    expect(s1.endMs).toBe(4000);
    expect(s2.startMs).toBe(4000);
    // The layer stayed on SC-2 (absolute 9000ms is still inside SC-2's new
    // [4000, 10000) span) but its scene-RELATIVE startFrame was recomputed:
    // (9000 - 4000)ms @ 30fps = frame 150 — NOT the stale 240, which would
    // have silently placed it at absolute 4000 + 8000 = 12000ms instead.
    expect(s1.layers).toHaveLength(0);
    expect(s2.layers).toHaveLength(1);
    expect(s2.layers[0].startFrame).toBe(150);
  });
});

/* -------------------------------------------------------------------------- */
/* motion handler — zero cost                                                */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — motion (zero cost)", () => {
  it("steps intensity down one level on metric-flagged scenes only", async () => {
    const doc = document({
      scenes: [
        scene({ sceneId: "SC-1", narration: "x".repeat(300), motion: { intensity: "high", camera: "push-in" } }),
        scene({ sceneId: "SC-2", motion: { intensity: "high", camera: "push-in" } }),
      ],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "motion", instruction: "calm it down" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.applied).toEqual(["motion"]);
    const [s1, s2] = result.document.scenes;
    expect(s1.motion.intensity).toBe("medium");
    expect(s1.motion.camera).toBe("static");
    // SC-2 is not flagged (no narration -> not duration-flagged, and layer
    // count is 0 -> not clutter-flagged) so it must be untouched.
    expect(s2.motion).toEqual({ intensity: "high", camera: "push-in" });
  });

  it("never steps intensity UP, and is idempotent on an already low/static scene", async () => {
    const manyLayers = Array.from({ length: 10 }, (_, i) => textLayer({ id: `l${i}` }));
    const doc = document({
      scenes: [scene({ layers: manyLayers, motion: { intensity: "low", camera: "static" } })],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "motion", instruction: "calm it down" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.skipped).toEqual(["motion"]);
    expect(result.document.scenes[0].motion).toEqual({ intensity: "low", camera: "static" });
  });
});

/* -------------------------------------------------------------------------- */
/* motion — layer-budget report (gap-2: spec 143 §4.9.1 — NEVER deletes a    */
/* hand-authored layer; every scene.layers[] entry IS hand-authored)         */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — motion layer-budget report over the 40-layer budget (zero cost)", () => {
  it("never deletes ANY layer to fix an over-budget document — every scene.layers[] entry is hand-authored (§4.9.1)", async () => {
    // 45 motionGraphic layers = 45 compiledTotal, 5 over the 40 budget.
    // Pre-143 behavior would have dropped 5 of these (the exact type this
    // fix removes the deletion carve-out for); the new rule deletes NOTHING.
    const shapeLayers = Array.from({ length: 45 }, (_, i) => motionGraphicLayer({ id: `s${i}`, zIndex: i }));
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", layers: shapeLayers })],
    });
    expect(computeLayerCounts(doc).compiledTotal).toBe(45);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "motion", instruction: "thin it out" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    // The clutter threshold (>8 layers) still steps the scene's motion
    // intensity down (medium -> low), so this stage IS "applied" — but not a
    // single layer is removed, regardless of type.
    expect(result.applied).toEqual(["motion"]);
    expect(result.document.scenes[0].motion.intensity).toBe("low");
    expect(result.document.scenes[0].layers).toHaveLength(45);
    expect(computeLayerCounts(result.document).compiledTotal).toBe(45);
    const motionNote = result.notes.find(n => n.stage === "motion");
    expect(motionNote?.reason).toMatch(/hand-authored/);
  });

  it("still reports the overage via a note when there is no other motion change to make (no silent convergence)", async () => {
    // Motion intensity already "low" (a no-op step-down) isolates the
    // report path from the intensity-change path.
    const textLayers = Array.from({ length: 45 }, (_, i) => textLayer({ id: `t${i}` }));
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", layers: textLayers, motion: { intensity: "low", camera: "static" } })],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "motion", instruction: "thin it out" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    // No layer dropped, no motion field changed -> the stage is SKIPPED, but
    // the overage is still surfaced in `notes`, never silently swallowed.
    expect(result.skipped).toEqual(["motion"]);
    expect(result.document.scenes[0].layers).toHaveLength(45);
    const motionNote = result.notes.find(n => n.stage === "motion");
    expect(motionNote?.reason).toMatch(/over layer budget by 5/);
  });

  it("the budget check uses compiledTotal (scene + template + caption + audio), not the scene-layers-only `total`", async () => {
    // Only 5 hand-authored layers (well under 40 on `total`), but 20
    // caption cues with burn-in off push `compiledTotal` over budget. The
    // pre-143 bug compared against `total` (5) and never flagged this at
    // all.
    const cues = Array.from({ length: 38 }, (_, i) => ({ startMs: i * 100, endMs: i * 100 + 90, text: "x" }));
    const doc = document({
      captions: { presetId: "classic_box", burnIn: false, language: "en" },
      scenes: [
        scene({
          sceneId: "SC-1",
          layers: [textLayer({ id: "t0" }), textLayer({ id: "t1" }), textLayer({ id: "t2" })],
          captionCues: cues,
        }),
      ],
    });
    expect(computeLayerCounts(doc).total).toBe(3);
    expect(computeLayerCounts(doc).compiledTotal).toBe(41);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "motion", instruction: "thin it out" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    const motionNote = result.notes.find(n => n.stage === "motion");
    expect(motionNote?.reason).toMatch(/over layer budget by 1/);
  });
});

/* -------------------------------------------------------------------------- */
/* layout (gap-1: safe-area violations unrepairable)                         */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — layout (zero cost)", () => {
  it("clamps an out-of-safe-area layer back inside the platform preset's safe rectangle", async () => {
    // tiktok_9_16 safe rect: left 5, top 10, right 85, bottom 80 (100-15/-20).
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", layers: [textLayer({ id: "l1", x: 0, y: 5, width: 20, height: 10 })] })],
    });
    expect(computeSafeAreaViolations(doc)).toHaveLength(1);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "layout", instruction: "fix placement" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.applied).toEqual(["layout"]);
    const layer = result.document.scenes[0].layers[0] as { x: number; y: number; width: number; height: number };
    expect(layer.x).toBeGreaterThanOrEqual(5);
    expect(layer.y).toBeGreaterThanOrEqual(10);
    expect(layer.x + layer.width).toBeLessThanOrEqual(85);
    expect(layer.y + layer.height).toBeLessThanOrEqual(80);
  });

  it("spec 143 §4.9.1 — a full-bleed background survives a layout repair round completely unchanged", async () => {
    // Full-bleed (x0 y0 w100 h100) is ALWAYS a safe-area violation for
    // tiktok_9_16 (insets top10/bottom20/left5/right15) — this is the exact
    // scenario the spec's changelog calls out as "one QA round would turn
    // the user's background into an inset box".
    const doc = document({
      scenes: [
        scene({
          sceneId: "SC-1",
          layers: [imageLayer({ id: "bg", x: 0, y: 0, width: 100, height: 100, role: "background" })],
        }),
      ],
    });
    // Confirm the exemption at the metric layer too — no violation is even
    // reported for a background-role layer.
    expect(computeSafeAreaViolations(doc)).toEqual([]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "layout", instruction: "fix placement" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.skipped).toEqual(["layout"]);
    expect(result.document.scenes[0].layers).toEqual(doc.scenes[0].layers);
  });

  it("spec 143 §4.9.1 — a full-bleed layer is exempt even WITHOUT `role: 'background'` set", async () => {
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", layers: [imageLayer({ id: "bg", x: 0, y: 0, width: 100, height: 100 })] })],
    });
    expect(computeSafeAreaViolations(doc)).toEqual([]);
  });

  it("spec 143 §4.9.1 — a locked layer is skipped by the layout handler even though it stays flagged", async () => {
    const lockedLayer = textLayer({ id: "l1", x: 0, y: 5, width: 20, height: 10, locked: true });
    const doc = document({ scenes: [scene({ sceneId: "SC-1", layers: [lockedLayer] })] });
    // The metric itself still reports it — `locked` protects it from being
    // MUTATED, not from being reported to the QA panel.
    expect(computeSafeAreaViolations(doc)).toHaveLength(1);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "layout", instruction: "fix placement" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.skipped).toEqual(["layout"]);
    expect(result.document.scenes[0].layers[0]).toEqual(doc.scenes[0].layers[0]);
    const layoutNote = result.notes.find(n => n.stage === "layout");
    expect(layoutNote?.reason).toMatch(/locked/);
  });

  it("leaves a compliant layer byte-identical and skips the stage", async () => {
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", layers: [textLayer({ id: "l1", x: 10, y: 15, width: 20, height: 10 })] })],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "layout", instruction: "fix placement" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.skipped).toEqual(["layout"]);
    expect(result.document.scenes[0].layers).toEqual(doc.scenes[0].layers);
  });

  it("never touches an audio layer even if its box would technically violate the safe area", async () => {
    const doc = document({
      scenes: [
        scene({
          sceneId: "SC-1",
          layers: [
            {
              id: "a1",
              type: "audio",
              startFrame: 0,
              durationFrames: 60,
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 0,
              src: "https://example.com/a.mp3",
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

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "layout", instruction: "fix placement" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    // computeSafeAreaViolations skips audio layers entirely, so there is no
    // target for the layout handler in the first place.
    expect(result.skipped).toEqual(["layout"]);
    expect(result.document.scenes[0].layers[0]).toEqual(doc.scenes[0].layers[0]);
  });
});

/* -------------------------------------------------------------------------- */
/* Convergence round-trips: the whole point of this section — a metric that   */
/* flags an issue must STOP flagging it once the matching repair has run.     */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Feature 143 §4.9.1 (P0 regression) — hand-authored layers survive a FULL   */
/* multi-stage repair round, not just one handler in isolation.              */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — a full repair round never destroys or deforms a hand-authored layer", () => {
  it("a locked out-of-bounds layer + a full-bleed background layer both survive every deterministic stage untouched", async () => {
    const lockedOutOfBounds = textLayer({ id: "locked_l1", x: 0, y: 5, width: 20, height: 10, locked: true });
    const fullBleedBackground = imageLayer({ id: "bg1", x: 0, y: 0, width: 100, height: 100, role: "background" });
    const cluttering = Array.from({ length: 10 }, (_, i) => motionGraphicLayer({ id: `deco_${i}`, zIndex: i }));

    const doc = document({
      scenes: [
        scene({
          sceneId: "SC-1",
          narration: "x".repeat(300), // duration-flagged -> triggers `scenes` + `motion` too
          layers: [lockedOutOfBounds, fullBleedBackground, ...cluttering],
        }),
      ],
    });

    const result = await applyRepairs({
      document: doc,
      review: review({
        repairInstructions: [
          { stage: "captions", instruction: "tighten" },
          { stage: "scenes", instruction: "retime" },
          { stage: "motion", instruction: "calm it down" },
          { stage: "layout", instruction: "fix placement" },
        ],
      }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    const finalLayers = result.document.scenes[0].layers;
    // Every ORIGINAL layer id is still present — nothing was ever deleted.
    const finalIds = new Set(finalLayers.map(l => l.id));
    expect(finalIds.has("locked_l1")).toBe(true);
    expect(finalIds.has("bg1")).toBe(true);
    for (const deco of cluttering) expect(finalIds.has(deco.id as string)).toBe(true);
    expect(finalLayers).toHaveLength(2 + cluttering.length);

    // The locked layer is byte-identical (never clamped despite being
    // flagged) and the full-bleed background is byte-identical (never even
    // flagged, being exempt by `role`).
    const finalLocked = finalLayers.find(l => l.id === "locked_l1");
    const finalBg = finalLayers.find(l => l.id === "bg1");
    expect(finalLocked).toEqual(lockedOutOfBounds);
    expect(finalBg).toEqual(fullBleedBackground);
  });
});

describe("QA loop convergence — metric flags -> repair applies -> metric no longer flags", () => {
  it("safe-area: computeSafeAreaViolations flags the layer, applyRepairs(layout) clamps it, computeSafeAreaViolations no longer flags it", async () => {
    const doc = document({
      scenes: [
        scene({
          sceneId: "SC-1",
          layers: [
            textLayer({ id: "l1", x: 0, y: 0, width: 30, height: 30 }),
            textLayer({ id: "l2", x: 95, y: 95, width: 20, height: 20 }),
          ],
        }),
      ],
    });
    expect(computeSafeAreaViolations(doc).map(v => v.layerId).sort()).toEqual(["l1", "l2"]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "layout", instruction: "fix placement" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.applied).toEqual(["layout"]);
    expect(computeSafeAreaViolations(result.document)).toEqual([]);
  });

  it("layer-count (spec 143 §4.9.1): computeLayerCounts flags the document over budget, and applyRepairs(motion) reports it WITHOUT deleting any layer or falsely converging the count", async () => {
    const textLayers = Array.from({ length: 30 }, (_, i) => textLayer({ id: `t${i}` }));
    const shapeLayers = Array.from({ length: 20 }, (_, i) => motionGraphicLayer({ id: `s${i}`, zIndex: i }));
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", layers: [...textLayers, ...shapeLayers] })],
    });
    expect(computeLayerCounts(doc).compiledTotal).toBe(50);
    expect(computeLayerCounts(doc).compiledTotal).toBeGreaterThan(40);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "motion", instruction: "thin it out" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    // Motion intensity still steps down (clutter-flagged), so the stage is
    // "applied" — but the layer count is UNCHANGED and still over budget:
    // there is no deterministic, non-destructive way to shrink it here.
    expect(result.applied).toEqual(["motion"]);
    expect(computeLayerCounts(result.document).compiledTotal).toBe(50);
    expect(result.document.scenes[0].layers).toHaveLength(50);
  });
});

/* -------------------------------------------------------------------------- */
/* LLM-backed handlers                                                       */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — narration / content / claims (LLM-backed)", () => {
  it("narration/content/claims call rewriteForStage exactly ONCE each, in ONE call with every target", async () => {
    const doc = document({
      scenes: [
        scene({ sceneId: "SC-1", narration: "x".repeat(300) }),
        scene({ sceneId: "SC-2", narration: "y".repeat(300) }),
      ],
    });
    const effects = makeRepairEffects([
      { id: "scene:SC-1:narration", text: "rewritten one" },
      { id: "scene:SC-2:narration", text: "rewritten two" },
    ]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "narration", instruction: "tighten it" }] }),
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(effects.rewriteForStage).toHaveBeenCalledTimes(1);
    const call = effects.rewriteForStage.mock.calls[0][0];
    expect(call.targets).toHaveLength(2);
    expect(result.document.scenes[0].narration).toBe("rewritten one");
    expect(result.document.scenes[1].narration).toBe("rewritten two");
    expect(result.applied).toEqual(["narration"]);
  });

  it("relays the skill-authored instruction verbatim", async () => {
    const doc = document({ scenes: [scene({ narration: "x".repeat(300) })] });
    const effects = makeRepairEffects([{ id: "scene:SC-1:narration", text: "new" }]);

    await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "narration", instruction: "EXACT SKILL WORDS" }] }),
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(effects.rewriteForStage.mock.calls[0][0].instruction).toBe("EXACT SKILL WORDS");
  });

  it("maps rewrites back by target id, leaves omitted ids unchanged, ignores invented ids", async () => {
    const doc = document({
      scenes: [
        scene({ sceneId: "SC-1", narration: "x".repeat(300) }),
        scene({ sceneId: "SC-2", narration: "y".repeat(300) }),
      ],
    });
    const effects = makeRepairEffects([
      { id: "scene:SC-1:narration", text: "rewritten" },
      { id: "scene:NOT-REAL:narration", text: "should be ignored" },
    ]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "narration", instruction: "x" }] }),
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(result.document.scenes[0].narration).toBe("rewritten");
    expect(result.document.scenes[1].narration).toBe("y".repeat(300)); // omitted id -> unchanged
  });

  it("selects targets from METRICS, never by substring-matching an issue message", async () => {
    const doc = document({
      scenes: [
        scene({ sceneId: "SC-1", narration: "x".repeat(300) }), // flagged by metrics
        scene({ sceneId: "SC-2", narration: "z".repeat(70) }), // NOT flagged — fits its 5s duration
      ],
    });
    const effects = makeRepairEffects([{ id: "scene:SC-1:narration", text: "rewritten" }]);

    const result = await applyRepairs({
      document: doc,
      review: review({
        repairInstructions: [{ stage: "narration", instruction: "x" }],
        // Deliberately mentions SC-2 in an issue message — must NOT become a target.
        issues: [{ dimension: "content", severity: "low", message: "Scene SC-2's narration reads awkwardly" }],
      }),
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    const call = effects.rewriteForStage.mock.calls[0][0];
    const ids = call.targets.map((t: { id: string }) => t.id);
    expect(ids).toEqual(["scene:SC-1:narration"]);
    expect(result.document.scenes[1].narration).toBe("z".repeat(70));
  });

  it("content targets every text layer and template text param across scenes", async () => {
    const doc = document({
      scenes: [
        scene({
          sceneId: "SC-1",
          layers: [textLayer({ id: "l1", content: "headline copy" })],
        }),
      ],
    });
    const effects = makeRepairEffects([{ id: "scene:SC-1:layer:l1", text: "new headline" }]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "content", instruction: "punch it up" }] }),
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(result.document.scenes[0].layers[0]).toMatchObject({ content: "new headline" });
  });
});

/* -------------------------------------------------------------------------- */
/* Claims safety                                                             */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — claims safety", () => {
  // "claims" targets come from `validateProjectClaims`, which requires a
  // non-null `resolvedCatalog` — a Motion Studio project (`null`) skips
  // claim validation entirely (`validateProjectClaims.ts`), so every claims
  // test here needs an (even empty) catalog to unlock the join.

  it("re-sources a prohibited statement to an approved claim (removes/rewrites the statement, never invents a claim record)", async () => {
    const doc = document({
      claims: [
        { claim: "helps clear skin over time", source: "manual", status: "approved" },
        { claim: "clears acne in 3 days", source: "manual", status: "prohibited" },
      ],
      scenes: [scene({ sceneId: "SC-1", narration: "clears acne in 3 days" })],
    });
    const effects = makeRepairEffects([
      { id: "scene:SC-1:narration", text: "helps clear skin over time" },
    ]);
    const catalog: ResolvedCatalogFacts = { productIds: [], claimResolutions: [] };

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "claims", instruction: "re-source it" }] }),
      resolvedCatalog: catalog,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(result.applied).toEqual(["claims"]);
    expect(result.document.scenes[0].narration).toBe("helps clear skin over time");
    expect(result.document.claims).toEqual(doc.claims); // never rewrites the registry
  });

  it("rolls back a claims repair that increases prohibited or unmapped statements", async () => {
    const catalog: ResolvedCatalogFacts = {
      productIds: ["p1"],
      claimResolutions: [
        { claim: "safe approved claim", source: "catalog", status: "approved" },
        { claim: "dangerous unbacked claim", source: "catalog", status: "prohibited" },
      ],
    };
    const doc = document({
      // Matches neither known claim -> an unmapped statement -> a legitimate
      // claims target.
      scenes: [scene({ sceneId: "SC-1", narration: "a statement matching nothing known" })],
    });
    // The rewrite makes it WORSE — it now matches the catalog-known
    // prohibited claim, which is a net-new prohibited hit.
    const effects = makeRepairEffects([{ id: "scene:SC-1:narration", text: "dangerous unbacked claim" }]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "claims", instruction: "fix it" }] }),
      resolvedCatalog: catalog,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(result.rolledBack).toEqual(["claims"]);
    expect(result.document.scenes[0].narration).toBe("a statement matching nothing known");
  });

  it("rolls back any repair that worsens blocksFinalRender and reports it in rolledBack", async () => {
    const catalog: ResolvedCatalogFacts = {
      productIds: ["p1"],
      claimResolutions: [{ claim: "banned medical claim", source: "catalog", status: "prohibited" }],
    };
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", narration: "a safe, ordinary sentence" })],
    });
    // The model rewrites safe narration into the catalog-known prohibited phrase.
    const effects = makeRepairEffects([{ id: "scene:SC-1:narration", text: "banned medical claim" }]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "narration", instruction: "x" }] }),
      resolvedCatalog: catalog,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(result.rolledBack).toEqual(["narration"]);
    expect(result.document.scenes[0].narration).toBe("a safe, ordinary sentence");
  });

  it("rolls back a rewrite that exceeds a schema length cap instead of throwing", async () => {
    const doc = document({ scenes: [scene({ sceneId: "SC-1", narration: "x".repeat(300) })] });
    const effects = makeRepairEffects([{ id: "scene:SC-1:narration", text: "z".repeat(5000) }]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "narration", instruction: "x" }] }),
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(result.rolledBack).toEqual(["narration"]);
    expect(result.document.scenes[0].narration).toBe("x".repeat(300));
  });

  it("leaves the document BYTE-IDENTICAL when every requested stage rolls back", async () => {
    const doc = document({ scenes: [scene({ sceneId: "SC-1", narration: "x".repeat(300) })] });
    const effects = makeRepairEffects([{ id: "scene:SC-1:narration", text: "z".repeat(5000) }]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "narration", instruction: "x" }] }),
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(JSON.stringify(result.document)).toBe(JSON.stringify(doc));
  });
});

/* -------------------------------------------------------------------------- */
/* Selection + ordering                                                       */
/* -------------------------------------------------------------------------- */

describe("applyRepairs — selection + ordering", () => {
  it("skips a stage with no repairInstruction and reports it in skipped, not rolledBack", async () => {
    const doc = document();
    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [] }),
      stages: ["motion"],
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.skipped).toEqual(["motion"]);
    expect(result.rolledBack).toEqual([]);
  });

  it("skips a stage whose deterministic target set is empty", async () => {
    const doc = document(); // no flagged scenes at all
    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "motion", instruction: "x" }] }),
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(result.skipped).toEqual(["motion"]);
  });

  it("applies stages in REPAIR_STAGE_ORDER regardless of review order", async () => {
    const longText = "a".repeat(60) + " " + "b".repeat(60);
    const doc = document({
      scenes: [
        scene({
          sceneId: "SC-1",
          narration: "x".repeat(300),
          motion: { intensity: "high", camera: "push-in" },
          captionCues: [{ startMs: 0, endMs: 2000, text: longText }],
        }),
      ],
    });
    const effects = makeRepairEffects([{ id: "scene:SC-1:narration", text: "rewritten" }]);
    const order: string[] = [];
    const trackingEffects: RepairEffects = {
      rewriteForStage: async args => {
        order.push(args.stage);
        return effects.rewriteForStage(args);
      },
    };

    const result = await applyRepairs({
      document: doc,
      review: review({
        // Deliberately OUT of REPAIR_STAGE_ORDER.
        repairInstructions: [
          { stage: "narration", instruction: "x" },
          { stage: "motion", instruction: "x" },
          { stage: "captions", instruction: "x" },
        ],
      }),
      resolvedCatalog: null,
      effects: trackingEffects,
      recomputeMetrics: noopRecompute,
    });

    expect(REPAIR_STAGE_ORDER.indexOf("captions")).toBeLessThan(REPAIR_STAGE_ORDER.indexOf("motion"));
    expect(REPAIR_STAGE_ORDER.indexOf("motion")).toBeLessThan(REPAIR_STAGE_ORDER.indexOf("narration"));
    expect(order).toEqual(["narration"]); // only the LLM stage calls the effect
    expect(result.applied.indexOf("captions")).toBeLessThan(result.applied.indexOf("motion"));
    expect(result.applied.indexOf("motion")).toBeLessThan(result.applied.indexOf("narration"));
  });

  it("is deterministic — the same document + review yields a byte-identical result twice", async () => {
    const longText = "a".repeat(60) + " " + "b".repeat(60);
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", captionCues: [{ startMs: 0, endMs: 2000, text: longText }] })],
    });
    const rev = review({ repairInstructions: [{ stage: "captions", instruction: "x" }] });

    const first = await applyRepairs({
      document: doc,
      review: rev,
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });
    const second = await applyRepairs({
      document: doc,
      review: rev,
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      recomputeMetrics: noopRecompute,
    });

    expect(JSON.stringify(first.document)).toBe(JSON.stringify(second.document));
  });

  it("honours an explicit `stages` filter and ignores instructions outside it", async () => {
    const doc = document({ scenes: [scene({ sceneId: "SC-1", narration: "x".repeat(300) })] });
    const effects = makeRepairEffects([{ id: "scene:SC-1:narration", text: "rewritten" }]);

    const result = await applyRepairs({
      document: doc,
      review: review({ repairInstructions: [{ stage: "narration", instruction: "x" }] }),
      stages: ["motion"], // narration instruction exists but is not requested
      resolvedCatalog: null,
      effects,
      recomputeMetrics: noopRecompute,
    });

    expect(effects.rewriteForStage).not.toHaveBeenCalled();
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(["motion"]);
  });
});

/* -------------------------------------------------------------------------- */
/* createRepairRoundSession                                                   */
/* -------------------------------------------------------------------------- */

describe("createRepairRoundSession", () => {
  function makeSession(overrides: Partial<Parameters<typeof createRepairRoundSession>[0]> = {}) {
    const persistDocument = vi.fn(async (_doc: VideoProjectDocument, base: number) => ({ revision: base + 1 }));
    const reviewFor = vi.fn(() => review());
    const session = createRepairRoundSession({
      document: document(),
      baseRevision: 3,
      resolvedCatalog: null,
      effects: makeRepairEffects(),
      reviewFor,
      persistDocument,
      renderCostFor: () => ({ score: 0, cls: "low" as const, recommendPreRender: false }),
      ...overrides,
    });
    return { session, persistDocument, reviewFor };
  }

  it("persists the document exactly ONCE per round, at the recomputeMetrics boundary", async () => {
    const longText = "a".repeat(60) + " " + "b".repeat(60);
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", captionCues: [{ startMs: 0, endMs: 2000, text: longText }] })],
    });
    const { session, persistDocument } = makeSession({ document: doc });

    await session.repairStage("captions", "x");
    expect(persistDocument).not.toHaveBeenCalled();

    await session.recomputeMetrics("proj-1");
    expect(persistDocument).toHaveBeenCalledTimes(1);
  });

  it("does not write at all when a round applied nothing", async () => {
    const { session, persistDocument } = makeSession();

    await session.recomputeMetrics("proj-1");
    expect(persistDocument).not.toHaveBeenCalled();
  });

  it("returns metrics recomputed from the PERSISTED document, not the pre-repair one", async () => {
    const longText = "a".repeat(60) + " " + "b".repeat(60);
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", captionCues: [{ startMs: 0, endMs: 2000, text: longText }] })],
    });
    const { session } = makeSession({ document: doc });

    await session.repairStage("captions", "x");
    const metricsAfter = await session.recomputeMetrics("proj-1");

    expect(metricsAfter.captionCps).toBeDefined();
    expect(session.snapshot().document.scenes[0].captionCues.length).toBeGreaterThan(1);
  });

  it("accumulates applied/skipped/rolledBack across stages of a round", async () => {
    const doc = document({ scenes: [scene({ sceneId: "SC-1", narration: null })] });
    const { session } = makeSession({
      document: doc,
      reviewFor: () => review(),
    });

    await session.repairStage("motion", "x"); // no target -> skipped
    await session.repairStage("scenes", "x"); // no target -> skipped

    const snapshot = session.snapshot();
    expect(snapshot.skipped).toEqual(["motion", "scenes"]);
    expect(snapshot.applied).toEqual([]);
  });

  it("carries the bumped revision into the next round's baseRevision", async () => {
    const longText = "a".repeat(60) + " " + "b".repeat(60);
    const doc = document({
      scenes: [scene({ sceneId: "SC-1", captionCues: [{ startMs: 0, endMs: 2000, text: longText }] })],
    });
    const persistDocument = vi.fn(async (_doc: VideoProjectDocument, base: number) => ({ revision: base + 1 }));
    const { session } = makeSession({ document: doc, baseRevision: 5, persistDocument });

    await session.repairStage("captions", "x");
    await session.recomputeMetrics("proj-1");

    expect(persistDocument).toHaveBeenCalledWith(expect.anything(), 5);
    expect(session.snapshot().revision).toBe(6);
  });
});

/* -------------------------------------------------------------------------- */
/* assertReviewRevisionCurrent                                               */
/* -------------------------------------------------------------------------- */

describe("assertReviewRevisionCurrent", () => {
  it("passes when the reviewed revision equals the current revision", () => {
    expect(() => assertReviewRevisionCurrent({ reviewedRevision: 4, currentRevision: 4 })).not.toThrow();
  });

  it("throws VI_REPAIR_STALE_REVIEW when the document moved on", () => {
    expect(() => assertReviewRevisionCurrent({ reviewedRevision: 4, currentRevision: 5 })).toThrow(
      /VI_REPAIR_STALE_REVIEW/,
    );
  });
});
