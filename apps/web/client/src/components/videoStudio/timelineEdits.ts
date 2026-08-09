/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P2, §4.5/§4.8/§4.11/
 * §4.12. PURE edit operations on a `VideoProjectDocument`: every exported
 * function here takes a document (+ args) and returns a NEW document — never
 * mutates its input, never calls tRPC, never imports server code (per this
 * round's brief). `useTimelineHistory.ts` wraps these in the undo stack;
 * `useClipDrag.ts` calls them from pointer handlers; the panel/inspector
 * components (owned by another agent this round) call them from clicks/forms.
 *
 * Timing math (`msToFrames`/`framesToMs`) and the zIndex-band convention
 * (`bandForLayer`) are imported from `timelineProjection.ts` rather than
 * re-implemented, so this file can never drift from what the timeline
 * actually displays — see that file's own module docstring for why the
 * rounding matters.
 *
 * **The one invariant every function here preserves by construction:**
 * scenes are never added, removed, reordered or retimed — only
 * `scene.layers[]` arrays are ever replaced. §3.2 says scenes must stay a
 * strictly ordered, non-overlapping spine while layers above them are free;
 * because no function in this file ever touches `scene.startMs`/`scene.endMs`
 * or the scenes array's length/order, that invariant holds automatically.
 * `finalize()` asserts it defensively on every return path so a future bug
 * here fails loudly in a unit test instead of corrupting a document.
 *
 * **ID policy (§4.12):** every id this module generates is prefixed
 * `vsclip_` (`LAYER_ID_PREFIX`), which can never collide with the compiler's
 * reserved generated-id patterns `${sceneId}_caption_${index}` (no
 * `"_caption_"` substring appears in a `vsclip_`-prefixed id) or
 * `audio_${kind}_${i}_${j}` (a `vsclip_`-prefixed id never starts with
 * `"audio_"`), and can never accidentally end in `_cta` (the suffix alphabet
 * is `[0-9a-z]`, which has no underscore) — `generateLayerId()` still asserts
 * all three defensively rather than trusting the scheme silently.
 */
import type { AudioTrack, Scene, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import {
  RemotionLayerSchema,
  type RemotionLayer,
  type RemotionScene3dLayer,
} from "@shared/remotion/layerTemplateSchemas";
import { bandForLayer, framesToMs, msToFrames } from "./timelineProjection";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class TimelineEditError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TimelineEditError";
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Shared types                                                               */
/* -------------------------------------------------------------------------- */

/** Points at exactly one `scene.layers[]` entry — the same addressing shape
 *  `TimelineClipRef`'s `kind: "layer"` variant carries (`timelineProjection.ts`),
 *  deliberately narrower (no `band`/`layerType` — those are derived, not
 *  needed to locate the entry). */
export interface LayerRef {
  sceneId: string;
  layerId: string;
}

export type LayerBand = "background" | "overlay" | "brand";

/** §4.1's zIndex-band contract, mirrored here so callers never guess a raw
 *  number and so `setLayerBand`/`addLayer` can clamp into it. Captions are
 *  pinned at `zIndex: 900` by the compiler (never a band member); every band
 *  max below stays under that on purpose. */
export const LAYER_BAND_RANGES: Record<LayerBand, { min: number; max: number }> = {
  background: { min: 0, max: 99 },
  overlay: { min: 100, max: 499 },
  brand: { min: 500, max: 899 },
};

/* -------------------------------------------------------------------------- */
/* Layer ids (§4.12)                                                          */
/* -------------------------------------------------------------------------- */

export const LAYER_ID_PREFIX = "vsclip_";

let layerIdCounter = 0;

/** Document-wide-unique, reserved-pattern-safe id for an editor-created
 *  layer. The server now rejects duplicate ids at `saveDocument`
 *  (`VI_DUPLICATE_LAYER_ID`), so collisions are a hard save failure, not a
 *  cosmetic bug — the timestamp+counter+random composition makes a
 *  same-millisecond collision astronomically unlikely even across two
 *  concurrent editor tabs. */
export function generateLayerId(): string {
  layerIdCounter += 1;
  const stamp = Date.now().toString(36);
  const counter = layerIdCounter.toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const id = `${LAYER_ID_PREFIX}${stamp}${counter}${random}`;
  // Defensive only — see module docstring for why this can't actually
  // trigger given the current id scheme. Never ship a silently-colliding id
  // if the scheme above ever changes.
  if (id.includes("_caption_") || id.startsWith("audio_") || id.endsWith("_cta")) {
    return `${id}x`;
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                          */
/* -------------------------------------------------------------------------- */

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function findLayer(
  document: VideoProjectDocument,
  ref: LayerRef,
): { sceneIndex: number; scene: Scene; layer: RemotionLayer } {
  const sceneIndex = document.scenes.findIndex((s) => s.sceneId === ref.sceneId);
  if (sceneIndex === -1) {
    throw new TimelineEditError("VS_SCENE_NOT_FOUND", `scene not found: ${ref.sceneId}`);
  }
  const scene = document.scenes[sceneIndex];
  const layer = scene.layers.find((l) => l.id === ref.layerId);
  if (!layer) {
    throw new TimelineEditError(
      "VS_LAYER_NOT_FOUND",
      `layer not found: ${ref.layerId} on scene ${ref.sceneId}`,
    );
  }
  return { sceneIndex, scene, layer };
}

function assertNotLocked(layer: RemotionLayer): void {
  if (layer.locked) {
    throw new TimelineEditError("VS_LAYER_LOCKED", `layer "${layer.id}" is locked`);
  }
}

function updateScene(
  document: VideoProjectDocument,
  sceneId: string,
  updater: (scene: Scene) => Scene,
): VideoProjectDocument {
  const scenes = document.scenes.map((s) => (s.sceneId === sceneId ? updater(s) : s));
  return { ...document, scenes };
}

/** Replaces one layer entry in place, without changing its owning scene. */
function replaceLayerInPlace(
  document: VideoProjectDocument,
  ref: LayerRef,
  updated: RemotionLayer,
): VideoProjectDocument {
  return updateScene(document, ref.sceneId, (scene) => ({
    ...scene,
    layers: scene.layers.map((l) => (l.id === ref.layerId ? updated : l)),
  }));
}

/** Removes a layer from its old scene and appends it to `targetSceneId`
 *  (a no-op relocation when `targetSceneId === ref.sceneId`) — the re-homing
 *  primitive `moveLayer`/left-edge `resizeLayer` build on. */
function replaceLayer(
  document: VideoProjectDocument,
  ref: LayerRef,
  targetSceneId: string,
  updated: RemotionLayer,
): VideoProjectDocument {
  if (targetSceneId === ref.sceneId) {
    return replaceLayerInPlace(document, ref, updated);
  }
  const withoutOld = updateScene(document, ref.sceneId, (scene) => ({
    ...scene,
    layers: scene.layers.filter((l) => l.id !== ref.layerId),
  }));
  return updateScene(withoutOld, targetSceneId, (scene) => ({
    ...scene,
    layers: [...scene.layers, updated],
  }));
}

/** Finds the scene whose `[startMs, endMs)` span contains `absoluteStartMs`.
 *  Mirrors `rehomeLayersForSceneTimingChange`'s "leave it, don't destroy it"
 *  fallback (`server/services/videoProjectScenePlanner.ts`): if no scene's
 *  span contains the point (e.g. dragged past the last scene, or before the
 *  first), falls back to `fallbackSceneId` if given, else clamps to the
 *  nearest scene (first if before all, last if after all) rather than
 *  throwing or dropping the layer. */
function findOwningScene(
  scenes: readonly Scene[],
  absoluteStartMs: number,
  fallbackSceneId?: string,
): Scene {
  if (scenes.length === 0) {
    throw new TimelineEditError("VS_NO_SCENES", "document has no scenes");
  }
  const sorted = [...scenes].sort((a, b) => a.startMs - b.startMs);
  const found = sorted.find((s) => absoluteStartMs >= s.startMs && absoluteStartMs < s.endMs);
  if (found) return found;
  if (fallbackSceneId) {
    const fallback = scenes.find((s) => s.sceneId === fallbackSceneId);
    if (fallback) return fallback;
  }
  if (absoluteStartMs < sorted[0].startMs) return sorted[0];
  return sorted[sorted.length - 1];
}

function layerAbsoluteStartMs(layer: RemotionLayer, scene: Scene, fps: number): number {
  const sceneStartFrame = msToFrames(scene.startMs, fps);
  return framesToMs(layer.startFrame + sceneStartFrame, fps);
}

function maxZIndexInBand(document: VideoProjectDocument, band: LayerBand): number | undefined {
  let max: number | undefined;
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (bandForLayer(layer) !== band) continue;
      if (max === undefined || layer.zIndex > max) max = layer.zIndex;
    }
  }
  return max;
}

/** Picks a zIndex at the top of `band`'s range — one above the highest
 *  zIndex any layer in that band (document-wide) currently uses, clamped
 *  into the band's own bounds so it can never collide with the reserved
 *  caption `900`. */
function topOfBandZIndex(document: VideoProjectDocument, band: LayerBand): number {
  const range = LAYER_BAND_RANGES[band];
  const maxUsed = maxZIndexInBand(document, band);
  return Math.min(range.max, Math.max(range.min, maxUsed === undefined ? range.min : maxUsed + 1));
}

interface BandLayerEntry {
  sceneId: string;
  layer: RemotionLayer;
}

function collectBandLayersSorted(document: VideoProjectDocument, band: LayerBand): BandLayerEntry[] {
  const items: BandLayerEntry[] = [];
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (bandForLayer(layer) === band) items.push({ sceneId: scene.sceneId, layer });
    }
  }
  items.sort((a, b) => a.layer.zIndex - b.layer.zIndex);
  return items;
}

/** Asserts the scene spine (§3.2) never moved — see module docstring. Every
 *  exported mutator routes its return value through this before handing it
 *  back, so a future change that accidentally touches scene timing fails a
 *  unit test immediately instead of corrupting a saved document. */
function finalize(before: VideoProjectDocument, after: VideoProjectDocument): VideoProjectDocument {
  if (before.scenes.length !== after.scenes.length) {
    throw new TimelineEditError("VS_SCENES_MUTATED", "a layer edit must never add/remove scenes");
  }
  for (let i = 0; i < before.scenes.length; i++) {
    const b = before.scenes[i];
    const a = after.scenes[i];
    if (b.sceneId !== a.sceneId) {
      throw new TimelineEditError("VS_SCENES_MUTATED", "a layer edit must never reorder scenes");
    }
    if (b.startMs !== a.startMs || b.endMs !== a.endMs) {
      throw new TimelineEditError("VS_SCENES_MUTATED", "a layer edit must never retime a scene");
    }
  }
  return after;
}

/* -------------------------------------------------------------------------- */
/* moveLayer — §4.5 drag-along-time, re-homing across scene boundaries        */
/* -------------------------------------------------------------------------- */

/**
 * Moves a layer to a new ABSOLUTE start time (ms), re-homing it onto
 * whichever scene contains that absolute time and recomputing
 * `startFrame` relative to the new owning scene — mirroring
 * `rehomeLayersForSceneTimingChange`'s semantics (server-side helper for the
 * AI-retiming case; this is the direct-manipulation equivalent, §4.5).
 * Refuses to move a `locked` layer.
 */
export function moveLayer(
  document: VideoProjectDocument,
  ref: LayerRef,
  newAbsoluteStartMs: number,
): VideoProjectDocument {
  const { scene, layer } = findLayer(document, ref);
  assertNotLocked(layer);
  const fps = document.format.fps;
  const clampedStartMs = Math.max(0, newAbsoluteStartMs);
  const targetScene = findOwningScene(document.scenes, clampedStartMs, scene.sceneId);
  const relativeMs = Math.max(0, clampedStartMs - targetScene.startMs);
  const updated: RemotionLayer = { ...layer, startFrame: msToFrames(relativeMs, fps) };
  return finalize(document, replaceLayer(document, ref, targetScene.sceneId, updated));
}

/* -------------------------------------------------------------------------- */
/* resizeLayer — §4.5 edge trims                                             */
/* -------------------------------------------------------------------------- */

export type ResizeEdge = "start" | "end";

function applyStartEdgeResize(
  layer: RemotionLayer,
  newStartFrame: number,
  newDurationFrames: number,
  deltaMs: number,
): RemotionLayer {
  if (layer.type === "video") {
    const deltaSec = deltaMs / 1000;
    return {
      ...layer,
      startFrame: newStartFrame,
      durationFrames: newDurationFrames,
      trimStartSec: Math.max(0, layer.trimStartSec + deltaSec),
    };
  }
  return { ...layer, startFrame: newStartFrame, durationFrames: newDurationFrames };
}

/**
 * Trims one edge of a layer to a new ABSOLUTE ms position.
 * - `edge: "end"` changes `durationFrames` only (no `trimEndSec` field
 *   exists or is needed — a shorter `durationFrames` truncates, §4.5).
 * - `edge: "start"` moves `startFrame` (re-homing across a scene boundary
 *   if needed, same as `moveLayer`) and shrinks `durationFrames` so the
 *   clip's END stays fixed; for `type: "video"` it ALSO advances
 *   `trimStartSec` by the same delta so the visible content does not slide
 *   (§4.5's explicit requirement — a plain start-frame move without the
 *   trim adjustment would restart the source clip from a different point).
 *
 * Both edges clamp to a minimum 1-frame duration and refuse a `locked`
 * layer.
 */
export function resizeLayer(
  document: VideoProjectDocument,
  ref: LayerRef,
  edge: ResizeEdge,
  newAbsoluteEdgeMs: number,
): VideoProjectDocument {
  const { scene, layer } = findLayer(document, ref);
  assertNotLocked(layer);
  const fps = document.format.fps;
  const absStart = layerAbsoluteStartMs(layer, scene, fps);
  const absDurationMs = framesToMs(layer.durationFrames, fps);
  const absEnd = absStart + absDurationMs;
  const oneFrameMs = Math.max(1, framesToMs(1, fps));

  if (edge === "end") {
    const clampedEnd = Math.max(absStart + oneFrameMs, newAbsoluteEdgeMs);
    const newDurationFrames = Math.max(1, msToFrames(clampedEnd - absStart, fps));
    const updated: RemotionLayer = { ...layer, durationFrames: newDurationFrames };
    return finalize(document, replaceLayerInPlace(document, ref, updated));
  }

  const clampedStart = Math.min(Math.max(0, newAbsoluteEdgeMs), absEnd - oneFrameMs);
  const deltaMs = clampedStart - absStart;
  const newDurationFrames = Math.max(1, msToFrames(absDurationMs - deltaMs, fps));
  const targetScene = findOwningScene(document.scenes, clampedStart, scene.sceneId);
  const relativeMs = Math.max(0, clampedStart - targetScene.startMs);
  const newStartFrame = msToFrames(relativeMs, fps);
  const updated = applyStartEdgeResize(layer, newStartFrame, newDurationFrames, deltaMs);
  return finalize(document, replaceLayer(document, ref, targetScene.sceneId, updated));
}

/* -------------------------------------------------------------------------- */
/* Band / z-order — §4.5 "never show a z-order number", §4.15                */
/* -------------------------------------------------------------------------- */

/** Moves a layer into `band`, setting `role` explicitly and placing it at
 *  the top of that band's zIndex range (document-wide) so it renders above
 *  every other layer already in the band — never colliding with the
 *  reserved caption `zIndex: 900`. Refuses a `locked` layer. */
export function setLayerBand(
  document: VideoProjectDocument,
  ref: LayerRef,
  band: LayerBand,
): VideoProjectDocument {
  const { layer } = findLayer(document, ref);
  assertNotLocked(layer);
  const zIndex = topOfBandZIndex(document, band);
  const updated: RemotionLayer = { ...layer, role: band, zIndex };
  return finalize(document, replaceLayerInPlace(document, ref, updated));
}

/** `นำมาไว้ด้านหน้า` — swaps zIndex with the next-higher layer in the SAME
 *  band (document-wide order), a no-op if already frontmost. Never exposes
 *  or requires a raw z number to the caller (§4.15). Refuses a `locked`
 *  layer. */
export function bringForward(document: VideoProjectDocument, ref: LayerRef): VideoProjectDocument {
  const { layer } = findLayer(document, ref);
  assertNotLocked(layer);
  const band = bandForLayer(layer);
  const items = collectBandLayersSorted(document, band);
  const idx = items.findIndex((i) => i.layer.id === ref.layerId);
  if (idx === -1 || idx === items.length - 1) return document;
  const current = items[idx];
  const next = items[idx + 1];
  let doc = replaceLayerInPlace(
    document,
    { sceneId: current.sceneId, layerId: current.layer.id },
    { ...current.layer, zIndex: next.layer.zIndex },
  );
  doc = replaceLayerInPlace(
    doc,
    { sceneId: next.sceneId, layerId: next.layer.id },
    { ...next.layer, zIndex: current.layer.zIndex },
  );
  return finalize(document, doc);
}

/** `ส่งไปด้านหลัง` — the mirror of `bringForward`. */
export function sendBackward(document: VideoProjectDocument, ref: LayerRef): VideoProjectDocument {
  const { layer } = findLayer(document, ref);
  assertNotLocked(layer);
  const band = bandForLayer(layer);
  const items = collectBandLayersSorted(document, band);
  const idx = items.findIndex((i) => i.layer.id === ref.layerId);
  if (idx <= 0) return document;
  const current = items[idx];
  const prev = items[idx - 1];
  let doc = replaceLayerInPlace(
    document,
    { sceneId: current.sceneId, layerId: current.layer.id },
    { ...current.layer, zIndex: prev.layer.zIndex },
  );
  doc = replaceLayerInPlace(
    doc,
    { sceneId: prev.sceneId, layerId: prev.layer.id },
    { ...prev.layer, zIndex: current.layer.zIndex },
  );
  return finalize(document, doc);
}

/* -------------------------------------------------------------------------- */
/* setLayerProps — position/size/opacity/rotation + type-specific fields      */
/* -------------------------------------------------------------------------- */

export type LayerPropsPatch = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotationDeg: number;
}> &
  Record<string, unknown>;

/** Patches geometry/opacity/rotation and/or type-specific fields (e.g.
 *  `content`, `color`, `fontSizePx`) on a layer. `x`/`y`/`width`/`height`
 *  clamp to 0-100 (percent-of-canvas, §3.1); `opacity` clamps to 0-1. The
 *  merged result is re-validated against `RemotionLayerSchema` before being
 *  accepted, so an invalid or type-mismatched patch throws rather than
 *  silently producing an uncompilable document. Refuses a `locked` layer. */
export function setLayerProps(
  document: VideoProjectDocument,
  ref: LayerRef,
  patch: LayerPropsPatch,
): VideoProjectDocument {
  const { layer } = findLayer(document, ref);
  assertNotLocked(layer);
  const merged: Record<string, unknown> = { ...layer, ...patch };
  if (typeof merged.x === "number") merged.x = clampPercent(merged.x);
  if (typeof merged.y === "number") merged.y = clampPercent(merged.y);
  if (typeof merged.width === "number") merged.width = clampPercent(merged.width);
  if (typeof merged.height === "number") merged.height = clampPercent(merged.height);
  if (typeof merged.opacity === "number") merged.opacity = clampUnit(merged.opacity);
  const parsed = RemotionLayerSchema.safeParse(merged);
  if (!parsed.success) {
    throw new TimelineEditError("VS_INVALID_LAYER", parsed.error.message);
  }
  return finalize(document, replaceLayerInPlace(document, ref, parsed.data));
}

/** Replaces a dead image/video source while preserving a protected layer's lock. */
export function replaceLayerSource(
  document: VideoProjectDocument,
  ref: LayerRef,
  src: string,
): VideoProjectDocument {
  const { layer } = findLayer(document, ref);
  if (layer.type !== "image" && layer.type !== "video") {
    throw new TimelineEditError("VS_UNSUPPORTED_ASSET_REPLACEMENT", "only image/video layers can replace a source");
  }
  const parsed = RemotionLayerSchema.safeParse({ ...layer, src });
  if (!parsed.success) throw new TimelineEditError("VS_INVALID_LAYER", parsed.error.message);
  return finalize(document, replaceLayerInPlace(document, ref, parsed.data));
}

/* -------------------------------------------------------------------------- */
/* addLayer — §4.13 "Empty" state one-click launchers, §4.15                  */
/* -------------------------------------------------------------------------- */

/** Every field a caller must/may supply per layer type — deliberately NOT
 *  `Omit<RemotionXLayer, ...base fields>` because `z.infer` on a `.default()`
 *  field is the parsed OUTPUT type (field required), while callers should be
 *  able to omit anything the schema defaults — this type mirrors the zod
 *  INPUT shape (§3.1's table) by hand instead. */
export type NewLayerInput =
  | { type: "image"; src: string; fit?: "cover" | "contain" | "fill" }
  | { type: "video"; src: string; trimStartSec?: number; volume?: number; muted?: boolean }
  | {
      type: "text";
      content: string;
      fontFamily?: string;
      fontSizePx?: number;
      color?: string;
      textAlign?: "left" | "center" | "right";
      fontWeight?: "normal" | "bold";
    }
  | { type: "svg"; markup: string; animation?: "none" | "fadeIn" | "drawPath" | "pulse" }
  | {
      type: "motionGraphic";
      shape?: "circle" | "rect" | "triangle" | "star";
      color?: string;
      loopAnimation?: "spin" | "pulse" | "bounce" | "none";
    }
  | {
      type: "scene3d";
      sceneId: RemotionScene3dLayer["sceneId"];
      props?: Record<string, string | number | boolean>;
    }
  | {
      type: "audio";
      src: string;
      trimStartSec?: number;
      volume?: number;
      loop?: boolean;
      fadeInMs?: number;
      fadeOutMs?: number;
    };

export interface AddLayerArgs {
  layer: NewLayerInput;
  /** Absolute document ms — re-homed onto whichever scene contains it. */
  absoluteStartMs: number;
  durationMs: number;
  band: LayerBand;
  /** Overrides the band's default geometry (background defaults full-bleed
   *  `x0 y0 w100 h100`; overlay/brand default `x10 y10 w30 h20`). Percent
   *  values clamp to 0-100. */
  geometry?: Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotationDeg: number;
    opacity: number;
  }>;
  name?: string;
}

export interface AddLayerResult {
  document: VideoProjectDocument;
  layerId: string;
}

/** Inserts a new layer of `args.layer.type` at `args.absoluteStartMs`,
 *  banded into `args.band` (role + top-of-band zIndex), on whichever scene
 *  owns that absolute time. Returns the generated id alongside the document
 *  so the caller can select the new clip immediately (G9's one-click
 *  launchers need this). */
export function addLayer(document: VideoProjectDocument, args: AddLayerArgs): AddLayerResult {
  const fps = document.format.fps;
  const clampedStart = Math.max(0, args.absoluteStartMs);
  const targetScene = findOwningScene(document.scenes, clampedStart);
  const relativeMs = Math.max(0, clampedStart - targetScene.startMs);
  const startFrame = msToFrames(relativeMs, fps);
  const durationFrames = Math.max(1, msToFrames(args.durationMs, fps));
  const id = generateLayerId();
  const zIndex = topOfBandZIndex(document, args.band);

  const defaultGeometry =
    args.band === "background"
      ? { x: 0, y: 0, width: 100, height: 100 }
      : { x: 10, y: 10, width: 30, height: 20 };
  const geometry = { ...defaultGeometry, rotationDeg: 0, opacity: 1, ...args.geometry };

  const base = {
    id,
    startFrame,
    durationFrames,
    x: clampPercent(geometry.x),
    y: clampPercent(geometry.y),
    width: clampPercent(geometry.width),
    height: clampPercent(geometry.height),
    rotationDeg: geometry.rotationDeg,
    opacity: clampUnit(geometry.opacity),
    zIndex,
    role: args.band,
    ...(args.name ? { name: args.name } : {}),
  };

  const candidate = { ...base, ...args.layer };
  const parsed = RemotionLayerSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new TimelineEditError("VS_INVALID_LAYER", parsed.error.message);
  }
  const newLayer = parsed.data;
  if (newLayer.id.endsWith("_cta")) {
    // Unreachable given `generateLayerId()`'s own guard, but a layer-add
    // path must never silently opt a layer into the CTA brand lock.
    throw new TimelineEditError(
      "VS_RESERVED_LAYER_ID",
      "generated layer id must not end in \"_cta\" (reserved for the brand CTA lock)",
    );
  }

  const nextDocument = updateScene(document, targetScene.sceneId, (scene) => ({
    ...scene,
    layers: [...scene.layers, newLayer],
  }));
  return { document: finalize(document, nextDocument), layerId: id };
}

/* -------------------------------------------------------------------------- */
/* removeLayer / duplicateLayer / lock / hidden / rename                      */
/* -------------------------------------------------------------------------- */

/** Refuses a `locked` layer — unlock via `setLayerLocked` first. */
export function removeLayer(document: VideoProjectDocument, ref: LayerRef): VideoProjectDocument {
  const { scene, layer } = findLayer(document, ref);
  assertNotLocked(layer);
  return finalize(
    document,
    updateScene(document, scene.sceneId, (s) => ({
      ...s,
      layers: s.layers.filter((l) => l.id !== ref.layerId),
    })),
  );
}

/** Copies a layer (new id, same scene, same timing/geometry — including
 *  `locked`/`hidden`, but see §4.12: ids are always regenerated, never
 *  copied verbatim). Allowed even on a locked source layer — duplicating is
 *  non-destructive to the original. */
export function duplicateLayer(document: VideoProjectDocument, ref: LayerRef): AddLayerResult {
  const { scene, layer } = findLayer(document, ref);
  const newId = generateLayerId();
  const duplicated: RemotionLayer = { ...layer, id: newId };
  const nextDocument = updateScene(document, scene.sceneId, (s) => ({
    ...s,
    layers: [...s.layers, duplicated],
  }));
  return { document: finalize(document, nextDocument), layerId: newId };
}

/** Toggles the author lock (§4.8) — always allowed, including on an
 *  already-locked layer, so this is the one op that can turn a lock back
 *  off. */
export function setLayerLocked(
  document: VideoProjectDocument,
  ref: LayerRef,
  locked: boolean,
): VideoProjectDocument {
  const { layer } = findLayer(document, ref);
  return finalize(document, replaceLayerInPlace(document, ref, { ...layer, locked }));
}

/** Toggles author-time visibility (§4.8) — allowed regardless of lock state
 *  (hiding/showing is not a geometry/timing mutation the lock is meant to
 *  guard against). */
export function setLayerHidden(
  document: VideoProjectDocument,
  ref: LayerRef,
  hidden: boolean,
): VideoProjectDocument {
  const { layer } = findLayer(document, ref);
  return finalize(document, replaceLayerInPlace(document, ref, { ...layer, hidden }));
}

/** Sets the display-only `name` label (never read by the compiler/renderer).
 *  An empty/whitespace-only name clears the field back to `undefined`
 *  (falls back to `timelineProjection.ts`'s `type:id` default label). */
export function renameLayer(
  document: VideoProjectDocument,
  ref: LayerRef,
  name: string,
): VideoProjectDocument {
  const { layer } = findLayer(document, ref);
  const trimmed = name.trim();
  const updated: RemotionLayer = { ...layer, name: trimmed.length > 0 ? trimmed : undefined };
  return finalize(document, replaceLayerInPlace(document, ref, updated));
}

/* -------------------------------------------------------------------------- */
/* addMusicAudioTrack — P3 §4.13 "ใส่เพลงประกอบ" launcher (G9)                 */
/* -------------------------------------------------------------------------- */

/** Appends a `kind: "music"` entry to `document.audioTracks[]` (§4.8 — this
 *  writes `document.audioTracks`, NOT `scene.layers`, unlike every other
 *  function in this file). Omitting `startMs`/`endMs` is deliberate: per
 *  `AudioTrackTimingFieldsShape`'s own doc comment and
 *  `videoProjectCompiler.ts`'s `buildAudioTrackLayers`, an absent span means
 *  "spans the whole document" — which is also how the compiler implements
 *  looping for a music track, so no separate `loop` field is needed here.
 *  Defaults mirror the schema's own Phase-1 defaults (`gainDb: -14`,
 *  `ducking: true`) so a freshly-added track matches what
 *  `AudioTrackSchema.parse` would produce for an object that omitted them. */
export function addMusicAudioTrack(
  document: VideoProjectDocument,
  assetId: number,
): VideoProjectDocument {
  const track: AudioTrack = {
    kind: "music",
    assetRefs: [assetId],
    gainDb: -14,
    ducking: true,
  };
  return finalize(document, { ...document, audioTracks: [...document.audioTracks, track] });
}

/* -------------------------------------------------------------------------- */
/* Audio track edits — P3 §4.8/§6, the audio-track controls this round adds   */
/* -------------------------------------------------------------------------- */

function findAudioTrack(document: VideoProjectDocument, trackIndex: number): AudioTrack {
  const track = document.audioTracks[trackIndex];
  if (!track) {
    throw new TimelineEditError("VS_AUDIO_TRACK_NOT_FOUND", `audio track not found: ${trackIndex}`);
  }
  return track;
}

function replaceAudioTrack(
  document: VideoProjectDocument,
  trackIndex: number,
  updated: AudioTrack,
): VideoProjectDocument {
  const audioTracks = document.audioTracks.map((t, i) => (i === trackIndex ? updated : t));
  return finalize(document, { ...document, audioTracks });
}

/** Clamps to the schema's own `-60..24` bound (§4.8) — sets `gainDb`, never
 *  a linear multiplier; the dB->linear conversion happens server-side
 *  (`videoProjectCompiler.ts`) and this file must never duplicate that math.
 *  Throws for `sfx` (that variant has no `gainDb` field). */
export function setAudioTrackGainDb(
  document: VideoProjectDocument,
  trackIndex: number,
  gainDb: number,
): VideoProjectDocument {
  const track = findAudioTrack(document, trackIndex);
  if (track.kind === "sfx") {
    throw new TimelineEditError("VS_AUDIO_TRACK_NO_GAIN", "sfx tracks have no gainDb field");
  }
  const clamped = Math.min(24, Math.max(-60, gainDb));
  return replaceAudioTrack(document, trackIndex, { ...track, gainDb: clamped });
}

/** Music-only — `ducking` is a flat -6dB attenuation (NOT sidechain, §6),
 *  which the UI must label without any technical term. Throws for
 *  narration/sfx (neither carries a `ducking` field). */
export function setAudioTrackDucking(
  document: VideoProjectDocument,
  trackIndex: number,
  ducking: boolean,
): VideoProjectDocument {
  const track = findAudioTrack(document, trackIndex);
  if (track.kind !== "music") {
    throw new TimelineEditError("VS_AUDIO_TRACK_NOT_MUSIC", "ducking only applies to a music track");
  }
  return replaceAudioTrack(document, trackIndex, { ...track, ducking });
}

export interface AudioTrackSpanPatch {
  /** `null` clears the bound back to "spans the whole document" (the exact
   *  semantics `AudioTrackTimingFieldsShape`'s own doc comment in
   *  `projectSchemas.ts` describes) — deliberately NOT `0`/`durationMs`,
   *  which would author a BOUNDED span that merely happens to match today's
   *  document length and would stop tracking a later duration change (and,
   *  per the loop-semantics note in this round's brief, a bounded span does
   *  NOT extend to fill the document even if `loop` were true). */
  startMs: number | null;
  endMs: number | null;
}

/** Sets/clears a narration or music track's document-absolute span (§4.8's
 *  `startMs?`/`endMs?` fields). Mirrors the document-level cross-field
 *  validation `VideoProjectDocumentSchema` enforces at save (`endMs >
 *  startMs`, both within `format.durationMs`) so an invalid span is refused
 *  HERE, at authoring time — the task brief requires the UI prevent
 *  producing an invalid span rather than letting `saveDocument` reject it.
 *  Partial edits are supported by passing the OTHER bound's CURRENT
 *  (already-resolved) value unchanged — this function has no notion of
 *  "leave as-is", it always sets exactly the two values it's given. Throws
 *  for `sfx` (its `events[].atMs` is a different timing model entirely). */
export function setAudioTrackSpan(
  document: VideoProjectDocument,
  trackIndex: number,
  patch: AudioTrackSpanPatch,
): VideoProjectDocument {
  const track = findAudioTrack(document, trackIndex);
  if (track.kind === "sfx") {
    throw new TimelineEditError("VS_AUDIO_TRACK_NO_SPAN", "sfx tracks have no document span");
  }
  const startMs = patch.startMs === null ? undefined : Math.max(0, Math.round(patch.startMs));
  const endMs = patch.endMs === null ? undefined : Math.max(0, Math.round(patch.endMs));
  const durationMs = document.format.durationMs;
  if (startMs !== undefined && endMs !== undefined && endMs <= startMs) {
    throw new TimelineEditError("VS_AUDIO_SPAN_INVALID", "endMs must be greater than startMs");
  }
  if (startMs !== undefined && startMs > durationMs) {
    throw new TimelineEditError("VS_AUDIO_SPAN_INVALID", "startMs must not exceed the document duration");
  }
  if (endMs !== undefined && endMs > durationMs) {
    throw new TimelineEditError("VS_AUDIO_SPAN_INVALID", "endMs must not exceed the document duration");
  }
  return replaceAudioTrack(document, trackIndex, { ...track, startMs, endMs });
}

/** Sets a narration/music track's fade lengths (§4.8's new `fadeInMs?`/
 *  `fadeOutMs?` fields — previously hardcoded to `0` by the compiler,
 *  `videoProjectCompiler.ts:370-371,401`). Negative input clamps to `0`;
 *  per `AudioTrackTimingFieldsShape`'s own doc comment "omitted/`0` = no
 *  fade", so there is no need to distinguish a `0` value from `undefined`
 *  here. Throws for `sfx`. */
export function setAudioTrackFades(
  document: VideoProjectDocument,
  trackIndex: number,
  patch: { fadeInMs: number; fadeOutMs: number },
): VideoProjectDocument {
  const track = findAudioTrack(document, trackIndex);
  if (track.kind === "sfx") {
    throw new TimelineEditError("VS_AUDIO_TRACK_NO_FADES", "sfx tracks have no fade fields");
  }
  return replaceAudioTrack(document, trackIndex, {
    ...track,
    fadeInMs: Math.max(0, Math.round(patch.fadeInMs)),
    fadeOutMs: Math.max(0, Math.round(patch.fadeOutMs)),
  });
}

/** Removes one `document.audioTracks[]` entry by index — the only audio op
 *  that changes the array's LENGTH, so unlike every `replaceAudioTrack`
 *  caller above, this shifts every later track's index. Callers must not
 *  hold a stale `trackIndex` across this call (mirrors `removeLayer`'s
 *  "re-derive the ref, don't cache it across a mutation" convention for
 *  `scene.layers[]`). */
export function removeAudioTrack(document: VideoProjectDocument, trackIndex: number): VideoProjectDocument {
  findAudioTrack(document, trackIndex); // throws VS_AUDIO_TRACK_NOT_FOUND if out of range
  const audioTracks = document.audioTracks.filter((_, i) => i !== trackIndex);
  return finalize(document, { ...document, audioTracks });
}

/* -------------------------------------------------------------------------- */
/* migrateForFormatChange — §4.11 / AC17 / RK8                               */
/* -------------------------------------------------------------------------- */

export interface FormatMigrationArgs {
  fromFps: number;
  toFps: number;
  fromWidth: number;
  toWidth: number;
  fromHeight: number;
  toHeight: number;
}

/**
 * §4.11's chosen strategy ("migration-with-confirm"): when `format.fps`
 * and/or canvas size change, every hand-authored layer's timing and text
 * size must be rescaled so nothing silently shifts (AC17, RK8 — a
 * data-corruption class, not a UX annoyance).
 *
 * - fps change: every layer's `startFrame`/`durationFrames` are converted to
 *   their absolute ms equivalent under `fromFps` and back to frames under
 *   `toFps` (via `framesToMs`/`msToFrames`, the same helpers the timeline
 *   projection and the server compiler use) — this preserves each layer's
 *   ABSOLUTE start/duration in ms, not its raw frame count. Scene
 *   `startMs`/`endMs` are untouched (they were never frame-based).
 * - canvas height change: every `text` layer's `fontSizePx` is rescaled by
 *   `toHeight / fromHeight` so its size stays proportionally correct
 *   relative to the frame (percent-based `x`/`y`/`width`/`height` need no
 *   change — they already survive a canvas resize by construction).
 *   Width-only changes do not rescale font size (mirrors the spec's own
 *   height-ratio choice, §4.11).
 *
 * A no-op (returns `document` unchanged) when none of the six axes differ,
 * so repeated calls with an unchanged format never introduce rounding
 * drift.
 */
export function migrateForFormatChange(
  document: VideoProjectDocument,
  args: FormatMigrationArgs,
): VideoProjectDocument {
  const fpsChanged = args.fromFps !== args.toFps;
  const heightChanged = args.fromHeight !== args.toHeight;
  const widthChanged = args.fromWidth !== args.toWidth;
  if (!fpsChanged && !heightChanged && !widthChanged) {
    return document;
  }
  const heightRatio = args.toHeight / args.fromHeight;

  const scenes = document.scenes.map((scene) => ({
    ...scene,
    layers: scene.layers.map((layer) => {
      let next: RemotionLayer = layer;
      if (fpsChanged) {
        const relativeMs = framesToMs(next.startFrame, args.fromFps);
        const durationMsValue = framesToMs(next.durationFrames, args.fromFps);
        next = {
          ...next,
          startFrame: msToFrames(relativeMs, args.toFps),
          durationFrames: Math.max(1, msToFrames(durationMsValue, args.toFps)),
        };
      }
      if (heightChanged && next.type === "text") {
        next = { ...next, fontSizePx: Math.max(1, Math.round(next.fontSizePx * heightRatio)) };
      }
      return next;
    }),
  }));

  return finalize(document, {
    ...document,
    format: { ...document.format, fps: args.toFps, width: args.toWidth, height: args.toHeight },
    scenes,
  });
}
