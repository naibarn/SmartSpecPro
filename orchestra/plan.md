# Orchestra Plan

## Task
Add slide background (solid color + library image, object-fit:cover) to Presentation Editor.
Background is a true canvas-level layer — not in z-order, not part of auto-layout, not selectable.

## Classification
- scope: medium
- risk: medium
- affected_domains: [frontend, schema]
- estimated_file_count: 7-9
- chosen_route: multi-agent waves
- task_summary: Add PresentationSlideContent.background field (color + image variants), render as canvas-level background layer, and build BackgroundPanel UI in PropertyPanel with Library image search.

## Contracts

### Schema Contract (frozen after Wave 1 starts)
```typescript
// In PresentationSlideContent (contracts.ts)
background: z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), color: z.string().max(64) }),
  z.object({ type: z.literal("image"), url: z.string().max(500), libraryId: z.string().optional() }),
]).optional()
```

### Rendering Contract
- Background renders BEFORE all elements (first in DOM)
- Color: `<div style="background-color: {color}; position: absolute; inset: 0" />`
- Image: `<div style="background-image: url({url}); background-size: cover; background-position: center; position: absolute; inset: 0" />`
- Not selectable, not draggable, pointer-events: none

### State Contract
- `setSlideBackground(slideId, background | null)` added to presentationEditorState.ts
- Callable from PropertyPanel via command bus

## Wave Plan

### Wave 1 (parallel: schema + rendering)
- Agent A (ssp-frontend): Schema + state layer
  - Modify contracts.ts — add background union type
  - Modify presentationEditorState.ts — add setSlideBackground function
  Files: apps/web/shared/presentation/contracts.ts, apps/web/client/src/lib/presentationEditorState.ts

- Agent B (ssp-frontend): Canvas rendering
  - Modify CanvasStage.tsx or CanvasObjects.tsx — render background layer
  - Modify PresentationEditor.tsx — wire setSlideBackground handler
  Files: apps/web/client/src/presentation-canvas/CanvasStage.tsx, apps/web/client/src/pages/PresentationEditor.tsx

### Wave 2 (sequential: UI panel)
- Agent C (ssp-frontend): BackgroundPanel UI in PropertyPanel
  - Add "Background" section to PropertyPanel.tsx with color picker + library image search
  - Show when no element is selected OR dedicated panel slot
  - Library search: use AssetLibraryPanel.tsx pattern for image picking
  Files: apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx,
         apps/web/client/src/presentation-canvas/components/AssetLibraryPanel.tsx (reference only)

### Wave 3 (quality gates)
- TypeScript check
- Test update if needed
