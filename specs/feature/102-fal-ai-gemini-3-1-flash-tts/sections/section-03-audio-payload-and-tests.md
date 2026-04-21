# Section 03: Audio Payload And Tests

Keep the structured `speakers` array intact as it flows through the media router and generation service.

Validate Gemini payloads on the server before the request reaches the backend so malformed voice, language, speaker, unsupported speed, or unknown Gemini-only data cannot bypass the UI.

Keep `style_instructions` as plain text, even when it begins with path-like characters, so it is never resolved as a media reference.

Reject duplicate `speaker_id` aliases before submit and on the server so dialogue scripts remain unambiguous.

When `speakers` is present, top-level `voice` should be canonicalized out of the abuse hash because fal.ai ignores it for multi-speaker synthesis.

When `speakers` is absent, the single-speaker `voice` field should still contribute to the abuse hash as usual so legacy audio semantics stay intact.

Update the audio abuse/duplicate hash so requests that differ by speaker configuration are not treated as the same prompt.

Add regression tests for:

- fal.ai catalog presence
- recursive model-input parsing
- nested required field validation
- structured audio payload preservation
- server-side Gemini payload rejection
- closed-schema Gemini payload rejection
- alias resolution
- plain-text `style_instructions` handling
- single-speaker abuse-hash behavior
- legacy audio model fallback behavior
