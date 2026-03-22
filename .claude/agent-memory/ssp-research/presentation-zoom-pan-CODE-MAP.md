---
name: Presentation Editor Zoom & Pan Code Map
description: Indexed code locations, line ranges, and entry points for all zoom/pan functionality
type: reference
---

# Presentation Editor Zoom & Pan Code Map

## File Index

### PresentationEditor.tsx
- **Zoom constants (desktop)**: Lines 260–262
  - `MIN_DESKTOP_ZOOM`, `MAX_DESKTOP_ZOOM`, `DESKTOP_ZOOM_STEP`
- **Viewport state (desktop)**: Lines 2524–2528
  - `const [desktopViewport, setDesktopViewport] = useState(...)`
- **Zoom update handler**: Lines 4489–4496
  - `function updateDesktopZoom(nextScale: number)`
- **Viewport change handlers**: Lines 4498–4504
  - `handleDesktopViewportChange()`, `handleMobileViewportChange()`
- **Zoom button handlers**: Lines 4520–4535
  - `handleFitMobileViewport()`, `handleCenterMobileViewport()`, `handleResetMobileViewport()`
- **Keyboard zoom shortcuts**: Lines 7199–7208
  - Ctrl/Cmd+Plus (zoom in), Ctrl/Cmd+Minus (zoom out)
- **Zoom toolbar UI**: Lines 8356–8383
  - Zoom Out button, Zoom % display, Zoom In button
- **CanvasStage integration**: Lines 9688–9690
  - Pass viewport and onViewportChange to CanvasStage
- **AI preview zoom**: Lines 9942
  - `<div style={{ zoom: aiPreviewZoom, ... }}>`

### CanvasStage.tsx
- **Zoom constants (stage)**: Lines 83–85
  - `MIN_STAGE_ZOOM`, `MAX_STAGE_ZOOM`, `STAGE_ZOOM_STEP`
- **Component props**: Lines 125–156
  - `CanvasStageProps` interface with viewport and onViewportChange
- **Viewport props extracted**: Lines 139–147
  - `viewport: { scale, offsetX, offsetY }`, `onViewportChange`
- **Canvas size fitting**: Lines 194–213
  - `fittedStageSize` useMemo, `baseScaleX/Y`, `baseRenderScale`, `interactionScale`
- **Viewport refs and state**: Lines 157–180
  - `viewportStateRef`, `panStateRef`, `marqueeStateRef`, `touchGestureRef`
- **Viewport clamping function**: Lines 256–268
  - `clampViewportOffsets(scale, nextOffsetX, nextOffsetY)`
- **Center offsets function**: Lines 270–274
  - `centerOffsetsForScale(scale)`
- **Viewport offset validation effect**: Lines 276–289
  - Auto-clamp if offsets exceed bounds
- **Pan/marquee/touch event setup**: Lines 291–383
  - Global pointer and touch event listeners
- **Asset parsing**: Lines 385–409
  - `parseDroppedAsset(raw)`
- **Coordinate conversion**: Lines 411–424
  - `toCanvasCoordinates(container, clientX, clientY)`
- **Drag handlers**: Lines 426–488
  - `handleDragEnter/Over/Leave/Drop`
- **Pan pointer down**: Lines 490–550
  - `handlePanPointerDown(event)` — starts pan when middle/right-click or Alt+left-drag
- **Pan pointer move (in window listener)**: Lines 316–355
  - Updates viewport offsets during pan drag
- **Marquee selection (in window listener)**: Lines 321–339
  - Handles drag-to-select empty area
- **Pointer up (in window listener)**: Lines 357–370
  - Ends pan or marquee selection
- **Touch gesture metrics**: Lines 558–576
  - `readTouchGestureMetrics(target, touches)` — calculates pinch distance and midpoint
- **Touch start**: Lines 578–595
  - `handleCanvasTouchStart(event)` — captures pinch gesture start
- **Touch move**: Lines 597–633
  - `handleCanvasTouchMove(event)` — handles pinch zoom with anchor point
- **Touch end**: Lines 635–639
  - `handleCanvasTouchEnd()` — clears gesture state
- **Wheel zoom**: Lines 641–669
  - `handleCanvasWheel(event)` — scroll to zoom with pointer-centric pan
- **Fit viewport**: Lines 671–680
  - `handleFitViewport()` — reset to scale=1, offset=(0,0)
- **Center viewport**: Lines 682–692
  - `handleCenterViewport()` — center at current zoom
- **Component JSX**: Lines 694–907
  - Full render tree with viewport display, buttons, canvas element, transform
- **Canvas stage toolbar (viewport info)**: Lines 696–732
  - Displays scale%, canvas size, Fit/Center buttons
- **Viewport container**: Lines 734–751
  - `workspaceViewportRef`, ResizeObserver, flex centering
- **Pan surface (THE TRANSFORMED ELEMENT)**: Lines 792–800
  - **KEY LINE**: `transform: translate(${offsetX}px, ${offsetY}px) scale(${baseRenderScale * effectiveScale})`
  - **KEY LINE**: `className="... origin-top-left"`
- **Context menu handler**: Lines 552–556
  - Prevents context menu when zoom > 1
- **CanvasObjects integration**: Lines 801–824
  - Pass interactionScale and other props
- **Marquee overlay**: Lines 826–837
  - Renders selection rectangle during drag
- **Snap guides**: Lines 846–867
  - Renders alignment guides with scaled positions
- **Pan hint text**: Lines 899–903
  - Shows only when zoom > 1
- **Transform dock**: Lines 871–895
  - Right-side panel with element transform controls

### constants.ts
- **Canvas preset interface**: Lines 1–6
  - `PresentationCanvasPreset` with id, label, width, height
- **Canvas size interface**: Lines 8–12
  - `PresentationCanvasSize` with preset, width, height
- **Canvas preset IDs type**: Lines 14–21
  - `PresentationCanvasPresetId` union type
- **Canvas presets definition**: Lines 23–31
  - 7 presets: 9:16, 16:9, 4:3, 3:4, 4:5, 5:4, 1:1
- **Default preset**: Line 33
  - `DEFAULT_PRESENTATION_CANVAS_PRESET` (9:16)
- **Helper functions**: Lines 42–91
  - `getCanvasPresetById()`, `getCanvasPresetBySize()`, `normalizeCanvasSize()`

### CanvasObjects.tsx
- **Media transform builder**: Lines 56–72
  - `buildMediaTransformStyle(baseZoom, positionX, positionY, mediaMotion, timing)`
  - Returns CSS `transform` with motion frame scaling
- **Image/video zoom properties**: Lines 74–110
  - `resolveImageRenderProps()`, `resolveVideoRenderProps()`
  - Extract zoom, fit, position from element

---

## Control Flow Maps

### Desktop Zoom Control Flow

```
User clicks Zoom In button (PresentationEditor.tsx:8379)
  ↓
onClick → updateDesktopZoom(desktopViewport.scale + DESKTOP_ZOOM_STEP)
  ↓
updateDesktopZoom() [4489–4496]
  ├─ Clamp nextScale to [MIN_DESKTOP_ZOOM, MAX_DESKTOP_ZOOM]
  ├─ If scale ≤ 1: offsetX = 0, offsetY = 0 (reset pan)
  └─ setDesktopViewport({ scale, offsetX, offsetY })
  ↓
React state update triggers re-render
  ↓
CanvasStage receives new viewport prop
  ↓
effectiveScale recalculated = baseRenderScale * scale
  ↓
transform: translate(${offsetX}px, ${offsetY}px) scale(${interactionScale}) updated
  ↓
CSS applies transformation, canvas resizes on screen
```

### Scroll-to-Zoom Control Flow

```
User scrolls mouse wheel over canvas (CanvasStage.tsx:753)
  ↓
onWheel event fires → handleCanvasWheel() [641–669]
  ├─ Calculate zoom direction from event.deltaY
  ├─ Clamp nextScale to [MIN_STAGE_ZOOM, MAX_STAGE_ZOOM]
  ├─ Calculate pointer position in canvas coordinates:
  │  canvasX = (pointerX - offsetX) / scale
  │  canvasY = (pointerY - offsetY) / scale
  ├─ Calculate new offsets to keep pointer point fixed:
  │  nextOffsetX = pointerX - (canvasX * nextScale)
  │  nextOffsetY = pointerY - (canvasY * nextScale)
  ├─ Clamp offsets: clampViewportOffsets(nextScale, nextOffsetX, nextOffsetY)
  └─ onViewportChange({ scale: nextScale, offsetX, offsetY })
  ↓
handleDesktopViewportChange() [4498–4500]
  └─ setDesktopViewport(nextViewport)
  ↓
(same as above: state update → re-render → transform applied)
```

### Pan Control Flow

```
User pointer down (PresentationEditor.tsx:781 or CanvasStage:751)
  ↓
onPointerDown → handlePanPointerDown() [490–550]
  ├─ Check: isMiddleButton OR isRightButton OR (isLeftButton AND altKey)
  ├─ Check: activeViewport.scale > 1 (pan only when zoomed)
  ├─ Check: !clickedCanvasObject (not clicking element)
  ├─ Create panStateRef with pointerId, startClientX, startClientY, startOffsetX, startOffsetY
  └─ event.currentTarget.setPointerCapture(pointerId)
  ↓
User moves pointer while captured
  ↓
Window pointermove event → handlePointerMove() [316–355]
  ├─ Calculate delta: totalDx = event.clientX - startClientX
  ├─ Calculate next offsets: startOffsetX + totalDx, startOffsetY + totalDy
  ├─ Clamp: clampViewportOffsets(scale, nextOffsetX, nextOffsetY)
  └─ onViewportChange({ scale, offsetX: clamped.offsetX, offsetY: clamped.offsetY })
  ↓
(continuous updates as user drags)
  ↓
User releases pointer
  ↓
Window pointerup event → handlePointerUp() [357–370]
  ├─ clearPanState(event.pointerId)
  └─ event.currentTarget.releasePointerCapture()
  ↓
panStateRef.current = null (pan ends)
```

### Touch Pinch-to-Zoom Control Flow

```
User touches with 2+ fingers (CanvasStage.tsx:782)
  ↓
onTouchStart → handleCanvasTouchStart() [578–595]
  ├─ Check: touches.length >= 2
  ├─ readTouchGestureMetrics(): get distance and midpoint
  └─ touchGestureRef.current = { startDistance, startMidX, startMidY, startScale, startOffsetX, startOffsetY }
  ↓
User moves fingers (pinch or apart)
  ↓
onTouchMove → handleCanvasTouchMove() [597–633]
  ├─ readTouchGestureMetrics(): get current distance and midpoint
  ├─ Calculate nextScale = startScale * (currentDistance / startDistance)
  ├─ Clamp nextScale to [MIN_STAGE_ZOOM, MAX_STAGE_ZOOM]
  ├─ Calculate anchor point (canvas coords at midpoint):
  │  anchorCanvasX = (startMidX - startOffsetX) / startScale
  │  anchorCanvasY = (startMidY - startOffsetY) / startScale
  ├─ Calculate new offsets (keep anchor at same screen position):
  │  nextOffsetX = currentMidX - (anchorCanvasX * nextScale)
  │  nextOffsetY = currentMidY - (anchorCanvasY * nextScale)
  ├─ Clamp: clampViewportOffsets(nextScale, nextOffsetX, nextOffsetY)
  └─ onViewportChange({ scale: nextScale, offsetX, offsetY })
  ↓
(continuous updates as user pinches)
  ↓
User releases both fingers
  ↓
onTouchEnd → handleCanvasTouchEnd() [635–639]
  └─ touchGestureRef.current = null (gesture ends)
```

---

## Key Code Snippets

### Viewport Clamping
```typescript
// CanvasStage.tsx:256–268
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

### Canvas Transform
```typescript
// CanvasStage.tsx:792–800
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

### Zoom Update (Desktop)
```typescript
// PresentationEditor.tsx:4489–4496
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

### Pointer-Centric Zoom (Wheel)
```typescript
// CanvasStage.tsx:641–669 (simplified)
function handleCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
  const direction = event.deltaY < 0 ? 1 : -1;
  const nextScale = clamp(viewport.scale + direction * STAGE_ZOOM_STEP);

  // Keep cursor point fixed on screen
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const canvasX = (pointerX - viewport.offsetX) / viewport.scale;
  const canvasY = (pointerY - viewport.offsetY) / viewport.scale;

  const nextOffsetX = pointerX - (canvasX * nextScale);
  const nextOffsetY = pointerY - (canvasY * nextScale);

  const clamped = clampViewportOffsets(nextScale, nextOffsetX, nextOffsetY);
  onViewportChange({ scale: nextScale, offsetX: clamped.offsetX, offsetY: clamped.offsetY });
}
```

### Coordinate Conversion (Screen → Canvas)
```typescript
// CanvasStage.tsx:411–424
function toCanvasCoordinates(container: HTMLDivElement, clientX: number, clientY: number) {
  const { interactionScale, offsetX, offsetY } = viewportStateRef.current;
  const rect = container.getBoundingClientRect();

  const x = (clientX - rect.left - offsetX) / interactionScale;
  const y = (clientY - rect.top - offsetY) / interactionScale;

  return {
    x: Math.max(0, Math.min(canvasWidth, x)),
    y: Math.max(0, Math.min(canvasHeight, y)),
  };
}
```

---

## Search Commands

Use these grep patterns to find related code:

```bash
# Find all zoom-related code
grep -n "zoom\|scale\|ZOOM\|SCALE" PresentationEditor.tsx | head -20

# Find viewport references
grep -n "viewport" CanvasStage.tsx | head -20

# Find transform-related code
grep -n "transform\|origin\|translate\|scale(" CanvasStage.tsx | head -20

# Find pan-related code
grep -n "pan\|offset" CanvasStage.tsx | head -20

# Find touch-related code
grep -n "touch\|gesture\|pinch" CanvasStage.tsx | head -20

# Find wheel-related code
grep -n "wheel\|scroll" CanvasStage.tsx | head -20
```

---

## Quick Navigation

**To understand zoom**: Start at `PresentationEditor.tsx:4489` (updateDesktopZoom)
**To understand pan**: Start at `CanvasStage.tsx:490` (handlePanPointerDown)
**To understand transforms**: Start at `CanvasStage.tsx:792` (canvas-stage-pan-surface div)
**To understand constraints**: Start at `CanvasStage.tsx:256` (clampViewportOffsets)
**To understand touch**: Start at `CanvasStage.tsx:578` (handleCanvasTouchStart)
**To understand wheel zoom**: Start at `CanvasStage.tsx:641` (handleCanvasWheel)

