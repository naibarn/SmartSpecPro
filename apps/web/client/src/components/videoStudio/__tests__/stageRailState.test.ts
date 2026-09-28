/**
 * Stage rail per-stage progress derivation (this task) — pure, no React/trpc.
 * Mirrors the `qaPanelState.test.ts` precedent: a stateful/presentational
 * component (`StageRail`) gets a pure sibling test file for its data rules.
 */
import { describe, expect, it } from "vitest";

import { deriveStageRailState } from "../stageRailState";
import { isStageResultReady } from "@shared/videoIntelligence/stageApproval";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

function makeScene(
  overrides: Partial<VideoProjectDocument["scenes"][number]> = {}
) {
  return {
    sceneId: "scene-1",
    startMs: 0,
    endMs: 1000,
    narration: null,
    narrationAudioAssetId: null,
    visual: { kind: "layers" as const },
    layers: [],
    motion: { intensity: "medium" as const, camera: "static" },
    captionCues: [],
    ...overrides,
  };
}

function makeDocument(
  scenes: VideoProjectDocument["scenes"] = [makeScene()],
  claims: VideoProjectDocument["claims"] = []
): VideoProjectDocument {
  return {
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 8000 },
    content: { language: "th", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes,
    audioTracks: [],
    captions: { presetId: "classic_box", burnIn: false, language: "th" },
    claims,
    qa: { targetScore: 8, maxLoops: 2 },
  };
}

describe("deriveStageRailState", () => {
  it("only allows approval after the persisted stage artifact is complete", () => {
    expect(isStageResultReady("narration", makeDocument())).toBe(false);
    expect(
      isStageResultReady(
        "narration",
        makeDocument([
          makeScene({ narration: "Hello", narrationAudioAssetId: 5 }),
        ])
      )
    ).toBe(true);
    expect(isStageResultReady("narration", null)).toBe(false);
  });
  it("marks every stage empty when there is no document yet", () => {
    const state = deriveStageRailState({
      document: null,
      qaLedger: null,
      activeJob: null,
    });
    expect(state).toEqual({
      brief: "empty",
      scenes: "empty",
      narration: "empty",
      motion: "empty",
      broll: "empty",
      captions: "empty",
      compose: "drafted",
      qa: "empty",
      render: "empty",
    });
  });

  it("marks brief done as soon as a document exists", () => {
    const state = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: null,
    });
    expect(state.brief).toBe("done");
  });

  it("scenes: empty when no scene has narration text, drafted when some do, done when all do", () => {
    const empty = deriveStageRailState({
      document: makeDocument([makeScene(), makeScene({ sceneId: "s2" })]),
      qaLedger: null,
      activeJob: null,
    });
    expect(empty.scenes).toBe("empty");

    const drafted = deriveStageRailState({
      document: makeDocument([
        makeScene({ narration: "Hello" }),
        makeScene({ sceneId: "s2" }),
      ]),
      qaLedger: null,
      activeJob: null,
    });
    expect(drafted.scenes).toBe("drafted");

    const done = deriveStageRailState({
      document: makeDocument([
        makeScene({ narration: "Hello" }),
        makeScene({ sceneId: "s2", narration: "World" }),
      ]),
      qaLedger: null,
      activeJob: null,
    });
    expect(done.scenes).toBe("done");
  });

  it("narration: derived from narrationAudioAssetId across scenes", () => {
    const state = deriveStageRailState({
      document: makeDocument([makeScene({ narrationAudioAssetId: 5 })]),
      qaLedger: null,
      activeJob: null,
    });
    expect(state.narration).toBe("done");
  });

  it("motion: derived from visual.kind === 'template' across scenes", () => {
    const state = deriveStageRailState({
      document: makeDocument([
        makeScene({
          visual: { kind: "template", templateId: "t1", params: {} },
        }),
      ]),
      qaLedger: null,
      activeJob: null,
    });
    expect(state.motion).toBe("done");
  });

  it("captions: derived from captionCues presence across scenes", () => {
    const state = deriveStageRailState({
      document: makeDocument([
        makeScene({ captionCues: [{ startMs: 0, endMs: 500, text: "hi" }] }),
      ]),
      qaLedger: null,
      activeJob: null,
    });
    expect(state.captions).toBe("done");
  });

  it("qa: empty with no ledger entries, done once the ledger has entries", () => {
    const empty = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: null,
    });
    expect(empty.qa).toBe("empty");

    const done = deriveStageRailState({
      document: makeDocument(),
      qaLedger: {
        entries: [
          {
            at: "2026-01-01T00:00:00.000Z",
            round: 1,
            revision: 1,
            review: { score: 8, scorecard: {}, issues: [] },
            creditsUsed: 5,
            modelId: "m",
            traceId: "t",
          },
        ],
        totalCount: 1,
      },
      activeJob: null,
    });
    expect(done.qa).toBe("done");
  });

  it("qa and render: error when the document has a prohibited/unsupported claim", () => {
    const state = deriveStageRailState({
      document: makeDocument(
        [makeScene()],
        [{ claim: "cures everything", source: "scene-1", status: "prohibited" }]
      ),
      qaLedger: null,
      activeJob: null,
    });
    expect(state.qa).toBe("error");
    expect(state.render).toBe("error");
  });

  it("render: drafted once every scene has narration, audio, and caption cues; empty otherwise", () => {
    const empty = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: null,
    });
    expect(empty.render).toBe("empty");

    const ready = deriveStageRailState({
      document: makeDocument([
        makeScene({
          narration: "Hello",
          narrationAudioAssetId: 5,
          captionCues: [{ startMs: 0, endMs: 500, text: "hi" }],
        }),
      ]),
      qaLedger: null,
      activeJob: null,
    });
    expect(ready.render).toBe("drafted");
  });

  it("running: an active scene_plan job marks scenes AND motion as running", () => {
    const state = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: { jobId: "j1", kind: "scene_plan", status: "running" },
    });
    expect(state.scenes).toBe("running");
    expect(state.motion).toBe("running");
  });

  it("running: an active narration job marks narration AND captions as running", () => {
    const state = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: { jobId: "j1", kind: "narration", status: "running" },
    });
    expect(state.narration).toBe("running");
    expect(state.captions).toBe("running");
  });

  it("running: an active auto_draft job marks scenes, narration, motion, and captions as running", () => {
    const state = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: { jobId: "j1", kind: "auto_draft", status: "queued" },
    });
    expect(state.scenes).toBe("running");
    expect(state.narration).toBe("running");
    expect(state.motion).toBe("running");
    expect(state.captions).toBe("running");
  });

  it("running: an active quality_review/quality_repair job marks qa as running, even with a claim block", () => {
    const state = deriveStageRailState({
      document: makeDocument(
        [makeScene()],
        [{ claim: "cures everything", source: "scene-1", status: "prohibited" }]
      ),
      qaLedger: null,
      activeJob: { jobId: "j1", kind: "quality_review", status: "running" },
    });
    expect(state.qa).toBe("running");
  });

  it("compose: never renders 'empty' — drafted with no hand-authored layers, done once one exists (Feature 143 §2.1 D1)", () => {
    const drafted = deriveStageRailState({
      document: makeDocument([makeScene()]),
      qaLedger: null,
      activeJob: null,
    });
    expect(drafted.compose).toBe("drafted");
    expect(drafted.compose).not.toBe("empty");

    const done = deriveStageRailState({
      document: makeDocument([
        makeScene({
          layers: [
            {
              id: "layer_overlay_1",
              type: "text",
              startFrame: 0,
              durationFrames: 30,
              x: 10,
              y: 10,
              width: 30,
              height: 10,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 200,
              content: "Hi",
              fontFamily: "Inter",
              fontSizePx: 24,
              color: "#fff",
              textAlign: "center",
              fontWeight: "normal",
            },
          ],
        }),
      ]),
      qaLedger: null,
      activeJob: null,
    });
    expect(done.compose).toBe("done");
  });

  it("compose: running while a scene-timing-affecting job (scene_plan/auto_draft/quality_repair) is in flight (§4.9.2)", () => {
    const scenePlan = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: { jobId: "j1", kind: "scene_plan", status: "running" },
    });
    expect(scenePlan.compose).toBe("running");

    const autoDraft = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: { jobId: "j1", kind: "auto_draft", status: "running" },
    });
    expect(autoDraft.compose).toBe("running");

    const qualityRepair = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: { jobId: "j1", kind: "quality_repair", status: "running" },
    });
    expect(qualityRepair.compose).toBe("running");

    // narration doesn't move layers on scenes it doesn't rewrite the timing
    // of, so it must NOT flip compose to running.
    const narration = deriveStageRailState({
      document: makeDocument(),
      qaLedger: null,
      activeJob: { jobId: "j1", kind: "narration", status: "running" },
    });
    expect(narration.compose).not.toBe("running");
  });

  it("never throws on malformed qaLedger / activeJob input", () => {
    expect(() =>
      deriveStageRailState({
        document: makeDocument(),
        qaLedger: "not an object",
        activeJob: "also not an object",
      })
    ).not.toThrow();
  });
});
