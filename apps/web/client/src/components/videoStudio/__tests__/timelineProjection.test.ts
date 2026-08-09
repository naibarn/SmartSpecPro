import { describe, expect, it } from "vitest";

import { createDefaultDocument } from "../createDefaultDocument";
import {
  bandForLayer,
  collectAuthoredLayerClips,
  framesToMs,
  msToFrames,
  projectTimeline,
  timelineContentDurationMs,
  type TimelineClip,
} from "../timelineProjection";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";
import type { Scene, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

function baseLayer(overrides: Partial<RemotionLayer> = {}): RemotionLayer {
  return {
    id: "layer-1",
    type: "image",
    startFrame: 0,
    durationFrames: 30,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
    src: "https://example.com/img.png",
    fit: "cover",
    ...overrides,
  } as RemotionLayer;
}

function sceneWithLayers(overrides: Partial<Scene>, layers: RemotionLayer[]): Scene {
  return {
    sceneId: "scene-1",
    startMs: 0,
    endMs: 5000,
    narration: null,
    narrationAudioAssetId: null,
    visual: { kind: "layers" },
    layers,
    motion: { intensity: "medium", camera: "static" },
    captionCues: [],
    ...overrides,
  };
}

function docWithScenes(scenes: Scene[], overrides: Partial<VideoProjectDocument> = {}): VideoProjectDocument {
  const base = createDefaultDocument({});
  return {
    ...base,
    scenes,
    ...overrides,
  };
}

function findClip(doc: VideoProjectDocument, trackId: string, clipId: string): TimelineClip {
  const projection = projectTimeline(doc);
  const track = projection.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`track ${trackId} not found`);
  const clip = track.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error(`clip ${clipId} not found in ${trackId}`);
  return clip;
}

describe("msToFrames / framesToMs", () => {
  it("round-trips within rounding tolerance", () => {
    expect(msToFrames(1000, 30)).toBe(30);
    expect(framesToMs(30, 30)).toBe(1000);
    expect(msToFrames(500, 30)).toBe(15);
  });

  it("never returns a negative frame count", () => {
    expect(msToFrames(-100, 30)).toBe(0);
  });
});

describe("projectTimeline — absolute ms conversion", () => {
  it("offsets a layer's scene-relative startFrame by the owning scene's startMs, converted through frames (non-zero scene start)", () => {
    // scene starts at 2000ms @ 30fps -> sceneStartFrame = 60
    // layer startFrame = 15 (0.5s) -> absoluteFrame = 75 -> 2500ms
    const scene = sceneWithLayers(
      { sceneId: "scene-2", startMs: 2000, endMs: 8000 },
      [baseLayer({ id: "img-1", startFrame: 15, durationFrames: 30, zIndex: 10 })],
    );
    const doc = docWithScenes([scene]);
    const clip = findClip(doc, "background", "layer:scene-2:img-1");
    expect(clip.startMs).toBe(2500);
    expect(clip.durationMs).toBe(1000);
  });

  it("does not truncate a layer whose duration extends past its owning scene's end", () => {
    // scene spans 0-1000ms; layer starts at 0 and runs 3000ms (90 frames @30fps)
    const scene = sceneWithLayers(
      { sceneId: "scene-3", startMs: 0, endMs: 1000 },
      [baseLayer({ id: "bg-1", startFrame: 0, durationFrames: 90, zIndex: 0 })],
    );
    const doc = docWithScenes([scene]);
    const clip = findClip(doc, "background", "layer:scene-3:bg-1");
    expect(clip.startMs).toBe(0);
    expect(clip.durationMs).toBe(3000); // NOT clamped to the 1000ms scene span
  });
});

describe("bandForLayer / band->row assignment", () => {
  it("uses the explicit role field when present, overriding zIndex", () => {
    // zIndex says "background" range but role explicitly says brand.
    const layer = baseLayer({ zIndex: 5, role: "brand" });
    expect(bandForLayer(layer)).toBe("brand");
  });

  it("falls back to the zIndex band convention when role is absent", () => {
    expect(bandForLayer(baseLayer({ zIndex: 0 }))).toBe("background");
    expect(bandForLayer(baseLayer({ zIndex: 99 }))).toBe("background");
    expect(bandForLayer(baseLayer({ zIndex: 100 }))).toBe("overlay");
    expect(bandForLayer(baseLayer({ zIndex: 499 }))).toBe("overlay");
    expect(bandForLayer(baseLayer({ zIndex: 500 }))).toBe("brand");
    expect(bandForLayer(baseLayer({ zIndex: 900 }))).toBe("brand");
  });

  it("routes layers into the correct track by band", () => {
    const scene = sceneWithLayers({}, [
      baseLayer({ id: "bg", zIndex: 0 }),
      baseLayer({ id: "ov", zIndex: 200 }),
      baseLayer({ id: "br", zIndex: 700 }),
    ]);
    const doc = docWithScenes([scene]);
    const projection = projectTimeline(doc);
    const byId = (id: string) => projection.tracks.find((t) => t.id === id)!;
    expect(byId("background").clips.map((c) => c.id)).toEqual(["layer:scene-1:bg"]);
    expect(byId("overlay").clips.map((c) => c.id)).toEqual(["layer:scene-1:ov"]);
    expect(byId("brand").clips.map((c) => c.id)).toEqual(["layer:scene-1:br"]);
  });
});

describe("hidden layers", () => {
  it("marks hidden: true but keeps the clip in the projection (never dropped)", () => {
    const scene = sceneWithLayers({}, [baseLayer({ id: "hidden-1", hidden: true, zIndex: 0 })]);
    const doc = docWithScenes([scene]);
    const clip = findClip(doc, "background", "layer:scene-1:hidden-1");
    expect(clip.hidden).toBe(true);
  });

  it("visible layers report hidden: false", () => {
    const scene = sceneWithLayers({}, [baseLayer({ id: "visible-1", zIndex: 0 })]);
    const doc = docWithScenes([scene]);
    const clip = findClip(doc, "background", "layer:scene-1:visible-1");
    expect(clip.hidden).toBe(false);
  });
});

describe("subtitle track", () => {
  it("derives one clip per captionCue, offset through the owning scene like a layer", () => {
    const scene: Scene = {
      ...sceneWithLayers({ sceneId: "scene-4", startMs: 1000, endMs: 6000 }, []),
      captionCues: [{ startMs: 500, endMs: 1500, text: "hello" }],
    };
    const doc = docWithScenes([scene]);
    const clip = findClip(doc, "subtitles", "caption:scene-4:0");
    // sceneStartFrame(1000ms@30fps)=30, cueStartFrame(500ms)=15 -> 45 frames -> 1500ms
    expect(clip.startMs).toBe(1500);
    expect(clip.durationMs).toBe(1000);
    expect(clip.label).toBe("hello");
    expect(clip.locked).toBe(true);
  });

  it("is read-only", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])]);
    const projection = projectTimeline(doc);
    const subtitles = projection.tracks.find((t) => t.id === "subtitles")!;
    expect(subtitles.readOnly).toBe(true);
  });
});

describe("audio tracks", () => {
  it("spans the whole document for narration/music tracks", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])], {
      audioTracks: [{ kind: "narration", assetRefs: [1], gainDb: 0 }],
      format: { width: 1080, height: 1920, fps: 30, durationMs: 12000 },
    });
    const clip = findClip(doc, "audio-0", "audio:0");
    expect(clip.startMs).toBe(0);
    expect(clip.durationMs).toBe(12000);
  });

  it("creates one clip per sfx event at its own atMs", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])], {
      audioTracks: [
        {
          kind: "sfx",
          events: [
            { assetRef: 1, atMs: 100 },
            { assetRef: 2, atMs: 4000 },
          ],
        },
      ],
    });
    const projection = projectTimeline(doc);
    const track = projection.tracks.find((t) => t.id === "audio-0")!;
    expect(track.clips).toHaveLength(2);
    expect(track.clips[0].startMs).toBe(100);
    expect(track.clips[1].startMs).toBe(4000);
  });
});

describe("audio clip metadata (P3 §4.8/§6)", () => {
  it("marks a track with no explicit startMs/endMs as NOT an explicit span (renders as full-video)", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])], {
      audioTracks: [{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }],
      format: { width: 1080, height: 1920, fps: 30, durationMs: 12000 },
    });
    const clip = findClip(doc, "audio-0", "audio:0");
    expect(clip.audioSpanExplicit).toBe(false);
    expect(clip.startMs).toBe(0);
    expect(clip.durationMs).toBe(12000);
    expect(clip.audioGainDb).toBe(-14);
    expect(clip.audioDucking).toBe(true);
  });

  it("marks a track WITH an explicit startMs/endMs as an explicit (bounded) span", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])], {
      audioTracks: [
        { kind: "music", assetRefs: [1], gainDb: -14, ducking: false, startMs: 1000, endMs: 4000 },
      ],
      format: { width: 1080, height: 1920, fps: 30, durationMs: 12000 },
    });
    const clip = findClip(doc, "audio-0", "audio:0");
    expect(clip.audioSpanExplicit).toBe(true);
    expect(clip.startMs).toBe(1000);
    expect(clip.durationMs).toBe(3000);
    expect(clip.audioDucking).toBe(false);
  });

  it("leaves audioDucking undefined for a narration track (no ducking field on that variant)", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])], {
      audioTracks: [{ kind: "narration", assetRefs: [1], gainDb: 0 }],
    });
    const clip = findClip(doc, "audio-0", "audio:0");
    expect(clip.audioDucking).toBeUndefined();
  });
});

describe("track order", () => {
  it("is scene, brand, overlay, background, subtitles, then audio rows", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])], {
      audioTracks: [{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }],
    });
    const projection = projectTimeline(doc);
    expect(projection.tracks.map((t) => t.id)).toEqual([
      "scene",
      "brand",
      "overlay",
      "background",
      "subtitles",
      "audio-0",
    ]);
  });
});

describe("collectAuthoredLayerClips", () => {
  it("pairs each authored layer clip with its full source RemotionLayer (geometry included)", () => {
    const scene = sceneWithLayers({}, [
      baseLayer({ id: "img-a", zIndex: 0, x: 10, y: 20, width: 30, height: 40, opacity: 0.5 }),
    ]);
    const doc = docWithScenes([scene]);
    const pairs = collectAuthoredLayerClips(doc);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].clip.id).toBe("layer:scene-1:img-a");
    expect(pairs[0].layer.x).toBe(10);
    expect(pairs[0].layer.y).toBe(20);
    expect(pairs[0].layer.width).toBe(30);
    expect(pairs[0].layer.height).toBe(40);
    expect(pairs[0].layer.opacity).toBe(0.5);
  });

  it("excludes scene/subtitle/audio rows", () => {
    const scene: Scene = {
      ...sceneWithLayers({}, []),
      captionCues: [{ startMs: 0, endMs: 500, text: "hi" }],
    };
    const doc = docWithScenes([scene], {
      audioTracks: [{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }],
    });
    expect(collectAuthoredLayerClips(doc)).toHaveLength(0);
  });
});

describe("timelineContentDurationMs", () => {
  it("extends past the nominal document duration when a clip runs longer", () => {
    const scene = sceneWithLayers(
      { sceneId: "scene-5", startMs: 0, endMs: 1000 },
      [baseLayer({ id: "long-bg", startFrame: 0, durationFrames: 600, zIndex: 0 })], // 20s @30fps
    );
    const doc = docWithScenes([scene], {
      format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    });
    const projection = projectTimeline(doc);
    expect(timelineContentDurationMs(projection)).toBe(20000);
  });

  it("falls back to the document duration when no clip runs past it", () => {
    const doc = docWithScenes([sceneWithLayers({ endMs: 5000 }, [])], {
      format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    });
    const projection = projectTimeline(doc);
    expect(timelineContentDurationMs(projection)).toBe(5000);
  });
});
