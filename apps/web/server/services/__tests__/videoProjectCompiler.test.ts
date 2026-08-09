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

  it("builds template motion with the scene-local duration", () => {
    let receivedDurationMs = 0;
    const fakeBuilder: MotionTemplateBuilder = {
      build: (_params, ctx) => {
        receivedDurationMs = ctx.format.durationMs;
        return [baseSceneLayer({
          id: "scene_local_motion",
          durationFrames: Math.round((ctx.format.durationMs / 1000) * ctx.format.fps),
        })];
      },
    };
    const doc = buildDocument({
      scenes: [buildScene({
        endMs: 2000,
        visual: { kind: "template", templateId: "scene_local", params: {} },
        layers: [],
      })],
    });
    const result = compileVideoProject(doc, buildCtx(), {
      resolveTemplate: id => id === "scene_local" ? fakeBuilder : undefined,
    });
    expect(result.kind).toBe("single");
    if (result.kind !== "single") throw new Error("expected single");
    expect(receivedDurationMs).toBe(2000);
    expect(result.config.layers[0]).toMatchObject({ durationFrames: 60 });
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

  it("keeps template copy out of the caption safe area", () => {
    const fakeBuilder: MotionTemplateBuilder = {
      build: () => [
        {
          id: "procedural_background",
          type: "motionComposition",
          compositionId: "particle-field",
          startFrame: 0,
          durationFrames: 150,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 0,
          props: { title: "หัวข้อ", subtitle: "คำโปรย" },
        },
        {
          id: "template_subtitle",
          type: "text",
          startFrame: 0,
          durationFrames: 150,
          x: 5,
          y: 84,
          width: 90,
          height: 8,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 10,
          content: "คำโปรย",
          fontFamily: "Inter",
          fontSizePx: 32,
          color: "#ffffff",
          textAlign: "center",
          fontWeight: "normal",
        },
      ],
    };
    const doc = buildDocument({
      scenes: [
        buildScene({
          visual: { kind: "template", templateId: "safe_motion", params: {} },
          layers: [],
          captionCues: [{ startMs: 0, endMs: 2000, text: "บทพูด" }],
        }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx(), {
      resolveTemplate: id => id === "safe_motion" ? fakeBuilder : undefined,
    });
    if (result.kind !== "single") throw new Error("expected single");

    const motion = result.config.layers.find(layer => layer.type === "motionComposition");
    expect(motion).toMatchObject({ props: { captionSafeArea: true } });
    expect(result.config.layers.find(layer => layer.id === "template_subtitle")).toMatchObject({ y: 8 });
    expect(result.config.layers.find(layer => layer.id === "SC-001_caption_0")).toMatchObject({ y: 76 });
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

  it("Feature 143 §4.8/§4.13: excludes hidden scene layers from the compiled output", () => {
    const doc = buildDocument({
      scenes: [
        buildScene({
          layers: [
            baseSceneLayer({ id: "visible_layer" }),
            baseSceneLayer({ id: "hidden_layer", hidden: true }),
          ],
        }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx());
    if (result.kind !== "single") throw new Error("expected single");
    const ids = result.config.layers.map(l => l.id);
    expect(ids).toContain("visible_layer");
    expect(ids).not.toContain("hidden_layer");
  });

  it("Feature 143 §4.6/§4.8: a hidden layer does not consume the 40-layer budget (41 layers, 1 hidden, still compiles to a single config)", () => {
    // 40 visible layers (one per scene) + 1 hidden layer on the first scene
    // = 41 scene.layers entries total, but only 40 should count toward
    // MAX_LAYERS_PER_CONFIG, so this must compile to `kind: "single"`
    // rather than segmenting.
    const scenes = Array.from({ length: 40 }, (_, index) =>
      buildScene({
        sceneId: `SC-${index}`,
        layers:
          index === 0
            ? [
                baseSceneLayer({ id: `layer_${index}` }),
                baseSceneLayer({ id: "hidden_extra", hidden: true }),
              ]
            : [baseSceneLayer({ id: `layer_${index}` })],
      })
    );
    const doc = buildDocument({ scenes });
    const result = compileVideoProject(doc, buildCtx());
    expect(result.kind).toBe("single");
    if (result.kind !== "single") throw new Error("expected single");
    expect(result.config.layers).toHaveLength(40);
    expect(result.config.layers.map(l => l.id)).not.toContain("hidden_extra");
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

  it("emits a TTS asset attached to a scene as a scene-timed narration layer", () => {
    const doc = buildDocument({
      scenes: [
        buildScene({ sceneId: "SC-1", startMs: 1000, endMs: 4000, narrationAudioAssetId: 9, narrationAudioDurationMs: 4500 }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx({ "9": "https://cdn.example.com/tts.mp3" }));
    if (result.kind !== "single") throw new Error("expected single");

    const [audioLayer] = result.config.layers.filter(layer => layer.type === "audio");
    expect(audioLayer).toMatchObject({
      id: "audio_scene_narration_0",
      src: "https://cdn.example.com/tts.mp3",
      startFrame: 30,
      durationFrames: 135,
      loop: false,
      volume: 1,
    });
  });

  it("reflows a legacy timeline before compiling a narration asset that is longer than its scene", () => {
    const doc = buildDocument({
      format: { width: 1080, height: 1920, fps: 30, durationMs: 10000 },
      scenes: [
        buildScene({ sceneId: "SC-1", startMs: 0, endMs: 5000, narrationAudioAssetId: 9, narrationAudioDurationMs: 7000 }),
        buildScene({ sceneId: "SC-2", startMs: 5000, endMs: 10000, narrationAudioAssetId: 10, narrationAudioDurationMs: 4000 }),
      ],
    });
    const result = compileVideoProject(doc, buildCtx({
      "9": "https://cdn.example.com/tts-1.mp3",
      "10": "https://cdn.example.com/tts-2.mp3",
    }));
    if (result.kind !== "single") throw new Error("expected single");

    expect(result.config.durationInFrames).toBe(360);
    expect(result.config.layers.filter(layer => layer.type === "audio").map(layer => [layer.startFrame, layer.durationFrames])).toEqual([
      [0, 210],
      [210, 120],
    ]);
  });

  describe("Feature 143 §4.8 audio timing/fades", () => {
    it("compiles narration/music tracks without startMs/endMs/fadeInMs/fadeOutMs to the exact same layer shape as before this change (compatibility proof)", () => {
      const doc = buildDocument({
        audioTracks: [
          { kind: "narration", assetRefs: [1], gainDb: 0 },
          { kind: "music", assetRefs: [2], gainDb: -14, ducking: true },
        ],
      });
      const ctx = buildCtx({
        "1": "https://cdn.example.com/narration.mp3",
        "2": "https://cdn.example.com/music.mp3",
      });
      const result = compileVideoProject(doc, ctx);
      if (result.kind !== "single") throw new Error("expected single");
      const [narrationLayer, musicLayer] = result.config.layers.filter(
        l => l.type === "audio"
      );
      const totalDurationFrames = Math.round((5000 / 1000) * 30);
      expect(narrationLayer).toMatchObject({
        startFrame: 0,
        durationFrames: totalDurationFrames,
        loop: false,
        fadeInMs: 0,
        fadeOutMs: 0,
      });
      expect(musicLayer).toMatchObject({
        startFrame: 0,
        durationFrames: totalDurationFrames,
        loop: true,
        fadeInMs: 0,
        fadeOutMs: 0,
      });
    });

    it("bounds a music track's audio layer to its own startMs/endMs instead of the whole document", () => {
      const doc = buildDocument({
        audioTracks: [
          { kind: "music", assetRefs: [2], gainDb: -14, ducking: true, startMs: 1000, endMs: 3000 },
        ],
      });
      const ctx = buildCtx({ "2": "https://cdn.example.com/music.mp3" });
      const result = compileVideoProject(doc, ctx);
      if (result.kind !== "single") throw new Error("expected single");
      const [musicLayer] = result.config.layers.filter(l => l.type === "audio");
      expect(musicLayer.startFrame).toBe(30); // 1000ms @ 30fps
      expect(musicLayer.durationFrames).toBe(60); // (3000-1000)ms @ 30fps
    });

    it("passes fadeInMs/fadeOutMs through to the compiled audio layer", () => {
      const doc = buildDocument({
        audioTracks: [
          {
            kind: "narration",
            assetRefs: [1],
            gainDb: 0,
            fadeInMs: 250,
            fadeOutMs: 500,
          },
        ],
      });
      const ctx = buildCtx({ "1": "https://cdn.example.com/narration.mp3" });
      const result = compileVideoProject(doc, ctx);
      if (result.kind !== "single") throw new Error("expected single");
      const [narrationLayer] = result.config.layers.filter(l => l.type === "audio");
      expect(narrationLayer).toMatchObject({ fadeInMs: 250, fadeOutMs: 500 });
    });
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

  it("carries global audio and watermark layers through every segmented part", () => {
    const scenes = Array.from({ length: 45 }, (_, index) =>
      buildScene({
        sceneId: `SC-${index}`,
        startMs: index * 5000,
        endMs: (index + 1) * 5000,
        layers: [baseSceneLayer({ id: `layer_${index}` })],
      })
    );
    const doc = buildDocument({
      format: { width: 1080, height: 1920, fps: 30, durationMs: 225000 },
      scenes,
      audioTracks: [{ kind: "music", assetRefs: [7], gainDb: -12 }],
    });
    const result = compileVideoProject(doc, buildCtx({ "7": "https://cdn.example.com/music.mp3" }));
    expect(result.kind).toBe("segmented");
    if (result.kind !== "segmented") throw new Error("expected segmented");

    const audioPerPart = result.parts.map(part => part.layers.filter(layer => layer.type === "audio"));
    expect(audioPerPart.every(layers => layers.length === 1)).toBe(true);
    expect(audioPerPart).toHaveLength(2);
    expect(audioPerPart[0]?.[0]).toMatchObject({ startFrame: 0, trimStartSec: 0 });
    expect(audioPerPart[1]?.[0]).toMatchObject({ startFrame: 0, trimStartSec: 195 });
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

  it("throws BrandLockViolationError when locked iconStyle icons use different shapes", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { iconStyle: true },
    };
    const iconLayer = (id: string, shape: string) => ({
      id,
      type: "motionGraphic",
      startFrame: 0,
      durationFrames: 30,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      shape,
      color: "#ffffff",
      loopAnimation: "none",
    });
    const doc = buildDocument({
      scenes: [buildScene({ layers: [iconLayer("icon_1", "circle"), iconLayer("icon_2", "star")] })],
    });
    expect(() => compileVideoProject(doc, buildCtx({}, { brandKit }))).toThrow(BrandLockViolationError);
  });

  it("passes locked iconStyle when every icon shares one shape", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { iconStyle: true },
    };
    const iconLayer = (id: string) => ({
      id,
      type: "motionGraphic",
      startFrame: 0,
      durationFrames: 30,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      shape: "circle",
      color: "#ffffff",
      loopAnimation: "none",
    });
    const doc = buildDocument({
      scenes: [buildScene({ layers: [iconLayer("icon_1"), iconLayer("icon_2")] })],
    });
    expect(() => compileVideoProject(doc, buildCtx({}, { brandKit }))).not.toThrow();
  });

  it("throws BrandLockViolationError when locked motionIntensity differs across scenes", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { motionIntensity: true },
    };
    const doc = buildDocument({
      scenes: [
        buildScene({ sceneId: "SC-1", startMs: 0, endMs: 2000, motion: { intensity: "low", camera: "static" } }),
        buildScene({ sceneId: "SC-2", startMs: 2000, endMs: 4000, motion: { intensity: "high", camera: "static" } }),
      ],
    });
    expect(() => compileVideoProject(doc, buildCtx({}, { brandKit }))).toThrow(BrandLockViolationError);
  });

  it("throws BrandLockViolationError when locked cta text layers disagree", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { cta: true },
    };
    const ctaLayer = (id: string, content: string) => ({
      id,
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
      content,
      fontFamily: "Inter",
      fontSizePx: 32,
      color: "#ffffff",
      textAlign: "center",
      fontWeight: "bold",
    });
    const doc = buildDocument({
      scenes: [
        buildScene({
          sceneId: "SC-1",
          startMs: 0,
          endMs: 2000,
          layers: [ctaLayer("scene1_cta", "Shop Now")],
        }),
        buildScene({
          sceneId: "SC-2",
          startMs: 2000,
          endMs: 4000,
          layers: [ctaLayer("scene2_cta", "Buy Today")],
        }),
      ],
    });
    expect(() => compileVideoProject(doc, buildCtx({}, { brandKit }))).toThrow(BrandLockViolationError);
  });

  it("throws BrandLockViolationError when locked productFidelity is violated by a stretched image", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { productFidelity: true },
    };
    const doc = buildDocument({
      scenes: [buildScene({ layers: [baseSceneLayer({ fit: "fill" })] })],
    });
    expect(() =>
      compileVideoProject(
        doc,
        buildCtx({}, {
          brandKit,
          catalogFacts: { productIds: ["p1"], products: [{ productId: "p1", name: "Product", brand: null, referenceImageUrls: [], referenceImageAssetIds: [] }], claimResolutions: [] },
        }),
      ),
    ).toThrow(BrandLockViolationError);
  });

  it("passes locked productFidelity when images use cover/contain", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { productFidelity: true },
    };
    const doc = buildDocument({
      scenes: [buildScene({ layers: [baseSceneLayer({ fit: "cover" })] })],
    });
    expect(() =>
      compileVideoProject(
        doc,
        buildCtx({}, {
          brandKit,
          catalogFacts: {
            productIds: ["p1"],
            products: [{
              productId: "p1",
              name: "Product",
              brand: null,
              referenceImageUrls: ["https://catalog.example/p1.png"],
              referenceImageAssetIds: [],
            }],
            claimResolutions: [],
          },
        }),
      ),
    ).not.toThrow();
  });

  it("fails closed when productFidelity has no usable reference image", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { productFidelity: true },
    };
    const doc = buildDocument({
      scenes: [buildScene({ layers: [baseSceneLayer({ fit: "cover" })] })],
    });

    expect(() =>
      compileVideoProject(
        doc,
        buildCtx({}, {
          brandKit,
          catalogFacts: {
            productIds: ["p1"],
            products: [{
              productId: "p1",
              name: "Product",
              brand: null,
              referenceImageUrls: [],
              referenceImageAssetIds: [],
            }],
            claimResolutions: [],
          },
        }),
      ),
    ).toThrow(BrandLockViolationError);
  });

  it("fails closed when productFidelity facts resolve a different product id", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { productFidelity: true },
    };
    const doc = buildDocument({
      scenes: [buildScene({ layers: [baseSceneLayer({ fit: "cover" })] })],
    });

    expect(() =>
      compileVideoProject(
        doc,
        buildCtx({}, {
          brandKit,
          catalogFacts: {
            productIds: ["p1"],
            products: [{
              productId: "p2",
              name: "Other product",
              brand: null,
              referenceImageUrls: ["https://catalog.example/p2.png"],
              referenceImageAssetIds: [],
            }],
            claimResolutions: [],
          },
        }),
      ),
    ).toThrow(BrandLockViolationError);
  });

  it("fails closed when productFidelity has no declared products", () => {
    const brandKit: BrandKit = {
      colors: { primary: "#111111" },
      fonts: { heading: "Inter", body: "Inter" },
      captionPresetId: null,
      locks: { productFidelity: true },
    };
    const doc = buildDocument({
      scenes: [buildScene({ layers: [baseSceneLayer({ fit: "cover" })] })],
    });

    expect(() =>
      compileVideoProject(
        doc,
        buildCtx({}, {
          brandKit,
          catalogFacts: { productIds: [], products: [], claimResolutions: [] },
        }),
      ),
    ).toThrow(BrandLockViolationError);
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

  it("emits project watermark slots as locked whole-document brand overlays", () => {
    const doc = buildDocument({
      watermark: {
        enabled: true,
        assetId: 10,
        position: "top_right",
        opacity: 0.45,
        scalePct: 10,
        marginPx: 32,
        secondary: {
          enabled: true,
          assetId: 11,
          position: "bottom_left",
          opacity: 0.35,
          scalePct: 8,
          marginPx: 24,
        },
      },
    });
    const result = compileVideoProject(doc, buildCtx({
      "10": "https://cdn.example.com/primary.png",
      "11": "https://cdn.example.com/secondary.png",
    }));
    if (result.kind !== "single") throw new Error("expected single");
    const watermarks = result.config.layers.filter((layer) => layer.id.startsWith("watermark_"));
    expect(watermarks).toHaveLength(2);
    expect(watermarks.every((layer) => layer.locked && layer.role === "brand")).toBe(true);
    expect(watermarks.every((layer) => layer.durationFrames === 150)).toBe(true);
  });

  it("restarts eligible visual motion at aligned caption cue boundaries", () => {
    const builder: MotionTemplateBuilder = {
      build: () => [baseSceneLayer({ id: "motion_image", durationFrames: 150 })],
    };
    const doc = buildDocument({
      scenes: [buildScene({
        visual: { kind: "template", templateId: "fake_motion", params: {} },
        layers: [],
        motion: { intensity: "medium", camera: "push-in", sync: "captions" },
        captionCues: [
          { startMs: 0, endMs: 2000, text: "หนึ่ง" },
          { startMs: 2000, endMs: 5000, text: "สอง" },
        ],
      })],
    });
    const result = compileVideoProject(doc, buildCtx(), { resolveTemplate: (id) => id === "fake_motion" ? builder : undefined });
    if (result.kind !== "single") throw new Error("expected single");
    expect(result.config.layers.filter((layer) => layer.id.startsWith("motion_image_cue_")).map((layer) => [layer.startFrame, layer.durationFrames])).toEqual([[0, 60], [60, 90]]);
  });

  it("keeps continuous procedural motion intact while captions remain frame-accurate", () => {
    const builder: MotionTemplateBuilder = {
      build: () => {
        const { src: _src, fit: _fit, ...motionFields } = baseSceneLayer({ id: "procedural_motion", durationFrames: 150 });
        return [{
          ...motionFields,
          type: "motionComposition" as const,
          compositionId: "particle-field" as const,
          props: { syncPolicy: "continuous", events: [{ frame: 0, kind: "enter", strength: 1 }] },
        }];
      },
    };
    const doc = buildDocument({
      scenes: [buildScene({
        visual: { kind: "template", templateId: "procedural_motion", params: {} },
        layers: [],
        motion: { intensity: "medium", camera: "push-in", sync: "captions" },
        captionCues: [
          { startMs: 0, endMs: 2000, text: "หนึ่ง" },
          { startMs: 2000, endMs: 5000, text: "สอง" },
        ],
      })],
    });
    const result = compileVideoProject(doc, buildCtx(), {
      resolveTemplate: id => id === "procedural_motion" ? builder : undefined,
    });
    if (result.kind !== "single") throw new Error("expected single");
    const procedural = result.config.layers.filter(layer => layer.type === "motionComposition");
    expect(procedural).toHaveLength(1);
    expect(procedural[0]).toMatchObject({ id: "procedural_motion", startFrame: 0, durationFrames: 150 });
    expect(result.config.layers.filter(layer => layer.type === "text")).toHaveLength(2);
  });

  it("derives procedural motion events from caption cues when no explicit events were authored", () => {
    const builder: MotionTemplateBuilder = {
      build: () => {
        const { src: _src, fit: _fit, ...motionFields } = baseSceneLayer({ id: "procedural_auto_events", durationFrames: 150 });
        return [{
          ...motionFields,
          type: "motionComposition" as const,
          compositionId: "particle-field" as const,
          props: { syncPolicy: "continuous" },
        }];
      },
    };
    const doc = buildDocument({
      scenes: [buildScene({
        visual: { kind: "template", templateId: "procedural_auto_events", params: {} },
        layers: [],
        motion: { intensity: "medium", camera: "push-in", sync: "captions" },
        captionCues: [
          { startMs: 1000, endMs: 2000, text: "หนึ่ง" },
          { startMs: 3000, endMs: 5000, text: "สอง" },
        ],
      })],
    });
    const result = compileVideoProject(doc, buildCtx(), {
      resolveTemplate: id => id === "procedural_auto_events" ? builder : undefined,
    });
    if (result.kind !== "single") throw new Error("expected single");
    const procedural = result.config.layers.find(layer => layer.type === "motionComposition");
    expect(procedural).toMatchObject({
      props: {
        syncPolicy: "event",
        events: [
          { frame: 30, kind: "enter", strength: 1 },
          { frame: 90, kind: "emphasis", strength: 0.8 },
        ],
      },
    });
  });
});
