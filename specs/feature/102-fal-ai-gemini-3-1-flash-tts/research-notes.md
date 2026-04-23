# Research Notes

## Repo scan

Relevant existing fal.ai media surfaces live in:

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/seed-media-models-fal-ai.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`

Existing audio models already include Lux TTS, OmniVoice TTS, GPT-4o Mini TTS, TTS-1, and UVoice variants.

## fal.ai docs

Official fal.ai docs for `fal-ai/gemini-3.1-flash-tts` show:

- required `prompt`
- optional `style_instructions`
- single-speaker `voice`
- optional `language_code` with auto-detect when omitted
- multi-speaker `speakers` array
- `temperature`
- `output_format`

The docs also show that each speaker entry needs a `speaker_id` alias and a `voice`, and that `voice` is ignored when `speakers` is provided.

The docs further imply sensible UI defaults for the model: `voice=Kore`, `temperature=1`, and `output_format=mp3`.

The current codebase enforces a `speakers` cap of 32 rows so the editor stays manageable and the payload remains bounded.

The Gemini 3.1 Flash TTS schema does not advertise a generic top-level `speed` control, so the safest contract is to reject it rather than forwarding it from other audio model flows.

The model docs do not advertise any Gemini-specific free-form extra parameters beyond the documented fields, so the safest contract is to allowlist only the documented keys and reject everything else.

Source:

- https://fal.ai/models/fal-ai/gemini-3.1-flash-tts/api

## Key implementation observations

1. `mediaModelInputs.ts` currently needs recursive array support because structured array fields do not preserve `itemFields`.
2. `MediaStudio.tsx` already passes `extraParams` through unchanged, so a structured `speakers` object array can be submitted without special backend serialization.
3. `ModelInputFieldsPanel.tsx` is shared by multiple presentation and editor surfaces, so it should also understand structured arrays.
4. The audio abuse guard currently hashes only text + model, which can create duplicate-loop false positives when multi-speaker parameters differ.
5. Gemini validation needs to live on the server, not only in the UI, because direct API callers can bypass client-side checks.
6. Duplicate speaker aliases need to be checked before submit so the model is not handed ambiguous dialogue tags.
