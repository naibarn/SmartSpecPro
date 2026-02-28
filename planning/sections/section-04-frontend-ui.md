# Section 04: Frontend UI Trigger

## Objective
Embed the "Draft with AI" mechanism into the Editor toolbar. Provide loading states, and handle the TRPC mutation result.

## Files to modify
- `apps/web/client/src/pages/PresentationEditor.tsx`

## TDD Acceptance
- Standard Playwright/React testing is out of scope here; verification is manual UI testing.
- UI flow: Open Editor -> Click ✨ icon in toolbar -> Type topic in prompt dialog -> See spinner -> Slides appear on canvas sidebar.

## Implementation Notes
- Use `trpcClient.presentation.generateAIContent.useMutation()`.
- Upon success, use `executeCommand(...)` to append the slides to the `draftSlides` array, or handle state correctly according to existing `PresentationEditor` logic.
- Reuse `GraphicsPanel` category mappings to resolve the actual SVG strings from the backend payload.
