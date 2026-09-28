/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P1, §4.1/§3.2/§3.3.
 *
 * PURE projection: `VideoProjectDocument` -> timeline tracks/clips. The
 * timeline is not a new data model (§4.1) — it derives rows from what the
 * document already stores and every clip carries a `ref` back into the
 * document so a future P2 write-path can locate exactly what to mutate.
 *
 * Timing math mirrors `server/services/videoProjectCompiler.ts` byte-for-byte
 * on purpose (`msToFrames` / `offsetLayerToAbsoluteFrame`, `:155-157,
 * :328-335`): a layer's `startFrame`/`durationFrames` are SCENE-RELATIVE
 * frames, and the absolute position is `scene.startMs`'s frame equivalent +
 * the layer's own frame offset, converted back to ms. Caption cues follow the
 * identical two-step conversion (`buildCaptionLayers`, `:294-306`) — cue
 * `startMs`/`endMs` are also scene-relative, not absolute document ms. Get
 * this file's math wrong and the timeline lies about where things play,
 * which is the single most bug-prone part of this feature (task brief).
 *
 * Layers are NOT clamped to their owning scene (§3.2) — a clip may extend
 * past the scene's end; this file never truncates `durationMs`.
 */
import type {
  AudioTrack,
  CaptionCue,
  Scene,
  VideoProjectDocument,
} from "@shared/videoIntelligence/projectSchemas";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";

/* -------------------------------------------------------------------------- */
/* Frame <-> ms conversion — mirrors videoProjectCompiler.ts exactly          */
/* -------------------------------------------------------------------------- */

/** Mirrors `videoProjectCompiler.ts:155-157` verbatim (not imported — that
 *  module is server-only and pulls in server-side deps). Any drift here
 *  would make the timeline disagree with what actually renders. */
export function msToFrames(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

/** Inverse of `msToFrames`, used only for display — the compiler itself
 *  never converts frames back to ms (it stays in frames end-to-end), so
 *  this has no server-side counterpart to mirror; it's the direct algebraic
 *  inverse of the rounding above. */
export function framesToMs(frames: number, fps: number): number {
  return Math.round((frames / fps) * 1000);
}

/** Same Phase-1 nominal duration `videoProjectCompiler.ts:153` uses for an
 *  `sfx` audio event, which has no duration field of its own in the neutral
 *  schema (only `atMs`). Duplicated (not imported) for the same server-only
 *  reason as `msToFrames` above. */
const SFX_DEFAULT_DURATION_MS = 2000;

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type TimelineTrackKind =
  | "scene"
  | "brand"
  | "overlay"
  | "background"
  | "subtitles"
  | "audio";

/** Points a clip back at the exact document location it was derived from, so
 *  selection/inspector/P2 write paths never have to re-derive it. */
export type TimelineClipRef =
  | { kind: "scene"; sceneIndex: number; sceneId: string }
  | {
      kind: "layer";
      sceneIndex: number;
      sceneId: string;
      layerId: string;
      layerType: RemotionLayer["type"];
      band: "background" | "overlay" | "brand";
    }
  | { kind: "captionCue"; sceneIndex: number; sceneId: string; cueIndex: number }
  | {
      kind: "audioTrack";
      trackIndex: number;
      audioKind: AudioTrack["kind"];
      /** Only present for `sfx` tracks — each `events[]` entry is its own
       *  clip on the row (each has its own `atMs`). */
      eventIndex?: number;
    };

export interface TimelineClip {
  /** Unique across the whole projection (prefixed by track + ref so two
   *  layers sharing an `id` across different scenes — a real risk per §4.12,
   *  RK10 — never collide as timeline clip ids). */
  id: string;
  ref: TimelineClipRef;
  label: string;
  startMs: number;
  durationMs: number;
  /** `true` for an author-`hidden` layer. Per §4.1/§4.13, hidden layers are
   *  never dropped from the projection — only rendered as visibly hidden;
   *  the compiler is what skips them. */
  hidden: boolean;
  locked: boolean;
  /** Only set for a narration/music audio clip (never scene/layer/caption/
   *  sfx clips) — the track's resolved `gainDb` (§4.8), so a consumer can
   *  render/edit the level without re-deriving it from
   *  `document.audioTracks[trackIndex]` itself. */
  audioGainDb?: number;
  /** Only set for a MUSIC audio clip — mirrors `AudioTrack`'s `ducking`
   *  field (a flat -6dB attenuation, NOT sidechain, §6). */
  audioDucking?: boolean;
  /** Only set for a narration/music audio clip — `true` when the track
   *  carries an explicit `startMs`/`endMs` (a bounded span). `false` means
   *  this clip's `[startMs, startMs+durationMs]` is the PROJECTED
   *  whole-document span (§4.8's own doc comment: an absent bound spans the
   *  whole document), not an authored one — the UI must render that
   *  distinction honestly (task brief: never let a bounded 5s span read as
   *  "loops for 60s", and never let "spans the whole document" look like an
   *  authored bound either). */
  audioSpanExplicit?: boolean;
}

export interface TimelineTrack {
  /** Stable across re-projections of the same document shape: "scene",
   *  "brand", "overlay", "background", "subtitles", or `audio-${index}`. */
  id: string;
  kind: TimelineTrackKind;
  /** Only set for `kind: "audio"` rows — which Thai label
   *  (เสียงพากย์/เพลงประกอบ/เอฟเฟกต์เสียง) a consuming component should use. */
  audioKind?: AudioTrack["kind"];
  /** `true` for the subtitle row — editing text stays in the Subtitles
   *  stage (§4.5); this track is display-only regardless of P1/P2. */
  readOnly: boolean;
  clips: TimelineClip[];
}

export interface TimelineProjection {
  fps: number;
  /** `document.format.durationMs` — the ruler's nominal end, even though an
   *  individual clip may run past it (§3.2 says nothing clamps a layer; a
   *  clip can legitimately extend beyond this value and the ruler/consumer
   *  should extend to accommodate it, see `timelineContentDurationMs`). */
  documentDurationMs: number;
  tracks: TimelineTrack[];
}

/* -------------------------------------------------------------------------- */
/* Band assignment — §4.1's zIndex-band contract, `role` takes precedence     */
/* -------------------------------------------------------------------------- */

/** `role` (§4.8) is authorial intent and always wins when present. Falling
 *  back to the zIndex band convention (§4.1: background 0-99, overlay
 *  100-499, brand 500-899) covers documents/layers authored before `role`
 *  existed. Anything at/above 500 (including the reserved caption `900`,
 *  which never appears in `scene.layers` — captions are compiler-generated)
 *  buckets into "brand" since only three UI bands exist. */
export function bandForLayer(
  layer: RemotionLayer,
): "background" | "overlay" | "brand" {
  if (layer.role) return layer.role;
  if (layer.zIndex >= 500) return "brand";
  if (layer.zIndex >= 100) return "overlay";
  return "background";
}

/* -------------------------------------------------------------------------- */
/* Per-entity absolute-ms helpers                                             */
/* -------------------------------------------------------------------------- */

function layerAbsoluteStartMs(layer: RemotionLayer, scene: Scene, fps: number): number {
  const sceneStartFrame = msToFrames(scene.startMs, fps);
  const absoluteFrame = layer.startFrame + sceneStartFrame;
  return framesToMs(absoluteFrame, fps);
}

function layerDurationMs(layer: RemotionLayer, fps: number): number {
  return framesToMs(layer.durationFrames, fps);
}

function captionCueAbsoluteStartMs(cue: CaptionCue, scene: Scene, fps: number): number {
  const sceneStartFrame = msToFrames(scene.startMs, fps);
  const cueStartFrame = msToFrames(cue.startMs, fps);
  return framesToMs(cueStartFrame + sceneStartFrame, fps);
}

function captionCueDurationMs(cue: CaptionCue, fps: number): number {
  const durationFrames = Math.max(1, msToFrames(cue.endMs - cue.startMs, fps));
  return framesToMs(durationFrames, fps);
}

function layerLabel(layer: RemotionLayer): string {
  if (layer.name && layer.name.trim().length > 0) return layer.name.trim();
  return `${layer.type}:${layer.id}`;
}

/* -------------------------------------------------------------------------- */
/* Track builders                                                             */
/* -------------------------------------------------------------------------- */

function buildSceneTrack(document: VideoProjectDocument): TimelineTrack {
  return {
    id: "scene",
    kind: "scene",
    readOnly: true,
    clips: document.scenes.map((scene, sceneIndex) => ({
      id: `scene:${scene.sceneId}`,
      ref: { kind: "scene", sceneIndex, sceneId: scene.sceneId },
      label: scene.sceneId,
      startMs: scene.startMs,
      durationMs: Math.max(0, scene.endMs - scene.startMs),
      hidden: false,
      locked: false,
    })),
  };
}

function buildLayerTracks(document: VideoProjectDocument): {
  background: TimelineTrack;
  overlay: TimelineTrack;
  brand: TimelineTrack;
} {
  const background: TimelineTrack = { id: "background", kind: "background", readOnly: false, clips: [] };
  const overlay: TimelineTrack = { id: "overlay", kind: "overlay", readOnly: false, clips: [] };
  const brand: TimelineTrack = { id: "brand", kind: "brand", readOnly: false, clips: [] };
  const byBand = { background, overlay, brand };

  document.scenes.forEach((scene, sceneIndex) => {
    for (const layer of scene.layers) {
      const band = bandForLayer(layer);
      const clip: TimelineClip = {
        id: `layer:${scene.sceneId}:${layer.id}`,
        ref: {
          kind: "layer",
          sceneIndex,
          sceneId: scene.sceneId,
          layerId: layer.id,
          layerType: layer.type,
          band,
        },
        label: layerLabel(layer),
        startMs: layerAbsoluteStartMs(layer, scene, document.format.fps),
        durationMs: layerDurationMs(layer, document.format.fps),
        // Never dropped (§4.1/§4.13) — a hidden layer stays a real clip,
        // just marked hidden so a consuming component can render it dimmed.
        hidden: Boolean(layer.hidden),
        locked: Boolean(layer.locked),
      };
      byBand[band].clips.push(clip);
    }
  });

  return byBand;
}

function buildSubtitleTrack(document: VideoProjectDocument): TimelineTrack {
  const clips: TimelineClip[] = [];
  document.scenes.forEach((scene, sceneIndex) => {
    scene.captionCues.forEach((cue, cueIndex) => {
      clips.push({
        id: `caption:${scene.sceneId}:${cueIndex}`,
        ref: { kind: "captionCue", sceneIndex, sceneId: scene.sceneId, cueIndex },
        label: cue.text,
        startMs: captionCueAbsoluteStartMs(cue, scene, document.format.fps),
        durationMs: captionCueDurationMs(cue, document.format.fps),
        hidden: false,
        locked: true,
      });
    });
  });
  return { id: "subtitles", kind: "subtitles", readOnly: true, clips };
}

/** One row per `document.audioTracks[]` entry, in document order (matches
 *  §4.4's ASCII mock: narration row above the music row). `narration`/
 *  `music` now carry OPTIONAL `startMs`/`endMs` (§4.8, this round) — absent
 *  means "spans the whole document" (mirroring
 *  `videoProjectCompiler.ts`'s `buildAudioTrackLayers` Phase-1 default for
 *  an unbounded track), present means a genuinely bounded span, projected
 *  here exactly as authored (never silently clamped/extended — a bounded
 *  span does NOT fill the document even when `loop` is true, per this
 *  round's brief). `sfx` events each carry their own `atMs` and get the
 *  compiler's fixed nominal duration; they have no `gainDb`/span/ducking of
 *  their own, so `audioGainDb`/`audioDucking`/`audioSpanExplicit` stay
 *  `undefined` for them. */
function buildAudioTracks(document: VideoProjectDocument): TimelineTrack[] {
  return document.audioTracks.map((track, trackIndex) => {
    const id = `audio-${trackIndex}`;
    if (track.kind === "sfx") {
      return {
        id,
        kind: "audio" as const,
        audioKind: track.kind,
        readOnly: true,
        clips: track.events.map((event, eventIndex) => ({
          id: `audio:${trackIndex}:${eventIndex}`,
          ref: { kind: "audioTrack" as const, trackIndex, audioKind: track.kind, eventIndex },
          label: `sfx:${event.assetRef}`,
          startMs: event.atMs,
          durationMs: SFX_DEFAULT_DURATION_MS,
          hidden: false,
          locked: true,
        })),
      };
    }
    const hasExplicitSpan = track.startMs != null || track.endMs != null;
    const startMs = track.startMs ?? 0;
    const endMs = track.endMs ?? document.format.durationMs;
    return {
      id,
      kind: "audio" as const,
      audioKind: track.kind,
      readOnly: true,
      clips: [
        {
          id: `audio:${trackIndex}`,
          ref: { kind: "audioTrack" as const, trackIndex, audioKind: track.kind },
          label: track.kind === "narration" ? "narration" : "music",
          startMs,
          durationMs: Math.max(0, endMs - startMs),
          hidden: false,
          locked: true,
          audioGainDb: track.gainDb,
          audioDucking: track.kind === "music" ? track.ducking : undefined,
          audioSpanExplicit: hasExplicitSpan,
        },
      ],
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Turns a `VideoProjectDocument` into timeline tracks, top-to-bottom in the
 * exact order §4.1/§4.4 specify: scene strip, brand, overlay, background,
 * subtitles, then one row per audio track. Track order is inverted relative
 * to z (what draws first sits lowest) — brand (highest zIndex band) sits
 * just under the scene spine, background (lowest zIndex band) sits just
 * above subtitles/audio.
 */
export function projectTimeline(document: VideoProjectDocument): TimelineProjection {
  const { background, overlay, brand } = buildLayerTracks(document);
  const tracks: TimelineTrack[] = [
    buildSceneTrack(document),
    brand,
    overlay,
    background,
    buildSubtitleTrack(document),
    ...buildAudioTracks(document),
  ];
  return {
    fps: document.format.fps,
    documentDurationMs: document.format.durationMs,
    tracks,
  };
}

/**
 * Pairs every authored (band-projected — background/overlay/brand) clip with
 * the source `RemotionLayer` it was derived from, for consumers that need
 * more than the timing/label the generic `TimelineClip` carries (§3.1's
 * geometry fields — x/y/width/height/opacity — and type-specific fields, per
 * `LayerListPanel`'s "every clip as a row with its properties" requirement).
 * Deliberately excludes the scene/subtitle/audio rows — none of those wrap a
 * `RemotionLayer` (scenes aren't layers, captions/audio are compiler- or
 * document-derived, not hand-authored `scene.layers[]` entries).
 */
export function collectAuthoredLayerClips(
  document: VideoProjectDocument,
): Array<{ clip: TimelineClip; layer: RemotionLayer }> {
  const projection = projectTimeline(document);
  const result: Array<{ clip: TimelineClip; layer: RemotionLayer }> = [];
  for (const track of projection.tracks) {
    if (track.kind !== "background" && track.kind !== "overlay" && track.kind !== "brand") continue;
    for (const clip of track.clips) {
      const ref = clip.ref;
      if (ref.kind !== "layer") continue;
      const scene = document.scenes[ref.sceneIndex];
      const layer = scene?.layers.find((l) => l.id === ref.layerId);
      if (layer) result.push({ clip, layer });
    }
  }
  return result;
}

/** The ruler/scroll-content needs to span at least the document duration,
 *  but §3.2 explicitly allows a layer to extend past its scene (and, by
 *  extension, past the nominal document duration was never a validated
 *  invariant either) — so the true content width is
 *  `max(documentDurationMs, every clip's end)`, never a silent clamp. */
export function timelineContentDurationMs(projection: TimelineProjection): number {
  let max = projection.documentDurationMs;
  for (const track of projection.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startMs + clip.durationMs);
    }
  }
  return max;
}
