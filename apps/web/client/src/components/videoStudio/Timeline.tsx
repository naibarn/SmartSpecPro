/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P1/P2.
 *
 * Composes `TimelineRuler` + `TimelineTracks` + a fixed label column + a
 * playhead overlay behind ONE shared horizontally-scrolling container (see
 * `TimelineRuler.tsx`'s docstring for why a single scroll region replaces
 * the harvested two-div + JS-mirrored `scrollLeft` pattern). P2 adds direct
 * manipulation: this component owns the `useClipDrag` hook instance (it has
 * `pxPerSecond`/zoom and the track row layout `getBandAtClientY` needs) and
 * forwards its `startMove`/`startResize`/`isDragging`/`snapIndicatorMs` down
 * into `TimelineTracks`, which renders the actual drag/resize handles.
 * `dragEnabled={false}` (e.g. narrow-screen, §4.14) disables every
 * affordance while selection/seek keep working.
 *
 * Zoom: same px/sec convention as `VideoEditorPhase3.tsx:3437-3446` — ×1.2
 * per step, clamped to [10, 200], default/reset 50.
 */
import { useEffect, useRef, useState, type DragEvent, type UIEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

import { HStack } from "@astryxdesign/core/Layout";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";

import { RULER_HEIGHT_PX, TimelineRuler } from "./TimelineRuler";
import { ROW_HEIGHT_PX, TimelineTrackLabelList, TimelineTracks } from "./TimelineTracks";
import { useClipDrag } from "./useClipDrag";
import type { TimelineEditOperation } from "./useTimelineHistory";
import { timelineContentDurationMs, type TimelineClip, type TimelineProjection } from "./timelineProjection";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";
import type { LayerBand } from "./timelineEdits";
import { readVideoStudioAssetDragData, type VideoStudioTimelineAsset } from "./VideoStudioAssetPicker";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

const ZOOM_STEP = 1.2;
const ZOOM_MIN = 10;
const ZOOM_MAX = 200;
const ZOOM_DEFAULT = 50;
const LABEL_COLUMN_WIDTH_PX = 168;

export interface TimelineProps {
  lang: VideoStudioLang;
  projection: TimelineProjection;
  currentMs: number;
  onPlayheadChange: (ms: number) => void;
  selectedClipId: string | null;
  selectedClipIds?: ReadonlySet<string>;
  onSelect: (clip: TimelineClip, event: { shiftKey: boolean }) => void;
  captionsBurnIn: boolean;
  className?: string;
  /** P2 drag/trim (§4.5) — omit `document`/`onApply` to keep the timeline
   *  read-only (P1 behaviour unchanged for any caller that doesn't pass
   *  them). */
  document?: VideoProjectDocument;
  onApply?: (op: TimelineEditOperation) => void;
  onGestureStart?: (gestureId: string) => void;
  onGestureEnd?: () => void;
  /** §4.14 — narrow screens have no drag surface at all. */
  dragEnabled?: boolean;
  /** §4.8/§6 audio-track channel-strip controls — forwarded verbatim to
   *  `TimelineTrackLabelList` (see that component's own docstring for why
   *  they live in the label column, not the scrolling clip strip). Optional
   *  so a read-only caller (no `document`/`onApply`) can omit them and get
   *  a display-only label column, same convention as this file's own
   *  `document`/`onApply`. */
  onAudioGainChange?: (trackIndex: number, gainDb: number) => void;
  onAudioDuckingChange?: (trackIndex: number, ducking: boolean) => void;
  onAudioSpanToggle?: (trackIndex: number, next: { startMs: number | null; endMs: number | null }) => void;
  onAudioRemove?: (trackIndex: number) => void;
  audioControlsDisabled?: boolean;
  missingLayerIds?: ReadonlySet<string>;
  /** External assets can be dropped from the right-hand dock at a precise
   * timeline position. */
  onExternalAssetDrop?: (asset: VideoStudioTimelineAsset, atMs: number) => void;
  onExternalFileDrop?: (file: File, atMs: number) => void;
}

export function Timeline({
  lang,
  projection,
  currentMs,
  onPlayheadChange,
  selectedClipId,
  selectedClipIds,
  onSelect,
  captionsBurnIn,
  className,
  document,
  onApply,
  onGestureStart,
  onGestureEnd,
  dragEnabled = true,
  onAudioGainChange,
  onAudioDuckingChange,
  onAudioSpanToggle,
  onAudioRemove,
  audioControlsDisabled,
  missingLayerIds,
  onExternalAssetDrop,
  onExternalFileDrop,
}: TimelineProps) {
  const [pxPerSecond, setPxPerSecond] = useState(ZOOM_DEFAULT);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);

  const dragActive = Boolean(document && onApply && dragEnabled);

  function getBandAtClientY(clientY: number): LayerBand | null {
    const el = tracksContainerRef.current;
    if (!el) return null;
    const top = el.getBoundingClientRect().top;
    const rowIndex = Math.floor((clientY - top) / ROW_HEIGHT_PX);
    const track = projection.tracks[rowIndex];
    if (!track) return null;
    if (track.kind === "background" || track.kind === "overlay" || track.kind === "brand") {
      return track.kind;
    }
    return null;
  }

  const clipDrag = useClipDrag({
    // Never dereferenced unless `startMove`/`startResize` is called, which
    // only happens when `dragActive` gates the handlers passed to
    // `TimelineTracks` — safe placeholder when this timeline is read-only.
    document: document ?? ({ scenes: [] } as unknown as VideoProjectDocument),
    pxPerSecond,
    playheadMs: currentMs,
    // `useClipDrag`'s `containerRef` type predates React 19's `RefObject<T
    // | null>` widening for `useRef(null)` — functionally identical (the
    // hook only reads `.current`, checked for null at every call site).
    containerRef: tracksContainerRef as React.RefObject<HTMLElement>,
    getBandAtClientY,
    selectedClipIds,
    onChange: (op) => onApply?.(op),
    onGestureStart,
    onGestureEnd,
  });

  const contentDurationMs = timelineContentDurationMs(projection);
  const pxPerMs = pxPerSecond / 1000;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportWidthPx(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportWidthPx(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setScrollLeft(event.currentTarget.scrollLeft);
  }

  function dropAtMs(event: DragEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.round(((event.clientX - rect.left + event.currentTarget.scrollLeft) / pxPerSecond) * 1000));
  }

  function handleExternalDrop(event: DragEvent<HTMLDivElement>) {
    if (!onExternalAssetDrop && !onExternalFileDrop) return;
    event.preventDefault();
    const atMs = dropAtMs(event);
    const asset = readVideoStudioAssetDragData(event.dataTransfer);
    if (asset) {
      onExternalAssetDrop?.(asset, atMs);
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) onExternalFileDrop?.(file, atMs);
  }

  function zoomIn() {
    setPxPerSecond((prev) => Math.min(ZOOM_MAX, prev * ZOOM_STEP));
  }
  function zoomOut() {
    setPxPerSecond((prev) => Math.max(ZOOM_MIN, prev / ZOOM_STEP));
  }
  function resetZoom() {
    setPxPerSecond(ZOOM_DEFAULT);
  }

  const playheadLeftPx = currentMs * pxPerMs;

  return (
    <div
      data-testid="vs-timeline"
      className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}
    >
      <HStack justify="between" align="center">
        <Text type="body" weight="medium">
          {pickCopy(lang, videoStudioCopy.timelineTitle)}
        </Text>
        <HStack gap={1} align="center">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<Minus className="h-4 w-4" />}
            label={pickCopy(lang, videoStudioCopy.timelineZoomOut)}
            onClick={zoomOut}
            isDisabled={pxPerSecond <= ZOOM_MIN}
          />
          <IconButton
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="h-4 w-4" />}
            label={pickCopy(lang, videoStudioCopy.timelineZoomReset)}
            onClick={resetZoom}
          />
          <IconButton
            variant="ghost"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            label={pickCopy(lang, videoStudioCopy.timelineZoomIn)}
            onClick={zoomIn}
            isDisabled={pxPerSecond >= ZOOM_MAX}
          />
        </HStack>
      </HStack>

      <div className="flex">
        <div className="shrink-0" style={{ width: LABEL_COLUMN_WIDTH_PX }}>
          {/* Spacer aligned with the ruler row so labels start under it. */}
          <div style={{ height: RULER_HEIGHT_PX }} />
          <TimelineTrackLabelList
            lang={lang}
            tracks={projection.tracks}
            captionsBurnIn={captionsBurnIn}
            onAudioGainChange={onAudioGainChange}
            onAudioDuckingChange={onAudioDuckingChange}
            onAudioSpanToggle={onAudioSpanToggle}
            onAudioRemove={onAudioRemove}
            audioControlsDisabled={audioControlsDisabled}
          />
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onDragOver={(event) => { if (onExternalAssetDrop || onExternalFileDrop) event.preventDefault(); }}
          onDrop={handleExternalDrop}
          className="relative flex-1 overflow-x-auto overflow-y-hidden"
          data-testid="vs-timeline-scroll"
        >
          <div className="relative">
            <TimelineRuler
              contentDurationMs={contentDurationMs}
              pxPerSecond={pxPerSecond}
              onSeek={onPlayheadChange}
            />
            <TimelineTracks
              lang={lang}
              tracks={projection.tracks}
              pxPerSecond={pxPerSecond}
              contentDurationMs={contentDurationMs}
              selectedClipId={selectedClipId}
              selectedClipIds={selectedClipIds}
              onSelect={onSelect}
              visibleLeftPx={scrollLeft}
              visibleWidthPx={viewportWidthPx}
              containerRef={tracksContainerRef}
              dragDisabled={!dragActive}
              onStartMove={dragActive ? clipDrag.startMove : undefined}
              onStartResize={dragActive ? clipDrag.startResize : undefined}
              snapIndicatorMs={dragActive ? clipDrag.snapIndicatorMs : null}
              missingLayerIds={missingLayerIds}
            />
            <div
              data-testid="vs-timeline-playhead"
              aria-label={pickCopy(lang, videoStudioCopy.timelinePlayhead)}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--color-accent,#6ea8fe)]"
              style={{ left: playheadLeftPx }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
