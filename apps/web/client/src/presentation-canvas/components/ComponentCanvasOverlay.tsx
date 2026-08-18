import { useEffect, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import type { PresentationComponentInstance } from "@/lib/presentationEditorState";
import type { PresentationComponentCanvasSlotArea } from "@/lib/presentationComponentCatalog";
import type { CanvasLibraryAsset } from "./AssetLibraryPanel";
import { CANVAS_LIBRARY_ASSET_DRAG_MIME } from "../CanvasStage";

interface ComponentCanvasOverlayProps {
  component: PresentationComponentInstance;
  componentLabel: string;
  interactionScale: number;
  componentBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  slotAreas: PresentationComponentCanvasSlotArea[];
  activeSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  onClearSlot: () => void;
  onMoveComponent: (deltaX: number, deltaY: number) => void;
  onResizeComponent: (width: number, height: number) => void;
  onResizeSlot: (slotId: string, width: number, height: number) => void;
  onEndComponentDrag: () => void;
  onUpdateTextSlot: (slotId: string, text: string) => void;
  onUpdateImageSlot: (slotId: string, src: string, alt: string) => void;
  onUpdateVideoSlot: (slotId: string, src: string, poster: string, title: string) => void;
  onUpdateListSlot: (slotId: string, items: string[]) => void;
  onSelectRawSlotElement?: (slotId: string) => void;
  imageAssets?: CanvasLibraryAsset[];
  videoAssets?: CanvasLibraryAsset[];
  onPickImageAsset?: (slotId: string, asset: CanvasLibraryAsset) => void;
  onPickVideoAsset?: (slotId: string, asset: CanvasLibraryAsset) => void;
}

interface OverlayDragState {
  mode: "move" | "resize-right" | "resize-bottom" | "resize-corner" | "resize-slot-right" | "resize-slot-bottom" | "resize-slot-corner";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastAppliedDx: number;
  lastAppliedDy: number;
  started: boolean;
  slotId: string | null;
  baseWidth: number;
  baseHeight: number;
}

const COMPONENT_DRAG_THRESHOLD_PX = 6;

function getTextSlotValue(component: PresentationComponentInstance, slotId: string): string {
  const binding = component.slotBindings.find((slot) => slot.slotId === slotId && slot.type === "text");
  return binding?.type === "text" ? binding.text : "";
}

function getImageSlotValue(component: PresentationComponentInstance, slotId: string): { src: string; alt: string } {
  const binding = component.slotBindings.find((slot) => slot.slotId === slotId && slot.type === "image");
  return binding?.type === "image"
    ? { src: binding.src, alt: binding.alt ?? "" }
    : { src: "", alt: "" };
}

function getListSlotValue(component: PresentationComponentInstance, slotId: string): string[] {
  const binding = component.slotBindings.find((slot) => slot.slotId === slotId && slot.type === "list");
  return binding?.type === "list" ? binding.items : [];
}

function getVideoSlotValue(component: PresentationComponentInstance, slotId: string): {
  src: string;
  poster: string;
  title: string;
} {
  const binding = component.slotBindings.find((slot) => slot.slotId === slotId && slot.type === "video");
  return binding?.type === "video"
    ? { src: binding.src, poster: binding.poster ?? "", title: binding.title ?? "" }
    : { src: "", poster: "", title: "" };
}

function getMediaSlotValue(component: PresentationComponentInstance, slotId: string): {
  kind: "image" | "video" | null;
  image: { src: string; alt: string };
  video: { src: string; poster: string; title: string };
} {
  const image = getImageSlotValue(component, slotId);
  if (image.src || image.alt) {
    return { kind: "image", image, video: { src: "", poster: "", title: "" } };
  }
  const video = getVideoSlotValue(component, slotId);
  if (video.src || video.poster || video.title) {
    return { kind: "video", image: { src: "", alt: "" }, video };
  }
  return { kind: null, image, video };
}

function parseDroppedAsset(event: DragEvent<HTMLElement>, expectedKind: "image" | "video" | "media"): CanvasLibraryAsset | null {
  const payloadRaw = event.dataTransfer.getData(CANVAS_LIBRARY_ASSET_DRAG_MIME)
    || event.dataTransfer.getData("text/plain");
  if (!payloadRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadRaw) as Partial<CanvasLibraryAsset>;
    if (!parsed.sourceUrl) {
      return null;
    }
    if (expectedKind !== "media" && parsed.kind !== expectedKind) {
      return null;
    }
    const resolvedKind = parsed.kind === "video" ? "video" : "image";
    return {
      id: Number(parsed.id) || Date.now(),
      kind: resolvedKind,
      title: String(parsed.title || (resolvedKind === "image" ? "Image" : "Video")),
      sourceUrl: String(parsed.sourceUrl),
      thumbnailUrl: parsed.thumbnailUrl ? String(parsed.thumbnailUrl) : null,
      sourceType: parsed.sourceType,
    };
  } catch {
    return null;
  }
}

export function ComponentCanvasOverlay({
  component,
  componentLabel,
  interactionScale,
  componentBounds,
  slotAreas,
  activeSlotId,
  onSelectSlot,
  onClearSlot,
  onMoveComponent,
  onResizeComponent,
  onResizeSlot,
  onEndComponentDrag,
  onUpdateTextSlot,
  onUpdateImageSlot,
  onUpdateVideoSlot,
  onUpdateListSlot,
  onSelectRawSlotElement,
  imageAssets = [],
  videoAssets = [],
  onPickImageAsset,
  onPickVideoAsset,
}: ComponentCanvasOverlayProps) {
  const activeSlot = slotAreas.find((slot) => slot.slotId === activeSlotId) ?? null;
  const imageSuggestions = imageAssets.filter((asset) => asset.kind === "image").slice(0, 8);
  const videoSuggestions = videoAssets.filter((asset) => asset.kind === "video").slice(0, 8);
  const [mediaEditorMode, setMediaEditorMode] = useState<Record<string, "image" | "video">>({});
  const dragStateRef = useRef<OverlayDragState | null>(null);
  const suppressedSlotClickRef = useRef<string | null>(null);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const totalClientDx = event.clientX - dragState.startClientX;
      const totalClientDy = event.clientY - dragState.startClientY;
      if (!dragState.started) {
        if (
          Math.abs(totalClientDx) < COMPONENT_DRAG_THRESHOLD_PX
          && Math.abs(totalClientDy) < COMPONENT_DRAG_THRESHOLD_PX
        ) {
          return;
        }
        dragState.started = true;
        if (dragState.slotId) {
          suppressedSlotClickRef.current = dragState.slotId;
        }
      }

      if (dragState.mode !== "move") {
        const nextDx = Math.round(totalClientDx / Math.max(0.0001, interactionScale));
        const nextDy = Math.round(totalClientDy / Math.max(0.0001, interactionScale));
        const nextWidth = (dragState.mode === "resize-bottom" || dragState.mode === "resize-slot-bottom")
          ? dragState.baseWidth
          : Math.max(24, dragState.baseWidth + nextDx);
        const nextHeight = (dragState.mode === "resize-right" || dragState.mode === "resize-slot-right")
          ? dragState.baseHeight
          : Math.max(24, dragState.baseHeight + nextDy);
        const lastWidth = (dragState.mode === "resize-bottom" || dragState.mode === "resize-slot-bottom")
          ? dragState.baseWidth
          : dragState.baseWidth + dragState.lastAppliedDx;
        const lastHeight = (dragState.mode === "resize-right" || dragState.mode === "resize-slot-right")
          ? dragState.baseHeight
          : dragState.baseHeight + dragState.lastAppliedDy;
        if (nextWidth === lastWidth && nextHeight === lastHeight) {
          return;
        }

        dragState.lastAppliedDx = nextWidth - dragState.baseWidth;
        dragState.lastAppliedDy = nextHeight - dragState.baseHeight;
        if (dragState.mode.startsWith("resize-slot-") && dragState.slotId) {
          onResizeSlot(dragState.slotId, nextWidth, nextHeight);
          return;
        }
        onResizeComponent(nextWidth, nextHeight);
        return;
      }

      const nextDx = Math.round(totalClientDx / Math.max(0.0001, interactionScale));
      const nextDy = Math.round(totalClientDy / Math.max(0.0001, interactionScale));
      const deltaX = nextDx - dragState.lastAppliedDx;
      const deltaY = nextDy - dragState.lastAppliedDy;
      if (!deltaX && !deltaY) {
        return;
      }

      dragState.lastAppliedDx = nextDx;
      dragState.lastAppliedDy = nextDy;
      onMoveComponent(deltaX, deltaY);
    }

    function handlePointerUp(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const didMove = dragState.started;
      dragStateRef.current = null;
      if (didMove) {
        onEndComponentDrag();
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [interactionScale, onEndComponentDrag, onMoveComponent, onResizeComponent]);

  function handleBeginComponentDrag(event: ReactPointerEvent<HTMLElement>, slotId?: string) {
    if (event.button !== 0) {
      return;
    }
    dragStateRef.current = {
      mode: "move",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastAppliedDx: 0,
      lastAppliedDy: 0,
      started: false,
      slotId: slotId ?? null,
      baseWidth: componentBounds.width,
      baseHeight: componentBounds.height,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  function handleBeginComponentResize(
    event: ReactPointerEvent<HTMLElement>,
    mode: OverlayDragState["mode"],
    slotId?: string,
    baseWidth?: number,
    baseHeight?: number,
  ) {
    if (event.button !== 0) {
      return;
    }
    dragStateRef.current = {
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastAppliedDx: 0,
      lastAppliedDy: 0,
      started: false,
      slotId: slotId ?? null,
      baseWidth: baseWidth ?? componentBounds.width,
      baseHeight: baseHeight ?? componentBounds.height,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className="pointer-events-auto absolute cursor-grab rounded-[20px] border-2 border-sky-500/90 bg-sky-500/5 shadow-[0_0_0_1px_rgba(14,165,233,0.15)] active:cursor-grabbing"
        style={{
          left: `${componentBounds.x}px`,
          top: `${componentBounds.y}px`,
          width: `${componentBounds.width}px`,
          height: `${componentBounds.height}px`,
        }}
        data-testid="component-overlay-drag-surface"
        aria-label={`Move ${componentLabel}`}
        onPointerDown={handleBeginComponentDrag}
      />
      <div
        className="pointer-events-auto absolute cursor-grab rounded-md bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white shadow active:cursor-grabbing"
        style={{
          left: `${componentBounds.x + 8}px`,
          top: `${Math.max(0, componentBounds.y - 28)}px`,
        }}
        data-testid="component-overlay-drag-label"
        onPointerDown={handleBeginComponentDrag}
      >
        {componentLabel}
      </div>
      <span
        className="pointer-events-auto absolute top-1/2 z-30 h-10 w-3 -translate-y-1/2 translate-x-1/2 cursor-ew-resize rounded-full border border-white bg-sky-500 shadow"
        style={{
          left: `${componentBounds.x + componentBounds.width}px`,
        }}
        role="button"
        tabIndex={-1}
        aria-label={`Resize ${componentLabel} wider`}
        onPointerDown={(event) => {
          handleBeginComponentResize(event, "resize-right");
        }}
      />
      <span
        className="pointer-events-auto absolute left-1/2 z-30 h-3 w-10 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-white bg-sky-500 shadow"
        style={{
          top: `${componentBounds.y + componentBounds.height}px`,
        }}
        role="button"
        tabIndex={-1}
        aria-label={`Resize ${componentLabel} taller`}
        onPointerDown={(event) => {
          handleBeginComponentResize(event, "resize-bottom");
        }}
      />
      <span
        className="pointer-events-auto absolute z-30 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-sm border border-white bg-sky-600 shadow"
        style={{
          left: `${componentBounds.x + componentBounds.width}px`,
          top: `${componentBounds.y + componentBounds.height}px`,
        }}
        role="button"
        tabIndex={-1}
        aria-label={`Resize ${componentLabel}`}
        onPointerDown={(event) => {
          handleBeginComponentResize(event, "resize-corner");
        }}
      />
      {activeSlot ? (
        <>
          <span
            className="pointer-events-auto absolute top-1/2 z-30 h-9 w-3 -translate-y-1/2 translate-x-1/2 cursor-ew-resize rounded-full border border-white bg-emerald-500 shadow"
            style={{
              left: `${activeSlot.bounds.x + activeSlot.bounds.width}px`,
              top: `${activeSlot.bounds.y + (activeSlot.bounds.height / 2)}px`,
            }}
            role="button"
            tabIndex={-1}
            aria-label={`Resize ${activeSlot.label} slot wider`}
            onPointerDown={(event) => {
              handleBeginComponentResize(
                event,
                "resize-slot-right",
                activeSlot.slotId,
                activeSlot.bounds.width,
                activeSlot.bounds.height,
              );
            }}
          />
          <span
            className="pointer-events-auto absolute left-1/2 z-30 h-3 w-9 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-white bg-emerald-500 shadow"
            style={{
              left: `${activeSlot.bounds.x + (activeSlot.bounds.width / 2)}px`,
              top: `${activeSlot.bounds.y + activeSlot.bounds.height}px`,
            }}
            role="button"
            tabIndex={-1}
            aria-label={`Resize ${activeSlot.label} slot taller`}
            onPointerDown={(event) => {
              handleBeginComponentResize(
                event,
                "resize-slot-bottom",
                activeSlot.slotId,
                activeSlot.bounds.width,
                activeSlot.bounds.height,
              );
            }}
          />
          <span
            className="pointer-events-auto absolute z-30 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-sm border border-white bg-emerald-600 shadow"
            style={{
              left: `${activeSlot.bounds.x + activeSlot.bounds.width}px`,
              top: `${activeSlot.bounds.y + activeSlot.bounds.height}px`,
            }}
            role="button"
            tabIndex={-1}
            aria-label={`Resize ${activeSlot.label} slot`}
            onPointerDown={(event) => {
              handleBeginComponentResize(
                event,
                "resize-slot-corner",
                activeSlot.slotId,
                activeSlot.bounds.width,
                activeSlot.bounds.height,
              );
            }}
          />
        </>
      ) : null}

      {slotAreas.map((slot) => {
        const active = slot.slotId === activeSlotId;
        return (
          <button
            key={slot.slotId}
            type="button"
            className={`pointer-events-auto absolute overflow-hidden rounded-xl border text-left transition ${
              active
                ? "border-sky-500 bg-sky-500/12 shadow-[0_0_0_1px_rgba(14,165,233,0.2)]"
                : "border-sky-400/60 bg-white/8 hover:border-sky-400 hover:bg-sky-400/10"
            }`}
            style={{
              left: `${slot.bounds.x}px`,
              top: `${slot.bounds.y}px`,
              width: `${slot.bounds.width}px`,
              height: `${slot.bounds.height}px`,
            }}
            aria-label={`Select component slot ${slot.label}`}
            data-testid={`component-slot-overlay-${slot.slotId}`}
            onPointerDown={(event) => {
              handleBeginComponentDrag(event, slot.slotId);
            }}
            onDragOver={(event) => {
              if (slot.type !== "image" && slot.type !== "video" && slot.type !== "media") {
                return;
              }
              if (parseDroppedAsset(event, slot.type)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onDrop={(event) => {
              if (slot.type !== "image" && slot.type !== "video" && slot.type !== "media") {
                return;
              }
              const asset = parseDroppedAsset(event, slot.type);
              if (!asset) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onSelectSlot(slot.slotId);
              if (asset.kind === "image") {
                onPickImageAsset?.(slot.slotId, asset);
              } else {
                onPickVideoAsset?.(slot.slotId, asset);
              }
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressedSlotClickRef.current === slot.slotId) {
                suppressedSlotClickRef.current = null;
                return;
              }
              onSelectSlot(slot.slotId);
            }}
          >
            <span className="absolute left-1.5 top-1.5 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {slot.label}
            </span>
          </button>
        );
      })}

      {activeSlot ? (
        <div
          className="pointer-events-auto absolute w-[320px] max-w-[calc(100%-16px)] rounded-xl border border-slate-300 bg-white/98 p-3 shadow-xl"
          style={{
            left: `${Math.min(
              Math.max(8, activeSlot.bounds.x + activeSlot.bounds.width + 12),
              Math.max(8, componentBounds.x + componentBounds.width - 320),
            )}px`,
            top: `${Math.min(
              Math.max(8, activeSlot.bounds.y),
              Math.max(8, componentBounds.y + componentBounds.height - 176),
            )}px`,
          }}
          data-testid="component-slot-canvas-editor"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{activeSlot.label}</p>
              <p className="text-[11px] text-slate-500">Edit this slot directly on the canvas.</p>
            </div>
            <div className="flex items-center gap-1">
              {(activeSlot.type === "image" || activeSlot.type === "video" || activeSlot.type === "media") && onSelectRawSlotElement ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  aria-label={`Select raw media element for ${activeSlot.label}`}
                  onClick={() => onSelectRawSlotElement(activeSlot.slotId)}
                >
                  Select Media
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                aria-label="Close canvas slot editor"
                onClick={onClearSlot}
              >
                Close
              </Button>
            </div>
          </div>

          {activeSlot.type === "text" ? (
            activeSlot.multiline ? (
              <Textarea
                value={getTextSlotValue(component, activeSlot.slotId)}
                onChange={(event) => onUpdateTextSlot(activeSlot.slotId, event.target.value)}
                className="min-h-[104px] text-sm"
                aria-label={`Canvas Slot Editor ${activeSlot.label}`}
              />
            ) : (
              <Input
                value={getTextSlotValue(component, activeSlot.slotId)}
                onChange={(event) => onUpdateTextSlot(activeSlot.slotId, event.target.value)}
                className="h-9 text-sm"
                aria-label={`Canvas Slot Editor ${activeSlot.label}`}
              />
            )
          ) : null}

          {activeSlot.type === "image" ? (
            <div className="space-y-2">
              <Input
                value={getImageSlotValue(component, activeSlot.slotId).src}
                onChange={(event) => {
                  const current = getImageSlotValue(component, activeSlot.slotId);
                  onUpdateImageSlot(activeSlot.slotId, event.target.value, current.alt);
                }}
                className="h-9 text-sm"
                aria-label={`Canvas Slot Editor ${activeSlot.label} URL`}
              />
              <Input
                value={getImageSlotValue(component, activeSlot.slotId).alt}
                onChange={(event) => {
                  const current = getImageSlotValue(component, activeSlot.slotId);
                  onUpdateImageSlot(activeSlot.slotId, current.src, event.target.value);
                }}
                className="h-9 text-sm"
                aria-label={`Canvas Slot Editor ${activeSlot.label} Alt`}
              />
              {imageSuggestions.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Pick From Library
                  </p>
                  <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {imageSuggestions.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition hover:border-sky-400 hover:bg-sky-50"
                        aria-label={`Use image asset ${asset.title} for ${activeSlot.label}`}
                        onClick={() => onPickImageAsset?.(activeSlot.slotId, asset)}
                      >
                        {asset.thumbnailUrl ? (
                          <AuthenticatedMediaImage
                            src={asset.thumbnailUrl}
                            alt={asset.title}
                            className="h-16 w-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="grid h-16 w-full place-items-center bg-slate-200 text-[11px] text-slate-500">
                            No preview
                          </div>
                        )}
                        <div className="px-2 py-1.5">
                          <p className="truncate text-[11px] font-medium text-slate-800">{asset.title}</p>
                          <p className="text-[10px] text-slate-500">{asset.sourceType ?? "library"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeSlot.type === "media" ? (
            (() => {
              const value = getMediaSlotValue(component, activeSlot.slotId);
              const mediaSlotKey = `${component.id}:${activeSlot.slotId}`;
              const activeMode = mediaEditorMode[mediaSlotKey]
                ?? (value.kind === "video" ? "video" : "image");
              return (
                <div className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                {value.kind === "video"
                  ? "Current media: video"
                  : value.kind === "image"
                    ? "Current media: image"
                    : "Current media: empty"}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={activeMode === "image" ? "default" : "outline"}
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setMediaEditorMode((current) => ({ ...current, [mediaSlotKey]: "image" }))}
                  >
                    Use Image
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={activeMode === "video" ? "default" : "outline"}
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setMediaEditorMode((current) => ({ ...current, [mediaSlotKey]: "video" }))}
                  >
                    Use Video
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => {
                    if (value.kind === "video" || activeMode === "video") {
                      onUpdateVideoSlot(activeSlot.slotId, "", "", "");
                    } else {
                      onUpdateImageSlot(activeSlot.slotId, "", "");
                    }
                  }}
                >
                  Clear
                </Button>
              </div>
              {activeMode === "image" ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Image</p>
                <Input
                  value={value.image.src}
                  onChange={(event) => {
                    onUpdateImageSlot(activeSlot.slotId, event.target.value, value.image.alt);
                  }}
                  className="h-9 text-sm"
                  aria-label={`Canvas Slot Editor ${activeSlot.label} Image URL`}
                />
                <Input
                  value={value.image.alt}
                  onChange={(event) => {
                    onUpdateImageSlot(activeSlot.slotId, value.image.src, event.target.value);
                  }}
                  className="h-9 text-sm"
                  aria-label={`Canvas Slot Editor ${activeSlot.label} Image Alt`}
                />
                {imageSuggestions.length > 0 ? (
                  <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {imageSuggestions.map((asset) => (
                      <button
                        key={`media-image-${asset.id}`}
                        type="button"
                        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition hover:border-sky-400 hover:bg-sky-50"
                        aria-label={`Use image asset ${asset.title} for ${activeSlot.label}`}
                        onClick={() => onPickImageAsset?.(activeSlot.slotId, asset)}
                      >
                        {asset.thumbnailUrl ? (
                        <AuthenticatedMediaImage src={asset.thumbnailUrl} alt={asset.title} className="h-14 w-full object-cover" draggable={false} />
                        ) : (
                          <div className="grid h-14 w-full place-items-center bg-slate-200 text-[11px] text-slate-500">No preview</div>
                        )}
                        <div className="px-2 py-1">
                          <p className="truncate text-[11px] font-medium text-slate-800">{asset.title}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              ) : null}
              {activeMode === "video" ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Video</p>
                <Input
                  value={value.video.src}
                  onChange={(event) => {
                    onUpdateVideoSlot(activeSlot.slotId, event.target.value, value.video.poster, value.video.title);
                  }}
                  className="h-9 text-sm"
                  aria-label={`Canvas Slot Editor ${activeSlot.label} Video URL`}
                />
                <Input
                  value={value.video.poster}
                  onChange={(event) => {
                    onUpdateVideoSlot(activeSlot.slotId, value.video.src, event.target.value, value.video.title);
                  }}
                  className="h-9 text-sm"
                  aria-label={`Canvas Slot Editor ${activeSlot.label} Poster`}
                />
                <Input
                  value={value.video.title}
                  onChange={(event) => {
                    onUpdateVideoSlot(activeSlot.slotId, value.video.src, value.video.poster, event.target.value);
                  }}
                  className="h-9 text-sm"
                  aria-label={`Canvas Slot Editor ${activeSlot.label} Video Title`}
                />
                {videoSuggestions.length > 0 ? (
                  <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {videoSuggestions.map((asset) => (
                      <button
                        key={`media-video-${asset.id}`}
                        type="button"
                        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition hover:border-sky-400 hover:bg-sky-50"
                        aria-label={`Use video asset ${asset.title} for ${activeSlot.label}`}
                        onClick={() => onPickVideoAsset?.(activeSlot.slotId, asset)}
                      >
                        {asset.thumbnailUrl ? (
                        <AuthenticatedMediaImage src={asset.thumbnailUrl} alt={asset.title} className="h-14 w-full object-cover" draggable={false} />
                        ) : (
                          <div className="grid h-14 w-full place-items-center bg-slate-200 text-[11px] text-slate-500">No preview</div>
                        )}
                        <div className="px-2 py-1">
                          <p className="truncate text-[11px] font-medium text-slate-800">{asset.title}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              ) : null}
            </div>
              );
            })()
          ) : null}

          {activeSlot.type === "video" ? (
            <div className="space-y-2">
              <Input
                value={getVideoSlotValue(component, activeSlot.slotId).src}
                onChange={(event) => {
                  const current = getVideoSlotValue(component, activeSlot.slotId);
                  onUpdateVideoSlot(activeSlot.slotId, event.target.value, current.poster, current.title);
                }}
                className="h-9 text-sm"
                aria-label={`Canvas Slot Editor ${activeSlot.label} URL`}
              />
              <Input
                value={getVideoSlotValue(component, activeSlot.slotId).poster}
                onChange={(event) => {
                  const current = getVideoSlotValue(component, activeSlot.slotId);
                  onUpdateVideoSlot(activeSlot.slotId, current.src, event.target.value, current.title);
                }}
                className="h-9 text-sm"
                aria-label={`Canvas Slot Editor ${activeSlot.label} Poster`}
              />
              <Input
                value={getVideoSlotValue(component, activeSlot.slotId).title}
                onChange={(event) => {
                  const current = getVideoSlotValue(component, activeSlot.slotId);
                  onUpdateVideoSlot(activeSlot.slotId, current.src, current.poster, event.target.value);
                }}
                className="h-9 text-sm"
                aria-label={`Canvas Slot Editor ${activeSlot.label} Title`}
              />
              {videoSuggestions.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Pick From Library
                  </p>
                  <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {videoSuggestions.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition hover:border-sky-400 hover:bg-sky-50"
                        aria-label={`Use video asset ${asset.title} for ${activeSlot.label}`}
                        onClick={() => onPickVideoAsset?.(activeSlot.slotId, asset)}
                      >
                        {asset.thumbnailUrl ? (
                          <AuthenticatedMediaImage
                            src={asset.thumbnailUrl}
                            alt={asset.title}
                            className="h-16 w-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="grid h-16 w-full place-items-center bg-slate-200 text-[11px] text-slate-500">
                            No preview
                          </div>
                        )}
                        <div className="px-2 py-1.5">
                          <p className="truncate text-[11px] font-medium text-slate-800">{asset.title}</p>
                          <p className="text-[10px] text-slate-500">{asset.sourceType ?? "library"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeSlot.type === "list" ? (
            <Textarea
              value={getListSlotValue(component, activeSlot.slotId).join("\n")}
              onChange={(event) => onUpdateListSlot(
                activeSlot.slotId,
                event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
              )}
              className="min-h-[112px] text-sm"
              aria-label={`Canvas Slot Editor ${activeSlot.label}`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
