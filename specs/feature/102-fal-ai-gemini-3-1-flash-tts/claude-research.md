# Research Notes

## Repo Scan

Relevant existing fal.ai media surfaces live in:

- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/seed-media-models-fal-ai.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`
- `apps/web/client/src/components/media/ModelInputArrayFieldEditor.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`

Existing audio models already include Lux TTS, OmniVoice TTS, GPT-4o Mini TTS, TTS-1, UVoice variants, and other provider-specific TTS flows.

## fal.ai Docs

Official fal.ai docs for `fal-ai/gemini-3.1-flash-tts` show:

- `prompt` is required
- `style_instructions` is optional and prepended to the prompt
- `voice` is the single-speaker preset and is ignored when `speakers` is present
- `language_code` is optional and auto-detects when omitted
- `speakers` is a structured multi-speaker array with `speaker_id` and `voice`
- `temperature` defaults to `1`
- `output_format` defaults to `mp3`
- the current codebase enforces a 32-row speaker cap
- expressive tags like `[sigh]`, `[laughing]`, `[whispering]`, and `[short pause]` are documented

The model page also shows that the speaker aliases should match prefixes in the prompt, and that Gemini 3.1 Flash TTS is intended for expressive multi-speaker dialogue as well as simple narration.

Source:

- https://fal.ai/models/fal-ai/gemini-3.1-flash-tts/api

## Key Implementation Observations

1. `mediaModelInputs.ts` needs recursive array support so `itemFields` survive parsing and default row helpers can populate nested speaker rows.
2. `MediaStudio.tsx` already passes `extraParams` through unchanged, so a structured `speakers` object array can be submitted without special backend serialization.
3. `ModelInputFieldsPanel.tsx` is shared by multiple presentation and editor surfaces, so it should also understand structured arrays.
4. The audio abuse guard must consider the request shape, not only the raw prompt text, so multi-speaker variations do not collapse into the same duplicate key.
5. Gemini validation must live on the server, not only in the UI, because direct API callers can bypass client-side checks.
6. Gemini TTS should remain a closed schema on the server so unsupported fields do not drift into backend payloads.
7. The existing test stack for this repo is Vitest, with server tests running under `node` and client tests under `jsdom`.

## Testing

- Test runner: `vitest`
- Main command: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 vitest run`
- Server test files: `apps/web/server/**/*.test.ts`
- Client test files: `apps/web/client/src/**/*.test.ts` and `apps/web/client/src/**/*.test.tsx`
- Shared test setup: `apps/web/client/src/test-setup.ts`
- Mocking style: `vi.mock(...)`, `vi.hoisted(...)`, and focused contract tests around router/service boundaries
