import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import {
  VideoProjectDocumentSchema,
  normalizeDocument,
  type VideoProjectDocument,
} from "../projectSchemas";

function readFixture(name: string): unknown {
  const fixturePath = path.join(__dirname, "..", "__fixtures__", name);
  return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

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
    layers: [baseSceneLayer()],
    motion: { intensity: "medium", camera: "static" },
    captionCues: [],
    ...overrides,
  };
}

function buildDocument(overrides: Record<string, unknown> = {}) {
  return {
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
  };
}

describe("VideoProjectDocumentSchema", () => {
  it("parses a minimal valid VideoProjectDocument", () => {
    const parsed = VideoProjectDocumentSchema.parse(buildDocument());
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.scenes).toHaveLength(1);
    expect(parsed.scenes[0].sceneId).toBe("SC-001");
    expect(parsed.captions.presetId).toBe("classic_box");
  });

  it("rejects a document with zero scenes", () => {
    const result = VideoProjectDocumentSchema.safeParse(
      buildDocument({ scenes: [] })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unknown platformPreset", () => {
    const result = VideoProjectDocumentSchema.safeParse(
      buildDocument({
        content: { language: "th", platformPreset: "not_a_real_preset" },
      })
    );
    expect(result.success).toBe(false);
  });

  it("accepts scene layers that reuse RemotionLayerSchema variants", () => {
    const parsed = VideoProjectDocumentSchema.parse(
      buildDocument({
        scenes: [
          buildScene({
            layers: [
              baseSceneLayer({ id: "image_layer" }),
              {
                id: "audio_layer",
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
                src: "https://cdn.example.com/narration.mp3",
              },
              {
                id: "text_layer",
                type: "text",
                startFrame: 0,
                durationFrames: 30,
                x: 0,
                y: 0,
                width: 100,
                height: 20,
                rotationDeg: 0,
                opacity: 1,
                zIndex: 1,
                content: "Hello",
              },
            ],
          }),
        ],
      })
    );
    const types = parsed.scenes[0].layers.map(l => l.type);
    expect(types).toEqual(["image", "audio", "text"]);
  });

  it("round-trips a golden fixture deterministically", () => {
    const fixture = readFixture("videoProjectDocument-valid.json");
    const parsed = VideoProjectDocumentSchema.parse(fixture);
    const first = JSON.stringify(normalizeDocument(parsed));
    const second = JSON.stringify(normalizeDocument(parsed));
    expect(first).toEqual(second);

    // A second parse of the same raw fixture must normalize identically —
    // determinism is about the normalized representation, not object
    // identity (research B6).
    const parsedAgain = VideoProjectDocumentSchema.parse(fixture);
    expect(JSON.stringify(normalizeDocument(parsedAgain))).toEqual(first);
  });

  it("parses the golden fixture with expected field values", () => {
    const fixture = readFixture("videoProjectDocument-valid.json");
    const parsed: VideoProjectDocument = VideoProjectDocumentSchema.parse(fixture);
    expect(parsed.scenes).toHaveLength(2);
    expect(parsed.audioTracks).toHaveLength(3);
    expect(parsed.audioTracks[0]).toMatchObject({ kind: "narration" });
    expect(parsed.audioTracks[2]).toMatchObject({ kind: "sfx" });
  });

  describe("backward compatibility — motionCandidates / selectedMotionCandidateId", () => {
    it("parses the pre-existing golden fixture (predates these fields) and defaults them", () => {
      // This fixture has NO `motionCandidates`/`selectedMotionCandidateId`
      // key on either scene — exactly the shape of every document already
      // persisted in `video_projects.document` before this field existed.
      const fixture = readFixture("videoProjectDocument-valid.json");
      const rawScenes = (fixture as { scenes: Array<Record<string, unknown>> }).scenes;
      for (const scene of rawScenes) {
        expect(scene).not.toHaveProperty("motionCandidates");
        expect(scene).not.toHaveProperty("selectedMotionCandidateId");
      }

      const parsed = VideoProjectDocumentSchema.parse(fixture);
      for (const scene of parsed.scenes) {
        expect(scene.motionCandidates).toBeUndefined();
        expect(scene.selectedMotionCandidateId).toBeUndefined();
      }
    });

    it("parses a hand-built pre-existing-shaped document (buildDocument/buildScene never set the new fields)", () => {
      const parsed = VideoProjectDocumentSchema.parse(buildDocument());
      expect(parsed.scenes[0].motionCandidates).toBeUndefined();
      expect(parsed.scenes[0].selectedMotionCandidateId).toBeUndefined();
    });

    it("round-trips a document that already carries motionCandidates + a selection", () => {
      const withMotionCandidates = buildDocument({
        scenes: [
          buildScene({
            motionCandidates: [
              {
                candidateId: "SC-001-v1",
                templateId: "product_hero",
                templateParams: { assetId: 1, mediaKind: "image", headline: "Hi" },
                motion: { intensity: "medium", camera: "static" },
                label: "Calm hero",
                rationale: "A steady open.",
              },
            ],
            selectedMotionCandidateId: "SC-001-v1",
          }),
        ],
      });
      const parsed = VideoProjectDocumentSchema.parse(withMotionCandidates);
      expect(parsed.scenes[0].motionCandidates).toHaveLength(1);
      expect(parsed.scenes[0].selectedMotionCandidateId).toBe("SC-001-v1");
    });

    it("rejects more than 6 motion candidates on one scene", () => {
      const tooMany = Array.from({ length: 7 }, (_, i) => ({
        candidateId: `SC-001-v${i}`,
        templateId: "product_hero",
        templateParams: {},
        motion: { intensity: "medium", camera: "static" },
        label: `Take ${i}`,
        rationale: "x",
      }));
      const result = VideoProjectDocumentSchema.safeParse(
        buildDocument({ scenes: [buildScene({ motionCandidates: tooMany })] }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("backward compatibility — Feature 143 §4.8 layer fields (name/locked/hidden/role)", () => {
    it("parses the pre-existing golden fixture (predates these fields) and leaves them undefined", () => {
      const fixture = readFixture("videoProjectDocument-valid.json");
      const rawScenes = (fixture as { scenes: Array<{ layers: Array<Record<string, unknown>> }> }).scenes;
      for (const scene of rawScenes) {
        for (const layer of scene.layers) {
          expect(layer).not.toHaveProperty("name");
          expect(layer).not.toHaveProperty("locked");
          expect(layer).not.toHaveProperty("hidden");
          expect(layer).not.toHaveProperty("role");
        }
      }

      const parsed = VideoProjectDocumentSchema.parse(fixture);
      for (const scene of parsed.scenes) {
        for (const layer of scene.layers) {
          expect(layer.name).toBeUndefined();
          expect(layer.locked).toBeUndefined();
          expect(layer.hidden).toBeUndefined();
          expect(layer.role).toBeUndefined();
        }
      }
    });

    it("parses a hand-built pre-existing-shaped document (baseSceneLayer never sets the new fields)", () => {
      const parsed = VideoProjectDocumentSchema.parse(buildDocument());
      const layer = parsed.scenes[0].layers[0];
      expect(layer.name).toBeUndefined();
      expect(layer.locked).toBeUndefined();
      expect(layer.hidden).toBeUndefined();
      expect(layer.role).toBeUndefined();
    });

    it("round-trips a layer that sets all four new fields", () => {
      const withNewFields = buildDocument({
        scenes: [
          buildScene({
            layers: [
              baseSceneLayer({
                id: "logo_1",
                name: "โลโก้ร้านค้า",
                locked: true,
                hidden: false,
                role: "brand",
              }),
            ],
          }),
        ],
      });
      const parsed = VideoProjectDocumentSchema.parse(withNewFields);
      const layer = parsed.scenes[0].layers[0];
      expect(layer.name).toBe("โลโก้ร้านค้า");
      expect(layer.locked).toBe(true);
      expect(layer.hidden).toBe(false);
      expect(layer.role).toBe("brand");
    });

    it("rejects an invalid role value", () => {
      const result = VideoProjectDocumentSchema.safeParse(
        buildDocument({
          scenes: [buildScene({ layers: [baseSceneLayer({ role: "not_a_real_role" })] })],
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("Feature 143 §4.8 audio timing/fades (narration/music startMs/endMs/fadeInMs/fadeOutMs)", () => {
    it("parses the pre-existing golden fixture (predates these fields) and leaves them undefined — compatibility proof", () => {
      const fixture = readFixture("videoProjectDocument-valid.json") as {
        audioTracks?: Array<Record<string, unknown>>;
      };
      const rawTracks = fixture.audioTracks ?? [];
      for (const track of rawTracks) {
        expect(track).not.toHaveProperty("startMs");
        expect(track).not.toHaveProperty("endMs");
        expect(track).not.toHaveProperty("fadeInMs");
        expect(track).not.toHaveProperty("fadeOutMs");
      }

      const parsed = VideoProjectDocumentSchema.parse(fixture);
      for (const track of parsed.audioTracks) {
        if (track.kind === "sfx") continue;
        expect(track.startMs).toBeUndefined();
        expect(track.endMs).toBeUndefined();
        expect(track.fadeInMs).toBeUndefined();
        expect(track.fadeOutMs).toBeUndefined();
      }
    });

    it("round-trips a music track that sets startMs/endMs/fadeInMs/fadeOutMs", () => {
      const doc = buildDocument({
        audioTracks: [
          {
            kind: "music",
            assetRefs: [1],
            gainDb: -14,
            ducking: true,
            startMs: 500,
            endMs: 4500,
            fadeInMs: 300,
            fadeOutMs: 300,
          },
        ],
      });
      const parsed = VideoProjectDocumentSchema.parse(doc);
      const track = parsed.audioTracks[0];
      expect(track.kind).toBe("music");
      if (track.kind !== "music") throw new Error("expected music");
      expect(track.startMs).toBe(500);
      expect(track.endMs).toBe(4500);
      expect(track.fadeInMs).toBe(300);
      expect(track.fadeOutMs).toBe(300);
    });

    it("round-trips a narration track that sets startMs/endMs/fadeInMs/fadeOutMs", () => {
      const doc = buildDocument({
        audioTracks: [
          {
            kind: "narration",
            assetRefs: [1],
            gainDb: 0,
            startMs: 0,
            endMs: 2000,
            fadeInMs: 100,
            fadeOutMs: 100,
          },
        ],
      });
      const parsed = VideoProjectDocumentSchema.parse(doc);
      const track = parsed.audioTracks[0];
      expect(track.kind).toBe("narration");
      if (track.kind !== "narration") throw new Error("expected narration");
      expect(track.startMs).toBe(0);
      expect(track.endMs).toBe(2000);
      expect(track.fadeInMs).toBe(100);
      expect(track.fadeOutMs).toBe(100);
    });

    it("rejects a music/narration track whose endMs is not greater than startMs", () => {
      const result = VideoProjectDocumentSchema.safeParse(
        buildDocument({
          audioTracks: [
            { kind: "music", assetRefs: [1], gainDb: -14, startMs: 3000, endMs: 3000 },
          ],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects a music/narration track whose startMs/endMs exceed format.durationMs", () => {
      const result = VideoProjectDocumentSchema.safeParse(
        buildDocument({
          // format.durationMs is 5000 in buildDocument()
          audioTracks: [
            { kind: "narration", assetRefs: [1], gainDb: 0, startMs: 0, endMs: 6000 },
          ],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("an sfx track (unaffected by this change) still parses with only per-event atMs", () => {
      const parsed = VideoProjectDocumentSchema.parse(
        buildDocument({
          audioTracks: [
            { kind: "sfx", events: [{ assetRef: 1, atMs: 1000 }] },
          ],
        }),
      );
      expect(parsed.audioTracks[0]).toMatchObject({ kind: "sfx" });
    });
  });
});
