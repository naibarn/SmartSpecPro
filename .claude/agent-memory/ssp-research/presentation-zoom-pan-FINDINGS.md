---
name: Presentation Editor Zoom & Pan Research Findings
description: Executive summary of zoom/pan implementation research with key findings and implementation insights
type: reference
---

# Presentation Editor: Zoom & Pan Research Findings

## Overview

The Presentation Editor implements a sophisticated viewport system that allows users to zoom in/out (0.5x to 2.0x) and pan around the canvas when zoomed. The system carefully manages coordinate transformations, pan boundaries, and provides multiple input methods (buttons, keyboard, mouse, touch).

---

## Key Findings

### 1. Canvas Doesn't "Stick" to Top-Left — It's By Design

**Finding**: The canvas sticks to the top-left corner because the CSS `transform-origin: top-left` is explicitly set. When you zoom in, the canvas scales FROM the top-left point.

**Why**: This is intentional. When zoom = 1.0 (100%), the top-left corner should be at position (0, 0). As you zoom in, the canvas grows downward and rightward from that anchor.

**How pan solves this**: Pan offsets (`offsetX`, `offsetY`) move the SCALED canvas. When `offsetX = 0`, the left edge is visible. When `offsetX = -400` (negative), the right edge comes into view.

**CSS location**:
```css
/* CanvasStage.tsx:794 */
className="... origin-top-left"  /* Tailwind for transform-origin: top left */
```

---

### 2. Three Levels of Scaling Happen Simultaneously

**Finding**: The zoom system uses a **dual-scale architecture**:

1. **baseRenderScale** (fit-to-viewport): Scales the canvas to fit the available viewport space
   - Calculated in `CanvasStage.tsx:211-213`
   - Accounts for the canvas aspect ratio and available screen space
   - Formula: `Math.min(fittedWidth / canvasWidth, fittedHeight / canvasHeight)`
   - Example: If canvas is 720×1280 (9:16) and viewport is 400×600, baseRenderScale ≈ 0.47

2. **effectiveScale** (user zoom): The zoom multiplier (0.5 to 2.0)
   - Stored in state: `desktopViewport.scale`
   - Controlled by buttons, keyboard, wheel, or touch

3. **interactionScale** (combined): `baseRenderScale × effectiveScale`
   - Used to convert screen coordinates to canvas coordinates
   - Ensures mouse clicks, drags, and other interactions work correctly at any zoom level

**Why three levels?**: The baseRenderScale ensures the canvas ALWAYS fits at 100% zoom (1.0 effectiveScale), regardless of aspect ratio. Then effectiveScale lets users zoom beyond 100% while maintaining the aspect ratio fit.

---

### 3. Pan Is Only Available When Zoomed > 1.0

**Finding**: Pan (dragging to move around) is disabled when `zoom ≤ 1.0`.

**Code evidence**:
```typescript
// CanvasStage.tsx:536-537
if (!activeViewport || !activeViewportChange || activeViewport.scale <= 1) {
  return;  // Pan not available
}
```

**Why**: When zoomed out to fit the entire canvas, there's nothing to pan to — you can already see everything. Pan only makes sense when zoomed in past the viewport boundaries.

**Visual feedback**:
- Cursor changes to `grab`/`grabbing` only when zoom > 1
- Pan hint text only appears when zoom > 1
- Pan offset is forced to (0, 0) whenever zoom returns to ≤ 1

---

### 4. Pan Is Bounded (Can't Over-Scroll)

**Finding**: Pan offsets are clamped between `[minOffset, 0]`:
- `offsetX ∈ [minOffsetX, 0]`
- `offsetY ∈ [minOffsetY, 0]`

**Where minOffset is**:
```typescript
minOffsetX = fittedStageSize.width - (fittedStageSize.width * scale)
minOffsetY = fittedStageSize.height - (fittedStageSize.height * scale)
```

**Example**: If viewport width is 400px and scale = 2.0:
- Scaled canvas width = 400 × 2 = 800px
- minOffsetX = 400 - 800 = -400
- offsetX can only be in [-400, 0]
- At offsetX = 0: left edge of canvas visible
- At offsetX = -400: right edge of canvas visible

**Code location**: `CanvasStage.tsx:256-268`

**Why**: Prevents users from panning to blank areas, keeps the canvas always visible.

---

### 5. Zoom Is Pointer-Centric (Cursor Point Stays Fixed)

**Finding**: When you scroll to zoom, the point under your cursor **stays in the same screen position** as you zoom.

**Code evidence**:
```typescript
// CanvasStage.tsx:659-662
const canvasX = (pointerX - viewport.offsetX) / viewport.scale;
const canvasY = (pointerY - viewport.offsetY) / viewport.scale;
const nextOffsetX = pointerX - (canvasX * nextScale);
const nextOffsetY = pointerY - (canvasY * nextScale);
```

**How it works**:
1. Calculate where the cursor is in canvas coordinates: `canvasX = (screenX - offsetX) / scale`
2. After zooming to nextScale, recalculate where that same canvas point should be on screen
3. Update offsetX to keep that canvas point under the cursor

**Example**:
- You hover over a specific element 100px into the canvas
- You scroll to zoom in (scale 1.0 → 1.1)
- The element moves slightly, but stays under your cursor
- The canvas pans automatically to achieve this

**Touch equivalent**: Pinch-to-zoom uses the same logic with the midpoint between two fingers as the anchor.

---

### 6. Transform Order Matters: Translate Then Scale

**Finding**: The transform is applied as `translate(offsetX, offsetY) scale(scale)`.

```typescript
style={{
  transform: `translate(${offsetX}px, ${offsetY}px) scale(${baseRenderScale * effectiveScale})`,
}}
```

**Why this order**:
- CSS transforms are applied right-to-left in the code, but matrix multiplication is left-to-right
- `translate()` first means: "move the canvas by (offsetX, offsetY) pixels in the unscaled coordinate system"
- `scale()` second means: "then scale everything by the final scale factor"

**Visual effect**:
```
Without pan (offsetX=0, offsetY=0, scale=2):
  Canvas shown at 2x size, with top-left at screen origin

With pan (offsetX=-200, offsetY=0, scale=2):
  Canvas moved 200px to the LEFT first, then scaled 2x
  Result: left edge of canvas moved off-screen, right edge comes into view
```

---

### 7. Canvas Dimensions Are Fixed by Aspect Ratio Preset

**Finding**: The canvas has exactly 7 preset aspect ratios, each with fixed pixel dimensions:

| Ratio | Width | Height | Default |
|-------|-------|--------|---------|
| 9:16 | 720 | 1280 | ✓ |
| 16:9 | 1280 | 720 | |
| 4:3 | 1024 | 768 | |
| 3:4 | 768 | 1024 | |
| 4:5 | 960 | 1200 | |
| 5:4 | 1250 | 1000 | |
| 1:1 | 1080 | 1080 | |

**Code location**: `constants.ts:23-31`

**Why fixed dimensions**: The pixel dimensions are carefully chosen to maintain aspect ratios while fitting common export formats and maintaining text readability.

**Effect on scaling**: Different aspect ratios result in different `baseRenderScale` values, which affects the pan boundaries.

---

### 8. Zoom Controls Have Five Input Methods

| Method | Keyboard | Mouse | Touch | Zoom Range | Location |
|--------|----------|-------|-------|-----------|----------|
| **Buttons** | N/A | Click Zoom In/Out | N/A | 0.5–2.0 | PresentationEditor.tsx:8356–8383 |
| **Percentage** | N/A | Click % to reset | N/A | 1.0 (reset) | PresentationEditor.tsx:8366–8372 |
| **Keyboard** | Ctrl/Cmd+Plus | N/A | N/A | 0.5–2.0 | PresentationEditor.tsx:7199–7208 |
| **Scroll wheel** | N/A | Scroll up/down | N/A | 0.5–2.0 | CanvasStage.tsx:641–669 |
| **Pinch** | N/A | N/A | Two-finger pinch | 0.5–2.0 | CanvasStage.tsx:578–639 |

**All methods**:
- Clamp to [0.5, 2.0]
- Increment/decrement by 0.1 (except pinch, which is proportional)
- Support pointer-centric zoom

---

### 9. Viewport State Is Separate From Canvas State

**Finding**: Viewport is managed independently from the canvas content:

```typescript
// PresentationEditor.tsx:2524-2528
const [desktopViewport, setDesktopViewport] = useState({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
});

// Passed to CanvasStage
<CanvasStage
  viewport={desktopViewport}
  onViewportChange={handleDesktopViewportChange}
  ...
/>
```

**Why separate**:
- Viewport is temporary view state (how the user is looking at the canvas)
- Canvas content is persistent state (elements, components, layers, etc.)
- Zooming/panning doesn't modify the canvas content
- Saving the presentation doesn't save viewport state

**Consequence**: When you refresh the page or re-open the editor, zoom resets to 1.0 and pan resets to (0, 0).

---

### 10. Two Separate Zoom Systems: Canvas and Preview

**Finding**: There are TWO different zoom systems in the Editor:

1. **Canvas zoom** (main editor): Uses transforms, described in this research
2. **AI preview zoom** (in dialogs): Uses CSS `zoom` property directly

```typescript
// Main canvas (CanvasStage.tsx:798)
transform: `translate(${offsetX}px, ${offsetY}px) scale(${interactionScale})`

// AI preview (PresentationEditor.tsx:9942)
style={{ zoom: aiPreviewZoom }}
```

**Why two approaches**:
- Canvas needs complex pan + zoom with precise coordinate transformation
- Preview just needs simple zoom without interaction, so CSS `zoom` is sufficient
- They solve different problems and use different mechanisms

---

## Implementation Insights

### To Add Custom Zoom Behavior

If you need to add new zoom-related features:

1. **For new zoom buttons**: Add click handler that calls `updateDesktopZoom(nextScale)` (PresentationEditor.tsx:4489)
2. **For new pan gestures**: Add pointer/touch handler that calls `onViewportChange()` with clamped offsets (CanvasStage.tsx:256)
3. **For coordinate conversion**: Use `toCanvasCoordinates()` to convert screen coords to canvas coords (CanvasStage.tsx:411)
4. **For viewport constraints**: Modify `clampViewportOffsets()` to add custom boundaries (CanvasStage.tsx:256)

### To Understand Current Behavior

Start with these flows:

1. **User clicks Zoom In button** → `updateDesktopZoom()` → `setDesktopViewport()` → CanvasStage re-renders
2. **User scrolls wheel** → `handleCanvasWheel()` → calculates pointer-centric offset → `onViewportChange()`
3. **User drags to pan** → `handlePanPointerDown()` + `handlePointerMove()` → `clampViewportOffsets()` → continuous updates

### Critical Values to Remember

- **Zoom range**: 0.5 to 2.0 (step 0.1)
- **Pan available**: Only when zoom > 1.0
- **Pan clamping**: offsetX ∈ [minOffsetX, 0], offsetY ∈ [minOffsetY, 0]
- **Transform origin**: `top-left` (not center, not bottom-right)
- **Scale calculation**: interactionScale = baseRenderScale × effectiveScale
- **Coordinate conversion**: `canvasCoord = (screenCoord - offset) / interactionScale`

---

## Testing Zoom & Pan

To verify zoom/pan works correctly:

1. **Zoom in to 200%** → Should see only top-left quadrant
2. **Pan left** → Right edge should come into view
3. **Pan up** → Bottom edge should come into view
4. **Hover over element** → Scroll wheel → Element should stay under cursor
5. **Pan to edge** → Try to pan further → Should stop at boundary
6. **Zoom back to 100%** → Pan offsets should reset to (0, 0)
7. **Zoom out to 50%** → Should see full canvas with room to spare
8. **Two-finger pinch** (mobile) → Should zoom like scroll wheel

---

## Files to Review for Implementation

- **Viewport state**: `PresentationEditor.tsx:2524–2528`
- **Zoom handler**: `PresentationEditor.tsx:4489–4496`
- **Zoom UI**: `PresentationEditor.tsx:8356–8383`
- **CanvasStage component**: `CanvasStage.tsx:125–907` (entire component)
- **Critical handlers**:
  - Wheel zoom: `CanvasStage.tsx:641–669`
  - Pan start: `CanvasStage.tsx:490–550`
  - Pan move: `CanvasStage.tsx:316–355`
  - Clamping: `CanvasStage.tsx:256–268`
  - Transform: `CanvasStage.tsx:792–800`

