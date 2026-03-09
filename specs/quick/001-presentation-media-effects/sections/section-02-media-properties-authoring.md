# Section 02: Media Properties Authoring

## Goal

Expose motion authoring controls for `image` and `video` elements in the Presentation Editor properties panel, using the shared contract from Section 01.

## Scope

- Property panel UI for media motion
- Patch wiring for selected element updates
- Clear/reset behavior
- Optional low-noise authoring affordances that do not animate the edit canvas continuously

## Files

- `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/client/src/presentation-canvas/commands/commands.ts` if patch broadcast rules need refinement
- `apps/web/client/src/pages/PresentationEditor.test.tsx`

## Implementation Tasks

1. Add a `Motion` subsection to the image block in `PropertyPanel.tsx`.
2. Add the same `Motion` subsection to the video block, reusing shared options/helpers rather than duplicating logic.
3. Provide controls for:
   - preset selection
   - intensity
   - easing
   - clear/reset
4. Ensure the new patch payloads flow through `onPatchSelected` with correct typing.
5. Keep the edit canvas stable:
   - do not run perpetual motion while authoring
   - rely on slideshow preview for authoritative playback validation
6. If helpful, add a small textual summary/badge for the selected effect rather than live animation inside edit mode.

## TDD Notes

- Add `PresentationEditor` tests that assert the controls appear for image/video selections.
- Add tests that changing controls updates the selected element state.
- Add tests that clearing motion returns the element to the default no-motion state.

## Acceptance Notes

- Motion controls are hidden for non-media element types.
- Existing crop controls continue to work independently of motion settings.
- Multi-select broadcasting should remain safe and type-consistent.
