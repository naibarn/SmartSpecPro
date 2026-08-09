import { describe, expect, it } from "vitest";

import { createDefaultDocument } from "../createDefaultDocument";
import { framesToMs, msToFrames } from "../timelineProjection";
import {
  LAYER_BAND_RANGES,
  LAYER_ID_PREFIX,
  TimelineEditError,
  addLayer,
  addMusicAudioTrack,
  bringForward,
  duplicateLayer,
  generateLayerId,
  migrateForFormatChange,
  moveLayer,
  removeAudioTrack,
  removeLayer,
  renameLayer,
  resizeLayer,
  sendBackward,
  setAudioTrackDucking,
  setAudioTrackFades,
  setAudioTrackGainDb,
  setAudioTrackSpan,
  setLayerBand,
  setLayerHidden,
  setLayerLocked,
  setLayerProps,
  replaceLayerSource,
  type LayerRef,
} from "../timelineEdits";
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
  return { ...base, scenes, ...overrides };
}

function layersOf(doc: VideoProjectDocument, sceneId: string): RemotionLayer[] {
  const scene = doc.scenes.find((s) => s.sceneId === sceneId);
  if (!scene) throw new Error(`scene ${sceneId} not found`);
  return scene.layers;
}

function findLayerAnywhere(doc: VideoProjectDocument, layerId: string): RemotionLayer {
  for (const scene of doc.scenes) {
    const layer = scene.layers.find((l) => l.id === layerId);
    if (layer) return layer;
  }
  throw new Error(`layer ${layerId} not found in any scene`);
}

/* -------------------------------------------------------------------------- */
/* generateLayerId — §4.12 id policy                                         */
/* -------------------------------------------------------------------------- */

describe("generateLayerId", () => {
  it("always uses the reserved vsclip_ prefix", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateLayerId().startsWith(LAYER_ID_PREFIX)).toBe(true);
    }
  });

  it("never matches the compiler's reserved caption/audio patterns and never ends in _cta", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateLayerId();
      expect(id.includes("_caption_")).toBe(false);
      expect(id.startsWith("audio_")).toBe(false);
      expect(id.endsWith("_cta")).toBe(false);
    }
  });

  it("produces document-wide-unique ids across many calls", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateLayerId()));
    expect(ids.size).toBe(500);
  });
});

/* -------------------------------------------------------------------------- */
/* moveLayer — re-homing across a scene boundary preserves absolute time      */
/* -------------------------------------------------------------------------- */

describe("moveLayer", () => {
  it("re-homes a layer onto the scene containing its new absolute start, preserving absolute time", () => {
    const sceneA = sceneWithLayers(
      { sceneId: "scene-a", startMs: 0, endMs: 3000 },
      [baseLayer({ id: "img-1", startFrame: 0, durationFrames: 30 })], // fps=30 -> 1000ms
    );
    const sceneB = sceneWithLayers({ sceneId: "scene-b", startMs: 3000, endMs: 8000 }, []);
    const doc = docWithScenes([sceneA, sceneB]);
    expect(doc.format.fps).toBe(30);

    const ref: LayerRef = { sceneId: "scene-a", layerId: "img-1" };
    // Move to absolute 4000ms — inside scene-b's [3000,8000) span.
    const next = moveLayer(doc, ref, 4000);

    expect(layersOf(next, "scene-a").length).toBe(0);
    const moved = layersOf(next, "scene-b")[0];
    expect(moved.id).toBe("img-1");
    // relative to scene-b's startMs (3000): 4000-3000=1000ms -> 30 frames @30fps
    expect(moved.startFrame).toBe(30);
    // Absolute time is preserved: sceneB.startMs + framesToMs(30,30) === 4000
    expect(sceneB.startMs + framesToMs(moved.startFrame, doc.format.fps)).toBe(4000);
  });

  it("clamps to the nearest scene when the target time falls outside every scene", () => {
    const sceneA = sceneWithLayers({ sceneId: "scene-a", startMs: 0, endMs: 3000 }, [
      baseLayer({ id: "img-1" }),
    ]);
    const doc = docWithScenes([sceneA]);
    const ref: LayerRef = { sceneId: "scene-a", layerId: "img-1" };
    const next = moveLayer(doc, ref, 100000);
    // Only one scene exists — must land back on it, not be dropped.
    expect(layersOf(next, "scene-a").length).toBe(1);
  });

  it("refuses to move a locked layer", () => {
    const sceneA = sceneWithLayers({ sceneId: "scene-a", startMs: 0, endMs: 3000 }, [
      baseLayer({ id: "img-1", locked: true }),
    ]);
    const doc = docWithScenes([sceneA]);
    const ref: LayerRef = { sceneId: "scene-a", layerId: "img-1" };
    expect(() => moveLayer(doc, ref, 1500)).toThrow(TimelineEditError);
  });

  it("never adds/removes/reorders/retimes scenes", () => {
    const sceneA = sceneWithLayers({ sceneId: "scene-a", startMs: 0, endMs: 3000 }, [
      baseLayer({ id: "img-1" }),
    ]);
    const sceneB = sceneWithLayers({ sceneId: "scene-b", startMs: 3000, endMs: 8000 }, []);
    const doc = docWithScenes([sceneA, sceneB]);
    const ref: LayerRef = { sceneId: "scene-a", layerId: "img-1" };
    const next = moveLayer(doc, ref, 4000);
    expect(next.scenes.map((s) => [s.sceneId, s.startMs, s.endMs])).toEqual(
      doc.scenes.map((s) => [s.sceneId, s.startMs, s.endMs]),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* resizeLayer — left-edge video trim does not slide content                 */
/* -------------------------------------------------------------------------- */

describe("resizeLayer", () => {
  it("right edge changes duration only, never touches startFrame/trimStartSec", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1", startMs: 0, endMs: 8000 }, [
      baseLayer({
        id: "vid-1",
        type: "video",
        startFrame: 30,
        durationFrames: 60,
        trimStartSec: 2,
      } as Partial<RemotionLayer>),
    ]);
    const doc = docWithScenes([scene]);
    const ref: LayerRef = { sceneId: "scene-1", layerId: "vid-1" };
    // absolute start = 1000ms, absolute end = 1000+2000=3000ms. Extend end to 4000ms.
    const next = resizeLayer(doc, ref, "end", 4000);
    const updated = findLayerAnywhere(next, "vid-1") as RemotionLayer & { type: "video" };
    expect(updated.startFrame).toBe(30);
    expect(updated.trimStartSec).toBe(2);
    expect(updated.durationFrames).toBe(90); // 3000ms @30fps
  });

  it("left-edge video trim adjusts trimStartSec AND startFrame together so content does not slide", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1", startMs: 0, endMs: 8000 }, [
      baseLayer({
        id: "vid-1",
        type: "video",
        startFrame: 30, // absolute start 1000ms
        durationFrames: 90, // 3000ms -> absolute end 4000ms
        trimStartSec: 2,
      } as Partial<RemotionLayer>),
    ]);
    const doc = docWithScenes([scene]);
    const ref: LayerRef = { sceneId: "scene-1", layerId: "vid-1" };
    // Trim the start edge forward by 500ms (1000ms -> 1500ms).
    const next = resizeLayer(doc, ref, "start", 1500);
    const updated = findLayerAnywhere(next, "vid-1") as RemotionLayer & { type: "video" };
    expect(updated.startFrame).toBe(45); // 1500ms @30fps
    expect(updated.durationFrames).toBe(75); // end fixed at 4000ms -> 2500ms duration
    // trimStartSec advances by the same 500ms delta, so the same source frame
    // keeps playing at the new start instead of restarting the clip.
    expect(updated.trimStartSec).toBeCloseTo(2.5, 5);
  });

  it("left-edge trim on a non-video layer changes only startFrame/durationFrames", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1", startMs: 0, endMs: 8000 }, [
      baseLayer({ id: "img-1", startFrame: 30, durationFrames: 90 }),
    ]);
    const doc = docWithScenes([scene]);
    const ref: LayerRef = { sceneId: "scene-1", layerId: "img-1" };
    const next = resizeLayer(doc, ref, "start", 1500);
    const updated = findLayerAnywhere(next, "img-1");
    expect("trimStartSec" in updated).toBe(false);
    expect(updated.startFrame).toBe(45);
    expect(updated.durationFrames).toBe(75);
  });

  it("clamps to a minimum 1-frame duration", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1", startMs: 0, endMs: 8000 }, [
      baseLayer({ id: "img-1", startFrame: 0, durationFrames: 30 }),
    ]);
    const doc = docWithScenes([scene]);
    const ref: LayerRef = { sceneId: "scene-1", layerId: "img-1" };
    const next = resizeLayer(doc, ref, "end", -1000000);
    const updated = findLayerAnywhere(next, "img-1");
    expect(updated.durationFrames).toBeGreaterThanOrEqual(1);
  });

  it("refuses to resize a locked layer", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1", startMs: 0, endMs: 8000 }, [
      baseLayer({ id: "img-1", locked: true }),
    ]);
    const doc = docWithScenes([scene]);
    const ref: LayerRef = { sceneId: "scene-1", layerId: "img-1" };
    expect(() => resizeLayer(doc, ref, "end", 5000)).toThrow(TimelineEditError);
  });
});

/* -------------------------------------------------------------------------- */
/* Band changes — zIndex stays inside the band, never hits 900                */
/* -------------------------------------------------------------------------- */

describe("setLayerBand / bringForward / sendBackward", () => {
  it("keeps zIndex inside the target band's range and sets role", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1" }, [
      baseLayer({ id: "img-1", zIndex: 0 }),
    ]);
    const doc = docWithScenes([scene]);
    const ref: LayerRef = { sceneId: "scene-1", layerId: "img-1" };

    const next = setLayerBand(doc, ref, "brand");
    const updated = findLayerAnywhere(next, "img-1");
    expect(updated.role).toBe("brand");
    expect(updated.zIndex).toBeGreaterThanOrEqual(LAYER_BAND_RANGES.brand.min);
    expect(updated.zIndex).toBeLessThanOrEqual(LAYER_BAND_RANGES.brand.max);
    expect(updated.zIndex).toBeLessThan(900);
  });

  it("never produces a zIndex that collides with the reserved caption 900, across many band reassignments", () => {
    let doc = docWithScenes([
      sceneWithLayers(
        { sceneId: "scene-1" },
        Array.from({ length: 10 }, (_, i) => baseLayer({ id: `img-${i}`, zIndex: i })),
      ),
    ]);
    for (let i = 0; i < 10; i++) {
      doc = setLayerBand(doc, { sceneId: "scene-1", layerId: `img-${i}` }, "brand");
    }
    for (const layer of layersOf(doc, "scene-1")) {
      expect(layer.zIndex).toBeLessThanOrEqual(LAYER_BAND_RANGES.brand.max);
      expect(layer.zIndex).not.toBe(900);
    }
  });

  it("bringForward swaps zIndex with the next layer in the same band, never showing a z number to the caller", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1" }, [
      baseLayer({ id: "a", zIndex: 10, role: "overlay" }),
      baseLayer({ id: "b", zIndex: 20, role: "overlay" }),
    ]);
    const doc = docWithScenes([scene]);
    const next = bringForward(doc, { sceneId: "scene-1", layerId: "a" });
    expect(findLayerAnywhere(next, "a").zIndex).toBe(20);
    expect(findLayerAnywhere(next, "b").zIndex).toBe(10);
  });

  it("bringForward on the frontmost layer in its band is a no-op", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1" }, [
      baseLayer({ id: "a", zIndex: 10, role: "overlay" }),
      baseLayer({ id: "b", zIndex: 20, role: "overlay" }),
    ]);
    const doc = docWithScenes([scene]);
    const next = bringForward(doc, { sceneId: "scene-1", layerId: "b" });
    expect(findLayerAnywhere(next, "b").zIndex).toBe(20);
  });

  it("sendBackward swaps zIndex with the previous layer in the same band", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1" }, [
      baseLayer({ id: "a", zIndex: 10, role: "overlay" }),
      baseLayer({ id: "b", zIndex: 20, role: "overlay" }),
    ]);
    const doc = docWithScenes([scene]);
    const next = sendBackward(doc, { sceneId: "scene-1", layerId: "b" });
    expect(findLayerAnywhere(next, "a").zIndex).toBe(20);
    expect(findLayerAnywhere(next, "b").zIndex).toBe(10);
  });
});

/* -------------------------------------------------------------------------- */
/* addLayer / removeLayer / duplicateLayer / lock / hidden / rename           */
/* -------------------------------------------------------------------------- */

describe("addLayer", () => {
  it("inserts a full-bleed background layer onto the owning scene with a reserved id", () => {
    const sceneA = sceneWithLayers({ sceneId: "scene-a", startMs: 0, endMs: 3000 }, []);
    const sceneB = sceneWithLayers({ sceneId: "scene-b", startMs: 3000, endMs: 8000 }, []);
    const doc = docWithScenes([sceneA, sceneB]);
    const { document: next, layerId } = addLayer(doc, {
      layer: { type: "image", src: "https://example.com/a.png" },
      absoluteStartMs: 4000,
      durationMs: 1000,
      band: "background",
    });
    expect(layerId.startsWith(LAYER_ID_PREFIX)).toBe(true);
    expect(layersOf(next, "scene-a").length).toBe(0);
    const inserted = layersOf(next, "scene-b")[0];
    expect(inserted.id).toBe(layerId);
    expect(inserted.role).toBe("background");
    expect((inserted as RemotionLayer & { x: number }).x).toBe(0);
    expect((inserted as RemotionLayer & { width: number }).width).toBe(100);
  });

  it("rejects an invalid layer input via schema validation", () => {
    const doc = docWithScenes([sceneWithLayers({ sceneId: "scene-1" }, [])]);
    expect(() =>
      addLayer(doc, {
        // @ts-expect-error deliberately invalid — missing required `src`
        layer: { type: "image" },
        absoluteStartMs: 0,
        durationMs: 1000,
        band: "overlay",
      }),
    ).toThrow(TimelineEditError);
  });
});

describe("removeLayer / duplicateLayer / setLayerLocked / setLayerHidden / renameLayer", () => {
  it("removeLayer deletes the layer and refuses when locked", () => {
    const doc = docWithScenes([
      sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1" })]),
    ]);
    const next = removeLayer(doc, { sceneId: "scene-1", layerId: "img-1" });
    expect(layersOf(next, "scene-1").length).toBe(0);

    const lockedDoc = docWithScenes([
      sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1", locked: true })]),
    ]);
    expect(() => removeLayer(lockedDoc, { sceneId: "scene-1", layerId: "img-1" })).toThrow(
      TimelineEditError,
    );
  });

  it("duplicateLayer produces a new document-unique id and is allowed on a locked layer", () => {
    const doc = docWithScenes([
      sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1", locked: true })]),
    ]);
    const { document: next, layerId } = duplicateLayer(doc, {
      sceneId: "scene-1",
      layerId: "img-1",
    });
    expect(layerId).not.toBe("img-1");
    expect(layersOf(next, "scene-1").length).toBe(2);
    expect(findLayerAnywhere(next, layerId).locked).toBe(true);
  });

  it("setLayerLocked can unlock a locked layer", () => {
    const doc = docWithScenes([
      sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1", locked: true })]),
    ]);
    const next = setLayerLocked(doc, { sceneId: "scene-1", layerId: "img-1" }, false);
    expect(findLayerAnywhere(next, "img-1").locked).toBe(false);
  });

  it("setLayerHidden toggles hidden regardless of lock state", () => {
    const doc = docWithScenes([
      sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1", locked: true })]),
    ]);
    const next = setLayerHidden(doc, { sceneId: "scene-1", layerId: "img-1" }, true);
    expect(findLayerAnywhere(next, "img-1").hidden).toBe(true);
  });

  it("renameLayer sets and clears the name label", () => {
    const doc = docWithScenes([
      sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1" })]),
    ]);
    const renamed = renameLayer(doc, { sceneId: "scene-1", layerId: "img-1" }, "โลโก้");
    expect(findLayerAnywhere(renamed, "img-1").name).toBe("โลโก้");
    const cleared = renameLayer(renamed, { sceneId: "scene-1", layerId: "img-1" }, "   ");
    expect(findLayerAnywhere(cleared, "img-1").name).toBeUndefined();
  });
});

describe("setLayerProps", () => {
  it("clamps geometry percent fields to 0-100 and opacity to 0-1", () => {
    const doc = docWithScenes([
      sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1" })]),
    ]);
    const next = setLayerProps(doc, { sceneId: "scene-1", layerId: "img-1" }, {
      x: 150,
      y: -20,
      opacity: 3,
    });
    const updated = findLayerAnywhere(next, "img-1");
    expect(updated.x).toBe(100);
    expect(updated.y).toBe(0);
    expect(updated.opacity).toBe(1);
  });

  it("refuses to patch a locked layer", () => {
    const doc = docWithScenes([
      sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1", locked: true })]),
    ]);
    expect(() =>
      setLayerProps(doc, { sceneId: "scene-1", layerId: "img-1" }, { opacity: 0.5 }),
    ).toThrow(TimelineEditError);
  });
});

describe("replaceLayerSource (AC16)", () => {
  it("replaces a locked media source without unlocking the layer", () => {
    const doc = docWithScenes([
      sceneWithLayers({}, [baseLayer({ id: "img-1", src: "/dead.png", locked: true })]),
    ]);
    const next = replaceLayerSource(doc, { sceneId: "scene-1", layerId: "img-1" }, "https://example.com/replacement.png");
    const layer = next.scenes[0].layers[0];
    expect(layer).toMatchObject({ src: "https://example.com/replacement.png", locked: true });
  });
});

/* -------------------------------------------------------------------------- */
/* addMusicAudioTrack — P3 §2 "ใส่เพลงประกอบ" launcher (G9)                    */
/* -------------------------------------------------------------------------- */

describe("addMusicAudioTrack", () => {
  it("appends a kind:'music' track spanning the whole document (no startMs/endMs = loop)", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])]);
    expect(doc.audioTracks).toHaveLength(0);

    const next = addMusicAudioTrack(doc, 42);

    expect(next.audioTracks).toHaveLength(1);
    const track = next.audioTracks[0];
    expect(track.kind).toBe("music");
    if (track.kind === "music") {
      expect(track.assetRefs).toEqual([42]);
      expect(track.gainDb).toBe(-14);
      expect(track.ducking).toBe(true);
      expect(track.startMs).toBeUndefined();
      expect(track.endMs).toBeUndefined();
    }
    // Never touches scene.layers[] — this writes document.audioTracks only.
    expect(next.scenes).toBe(doc.scenes);
  });

  it("appends after any existing audio tracks rather than replacing them", () => {
    const doc = docWithScenes([sceneWithLayers({}, [])], {
      audioTracks: [{ kind: "narration", assetRefs: [1], gainDb: 0 }],
    });
    const next = addMusicAudioTrack(doc, 7);
    expect(next.audioTracks).toHaveLength(2);
    expect(next.audioTracks[0].kind).toBe("narration");
    expect(next.audioTracks[1].kind).toBe("music");
  });
});

/* -------------------------------------------------------------------------- */
/* migrateForFormatChange — AC17 fps + canvas migration                       */
/* -------------------------------------------------------------------------- */

describe("migrateForFormatChange", () => {
  it("preserves absolute layer timing across an fps change", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1", startMs: 1000, endMs: 9000 }, [
      baseLayer({ id: "img-1", startFrame: 60, durationFrames: 30 }), // @30fps: 2000ms start, 1000ms duration (relative)
    ]);
    const doc = docWithScenes([scene], { format: { width: 1080, height: 1920, fps: 30, durationMs: 10000 } });

    const migrated = migrateForFormatChange(doc, {
      fromFps: 30,
      toFps: 24,
      fromWidth: 1080,
      toWidth: 1080,
      fromHeight: 1920,
      toHeight: 1920,
    });

    expect(migrated.format.fps).toBe(24);
    const updated = findLayerAnywhere(migrated, "img-1");
    // Absolute ms preserved: scene.startMs (unchanged) + framesToMs(startFrame, newFps)
    const absoluteBefore = scene.startMs + framesToMs(60, 30);
    const absoluteAfter = migrated.scenes[0].startMs + framesToMs(updated.startFrame, 24);
    expect(absoluteAfter).toBe(absoluteBefore);
    const durationBefore = framesToMs(30, 30);
    const durationAfter = framesToMs(updated.durationFrames, 24);
    expect(durationAfter).toBe(durationBefore);
  });

  it("rescales fontSizePx by the height ratio on a canvas height change", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1" }, [
      baseLayer({ id: "text-1", type: "text", content: "hi", fontSizePx: 48 } as Partial<RemotionLayer>),
    ]);
    const doc = docWithScenes([scene], { format: { width: 1080, height: 1920, fps: 30, durationMs: 10000 } });

    const migrated = migrateForFormatChange(doc, {
      fromFps: 30,
      toFps: 30,
      fromWidth: 1080,
      toWidth: 540,
      fromHeight: 1920,
      toHeight: 960, // half height
    });

    const updated = findLayerAnywhere(migrated, "text-1") as RemotionLayer & { fontSizePx: number };
    expect(updated.fontSizePx).toBe(24); // 48 * (960/1920)
  });

  it("is a no-op when nothing changes", () => {
    const doc = docWithScenes([sceneWithLayers({ sceneId: "scene-1" }, [baseLayer({ id: "img-1" })])]);
    const migrated = migrateForFormatChange(doc, {
      fromFps: doc.format.fps,
      toFps: doc.format.fps,
      fromWidth: doc.format.width,
      toWidth: doc.format.width,
      fromHeight: doc.format.height,
      toHeight: doc.format.height,
    });
    expect(migrated).toBe(doc);
  });

  it("never adds/removes/reorders/retimes scenes", () => {
    const scene = sceneWithLayers({ sceneId: "scene-1", startMs: 0, endMs: 5000 }, [
      baseLayer({ id: "img-1" }),
    ]);
    const doc = docWithScenes([scene]);
    const migrated = migrateForFormatChange(doc, {
      fromFps: 30,
      toFps: 24,
      fromWidth: 1080,
      toWidth: 1080,
      fromHeight: 1920,
      toHeight: 1920,
    });
    expect(migrated.scenes.map((s) => [s.sceneId, s.startMs, s.endMs])).toEqual([
      ["scene-1", 0, 5000],
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* msToFrames / framesToMs re-export sanity                                   */
/* -------------------------------------------------------------------------- */

describe("frame conversion re-use", () => {
  it("uses the same msToFrames/framesToMs as timelineProjection.ts", () => {
    expect(msToFrames(1000, 30)).toBe(30);
    expect(framesToMs(30, 30)).toBe(1000);
  });
});

/* -------------------------------------------------------------------------- */
/* Audio track edits — P3 §4.8/§6 audio-track controls (this round)           */
/* -------------------------------------------------------------------------- */

function docWithAudioTracks(
  audioTracks: VideoProjectDocument["audioTracks"],
  formatOverrides: Partial<VideoProjectDocument["format"]> = {},
): VideoProjectDocument {
  const base = docWithScenes([sceneWithLayers({}, [])]);
  return { ...base, audioTracks, format: { ...base.format, ...formatOverrides } };
}

describe("setAudioTrackGainDb", () => {
  it("round-trips a value within -60..24", () => {
    const doc = docWithAudioTracks([{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }]);
    const next = setAudioTrackGainDb(doc, 0, 3);
    expect(next.audioTracks[0]).toMatchObject({ gainDb: 3 });
  });

  it("clamps above 24 down to 24 and below -60 up to -60 — never a linear multiplier", () => {
    const doc = docWithAudioTracks([{ kind: "narration", assetRefs: [1], gainDb: 0 }]);
    expect(setAudioTrackGainDb(doc, 0, 100).audioTracks[0]).toMatchObject({ gainDb: 24 });
    expect(setAudioTrackGainDb(doc, 0, -100).audioTracks[0]).toMatchObject({ gainDb: -60 });
  });

  it("throws for an sfx track (no gainDb field on that variant)", () => {
    const doc = docWithAudioTracks([{ kind: "sfx", events: [{ assetRef: 1, atMs: 0 }] }]);
    expect(() => setAudioTrackGainDb(doc, 0, -10)).toThrow(TimelineEditError);
  });

  it("throws for an out-of-range track index", () => {
    const doc = docWithAudioTracks([]);
    expect(() => setAudioTrackGainDb(doc, 0, -10)).toThrow(TimelineEditError);
  });
});

describe("setAudioTrackDucking", () => {
  it("toggles ducking on a music track", () => {
    const doc = docWithAudioTracks([{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }]);
    const off = setAudioTrackDucking(doc, 0, false);
    expect(off.audioTracks[0]).toMatchObject({ ducking: false });
    const on = setAudioTrackDucking(off, 0, true);
    expect(on.audioTracks[0]).toMatchObject({ ducking: true });
  });

  it("throws for a narration track (no ducking field on that variant)", () => {
    const doc = docWithAudioTracks([{ kind: "narration", assetRefs: [1], gainDb: 0 }]);
    expect(() => setAudioTrackDucking(doc, 0, true)).toThrow(TimelineEditError);
  });
});

describe("setAudioTrackSpan", () => {
  it("sets a valid bounded span within the document duration", () => {
    const doc = docWithAudioTracks(
      [{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }],
      { durationMs: 20000 },
    );
    const next = setAudioTrackSpan(doc, 0, { startMs: 1000, endMs: 5000 });
    expect(next.audioTracks[0]).toMatchObject({ startMs: 1000, endMs: 5000 });
  });

  it("clears back to 'spans the whole document' when both bounds are null", () => {
    const doc = docWithAudioTracks(
      [{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true, startMs: 1000, endMs: 5000 }],
      { durationMs: 20000 },
    );
    const next = setAudioTrackSpan(doc, 0, { startMs: null, endMs: null });
    expect(next.audioTracks[0].startMs).toBeUndefined();
    expect(next.audioTracks[0].endMs).toBeUndefined();
  });

  it("rejects endMs <= startMs — the UI must never be able to produce that, not just saveDocument", () => {
    const doc = docWithAudioTracks(
      [{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }],
      { durationMs: 20000 },
    );
    expect(() => setAudioTrackSpan(doc, 0, { startMs: 5000, endMs: 5000 })).toThrow(TimelineEditError);
    expect(() => setAudioTrackSpan(doc, 0, { startMs: 5000, endMs: 1000 })).toThrow(TimelineEditError);
  });

  it("rejects a bound beyond the document duration", () => {
    const doc = docWithAudioTracks(
      [{ kind: "music", assetRefs: [1], gainDb: -14, ducking: true }],
      { durationMs: 8000 },
    );
    expect(() => setAudioTrackSpan(doc, 0, { startMs: 0, endMs: 9000 })).toThrow(TimelineEditError);
  });

  it("throws for an sfx track", () => {
    const doc = docWithAudioTracks([{ kind: "sfx", events: [{ assetRef: 1, atMs: 0 }] }]);
    expect(() => setAudioTrackSpan(doc, 0, { startMs: 0, endMs: 1000 })).toThrow(TimelineEditError);
  });
});

describe("setAudioTrackFades", () => {
  it("sets fadeInMs/fadeOutMs, clamping negative input to 0", () => {
    const doc = docWithAudioTracks([{ kind: "narration", assetRefs: [1], gainDb: 0 }]);
    const next = setAudioTrackFades(doc, 0, { fadeInMs: 500, fadeOutMs: -10 });
    expect(next.audioTracks[0]).toMatchObject({ fadeInMs: 500, fadeOutMs: 0 });
  });
});

describe("removeAudioTrack", () => {
  it("removes exactly the track at the given index", () => {
    const doc = docWithAudioTracks([
      { kind: "narration", assetRefs: [1], gainDb: 0 },
      { kind: "music", assetRefs: [2], gainDb: -14, ducking: true },
    ]);
    const next = removeAudioTrack(doc, 0);
    expect(next.audioTracks).toHaveLength(1);
    expect(next.audioTracks[0].kind).toBe("music");
  });

  it("throws for an out-of-range index", () => {
    const doc = docWithAudioTracks([]);
    expect(() => removeAudioTrack(doc, 0)).toThrow(TimelineEditError);
  });
});
