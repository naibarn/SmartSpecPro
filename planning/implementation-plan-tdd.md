# TDD Implementation Plan: AI Presentation Layout Engine

## 1. Zod Schemas & Prompts (TDD)
- **Target File**: `apps/web/server/services/aiPresentationTypes.ts` (new)
- **Tests**: `apps/web/server/services/__tests__/aiPresentationTypes.test.ts`
- **Verification Criteria**:
  - Test that the prompt string correctly instructs the LLM to output parsing-friendly JSON.
  - Test that `AIPresentationSchema.parse()` correctly accepts a mocked LLM valid JSON response.
  - Test that it throws on invalid data.

## 2. Layout Engine (TDD)
- **Target File**: `apps/web/server/services/presentationLayoutEngine.ts` (new)
- **Tests**: `apps/web/server/services/__tests__/presentationLayoutEngine.test.ts`
- **Verification Criteria**:
  - `generateSplitSlide`: Check that the computed layout arrays contain text and image elements where `x`, `y`, `width`, `height` strictly stay within 1920x1080 bounds.
  - `generateFeatureGridSlide`: Check that boxes are properly spaced and do not overlap.
  - Ensure Zod validation (`PresentationSlideContent`) passes for the engine's output.

## 3. Presentation TRPC API Integration (TDD)
- **Target File**: `apps/web/server/routers/presentation.ts`
- **Tests**: `apps/web/server/routers/__tests__/presentationAi.test.ts`
- **Verification Criteria**:
  - Mock `invokeLLM` to return valid JSON.
  - Test the `presentation.generateAIContent` endpoint successfully parses the LLM output and maps it through the LayoutEngine to return slides.
  - Test behavior when LLM output is malformed (should throw TRPC 500 error).

## 4. UI Trigger in Editor
- **Target File**: `apps/web/client/src/pages/PresentationEditor.tsx`
- **Verification Criteria**:
  - Click "✨ Draft with AI", type a topic, submit.
  - Ensure the loading state (`isPending`) blocks user edits.
  - Ensure the returned slides are merged correctly into `draftSlides`.
