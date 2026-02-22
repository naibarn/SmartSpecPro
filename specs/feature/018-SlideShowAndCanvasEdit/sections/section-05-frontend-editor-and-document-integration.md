# Section 05: Frontend Editor and Document Integration

## Objective
Deliver the MVP presentation editor UI and integrate it into Document Management routing and item-open behavior.

## Dependencies
- `section-03-backend-api-and-services`

## Implementation Scope
- Add presentation page route and editor shell in `apps/web/client/src/pages/`.
- Implement slide panel CRUD/reorder UI.
- Implement basic canvas viewport and element editing for text/image/rect/line.
- Implement properties sidebar (MVP subset) and save status controls.
- Integrate Document Management opening behavior for native presentation items and wrong-type guard fallback.

## Test-First Stubs (Write Before Implementation)
- Test: document item with `itemType=presentation` routes to presentation editor.
- Test: wrong-type open path shows deterministic recovery CTA and does not enter editor.
- Test: slide add/duplicate/delete/reorder updates UI state and calls typed API bindings.
- Test: element edits mutate only targeted element fields.
- Test: keyboard focus order and labeled controls satisfy accessibility baseline.

## Implementation Tasks
1. Add route entry and page composition for presentation editor.
2. Implement editor layout regions (slide list, canvas, properties, action bar).
3. Wire slide and canvas actions to backend contracts from sections 03-04.
4. Add save status state machine including pending, success, and conflict-needed states.
5. Add accessibility baseline wiring for keyboard-only operation.

## Acceptance Criteria
- User can create/edit slides and basic elements in a single-user flow.
- Document Management opens presentation items in correct editor.
- Wrong editor opens are blocked with clear action path.
- Accessibility baseline checks pass for MVP controls.

## Risks and Mitigations
- Risk: inconsistent local/editor state under rapid edits.
- Mitigation: centralized editor state model and contract-based save/update actions.

## Out of Scope
- Real-time collaboration.
- Advanced animations/timelines.

## As-Built Implementation Notes

### Files Changed
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/client/src/lib/presentationEditorState.test.ts`
- `apps/web/client/src/lib/presentationRouting.ts`
- `apps/web/client/src/lib/presentationRouting.test.ts`

### Delivered Behavior
- Replaced placeholder page with an MVP editor shell:
  - slide panel with select/add/duplicate/delete/move up/move down controls
  - canvas element list with add buttons for `text`, `image`, `rect`, `line`
  - properties panel with targeted element field editing
  - save status states (`Ready`, `Saving`, `Saved`, `Conflict`, `Error`)
- Wired slide and save actions to typed backend contracts:
  - `presentation.addSlide`
  - `presentation.duplicateSlide`
  - `presentation.deleteSlide`
  - `presentation.reorderSlides`
  - `presentation.updateSlide`
- Preserved deterministic wrong-editor guard and recovery CTA behavior.

### Deviations from Plan
- Reorder interaction is currently explicit button actions (up/down) rather than drag-and-drop to keep MVP deterministic and testable.

### Tests Added/Updated
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - labeled controls/accessibility baseline
  - slide CRUD/reorder typed mutation wiring
  - wrong-editor recovery guard rendering
- `apps/web/client/src/lib/presentationEditorState.test.ts`
  - targeted element updates only mutate selected element fields
- Existing guard/routing tests remain green:
  - `apps/web/client/src/lib/presentationRouting.test.ts`
