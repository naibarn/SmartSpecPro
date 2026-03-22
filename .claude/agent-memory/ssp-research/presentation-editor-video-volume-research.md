# Presentation Editor: Video Element & PropertyPanel Research

## Overview
Research into adding video volume control to the Presentation Editor's PropertyPanel and how video elements are currently handled across the system.

## 1. SlideElement Type Definition

**File**: `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts`

### Video Element Schema (lines 267-290)
```typescript
export const presentationVideoElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("video"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  rotation: presentationElementRotationSchema.optional(),
  src: z.string().max(4_096),
  poster: z.string().max(4_096).optional(),
  title: z.string().max(512).optional(),
  muted: z.boolean().optional(),                    // EXISTS: default true
  loop: z.boolean().optional(),                      // EXISTS
  videoPrompt: z.string().max(4_000).optional(),
  videoModelId: z.string().max(256).optional(),
  videoReferenceUrls: z.array(z.string().max(2_048)).max(5).optional(),
  videoFit: z.enum(["contain", "cover", "fill"]).optional(),
  videoPositionX: z.number().finite().min(0).max(100).optional(),
  videoPositionY: z.number().finite().min(0).max(100).optional(),
  videoZoom: z.number().finite().min(0.5).max(3).optional(),
  videoExtraParams: z.record(z.unknown()).optional(),
  mediaMotion: presentationMediaMotionSchema.optional(),
}).strict();
```

### Key Finding: `muted` field EXISTS (line 279)
- Type: `z.boolean().optional()`
- Default behavior: When not set, treated as `true` (videos are muted by default)
- **NO `volume` or `videoVolume` field exists** — only `muted` boolean

### All Element Types (line 358-364)
- **text**: presentationTextElementSchema
- **image**: presentationImageElementSchema
- **video**: presentationVideoElementSchema (listed above)
- **rect**: presentationRectElementSchema
- **line**: presentationLineElementSchema

### Common Properties (all elements)
- `id`, `type`, `x`, `y`, `width`, `height`
- `opacity` (0-1), `rotation` (degrees)

## 2. PropertyPanel Component Structure

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`

### Component Interface (lines 39-47)
```typescript
interface PropertyPanelProps {
  selectedElement: PresentationElement | null;
  selectedElementCount?: number;
  selectionHasMixedTypes?: boolean;
  onPatchSelected: (patch: PresentationElementPatch) => void;
  onPatchElementById?: (elementId: string, patch: PresentationElementPatch) => void;
  slideBackground?: PresentationSlideBackground;
  onSetSlideBackground?: (background: PresentationSlideBackground | undefined) => void;
}
```

### Component State (lines 1131-1197)
Major state variables:
- `fontDropdownOpen`, `weightDropdownOpen` — font controls
- `isRegeneratingImage`, `isRegeneratingVideo` — async operation flags
- `showAdvancedModelInputs` — toggle for advanced fields
- `modelInputOptionSearchTerms` — search terms for model input selects
- `bgTab` — slide background mode: "none" | "color" | "image"
- `bgSearch` — search query for background image library

### Panel Sections (based on rendering logic)

**When no element selected (lines 1647+)**: Slide Background panel
- Mode tabs: None / Color / Image
- Color picker with presets
- Image library picker

**When element selected**: Sections shown depend on element type
- Renders conditionally based on `selectedElement.type`
- Text elements → text styling (fonts, colors, decorations)
- Image elements → image controls (source, fit, position, zoom, generation)
- Video elements → video controls (same pattern as image)

### Critical Insertion Point: Video Element Controls

Looking at the **pattern for image elements** (which should match video handling):
- Lines 1199-1205: `patchImageElementById()` — handles patching video OR currently selected element
- Lines 1207-1242: `getSelectedElementExtraParams()` and `updateSelectedElementExtraParams()` — manage `imageExtraParams` / `videoExtraParams`
- Lines 1423-1523: `handleRegenerateImage()` — async image generation
- Lines 1525-1645: `handleRegenerateVideo()` — async video generation (already exists!)

**Video-specific controls likely rendered after line 1500+** in the JSX render section (not fully visible in read range).

## 3. Video Rendering in CanvasObjects

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasObjects.tsx`

### Video Render Props Resolution (lines 86-103)
```typescript
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
```

### Video HTML Element Rendering (lines 283-320, approximately)
```typescript
if (element.type === "video") {
  const resolvedSource = normalizeMediaSourceUrl(element.src);
  const resolvedPoster = normalizeMediaSourceUrl(element.poster);
  const hasSource = Boolean(resolvedSource);
  const isPlaying = Boolean(options.videoPlaybackMap[element.id]);
  const videoRender = resolveVideoRenderProps(element);
  return (
    <div className="relative h-full w-full bg-black/85">
      {hasSource ? (
        <video
          ref={(node) => options.setVideoRef(element.id, node)}
          src={resolvedSource}
          poster={resolvedPoster || undefined}
          muted={options.autoPlayVideos ? true : (element.muted ?? true)}  // LINE 296
          loop={element.loop ?? false}
          preload={options.autoPlayVideos ? "auto" : "metadata"}
          // ... more attributes
        />
      ) : (
        // placeholder for missing video
      )}
      // ... playback controls UI
    </div>
  );
}
```

### Key Finding: muted is Hardcoded (line 296)
```typescript
muted={options.autoPlayVideos ? true : (element.muted ?? true)}
```
- When `autoPlayVideos=true` → **always muted** (browser autoplay policy)
- When `autoPlayVideos=false` → uses `element.muted ?? true` (default muted)
- **NO volume control exists** — only muted/unmuted binary state

### Playback Controls (lines 410-433 approx)
Video playback toggle managed via:
- `videoPlaybackMap` — tracks which videos are playing
- `onToggleVideoPlayback()` callback
- Conditional render of Play/Pause button when `showVideoPlaybackToggle=true`

### Video Cleanup (lines 435-453)
- Cleans up video refs when elements removed
- Syncs playback state with active elements

## 4. PresentationPlayMode Integration

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationPlayMode.tsx`

### CanvasStage Invocation (lines 536-552)
```typescript
<CanvasStage
  elements={normalizedSlideContent.elements}
  canvasSize={canvasSize}
  selectedElementIds={[]}
  snapGuides={[]}
  showElementFrames={false}
  autoPlayVideos={true}              // LINE 542: AUTOPLAY ENABLED
  showVideoPlaybackToggle={false}     // LINE 543: NO PLAYBACK TOGGLE
  mediaMotionTiming={mediaMotionTiming}
  showTransformDock={false}
  suppressTransformHandles={true}
  onSelectElement={() => {}}
  // ... other props
/>
```

### Play Mode Behavior
- Videos automatically play: `autoPlayVideos={true}` (line 542)
- Playback controls hidden: `showVideoPlaybackToggle={false}` (line 543)
- **Result**: Videos always autoplay muted (no user control in play mode)

## 5. PropertyPanel: Full Element Type Handling

The panel uses a discriminated union pattern matching on `selectedElement.type`:

### Type Discriminator (contract)
From `contracts.ts` line 358:
```typescript
export const presentationSlideElementSchema = z.discriminatedUnion("type", [
  presentationTextElementSchema,
  presentationImageElementSchema,
  presentationVideoElementSchema,
  presentationRectElementSchema,
  presentationLineElementSchema,
]);
```

### Type Guard Pattern
The component likely uses:
```typescript
if (!selectedElement) return <BackgroundPanel />;
if (selectedElement.type === "text") return <TextControlPanel />;
if (selectedElement.type === "image") return <ImageControlPanel />;
if (selectedElement.type === "video") return <VideoControlPanel />;
if (selectedElement.type === "rect") return <RectControlPanel />;
if (selectedElement.type === "line") return <LineControlPanel />;
```

## 6. Data Flow for Video Properties

### Editor → Canvas → Playback
```
PropertyPanel (user edits selectedElement.muted)
  ↓ onPatchSelected({ muted: boolean })
  ↓ Editor state updates (presentationEditorState.ts)
  ↓ CanvasStage receives updated elements prop
  ↓ CanvasObjects.renderVideoElement()
  ↓ <video muted={...} /> attribute updated
```

### Play Mode Flow
```
PresentationPlayMode
  ↓ Gets slide data (with elements including videos)
  ↓ Passes to CanvasStage with autoPlayVideos=true
  ↓ CanvasObjects renders <video muted={autoPlayVideos ? true : element.muted}/>
  ↓ Browser starts video playback (muted due to autoplay policy)
```

## 7. Key Findings Summary

| Aspect | Current State |
|--------|---------------|
| **Muted field** | Exists in schema, line 279 |
| **Volume field** | DOES NOT EXIST |
| **Video control in CanvasObjects** | Muted only (line 296) |
| **PropertyPanel video section** | Exists but controls not fully visible (need full read) |
| **Play mode autoplay** | Enabled with `autoPlayVideos=true` (line 542) |
| **Play mode mute** | Always muted (autoplay policy, line 296) |
| **Playback toggle in editor** | Exists but disabled in play mode |

## 8. Next Steps for Implementation

To add video volume control:

1. **Extend schema** (contracts.ts): Add `videoVolume: z.number().min(0).max(1).optional()` to presentationVideoElementSchema
2. **Update CanvasObjects** (line 296): Replace `muted` boolean logic with volume slider logic
3. **Extend PropertyPanel**: Add volume slider control in video section (pattern: follow image zoom controls)
4. **Migration needed**: Schema change requires `pnpm db:push` (no data at risk, optional field)
5. **Optional**: Add volume control UI to CanvasObjects playback controls

## Research Notes

- The `muted` field exists and works but is overshadowed by `autoPlayVideos` in play mode
- Volume control would need to respect browser autoplay policies (mute still required when autoPlay + unmuted)
- Pattern to follow: `imageZoom` control in PropertyPanel (numeric slider 0.5-3)
- No backward compatibility concerns (adding optional field)
