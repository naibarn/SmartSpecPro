# TDD Plan - Feature 114 Gemini Omni Suite Media Assets

Date: 2026-05-21

## Test Strategy

Build tests from the inside out:

1. Shared validation and pricing.
2. Provider asset persistence and API validation.
3. Kie provider request/response parsing.
4. Skill package schema validation.
5. Media Studio UI behavior.
6. End-to-end generation orchestration with mocked provider calls.
7. Learning recommendation creation.

## Unit Tests

- `mediaModelInputs` parses hidden, advanced-only, provider asset picker, and reference unit metadata.
- Gemini Omni validation accepts valid prompt-only, image, source-video, character, audio, and mixed-reference cases.
- Gemini Omni validation rejects reference unit totals over 7.
- Gemini Omni validation rejects more than one source video.
- Gemini Omni validation rejects more than 3 character assets.
- Pricing returns every supplied matrix value.
- Pricing uses the with-video branch when a source video is present via any supported alias.
- Provider asset service enforces tenant ownership.
- Provider asset service rejects wrong capability IDs.
- Provider asset service deduplicates idempotent create retries.
- Provider asset schema enforces unique provider asset IDs per tenant/provider/capability.
- Provider asset service enforces owner/admin authorization for list/use/delete/restore/purge.
- Provider asset retention logic excludes soft-deleted assets and can purge expired assets idempotently.
- Skill schemas validate fixtures for single-shot, multi-shot, and storyboard outputs.

## Integration Tests

- Creating a Gemini Omni Audio asset stores `kieAudioId`.
- Creating a Gemini Omni Character asset stores `characterId`.
- Character creation can reference an existing Gemini Omni Audio asset.
- Gemini Omni Video generation sends selected character/audio provider IDs in extra params.
- Gemini Omni Video generation blocks invalid combinations before credit reservation.
- Provider failure after reservation voids/refunds credits according to existing credit ledger rules.
- Storyboard mode creates one media task per clip with shared run metadata.
- Storyboard partial failure preserves successful clips and retries only failed clips.
- Storyboard preflight blocks launch when total planned cost exceeds balance/budget.
- Storyboard preflight enforces per-user and per-tenant concurrency limits.
- Prompt QA failure creates a revisable state before generation.
- Video QA failure creates a learning signal after generation.

## UI Tests

- Gemini Omni Video no longer shows raw `audio_ids` as a normal textarea/JSON field.
- Reference Images picker is interactive when Gemini Omni Video supports images.
- Source Video picker is interactive and capped at one video.
- Empty character/audio pickers show create actions.
- Newly created character/audio assets are selected automatically.
- Credit estimate changes when a source video is selected.
- Quota meter blocks over-limit selection before generate.
- Character reference image over 20 MB is blocked before provider call.
- New Gemini Omni controls have Thai and English labels.
- Character/voice creation requires policy/consent acknowledgment when configured.
- Storyboard UI shows per-clip and total estimated cost, including skill/QA costs when applicable.
- Rate-limit/concurrency/budget blocks show disabled or deferred states without submitting provider jobs.

## Provider Tests

Python:

- `generate_video` keeps existing Gemini Omni video behavior.
- Character create posts to `/api/v1/omni/character/create`.
- Audio create posts to `/api/v1/omni/audio/create`.
- Character parser extracts `data.characterId`.
- Audio parser extracts `data.kieAudioId`.
- Provider errors are sanitized.
- Provider success normalization accepts both `code: 0` and `code: 200` only when expected `data` is present.

Node:

- asset create calls do not create fake video task IDs.
- video task calls keep existing polling path.
- asset create retry does not double-charge or duplicate stored assets.
- callback and polling terminal updates deduplicate the same provider task.
- provider rate-limit/capacity errors use deferred retry behavior where supported.
- provider-hosted result URLs are re-hosted before final user-visible completion.

## Security and Observability Tests

- Reference URL validation rejects private, loopback, link-local, metadata-service, local/internal, and unsafe redirect targets.
- Callback handler rejects invalid signature, stale timestamp, replayed event, and over-size body.
- Logs/audit records redact provider tokens, signed URL query strings, and raw private media payloads.
- Feature flag denial emits a safe diagnostic event.
- Skill contract snapshot test fails if required Director/QA output fields are removed.
- Unauthorized cross-tenant provider asset IDs return forbidden/not found without leaking existence.
- Asset delete/restore/purge audit events are emitted and redacted.

## Verification Commands

- `npm --prefix apps/web test -- --run apps/web/shared`
- `npm --prefix apps/web test -- --run apps/web/server/services`
- `npm --prefix apps/web test -- --run apps/web/client/src`
- `npm --prefix apps/web run check`
- `cd python-backend && DEBUG=false PYTEST_ADDOPTS=--no-cov uv run pytest tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py`
