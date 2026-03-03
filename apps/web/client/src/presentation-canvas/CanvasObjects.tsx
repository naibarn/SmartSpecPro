import { useEffect, useRef, type ReactElement } from "react";

import type { PresentationElement } from "@/lib/presentationEditorState";

interface CanvasObjectsProps {
  elements: PresentationElement[];
  selectedElementIds: string[];
  onSelectElement: (elementId: string, options?: { additive?: boolean }) => void;
  onMoveSelection: (deltaX: number, deltaY: number) => void;
  onResizeSelection: (width: number, height: number) => void;
  onRotateSelection: (deltaDegrees: number) => void;
  /** Called once on pointer-up so the caller can break any open merge/undo group. */
  onDragEnd?: () => void;
  interactionScale: number;
  canvasWidth: number;
  canvasHeight: number;
  showElementFrames?: boolean;
}

const MIN_LINE_HEIGHT_PX = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  mode: "move" | "resize" | "rotate";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastAppliedDx: number;
  lastAppliedDy: number;
  baseWidth: number;
  baseHeight: number;
}

function renderElementBody(element: PresentationElement): ReactElement {
  if (element.type === "text") {
    const fontSize = Number.isFinite(element.fontSize) ? element.fontSize : 48;
    const lineHeight = Number.isFinite(element.lineHeight) ? element.lineHeight : 1.25;
    const letterSpacing = Number.isFinite(element.letterSpacing) ? element.letterSpacing : 0;
    const hasThaiText = /[\u0e00-\u0e7f]/.test(String(element.text ?? ""));
    return (
      <div
        className="h-full w-full overflow-hidden px-2 py-0.5"
        style={{ backgroundColor: element.backgroundColor || "transparent" }}
      >
        <p
          className="w-full break-words whitespace-pre-wrap"
          style={{
            display: "block",
            minHeight: "100%",
            paddingBottom: hasThaiText ? "0.24em" : "0.14em",
            color: element.color || "#111827",
            fontSize,
            fontFamily: element.fontFamily || "Inter, system-ui, sans-serif",
            fontWeight: element.fontWeight || "600",
            fontStyle: element.fontStyle || "normal",
            textDecoration: element.textDecoration || "none",
            textAlign: element.textAlign || "left",
            lineHeight,
            letterSpacing: `${letterSpacing}px`,
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
    const hasSource = Boolean(element.src?.trim());
    const imageRender = resolveImageRenderProps(element);
    // Inline SVG graphic — transparent background, color-tinted
    if (element.svgContent) {
      const color = element.svgColor || "#ffffff";
      const coloredSvg = element.svgContent.replace(/currentColor/g, color);
      return (
        <div
          className="relative h-full w-full"
          style={{ color }}
          dangerouslySetInnerHTML={{ __html: coloredSvg }}
        />
      );
    }
    return (
      <div className={`relative h-full w-full ${hasSource ? "" : "bg-slate-100"}`}>
        {hasSource ? (
          <img
            src={element.src}
            alt={element.alt || "Image"}
            className="h-full w-full"
            style={{
              objectFit: imageRender.fit,
              objectPosition: `${imageRender.positionX}% ${imageRender.positionY}%`,
              transform: `scale(${imageRender.zoom})`,
              transformOrigin: `${imageRender.positionX}% ${imageRender.positionY}%`,
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
    const hasPoster = Boolean(element.poster?.trim());
    const hasSource = Boolean(element.src?.trim());
    return (
      <div className="relative h-full w-full bg-black/85">
        {hasPoster ? (
          <img
            src={element.poster}
            alt={element.title || "Video poster"}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : hasSource ? (
          <video
            src={element.src}
            muted={element.muted ?? true}
            loop={element.loop ?? false}
            preload="metadata"
            className="h-full w-full object-cover opacity-70"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
        )}
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
  onSelectElement,
  onMoveSelection,
  onResizeSelection,
  onRotateSelection,
  onDragEnd,
  interactionScale,
  canvasWidth,
  canvasHeight,
  showElementFrames = true,
}: CanvasObjectsProps) {
  const dragStateRef = useRef<PointerDragState | null>(null);
  const stageScale = Math.max(0.0001, interactionScale);
  const selectedElement = elements.find((element) => element.id === selectedElementIds[0]) || null;

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
      {elements.map((element, index) => (
        <button
          key={element.id}
          type="button"
          data-canvas-object="true"
          className={getBaseElementClass(selectedElementIds.includes(element.id), showElementFrames)}
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
            if (event.altKey) {
              return;
            }
            event.stopPropagation();
            const isAlreadySelected = selectedElementIds.includes(element.id);
            if (event.shiftKey) {
              onSelectElement(element.id, { additive: true });
            } else if (!isAlreadySelected) {
              onSelectElement(element.id);
            }
            dragStateRef.current = {
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
            if (event.altKey) {
              return;
            }
            event.stopPropagation();
            if (event.detail === 0) {
              const isAlreadySelected = selectedElementIds.includes(element.id);
              if (event.shiftKey) {
                onSelectElement(element.id, { additive: true });
              } else if (!isAlreadySelected) {
                onSelectElement(element.id);
              }
            }
          }}
          aria-label={getElementAriaLabel(element, index)}
          title={`${index + 1}. ${getElementDisplayText(element)} (${element.type})`}
        >
          <span className="block h-full w-full overflow-hidden rounded-[inherit]">
            {renderElementBody(element)}
          </span>
          {selectedElement?.id === element.id ? (
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
          {selectedElement?.id === element.id ? (
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
        </button>
      ))}
    </div>
  );
}
