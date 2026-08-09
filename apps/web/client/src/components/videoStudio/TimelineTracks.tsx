/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P1/P2, §4.1/§4.4/§4.5/
 * §4.16. Renders the track lanes (clip rectangles) for a `TimelineProjection`.
 * P2 adds direct manipulation: a `vs-clip-drag` handle starts a MOVE gesture
 * (drag along time + between band rows) and two edge handles start a TRIM
 * gesture (§4.5) — both wired through the headless `useClipDrag` hook owned
 * by `Timeline.tsx` (this file stays a pure layout/render component and
 * never imports `useClipDrag` itself, so its own tests can keep asserting
 * pure render output). Locked clips and read-only tracks (scene/subtitles/
 * audio) never render drag/resize affordances — `useClipDrag` also refuses
 * server-side-of-the-hook, so this is belt-and-suspenders, not the only
 * guard.
 *
 * Perf/virtualization approach (§4.16 requires stating one): the number of
 * ROWS is always small (scene, brand, overlay, background, subtitles, N
 * audio tracks — never more than a handful), so rows are never virtualized.
 * The number of CLIPS in a single row (captions especially — up to ~40 cues)
 * is where cost accumulates, so each row horizontally virtualizes its own
 * clip list: only clips whose `[startMs, startMs+durationMs]` interval
 * intersects the caller-supplied visible px window are mounted. `Timeline.tsx`
 * recomputes that window from the shared scroll container's `scrollLeft` +
 * `clientWidth` on scroll/resize.
 */
import type { Ref } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Slider } from "@astryxdesign/core/Slider";
import { Switch } from "@astryxdesign/core/Switch";

import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";
import type { LayerBand, LayerRef, ResizeEdge } from "./timelineEdits";
import type { TimelineClip, TimelineTrack } from "./timelineProjection";

export const ROW_HEIGHT_PX = 56;
/** Clips narrower than this many px still render at this minimum width so a
 *  very short clip (e.g. a single caption cue) stays clickable/visible at
 *  low zoom instead of collapsing to a sliver. */
const MIN_CLIP_WIDTH_PX = 3;
/** Horizontal virtualization buffer so a clip just outside the viewport
 *  doesn't pop in visibly late while scrolling. */
const VIRTUALIZATION_BUFFER_PX = 200;

function trackLabel(lang: VideoStudioLang, track: TimelineTrack): string {
  switch (track.kind) {
    case "scene":
      return pickCopy(lang, videoStudioCopy.timelineTrackScene);
    case "brand":
      return pickCopy(lang, videoStudioCopy.timelineTrackBrand);
    case "overlay":
      return pickCopy(lang, videoStudioCopy.timelineTrackOverlay);
    case "background":
      return pickCopy(lang, videoStudioCopy.timelineTrackBackground);
    case "subtitles":
      return pickCopy(lang, videoStudioCopy.timelineTrackSubtitles);
    case "audio":
      if (track.audioKind === "narration") return pickCopy(lang, videoStudioCopy.timelineTrackAudioNarration);
      if (track.audioKind === "music") return pickCopy(lang, videoStudioCopy.timelineTrackAudioMusic);
      if (track.audioKind === "sfx") return pickCopy(lang, videoStudioCopy.timelineTrackAudioSfx);
      return pickCopy(lang, videoStudioCopy.timelineTrackAudio);
    default:
      return track.id;
  }
}

function formatMsRange(startMs: number, durationMs: number): string {
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  return `${fmt(startMs)}–${fmt(startMs + durationMs)}`;
}

export interface TimelineTrackLabelListProps {
  lang: VideoStudioLang;
  tracks: TimelineTrack[];
  captionsBurnIn: boolean;
  /** §4.8/§6 — the audio-track channel-strip controls rendered on a
   *  narration/music row (never `sfx`, which has no `gainDb`/span/ducking of
   *  its own). All four are optional so P1 callers/tests that only pass
   *  `lang`/`tracks`/`captionsBurnIn` keep compiling unchanged; omitting
   *  them renders the row's label only (no interactive controls) — same
   *  "omit rather than half-wire" convention `Timeline.tsx`'s `dragDisabled`
   *  uses for the drag surface. */
  onAudioGainChange?: (trackIndex: number, gainDb: number) => void;
  onAudioDuckingChange?: (trackIndex: number, ducking: boolean) => void;
  /** Row-level span affordance: toggles between "spans the whole video"
   *  (`{ startMs: null, endMs: null }`) and a bounded span seeded from the
   *  clip's CURRENTLY RESOLVED bounds (so turning it on never jumps the
   *  audio to a surprising range) — the precise ms fields live in the
   *  inspector (`AudioTrackInspectorPanel`), not here; see this file's
   *  module docstring for why a full drag-to-trim gesture isn't built for
   *  a document-level (non-scene-relative) track. */
  onAudioSpanToggle?: (trackIndex: number, next: { startMs: number | null; endMs: number | null }) => void;
  onAudioRemove?: (trackIndex: number) => void;
  /** e.g. §4.13 "Generation job running" read-only state — never disables
   *  the WHOLE timeline (§4.5's per-item pending rule), just these audio
   *  controls, same as every other edit affordance in this file already
   *  respects `dragDisabled`/`track.readOnly`. */
  audioControlsDisabled?: boolean;
}

function formatDbValue(lang: VideoStudioLang, value: number): string {
  return value <= -60 ? pickCopy(lang, videoStudioCopy.audioVolumeMutedLabel) : `${value} dB`;
}

/** The non-scrolling label column, rendered alongside `TimelineTracks` in
 *  `Timeline.tsx` (kept as a sibling export so the two stay pixel-aligned
 *  via the same `ROW_HEIGHT_PX` constant without prop-drilling row heights
 *  through both).
 *
 *  P3 §4.8/§6 also renders the audio channel-strip (volume/ducking/span) on
 *  a narration/music row here, because this column is the one part of the
 *  timeline that never horizontally scrolls — the §4.4 ASCII mock's
 *  "🔊──" sits at a fixed position relative to the row, not at a
 *  time-based x offset, so it belongs in the label column rather than
 *  inside the scrolling clip strip `TimelineTracks` renders below.
 */
export function TimelineTrackLabelList({
  lang,
  tracks,
  captionsBurnIn,
  onAudioGainChange,
  onAudioDuckingChange,
  onAudioSpanToggle,
  onAudioRemove,
  audioControlsDisabled,
}: TimelineTrackLabelListProps) {
  return (
    <div className="flex flex-col">
      {tracks.map((track) => {
        const audioClip = track.kind === "audio" && track.audioKind !== "sfx" ? track.clips[0] : undefined;
        const audioTrackIndex =
          audioClip && audioClip.ref.kind === "audioTrack" ? audioClip.ref.trackIndex : null;
        return (
          <div
            key={track.id}
            data-testid={audioClip ? "vs-audio-track" : undefined}
            className="flex flex-col justify-center gap-1 border-b border-[var(--color-border,#2a2a2a)] px-2 py-1 text-sm"
            style={{ minHeight: ROW_HEIGHT_PX }}
          >
            <span>{trackLabel(lang, track)}</span>
            {track.kind === "subtitles" ? (
              <span className="text-xs opacity-70">
                {captionsBurnIn
                  ? pickCopy(lang, videoStudioCopy.timelineSubtitleBurnInOn)
                  : pickCopy(lang, videoStudioCopy.timelineSubtitleBurnInOff)}
              </span>
            ) : null}
            {audioClip && audioTrackIndex != null ? (
              <div className="flex flex-col gap-1">
                <Slider
                  data-testid="vs-audio-volume"
                  label={pickCopy(lang, videoStudioCopy.audioVolumeLabel)}
                  isLabelHidden
                  min={-60}
                  max={24}
                  step={1}
                  value={audioClip.audioGainDb ?? 0}
                  isDisabled={audioControlsDisabled}
                  valueDisplay="text"
                  formatValue={(value: number) => formatDbValue(lang, value)}
                  onChangeEnd={(value: number) => onAudioGainChange?.(audioTrackIndex, value)}
                />
                {track.audioKind === "music" ? (
                  <Switch
                    data-testid="vs-audio-ducking"
                    label={pickCopy(lang, videoStudioCopy.audioDuckingLabel)}
                    value={audioClip.audioDucking ?? true}
                    isDisabled={audioControlsDisabled}
                    onChange={(checked) => onAudioDuckingChange?.(audioTrackIndex, checked)}
                  />
                ) : null}
                <div className="flex items-center gap-1">
                  <span className="text-xs opacity-70">
                    {audioClip.audioSpanExplicit
                      ? formatMsRange(audioClip.startMs, audioClip.durationMs)
                      : pickCopy(lang, videoStudioCopy.audioSpanFullVideoLabel)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="vs-audio-span"
                    isDisabled={audioControlsDisabled}
                    label={pickCopy(
                      lang,
                      audioClip.audioSpanExplicit
                        ? videoStudioCopy.audioSpanMakeFullVideo
                        : videoStudioCopy.audioSpanSetCustom,
                    )}
                    onClick={() =>
                      onAudioSpanToggle?.(
                        audioTrackIndex,
                        audioClip.audioSpanExplicit
                          ? { startMs: null, endMs: null }
                          : { startMs: audioClip.startMs, endMs: audioClip.startMs + audioClip.durationMs },
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="vs-audio-remove-track"
                  isDisabled={audioControlsDisabled}
                  label={pickCopy(lang, videoStudioCopy.audioRemoveTrackLabel)}
                  onClick={() => onAudioRemove?.(audioTrackIndex)}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export interface TimelineTracksProps {
  lang: VideoStudioLang;
  tracks: TimelineTrack[];
  pxPerSecond: number;
  contentDurationMs: number;
  selectedClipId: string | null;
  /** §4.5 multi-select — every id in this set (in addition to
   *  `selectedClipId`) renders the selected outline. Optional so existing
   *  P1 callers/tests keep working unchanged. */
  selectedClipIds?: ReadonlySet<string>;
  onSelect: (clip: TimelineClip, event: { shiftKey: boolean }) => void;
  /** Left edge of the visible scroll window, in px, within the shared
   *  content coordinate space (see module docstring). */
  visibleLeftPx: number;
  visibleWidthPx: number;
  /** §4.5/P2 — the ref `useClipDrag`'s pointer math measures clip positions
   *  against (must be THIS component's own root, per that hook's docstring:
   *  the full-width scrolling content element, not the clipped viewport). */
  containerRef?: Ref<HTMLDivElement>;
  /** Wired from `useClipDrag` by `Timeline.tsx` — omitted (or `dragDisabled`
   *  true) disables every drag/resize affordance, e.g. on narrow screens
   *  (§4.14, no drag surface below 1024px). */
  onStartMove?: (event: React.PointerEvent, ref: LayerRef, band: LayerBand, currentStartMs: number) => void;
  onStartResize?: (event: React.PointerEvent, ref: LayerRef, edge: ResizeEdge, currentEdgeMs: number) => void;
  dragDisabled?: boolean;
  /** The ms value currently snapped-to during a drag, or `null` — renders a
   *  vertical snap guide line (§4.5). */
  snapIndicatorMs?: number | null;
  missingLayerIds?: ReadonlySet<string>;
}

const DRAGGABLE_TRACK_KINDS = new Set(["background", "overlay", "brand"]);

export function TimelineTracks({
  lang,
  tracks,
  pxPerSecond,
  contentDurationMs,
  selectedClipId,
  selectedClipIds,
  onSelect,
  visibleLeftPx,
  visibleWidthPx,
  containerRef,
  onStartMove,
  onStartResize,
  dragDisabled,
  snapIndicatorMs,
  missingLayerIds,
}: TimelineTracksProps) {
  const pxPerMs = pxPerSecond / 1000;
  const contentWidthPx = Math.max(1, contentDurationMs * pxPerMs);
  const windowStart = visibleLeftPx - VIRTUALIZATION_BUFFER_PX;
  const windowEnd = visibleLeftPx + visibleWidthPx + VIRTUALIZATION_BUFFER_PX;

  return (
    <div ref={containerRef} data-testid="vs-timeline-tracks" className="relative" style={{ width: contentWidthPx }}>
      {tracks.map((track) => {
        const clipsInView = track.clips.filter((clip) => {
          const startPx = clip.startMs * pxPerMs;
          const endPx = (clip.startMs + clip.durationMs) * pxPerMs;
          return endPx >= windowStart && startPx <= windowEnd;
        });
        const isDraggableTrack = DRAGGABLE_TRACK_KINDS.has(track.kind) && !track.readOnly;
        return (
          <div
            key={track.id}
            data-testid="vs-timeline-track"
            data-track-kind={track.kind}
            aria-label={trackLabel(lang, track)}
            className="relative border-b border-[var(--color-border,#2a2a2a)]"
            style={{ height: ROW_HEIGHT_PX, width: contentWidthPx }}
          >
            {clipsInView.map((clip) => {
              const left = clip.startMs * pxPerMs;
              const width = Math.max(MIN_CLIP_WIDTH_PX, clip.durationMs * pxPerMs);
              const isSelected = selectedClipId === clip.id || Boolean(selectedClipIds?.has(clip.id));
              const isMissing = clip.ref.kind === "layer" && Boolean(missingLayerIds?.has(clip.ref.layerId));
              const stateLabel = clip.hidden
                ? ` (${pickCopy(lang, videoStudioCopy.timelineClipHidden)})`
                : clip.locked
                  ? ` (${pickCopy(lang, videoStudioCopy.timelineClipLocked)})`
                  : isMissing
                    ? ` (${pickCopy(lang, videoStudioCopy.timelineMissingAsset)})`
                    : "";
              const isDraggable =
                isDraggableTrack &&
                !dragDisabled &&
                !clip.locked &&
                clip.ref.kind === "layer" &&
                Boolean(onStartMove);
              const layerRef: LayerRef | null =
                clip.ref.kind === "layer" ? { sceneId: clip.ref.sceneId, layerId: clip.ref.layerId } : null;
              const band = clip.ref.kind === "layer" ? clip.ref.band : undefined;
              return (
                <button
                  key={clip.id}
                  type="button"
                  data-testid="vs-timeline-clip"
                  data-clip-id={clip.id}
                  aria-pressed={isSelected}
                  aria-label={`${clip.label} ${formatMsRange(clip.startMs, clip.durationMs)}${stateLabel}`}
                  onClick={(event) => onSelect(clip, { shiftKey: event.shiftKey })}
                  className={[
                    "absolute top-1 bottom-1 truncate rounded px-1 text-left text-xs",
                    "border",
                    isSelected ? "border-2 border-[var(--color-accent,#6ea8fe)]" : "border-[var(--color-border,#2a2a2a)]",
                    clip.hidden ? "opacity-40" : "opacity-100",
                    isMissing ? "border-red-500 bg-red-500/15 text-red-700 dark:text-red-300" : "",
                    track.readOnly ? "cursor-default" : "cursor-pointer",
                  ].join(" ")}
                  style={{ left, width }}
                >
                  {clip.label}
                  {isDraggable && layerRef && band ? (
                    <span
                      data-testid="vs-clip-drag"
                      aria-hidden="true"
                      className="absolute inset-0 cursor-move"
                      onPointerDown={(event) => onStartMove?.(event, layerRef, band, clip.startMs)}
                    />
                  ) : null}
                  {isDraggable && layerRef ? (
                    <>
                      <span
                        data-testid="vs-timeline-clip-resize"
                        data-edge="start"
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          onStartResize?.(event, layerRef, "start", clip.startMs);
                        }}
                      />
                      <span
                        data-testid="vs-timeline-clip-resize"
                        data-edge="end"
                        aria-hidden="true"
                        className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          onStartResize?.(event, layerRef, "end", clip.startMs + clip.durationMs);
                        }}
                      />
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}
      {snapIndicatorMs != null ? (
        <div
          data-testid="vs-timeline-snap-indicator"
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--color-warning,#f5a623)]"
          style={{ left: snapIndicatorMs * pxPerMs }}
        />
      ) : null}
    </div>
  );
}
