# Implementation Plan

## Objective

Add `fal-ai/gemini-3.1-flash-tts` as a first-class fal.ai audio model and make Media Studio able to author multi-speaker TTS scripts with structured `speakers` rows.

## Current-codebase fit

The repo already has:

- a fal.ai provider template and seeding flow
- a DB-backed media model registry with static fallbacks
- a Media Studio form pipeline that already renders dynamic model input fields
- a shared `ModelInputFieldsPanel` used by multiple presentation/editor surfaces
- an audio generation path that forwards `extraParams` to the backend unchanged

This feature extends those paths rather than introducing a parallel model system.

## Files and modules

Expected touch points:

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/seed-media-models-fal-ai.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/components/media/ModelInputArrayFieldEditor.tsx`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/server/__tests__/testFalAI.test.ts`
- `apps/web/server/services/__tests__/modelRegistry.mapToApiModelId.test.ts`
- `apps/web/server/services/mediaGenerationService.test.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`

## Implementation approach

1. Add a shared Gemini TTS helper that defines the model id, voice list, language list, output-format enum, max-speaker cap, and request validation helpers.
2. Register the new model in the fal.ai provider template and seeding scripts.
3. Add the new model to the static registry and media-generation metadata so DB fallback still works.
4. Extend `mediaModelInputs.ts` to parse array `itemFields`, preserve metadata, and validate nested required fields.
5. Introduce a reusable structured array editor for model inputs and use it in both Media Studio and `ModelInputFieldsPanel`.
6. Expose `language_code` as an optional auto-detect-friendly field, and keep `voice` available as the single-speaker fallback with the documented defaults.
7. Enforce Gemini-specific validation on the server for malformed voices, languages, duplicate speaker aliases, closed-schema extraParams, unsupported top-level `speed`, and speaker lists above the supported cap.
8. Canonicalize top-level Gemini `voice` out of abuse hashing when `speakers` is present, because the backend ignores it in multi-speaker mode.
9. Keep URL-resolution logic key-aware so plain-text fields such as `style_instructions` are not treated as media paths, and keep that field as prepended helper text rather than a reference input.
10. Add regression tests for catalog presence, recursive model-input parsing, nested validation, payload preservation, alias resolution, server-side Gemini rejection paths, abuse-hash canonicalization, and legacy audio-model fallback behavior.

## Risks and mitigations

- Risk: nested arrays become difficult to render generically.
  - Mitigation: the first implementation only needs to support text, select, number, boolean, URL, and file subfields, which covers Gemini TTS.
- Risk: nested required fields are missed.
  - Mitigation: add recursive validation tests for `speakers`.
- Risk: one-off pricing assumptions drift.
  - Mitigation: keep the estimate centralized in the seed and registry metadata so it can be tuned in one place and mark the current figure as provisional.
- Risk: client-only validation leaves a server-side gap.
  - Mitigation: validate Gemini payloads in the server service/router before any backend submission or abuse hashing.
- Risk: extraParams remains an open-ended bag and may accidentally forward unsupported Gemini keys.
  - Mitigation: validate Gemini input against a closed allowlist and reject unknown keys before submission.
- Risk: top-level `voice` differences can create false duplicates when `speakers` is set.
  - Mitigation: canonicalize that field out of the Gemini abuse hash path.
- Risk: plain-text helper fields can be misclassified as file or URL references.
  - Mitigation: keep URL resolution key-aware and explicitly treat `style_instructions` as text.
- Risk: Gemini-specific parsing changes could accidentally regress older audio models.
  - Mitigation: include a regression test for at least one representative legacy audio model path.

## Acceptance criteria

- `fal-ai/gemini-3.1-flash-tts` appears in fal.ai provider templates and model seeds.
- Media Studio exposes a structured `speakers` editor for the model.
- `voice` remains usable for single-speaker TTS.
- `language_code` is available as an optional auto-detect defaulting field.
- `temperature` defaults to `1` and `output_format` defaults to `mp3`.
- `style_instructions` is preserved as plain text helper content and prepends to the prompt.
- `extraParams.speakers` reaches the media generation service as an array of objects.
- Required nested speaker fields are validated before submit.
- Invalid Gemini payloads are rejected on the server.
- The top-level `voice` field does not alter abuse hashing when `speakers` is present.
- The single-speaker `voice` field still affects abuse hashing when `speakers` is absent.
- Tests cover the new model, parsing, and audio payload behavior.
