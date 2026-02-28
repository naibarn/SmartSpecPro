# Section 01: API Schema and Prompts

## Objective
Create the strict Zod schema definition for what we expect the LLM to output (Title, Body text, image prompt, graphic category, layout type). Construct the system prompt string that instructs the LLM.

## Files to modify
- `apps/web/server/services/aiPresentationTypes.ts` (new)
- `apps/web/server/services/__tests__/aiPresentationTypes.test.ts` (new)

## TDD Acceptance
- Write a unit test ensuring that `AIPresentationSchema` correctly parses a dummy JSON payload matching our requirements.
- The `generateSystemPrompt()` function should contain clear rules requiring JSON output matching `AIPresentationSchema`.

## Implementation Notes
- This module must act purely as data-definitions and prompt-construction so it's easily unit-testable.
