---
name: Presentation Editor Zoom & Pan Implementation Research
description: Complete analysis of how zoom, pan, and canvas viewport are implemented in the Presentation Editor
type: reference
---

# Presentation Editor: Zoom & Pan Implementation Analysis

## Executive Summary

The Presentation Editor uses a sophisticated viewport system with:
- **Canvas dimensions** defined by 7 preset aspect ratios (9:16, 16:9, 4:3, 3:4, 4:5, 5:4, 1:1)
- **Zoom range** 0.5x to 2.0x (desktop), with 0.1x step increments
- **Transform origin** set to `origin-top-left` — canvas scales/pans from top-left corner
- **Dual scaling system**: base render scale (fit-to-viewport) + zoom multiplier
- **Pan functionality** via middle-mouse, right-mouse, or Alt+left-drag (only when zoomed > 1x)
- **Touch gestures** for pinch-to-zoom and two-finger pan on mobile
- **Viewport clamping** prevents overscrolling when zoomed

---

## 1. Canvas Dimensions & Aspect Ratios

### Preset Definitions
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/constants.ts:23-31`

```typescript
export const PRESENTATION_CANVAS_PRESETS: PresentationCanvasPreset[] = [
  { id: "9:16", label: "9:16", width: 720, height: 1280 },
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "4:3", label: "4:3", width: 1024, height: 768 },
  { id: "3:4", label: "3:4", width: 768, height: 1024 },
  { id: "4:5", label: "4:5", width: 960, height: 1200 },
  { id: "5:4", label: "5:4", width: 1250, height: 1000 },
  { id: "1:1", label: "1:1", width: 1080, height: 1080 },
];
```

Default preset: **9:16** (720x1280)

### Canvas Size Type
```typescript
export interface PresentationCanvasSize {
  preset: PresentationCanvasPresetId;  // "9:16" | "16:9" | "4:3" | etc.
  width: number;
  height: number;
}
```

---

## 2. Zoom Implementation (Desktop)

### Zoom State Management
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:2524-2528`

```typescript
const [desktopViewport, setDesktopViewport] = useState({
  scale: 1,      // Zoom multiplier (0.5 to 2.0)
  offsetX: 0,    // Pan offset in pixels
  offsetY: 0,    // Pan offset in pixels
});
```

### Zoom Constants
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:260-262`

```typescript
const MIN_DESKTOP_ZOOM = 0.5;
const MAX_DESKTOP_ZOOM = 2;
const DESKTOP_ZOOM_STEP = 0.1;
```

### Zoom Control UI
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:8356-8383`

Zoom buttons in the toolbar:
- **Zoom Out** button: `updateDesktopZoom(desktopViewport.scale - DESKTOP_ZOOM_STEP)`
- **Zoom % display**: Click to reset to 100% (`updateDesktopZoom(1)`)
- **Zoom In** button: `updateDesktopZoom(desktopViewport.scale + DESKTOP_ZOOM_STEP)`

### Zoom Update Handler
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:4489-4496`

```typescript
function updateDesktopZoom(nextScale: number) {
  const normalizedScale = Math.min(
    MAX_DESKTOP_ZOOM,
    Math.max(MIN_DESKTOP_ZOOM, Number(nextScale.toFixed(2))),
  );
  setDesktopViewport((previous) => ({
    scale: normalizedScale,
    offsetX: normalizedScale <= 1 ? 0 : previous.offsetX,
    offsetY: normalizedScale <= 1 ? 0 : previous.offsetY,
  }));
}
```

**Key behavior**: When zoom returns to 1.0 or below, pan offsets reset to (0, 0).

### Keyboard Zoom Shortcuts
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:7199-7205`

```typescript
// Ctrl/Cmd + (Plus or =)
if (isPrimaryModifier && (key === "=" || key === "+" || code === "Equal" || code === "NumpadAdd")) {
  event.preventDefault();
  updateDesktopZoom(desktopViewport.scale + DESKTOP_ZOOM_STEP);
  return;
}

// Ctrl/Cmd + (Minus)
if (isPrimaryModifier && (key === "-" || code === "Minus" || code === "NumpadSubtract")) {
  event.preventDefault();
  updateDesktopZoom(desktopViewport.scale - DESKTOP_ZOOM_STEP);
  return;
}
```

---

## 3. Canvas Rendering & Transform Origin

### Canvas Size Calculation
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:194-213`

The canvas is scaled to fit within the viewport while maintaining aspect ratio:

```typescript
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
```

**Scale hierarchy**:
1. **baseRenderScale**: Scales the canvas to fit within the available viewport space (contains aspect ratio)
2. **effectiveScale**: The user-controlled zoom multiplier (1.0 = 100%, 0.5 = 50%, etc.)
3. **interactionScale**: Combined scale used for interaction calculations: `baseRenderScale * effectiveScale`

### Transform Application
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:792-800`

```typescript
<div
  data-testid="canvas-stage-pan-surface"
  className="relative h-full w-full origin-top-left"
  style={{
    width: `${canvasWidth}px`,
    height: `${canvasHeight}px`,
    transform: `translate(${offsetX}px, ${offsetY}px) scale(${baseRenderScale * effectiveScale})`,
  }}
>
```

**Critical details**:
- **className** includes `origin-top-left` (Tailwind CSS, equivalent to `transform-origin: top left`)
- **transform** applies: **translate first, then scale** (this is the order in CSS transform)
- The canvas element's own dimensions are set to `canvasWidth x canvasHeight` (e.g., 720x1280)
- The `scale()` is applied after translation, so the translation is in the unscaled coordinate system

### Viewport Container
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:734-751`

```typescript
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
            ...
          }}
        >
          {/* ... zoom/pan applied inside here ... */}
        </div>
      </div>
```

The canvas is **centered** within a flex container, and the pan surface is rendered with `overflow-hidden` clipping.

---

## 4. Pan Implementation (Desktop)

### Pan Constants
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:83-85`

```typescript
const MIN_STAGE_ZOOM = 0.5;
const MAX_STAGE_ZOOM = 2;
const STAGE_ZOOM_STEP = 0.1;
```

### Pan Activation
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:490-550`

Pan starts on pointer-down if:
- **Middle mouse button** is pressed, OR
- **Right mouse button** is pressed, OR
- **Left mouse button + Alt key** (modifier pan), AND
- **Viewport is zoomed > 1.0** (`activeViewport.scale > 1`)

```typescript
function handlePanPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
  const activeViewport = viewportStateRef.current.viewport;
  const activeViewportChange = viewportChangeRef.current;
  const isLeftButton = event.button === 0;
  const isMiddleButton = event.button === 1;
  const isRightButton = event.button === 2;
  const isModifierPan = isLeftButton && event.altKey;

  if (!activeViewport || !activeViewportChange || activeViewport.scale <= 1) {
    return;  // Pan only works when zoomed > 1
  }

  panStateRef.current = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startOffsetX: activeViewport.offsetX,
    startOffsetY: activeViewport.offsetY,
  };
  // ... pointer capture ...
}
```

### Pan Pointer Move
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:316-355`

```typescript
function handlePointerMove(event: PointerEvent) {
  const panState = panStateRef.current;
  const activeViewport = viewportStateRef.current.viewport;
  const activeViewportChange = viewportChangeRef.current;

  if (!panState || panState.pointerId !== event.pointerId || !activeViewport || !activeViewportChange) {
    return;
  }

  const totalDx = event.clientX - panState.startClientX;
  const totalDy = event.clientY - panState.startClientY;
  const clamped = clampViewportOffsets(
    activeViewport.scale,
    panState.startOffsetX + totalDx,
    panState.startOffsetY + totalDy,
  );
  activeViewportChange({
    scale: activeViewport.scale,
    offsetX: clamped.offsetX,
    offsetY: clamped.offsetY,
  });
}
```

### Pan Clamping (Bounds Limiting)
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:256-268`

```typescript
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
```

**Logic**:
- When scale ≤ 1: Offsets forced to (0, 0) — no pan possible
- When scale > 1: Offsets clamped between `minOffset` (negative, allows seeing right/bottom) and `0` (allows seeing left/top)
- **Example**: If scale=2 and fittedStageSize.width=400, then minOffsetX = 400 - 800 = -400, so offsetX ∈ [-400, 0]

### Pan Cursor Feedback
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:780`

```typescript
className={`absolute inset-0 touch-none ${effectiveScale > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
```

Cursor changes to `grab`/`grabbing` only when zoomed > 1.

### Pan Hint Text
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:899-903`

```typescript
{effectiveScale > 1 ? (
  <p className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
    Scroll to zoom. Pan: Alt+drag or right/middle-mouse drag. Select: drag empty area. Shift adds to selection.
  </p>
) : null}
```

Hint only shows when zoomed > 1.

---

## 5. Wheel Zoom (Scroll to Zoom)

### Handler
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:641-669`

```typescript
function handleCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
  if (!viewport || !onViewportChange) {
    return;
  }

  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;  // Scroll up = zoom in
  const nextScale = Math.min(
    MAX_STAGE_ZOOM,
    Math.max(MIN_STAGE_ZOOM, Number((viewport.scale + (direction * STAGE_ZOOM_STEP)).toFixed(2))),
  );
  if (nextScale === viewport.scale) {
    return;
  }

  // Calculate the point under the cursor (before zoom)
  const rect = event.currentTarget.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const canvasX = (pointerX - viewport.offsetX) / viewport.scale;
  const canvasY = (pointerY - viewport.offsetY) / viewport.scale;

  // Apply new zoom, keeping the cursor point at the same screen position
  const nextOffsetX = pointerX - (canvasX * nextScale);
  const nextOffsetY = pointerY - (canvasY * nextScale);
  const clamped = clampViewportOffsets(nextScale, nextOffsetX, nextOffsetY);

  onViewportChange({
    scale: nextScale,
    offsetX: clamped.offsetX,
    offsetY: clamped.offsetY,
  });
}
```

**Key behavior**: Zoom is **pointer-centric** — the point under the cursor stays fixed on screen as you zoom.

---

## 6. Touch Gestures (Mobile)

### Pinch-to-Zoom
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:578-633`

```typescript
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
  // ... check for 2 touches ...
  const gesture = touchGestureRef.current;
  const metrics = readTouchGestureMetrics(event.currentTarget, Array.from(event.touches));

  const nextScale = Math.min(
    MAX_STAGE_ZOOM,
    Math.max(
      MIN_STAGE_ZOOM,
      Number(((gesture.startScale * metrics.distance) / gesture.startDistance).toFixed(3)),
    ),
  );

  // Keep anchor point fixed (same as wheel zoom)
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
```

### Touch Pan
Two-finger touch move performs pan when gesture is active (scale > 1).

---

## 7. Viewport Change Handlers

### Desktop
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:4498-4500`

```typescript
function handleDesktopViewportChange(nextViewport: { scale: number; offsetX: number; offsetY: number }) {
  setDesktopViewport(nextViewport);
}
```

### Mobile
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:4502-4504`

```typescript
function handleMobileViewportChange(nextViewport: { scale: number; offsetX: number; offsetY: number }) {
  mobileGestures.setViewport(nextViewport);
}
```

### Passed to CanvasStage
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:9688-9690`

```typescript
viewport={activeViewport}
onViewportChange={isMobileViewport ? handleMobileViewportChange : handleDesktopViewportChange}
showViewportControls={!isMobileViewport}
```

---

## 8. Fit & Center Buttons

### Fit Viewport
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:671-680`

```typescript
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
```

Button shown at `CanvasStage.tsx:709-718`.

### Center Viewport
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:682-692`

```typescript
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

function centerOffsetsForScale(scale: number) {
  const centeredOffsetX = (fittedStageSize.width - (fittedStageSize.width * scale)) / 2;
  const centeredOffsetY = (fittedStageSize.height - (fittedStageSize.height * scale)) / 2;
  return clampViewportOffsets(scale, centeredOffsetX, centeredOffsetY);
}
```

Centers the canvas horizontally and vertically while keeping the same zoom level. Button disabled when scale ≤ 1.

---

## 9. Coordinate System & Interaction Scale

### Canvas Coordinates Conversion
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasStage.tsx:411-424`

```typescript
function toCanvasCoordinates(
  container: HTMLDivElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const { interactionScale: nextInteractionScale, offsetX: nextOffsetX, offsetY: nextOffsetY } = viewportStateRef.current;
  const rect = container.getBoundingClientRect();
  const x = (clientX - rect.left - nextOffsetX) / nextInteractionScale;
  const y = (clientY - rect.top - nextOffsetY) / nextInteractionScale;
  return {
    x: Math.max(0, Math.min(canvasWidth, x)),
    y: Math.max(0, Math.min(canvasHeight, y)),
  };
}
```

Converts from screen coordinates to canvas coordinates:
1. Subtract container rect offset (left, top)
2. Subtract pan offset
3. Divide by interaction scale (which includes both base render scale and zoom)
4. Clamp to canvas bounds (0 to canvasWidth/canvasHeight)

### Interaction Scale Used in CanvasObjects
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:9709-9711`

```typescript
interactionScale={interactionScale}
```

Passed to CanvasObjects for scaling cursors, handles, and other interactive elements.

---

## 10. AI Preview Zoom (Dialog)

### AI Layout Preview Modal
File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx:9918-9944`

```typescript
<button
  type="button"
  className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
  onClick={() => { setAiPreviewZoom(1); setAiPreviewPan({ x: 0, y: 0 }); }}
  aria-label="Reset preview zoom"
>
  Reset
</button>
<span className="ml-auto text-[10px] text-slate-400">Scroll to zoom, drag to pan</span>

<div
  className="flex min-h-full w-full items-center justify-center p-4"
>
  <div style={{ zoom: aiPreviewZoom, flexShrink: 0 }}>
    {renderAILayoutPreview("dialog")}
  </div>
</div>
```

Uses CSS `zoom` property directly on a div (different from the canvas transform approach).

---

## 11. Component Hierarchy

```
CanvasShell
└── canvasStage (passed as ReactNode prop)
    └── CanvasStage (component)
        ├── Toolbar (viewport display + Fit/Center buttons)
        ├── workspaceViewportRef (ResizeObserver-tracked)
        │   ├── Pan-enabled container
        │   └── canvas-stage-pan-surface (THE SCALED ELEMENT)
        │       ├── transform: translate(offsetX, offsetY) scale(baseRenderScale * effectiveScale)
        │       ├── origin-top-left
        │       ├── CanvasObjects (renders elements, shapes, selection handles)
        │       ├── Marquee selection rectangle
        │       ├── Drag-over indicator
        │       └── Snap guides
        ├── Transform Dock (right side, shows element props)
        └── Pan hint text (only when zoom > 1)
```

---

## 12. Why Canvas Sticks to Top-Left During Zoom

The `origin-top-left` CSS class (equivalent to `transform-origin: top left`) means:
- **When scale increases**: The canvas grows downward and to the right from the (0, 0) point
- **Top-left corner stays at the origin** unless pan offsets are applied
- **After pan**: The pan offsets position the scaled canvas, but the scaling still happens from top-left

This is why pan is needed when zoomed in — without pan, you can only see the top-left quadrant of the zoomed canvas.

---

## 13. Zoom Flow Diagram

```
User scrolls up (deltaY < 0)
    ↓
handleCanvasWheel() direction = 1
    ↓
nextScale = current + (1 * 0.1) = zoom in by 10%
    ↓
Calculate cursor point in canvas coordinates:
  canvasX = (pointerX - offsetX) / scale
  canvasY = (pointerY - offsetY) / scale
    ↓
Calculate new offsets to keep cursor point fixed:
  nextOffsetX = pointerX - (canvasX * nextScale)
  nextOffsetY = pointerY - (canvasY * nextScale)
    ↓
Clamp offsets to prevent over-panning:
  offsetX ∈ [minOffsetX, 0] where minOffsetX = width - (width * scale)
  offsetY ∈ [minOffsetY, 0] where minOffsetY = height - (height * scale)
    ↓
Call onViewportChange({ scale: nextScale, offsetX, offsetY })
    ↓
Update React state (desktopViewport or mobileGestures.state.viewport)
    ↓
Re-render with new transform:
  style={{ transform: `translate(${offsetX}px, ${offsetY}px) scale(${baseRenderScale * effectiveScale})` }}
```

---

## 14. Key Files & Line Numbers

| Purpose | File | Lines |
|---------|------|-------|
| **Zoom constants (desktop)** | PresentationEditor.tsx | 260–262 |
| **Viewport state (desktop)** | PresentationEditor.tsx | 2524–2528 |
| **Zoom control UI** | PresentationEditor.tsx | 8356–8383 |
| **Zoom update handler** | PresentationEditor.tsx | 4489–4496 |
| **Keyboard zoom shortcuts** | PresentationEditor.tsx | 7199–7205 |
| **Canvas aspect ratios** | constants.ts | 23–31 |
| **Zoom/pan constants (stage)** | CanvasStage.tsx | 83–85 |
| **Canvas size fitting** | CanvasStage.tsx | 194–213 |
| **Wheel zoom handler** | CanvasStage.tsx | 641–669 |
| **Pan pointer down** | CanvasStage.tsx | 490–550 |
| **Pan pointer move** | CanvasStage.tsx | 316–355 |
| **Pan clamp function** | CanvasStage.tsx | 256–268 |
| **Fit viewport button** | CanvasStage.tsx | 671–680, 709–718 |
| **Center viewport button** | CanvasStage.tsx | 682–692, 719–729 |
| **Transform origin (pan surface)** | CanvasStage.tsx | 792–800 |
| **Touch pinch-to-zoom** | CanvasStage.tsx | 578–633 |
| **Coordinate conversion** | CanvasStage.tsx | 411–424 |
| **Pan hint text** | CanvasStage.tsx | 899–903 |
| **Viewport passed to CanvasStage** | PresentationEditor.tsx | 9688–9690 |
| **Viewport state in CanvasStage** | CanvasStage.tsx | 139–147 (props) |

---

## 15. Open Questions / Edge Cases

1. **Why is baseRenderScale calculated separately?**
   - Answer: To ensure the canvas always fits in the viewport at scale=1 (100%), accounting for different aspect ratios. The baseRenderScale is the "fit to viewport" scale, then effectiveScale (user zoom) is multiplied on top.

2. **What happens if pan offsets are clamped?**
   - The clamping prevents users from panning beyond the edges. If they try to pan too far, the offset stops at the limit (either minOffset or 0).

3. **Can the canvas be zoomed out further than 0.5?**
   - No, MIN_STAGE_ZOOM = 0.5 is the hard limit. Even wheel zoom respects this.

4. **Does aspect ratio affect the pan limits?**
   - Yes, because fittedStageSize is calculated to maintain aspect ratio. A 1:1 canvas will have different pan limits than a 9:16 canvas in the same viewport.

5. **What's the difference between baseRenderScale and interactionScale?**
   - **baseRenderScale**: How much to scale the canvas (in pixels) to fit it in the viewport
   - **interactionScale**: baseRenderScale * effectiveScale; used for converting screen coordinates to canvas coordinates for interaction (clicking, dragging, etc.)

---

## 16. CSS Transforms & Rendering Order

The transform `translate(${offsetX}px, ${offsetY}px) scale(${baseRenderScale * effectiveScale})` means:
1. **First**: Translate the canvas by (offsetX, offsetY) pixels
2. **Then**: Scale from the origin-top-left point

This is standard CSS transform order. The translation is applied in the coordinate system **before** the scale is applied.

**Visual example** (simplified):
```
scale=0.5, offsetX=0, offsetY=0:
- Canvas rendered at 50% of original size, starting at top-left

scale=0.5, offsetX=100, offsetY=0:
- Canvas translated 100px right, then scaled to 50%
- Top-left corner now at screen position (100, 0)

scale=2, offsetX=-400, offsetY=0:
- Canvas translated 400px to the left, then scaled 2x
- This reveals content that was off-screen to the left
```

---

## Summary Table: Zoom & Pan Controls

| Control | Action | Min/Max | Step | Condition |
|---------|--------|---------|------|-----------|
| **Zoom In button** | +0.1 scale | 0.5–2.0 | 0.1 | Always available |
| **Zoom Out button** | -0.1 scale | 0.5–2.0 | 0.1 | Always available |
| **Zoom % click** | Reset to 1.0 | — | — | Always available |
| **Ctrl/Cmd + Scroll** | ±0.1 scale | 0.5–2.0 | 0.1 | Desktop keyboard |
| **Scroll wheel** | ±0.1 scale | 0.5–2.0 | 0.1 | Always (pointer-centric) |
| **Alt + Left-drag** | Pan | — | — | Scale > 1 only |
| **Middle-click drag** | Pan | — | — | Scale > 1 only |
| **Right-click drag** | Pan | — | — | Scale > 1 only |
| **Two-finger pinch** | Scale with gesture distance | 0.5–2.0 | Dynamic | Mobile, scale > 1 |
| **Fit button** | scale=1, offsetX=0, offsetY=0 | — | — | Desktop only |
| **Center button** | Center at current scale | — | — | Desktop, scale > 1 only |

