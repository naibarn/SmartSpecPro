## Objective

Expand the Presentation slide editor so users can build richer slide designs with much more variety than basic text/image/video placement, while staying consistent with the current shared-contract and render pipeline.

## Current-Codebase Fit

The current system already supports a primitive element model across client and server:
- `text`
- `image`
- `video`
- `rect`
- `line`
- inline SVG via image payload

Because this pipeline is already duplicated across schema, canvas, property panel, and server render, the best-fit solution is to add reuse/composition above the primitive layer first, not to keep multiplying raw primitive types.

## Recommended Implementation Approach

1. Build a block preset library that inserts multiple existing elements as a single authored composition.
2. Add a persistent `group` or `componentInstance` layer so those blocks behave like one logical element in the editor.
3. Add one richer visual primitive later if necessary:
   - dedicated `svg`
   - or generalized `shape`
4. Delay heavy semantic widgets such as `table` and `chart` until there is evidence they deserve their own editing model.

## Suggested Feature Scope

### Phase 1: Composite preset insertion

Create insertable presets for:
- step/process card
- resume/profile panel
- timeline row
- callout/quote bubble
- badge/chip
- icon-caption feature box

These should compile to normal elements, so play/export support comes “for free”.

### Phase 2: Persistent grouping

Support:
- group selected elements
- ungroup
- move/duplicate/arrange group as one
- resize with proportional child transforms
- enter group for fine-grained editing if needed

### Phase 3: Richer primitive foundation

Introduce either:
- `shape` with variants, radius, and maybe path preset types
- or `svg` as a first-class element to replace the current image overload

## Affected Files / Modules

If implemented, likely touchpoints are:
- [contracts.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts)
- [presentationEditorState.ts](/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/presentationEditorState.ts)
- [CanvasObjects.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasObjects.tsx)
- [commands.ts](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/commands/commands.ts)
- [PropertyPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx)
- [PresentationEditor.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx)
- [GraphicsPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/GraphicsPanel.tsx)
- [slideRender.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.ts)
- AI layout services if AI should emit grouped/preset blocks

## Risks and Mitigations

- Risk: grouping semantics become hard to edit.
  - Mitigation: start with flat groups and explicit “enter group” / “detach” actions.
- Risk: new primitive types create renderer drift between editor and export.
  - Mitigation: delay new primitives until grouping/presets prove insufficient.
- Risk: preset library becomes one-off hardcoded UI.
  - Mitigation: define presets as structured factories or metadata-driven recipes.

## Acceptance Criteria

- Users can insert richer ready-made slide blocks without manually assembling every piece.
- Those blocks can be edited and repositioned with much less friction than today.
- Export/playback behavior stays aligned with editor behavior.
- The chosen architecture does not require a new end-to-end primitive for every design pattern.
