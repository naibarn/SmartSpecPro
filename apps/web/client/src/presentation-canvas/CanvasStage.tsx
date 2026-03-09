import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import type { PresentationElement, PresentationSlideBackground } from "@/lib/presentationEditorState";
import type { SnapGuide } from "./snap/SnapEngine";
import { CanvasObjects } from "./CanvasObjects";
import type { CanvasMediaMotionTiming } from "./CanvasObjects";
import { TransformHandles } from "./components/TransformHandles";
import type { ArrangeDirection, PresentationCanvasSize } from "@/lib/presentationEditorState";
import { Button } from "@/components/ui/button";

interface CanvasStageProps {
  elements: PresentationElement[];
  canvasSize: PresentationCanvasSize;
  selectedElementIds: string[];
  snapGuides: SnapGuide[];
  showElementFrames?: boolean;
  autoPlayVideos?: boolean;
  showVideoPlaybackToggle?: boolean;
  mediaMotionTiming?: CanvasMediaMotionTiming;
  suppressTransformHandles?: boolean;
  showTransformDock?: boolean;
  showViewportControls?: boolean;
  slideBackground?: PresentationSlideBackground;
  viewport?: {
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  onViewportChange?: (viewport: { scale: number; offsetX: number; offsetY: number }) => void;
  onSelectElement: (elementId: string, options?: { additive?: boolean }) => void;
  onFocusElement?: (elementId: string) => void;
  onMoveSelection: (deltaX: number, deltaY: number) => void;
  onResizeSelection: (width: number, height: number) => void;
  onRotateSelection: (deltaDegrees: number) => void;
  onArrangeSelection: (direction: ArrangeDirection) => void;
  onDragEnd?: () => void;
  onDropAsset?: (payload: CanvasStageDropAssetPayload) => void;
  onMarqueeSelect?: (
    bounds: { x: number; y: number; width: number; height: number },
    options?: { additive?: boolean },
  ) => void;
}

export const CANVAS_LIBRARY_ASSET_DRAG_MIME = "application/x-smartspec-canvas-library-asset-v1";

export interface CanvasStageDroppedAsset {
  kind: "image" | "video";
  title: string;
  sourceUrl: string;
  thumbnailUrl?: string | null;
}

export interface CanvasStageDropAssetPayload extends CanvasStageDroppedAsset {
  x: number;
  y: number;
}

const MIN_STAGE_ZOOM = 0.5;
const MAX_STAGE_ZOOM = 2;
const STAGE_ZOOM_STEP = 0.1;
const TRANSFORM_DOCK_WIDTH = 228;

interface MarqueeDragState {
  pointerId: number;
  startCanvasX: number;
  startCanvasY: number;
  currentCanvasX: number;
  currentCanvasY: number;
  additive: boolean;
  captureTarget: HTMLDivElement;
}

interface TouchGestureState {
  startDistance: number;
  startMidX: number;
  startMidY: number;
  startScale: number;
  startOffsetX: number;
  startOffsetY: number;
}

function normalizeMarqueeBounds(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): { x: number; y: number; width: number; height: number } {
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function CanvasStage({
  elements,
  canvasSize,
  selectedElementIds,
  snapGuides,
  showElementFrames = true,
  autoPlayVideos = false,
  showVideoPlaybackToggle = true,
  mediaMotionTiming = { elapsedMs: 0, slideDurationMs: 3000 },
  suppressTransformHandles,
  showTransformDock: showTransformDockProp = true,
  showViewportControls = true,
  slideBackground,
  viewport,
  onViewportChange,
  onSelectElement,
  onFocusElement,
  onMoveSelection,
  onResizeSelection,
  onRotateSelection,
  onArrangeSelection,
  onDragEnd,
  onDropAsset,
  onMarqueeSelect,
}: CanvasStageProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 680 });
  const dragDepthRef = useRef(0);
  const workspaceViewportRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const panCaptureTargetRef = useRef<HTMLDivElement | null>(null);
  const marqueeStateRef = useRef<MarqueeDragState | null>(null);
  const touchGestureRef = useRef<TouchGestureState | null>(null);
  const [marqueeBounds, setMarqueeBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const effectiveScale = viewport?.scale ?? 1;
  const offsetX = viewport?.offsetX ?? 0;
  const offsetY = viewport?.offsetY ?? 0;
  const canvasWidth = canvasSize.width;
  const canvasHeight = canvasSize.height;
  const showTransformDock = showTransformDockProp;

  const fittedStageSize = useMemo(() => {
    const safeViewportWidth = Math.max(
      1,
      viewportSize.width - 24 - (showTransformDock ? TRANSFORM_DOCK_WIDTH + 12 : 0),
    );
    const safeViewportHeight = Math.max(1, viewportSize.height - 24);
    const canvasAspect = canvasWidth / canvasHeight;
    const viewportAspect = safeViewportWidth / safeViewportHeight;
    if (viewportAspect >= canvasAspect) {
      const height = safeViewportHeight;
      return { width: Math.round(height * canvasAspect), height: Math.round(height) };
    }

    const width = safeViewportWidth;
    return { width: Math.round(width), height: Math.round(width / canvasAspect) };
  }, [canvasHeight, canvasWidth, showTransformDock, viewportSize.height, viewportSize.width]);

  const baseScaleX = fittedStageSize.width / canvasWidth;
  const baseScaleY = fittedStageSize.height / canvasHeight;
  const baseRenderScale = Math.max(0.0001, Math.min(baseScaleX, baseScaleY));
  const interactionScale = Math.max(0.0001, baseRenderScale * effectiveScale);

  useEffect(() => {
    const el = workspaceViewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setViewportSize({ width, height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const primarySelected = selectedElementIds[0]
    ? elements.find((element) => element.id === selectedElementIds[0]) || null
    : null;

  function clampViewportOffsets(scale: number, nextOffsetX: number, nextOffsetY: number) {
    if (scale <= 1) {
      return { offsetX: 0, offsetY: 0 };
    }

    const minOffsetX = fittedStageSize.width - (fittedStageSize.width * scale);
    const minOffsetY = fittedStageSize.height - (fittedStageSize.height * scale);

    return {
      offsetX: Math.max(minOffsetX, Math.min(0, nextOffsetX)),
      offsetY: Math.max(minOffsetY, Math.min(0, nextOffsetY)),
    };
  }

  function centerOffsetsForScale(scale: number) {
    const centeredOffsetX = (fittedStageSize.width - (fittedStageSize.width * scale)) / 2;
    const centeredOffsetY = (fittedStageSize.height - (fittedStageSize.height * scale)) / 2;
    return clampViewportOffsets(scale, centeredOffsetX, centeredOffsetY);
  }

  useEffect(() => {
    if (!onViewportChange || !viewport) {
      return;
    }

    const clamped = clampViewportOffsets(effectiveScale, offsetX, offsetY);
    if (clamped.offsetX !== offsetX || clamped.offsetY !== offsetY) {
      onViewportChange({
        scale: effectiveScale,
        offsetX: clamped.offsetX,
        offsetY: clamped.offsetY,
      });
    }
  }, [effectiveScale, offsetX, offsetY, fittedStageSize.width, fittedStageSize.height, onViewportChange, viewport]);

  useEffect(() => {
    function clearPanState(pointerId?: number) {
      const panState = panStateRef.current;
      if (panState && (pointerId == null || panState.pointerId === pointerId)) {
        const captureTarget = panCaptureTargetRef.current;
        if (captureTarget && captureTarget.hasPointerCapture?.(panState.pointerId)) {
          captureTarget.releasePointerCapture?.(panState.pointerId);
        }
        panStateRef.current = null;
        panCaptureTargetRef.current = null;
      }
    }

    function clearMarqueeState(pointerId?: number) {
      const marqueeState = marqueeStateRef.current;
      if (marqueeState && (pointerId == null || marqueeState.pointerId === pointerId)) {
        const captureTarget = marqueeState.captureTarget;
        if (captureTarget && captureTarget.hasPointerCapture?.(marqueeState.pointerId)) {
          captureTarget.releasePointerCapture?.(marqueeState.pointerId);
        }
        marqueeStateRef.current = null;
      }
      setMarqueeBounds(null);
    }

    function handlePointerMove(event: PointerEvent) {
      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId || !viewport || !onViewportChange) {
        const marqueeState = marqueeStateRef.current;
        if (!marqueeState || marqueeState.pointerId !== event.pointerId) {
          return;
        }
        const point = toCanvasCoordinates(
          marqueeState.captureTarget,
          event.clientX,
          event.clientY,
        );
        marqueeState.currentCanvasX = point.x;
        marqueeState.currentCanvasY = point.y;
        setMarqueeBounds(
          normalizeMarqueeBounds(
            marqueeState.startCanvasX,
            marqueeState.startCanvasY,
            marqueeState.currentCanvasX,
            marqueeState.currentCanvasY,
          ),
        );
        return;
      }

      const totalDx = event.clientX - panState.startClientX;
      const totalDy = event.clientY - panState.startClientY;
      const clamped = clampViewportOffsets(
        viewport.scale,
        panState.startOffsetX + totalDx,
        panState.startOffsetY + totalDy,
      );
      onViewportChange({
        scale: viewport.scale,
        offsetX: clamped.offsetX,
        offsetY: clamped.offsetY,
      });
    }

    function handlePointerUp(event: PointerEvent) {
      const marqueeState = marqueeStateRef.current;
      if (marqueeState && marqueeState.pointerId === event.pointerId) {
        const bounds = normalizeMarqueeBounds(
          marqueeState.startCanvasX,
          marqueeState.startCanvasY,
          marqueeState.currentCanvasX,
          marqueeState.currentCanvasY,
        );
        clearMarqueeState(event.pointerId);
        onMarqueeSelect?.(bounds, { additive: marqueeState.additive });
      }
      clearPanState(event.pointerId);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      clearPanState();
      clearMarqueeState();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [canvasHeight, canvasWidth, interactionScale, offsetX, offsetY, onMarqueeSelect, onViewportChange, viewport]);

  function parseDroppedAsset(raw: string): CanvasStageDroppedAsset | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<CanvasStageDroppedAsset>;
      if (
        !parsed
        || (parsed.kind !== "image" && parsed.kind !== "video")
        || !parsed.sourceUrl
      ) {
        return null;
      }

      return {
        kind: parsed.kind,
        title: String(parsed.title || parsed.kind),
        sourceUrl: String(parsed.sourceUrl),
        thumbnailUrl: parsed.thumbnailUrl || null,
      };
    } catch {
      return null;
    }
  }

  function toCanvasCoordinates(
    container: HTMLDivElement,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left - offsetX) / interactionScale;
    const y = (clientY - rect.top - offsetY) / interactionScale;
    return {
      x: Math.max(0, Math.min(canvasWidth, x)),
      y: Math.max(0, Math.min(canvasHeight, y)),
    };
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!onDropAsset) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!onDropAsset) {
      return;
    }

    const hasAssetPayload = event.dataTransfer.types.includes(CANVAS_LIBRARY_ASSET_DRAG_MIME);
    if (!hasAssetPayload) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!onDropAsset) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!onDropAsset) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);

    const payloadRaw =
      event.dataTransfer.getData(CANVAS_LIBRARY_ASSET_DRAG_MIME)
      || event.dataTransfer.getData("text/plain");
    const asset = parseDroppedAsset(payloadRaw);
    if (!asset) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const stageX = (event.clientX - rect.left - offsetX) / interactionScale;
    const stageY = (event.clientY - rect.top - offsetY) / interactionScale;

    onDropAsset({
      ...asset,
      x: Math.max(0, Math.min(canvasWidth, Math.round(stageX))),
      y: Math.max(0, Math.min(canvasHeight, Math.round(stageY))),
    });
  }

  function handlePanPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const isLeftButton = event.button === 0;
    const isMiddleButton = event.button === 1;
    const isRightButton = event.button === 2;
    const isModifierPan = isLeftButton && event.altKey;
    if (!isLeftButton && !isMiddleButton && !isRightButton) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const clickedCanvasObject = Boolean(target?.closest("[data-canvas-object='true']"));
    if (isLeftButton && clickedCanvasObject && !isModifierPan && !event.shiftKey) {
      return;
    }

    if (
      isLeftButton
      && !clickedCanvasObject
      && !isModifierPan
      && onMarqueeSelect
      && (!viewport || viewport.scale <= 1 || event.shiftKey)
    ) {
      const point = toCanvasCoordinates(event.currentTarget, event.clientX, event.clientY);
      marqueeStateRef.current = {
        pointerId: event.pointerId,
        startCanvasX: point.x,
        startCanvasY: point.y,
        currentCanvasX: point.x,
        currentCanvasY: point.y,
        additive: event.shiftKey,
        captureTarget: event.currentTarget,
      };
      setMarqueeBounds({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }

    if (!viewport || !onViewportChange || viewport.scale <= 1) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: viewport.offsetX,
      startOffsetY: viewport.offsetY,
    };
    panCaptureTargetRef.current = event.currentTarget;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleCanvasContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (effectiveScale > 1) {
      event.preventDefault();
    }
  }

  function readTouchGestureMetrics(
    target: HTMLDivElement,
    touches: Pick<Touch, "clientX" | "clientY">[],
  ) {
    if (touches.length < 2) {
      return null;
    }
    const rect = target.getBoundingClientRect();
    const [touchA, touchB] = touches;
    const pointAX = touchA.clientX - rect.left;
    const pointAY = touchA.clientY - rect.top;
    const pointBX = touchB.clientX - rect.left;
    const pointBY = touchB.clientY - rect.top;
    return {
      midX: (pointAX + pointBX) / 2,
      midY: (pointAY + pointBY) / 2,
      distance: Math.max(1, Math.hypot(pointBX - pointAX, pointBY - pointAY)),
    };
  }

  function handleCanvasTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (!viewport || !onViewportChange || event.touches.length < 2) {
      return;
    }
    const metrics = readTouchGestureMetrics(event.currentTarget, Array.from(event.touches));
    if (!metrics) {
      return;
    }
    touchGestureRef.current = {
      startDistance: metrics.distance,
      startMidX: metrics.midX,
      startMidY: metrics.midY,
      startScale: viewport.scale,
      startOffsetX: viewport.offsetX,
      startOffsetY: viewport.offsetY,
    };
    event.preventDefault();
  }

  function handleCanvasTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (!viewport || !onViewportChange) {
      return;
    }

    if (event.touches.length < 2) {
      if (touchGestureRef.current) {
        event.preventDefault();
      }
      return;
    }

    const gesture = touchGestureRef.current;
    const metrics = readTouchGestureMetrics(event.currentTarget, Array.from(event.touches));
    if (!gesture || !metrics) {
      return;
    }

    const nextScale = Math.min(
      MAX_STAGE_ZOOM,
      Math.max(
        MIN_STAGE_ZOOM,
        Number(((gesture.startScale * metrics.distance) / gesture.startDistance).toFixed(3)),
      ),
    );
    const anchorCanvasX = (gesture.startMidX - gesture.startOffsetX) / gesture.startScale;
    const anchorCanvasY = (gesture.startMidY - gesture.startOffsetY) / gesture.startScale;
    const nextOffsetX = metrics.midX - (anchorCanvasX * nextScale);
    const nextOffsetY = metrics.midY - (anchorCanvasY * nextScale);
    const clamped = clampViewportOffsets(nextScale, nextOffsetX, nextOffsetY);
    onViewportChange({
      scale: nextScale,
      offsetX: clamped.offsetX,
      offsetY: clamped.offsetY,
    });
    event.preventDefault();
  }

  function handleCanvasTouchEnd() {
    if (touchGestureRef.current) {
      touchGestureRef.current = null;
    }
  }

  function handleCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!viewport || !onViewportChange) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextScale = Math.min(
      MAX_STAGE_ZOOM,
      Math.max(MIN_STAGE_ZOOM, Number((viewport.scale + (direction * STAGE_ZOOM_STEP)).toFixed(2))),
    );
    if (nextScale === viewport.scale) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const canvasX = (pointerX - viewport.offsetX) / viewport.scale;
    const canvasY = (pointerY - viewport.offsetY) / viewport.scale;
    const nextOffsetX = pointerX - (canvasX * nextScale);
    const nextOffsetY = pointerY - (canvasY * nextScale);
    const clamped = clampViewportOffsets(nextScale, nextOffsetX, nextOffsetY);
    onViewportChange({
      scale: nextScale,
      offsetX: clamped.offsetX,
      offsetY: clamped.offsetY,
    });
  }

  function handleFitViewport() {
    if (!viewport || !onViewportChange) {
      return;
    }
    onViewportChange({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  }

  function handleCenterViewport() {
    if (!viewport || !onViewportChange) {
      return;
    }
    const centered = centerOffsetsForScale(viewport.scale);
    onViewportChange({
      scale: viewport.scale,
      offsetX: centered.offsetX,
      offsetY: centered.offsetY,
    });
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-300 bg-slate-200/80 p-2 shadow-inner" data-testid="canvas-stage">
      <div className="mb-1 flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
        {viewport ? (
          <p data-testid="canvas-stage-viewport">
            viewport: {effectiveScale.toFixed(2)}x ({Math.round(offsetX)}, {Math.round(offsetY)}) · {Math.round(effectiveScale * 100)}%
          </p>
        ) : (
          <span />
        )}
        <p data-testid="canvas-stage-size">
          canvas: {canvasWidth}x{canvasHeight} ({canvasSize.preset || "custom"})
        </p>
        {showViewportControls && viewport && onViewportChange ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              aria-label="Fit Canvas to View"
              onClick={handleFitViewport}
            >
              Fit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              aria-label="Center Canvas View"
              onClick={handleCenterViewport}
              disabled={effectiveScale <= 1}
            >
              Center
            </Button>
          </div>
        ) : null}
      </div>

      <div
        ref={workspaceViewportRef}
        className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-slate-300 bg-slate-300/70"
      >
        <div className="absolute inset-0 p-3">
          <div className="flex h-full min-h-0 items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center justify-center">
              <div
                className="relative overflow-hidden rounded-md border border-slate-400 shadow-2xl"
                style={{
                  width: `${fittedStageSize.width}px`,
                  height: `${fittedStageSize.height}px`,
                  backgroundColor: slideBackground?.type === "color"
                    ? slideBackground.value
                    : slideBackground?.type === "image"
                      ? "transparent"
                      : "#ffffff",
                }}
                aria-label="Canvas workspace"
                onWheel={handleCanvasWheel}
              >
                {slideBackground?.type === "image" && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `url(${slideBackground.url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                )}
                <div
                  data-testid="canvas-stage-layer-background"
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.26) 1px, transparent 0)",
                    backgroundSize: "20px 20px",
                  }}
                >
                  <span className="sr-only">background</span>
                </div>

                <div
                  data-testid="canvas-stage-layer-content"
                  className={`absolute inset-0 touch-none ${effectiveScale > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
                  onPointerDown={handlePanPointerDown}
                  onTouchStart={handleCanvasTouchStart}
                  onTouchMove={handleCanvasTouchMove}
                  onTouchEnd={handleCanvasTouchEnd}
                  onTouchCancel={handleCanvasTouchEnd}
                  onContextMenu={handleCanvasContextMenu}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div
                    data-testid="canvas-stage-pan-surface"
                    className="relative h-full w-full origin-top-left"
                    style={{
                      width: `${canvasWidth}px`,
                      height: `${canvasHeight}px`,
                      transform: `translate(${offsetX}px, ${offsetY}px) scale(${baseRenderScale * effectiveScale})`,
                    }}
                  >
                    <CanvasObjects
                      elements={elements}
                      selectedElementIds={selectedElementIds}
                      onSelectElement={onSelectElement}
                      onFocusElement={onFocusElement}
                      onMoveSelection={onMoveSelection}
                      onResizeSelection={onResizeSelection}
                      onRotateSelection={onRotateSelection}
                      onDragEnd={onDragEnd}
                      interactionScale={interactionScale}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                      showElementFrames={showElementFrames}
                      autoPlayVideos={autoPlayVideos}
                      showVideoPlaybackToggle={showVideoPlaybackToggle}
                      clipTextToElementBounds={false}
                      mediaMotionTiming={mediaMotionTiming}
                    />
                    {marqueeBounds ? (
                      <div
                        data-testid="canvas-stage-marquee"
                        className="pointer-events-none absolute border border-sky-500 bg-sky-400/20"
                        style={{
                          left: `${marqueeBounds.x}px`,
                          top: `${marqueeBounds.y}px`,
                          width: `${marqueeBounds.width}px`,
                          height: `${marqueeBounds.height}px`,
                        }}
                      />
                    ) : null}
                    {isDragOver ? (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center border-2 border-dashed border-sky-400 bg-sky-500/15 text-sm font-medium text-sky-700">
                        Drop media to insert
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  data-testid="canvas-stage-layer-selection-guides"
                  className="pointer-events-none absolute inset-0"
                >
                  <span className="sr-only">selection-guides</span>
                  {snapGuides.map((guide) => {
                    const isVertical = guide.axis === "x";
                    const baseAxisScale = baseRenderScale;
                    const targetPx = guide.target * baseAxisScale * effectiveScale;
                    const baseTarget = targetPx + (isVertical ? offsetX : offsetY);
                    const style = isVertical
                      ? { left: baseTarget, top: 0, bottom: 0, width: 1 }
                      : { top: baseTarget, left: 0, right: 0, height: 1 };
                    return (
                      <div
                        key={`${guide.axis}-${guide.type}-${guide.sourceElementId}-${guide.target}`}
                        className="absolute bg-sky-500/80"
                        style={style}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {showTransformDock ? (
              <div className="w-[228px] shrink-0 self-stretch rounded-md border border-slate-300 bg-slate-50/95 p-2">
                <div
                  data-testid="canvas-stage-layer-interaction-overlay"
                  className="h-full rounded-md border border-slate-200 bg-white/95 p-1 shadow-sm"
                >
                  {suppressTransformHandles ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground" data-testid="canvas-transform-suppressed">
                      Transform disabled in pan mode.
                    </p>
                  ) : (
                    <TransformHandles
                      compact
                      disabled={!primarySelected}
                      onMove={onMoveSelection}
                      onResize={onResizeSelection}
                      onRotate={onRotateSelection}
                      onArrange={onArrangeSelection}
                      currentWidth={primarySelected?.width ?? 0}
                      currentHeight={primarySelected?.height ?? 0}
                    />
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {effectiveScale > 1 ? (
          <p className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
            Scroll to zoom. Pan: drag empty area, Alt+drag, or right/middle-mouse drag. Select: Shift+drag marquee.
          </p>
        ) : null}
      </div>
    </div>
  );
}
