---
name: Presentation Editor Zoom & Pan Quick Reference
description: Fast lookup for zoom/pan implementation details, code locations, and common operations
type: reference
---

# Presentation Editor Zoom & Pan — Quick Reference

## Canvas Presets (Aspect Ratios)

```typescript
// apps/web/client/src/presentation-canvas/constants.ts:23-31

"9:16"  → 720×1280
"16:9"  → 1280×720
"4:3"   → 1024×768
"3:4"   → 768×1024
"4:5"   → 960×1200
"5:4"   → 1250×1000
"1:1"   → 1080×1080
```

Default: **9:16**

---

## Zoom Constants & Limits

| Const | Value | File | Line |
|-------|-------|------|------|
| MIN_DESKTOP_ZOOM | 0.5 (50%) | PresentationEditor.tsx | 260 |
| MAX_DESKTOP_ZOOM | 2.0 (200%) | PresentationEditor.tsx | 261 |
| DESKTOP_ZOOM_STEP | 0.1 (10%) | PresentationEditor.tsx | 262 |
| MIN_STAGE_ZOOM | 0.5 | CanvasStage.tsx | 83 |
| MAX_STAGE_ZOOM | 2.0 | CanvasStage.tsx | 84 |
| STAGE_ZOOM_STEP | 0.1 | CanvasStage.tsx | 85 |

---

## Viewport State Shape

```typescript
interface Viewport {
  scale: number;      // 0.5 to 2.0 (zoom multiplier)
  offsetX: number;    // Pan in pixels (negative = left, positive = right)
  offsetY: number;    // Pan in pixels (negative = up, positive = down)
}
```

**Desktop location**: `PresentationEditor.tsx:2524-2528`

---

## Scale Calculation Hierarchy

```
baseRenderScale
  ↓ (canvas size fitting, maintains aspect ratio)

effectiveScale = baseRenderScale × viewport.scale
  ↓ (combined with user zoom)

interactionScale
  ↓ (used for mouse/touch coordinate conversion)
```

**Formula**:
```typescript
baseRenderScale = Math.min(
  fittedStageSize.width / canvasWidth,
  fittedStageSize.height / canvasHeight
);
interactionScale = baseRenderScale * effectiveScale;
```

**Location**: `CanvasStage.tsx:211-214`

---

## Transform Applied to Canvas

```typescript
style={{
  transform: `translate(${offsetX}px, ${offsetY}px) scale(${baseRenderScale * effectiveScale})`,
  // OR in shorthand:
  transform: `translate(${offsetX}px, ${offsetY}px) scale(${interactionScale})`,
}}
className="... origin-top-left"  // transform-origin: top left
```

**Location**: `CanvasStage.tsx:798`

**Key point**: Translate first, then scale from top-left corner.

---

## Pan Boundaries (Clamping)

```typescript
function clampViewportOffsets(scale: number, nextOffsetX: number, nextOffsetY: number) {
  if (scale <= 1) return { offsetX: 0, offsetY: 0 };

  const minOffsetX = fittedStageSize.width - (fittedStageSize.width * scale);
  const minOffsetY = fittedStageSize.height - (fittedStageSize.height * scale);

  return {
    offsetX: Math.max(minOffsetX, Math.min(0, nextOffsetX)),
    offsetY: Math.max(minOffsetY, Math.min(0, nextOffsetY)),
  };
}
```

**Range**: `[minOffset, 0]` where minOffset is negative (allows scrolling past right/bottom edges)

**Location**: `CanvasStage.tsx:256-268`

---

## Zoom Controls (Buttons)

| Button | Handler | File | Lines |
|--------|---------|------|-------|
| Zoom Out | `updateDesktopZoom(scale - 0.1)` | PresentationEditor.tsx | 8362 |
| Zoom % (click) | `updateDesktopZoom(1)` | PresentationEditor.tsx | 8370 |
| Zoom In | `updateDesktopZoom(scale + 0.1)` | PresentationEditor.tsx | 8379 |

**Handler**: `updateDesktopZoom()` at `PresentationEditor.tsx:4489-4496`

---

## Keyboard Shortcuts

| Shortcut | Action | File | Lines |
|----------|--------|------|-------|
| Ctrl/Cmd + Plus or = | Zoom in by 0.1 | PresentationEditor.tsx | 7199–7202 |
| Ctrl/Cmd + Minus | Zoom out by 0.1 | PresentationEditor.tsx | 7205–7208 |

---

## Pan Controls

| Method | Condition | Handler | Pan Enabled |
|--------|-----------|---------|-------------|
| **Middle-click drag** | Always available | `handlePanPointerDown()` | scale > 1 |
| **Right-click drag** | Always available | `handlePanPointerDown()` | scale > 1 |
| **Alt + Left-drag** | Always available | `handlePanPointerDown()` | scale > 1 |

**Handler**: `handlePanPointerDown()` at `CanvasStage.tsx:490-550`

**Pan feedback**: Cursor changes to `grab`/`grabbing` only when scale > 1

---

## Scroll-to-Zoom (Wheel)

```typescript
function handleCanvasWheel(event) {
  const direction = event.deltaY < 0 ? 1 : -1;  // Up = zoom in
  const nextScale = clamp(scale + direction * 0.1);

  // Calculate point under cursor
  const canvasX = (pointerX - offsetX) / scale;
  const canvasY = (pointerY - offsetY) / scale;

  // Zoom while keeping cursor point fixed on screen
  const nextOffsetX = pointerX - (canvasX * nextScale);
  const nextOffsetY = pointerY - (canvasY * nextScale);

  onViewportChange({ scale: nextScale, offsetX: nextOffsetX, offsetY: nextOffsetY });
}
```

**Location**: `CanvasStage.tsx:641-669`

**Key behavior**: Zoom is **pointer-centric** (cursor point stays under same screen position)

---

## Touch Gestures

### Pinch-to-Zoom
```typescript
// On touch start with 2+ fingers: record startDistance, startScale, midpoint
// On touch move: calculate new distance, scale proportionally
nextScale = startScale * (currentDistance / startDistance);
```

**Location**: `CanvasStage.tsx:578-633`

### Two-Finger Pan
Automatically works with pinch gesture when scale > 1.

---

## Fit & Center Buttons

### Fit Viewport (Reset)
```typescript
onViewportChange({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
});
```

**Location**: `CanvasStage.tsx:671-680` (handler), `709-718` (button)

### Center Viewport
```typescript
const centered = centerOffsetsForScale(viewport.scale);
onViewportChange({
  scale: viewport.scale,
  offsetX: centered.offsetX,
  offsetY: centered.offsetY,
});
```

**Location**: `CanvasStage.tsx:682-692` (handler), `719-729` (button)

**Button disabled when**: scale ≤ 1

---

## Coordinate Conversion (Screen → Canvas)

```typescript
function toCanvasCoordinates(container, clientX, clientY) {
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

**Location**: `CanvasStage.tsx:411-424`

**Use**: Converting mouse clicks to canvas coordinates for selection, element interaction, etc.

---

## Component Hierarchy

```
CanvasStage (receives viewport prop)
├── Toolbar (Fit, Center buttons + zoom display)
├── workspaceViewportRef (viewport container, ResizeObserver-tracked)
│   └── Pan-enabled div (effectiveScale > 1 → grab cursor)
│       └── canvas-stage-pan-surface (THE SCALED ELEMENT)
│           ├── style.transform: translate(offsetX, offsetY) scale(interactionScale)
│           ├── className: origin-top-left
│           └── CanvasObjects (all canvas content renders here)
├── TransformDock (right side, if showTransformDock=true)
└── Pan hint text (only shows when scale > 1)
```

---

## Viewport State Management (Desktop)

**State location**: `PresentationEditor.tsx:2524-2528`

```typescript
const [desktopViewport, setDesktopViewport] = useState({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
});

// Passed to CanvasStage
viewport={desktopViewport}
onViewportChange={handleDesktopViewportChange}
```

**Mobile uses**: `mobileGestures.state.viewport` (from useMobileGestures hook)

---

## When Pan Offsets Reset

Pan offsets `(offsetX, offsetY)` are reset to `(0, 0)` when:
1. User clicks Fit button
2. User applies AI layout override: `setDesktopViewport({ scale: 1, offsetX: 0, offsetY: 0 })`
3. Zoom level returns to ≤ 1.0: `if (normalizedScale <= 1) { offsetX = 0; offsetY = 0; }`

**Location** (reset in updateDesktopZoom): `PresentationEditor.tsx:4491-4495`

---

## Why Top-Left Sticks During Zoom

```
transform-origin: top left
└── Canvas scales from top-left corner (0, 0)
    └── Without pan offsets, you only see top-left quadrant when zoomed
        └── Pan offsets move the scaled canvas to reveal other areas
```

When scale > 1 and offsetX/offsetY are clamped to `[minOffset, 0]`:
- offsetX = 0 shows left edge
- offsetX = minOffset (negative) shows right edge
- Similar for offsetY and top/bottom edges

---

## Pan Hint Text

**Shown only when**: `effectiveScale > 1`

```typescript
"Scroll to zoom. Pan: Alt+drag or right/middle-mouse drag. Select: drag empty area. Shift adds to selection."
```

**Location**: `CanvasStage.tsx:899-903`

---

## AI Preview Zoom (Different Implementation)

```typescript
// Uses CSS zoom property directly (not transform)
<div style={{ zoom: aiPreviewZoom, flexShrink: 0 }}>
  {renderAILayoutPreview("dialog")}
</div>
```

**Location**: `PresentationEditor.tsx:9942`

**Note**: This is a separate zoom for preview-only, not used in main editor.

---

## Common Patterns

### Getting current zoom percentage for display
```typescript
{Math.round(desktopViewport.scale * 100)}%
```

### Checking if pan is possible
```typescript
if (effectiveScale > 1) {
  // Pan is available
}
```

### Clamping a new zoom value
```typescript
const normalized = Math.min(MAX_DESKTOP_ZOOM, Math.max(MIN_DESKTOP_ZOOM, nextScale));
```

### Centering the canvas
```typescript
const centered = centerOffsetsForScale(viewport.scale);
// Use centered.offsetX and centered.offsetY
```

---

## Edge Cases & Notes

1. **Pan only available when scale > 1**: Below 100% zoom, pan offsets are forced to (0, 0)
2. **Zoom is pointer-centric**: Wheel zoom keeps cursor point fixed on screen
3. **Pan is clamped**: Can't pan beyond canvas edges
4. **Aspect ratio affects fitted size**: Different aspect ratios have different baseRenderScale values
5. **Mobile and desktop use same viewport shape** but different state containers
6. **Transform order matters**: `translate()` then `scale()` is CSS standard and expected here

---

## Files Quick Map

| What | File |
|------|------|
| Desktop zoom state | PresentationEditor.tsx:2524–2528 |
| Zoom buttons + % display | PresentationEditor.tsx:8356–8383 |
| Zoom update handler | PresentationEditor.tsx:4489–4496 |
| Keyboard zoom shortcuts | PresentationEditor.tsx:7199–7208 |
| Canvas presets | constants.ts:23–31 |
| CanvasStage component | CanvasStage.tsx:125+ |
| Viewport props | CanvasStage.tsx:139–147 |
| Canvas size fitting | CanvasStage.tsx:194–213 |
| Wheel zoom handler | CanvasStage.tsx:641–669 |
| Pan handler start | CanvasStage.tsx:490–550 |
| Pan handler move | CanvasStage.tsx:316–355 |
| Pan clamping | CanvasStage.tsx:256–268 |
| Fit button handler | CanvasStage.tsx:671–680 |
| Center button handler | CanvasStage.tsx:682–692 |
| Transform application | CanvasStage.tsx:798 |
| Touch gestures | CanvasStage.tsx:558–639 |
| Coordinate conversion | CanvasStage.tsx:411–424 |
| Pan hint text | CanvasStage.tsx:899–903 |

