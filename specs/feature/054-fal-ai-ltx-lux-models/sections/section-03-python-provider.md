# Section 03: Python Provider -- FalAIProvider

## Overview

Create `python-backend/app/llm_proxy/providers/fal_ai_provider.py` containing the `FalAIProvider` class, then register the export in `providers/__init__.py`. This provider handles all three media types (video via async queue, audio and image via synchronous calls) with SSRF validation, prompt sanitization, error message sanitization, video file size limits, and proper resource cleanup.

**Depends on:** Nothing (parallelizable in Batch 1)
**Blocks:** section-04 (gateway routing), section-05 (Celery polling), section-09 (tests)

## Files to Create/Modify

- **NEW**: `python-backend/app/llm_proxy/providers/fal_ai_provider.py`
- **MODIFY**: `python-backend/app/llm_proxy/providers/__init__.py` -- add import + `__all__` entry

## Tests First

### `python-backend/tests/unit/services/test_fal_ai_provider.py`

```python
# --- Constants ---
# Test: VIDEO_MODELS contains exactly 7 LTX-2.3 model IDs (frozenset)
# Test: AUDIO_MODELS contains {"fal-ai/lux-tts"} (frozenset)
# Test: IMAGE_MODELS contains 4 Flux model IDs (frozenset)
# Test: BASE_URL == "https://fal.run", QUEUE_BASE_URL == "https://queue.fal.run"

# --- Init ---
# Test: Authorization header uses "Key {api_key}" format (NOT Bearer)
# Test: httpx client timeout is 300.0 seconds
# Test: custom base_url override works

# --- generate_video (queue) ---
# Test: POSTs to queue.fal.run/{model_id}, returns {id: request_id, status: PROCESSING}
# Test: calls _validate_urls before HTTP request
# Test: sanitizes prompt (strips HTML tags)

# --- generate_audio (sync TTS) ---
# Test: POSTs to fal.run/{model_id} synchronously
# Test: returns {data: [{url}], status: COMPLETED}
# Test: calls _validate_urls for audio_url

# --- generate_image (sync Flux) ---
# Test: POSTs to fal.run/{model_id} synchronously
# Test: returns normalized result with image URL

# --- Queue Operations ---
# Test: _submit_queue returns request_id from fal.ai response
# Test: get_queue_status returns {status: IN_QUEUE|IN_PROGRESS|COMPLETED}
# Test: get_queue_result normalizes video URL, actual_duration, actual_resolution

# --- Resolution derivation ---
# Test: width >= 3840 -> "2160p", >= 2560 -> "1440p", else -> "1080p"

# --- Error Handling ---
# Test: 401 -> ValueError("Invalid fal.ai API key")
# Test: 422 -> ValueError("Content policy rejection")
# Test: 429 -> ValueError("fal.ai rate limit exceeded")
# Test: 500 -> ValueError("fal.ai error (HTTP 500)") -- no body in message

# --- Resource Cleanup ---
# Test: aclose() closes httpx client
```

### `python-backend/tests/unit/services/test_fal_ai_ssrf.py`

```python
# Test: rejects http://169.254.169.254 (AWS metadata)
# Test: rejects http://localhost, http://127.0.0.1
# Test: rejects http://10.0.0.1, http://192.168.1.1
# Test: rejects http://host.docker.internal (explicit fal.ai-specific reject)
# Test: allows https://example.com, https://v3b.fal.media/files/...
# Test: validates ALL url fields: image_url, end_image_url, audio_url, video_url
# Test: None URL fields are skipped (no error)
# Test: strips <script> and <img> tags from prompts
# Test: video_url > 500MB rejected (HEAD check)
# Test: missing Content-Length handled gracefully
```

## Implementation Guidance

### Class Structure

```python
class FalAIProvider:
    BASE_URL = "https://fal.run"
    QUEUE_BASE_URL = "https://queue.fal.run"
    MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024  # 500MB

    VIDEO_MODELS: frozenset[str] = frozenset({
        "fal-ai/ltx-2.3/text-to-video",
        "fal-ai/ltx-2.3/text-to-video/fast",
        "fal-ai/ltx-2.3/image-to-video",
        "fal-ai/ltx-2.3/image-to-video/fast",
        "fal-ai/ltx-2.3/audio-to-video",
        "fal-ai/ltx-2.3/extend-video",
        "fal-ai/ltx-2.3/retake-video",
    })
    AUDIO_MODELS: frozenset[str] = frozenset({"fal-ai/lux-tts"})
    IMAGE_MODELS: frozenset[str] = frozenset({
        "fal-ai/flux/schnell", "fal-ai/flux/dev",
        "fal-ai/flux-pro", "fal-ai/stable-diffusion-v3-medium",
    })

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        """Creates httpx.AsyncClient(timeout=300.0). Auth: 'Key {api_key}'."""

    def _validate_urls(self, params: dict) -> None:
        """SSRF: validate_uri_no_ssrf() + reject host.docker.internal + HEAD size check for video_url."""

    def _sanitize_prompt(self, prompt: str) -> str:
        """Strip HTML/XML tags: re.sub(r'<[^>]+>', '', prompt)"""

    async def generate_video(self, model_id: str, params: dict) -> dict:
        """Queue submission -> {id: request_id, status: PROCESSING}"""

    async def generate_audio(self, model_id: str, params: dict) -> dict:
        """Sync TTS -> {data: [{url}], status: COMPLETED}"""

    async def generate_image(self, model_id: str, params: dict) -> dict:
        """Sync Flux -> {data: [{url}], status: COMPLETED}"""

    async def _submit_queue(self, model_id: str, payload: dict) -> str:
        """POST queue.fal.run/{model_id}, return request_id."""

    async def get_queue_status(self, model_id: str, request_id: str) -> dict:
        """GET queue status -> {status: IN_QUEUE|IN_PROGRESS|COMPLETED}"""

    async def get_queue_result(self, model_id: str, request_id: str) -> dict:
        """GET result -> normalized {data: [{url}], actual_duration, actual_resolution}"""

    async def aclose(self) -> None:
        """Close httpx client. MUST be called in finally block."""
```

### Error Handling Pattern

Wrap `raise_for_status()` to sanitize messages:
- 401 -> `ValueError("Invalid fal.ai API key")` from None
- 422 -> `ValueError("Content policy rejection")` from None
- 429 -> `ValueError("fal.ai rate limit exceeded")` from None
- Other -> `ValueError(f"fal.ai error (HTTP {status})")` from None

NEVER include response body in error message.

### Provider Registration

In `providers/__init__.py`, add after UVoiceProvider:
```python
from .fal_ai_provider import FalAIProvider
```
Add `"FalAIProvider"` to `__all__`.

### fal.ai API Response Shapes (for mocking)

**Queue submission**: `{"request_id": "abc-123-def", "status": "IN_QUEUE"}`
**Queue status**: `{"status": "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED"}`
**Queue result**: `{"video": {"url": "...", "width": 1920, "height": 1080, "duration": 6.0}}`
**Sync TTS**: `{"audio": {"url": "..."}}`
**Sync image**: `{"images": [{"url": "...", "width": 1024, "height": 1024}]}`

### Interface Contract for Downstream

Section-04 (gateway) instantiates: `FalAIProvider(api_key=...) -> generate_video/audio/image -> aclose()`
Section-05 (polling) uses: `FalAIProvider(api_key=...) -> get_queue_status/get_queue_result -> aclose()`
