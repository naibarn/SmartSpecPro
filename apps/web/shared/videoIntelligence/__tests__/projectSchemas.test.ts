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
});
