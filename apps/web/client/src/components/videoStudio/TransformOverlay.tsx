/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P2, §4.4/§4.5/§4.3.
 *
 * Absolutely-positioned, PERCENT-coordinate overlay rendered on top of the
 * controlled `<Player>` (`RemotionProjectPreview`) for the currently
 * selected background/overlay/brand layer. Per §4.4 the editor never draws
 * its own canvas — this overlay only draws handles/guides, positioned in the
 * exact same `x`/`y`/`width`/`height` percent space `RemotionLayerBaseSchema`
 * already uses (§3.1), so it requires no unit conversion against the
 * compiled config.
 *
 * Geometry/cursor conventions are a PORT (not an import — different theme,
 * different coordinate base: `CanvasObjects.tsx` drags in canvas PIXELS then
 * converts to percent for render; this component drags directly in percent
 * since that is the layer schema's native unit) of the 8-point resize +
 * rotate handle pattern at `presentation-canvas/CanvasObjects.tsx:1104-1136`.
 * Snap guides reuse `presentation-canvas/snap/SnapEngine.ts`'s
 * `computeSnapPosition` WHOLESALE (§4.3: "pure, tested, zero deps") — its
 * `SnapRect`/`SnapCandidate` shapes are already generic percent-or-pixel
 * rectangles, so no adapter is needed beyond feeding it 0-100 values.
 *
 * A whole drag/resize/rotate gesture is ONE undo step — `onGestureStart`/
 * `onGestureEnd` wire straight to `useTimelineHistory`'s
 * `beginGesture`/`endGesture` (same contract `useClipDrag` uses), and every
 * intermediate `onChange` call during the gesture is expected to route
 * through `history.apply` (which auto-merges into the open gesture).
 */
import { useCallback, useRef, useState } from "react";

import { computeSnapPosition, type SnapCandidate } from "@/presentation-canvas/snap/SnapEngine";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

export interface TransformOverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
}

export interface TransformOverlayProps {
  lang: VideoStudioLang;
  /** `null` renders nothing — no layer selected, or the selection isn't a
   *  background/overlay/brand layer (e.g. a read-only caption/scene clip). */
  geometry: TransformOverlayGeometry | null;
  locked: boolean;
  /** Percent-space rects of every OTHER authored layer, for snap targets. */
  snapCandidates: SnapCandidate[];
  onChange: (patch: Partial<TransformOverlayGeometry>) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}

const SNAP_THRESHOLD_PERCENT = 1.5;

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const RESIZE_HANDLES: ReadonlyArray<{ id: HandleId; className: string; cursor: string }> = [
  { id: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-nwse-resize" },
  { id: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ns-resize" },
  { id: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "cursor-nesw-resize" },
  { id: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
  { id: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "cursor-nwse-resize" },
  { id: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-ns-resize" },
  { id: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-nesw-resize" },
  { id: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
];

const MIN_SIZE_PERCENT = 2;

type DragMode =
  | { kind: "move"; startClientX: number; startClientY: number; base: TransformOverlayGeometry }
  | { kind: "resize"; handle: HandleId; startClientX: number; startClientY: number; base: TransformOverlayGeometry }
  | { kind: "rotate"; base: TransformOverlayGeometry };

export function TransformOverlay({
  lang,
  geometry,
  locked,
  snapCandidates,
  onChange,
  onGestureStart,
  onGestureEnd,
}: TransformOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const endGesture = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    dragRef.current = null;
    setIsDragging(false);
    onGestureEnd();
  }, [onGestureEnd]);

  const handleMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      if (drag.kind === "move") {
        const dxPercent = ((event.clientX - drag.startClientX) / rect.width) * 100;
        const dyPercent = ((event.clientY - drag.startClientY) / rect.height) * 100;
        const rawX = Math.min(100 - drag.base.width, Math.max(0, drag.base.x + dxPercent));
        const rawY = Math.min(100 - drag.base.height, Math.max(0, drag.base.y + dyPercent));
        const snapped = computeSnapPosition(
          { x: rawX, y: rawY, width: drag.base.width, height: drag.base.height },
          snapCandidates,
          { threshold: SNAP_THRESHOLD_PERCENT },
        );
        onChange({ x: Math.round(snapped.x * 10) / 10, y: Math.round(snapped.y * 10) / 10 });
        return;
      }

      if (drag.kind === "resize") {
        const dxPercent = ((event.clientX - drag.startClientX) / rect.width) * 100;
        const dyPercent = ((event.clientY - drag.startClientY) / rect.height) * 100;
        const { x, y, width, height } = drag.base;
        let nextX = x;
        let nextY = y;
        let nextWidth = width;
        let nextHeight = height;

        if (drag.handle.includes("e")) nextWidth = Math.max(MIN_SIZE_PERCENT, width + dxPercent);
        if (drag.handle.includes("s")) nextHeight = Math.max(MIN_SIZE_PERCENT, height + dyPercent);
        if (drag.handle.includes("w")) {
          nextWidth = Math.max(MIN_SIZE_PERCENT, width - dxPercent);
          nextX = x + (width - nextWidth);
        }
        if (drag.handle.includes("n")) {
          nextHeight = Math.max(MIN_SIZE_PERCENT, height - dyPercent);
          nextY = y + (height - nextHeight);
        }
        nextX = Math.max(0, Math.min(100 - nextWidth, nextX));
        nextY = Math.max(0, Math.min(100 - nextHeight, nextY));
        onChange({
          x: Math.round(nextX * 10) / 10,
          y: Math.round(nextY * 10) / 10,
          width: Math.round(nextWidth * 10) / 10,
          height: Math.round(nextHeight * 10) / 10,
        });
        return;
      }

      // rotate — angle from the box center to the pointer, 0deg = up.
      const centerXPx = rect.left + ((drag.base.x + drag.base.width / 2) / 100) * rect.width;
      const centerYPx = rect.top + ((drag.base.y + drag.base.height / 2) / 100) * rect.height;
      const angleRad = Math.atan2(event.clientX - centerXPx, -(event.clientY - centerYPx));
      const angleDeg = Math.round((angleRad * 180) / Math.PI);
      onChange({ rotationDeg: ((angleDeg % 360) + 360) % 360 });
    },
    [onChange, snapCandidates],
  );

  const attachListeners = useCallback(() => {
    function onUp() {
      endGesture();
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [handleMove, endGesture]);

  function beginGesture(mode: DragMode) {
    if (locked) return;
    dragRef.current = mode;
    setIsDragging(true);
    attachListeners();
    onGestureStart();
  }

  if (!geometry) return null;

  const style = {
    left: `${geometry.x}%`,
    top: `${geometry.y}%`,
    width: `${geometry.width}%`,
    height: `${geometry.height}%`,
    transform: `rotate(${geometry.rotationDeg}deg)`,
    transformOrigin: "center center",
  };

  return (
    <div
      ref={containerRef}
      data-testid="vs-transform-overlay"
      className="pointer-events-none absolute inset-0"
    >
      <div
        data-testid="vs-transform-box"
        aria-label={pickCopy(lang, videoStudioCopy.inspectorTitle)}
        className={[
          "pointer-events-auto absolute box-border border-2",
          locked ? "cursor-not-allowed border-dashed border-white/50" : "border-[var(--color-accent,#6ea8fe)]",
          isDragging ? "opacity-90" : "opacity-100",
        ].join(" ")}
        style={style}
        onPointerDown={(event) => {
          if (locked) return;
          event.stopPropagation();
          event.preventDefault();
          beginGesture({ kind: "move", startClientX: event.clientX, startClientY: event.clientY, base: geometry });
        }}
      >
        {!locked
          ? RESIZE_HANDLES.map((handle) => (
              <span
                key={handle.id}
                data-testid="vs-transform-handle"
                data-handle={handle.id}
                role="button"
                tabIndex={-1}
                aria-label={`resize-${handle.id}`}
                className={`absolute h-3 w-3 rounded-sm border border-white bg-[var(--color-accent,#6ea8fe)] shadow ${handle.className} ${handle.cursor}`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  beginGesture({
                    kind: "resize",
                    handle: handle.id,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    base: geometry,
                  });
                }}
              />
            ))
          : null}
        {!locked ? (
          <span
            data-testid="vs-transform-handle"
            data-handle="rotate"
            role="button"
            tabIndex={-1}
            aria-label="rotate"
            className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-6 cursor-grab rounded-full border border-white bg-[var(--color-accent,#6ea8fe)] shadow"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
              beginGesture({ kind: "rotate", base: geometry });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
