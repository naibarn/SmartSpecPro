# Section 04: Python Provider Client

## Goal

Implement `MagnificProvider`, a provider-specific Python client that owns Magnific auth, endpoint lookup, payload normalization, status polling, result extraction, and error classification.

## Files In Scope

- `python-backend/app/llm_proxy/providers/magnific_provider.py`
- `python-backend/app/llm_proxy/providers/__init__.py`
- `python-backend/tests/unit/llm_proxy/test_magnific_provider.py`
- `python-backend/tests/unit/services/test_magnific_ssrf.py` or equivalent local path

## Implementation Requirements

### 1. Provider class

Create a provider class with methods:

- `generate_image(model_id, payload)`
- `edit_image(model_id, payload)`
- `generate_video(model_id, payload)`
- `upscale_video(model_id, payload)`
- `remove_background(payload)`
- `get_task_status(model_id, task_id, media_type)`
- `aclose()`

The class should accept API key, base URL, endpoint registry/config, and timeout settings.

### 2. Auth and base URL

Send `x-magnific-api-key` on every Magnific request.

Normalize base URL to `https://api.magnific.com` by default. Reject unsafe configured base URLs.

### 3. Endpoint registry

Use explicit model registry entries. Do not build endpoint paths from display names.

The registry should understand:

- image generation/edit/enhancement
- sync Remove Background
- video generation
- video upscaler

### 4. Response normalization

Async submit returns:

- provider id
- model id
- provider task id from `data.task_id`
- normalized status
- sanitized raw metadata

Status polling extracts:

- `data.generated[]`
- `data.image_url`
- `data.video_url`
- `data.output_url`
- equivalent family-specific documented fields from configured extractors

Unknown completed result shapes fail closed.

### 5. Sync Remove Background

`remove_background()` must:

- submit `image_url`
- receive `url`, `high_resolution`, `preview`, and/or `original`
- download/re-host immediately through the existing media storage path or return a normalized result that forces the caller to re-host before user delivery
- not enter long polling unless the gateway needs a short-lived task record for audit

### 6. Error handling

Classify:

- invalid auth
- rate limit
- provider unavailable
- validation error
- terminal task failure
- retryable poll failure
- timeout
- result extraction failure

Never include API key, auth headers, signed URLs, or base64 data in raised messages.

## TDD First

Write pytest tests:

- auth header is `x-magnific-api-key`
- exact submit/status paths are used
- Mystic submit/status normalizes task id and generated URLs
- Veo submit/status normalizes video output
- Remove Background sync response is handled without polling
- Video Upscaler Precision controls are serialized correctly
- unsafe input URLs are rejected
- unknown completed result shape raises sanitized terminal error
- `aclose()` closes the HTTP client

## Acceptance

This section is complete when provider tests cover representative image, sync image-set, video, and upscaler flows without needing the gateway or Celery tasks.

## Implementation Status

Status: COMPLETE WITH ENVIRONMENT CAVEAT

Implemented files:

- `python-backend/app/llm_proxy/providers/magnific_provider.py`
- `python-backend/app/llm_proxy/providers/__init__.py`
- `python-backend/tests/unit/llm_proxy/test_magnific_provider.py`

Implemented behavior:

- Added `MagnificProvider` with `generate_image`, `edit_image`, `generate_video`, `upscale_video`, `remove_background`, `get_task_status`, and `aclose`.
- Added explicit endpoint registry coverage for the 34 phase-one Magnific model ids.
- Added public HTTPS base URL normalization and unsafe host rejection.
- Added `x-magnific-api-key` auth on every request.
- Added async submit normalization, status normalization, output URL extraction, sync Remove Background handling with `requires_rehost`, and categorized sanitized errors.
- Added tests for auth/path shape, Mystic submit/status, Veo video status, Remove Background sync flow, Video Upscaler controls, unsafe input URL rejection, unknown completed result shape handling, and `aclose`.

Verification:

- `python3 -m py_compile python-backend/app/llm_proxy/providers/magnific_provider.py python-backend/tests/unit/llm_proxy/test_magnific_provider.py` passed.
- `uv run pytest python-backend/tests/unit/llm_proxy/test_magnific_provider.py -q` could not run because `pytest` is not installed in this environment.
- Direct import smoke testing could not run because this Python environment does not have `httpx` installed.

Security review:

- PASS WITH ENVIRONMENT CAVEAT. Static review found no HIGH or CRITICAL issues; runtime pytest execution remains blocked by missing Python test dependencies.
