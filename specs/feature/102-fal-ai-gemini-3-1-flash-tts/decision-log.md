# Decision Log

## Planning depth

Chosen depth: `standard`

Reason:

- the change touches catalog data, shared model input parsing, Media Studio rendering, and tests
- the architecture is already established, so this is a bounded extension rather than a new subsystem
- the work is cross-file, but the integration points are known

## Product decisions

1. Add `fal-ai/gemini-3.1-flash-tts` as a new `audio` model alongside the existing fal.ai TTS entries.
2. Keep `fal-ai/lux-tts` in place rather than replacing it.
3. Model the multi-speaker API as a top-level `speakers` array with `itemFields`.
4. Keep `voice` as the single-speaker fallback.
5. Expose `language_code` as an optional multilingual hint with auto-detect behavior.
6. Use a structured array editor in Media Studio instead of a textarea for fields that declare `itemFields`.
7. Preserve textarea fallback for simple array fields.
8. Update the audio duplicate/abuse hash to include the audio request shape, not only the raw text.
9. Enforce Gemini-specific payload validation on the server before request submission.
10. Treat Gemini TTS `extraParams` as a closed allowlist instead of a free-form bag.
11. Reject duplicate `speaker_id` aliases before submit and on the server.
12. Canonicalize top-level `voice` out of Gemini duplicate detection when `speakers` is present, because the backend ignores that field in multi-speaker mode.

## Risks

1. If the array editor only handles a narrow set of subfield types, future model schemas may need a follow-up expansion.
2. If required nested fields are not validated recursively, users could submit malformed speaker rows.
3. If the fal.ai pricing assumptions differ from the docs snapshot, the credit estimate may need a post-merge adjustment.
4. If Gemini payload validation lives only in the UI, direct API callers could still submit malformed requests.
