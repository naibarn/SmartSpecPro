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

## Implementation approach

1. Add a shared Gemini TTS model helper with the model id, voice list, and structured input-field builder.
2. Register the new model in the fal.ai provider template and seeding scripts.
3. Add the new model to the static registry and media-generation metadata so DB fallback still works.
4. Extend `mediaModelInputs.ts` to parse array `itemFields`, preserve metadata, and validate nested required fields.
5. Introduce a reusable structured array editor component for model inputs.
6. Use that editor in both Media Studio and `ModelInputFieldsPanel`.
7. Add `language_code` to the Gemini schema as an auto-detect-friendly optional field.
8. Enforce Gemini-specific validation on the server for malformed voices, languages, duplicate speaker aliases, closed-schema extraParams, and speaker lists.
9. Update audio abuse hashing so multi-speaker payloads do not collapse to the same duplicate key as a single-speaker request, while ignoring cosmetic top-level `voice` differences in multi-speaker mode.
10. Add tests for catalog presence, recursive model-input parsing, nested validation, payload preservation, alias resolution, and server-side Gemini rejection paths.

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

## Acceptance criteria

- `fal-ai/gemini-3.1-flash-tts` appears in fal.ai provider templates and model seeds.
- Media Studio exposes a structured `speakers` editor for the model.
- `voice` remains usable for single-speaker TTS.
- `language_code` is available as an optional auto-detect defaulting field.
- `extraParams.speakers` reaches the media generation service as an array of objects.
- Required nested speaker fields are validated before submit.
- Invalid Gemini payloads are rejected on the server.
- Tests cover the new model, parsing, and audio payload behavior.
