import { describe, expect, it } from "vitest";

import { RemotionTemplateConfigSchema } from "../../../shared/remotion/layerTemplateSchemas";
import { VideoProjectDocumentSchema } from "../../../shared/videoIntelligence/projectSchemas";
import type { BrandKit } from "../../../shared/videoIntelligence/brandKit";
import {
  BrandLockViolationError,
  VideoProjectCompileError,
  compileVideoProject,
  type MotionTemplateBuilder,
  type TemplateBuildContext,
} from "../videoProjectCompiler";

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

function buildCtx(
  assetMap: Record<string, string> = {},
  overrides: Partial<TemplateBuildContext> = {}
): TemplateBuildContext {
  return {
    format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    brandKit: null,
    assetResolver: {
      url(assetId) {
        const key = String(assetId);
        if (!(key in assetMap)) {
          throw new Error(`asset not found: ${key}`);
        }
        return assetMap[key];
      },
      sha256() {
        return undefined;
      },
    },
    ...overrides,
  };
}

describe("compileVideoProject", () => {
  it("compiles a single-scene layers document to a schema-valid RemotionTemplateConfig", () => {
    const doc = buildDocument();
    const result = compileVideoProject(doc, buildCtx());
    expect(result.kind).toBe("single");
    if (result.kind !== "single") throw new Error("expected single");
    expect(RemotionTemplateConfigSchema.safeParse(result.config).success).toBe(
      true
    );
    expect(result.config.layers).toHaveLength(1);
    expect(result.cost.score).toBeGreaterThanOrEqual(0);
  });

  it("expands a template scene via the registry into layers", () => {
    const fakeBuilder: MotionTemplateBuilder = {
      build: () => [
        {
          id: "tmpl_layer",
          type: "text",
          startFrame: 5,
          durationFrames: 30,
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 0,
          content: "Templated",
          fontFamily: "Inter",
          fontSizePx: 48,
          color: "#ffffff",
          textAlign: "center",
          fontWeight: "normal",
        },
      ],
    };
    const doc = buildDocument({
      scenes: [
        buildScene({
          visual: { kind: "template", templateId: "hero", params: {} },
          layers: [],
        }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx(), {
      resolveTemplate: id => (id === "hero" ? fakeBuilder : undefined),
    });
    expect(result.kind).toBe("single");
    if (result.kind !== "single") throw new Error("expected single");
    expect(result.config.layers).toHaveLength(1);
    expect(result.config.layers[0]).toMatchObject({
      type: "text",
      content: "Templated",
    });
  });

  it("emits caption text layers from captionCues when burnIn is false", () => {
    const doc = buildDocument({
      captions: { presetId: "classic_box", burnIn: false, language: "th" },
      scenes: [
        buildScene({
          captionCues: [
            { startMs: 0, endMs: 2000, text: "Hello" },
            { startMs: 2000, endMs: 4000, text: "World" },
          ],
        }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx());
    if (result.kind !== "single") throw new Error("expected single");
    const captionLayers = result.config.layers.filter(l => l.type === "text");
    expect(captionLayers).toHaveLength(2);
  });

  it("skips caption text layers when captions.burnIn is true", () => {
    const doc = buildDocument({
      captions: { presetId: "classic_box", burnIn: true, language: "th" },
      scenes: [
        buildScene({
          captionCues: [{ startMs: 0, endMs: 2000, text: "Hello" }],
        }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx());
    if (result.kind !== "single") throw new Error("expected single");
    const captionLayers = result.config.layers.filter(l => l.type === "text");
    expect(captionLayers).toHaveLength(0);
  });

  it("offsets scene-relative startFrame to absolute frames", () => {
    const doc = buildDocument({
      scenes: [
        buildScene({
          startMs: 2000,
          layers: [baseSceneLayer({ id: "offset_layer", startFrame: 10 })],
        }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx());
    if (result.kind !== "single") throw new Error("expected single");
    // fps=30, sceneStartMs=2000 -> +60 frames, plus layer's own 10 = 70
    const layer = result.config.layers.find(l => l.id === "offset_layer");
    expect(layer?.startFrame).toBe(70);
  });

  it("emits audio layers from audioTracks (narration/music/sfx)", () => {
    const doc = buildDocument({
      audioTracks: [
        { kind: "narration", assetRefs: [1], gainDb: 0 },
        { kind: "music", assetRefs: [2], gainDb: -14, ducking: true },
        {
          kind: "sfx",
          events: [
            { assetRef: 3, atMs: 1000 },
            { assetRef: 3, atMs: 2000 },
          ],
        },
      ],
    });
    const ctx = buildCtx({
      "1": "https://cdn.example.com/narration.mp3",
      "2": "https://cdn.example.com/music.mp3",
      "3": "https://cdn.example.com/sfx.mp3",
    });
    const result = compileVideoProject(doc, ctx);
    if (result.kind !== "single") throw new Error("expected single");
    const audioLayers = result.config.layers.filter(l => l.type === "audio");
    expect(audioLayers).toHaveLength(4);
  });

  it("splits into segmented parts when >40 layers", () => {
    const scenes = Array.from({ length: 45 }, (_, index) =>
      buildScene({
        sceneId: `SC-${index}`,
        layers: [baseSceneLayer({ id: `layer_${index}` })],
      })
    );
    const doc = buildDocument({ scenes });
    const result = compileVideoProject(doc, buildCtx());
    expect(result.kind).toBe("segmented");
    if (result.kind !== "segmented") throw new Error("expected segmented");
    const totalLayers = result.parts.reduce(
      (sum, part) => sum + part.layers.length,
      0
    );
    expect(totalLayers).toBe(45);
    for (const part of result.parts) {
      expect(part.layers.length).toBeLessThanOrEqual(40);
      expect(RemotionTemplateConfigSchema.safeParse(part).success).toBe(true);
    }
    expect(result.concat.parts).toHaveLength(result.parts.length);
    expect(result.concat.parts[0]).toMatchObject({ index: 0 });
  });

  it("throws VideoProjectCompileError on an unknown templateId", () => {
    const doc = buildDocument({
      scenes: [
        buildScene({
          visual: { kind: "template", templateId: "not-registered", params: {} },
          layers: [],
        }),
      ],
    });
    expect.assertions(2);
    try {
      compileVideoProject(doc, buildCtx());
    } catch (error) {
      expect(error).toBeInstanceOf(VideoProjectCompileError);
      expect((error as VideoProjectCompileError).code).toBe(
        "VI_TEMPLATE_UNKNOWN"
      );
    }
  });

  it("throws on an unresolved asset reference", () => {
    const doc = buildDocument({
      audioTracks: [{ kind: "narration", assetRefs: [999], gainDb: 0 }],
    });
    expect.assertions(2);
    try {
      compileVideoProject(doc, buildCtx({}));
    } catch (error) {
      expect(error).toBeInstanceOf(VideoProjectCompileError);
      expect((error as VideoProjectCompileError).code).toBe(
        "VI_ASSET_UNRESOLVED"
      );
    }
  });

  it("throws BrandLockViolationError when a locked color is violated", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { colors: true },
    };
    const doc = buildDocument({
      scenes: [
        buildScene({
          layers: [
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
              zIndex: 0,
              content: "Off-brand color",
              color: "#ffffff",
            },
          ],
        }),
      ],
    });
    expect(() =>
      compileVideoProject(doc, buildCtx({}, { brandKit }))
    ).toThrow(BrandLockViolationError);
  });

  it("passes brand tokens through when not locked", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { colors: false },
    };
    const doc = buildDocument({
      scenes: [
        buildScene({
          layers: [
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
              zIndex: 0,
              content: "Any color",
              color: "#ff00ff",
            },
          ],
        }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx({}, { brandKit }));
    if (result.kind !== "single") throw new Error("expected single");
    const textLayer = result.config.layers.find(l => l.id === "text_layer");
    expect(textLayer).toMatchObject({ color: "#ff00ff" });
  });

  it("output always validates against RemotionTemplateConfigSchema", () => {
    const doc = buildDocument();
    const result = compileVideoProject(doc, buildCtx());
    if (result.kind === "single") {
      expect(RemotionTemplateConfigSchema.safeParse(result.config).success).toBe(
        true
      );
    } else {
      for (const part of result.parts) {
        expect(RemotionTemplateConfigSchema.safeParse(part).success).toBe(
          true
        );
      }
    }
  });
});
