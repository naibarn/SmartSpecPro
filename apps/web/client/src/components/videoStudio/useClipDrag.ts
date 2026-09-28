/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P2, §4.3/§4.5.
 * The clip drag/trim/snap interaction hook — ports the ALGORITHMS from
 * `client/src/components/videoeditor/Timeline.tsx:187-410` (playhead snap,
 * resize-edge snap against other clips' edges, locked-track rejection) into
 * a headless hook over native pointer events + `window` listeners. Per this
 * round's brief: does NOT import from `Timeline.tsx` (stale surface,
 * conflicting inline-style theme) and adds NO drag-and-drop library (the
 * repo has zero by convention, §4.3).
 *
 * **Px/ms space** matches the existing P1 timeline components exactly:
 * `pxPerSecond` (clamp 10-200 owned by the panel), `pxPerMs = pxPerSecond /
 * 1000` — see `TimelineTracks.tsx`/`TimelineRuler.tsx`. The `containerRef`
 * must point at the same full-width SCROLLING CONTENT element those
 * components render (not the outer clipped viewport) — `getBoundingClientRect().left`
 * then already accounts for horizontal scroll, exactly like `Timeline.tsx`'s
 * own `timelineRef` (see that file's inline comment at :228-229).
 *
 * **Headless by design:** this hook knows nothing about row layout/track
 * order — the caller supplies `getBandAtClientY`, so this file never needs
 * `ROW_HEIGHT_PX` or `timelineProjection.ts`'s fixed track ordering (only
 * `collectAuthoredLayerClips` for snap-point collection, which is a pure
 * data read, not a layout assumption).
 *
 * **Undo integration:** this hook never touches history itself — it emits
 * `onGestureStart`/`onGestureEnd` (wire to `useTimelineHistory`'s
 * `beginGesture`/`endGesture`) and calls `onChange(op)` with a pure
 * `TimelineEditOperation` on every snapped pointer move (wire to
 * `useTimelineHistory().apply`, which auto-merges into the open gesture —
 * see that hook's docstring). The whole drag becomes ONE undo step this way
 * without this file knowing anything about `CommandBus`.
 *
 * **Group drag (P3, §4.5 multi-select):** if the pointer-grabbed clip's id is
 * a member of `options.selectedClipIds` AND that set has more than one
 * member, every OTHER selected layer clip moves by the same delta (ms) as
 * the primary clip for the duration of the gesture — computed once at
 * gesture start (`buildGroupMembers`) and applied every pointermove inside
 * the SAME `onChange` callback as the primary move, so the whole group move
 * is one `moveLayer` sequence per tick and therefore ONE undo entry (the
 * gesture-coalescing behaviour is unchanged — this file still only ever
 * calls `onChange` once per tick). A locked member is skipped (never moved,
 * never blocks the rest of the group) via `moveLayer`'s own lock refusal
 * would THROW, so locked members are filtered out of the group at gesture
 * start instead — "skipped, not blocked". Only the primary clip's band can
 * change (vertical drag between rows); group members keep their own band.
 */
import { useCallback, useMemo, useRef, useState } from "react";

import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { collectAuthoredLayerClips } from "./timelineProjection";
import {
  moveLayer,
  resizeLayer,
  setLayerBand,
  type LayerBand,
  type LayerRef,
  type ResizeEdge,
} from "./timelineEdits";
import type { TimelineEditOperation } from "./useTimelineHistory";

/** Pointer must be within this many PX of a snap target to snap — expressed
 *  in px (not ms) so the snap "feel" stays constant across zoom levels,
 *  mirroring `Timeline.tsx`'s fixed-time-distance approach but adapted to
 *  this file's px-first convention. */
const SNAP_DISTANCE_PX = 8;

/** Held while dragging to disable snapping for one gesture — same
 *  "modifier to disable" convention §4.5 requires, without colliding with
 *  `shiftKey` (already used for multi-select elsewhere in this codebase). */
export type SnapModifierEvent = Pick<PointerEvent, "altKey">;

export interface UseClipDragOptions {
  document: VideoProjectDocument;
  /** Current zoom, px-per-second (panel owns the 10-200 clamp). */
  pxPerSecond: number;
  /** Absolute document ms — one of the snap targets (§4.5). */
  playheadMs: number;
  /** The full-width scrolling content element clip positions are measured
   *  against — see module docstring. */
  containerRef: React.RefObject<HTMLElement>;
  /** Resolves the band a pointer's clientY corresponds to during a MOVE
   *  gesture, or `null` for a non-band row (scene/subtitles/audio), in
   *  which case the clip's band is left unchanged for that tick. Owning
   *  this in the caller keeps this hook decoupled from row-height/track-
   *  order layout. */
  getBandAtClientY: (clientY: number) => LayerBand | null;
  /** §4.5 multi-select — the SAME set `Timeline`/`TimelineTracks` use to
   *  render the selected-outline. When a MOVE gesture starts on a clip whose
   *  id is a member of this set and the set has >1 member, every other
   *  member becomes a group-drag participant (moved by the same delta as
   *  the primary clip). Ignored for resize gestures (trim is always
   *  single-clip). */
  selectedClipIds?: ReadonlySet<string>;
  /** Called with a pure document mutator on every snapped pointer move
   *  during an active gesture. Wire to `useTimelineHistory().apply`. */
  onChange: (op: TimelineEditOperation) => void;
  /** Called once when a gesture (move or resize) begins, with a fresh
   *  gesture id — wire to `useTimelineHistory().beginGesture`. Never called
   *  if the target layer is `locked` (the gesture is refused entirely). */
  onGestureStart?: (gestureId: string) => void;
  /** Called once when a gesture ends (pointerup/pointercancel) — wire to
   *  `useTimelineHistory().endGesture`. */
  onGestureEnd?: () => void;
}

export interface UseClipDragResult {
  /** Attach to a clip's pointerdown for a MOVE gesture (drag along time +
   *  vertical drag between band rows). `currentStartMs` is the clip's
   *  current absolute start (ms) — the hook computes the pointer's offset
   *  within the clip from this and the pointerdown position so the clip
   *  doesn't jump to align its left edge with the cursor. No-ops (never
   *  starts dragging, never calls `onGestureStart`) if the layer is
   *  `locked`. */
  startMove: (
    event: React.PointerEvent,
    ref: LayerRef,
    band: LayerBand,
    currentStartMs: number,
  ) => void;
  /** Attach to a clip's left/right edge handle for a trim gesture.
   *  `currentEdgeMs` is that edge's current absolute ms (start edge ==
   *  clip's `startMs`, end edge == `startMs + durationMs`). No-ops if the
   *  layer is `locked`. */
  startResize: (
    event: React.PointerEvent,
    ref: LayerRef,
    edge: ResizeEdge,
    currentEdgeMs: number,
  ) => void;
  /** True while any move/resize gesture is in progress. */
  isDragging: boolean;
  /** The ms value currently snapped-to, or `null` — for the caller to
   *  render a snap guide line. */
  snapIndicatorMs: number | null;
}

/** A group-drag participant other than the primary dragged clip — its
 *  original absolute start (ms), captured once at gesture start, so every
 *  pointermove can recompute `originalStartMs + delta` without drift. */
interface GroupMember {
  ref: LayerRef;
  originalStartMs: number;
}

type GestureState =
  | {
      kind: "move";
      gestureId: string;
      ref: LayerRef;
      band: LayerBand;
      /** `pointerMsAtDown - currentStartMs` — held constant through the
       *  gesture so the clip tracks the cursor's original grab point. */
      offsetMs: number;
      /** The primary clip's OWN absolute start at gesture start — the group
       *  delta is `nextStartMs - primaryOriginalStartMs`. */
      primaryOriginalStartMs: number;
      /** Other selected clips moving together with the primary (§4.5) —
       *  empty for a single-clip drag. Locked members are pre-filtered out
       *  ("skipped, not blocked"). */
      group: GroupMember[];
      snapPoints: number[];
    }
  | {
      kind: "resize";
      gestureId: string;
      ref: LayerRef;
      edge: ResizeEdge;
      snapPoints: number[];
    };

function isLayerLocked(document: VideoProjectDocument, ref: LayerRef): boolean {
  const scene = document.scenes.find((s) => s.sceneId === ref.sceneId);
  const layer = scene?.layers.find((l) => l.id === ref.layerId);
  return Boolean(layer?.locked);
}

/** Scene boundaries + the playhead + every OTHER authored layer clip's
 *  start/end + 0 — exactly the snap-target set §4.5 specifies. Computed
 *  once at gesture start (not per pointermove) since only the layer being
 *  dragged changes during its own gesture — mirrors `Timeline.tsx`'s
 *  `resizeSnapPoints` `useMemo`, recomputed only when the gesture (there,
 *  `resizingClip`) changes. */
function buildSnapPoints(
  document: VideoProjectDocument,
  excludeRefs: readonly LayerRef[],
  playheadMs: number,
): number[] {
  const points = new Set<number>([0, Math.max(0, playheadMs)]);
  for (const scene of document.scenes) {
    points.add(scene.startMs);
    points.add(scene.endMs);
  }
  for (const { clip } of collectAuthoredLayerClips(document)) {
    if (clip.ref.kind !== "layer") continue;
    const isExcluded = excludeRefs.some(
      (excludeRef) => clip.ref.kind === "layer" && clip.ref.sceneId === excludeRef.sceneId && clip.ref.layerId === excludeRef.layerId,
    );
    if (isExcluded) continue;
    points.add(clip.startMs);
    points.add(clip.startMs + clip.durationMs);
  }
  return [...points].sort((a, b) => a - b);
}

function findSnap(target: number, points: readonly number[], toleranceMs: number): number | null {
  let best: number | null = null;
  let bestDist = toleranceMs;
  for (const point of points) {
    const dist = Math.abs(target - point);
    if (dist <= bestDist) {
      bestDist = dist;
      best = point;
    }
  }
  return best;
}

function pxToMs(px: number, pxPerSecond: number): number {
  return (px / pxPerSecond) * 1000;
}

export function useClipDrag(options: UseClipDragOptions): UseClipDragResult {
  // Long-lived `window` listeners need the LATEST option values, not the
  // ones captured when the gesture started — a plain "latest ref", updated
  // every render, avoids stale-closure bugs without re-attaching listeners
  // mid-gesture.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [isDragging, setIsDragging] = useState(false);
  const [snapIndicatorMs, setSnapIndicatorMs] = useState<number | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const gestureCounter = useRef(0);

  const cleanupRef = useRef<(() => void) | null>(null);

  const endGestureInternal = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    gestureRef.current = null;
    setIsDragging(false);
    setSnapIndicatorMs(null);
    optionsRef.current.onGestureEnd?.();
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const gesture = gestureRef.current;
    const { containerRef, pxPerSecond, getBandAtClientY, onChange } = optionsRef.current;
    const container = containerRef.current;
    if (!gesture || !container) return;

    const rect = container.getBoundingClientRect();
    const xPx = event.clientX - rect.left;
    const pointerMs = Math.max(0, pxToMs(xPx, pxPerSecond));
    const toleranceMs = pxToMs(SNAP_DISTANCE_PX, pxPerSecond);
    const snapDisabled = event.altKey;

    if (gesture.kind === "move") {
      const rawStartMs = Math.max(0, pointerMs - gesture.offsetMs);
      let nextStartMs = rawStartMs;
      let snap: number | null = null;
      if (!snapDisabled) {
        snap = findSnap(rawStartMs, gesture.snapPoints, toleranceMs);
        if (snap !== null) nextStartMs = snap;
      }
      setSnapIndicatorMs(snap);

      const nextBand = getBandAtClientY(event.clientY) ?? gesture.band;
      const bandChanged = nextBand !== gesture.band;
      if (bandChanged) {
        gestureRef.current = { ...gesture, band: nextBand };
      }

      const ref = gesture.ref;
      const delta = nextStartMs - gesture.primaryOriginalStartMs;
      const group = gesture.group;
      onChange((document) => {
        let next = moveLayer(document, ref, nextStartMs);
        if (bandChanged) {
          next = setLayerBand(next, ref, nextBand);
        }
        // Group drag (§4.5): every other selected clip moves by the SAME
        // delta as the primary clip, inside this same op — one `onChange`
        // call per tick keeps the whole group move a single undo entry.
        for (const member of group) {
          next = moveLayer(next, member.ref, member.originalStartMs + delta);
        }
        return next;
      });
      return;
    }

    // resize
    let nextEdgeMs = pointerMs;
    let snap: number | null = null;
    if (!snapDisabled) {
      snap = findSnap(pointerMs, gesture.snapPoints, toleranceMs);
      if (snap !== null) nextEdgeMs = snap;
    }
    setSnapIndicatorMs(snap);

    const ref = gesture.ref;
    const edge = gesture.edge;
    onChange((document) => resizeLayer(document, ref, edge, nextEdgeMs));
  }, []);

  const handlePointerUp = useCallback(() => {
    endGestureInternal();
  }, [endGestureInternal]);

  const attachWindowListeners = useCallback(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const startMove = useCallback(
    (event: React.PointerEvent, ref: LayerRef, band: LayerBand, currentStartMs: number) => {
      const { document, containerRef, pxPerSecond, playheadMs, onGestureStart, selectedClipIds } =
        optionsRef.current;
      if (isLayerLocked(document, ref)) return;
      const container = containerRef.current;
      if (!container) return;

      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const xPx = event.clientX - rect.left;
      const pointerMs = Math.max(0, pxToMs(xPx, pxPerSecond));
      const offsetMs = pointerMs - currentStartMs;

      // Group drag (§4.5): the primary clip's own id must be one of the
      // selected ids AND the selection must have more than one member —
      // otherwise this is an ordinary single-clip drag (selecting one clip
      // and dragging it must never pull in unrelated clips).
      const primaryClipId = `layer:${ref.sceneId}:${ref.layerId}`;
      const group: GroupMember[] = [];
      if (selectedClipIds && selectedClipIds.size > 1 && selectedClipIds.has(primaryClipId)) {
        for (const { clip } of collectAuthoredLayerClips(document)) {
          if (clip.ref.kind !== "layer") continue;
          if (clip.id === primaryClipId) continue;
          if (!selectedClipIds.has(clip.id)) continue;
          const memberRef: LayerRef = { sceneId: clip.ref.sceneId, layerId: clip.ref.layerId };
          // "Locked clips in the selection are skipped, not blocked" — the
          // rest of the group still moves.
          if (isLayerLocked(document, memberRef)) continue;
          group.push({ ref: memberRef, originalStartMs: clip.startMs });
        }
      }

      gestureCounter.current += 1;
      const gestureId = `vs-move-${ref.sceneId}-${ref.layerId}-${gestureCounter.current}`;
      gestureRef.current = {
        kind: "move",
        gestureId,
        ref,
        band,
        offsetMs,
        primaryOriginalStartMs: currentStartMs,
        group,
        // Snap targets exclude every group participant (primary + members)
        // so the group doesn't snap to its own edges while moving together
        // (§4.5 "snapping computed from the group").
        snapPoints: buildSnapPoints(
          document,
          [ref, ...group.map((member) => member.ref)],
          playheadMs,
        ),
      };
      setIsDragging(true);
      setSnapIndicatorMs(null);
      attachWindowListeners();
      onGestureStart?.(gestureId);
    },
    [attachWindowListeners],
  );

  const startResize = useCallback(
    (event: React.PointerEvent, ref: LayerRef, edge: ResizeEdge, _currentEdgeMs: number) => {
      const { document, containerRef, playheadMs, onGestureStart } = optionsRef.current;
      if (isLayerLocked(document, ref)) return;
      const container = containerRef.current;
      if (!container) return;

      event.preventDefault();
      gestureCounter.current += 1;
      const gestureId = `vs-resize-${edge}-${ref.sceneId}-${ref.layerId}-${gestureCounter.current}`;
      gestureRef.current = {
        kind: "resize",
        gestureId,
        ref,
        edge,
        snapPoints: buildSnapPoints(document, [ref], playheadMs),
      };
      setIsDragging(true);
      setSnapIndicatorMs(null);
      attachWindowListeners();
      onGestureStart?.(gestureId);
    },
    [attachWindowListeners],
  );

  return useMemo(
    () => ({ startMove, startResize, isDragging, snapIndicatorMs }),
    [startMove, startResize, isDragging, snapIndicatorMs],
  );
}
