# Section 03: Presentation TRPC Route

## Objective
Connect the LLM schemas from Sec 01 with the Layout Engine from Sec 02 into a new backend endpoint `generateAIContent`.

## Files to modify
- `apps/web/server/routers/presentation.ts` (or `presentationImport.ts` depending on module breakdown)
- `apps/web/server/routers/__tests__/presentationAi.test.ts` (new)

## TDD Acceptance
- Mock `invokeLLM` to return a predefined valid JSON payload for a 2-slide presentation.
- Assert that calling `trpc.presentation.generateAIContent.mutate({ prompt: 'kids veg' })` successfully calls the LLM, parses the JSON, passes it to the layout engine, and returns an array of `PresentationSlideContent`.
- If LLM returns garbled JSON, test that a graceful error is returned.

## Implementation Notes
- Add the `generateAIContent` mutation. Ensure context tenant validation via `resolvePresentationTenantId` is enforced.
