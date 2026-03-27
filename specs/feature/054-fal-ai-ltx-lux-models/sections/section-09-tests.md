That section file has incomplete content (just a line of text). That is fine -- I will reference section-03 by what it should contain based on the plan documents. I now have all the information I need.

# Section 09: Python Unit Tests for FalAIProvider

## Section Metadata

| Field | Value |
|-------|-------|
| Section ID | `section-09-tests` |
| Title | Python Unit Tests for FalAIProvider |
| Depends On | section-03-python-provider, section-04-gateway-routing, section-05-celery-polling |
| Blocks | None |
| Files Created | `python-backend/tests/unit/services/test_fal_ai_provider.py`, `python-backend/tests/unit/services/test_fal_ai_ssrf.py` |
| Files Modified | None |

## Overview

This section creates comprehensive Python unit tests for the `FalAIProvider` class (section-03), covering all three generation methods (video, audio, image), queue operations, SSRF validation, prompt sanitization, error handling, video file size limits, and resource cleanup. Tests use `pytest` with `unittest.mock` for mocking `httpx` responses, following the project pattern established by `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py`.

## Background Context

### FalAIProvider Class (from section-03)

The provider lives at `/home/dev/projects/SmartSpecPro/python-backend/app/llm_proxy/providers/fal_ai_provider.py` and has the following shape:

- **Class constants:**
  - `BASE_URL = "https://fal.run"` (sync endpoint)
  - `QUEUE_BASE_URL = "https://queue.fal.run"` (async queue endpoint)
  - `VIDEO_MODELS: frozenset[str]` -- 7 LTX-2.3 model IDs
  - `AUDIO_MODELS: frozenset[str]` -- `{"fal-ai/lux-tts"}`
  - `IMAGE_MODELS: frozenset[str]` -- 4 Flux model IDs

- **Constructor:** `__init__(self, api_key: str, base_url: str | None = None)` -- creates `httpx.AsyncClient(timeout=300.0)` with `Authorization: Key {api_key}` header.

- **Methods:**
  - `_validate_urls(self, params: dict) -> None` -- SSRF validation + `host.docker.internal` rejection + video file size HEAD check
  - `_sanitize_prompt(self, prompt: str) -> str` -- strip HTML/XML tags
  - `generate_video(self, model_id: str, params: dict) -> dict` -- queue submission, returns `{id, status: PROCESSING, ...}`
  - `generate_audio(self, model_id: str, params: dict) -> dict` -- sync TTS, returns `{data: [{url}], status: COMPLETED}`
  - `generate_image(self, model_id: str, params: dict) -> dict` -- sync Flux, returns `{data: [{url}], status: COMPLETED}`
  - `_submit_queue(self, model_id: str, params: dict) -> str` -- POST to `queue.fal.run/{model_id}`, returns request_id
  - `get_queue_status(self, model_id: str, request_id: str) -> dict` -- GET queue status
  - `get_queue_result(self, model_id: str, request_id: str) -> dict` -- GET completed result, normalize to `{data: [{url}], actual_duration, actual_resolution}`
  - `aclose(self) -> None` -- close httpx client

- **Error mapping:** 401 -> "Invalid fal.ai API key", 422 -> "Content policy rejection", 429 -> "fal.ai rate limit exceeded", other -> "fal.ai error (HTTP {status})"

### SSRF Validation (from section-03 + section-06)

`_validate_urls()` checks all user-supplied URL fields (`image_url`, `end_image_url`, `audio_url`, `video_url`):
1. Calls `validate_uri_no_ssrf()` from `/home/dev/projects/SmartSpecPro/python-backend/app/core/media_job_validators.py` -- rejects private IPs, localhost, file:// scheme
2. Explicitly rejects `host.docker.internal` -- the global validator whitelists it, but fal.ai URL fields must NOT allow it
3. For `video_url` fields: sends HEAD request to check `Content-Length`, rejects > 500MB

### Existing Test Patterns

The BytePlus provider tests at `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py` demonstrate the project pattern:
- `pytest` with `unittest.mock.AsyncMock` and `MagicMock`
- Test classes grouped by feature: `TestConstants`, `TestInit`, `TestGenerateImage`, etc.
- Direct provider instantiation with `api_key="test-key"`
- Mock `httpx.AsyncClient` responses
- Use `structlog.testing.capture_logs()` for verifying no secrets in logs

## Tests

### Test File 1: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_fal_ai_provider.py`

```python
"""
Unit tests for FalAIProvider.

Tests cover:
- Class constants (VIDEO_MODELS, AUDIO_MODELS, IMAGE_MODELS)
- Constructor behavior (auth header format, timeout, base_url override)
- Video generation (queue submission, returns request_id + PROCESSING status)
- Audio generation (sync TTS, returns data with audio URL + COMPLETED status)
- Image generation (sync Flux, returns data with image URL + COMPLETED status)
- Queue operations (submit, status polling, result normalization)
- Error handling (401, 422, 429, other HTTP errors)
- Error message sanitization (no response body in errors)
- Prompt sanitization (HTML tag stripping)
- Resource cleanup (aclose closes httpx client)
- Auth header uses "Key {api_key}" format (not Bearer)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.llm_proxy.providers.fal_ai_provider import FalAIProvider


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

# @pytest.fixture
# def provider() -> FalAIProvider:
#     """Create FalAIProvider with test API key."""
#     ...returns FalAIProvider(api_key="test-fal-key")...

# @pytest.fixture
# def mock_httpx_response():
#     """Create a reusable mock httpx.Response factory."""
#     ...factory that creates MagicMock with status_code, json(), raise_for_status()...


# ---------------------------------------------------------------------------
# Class Constants
# ---------------------------------------------------------------------------

class TestFalAIProviderConstants:
    """Verify class-level constants are correct."""

    # Test: VIDEO_MODELS contains exactly 7 LTX-2.3 model IDs
    # Test: AUDIO_MODELS contains exactly 1 entry: "fal-ai/lux-tts"
    # Test: IMAGE_MODELS contains exactly 4 Flux model IDs
    # Test: All model sets are frozenset (immutable)
    # Test: VIDEO_MODELS includes "fal-ai/ltx-2.3/text-to-video"
    # Test: VIDEO_MODELS includes "fal-ai/ltx-2.3/text-to-video/fast"
    # Test: VIDEO_MODELS includes "fal-ai/ltx-2.3/image-to-video"
    # Test: VIDEO_MODELS includes "fal-ai/ltx-2.3/image-to-video/fast"
    # Test: VIDEO_MODELS includes "fal-ai/ltx-2.3/audio-to-video"
    # Test: VIDEO_MODELS includes "fal-ai/ltx-2.3/extend-video"
    # Test: VIDEO_MODELS includes "fal-ai/ltx-2.3/retake-video"
    # Test: IMAGE_MODELS includes "fal-ai/flux/schnell", "fal-ai/flux/dev", "fal-ai/flux-pro", "fal-ai/stable-diffusion-v3-medium"


# ---------------------------------------------------------------------------
# __init__
# ---------------------------------------------------------------------------

class TestFalAIProviderInit:
    """Verify constructor behavior."""

    # Test: Authorization header uses "Key {api_key}" format (NOT "Bearer")
    # Test: httpx client timeout is 300.0 seconds
    # Test: default base_url is "https://fal.run" when not overridden
    # Test: base_url can be overridden via constructor param
    # Test: API key is NOT logged during __init__ (use structlog.testing.capture_logs)


# ---------------------------------------------------------------------------
# Video Generation (Queue-based)
# ---------------------------------------------------------------------------

class TestGenerateVideo:
    """Test generate_video method (async queue submission)."""

    # Test: POSTs to queue.fal.run/{model_id} with correct Authorization header
    # Test: returns dict with "id" containing request_id and "status" == "PROCESSING"
    # Test: calls _validate_urls before HTTP request
    # Test: sanitizes prompt (strips HTML tags) before sending
    # Test: passes extra params (resolution, duration, etc.) in POST body
    # Test: raises ValueError on HTTP 401 with message "Invalid fal.ai API key"
    # Test: raises ValueError on HTTP 422 with message "Content policy rejection"
    # Test: raises ValueError on HTTP 429 with message "fal.ai rate limit exceeded"
    # Test: raises ValueError on HTTP 500 with message "fal.ai error (HTTP 500)" -- no body


# ---------------------------------------------------------------------------
# Audio Generation (Synchronous TTS)
# ---------------------------------------------------------------------------

class TestGenerateAudio:
    """Test generate_audio method (sync Lux TTS)."""

    # Test: POSTs to fal.run/{model_id} synchronously (not queue endpoint)
    # Test: returns dict with "data": [{"url": "..."}] and "status": "COMPLETED"
    # Test: normalizes fal.ai response to extract audio URL
    # Test: calls _validate_urls for audio_url field in params
    # Test: sanitizes prompt before sending
    # Test: raises ValueError on HTTP errors with sanitized messages


# ---------------------------------------------------------------------------
# Image Generation (Synchronous Flux)
# ---------------------------------------------------------------------------

class TestGenerateImage:
    """Test generate_image method (sync Flux)."""

    # Test: POSTs to fal.run/{model_id} synchronously
    # Test: returns normalized result dict with image URL
    # Test: sanitizes prompt before sending
    # Test: raises ValueError on HTTP errors with sanitized messages


# ---------------------------------------------------------------------------
# Queue Operations
# ---------------------------------------------------------------------------

class TestQueueOperations:
    """Test queue submission, status polling, and result retrieval."""

    # Test: _submit_queue POSTs to queue.fal.run/{model_id} and extracts request_id from response
    # Test: get_queue_status GETs {queue_base_url}/{model_id}/requests/{request_id}/status
    # Test: get_queue_status returns dict with "status" field (IN_QUEUE, IN_PROGRESS, COMPLETED)
    # Test: get_queue_result GETs {queue_base_url}/{model_id}/requests/{request_id}
    # Test: get_queue_result normalizes response -- extracts video URL into data[0].url
    # Test: get_queue_result extracts actual_duration from fal.ai response
    # Test: get_queue_result derives actual_resolution from video width:
    #        width >= 3840 -> "2160p", width >= 2560 -> "1440p", else -> "1080p"
    # Test: get_queue_result with width=3840 returns actual_resolution="2160p"
    # Test: get_queue_result with width=2560 returns actual_resolution="1440p"
    # Test: get_queue_result with width=1920 returns actual_resolution="1080p"
    # Test: get_queue_result with width=1280 returns actual_resolution="1080p" (fallback)


# ---------------------------------------------------------------------------
# Error Handling & Message Sanitization
# ---------------------------------------------------------------------------

class TestErrorHandling:
    """Test error mapping and message sanitization."""

    # Test: 401 response -> ValueError("Invalid fal.ai API key")
    # Test: 422 response -> ValueError("Content policy rejection")
    # Test: 429 response -> ValueError("fal.ai rate limit exceeded")
    # Test: 503 response -> ValueError("fal.ai error (HTTP 503)")
    # Test: error messages NEVER include response body content
    # Test: error messages NEVER include the API key


# ---------------------------------------------------------------------------
# Prompt Sanitization
# ---------------------------------------------------------------------------

class TestPromptSanitization:
    """Test _sanitize_prompt method."""

    # Test: strips <script>alert('xss')</script> -> "alert('xss')"
    # Test: strips <img src=x onerror=alert(1)> from prompt
    # Test: strips <b>bold</b> -> "bold"
    # Test: preserves plain text prompt unchanged ("A cat on a rooftop" -> same)
    # Test: handles empty prompt string -> returns ""
    # Test: handles prompt with only tags -> returns ""
    # Test: strips nested tags: <div><span>text</span></div> -> "text"


# ---------------------------------------------------------------------------
# Resource Cleanup
# ---------------------------------------------------------------------------

class TestAclose:
    """Test aclose method."""

    # Test: aclose() calls httpx client.aclose()
    # Test: aclose() is safe to call multiple times
```

### Test File 2: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_fal_ai_ssrf.py`

```python
"""
SSRF validation tests for FalAIProvider.

Tests cover:
- Internal/private IP rejection (169.254.x.x, 10.x.x.x, 192.168.x.x, 127.0.0.1)
- host.docker.internal explicitly rejected (overrides global whitelist)
- Public HTTPS URLs allowed
- Validation applies to all URL fields (image_url, end_image_url, audio_url, video_url)
- None/missing URL fields handled (skipped, no error)
- Video file size limit (HEAD check, >500MB rejected)
- Prompt sanitization for HTML/XML tags
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.llm_proxy.providers.fal_ai_provider import FalAIProvider


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

# @pytest.fixture
# def provider() -> FalAIProvider:
#     """Create FalAIProvider with test API key."""
#     ...returns FalAIProvider(api_key="test-fal-key")...


# ---------------------------------------------------------------------------
# SSRF: Blocked Internal IPs/Hosts
# ---------------------------------------------------------------------------

class TestSsrfBlockedUrls:
    """Test that internal/private URLs are rejected by _validate_urls."""

    # Test: rejects http://169.254.169.254/latest/meta-data (AWS metadata endpoint)
    # Test: rejects http://localhost:8000/api/admin
    # Test: rejects http://127.0.0.1:3000/internal
    # Test: rejects http://10.0.0.1/private (Class A private)
    # Test: rejects http://10.255.255.255/end (Class A private edge)
    # Test: rejects http://192.168.1.1/private (Class C private)
    # Test: rejects http://172.16.0.1/private (Class B private)
    # Test: rejects http://172.31.255.255/end (Class B private edge)
    # Test: rejects http://0.0.0.0:3000 (all-interfaces bind)


# ---------------------------------------------------------------------------
# SSRF: host.docker.internal Explicitly Blocked
# ---------------------------------------------------------------------------

class TestHostDockerInternalBlocked:
    """Test that host.docker.internal is explicitly rejected.

    The global validate_uri_no_ssrf() in media_job_validators.py ALLOWS
    host.docker.internal for Docker workers. But FalAIProvider._validate_urls()
    must REJECT it because fal.ai URL fields should NOT access internal Node.js API.
    """

    # Test: rejects http://host.docker.internal:8000/api (explicit reject)
    # Test: rejects https://host.docker.internal:3000/internal
    # Test: rejects http://HOST.DOCKER.INTERNAL:8000 (case-insensitive)


# ---------------------------------------------------------------------------
# SSRF: Allowed Public URLs
# ---------------------------------------------------------------------------

class TestSsrfAllowedUrls:
    """Test that public URLs pass validation."""

    # Test: allows https://example.com/image.png
    # Test: allows https://v3b.fal.media/files/example.mp4
    # Test: allows https://storage.googleapis.com/bucket/file.wav
    # Test: allows https://cdn.fal.ai/outputs/video.mp4


# ---------------------------------------------------------------------------
# SSRF: Validates All URL Fields
# ---------------------------------------------------------------------------

class TestSsrfUrlFieldCoverage:
    """Test that validation applies to all URL-type fields in params."""

    # Test: validates image_url field
    # Test: validates end_image_url field
    # Test: validates audio_url field
    # Test: validates video_url field
    # Test: passes when URL field is None (skips validation for that field)
    # Test: passes when URL field is absent from params (skips)
    # Test: only URL fields are validated (non-URL params like "prompt" are not URL-checked)


# ---------------------------------------------------------------------------
# Video File Size Limit (HEAD Check)
# ---------------------------------------------------------------------------

class TestVideoFileSizeLimit:
    """Test video_url file size validation via HEAD request."""

    # Test: sends HEAD request for video_url field (not image_url or audio_url)
    # Test: allows video_url with Content-Length <= 500MB (524288000 bytes)
    # Test: rejects video_url with Content-Length > 500MB (e.g., 600MB)
    # Test: handles missing Content-Length header gracefully (allows the request)
    # Test: handles HEAD request failure gracefully (allows the request -- fail open on size check)
    # Test: does NOT send HEAD for image_url or audio_url (only video_url)
```

## Implementation Guidance

### Mocking Strategy

Both test files should mock `httpx.AsyncClient` at the provider level. Use `unittest.mock.patch` to replace the httpx client on the provider instance:

```python
# Pattern for mocking httpx responses
@pytest.fixture
def provider():
    p = FalAIProvider(api_key="test-fal-key")
    p.client = AsyncMock()  # Replace real httpx client with mock
    return p

# For a successful response:
mock_response = MagicMock()
mock_response.status_code = 200
mock_response.json.return_value = {"request_id": "abc123"}
mock_response.raise_for_status = MagicMock()  # No-op for success
provider.client.post = AsyncMock(return_value=mock_response)

# For an error response:
mock_response = MagicMock()
mock_response.status_code = 401
mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
    "401", request=MagicMock(), response=mock_response
)
```

### SSRF Test Mocking

For SSRF tests, the `_validate_urls` method calls `validate_uri_no_ssrf()` from `app.core.media_job_validators`. Tests should NOT mock this function -- they should let it run against the actual SSRF validator to verify real behavior. However, `_is_private_ip()` in the validator does DNS resolution via `socket.getaddrinfo()`, which should be patched to avoid network calls in tests:

```python
# Patch DNS resolution to return a controlled IP
@patch("app.core.media_job_validators.socket.getaddrinfo")
def test_rejects_private_ip(self, mock_dns, provider):
    mock_dns.return_value = [(None, None, None, None, ("10.0.0.1", 0))]
    with pytest.raises(ValueError):
        provider._validate_urls({"image_url": "http://10.0.0.1/private"})
```

For `host.docker.internal` tests, the validator already has a hostname check (no DNS needed), so no DNS mocking is required -- but the provider must add its own explicit reject AFTER `validate_uri_no_ssrf` allows it.

### Video File Size HEAD Check Mocking

For the video file size limit tests, mock the HEAD request on the httpx client:

```python
# Mock HEAD response with Content-Length
mock_head_response = MagicMock()
mock_head_response.headers = {"Content-Length": str(600 * 1024 * 1024)}  # 600MB
mock_head_response.raise_for_status = MagicMock()
provider.client.head = AsyncMock(return_value=mock_head_response)
```

### Prompt Sanitization Verification

To verify prompts are sanitized before HTTP calls, inspect the body passed to `client.post`:

```python
# After calling generate_video with a prompt containing HTML:
provider.client.post.assert_called_once()
call_kwargs = provider.client.post.call_args
body = call_kwargs[1].get("json", {}) or call_kwargs[0][1] if len(call_kwargs[0]) > 1 else {}
assert "<script>" not in str(body)
```

### Running the Tests

```bash
# Run only the fal.ai provider tests
cd /home/dev/projects/SmartSpecPro/python-backend
pytest tests/unit/services/test_fal_ai_provider.py tests/unit/services/test_fal_ai_ssrf.py -v

# Run with coverage
pytest tests/unit/services/test_fal_ai_provider.py tests/unit/services/test_fal_ai_ssrf.py --cov=app.llm_proxy.providers.fal_ai_provider -v

# Run full test suite to verify no regressions
pytest
```

### Test Organization Notes

- Tests are placed in `tests/unit/services/` matching the index.md specification, consistent with where the spec expects them.
- Both test files should include `__init__.py`-compatible imports. The `tests/unit/services/__init__.py` file already exists.
- All async test functions should use `async def` -- pytest's `asyncio_mode = auto` setting in `pyproject.toml` handles async test discovery automatically.
- Tests for `_validate_urls` and `_sanitize_prompt` are split across both files: `test_fal_ai_ssrf.py` focuses on SSRF/security validation, while `test_fal_ai_provider.py` verifies that generation methods call these validators (integration within the class).

## Verification Checklist

1. All tests in `test_fal_ai_provider.py` pass: provider methods, error handling, prompt sanitization, aclose
2. All tests in `test_fal_ai_ssrf.py` pass: SSRF blocked/allowed URLs, host.docker.internal, file size limits
3. Full `pytest` suite passes with no regressions
4. Coverage for `fal_ai_provider.py` meets the 80% minimum threshold
5. No test makes real HTTP requests (all httpx calls are mocked)
6. No test requires a running Redis, PostgreSQL, or external API