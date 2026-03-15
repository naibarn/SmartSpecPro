# Request

## Summary
Make Presentation Edit auto-layout block-first:
- force `Auto Layout` to prefer built-in blocks before any legacy plain-template path
- migrate legacy top/center/side auto-layout options into block-oriented behavior
- hide plain-template selection from the main UX and keep it as an internal fallback only

## Affected Areas
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/server/services/aiPresentationService.ts`
- presentation editor/client tests
- auto-layout / relayout server tests

## Constraints
- Keep existing relayout API backward-compatible
- Preserve internal fallback behavior if no block layout fits
- Maintain A4 full-canvas autofit behavior for portrait and landscape A4 blocks

## Assumptions
- User-facing terminology should prefer `Block` / `Block Layout`
- Existing built-in block family is sufficient for first-pass migration of legacy template patterns
- Legacy plain-template rendering can remain internal for safety and compatibility
