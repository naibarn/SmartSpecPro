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

## Completion Criteria

- Backend can create provider assets and return stable IDs for storage.
- Video task generation remains unchanged except for validated extra params.
