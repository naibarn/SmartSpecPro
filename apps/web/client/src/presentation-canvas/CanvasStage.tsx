import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import type { PresentationElement } from "@/lib/presentationEditorState";
import type { SnapGuide } from "./snap/SnapEngine";
import { CanvasObjects } from "./CanvasObjects";
import { TransformHandles } from "./components/TransformHandles";
import type { ArrangeDirection, PresentationCanvasSize } from "@/lib/presentationEditorState";
import { Button } from "@/components/ui/button";

interface CanvasStageProps {
  elements: PresentationElement[];
  canvasSize: PresentationCanvasSize;
  selectedElementIds: string[];
  snapGuides: SnapGuide[];
  suppressTransformHandles?: boolean;
  showTransformDock?: boolean;
  viewport?: {
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  onViewportChange?: (viewport: { scale: number; offsetX: number; offsetY: number }) => void;
  onSelectElement: (elementId: string, options?: { additive?: boolean }) => void;
  onMoveSelection: (deltaX: number, deltaY: number) => void;
  onResizeSelection: (width: number, height: number) => void;
  onRotateSelection: (deltaDegrees: number) => void;
  onArrangeSelection: (direction: ArrangeDirection) => void;
  onDropAsset?: (payload: CanvasStageDropAssetPayload) => void;
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

export function CanvasStage({
  elements,
  canvasSize,
  selectedElementIds,
  snapGuides,
  suppressTransformHandles,
  showTransformDock: showTransformDockProp = true,
  viewport,
  onViewportChange,
  onSelectElement,
  onMoveSelection,
  onResizeSelection,
  onRotateSelection,
  onArrangeSelection,
  onDropAsset,
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
  const interactionScale = Math.max(0.0001, baseScaleX * effectiveScale);

  useEffect(() => {
    const recalcViewport = () => {
      const nextWidth = workspaceViewportRef.current?.clientWidth ?? 0;
      const nextHeight = workspaceViewportRef.current?.clientHeight ?? 0;
      if (nextWidth > 0 && nextHeight > 0) {
        setViewportSize({ width: nextWidth, height: nextHeight });
      }
    };

    recalcViewport();
    window.addEventListener("resize", recalcViewport);
    return () => {
      window.removeEventListener("resize", recalcViewport);
    };
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
    function handlePointerMove(event: PointerEvent) {
      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId || !viewport || !onViewportChange) {
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
      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId) {
        return;
      }
      panStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [onViewportChange, viewport]);

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
    const baseScale = rect.width > 0 ? rect.width / canvasWidth : 1;
    const interactionScale = Math.max(0.0001, baseScale * effectiveScale);
    const stageX = (event.clientX - rect.left - offsetX) / interactionScale;
    const stageY = (event.clientY - rect.top - offsetY) / interactionScale;

    onDropAsset({
      ...asset,
      x: Math.max(0, Math.min(canvasWidth, Math.round(stageX))),
      y: Math.max(0, Math.min(canvasHeight, Math.round(stageY))),
    });
  }

  function handlePanPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!viewport || !onViewportChange || viewport.scale <= 1 || event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-canvas-object='true']")) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: viewport.offsetX,
      startOffsetY: viewport.offsetY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
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
    <div className="rounded-xl border border-slate-300 bg-slate-200/80 p-2 shadow-inner" data-testid="canvas-stage">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
        {viewport ? (
          <p data-testid="canvas-stage-viewport">
            viewport: {effectiveScale.toFixed(2)}x ({Math.round(offsetX)}, {Math.round(offsetY)})
          </p>
        ) : (
          <span />
        )}
        <p data-testid="canvas-stage-size">
          canvas: {canvasWidth}x{canvasHeight} ({canvasSize.preset || "custom"})
        </p>
        {viewport && onViewportChange ? (
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
        className="relative h-[min(84vh,920px)] min-h-[420px] w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-300/70"
      >
        <div className="absolute inset-0 p-3">
          <div className="flex h-full min-h-0 items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center justify-center">
              <div
                className="relative overflow-hidden rounded-md border border-slate-400 bg-white shadow-2xl"
                style={{
                  width: `${fittedStageSize.width}px`,
                  height: `${fittedStageSize.height}px`,
                }}
                aria-label="Canvas workspace"
                onWheel={handleCanvasWheel}
              >
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
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div
                    data-testid="canvas-stage-pan-surface"
                    className="relative h-full w-full origin-top-left"
                    style={{
                      transform: `translate(${offsetX}px, ${offsetY}px) scale(${effectiveScale})`,
                    }}
                  >
                    <CanvasObjects
                      elements={elements}
                      selectedElementIds={selectedElementIds}
                      onSelectElement={onSelectElement}
                      onMoveSelection={onMoveSelection}
                      onResizeSelection={onResizeSelection}
                      onRotateSelection={onRotateSelection}
                      interactionScale={interactionScale}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                    />
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
                    const baseAxisScale = isVertical ? baseScaleX : baseScaleY;
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
            Scroll to zoom. Drag empty area to pan.
          </p>
        ) : null}
      </div>
    </div>
  );
}
