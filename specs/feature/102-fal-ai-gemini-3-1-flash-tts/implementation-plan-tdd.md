# TDD Plan

## First tests to add

1. `apps/web/server/__tests__/testFalAI.test.ts`
   - assert the fal.ai provider template now has the Gemini TTS model
   - assert total fal.ai entries increase by one

2. `apps/web/client/src/lib/mediaModelInputs.test.ts`
   - assert structured `array.itemFields` survive parsing
   - assert `Text to Speech` labels resolve from Gemini TTS config
   - assert recursive validation flags incomplete speaker rows
   - assert a helper can build a valid default speaker row

3. `apps/web/server/services/mediaGenerationService.test.ts`
   - assert `generateAudio` preserves `extraParams.speakers` as a structured array of objects

4. `apps/web/server/services/__tests__/modelRegistry.mapToApiModelId.test.ts`
   - assert Gemini TTS aliases resolve to the canonical model id

## Expected failing conditions

- The fal.ai template count will still be 14 until the new model is registered.
- The model input parser will drop `itemFields` until recursion is added.
- The structured array editor will not exist until the new component is added.
- The audio payload test will fail if `speakers` is flattened into a string or dropped entirely.

## Regression checks

- Run the focused Vitest files first.
- Then run the broader `apps/web` typecheck.
- Finish with the full media-related Vitest subset if needed.

