# Section 03: Python Runtime and Recovery

## Goal

Add WaveSpeed execution support to the Python media pipeline using the same async architecture already used for queued media providers:

- submit request
- persist provider task metadata
- poll until completion
- map result and failure states back into the current task model

This section depends on Section 01 for provider/model normalization and on Section 02 for the final model metadata contract.

## Files in scope

- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/services/media_provider_service.py`
- any provider-adapter module introduced for WaveSpeed-specific HTTP handling
- corresponding Python tests

## Implementation requirements

### 1. Provider initialization and configuration

Ensure the Python backend can fetch WaveSpeed credentials from the shared `media_providers` table using the canonical provider key `wavespeed_ai`.

If a provider-specific initializer is added, it should:

- default to the official API root when no custom base URL is stored
- normalize a service root to `/api/v3`
- avoid introducing a generic OpenAI-compatible shortcut, because the WaveSpeed video contract is submit/poll based rather than chat-completions based
- reuse the same relative-only endpoint contract from the web side rather than accepting arbitrary absolute endpoint overrides

### 2. Submit payload mapping

Map the existing internal request shape into the WaveSpeed launch-model payload:

| Internal field | Upstream field |
|----------------|----------------|
| prompt | prompt |
| referenceImageUrls | images |
| aspectRatio | aspect_ratio |
| duration | duration |

Runtime validation must refuse:

- empty prompt
- more than four images
- unsupported aspect ratios
- unsupported durations

The launch model is dual-mode, so the submit adapter must accept:

- prompt with no images
- prompt with one to four images

### 3. Endpoint construction

Use the normalized base URL from Section 01 and construct:

- submit endpoint: `/wavespeed-ai/cinematic-video-generator`
- poll endpoint template: `/predictions/{requestId}/result`

The implementation must preserve the invariant that `/api/v3` is appended at most once.

### 4. Submission and recovery payload

Persist a stable recovery payload in `task.result_data` immediately after submit succeeds. Required keys:

- `submission.provider`
- `submission.provider_model_id`
- `submission.provider_task_id`
- `submission.submit_endpoint`
- `submission.result_endpoint_template`
- `submission.used_sync_mode`
- `submission.request_summary`

`submission.used_sync_mode` must always be `false`.

The recovery payload should be complete enough that a retry or worker restart can continue polling without reconstructing the original request heuristically.

`submission.request_summary` must be a sanitized whitelist object only. It should include implementation-relevant fields such as:

- `prompt_length`
- `has_reference_images`
- `reference_image_count`
- `aspect_ratio`
- `duration`
- `requested_duration`
- `requested_resolution` when relevant

It must not include:

- raw prompt text
- raw reference image URLs
- API keys
- authorization headers
- callback URLs with embedded secrets or tokens

### 5. Polling and state normalization

Map WaveSpeed responses into internal task states using this contract:

- `data.id` -> provider task id
- `data.status` -> raw upstream status
- `data.outputs[0]` -> final result URL
- `data.error` -> terminal failure detail

Normalized states:

- `created`, `processing` -> processing
- `completed` with valid `data.outputs[0]` -> success
- `failed` or terminal error payload -> failure
- unknown non-empty status -> processing, but store the raw status for observability

Do not use `data.urls.get` as the final media asset. It may be stored as a poll/follow-up hint, but success should still require an actual media URL in `data.outputs[0]`.

Before a final result URL is persisted or exposed, validate it as a public-safe URL. A private/internal result URL should be treated as terminal provider failure instead of a successful completion.

### 6. Polling backoff and timeout contract

Polling should use deterministic v1 defaults:

- first poll roughly 3 seconds after successful submission
- exponential backoff between polls
- cap steady-state poll interval at 15 seconds
- honor upstream `Retry-After` when present and larger than the current interval
- treat timeout, `429`, and transient `5xx` responses as retryable
- cap total polling lifetime at 30 minutes from successful submission
- after the cap is reached, fail the task with an explicit timeout reason while retaining raw upstream status metadata

### 7. Pricing fallback alignment

Python-side cost estimation in `gateway_unified.py` must honor the same duration tiers even when the DB path is unavailable. The implementation should align with the Section 01 fallback contract so TS and Python cost estimates do not diverge.

### 8. Billing reconciliation contract

Treat the requested duration as the authoritative billing duration for v1. If upstream does not return a better authoritative duration field, persist `result_data.actual_duration = requested_duration` on success so the existing reconciliation flow remains aligned with the reserved credits instead of generating accidental refund/charge drift.

## Tests to write first

- Pytest: WaveSpeed provider config is resolved with the canonical provider key.
- Pytest: base URL normalization handles both service root and API root correctly.
- Pytest: submit payload maps prompt, images, aspect ratio, and duration to the expected upstream fields.
- Pytest: more than four images is rejected before outbound submit.
- Pytest: poll endpoint is constructed as `/predictions/{requestId}/result`.
- Pytest: `created` and `processing` remain non-terminal.
- Pytest: `completed` with `data.outputs[0]` succeeds and stores the result URL.
- Pytest: `failed` or terminal `data.error` fails the task.
- Pytest: recovery payload stores the required `submission.*` fields.
- Pytest: `data.urls.get` is not treated as the final media asset.
- Pytest: `submission.request_summary` is sanitized and does not contain prompt text, secrets, or raw URLs.
- Pytest: a private/internal final result URL is rejected before persistence.
- Pytest: `429`, timeout, and transient `5xx` polling failures retry with backoff.
- Pytest: the polling loop fails with an explicit timeout after the 30-minute cap.
- Pytest: successful completion stores `result_data.actual_duration = requested_duration` when upstream omits a better authoritative value.

## Acceptance criteria

- Python workers can submit and poll the WaveSpeed launch model using stored provider credentials.
- Recovery metadata is sufficient for retries and restarts.
- Final success requires a true media output URL, not just a polling link.
- Python-side cost estimation stays aligned with the same duration tiers defined on the web side.
- Polling behavior is deterministic, bounded, and resilient to transient upstream failures.
- Recovery/debug payloads are useful without storing sensitive request data.

## Implementation Notes

Implemented in:

- `python-backend/app/llm_proxy/providers/wavespeed_media_provider.py`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/services/media_provider_service.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/tasks/__init__.py`
- `python-backend/app/core/celery_app.py`

Deviation from plan: the async polling contract was implemented as a dedicated `poll_wavespeed_video_task` Celery task on the existing `media` queue, with the restart-safe submission payload stored under `task.result_data.submission`.

## Tests

- `python-backend/tests/unit/test_media_provider_service_wavespeed.py`
- `python-backend/tests/unit/llm_proxy/test_wavespeed_media_provider.py`
- `python-backend/tests/unit/llm_proxy/test_gateway_unified_wavespeed.py`
- `python-backend/tests/tasks/test_media_tasks_wavespeed.py`
