import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, Search, X } from "lucide-react";

import type { PresentationElement, PresentationElementPatch } from "@/lib/presentationEditorState";
import { normalizeMediaSourceUrl } from "@/lib/mediaUrl";
import { computeMediaMotionTimelineFrame } from "@shared/presentation/mediaMotion";
import type { PresentationMediaMotion } from "@shared/presentation/contracts";
import { buildPresentationMediaShapeStyleForElement } from "@shared/presentation/mediaShape";

export interface CanvasMediaMotionTiming {
  elapsedMs: number;
  slideDurationMs: number;
}

interface CanvasObjectsProps {
  elements: PresentationElement[];
  selectedElementIds: string[];
  activeElementIds?: string[];
  onSelectElement: (elementId: string, options?: { additive?: boolean; preferElement?: boolean }) => void;
  onFocusElement?: (elementId: string) => void;
  onMoveSelection: (deltaX: number, deltaY: number) => void;
  onResizeSelection: (width: number, height: number) => void;
  onRotateSelection: (deltaDegrees: number) => void;
  /** Called once on pointer-up so the caller can break any open merge/undo group. */
  onDragEnd?: () => void;
  interactionScale: number;
  canvasWidth: number;
  canvasHeight: number;
  showElementFrames?: boolean;
  autoPlayVideos?: boolean;
  showVideoPlaybackToggle?: boolean;
  clipTextToElementBounds?: boolean;
  cropModeElementId?: string | null;
  cropModeTarget?: "content" | "frame";
  onAdjustMediaCrop?: (elementId: string, patch: PresentationElementPatch) => void;
  onToggleCropMode?: (elementId: string | null) => void;
  onSetCropModeTarget?: (target: "content" | "frame") => void;
  mediaMotionTiming?: CanvasMediaMotionTiming;
}

const MIN_LINE_HEIGHT_PX = 2;
const THAI_TEXT_REGEX = /[\u0e00-\u0e7f]/;
const THAI_TEXT_MIN_LINE_HEIGHT = 1.5;
const THAI_TEXT_PADDING_TOP = "0.2em";
const THAI_TEXT_PADDING_BOTTOM = "0.48em";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isLikelySvgMarkup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("<svg") && normalized.includes("</svg>");
}

function buildMediaTransformStyle(
  baseZoom: number,
  positionX: number,
  positionY: number,
  mediaMotion: PresentationMediaMotion | undefined,
  timing: CanvasMediaMotionTiming,
): CSSProperties {
  const motionFrame = computeMediaMotionTimelineFrame(
    mediaMotion,
    timing.elapsedMs,
    timing.slideDurationMs,
  );
  return {
    transform: `translate(${motionFrame.translateXPercent}%, ${motionFrame.translateYPercent}%) scale(${baseZoom * motionFrame.scaleMultiplier})`,
    transformOrigin: `${positionX}% ${positionY}%`,
  };
}

function resolveImageRenderProps(element: PresentationElement): {
  fit: "contain" | "cover" | "fill";
  positionX: number;
  positionY: number;
  zoom: number;
} {
  if (element.type !== "image") {
    return { fit: "contain", positionX: 50, positionY: 50, zoom: 1 };
  }

  const fit = (element.imageFit === "cover" || element.imageFit === "fill")
    ? element.imageFit
    : "contain";
  const positionX = clamp(Number(element.imagePositionX ?? 50), 0, 100);
  const positionY = clamp(Number(element.imagePositionY ?? 50), 0, 100);
  const zoom = clamp(Number(element.imageZoom ?? 1), 0.5, 3);
  return { fit, positionX, positionY, zoom };
}

function resolveVideoRenderProps(element: PresentationElement): {
  fit: "contain" | "cover" | "fill";
  positionX: number;
  positionY: number;
  zoom: number;
} {
  if (element.type !== "video") {
    return { fit: "cover", positionX: 50, positionY: 50, zoom: 1 };
  }

  const fit = (element.videoFit === "contain" || element.videoFit === "fill")
    ? element.videoFit
    : "cover";
  const positionX = clamp(Number(element.videoPositionX ?? 50), 0, 100);
  const positionY = clamp(Number(element.videoPositionY ?? 50), 0, 100);
  const zoom = clamp(Number(element.videoZoom ?? 1), 0.5, 3);
  return { fit, positionX, positionY, zoom };
}

function getElementDisplayText(element: PresentationElement): string {
  if (element.type === "text") {
    return element.text || "Text";
  }

  if (element.type === "image") {
    return element.alt || "Image";
  }

  if (element.type === "video") {
    return element.title || "Video";
  }

  return element.type;
}

function getElementAriaLabel(element: PresentationElement, index: number): string {
  return `Select canvas element ${index + 1}: ${getElementDisplayText(element)}`;
}

function getBaseElementClass(isSelected: boolean, showElementFrames: boolean): string {
  const idleFrameClass = showElementFrames
    ? "border-slate-300 hover:border-slate-400"
    : "border-transparent hover:border-transparent";
  return `absolute rounded border text-left transition ${isSelected
    ? "border-primary ring-2 ring-primary/40 shadow"
    : idleFrameClass
    }`;
}

interface PointerDragState {
  mode: "move" | "resize" | "rotate" | "crop" | "crop-resize";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastAppliedDx: number;
  lastAppliedDy: number;
  baseX?: number;
  baseY?: number;
  baseWidth: number;
  baseHeight: number;
  elementId?: string;
  basePositionX?: number;
  basePositionY?: number;
  baseZoom?: number;
  cropHandle?: "nw" | "n" | "ne" | "e" | "w" | "sw" | "s" | "se";
}

function getSelectionBounds(
  elements: PresentationElement[],
  elementIds: string[],
): { x: number; y: number; width: number; height: number } | null {
  if (!elementIds.length) {
    return null;
  }

  const selectedIds = new Set(elementIds);
  const selectedElements = elements.filter((element) => selectedIds.has(element.id));
  if (!selectedElements.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of selectedElements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + Math.max(MIN_LINE_HEIGHT_PX, element.height));
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

interface RenderElementBodyOptions {
  videoPlaybackMap: Record<string, boolean>;
  onToggleVideoPlayback: (elementId: string) => void;
  onVideoPlayStateChange: (elementId: string, isPlaying: boolean) => void;
  setVideoRef: (elementId: string, node: HTMLVideoElement | null) => void;
  autoPlayVideos: boolean;
  showVideoPlaybackToggle: boolean;
  clipTextToElementBounds: boolean;
  mediaMotionTiming: CanvasMediaMotionTiming;
}

function renderElementBody(
  element: PresentationElement,
  options: RenderElementBodyOptions,
): ReactElement {
  if (element.type === "text") {
    const fontSize = Number.isFinite(element.fontSize) ? element.fontSize : 48;
    const lineHeight = typeof element.lineHeight === "number" && Number.isFinite(element.lineHeight)
      ? element.lineHeight
      : 1.25;
    const letterSpacing = Number.isFinite(element.letterSpacing) ? element.letterSpacing : 0;
    const hasThaiText = THAI_TEXT_REGEX.test(String(element.text ?? ""));
    return (
      <div
        className={`h-full w-full px-2 py-0.5 ${options.clipTextToElementBounds ? "overflow-hidden" : "overflow-visible"}`}
        style={{ backgroundColor: element.backgroundColor || "transparent" }}
      >
        <p
          className="w-full break-words whitespace-pre-wrap"
          style={{
            display: "block",
            minHeight: "100%",
            boxSizing: "border-box",
            paddingTop: hasThaiText ? THAI_TEXT_PADDING_TOP : "0.04em",
            paddingBottom: hasThaiText ? THAI_TEXT_PADDING_BOTTOM : "0.14em",
            color: element.color || "#111827",
            fontSize,
            fontFamily: element.fontFamily || "Inter, system-ui, sans-serif",
            fontWeight: element.fontWeight || "600",
            fontStyle: element.fontStyle || "normal",
            textDecoration: element.textDecoration || "none",
            textAlign: element.textAlign || "left",
            lineHeight: hasThaiText ? Math.max(THAI_TEXT_MIN_LINE_HEIGHT, lineHeight) : lineHeight,
            letterSpacing: `${letterSpacing}px`,
            transform: "translateZ(0)",
            ...(element.textShadow ? { textShadow: element.textShadow } : {}),
            ...(element.textStroke ? { WebkitTextStroke: element.textStroke } : {}),
          }}
          title={element.text || "Text"}
        >
          {element.text || "Text"}
        </p>
      </div>
    );
  }

  if (element.type === "image") {
    const resolvedSource = normalizeMediaSourceUrl(element.src);
    const hasSource = Boolean(resolvedSource);
    const imageRender = resolveImageRenderProps(element);
    const mediaShapeStyle = buildPresentationMediaShapeStyleForElement(element);
    const inlineSvg = typeof element.svgContent === "string" ? element.svgContent.trim() : "";
    // Inline SVG graphic — transparent background, color-tinted
    if (inlineSvg) {
      const color = element.svgColor || "#ffffff";
      if (!isLikelySvgMarkup(inlineSvg)) {
        return (
          <div
            className="grid h-full w-full place-items-center bg-slate-200/80 text-center text-[11px] font-medium text-slate-600"
            data-testid={`canvas-svg-placeholder-${element.id}`}
          >
            SVG unavailable
          </div>
        );
      }
      const coloredSvg = inlineSvg.replace(/currentColor/g, color);
      return (
      <div className="relative h-full w-full overflow-hidden" style={mediaShapeStyle}>
          <div
            className="h-full w-full"
            style={{
              color,
              ...buildMediaTransformStyle(
                imageRender.zoom,
                imageRender.positionX,
                imageRender.positionY,
                element.mediaMotion,
                options.mediaMotionTiming,
              ),
            }}
            data-testid={`canvas-inline-svg-${element.id}`}
            dangerouslySetInnerHTML={{ __html: coloredSvg }}
          />
        </div>
      );
    }
    return (
      <div
        className={`relative h-full w-full overflow-hidden ${hasSource ? "" : "bg-slate-100"}`}
        style={mediaShapeStyle}
      >
        {hasSource ? (
          <img
            data-testid={`canvas-image-${element.id}`}
            src={resolvedSource}
            alt={element.alt || "Image"}
            className="h-full w-full"
            style={{
              objectFit: imageRender.fit,
              objectPosition: `${imageRender.positionX}% ${imageRender.positionY}%`,
              ...buildMediaTransformStyle(
                imageRender.zoom,
                imageRender.positionX,
                imageRender.positionY,
                element.mediaMotion,
                options.mediaMotionTiming,
              ),
            }}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-slate-500">
            <span className="max-w-[90%] truncate">Image</span>
          </div>
        )}
      </div>
    );
  }

  if (element.type === "rect") {
    return (
      <div
        className="h-full w-full"
        style={{
          backgroundColor: element.fill || "#93c5fd",
          border: `${Math.max(0, element.strokeWidth ?? 0)}px solid ${element.stroke || "transparent"}`,
        }}
      />
    );
  }

  if (element.type === "video") {
    const resolvedSource = normalizeMediaSourceUrl(element.src);
    const resolvedPoster = normalizeMediaSourceUrl(element.poster);
    const hasSource = Boolean(resolvedSource);
    const isPlaying = Boolean(options.videoPlaybackMap[element.id]);
    const videoRender = resolveVideoRenderProps(element);
    const mediaShapeStyle = buildPresentationMediaShapeStyleForElement(element);
    return (
      <div className="relative h-full w-full overflow-hidden bg-black/85" style={mediaShapeStyle}>
        {hasSource ? (
          <video
            ref={(node) => {
              options.setVideoRef(element.id, node);
            }}
            src={resolvedSource}
            poster={resolvedPoster || undefined}
            // React's muted prop uses setAttribute which doesn't reliably sync
            // the DOM property. The useEffect + onPlay handler set it imperatively.
            // For autoplay, start muted so the browser allows it; onPlay unmutes.
            muted={element.muted ?? true}
            loop={element.loop ?? false}
            preload={options.autoPlayVideos ? "auto" : "metadata"}
            className="h-full w-full"
            style={{
              objectFit: videoRender.fit,
              objectPosition: `${videoRender.positionX}% ${videoRender.positionY}%`,
              ...buildMediaTransformStyle(
                videoRender.zoom,
                videoRender.positionX,
                videoRender.positionY,
                element.mediaMotion,
                options.mediaMotionTiming,
              ),
            }}
            autoPlay={options.autoPlayVideos}
            playsInline
            onCanPlay={(event) => {
              if (!options.autoPlayVideos) {
                return;
              }
              const playPromise = event.currentTarget.play();
              if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => {
                  // Ignore autoplay failures (codec/policy).
                });
              }
            }}
            onPlay={(event) => {
              options.onVideoPlayStateChange(element.id, true);
              // After autoplay starts (muted), unmute if user enabled audio.
              // Use the captured video node + rAF to unmute AFTER React's
              // batched re-render completes, preventing the render cycle from
              // resetting the muted property.
              if (element.muted === false) {
                const videoNode = event.currentTarget;
                requestAnimationFrame(() => {
                  videoNode.muted = false;
                });
              }
            }}
            onPause={() => options.onVideoPlayStateChange(element.id, false)}
            onEnded={() => options.onVideoPlayStateChange(element.id, false)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
        )}
        {hasSource && options.showVideoPlaybackToggle ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label={isPlaying ? "Pause Video Element" : "Play Video Element"}
            className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white shadow hover:bg-black/80"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              options.onToggleVideoPlayback(element.id);
            }}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-xs text-white">
          <span className="truncate">{element.title || "Video"}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: element.fill || "transparent" }}
    >
      <div
        className="absolute left-0 right-0 top-1/2"
        style={{
          borderTop: `${Math.max(1, element.strokeWidth || 1)}px solid ${element.stroke || "#1f2937"}`,
        }}
      />
    </div>
  );
}

export function CanvasObjects({
  elements,
  selectedElementIds,
  activeElementIds,
  onSelectElement,
  onFocusElement,
  onMoveSelection,
  onResizeSelection,
  onRotateSelection,
  onDragEnd,
  interactionScale,
  canvasWidth,
  canvasHeight,
  showElementFrames = true,
  autoPlayVideos = false,
  showVideoPlaybackToggle = true,
  clipTextToElementBounds = false,
  cropModeElementId = null,
  cropModeTarget = "content",
  onAdjustMediaCrop,
  onToggleCropMode,
  onSetCropModeTarget,
  mediaMotionTiming = { elapsedMs: 0, slideDurationMs: 3000 },
}: CanvasObjectsProps) {
  const dragStateRef = useRef<PointerDragState | null>(null);
  const videoRefsRef = useRef<Record<string, HTMLVideoElement | null>>({});
  const [videoPlaybackMap, setVideoPlaybackMap] = useState<Record<string, boolean>>({});
  const stageScale = Math.max(0.0001, interactionScale);
  const selectedElement = elements.find((element) => element.id === selectedElementIds[0]) || null;
  const interactionActiveIds = activeElementIds ?? selectedElementIds;
  const selectionDragBounds = getSelectionBounds(elements, interactionActiveIds);
  const shouldRenderSelectionHitArea = Boolean(
    selectionDragBounds
    && (
      interactionActiveIds.length > 1
      || (interactionActiveIds.length > 0 && selectedElementIds.length === 0)
    ),
  );

  const setVideoRef = useCallback((elementId: string, node: HTMLVideoElement | null) => {
    videoRefsRef.current[elementId] = node;
  }, []);

  const handleVideoPlayStateChange = useCallback((elementId: string, isPlaying: boolean) => {
    setVideoPlaybackMap((prev) => {
      if ((prev[elementId] ?? false) === isPlaying) {
        return prev;
      }
      return {
        ...prev,
        [elementId]: isPlaying,
      };
    });
  }, []);

  const handleToggleVideoPlayback = useCallback((elementId: string) => {
    const video = videoRefsRef.current[elementId];
    if (!video) {
      return;
    }
    const playingFromState = Boolean(videoPlaybackMap[elementId]);
    const isPlaying = playingFromState || (!video.paused && !video.ended);
    if (!isPlaying) {
      // Ensure muted state is correct BEFORE play — React's muted prop is
      // unreliable (uses setAttribute which doesn't work for this property).
      const element = elements.find((el) => el.id === elementId);
      if (element && element.type === "video") {
        video.muted = element.muted ?? true;
      }
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Ignore playback failures (e.g. codec unavailable in browser).
        });
      }
      return;
    }
    video.pause();
  }, [videoPlaybackMap, elements]);

  useEffect(() => {
    const activeVideoIds = new Set(
      elements
        .filter((element) => element.type === "video")
        .map((element) => element.id),
    );
    setVideoPlaybackMap((prev) => {
      const nextEntries = Object.entries(prev).filter(([elementId]) => activeVideoIds.has(elementId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
    for (const elementId of Object.keys(videoRefsRef.current)) {
      if (!activeVideoIds.has(elementId)) {
        delete videoRefsRef.current[elementId];
      }
    }
  }, [elements]);

  // Sync muted property imperatively when elements change.
  // React's muted JSX prop uses setAttribute which doesn't work for the
  // HTMLVideoElement.muted IDL property. This useEffect is the source of
  // truth for the muted DOM state in editor mode. In autoplay mode (PlayMode),
  // the onPlay handler takes over after playback begins.
  useEffect(() => {
    for (const element of elements) {
      if (element.type !== "video") continue;
      const video = videoRefsRef.current[element.id];
      if (!video) continue;
      // In autoplay mode, only sync muted=true (to allow autoplay).
      // Unmuting is handled by the onPlay handler after playback starts.
      if (autoPlayVideos) {
        if (video.paused) {
          video.muted = true;
        }
      } else {
        video.muted = element.muted ?? true;
      }
    }
  }, [elements, autoPlayVideos]);

  useEffect(() => {
    if (!autoPlayVideos) {
      return;
    }
    for (const video of Object.values(videoRefsRef.current)) {
      if (!video || !video.paused) {
        continue;
      }
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Ignore autoplay failures caused by browser policies.
        });
      }
    }
  }, [autoPlayVideos, elements]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const totalDx = (event.clientX - dragState.startClientX) / stageScale;
      const totalDy = (event.clientY - dragState.startClientY) / stageScale;

      if (dragState.mode === "move") {
        const nextDx = Math.round(totalDx);
        const nextDy = Math.round(totalDy);
        const deltaX = nextDx - dragState.lastAppliedDx;
        const deltaY = nextDy - dragState.lastAppliedDy;
        if (!deltaX && !deltaY) {
          return;
        }

        dragState.lastAppliedDx = nextDx;
        dragState.lastAppliedDy = nextDy;
        onMoveSelection(deltaX, deltaY);
        return;
      }

      if (dragState.mode === "rotate") {
        const nextDelta = Math.round(totalDx * 0.8);
        const deltaDegrees = nextDelta - dragState.lastAppliedDx;
        if (!deltaDegrees) {
          return;
        }

        dragState.lastAppliedDx = nextDelta;
        onRotateSelection(deltaDegrees);
        return;
      }

      if (dragState.mode === "crop") {
        const element = elements.find((entry) => entry.id === dragState.elementId);
        if (!element || (element.type !== "image" && element.type !== "video") || !onAdjustMediaCrop) {
          return;
        }
        const cropScale = Math.max(0.5, dragState.baseZoom ?? 1);
        const nextPositionX = clamp(
          Number(dragState.basePositionX ?? 50) + ((totalDx / Math.max(16, dragState.baseWidth)) * 100) / cropScale,
          0,
          100,
        );
        const nextPositionY = clamp(
          Number(dragState.basePositionY ?? 50) + ((totalDy / Math.max(16, dragState.baseHeight)) * 100) / cropScale,
          0,
          100,
        );
        onAdjustMediaCrop(element.id, element.type === "image"
          ? {
            imagePositionX: Number(nextPositionX.toFixed(2)),
            imagePositionY: Number(nextPositionY.toFixed(2)),
          }
          : {
            videoPositionX: Number(nextPositionX.toFixed(2)),
            videoPositionY: Number(nextPositionY.toFixed(2)),
          });
        return;
      }

      if (dragState.mode === "crop-resize") {
        const element = elements.find((entry) => entry.id === dragState.elementId);
        if (!element || (element.type !== "image" && element.type !== "video") || !onAdjustMediaCrop || !dragState.cropHandle) {
          return;
        }
        const baseX = dragState.baseX ?? element.x;
        const baseY = dragState.baseY ?? element.y;
        let nextX = baseX;
        let nextY = baseY;
        let nextWidth = dragState.baseWidth;
        let nextHeight = dragState.baseHeight;

        if (dragState.cropHandle.includes("e")) {
          nextWidth = Math.max(16, Math.round(dragState.baseWidth + totalDx));
        }
        if (dragState.cropHandle.includes("s")) {
          nextHeight = Math.max(16, Math.round(dragState.baseHeight + totalDy));
        }
        if (dragState.cropHandle.includes("w")) {
          nextWidth = Math.max(16, Math.round(dragState.baseWidth - totalDx));
          nextX = Math.round(baseX + (dragState.baseWidth - nextWidth));
        }
        if (dragState.cropHandle.includes("n")) {
          nextHeight = Math.max(16, Math.round(dragState.baseHeight - totalDy));
          nextY = Math.round(baseY + (dragState.baseHeight - nextHeight));
        }

        if (
          nextX === dragState.baseX
          && nextY === dragState.baseY
          && nextWidth === dragState.baseWidth
          && nextHeight === dragState.baseHeight
        ) {
          return;
        }

        onAdjustMediaCrop(element.id, {
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        });
        return;
      }

      const nextWidth = Math.max(16, Math.round(dragState.baseWidth + totalDx));
      const nextHeight = Math.max(16, Math.round(dragState.baseHeight + totalDy));
      const lastWidth = dragState.baseWidth + dragState.lastAppliedDx;
      const lastHeight = dragState.baseHeight + dragState.lastAppliedDy;
      if (nextWidth === lastWidth && nextHeight === lastHeight) {
        return;
      }

      dragState.lastAppliedDx = nextWidth - dragState.baseWidth;
      dragState.lastAppliedDy = nextHeight - dragState.baseHeight;
      onResizeSelection(nextWidth, nextHeight);
    }

    function handlePointerUp(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      dragStateRef.current = null;
      onDragEnd?.();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [onMoveSelection, onResizeSelection, onRotateSelection, onDragEnd, stageScale]);

  if (!elements.length) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="rounded border border-dashed bg-white/80 px-3 py-2 text-sm text-muted-foreground">
          No elements on this slide yet.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {shouldRenderSelectionHitArea && selectionDragBounds ? (
        <div
          data-testid="canvas-selection-hit-area"
          className="absolute rounded-[inherit] bg-transparent"
          style={{
            left: `${(selectionDragBounds.x / canvasWidth) * 100}%`,
            top: `${(selectionDragBounds.y / canvasHeight) * 100}%`,
            width: `${(selectionDragBounds.width / canvasWidth) * 100}%`,
            height: `${(selectionDragBounds.height / canvasHeight) * 100}%`,
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || event.altKey) {
              return;
            }
            event.stopPropagation();
            dragStateRef.current = {
              mode: "move",
              pointerId: event.pointerId,
              startClientX: event.clientX,
              startClientY: event.clientY,
              lastAppliedDx: 0,
              lastAppliedDy: 0,
              baseWidth: selectionDragBounds.width,
              baseHeight: selectionDragBounds.height,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
          }}
          aria-hidden="true"
        />
      ) : null}
      {elements.map((element, index) => (
        <button
          key={element.id}
          type="button"
          data-canvas-object="true"
          className={getBaseElementClass(interactionActiveIds.includes(element.id), showElementFrames)}
          style={{
            left: `${(element.x / canvasWidth) * 100}%`,
            top: `${(element.y / canvasHeight) * 100}%`,
            width: `${(element.width / canvasWidth) * 100}%`,
            height:
              element.type === "line"
                ? Math.max(
                  (element.height / canvasHeight) * 100,
                  (MIN_LINE_HEIGHT_PX / canvasHeight) * 100,
                ) + "%"
                : `${(element.height / canvasHeight) * 100}%`,
            opacity: element.opacity ?? 1,
            transform: `rotate(${element.rotation ?? 0}deg)`,
            transformOrigin: "center center",
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.stopPropagation();
            const isAlreadySelected = interactionActiveIds.includes(element.id);
            if (event.altKey) {
              onSelectElement(element.id, { preferElement: true });
            } else if (event.shiftKey) {
              onSelectElement(element.id, { additive: true });
            } else if (!isAlreadySelected) {
              onSelectElement(element.id);
            } else {
              onFocusElement?.(element.id);
            }
            const cropModeActive = cropModeElementId === element.id && (element.type === "image" || element.type === "video");
            dragStateRef.current = cropModeActive
              ? (cropModeTarget === "frame"
                ? {
                  mode: "move",
                  pointerId: event.pointerId,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  lastAppliedDx: 0,
                  lastAppliedDy: 0,
                  baseWidth: element.width,
                  baseHeight: element.height,
                }
                : {
                  mode: "crop",
                  pointerId: event.pointerId,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  lastAppliedDx: 0,
                  lastAppliedDy: 0,
                  baseWidth: element.width,
                  baseHeight: element.height,
                  elementId: element.id,
                  basePositionX: element.type === "image" ? element.imagePositionX ?? 50 : element.videoPositionX ?? 50,
                  basePositionY: element.type === "image" ? element.imagePositionY ?? 50 : element.videoPositionY ?? 50,
                  baseZoom: element.type === "image" ? element.imageZoom ?? 1 : element.videoZoom ?? 1,
                })
              : {
                mode: "move",
                pointerId: event.pointerId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                lastAppliedDx: 0,
                lastAppliedDy: 0,
                baseWidth: element.width,
                baseHeight: element.height,
              };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) {
              const isAlreadySelected = interactionActiveIds.includes(element.id);
              if (event.altKey) {
                onSelectElement(element.id, { preferElement: true });
              } else if (event.shiftKey) {
                onSelectElement(element.id, { additive: true });
              } else if (!isAlreadySelected) {
                onSelectElement(element.id);
              } else {
                onFocusElement?.(element.id);
              }
            }
          }}
          aria-label={getElementAriaLabel(element, index)}
          title={`${index + 1}. ${getElementDisplayText(element)} (${element.type})`}
        >
          <span
            className={`block h-full w-full rounded-[inherit] ${
              element.type === "text" && !clipTextToElementBounds ? "overflow-visible" : "overflow-hidden"
            }`}
          >
            {renderElementBody(element, {
              videoPlaybackMap,
              onToggleVideoPlayback: handleToggleVideoPlayback,
              onVideoPlayStateChange: handleVideoPlayStateChange,
              setVideoRef,
              autoPlayVideos,
              showVideoPlaybackToggle,
              clipTextToElementBounds,
              mediaMotionTiming,
            })}
          </span>
          {selectedElement?.id === element.id && cropModeElementId !== element.id ? (
            <span
              className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-6 cursor-grab rounded-full border border-white bg-violet-500 shadow"
              role="button"
              tabIndex={-1}
              aria-label="Rotate Selected Element"
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.stopPropagation();
                dragStateRef.current = {
                  mode: "rotate",
                  pointerId: event.pointerId,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  lastAppliedDx: 0,
                  lastAppliedDy: 0,
                  baseWidth: element.width,
                  baseHeight: element.height,
                };
                (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
                event.preventDefault();
              }}
            />
          ) : null}
          {selectedElement?.id === element.id && cropModeElementId !== element.id ? (
            <span
              className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-sky-500 shadow"
              role="button"
              tabIndex={-1}
              aria-label="Resize Selected Element"
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.stopPropagation();
                dragStateRef.current = {
                  mode: "resize",
                  pointerId: event.pointerId,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  lastAppliedDx: 0,
                  lastAppliedDy: 0,
                  baseWidth: element.width,
                  baseHeight: element.height,
                };
                (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
                event.preventDefault();
              }}
            />
          ) : null}
          {selectedElement?.id === element.id && cropModeElementId === element.id && (element.type === "image" || element.type === "video") ? (
            <>
              <span className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-amber-400 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]" />
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="rounded-full bg-black/45 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white">
                  {cropModeTarget === "frame" ? "Frame Mode" : "Content Mode"}
                </span>
              </span>
              <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white">
                {cropModeTarget === "frame" ? "Drag frame or resize handles" : "Drag media or use arrows to move content"}
              </span>
              <span
                className="absolute left-2 top-2 z-10 flex gap-1"
                data-testid="canvas-crop-toolbar"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              >
                <span className="flex overflow-hidden rounded-full border border-white/20 bg-black/65 shadow">
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label="Edit Crop Content"
                    className={`grid h-7 min-w-7 place-items-center px-2 text-[10px] font-medium text-white ${cropModeTarget === "content" ? "bg-sky-600" : "bg-transparent hover:bg-black/80"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      onSetCropModeTarget?.("content");
                    }}
                  >
                    Content
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label="Edit Crop Frame"
                    className={`grid h-7 min-w-7 place-items-center px-2 text-[10px] font-medium text-white ${cropModeTarget === "frame" ? "bg-amber-600" : "bg-transparent hover:bg-black/80"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      onSetCropModeTarget?.("frame");
                    }}
                  >
                    Frame
                  </span>
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Zoom Out Crop"
                  className="grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white shadow hover:bg-black/80"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    if (!onAdjustMediaCrop) {
                      return;
                    }
                    onAdjustMediaCrop(element.id, element.type === "image"
                      ? { imageZoom: clamp((element.imageZoom ?? 1) - 0.1, 0.5, 3) }
                      : { videoZoom: clamp((element.videoZoom ?? 1) - 0.1, 0.5, 3) });
                  }}
                >
                  <Search className="h-3.5 w-3.5" />
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Zoom In Crop"
                  className="grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white shadow hover:bg-black/80"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    if (!onAdjustMediaCrop) {
                      return;
                    }
                    onAdjustMediaCrop(element.id, element.type === "image"
                      ? { imageZoom: clamp((element.imageZoom ?? 1) + 0.1, 0.5, 3) }
                      : { videoZoom: clamp((element.videoZoom ?? 1) + 0.1, 0.5, 3) });
                  }}
                >
                  <span className="text-sm font-bold leading-none">+</span>
                </span>
                {cropModeTarget === "content" ? ([
                  { label: "Move Crop Content Left", icon: ArrowLeft, deltaX: -4, deltaY: 0 },
                  { label: "Move Crop Content Up", icon: ArrowUp, deltaX: 0, deltaY: -4 },
                  { label: "Move Crop Content Down", icon: ArrowDown, deltaX: 0, deltaY: 4 },
                  { label: "Move Crop Content Right", icon: ArrowRight, deltaX: 4, deltaY: 0 },
                ] as const).map((control) => {
                  const Icon = control.icon;
                  return (
                    <span
                      key={control.label}
                      role="button"
                      tabIndex={-1}
                      aria-label={control.label}
                      className="grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white shadow hover:bg-black/80"
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        if (!onAdjustMediaCrop) {
                          return;
                        }
                        onAdjustMediaCrop(
                          element.id,
                          element.type === "image"
                            ? {
                              imagePositionX: clamp((element.imagePositionX ?? 50) + control.deltaX, 0, 100),
                              imagePositionY: clamp((element.imagePositionY ?? 50) + control.deltaY, 0, 100),
                            }
                            : {
                              videoPositionX: clamp((element.videoPositionX ?? 50) + control.deltaX, 0, 100),
                              videoPositionY: clamp((element.videoPositionY ?? 50) + control.deltaY, 0, 100),
                            },
                        );
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                  );
                }) : null}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Reset Crop"
                  className="grid h-7 min-w-7 place-items-center rounded-full bg-black/65 px-2 text-[10px] font-medium text-white shadow hover:bg-black/80"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    if (!onAdjustMediaCrop) {
                      return;
                    }
                    onAdjustMediaCrop(element.id, element.type === "image"
                      ? {
                        imageFit: "cover",
                        imageZoom: 1,
                        imagePositionX: 50,
                        imagePositionY: 50,
                      }
                      : {
                        videoFit: "cover",
                        videoZoom: 1,
                        videoPositionX: 50,
                        videoPositionY: 50,
                      });
                  }}
                >
                  Reset
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Exit Crop Mode"
                  className="grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white shadow hover:bg-black/80"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    onToggleCropMode?.(null);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </span>
              <span className={`pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/35 px-2 py-1 text-[10px] font-medium text-white ${cropModeTarget === "frame" ? "border border-amber-300/90" : "border border-white/80"}`}>
                {cropModeTarget === "frame" ? "Frame" : "Content"}
              </span>
              {cropModeTarget === "frame" ? ([
                { handle: "nw", className: "left-0 top-0 -translate-x-1/3 -translate-y-1/3 cursor-nwse-resize", label: "Resize Crop Frame Top Left" },
                { handle: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/3 cursor-ns-resize", label: "Resize Crop Frame Top" },
                { handle: "ne", className: "right-0 top-0 translate-x-1/3 -translate-y-1/3 cursor-nesw-resize", label: "Resize Crop Frame Top Right" },
                { handle: "e", className: "right-0 top-1/2 translate-x-1/3 -translate-y-1/2 cursor-ew-resize", label: "Resize Crop Frame Right" },
                { handle: "w", className: "left-0 top-1/2 -translate-x-1/3 -translate-y-1/2 cursor-ew-resize", label: "Resize Crop Frame Left" },
                { handle: "sw", className: "bottom-0 left-0 -translate-x-1/3 translate-y-1/3 cursor-nesw-resize", label: "Resize Crop Frame Bottom Left" },
                { handle: "s", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3 cursor-ns-resize", label: "Resize Crop Frame Bottom" },
                { handle: "se", className: "bottom-0 right-0 translate-x-1/3 translate-y-1/3 cursor-nwse-resize", label: "Resize Crop Frame Bottom Right" },
              ] as const).map((handleConfig) => (
                <span
                  key={handleConfig.handle}
                  className={`absolute z-10 h-5 w-5 rounded-full border border-white bg-amber-500 shadow ${handleConfig.className}`}
                  role="button"
                  tabIndex={-1}
                  aria-label={handleConfig.label}
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.stopPropagation();
                    dragStateRef.current = {
                      mode: "crop-resize",
                      pointerId: event.pointerId,
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      lastAppliedDx: 0,
                      lastAppliedDy: 0,
                      baseX: element.x,
                      baseY: element.y,
                      baseWidth: element.width,
                      baseHeight: element.height,
                      elementId: element.id,
                      cropHandle: handleConfig.handle,
                    };
                    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
                    event.preventDefault();
                  }}
                />
              )) : null}
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}
