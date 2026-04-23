# TDD Plan

## Testing Strategy

Use the repo's existing Vitest setup:

- server tests under `apps/web/server/**/*.test.ts`
- client tests under `apps/web/client/src/**/*.test.ts` and `apps/web/client/src/**/*.test.tsx`
- `jsdom` for client component tests
- `node` for service/router tests

## 1. Catalog And Seed

Write the tests first for:

- `apps/web/server/__tests__/testFalAI.test.ts`
  - assert the fal.ai provider template now includes `fal-ai/gemini-3.1-flash-tts`
  - assert the model count increases by one
  - assert the Gemini model metadata carries the documented voice list and audio defaults

- `apps/web/server/services/__tests__/modelRegistry.mapToApiModelId.test.ts`
  - assert Gemini TTS aliases resolve to the canonical model id
  - assert snake/camel/space variants normalize consistently

Expected failure before implementation:

- the provider template and registry fallback do not yet know about the Gemini TTS model

## 2. Shared Input Schema And UI

Write the tests first for:

- `apps/web/client/src/lib/mediaModelInputs.test.ts`
  - assert structured `array.itemFields` survive parsing
  - assert nested `speaker_id` defaults build a sensible first row
  - assert recursive validation flags incomplete speaker rows
  - assert `language_code` keeps the auto-detect option as an unset default
  - assert the Gemini defaults for `voice`, `temperature`, and `output_format` stay visible in parsed config
  - assert `style_instructions` is parsed as plain text helper content rather than a path/reference
  - assert the speaker list cap is preserved in parsed field metadata
  - assert `getModelGenerationModeLabel` resolves Gemini TTS as `Text to Speech`

- `apps/web/client/src/components/media/ModelInputArrayFieldEditor.test.tsx`
  - assert add/remove row behavior for structured arrays
  - assert nested select inputs and text inputs render for speaker rows

- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx` or the closest panel test coverage
  - assert the shared panel renders Gemini structured arrays with nested `itemFields`
  - assert the shared panel still falls back to a textarea for flat arrays
  - assert `style_instructions` remains plain text helper content in the shared panel path

- `apps/web/client/src/pages/MediaStudio.tsx`
  - assert duplicate `speaker_id` aliases are rejected before submit
  - assert `language_code=__auto__` is stripped before submission

Expected failure before implementation:

- structured arrays will still be treated like flat values or textareas only
- nested required speaker fields will not be caught consistently

## 3. Audio Payload And Server Validation

Write the tests first for:

- `apps/web/server/services/mediaGenerationService.test.ts`
  - assert `generateAudio` and `generateAudioAsync` preserve `extraParams.speakers` as structured objects
  - assert top-level Gemini `speed` is rejected before submitting
  - assert malformed Gemini string fields are rejected before submitting
  - assert `style_instructions` stays plain text even when it looks path-like
  - assert nested `speaker_id` and `voice` values are trimmed before payload submission
  - assert requests with more than 32 speaker rows are rejected before submission
  - assert single-speaker top-level `voice` still contributes to abuse hashing when `speakers` is absent
  - assert a representative legacy audio model still follows its existing fallback serialization path

- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
  - assert malformed Gemini payloads are rejected before abuse checks and service calls
  - assert top-level Gemini `speed` is rejected before abuse checks and service calls
  - assert speaker aliases remain unique at router validation time
  - assert the top-level `voice` field does not affect the abuse hash when `speakers` is present

Expected failure before implementation:

- the router and generation service will still allow unsupported or malformed Gemini payloads through
- nested speaker rows may not be normalized before reaching the backend

## 4. Abuse Hash Canonicalization

Write the tests first for:

- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
  - assert changing top-level `voice` does not change the abuse hash when `speakers` is present
  - assert the hash still changes when the actual speaker configuration changes

Expected failure before implementation:

- duplicate detection can still treat cosmetic top-level `voice` differences as separate requests

## Regression Checks

- Run the focused Vitest files first.
- Then run the broader `apps/web` typecheck.
- Finish with the media-focused Vitest subset once the feature is implemented end-to-end.
