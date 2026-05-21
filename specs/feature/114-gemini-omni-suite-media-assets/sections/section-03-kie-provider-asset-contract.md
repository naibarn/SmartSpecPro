# Section 03: Kie Provider Asset Contract

## Goal

Add Gemini Omni Character and Audio asset creation support while preserving existing Gemini Omni Video task behavior.

## What This Section Must Change

- Keep `gemini-omni-video` on `/api/v1/jobs/createTask` and polling through `/api/v1/jobs/recordInfo`.
- Add Kie provider methods for:
  - `/api/v1/omni/character/create`
  - `/api/v1/omni/audio/create`
- Parse:
  - `data.characterId`
  - `data.kieAudioId`
- Return normalized asset creation results to Node.
- Sanitize provider errors.
- Preserve video trim fields as provider-compatible `video_list[].start` and `video_list[].ends`.
- Support idempotent app-level retries without duplicate stored assets or duplicate platform charges.
- Normalize success responses that use either `code: 0` or `code: 200` when expected data exists.
- Support optional callback URL submission when a safe configured callback URL is available.
- Preserve polling/recovery as the fallback and deduplicate terminal updates from callback and polling.
- Classify provider rate-limit/capacity responses as retryable/deferred where existing media retry handling supports it.
- Map provider errors and unknown response shapes to stable Gemini Omni reason codes.
- Treat unknown/missing expected data as provider contract drift and fail closed.
- Define a versioned Node-to-Python bridge contract for Gemini Omni asset creation and video submission.
- Persist/return distinct internal task ID, provider task ID, provider asset ID, storyboard run ID, and clip ID fields without overloading names.
- Include Gemini Omni contract version in provider bridge metadata.

## Files Likely Touched

- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- Python provider tests
- Node media provider bridge/service if it routes asset creation through Python

## Tests

- existing Gemini Omni video tests still pass
- character create request payload matches provider contract
- audio create request payload matches provider contract
- character response extracts `characterId`
- audio response extracts `kieAudioId`
- asset create does not require or fabricate task IDs
- asset create errors are sanitized
- `video_list` trim fields keep provider's `ends` spelling
- response code `0` and `200` success variants are handled safely
- callback and polling terminal updates do not double-complete or double-refund
- rate-limit/capacity paths do not immediately fail recoverable requests
- unknown response shapes fail closed with `gemini_omni_provider_contract_drift`
- user-facing errors use stable reason codes and sanitized messages
- Node/Python fixture tests agree on request and normalized response fields
- task and asset identifiers are never conflated in callback/polling/provider bridge fixtures
- unsupported bridge contract versions fail closed with stable reason codes

## Completion Criteria

- Backend can create provider assets and return stable IDs for storage.
- Video task generation remains unchanged except for validated extra params.
- Provider integration failures are diagnosable without raw provider payload exposure.
- Node and Python cannot drift silently on Gemini Omni request/response shape.
- Rolling deploys can tolerate supported contract versions and reject unsupported ones safely.
