# Section 02: Shared Input Schema And UI

Extend the shared model input contract so `array` fields can preserve nested `itemFields`.

Then add a reusable structured array editor and wire it into:

- `MediaStudio.tsx`
- `ModelInputFieldsPanel.tsx`

The Gemini TTS `language_code` field should render as an optional select with an auto-detect choice.

The Gemini TTS `speakers` field should be an array of objects with:

- `speaker_id`
- `voice`

The Gemini TTS defaults should stay visible in the UI and backend contract:

- `voice` defaults to `Kore`
- `temperature` defaults to `1`
- `output_format` defaults to `mp3`

The Gemini TTS `style_instructions` field should stay as plain text helper content that prepends to the prompt, and it must never be treated as a path or file reference.

The `speakers` list should cap out at 32 rows so the editor stays manageable and validation stays consistent with the backend.

The UI should keep the single-speaker `voice` field available while making the `speakers` editor the preferred path for dialogue, and it should clearly label `voice` as the single-speaker fallback because fal.ai ignores it when `speakers` is set.

Speaker aliases should be treated as unique per request, and any malformed nested speaker row should be caught before submit.
