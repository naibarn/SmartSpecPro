# Feature 102: fal.ai Gemini 3.1 Flash TTS And Multi-Speaker Media Studio

Version: 1.0
Date: 2026-04-21
Status: Proposed
Depends-on: 063-MediaStudioContentComposer
Audience: Media Studio, Model Registry, Audio Generation, QA

---

## 1. Executive summary

This feature adds `fal-ai/gemini-3.1-flash-tts` as a new fal.ai media model and upgrades Media Studio so users can author multi-speaker TTS scripts.

The model supports:

- single-speaker text-to-speech through `voice`
- multilingual synthesis through `language_code`
- multi-speaker dialogue through a structured `speakers` array
- style instructions, temperature control, and output format selection

The user-visible result is a Media Studio audio experience that can handle both simple narration and scripted dialogue without forcing users to hand-write JSON.

---

## 2. Problem statement

SmartSpecPro already supports several audio models, but the current TTS experience is still optimized for single-voice narration.

That creates three gaps:

1. there is no first-class fal.ai Gemini 3.1 Flash TTS model in the catalog
2. Media Studio cannot author multi-speaker dialogue as structured model input
3. model-input parsing and validation do not yet understand nested array fields like `speakers`

Without this change, users must either:

- stay on simpler single-speaker flows, or
- encode multi-speaker content manually and hope the backend accepts it

---

## 3. Product goals

1. Add `fal-ai/gemini-3.1-flash-tts` to the existing fal.ai media model catalog.
2. Support single-speaker and multi-speaker TTS in the same Media Studio flow.
3. Keep the `voice` field available for simple narration.
4. Expose `language_code` as an optional multilingual hint with auto-detect behavior when omitted.
5. Make `speakers` a structured array, not a raw JSON textarea.
6. Preserve the structured speaker payload all the way to the generation service.
7. Keep the change backwards-compatible for existing audio models.

---

## 4. Non-goals

This feature does not aim to:

- replace the existing Lux TTS model
- redesign the full media generation pipeline
- change the underlying fal.ai backend contract beyond the new model payload shape
- introduce a brand new audio editor surface outside Media Studio
- add voice cloning, identity impersonation, or speaker verification features

---

## 5. Functional requirements

### 5.1 New fal.ai audio model

1. Add `fal-ai/gemini-3.1-flash-tts` as a new `audio` model.
2. Keep the provider name aligned with existing fal.ai records (`fal_ai`).
3. Expose the model in:
   - provider template data
   - provider seed data
   - media model seed data
   - static model registry fallback
   - media generation metadata
4. Set an estimated character-based credit cost consistent with fal.ai pricing.
5. Keep the pricing estimate centralized and explicitly marked as provisional.

### 5.2 Gemini TTS input schema

1. The model must support:
   - `prompt`
   - `style_instructions`
   - `voice`
   - `language_code`
   - `speakers`
   - `temperature`
   - `output_format`
2. `style_instructions` is optional plain text helper content that prepends to the prompt and must never be treated as a media reference.
3. `voice` is the single-speaker preset.
4. `voice` is ignored by fal.ai when `speakers` is set, so the UI must keep it available but clearly label it as the single-speaker fallback.
5. The default `voice` preset is `Kore`.
6. `language_code` is optional, defaults to auto-detect when omitted, and must be exposed in the UI as a multilingual hint.
7. Gemini TTS does not support the generic top-level `speed` control used by other audio models; requests that include it must be rejected before submission.
8. `speakers` is the multi-speaker dialogue configuration.
9. The default `temperature` is `1`.
10. The default `output_format` is `mp3`.
11. The supported speaker cap is 32 rows.
12. Each speaker row must contain:
   - `speaker_id`
   - `voice`
13. Each `speaker_id` must be unique within the request.
14. Gemini TTS inputs must be closed to the documented fields only; unknown top-level or per-speaker keys must be rejected.
15. The UI should guide users to prefix script lines with the `speaker_id` aliases.

### 5.3 Media Studio behavior

1. Media Studio must render `speakers` as a structured array editor.
2. The editor should support add/remove row actions.
3. Each speaker row should allow editing of `speaker_id` and `voice`.
4. The single-speaker `voice` field should remain available.
5. `language_code` should render as an optional select with an auto-detect choice.
6. Array fields without nested `itemFields` should continue to render as a textarea fallback.
7. Media Studio should reject duplicate `speaker_id` aliases before submit.

### 5.4 Validation and submission

1. Nested required speaker fields must be validated before submit.
2. Server-side validation must reject malformed Gemini TTS payloads, unsupported top-level audio controls like `speed`, unknown Gemini-only keys, duplicate speaker aliases, invalid voice/language/output-format values, and speaker lists that exceed 32 rows.
3. Structured arrays must remain structured when passed into `extraParams`.
4. The audio generation payload must preserve the `speakers` array as objects.
5. Audio duplicate detection should consider the audio request shape so multi-speaker variations do not collapse into the same abuse hash.
6. When `speakers` is present, top-level `voice` must not affect abuse hashing because fal.ai ignores it for multi-speaker synthesis.
7. When `speakers` is absent, top-level `voice` must still affect abuse hashing so single-speaker requests remain distinguishable.

---

## 6. UX requirements

1. Users should be able to add one speaker row at a time.
2. The editor should show a clear cue that `speakers` is for dialogue, not raw JSON.
3. The UI should keep the interaction lightweight enough for simple narration to remain the default path.
4. The `language_code` control should make auto-detect the least-friction choice.
5. Duplicate speaker aliases should be flagged before submit so dialogue scripts are unambiguous.
6. The UI should reflect the documented defaults for `voice`, `temperature`, and `output_format` so users see the same baseline as the backend.
7. The `style_instructions` field should behave like plain text helper input, not a path or file picker.
8. The UI should show a short multi-speaker prompt example such as `Host: Welcome back.` / `Guest: Glad to be here.` and note that expressive tags like `[whispering]` or `[short pause]` are supported.

---

## 7. Data model requirements

1. `media_models.configJson.inputFields` must be able to represent nested array items.
2. Shared model-input helpers must preserve `itemFields` metadata when parsing config.
3. The static fallback registry must include the Gemini TTS model definition so the UI can still discover it when the DB cache is unavailable.
4. Gemini TTS validation must be enforced server-side in addition to any UI validation.
5. Gemini TTS payloads must be treated as a closed schema on the server.
6. Gemini TTS speaker caps and top-level `voice` canonicalization must be enforced consistently across UI, router, and generation-service paths.
7. `style_instructions` must remain plain text end-to-end and never be routed through media-reference resolution.

---

## 8. Acceptance criteria

1. The fal.ai provider template includes `fal-ai/gemini-3.1-flash-tts`.
2. The media-model seed inserts the model with the expected audio metadata.
3. Media Studio renders a structured multi-speaker editor for the model.
4. Media Studio exposes `language_code` with auto-detect support.
5. Nested required fields are validated before submit.
6. Duplicate `speaker_id` aliases are rejected before submit and on the server.
7. Invalid Gemini TTS payloads are rejected on the server before abuse checks and backend submission.
8. Unsupported top-level Gemini audio controls such as `speed` are rejected on the server before abuse checks and backend submission.
9. Unknown Gemini-specific keys are rejected on the server.
10. `extraParams.speakers` reaches the backend unchanged as an array of objects.
11. Top-level `voice` does not change the abuse hash when `speakers` is present.
12. The single-speaker `voice` field still affects abuse hashing when `speakers` is absent.
13. The relevant regression tests pass.
