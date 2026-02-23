Now I have all the context I need. Here is the complete section content:

# Section 04: Python Adapter Tests

**File to create:** `python-backend/tests/providers/test_byteplus_modelark_provider.py`

**Depends on:** Section 03 (Python Adapter — `BytePlusModelArkProvider` class must exist before these tests can pass)

**Test command:** `cd python-backend && uv run pytest tests/providers/test_byteplus_modelark_provider.py -v`

---

## Background

This section covers the comprehensive pytest test suite for the `BytePlusModelArkProvider` class introduced in Section 03. The tests must be written first (TDD) and initially fail — they become the acceptance criteria for the implementation.

The provider under test lives at:
```
python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py
```

It is a media generation adapter class that:
- Performs **synchronous image generation** via POST `/images/generations` (Seedream models)
- Performs **asynchronous video task creation** via POST `/contents/generations/tasks` (Seedance models)
- Polls task status via GET `/contents/generations/tasks/{task_id}`
- Validates inline video parameters and reference image URLs against SSRF/injection attacks
- Tracks API cost at `$2.50 / 1M tokens`

The SSRF guard used in `create_video_task` is:
```python
from app.core.media_job_validators import validate_uri_no_ssrf
```

---

## Prerequisites

### Create the `tests/providers/` directory

The `tests/providers/` directory does not currently exist. Create it with an `__init__.py`:

```
python-backend/tests/providers/__init__.py   # empty
python-backend/tests/providers/test_byteplus_modelark_provider.py
```

### Testing frameworks

- **`pytest`** with `asyncio_mode = "auto"` (configured in `pyproject.toml` — no `@pytest.mark.asyncio` needed)
- **`unittest.mock`** — use `AsyncMock` and `MagicMock` for mocking httpx calls (no `respx` dependency; the project does not currently use `respx`)
- **`structlog`** — capture log output via `structlog.testing.capture_logs()` context manager for the API-key-not-logged assertion

> Note: `respx` is not present in the project's requirements. Use `unittest.mock.patch` on `httpx.AsyncClient` methods directly, following the pattern in `tests/unit/api/test_kie_poll_handler.py`.

---

## Test File Structure

`python-backend/tests/providers/test_byteplus_modelark_provider.py`:

```python
"""
Unit tests for BytePlusModelArkProvider.

Tests cover:
- Image generation (happy path, size mapping, error propagation, usage_tokens)
- Video task creation (T2V and I2V content array structure)
- Task status polling (URL shape, timeout, raw response returned)
- Inline parameter building (valid inputs, bool formatting, ValueError on invalid)
- Cost calculation (token-to-USD conversion)
- Status normalization (_normalize_byteplus_task_state)
- URL extraction (_extract_byteplus_result_url)
- Security: SSRF block on reference_image_url, API key not in logs
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import structlog

from app.llm_proxy.providers.byteplus_modelark_provider import (
    BytePlusModelArkProvider,
    _normalize_byteplus_task_state,
    _extract_byteplus_result_url,
)
```

> The two helper functions `_normalize_byteplus_task_state` and `_extract_byteplus_result_url` are module-level functions in the provider file (not class methods). Import them directly. If the implementation places them elsewhere (e.g., in `media_tasks.py` per Section 06), adjust the import path.

---

## Class Constants Tests

These tests verify the class-level constants defined on `BytePlusModelArkProvider`. They are pure attribute checks — no HTTP calls.

```python
class TestBytePlusModelArkProviderConstants:
    """Verify class-level constants are correct."""

    def test_image_models_contains_exactly_two_seedream_ids(self):
        """IMAGE_MODELS must contain both Seedream model IDs."""
        assert len(BytePlusModelArkProvider.IMAGE_MODELS) == 2
        assert "seedream-4-5-251128" in BytePlusModelArkProvider.IMAGE_MODELS
        assert "seedream-4-0-250828" in BytePlusModelArkProvider.IMAGE_MODELS

    def test_video_models_contains_exactly_four_seedance_ids(self):
        """VIDEO_MODELS must contain all four Seedance model IDs."""
        assert len(BytePlusModelArkProvider.VIDEO_MODELS) == 4
        assert "seedance-1-0-pro-250528" in BytePlusModelArkProvider.VIDEO_MODELS
        assert "seedance-1-0-pro-fast-251015" in BytePlusModelArkProvider.VIDEO_MODELS
        assert "seedance-1-0-lite-t2v-250428" in BytePlusModelArkProvider.VIDEO_MODELS
        assert "seedance-1-0-lite-i2v-250428" in BytePlusModelArkProvider.VIDEO_MODELS

    def test_size_map_includes_pixel_format_entries(self):
        """SIZE_MAP must map full pixel strings to BytePlus shorthand."""
        assert BytePlusModelArkProvider.SIZE_MAP["1024x1024"] == "1K"
        assert BytePlusModelArkProvider.SIZE_MAP["2048x2048"] == "2K"
        assert BytePlusModelArkProvider.SIZE_MAP["4096x4096"] == "4K"

    def test_size_map_includes_identity_entries(self):
        """SIZE_MAP must also accept shorthand inputs unchanged."""
        assert BytePlusModelArkProvider.SIZE_MAP["1K"] == "1K"
        assert BytePlusModelArkProvider.SIZE_MAP["2K"] == "2K"
        assert BytePlusModelArkProvider.SIZE_MAP["4K"] == "4K"

    def test_usd_per_1m_tokens_constant(self):
        """Pricing constant must be $2.50 per 1M tokens."""
        assert BytePlusModelArkProvider.BYTEPLUS_USD_PER_1M_TOKENS == 2.5
```

---

## `__init__` Tests

```python
class TestBytePlusModelArkProviderInit:
    """Verify __init__ behavior."""

    def test_init_strips_trailing_slash_from_base_url(self):
        """base_url must have trailing slash removed."""
        provider = BytePlusModelArkProvider(
            api_key="test-key",
            base_url="https://ark.ap-southeast.bytepluses.com/api/v3/",
        )
        assert not provider.base_url.endswith("/")
        provider.client.aclose  # ensure client created (attribute access)

    def test_init_uses_default_base_url_when_none(self):
        """When base_url is None, must use the Southeast Asia default."""
        provider = BytePlusModelArkProvider(api_key="test-key")
        assert "bytepluses.com" in provider.base_url

    def test_init_does_not_log_api_key(self):
        """API key must not appear in any log output during __init__."""
        secret_key = "sk-byteplus-super-secret-12345"
        with structlog.testing.capture_logs() as cap:
            BytePlusModelArkProvider(api_key=secret_key)
        all_log_text = str(cap)
        assert secret_key not in all_log_text
```

---

## Image Generation Tests

Mock the `httpx.AsyncClient.post` method to return controlled responses without making real HTTP calls.

```python
class TestGenerateImage:
    """Tests for BytePlusModelArkProvider.generate_image()."""

    @pytest.fixture
    def provider(self):
        return BytePlusModelArkProvider(api_key="test-api-key")

    @pytest.fixture
    def success_response(self):
        """Minimal valid BytePlus image generation response."""
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "id": "resp-abc123",
            "data": [{"url": "https://cdn.byteplus.com/img/result.png"}],
            "usage": {"total_tokens": 1500},
        }
        return mock_resp

    async def test_generate_image_returns_result_url(self, provider, success_response):
        """Happy path: result_url is extracted from data[0].url."""
        provider.client.post = AsyncMock(return_value=success_response)
        result = await provider.generate_image(
            model="seedream-4-5-251128",
            prompt="A futuristic city",
            size="2K",
        )
        assert result["result_url"] == "https://cdn.byteplus.com/img/result.png"

    async def test_generate_image_returns_provider_task_id(self, provider, success_response):
        """result dict must include provider_task_id from response.id."""
        provider.client.post = AsyncMock(return_value=success_response)
        result = await provider.generate_image(
            model="seedream-4-5-251128", prompt="test"
        )
        assert result["provider_task_id"] == "resp-abc123"

    async def test_generate_image_returns_usage_tokens(self, provider, success_response):
        """result dict must include usage_tokens from usage.total_tokens."""
        provider.client.post = AsyncMock(return_value=success_response)
        result = await provider.generate_image(
            model="seedream-4-5-251128", prompt="test"
        )
        assert result["usage_tokens"] == 1500

    async def test_generate_image_request_body_shape(self, provider, success_response):
        """Request body must include model, size, watermark, stream:false."""
        provider.client.post = AsyncMock(return_value=success_response)
        await provider.generate_image(
            model="seedream-4-5-251128",
            prompt="A mountain scene",
            size="1K",
            watermark=True,
        )
        call_kwargs = provider.client.post.call_args
        # The json body is passed as `json=...` kwarg
        body = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert body["model"] == "seedream-4-5-251128"
        assert body["size"] == "1K"
        assert body["watermark"] is True
        assert body["stream"] is False

    async def test_generate_image_posts_to_images_generations_endpoint(
        self, provider, success_response
    ):
        """POST must go to the /images/generations path."""
        provider.client.post = AsyncMock(return_value=success_response)
        await provider.generate_image(model="seedream-4-5-251128", prompt="test")
        called_url = provider.client.post.call_args[0][0]
        assert called_url.endswith("/images/generations")

    async def test_generate_image_raises_on_http_error(self, provider):
        """Non-2xx HTTP responses must propagate as httpx.HTTPStatusError."""
        import httpx

        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "401 Unauthorized",
            request=MagicMock(),
            response=MagicMock(status_code=401),
        )
        provider.client.post = AsyncMock(return_value=mock_resp)
        with pytest.raises(httpx.HTTPStatusError):
            await provider.generate_image(model="seedream-4-5-251128", prompt="test")

    async def test_generate_image_api_key_not_in_logs(self, provider, success_response):
        """API key must not appear in any structlog output during image generation."""
        secret = "test-api-key"
        provider.client.post = AsyncMock(return_value=success_response)
        with structlog.testing.capture_logs() as cap:
            await provider.generate_image(model="seedream-4-5-251128", prompt="test")
        assert secret not in str(cap)
```

### Size Mapping Tests

```python
class TestGenerateImageSizeMapping:
    """Verify SIZE_MAP is applied correctly in generate_image."""

    @pytest.fixture
    def provider_with_mock(self):
        provider = BytePlusModelArkProvider(api_key="test-key")
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "id": "r1",
            "data": [{"url": "https://cdn.byteplus.com/img.png"}],
            "usage": {"total_tokens": 100},
        }
        provider.client.post = AsyncMock(return_value=mock_resp)
        return provider

    @pytest.mark.parametrize(
        "input_size,expected_byteplus_size",
        [
            ("1024x1024", "1K"),
            ("2048x2048", "2K"),
            ("4096x4096", "4K"),
            ("1K", "1K"),   # identity mapping — already in shorthand format
            ("2K", "2K"),
            ("4K", "4K"),
        ],
    )
    async def test_size_mapping(self, provider_with_mock, input_size, expected_byteplus_size):
        """SIZE_MAP must translate all known size inputs to correct BytePlus value."""
        await provider_with_mock.generate_image(
            model="seedream-4-5-251128", prompt="test", size=input_size
        )
        body = provider_with_mock.client.post.call_args.kwargs.get("json") or \
               provider_with_mock.client.post.call_args[1].get("json")
        assert body["size"] == expected_byteplus_size
```

---

## Video Task Creation Tests

```python
class TestCreateVideoTask:
    """Tests for BytePlusModelArkProvider.create_video_task()."""

    @pytest.fixture
    def provider(self):
        return BytePlusModelArkProvider(api_key="test-key")

    @pytest.fixture
    def task_response(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "id": "task-video-xyz789",
            "status": "queued",
        }
        return mock_resp

    async def test_create_video_task_t2v_content_array_has_one_text_item(
        self, provider, task_response
    ):
        """T2V: content array must have exactly 1 item of type 'text'."""
        provider.client.post = AsyncMock(return_value=task_response)
        await provider.create_video_task(
            model="seedance-1-0-lite-t2v-250428",
            prompt="A wave crashing on a beach",
            resolution="720p",
            duration=5,
        )
        body = provider.client.post.call_args.kwargs.get("json") or \
               provider.client.post.call_args[1].get("json")
        content = body["content"]
        assert len(content) == 1
        assert content[0]["type"] == "text"

    async def test_create_video_task_t2v_text_includes_inline_params(
        self, provider, task_response
    ):
        """T2V text item must contain the inline params suffix after the prompt."""
        provider.client.post = AsyncMock(return_value=task_response)
        await provider.create_video_task(
            model="seedance-1-0-pro-250528",
            prompt="Sunset over the ocean",
            resolution="1080p",
            duration=10,
            camerafixed=False,
            watermark=True,
        )
        body = provider.client.post.call_args.kwargs.get("json") or \
               provider.client.post.call_args[1].get("json")
        text = body["content"][0]["text"]
        assert "--resolution 1080p" in text
        assert "--duration 10" in text
        assert "--camerafixed false" in text
        assert "--watermark true" in text

    async def test_create_video_task_i2v_content_array_has_text_and_image_url(
        self, provider, task_response
    ):
        """I2V: content array must have 2 items — text followed by image_url."""
        provider.client.post = AsyncMock(return_value=task_response)
        ref_url = "https://cdn.example.com/reference.jpg"
        await provider.create_video_task(
            model="seedance-1-0-lite-i2v-250428",
            prompt="Animate this photo",
            resolution="720p",
            duration=5,
            reference_image_url=ref_url,
        )
        body = provider.client.post.call_args.kwargs.get("json") or \
               provider.client.post.call_args[1].get("json")
        content = body["content"]
        assert len(content) == 2
        assert content[0]["type"] == "text"
        assert content[1]["type"] == "image_url"

    async def test_create_video_task_i2v_image_url_matches_reference(
        self, provider, task_response
    ):
        """I2V image_url.url must match the reference_image_url argument."""
        provider.client.post = AsyncMock(return_value=task_response)
        ref_url = "https://r2.smartaihub.app/uploads/ref-img-abc.png"
        await provider.create_video_task(
            model="seedance-1-0-lite-i2v-250428",
            prompt="Animate this",
            resolution="720p",
            duration=5,
            reference_image_url=ref_url,
        )
        body = provider.client.post.call_args.kwargs.get("json") or \
               provider.client.post.call_args[1].get("json")
        assert body["content"][1]["image_url"]["url"] == ref_url

    async def test_create_video_task_returns_provider_task_id(
        self, provider, task_response
    ):
        """result dict must include provider_task_id from response.id."""
        provider.client.post = AsyncMock(return_value=task_response)
        result = await provider.create_video_task(
            model="seedance-1-0-pro-250528", prompt="test", resolution="720p", duration=5
        )
        assert result["provider_task_id"] == "task-video-xyz789"

    async def test_create_video_task_returns_initial_status(
        self, provider, task_response
    ):
        """result dict must include status from response.status."""
        provider.client.post = AsyncMock(return_value=task_response)
        result = await provider.create_video_task(
            model="seedance-1-0-pro-250528", prompt="test", resolution="720p", duration=5
        )
        assert result["status"] == "queued"

    async def test_create_video_task_posts_to_tasks_endpoint(
        self, provider, task_response
    ):
        """POST must go to the /contents/generations/tasks path."""
        provider.client.post = AsyncMock(return_value=task_response)
        await provider.create_video_task(
            model="seedance-1-0-pro-250528", prompt="test", resolution="720p", duration=5
        )
        called_url = provider.client.post.call_args[0][0]
        assert called_url.endswith("/contents/generations/tasks")

    async def test_create_video_task_api_key_not_in_logs(
        self, provider, task_response
    ):
        """API key must not appear in any structlog output during video task creation."""
        secret = "test-key"
        provider.client.post = AsyncMock(return_value=task_response)
        with structlog.testing.capture_logs() as cap:
            await provider.create_video_task(
                model="seedance-1-0-pro-250528",
                prompt="test",
                resolution="720p",
                duration=5,
            )
        assert secret not in str(cap)
```

---

## Task Status Tests

```python
class TestGetTaskStatus:
    """Tests for BytePlusModelArkProvider.get_task_status()."""

    @pytest.fixture
    def provider(self):
        return BytePlusModelArkProvider(api_key="test-key")

    async def test_get_task_status_calls_correct_url(self, provider):
        """GET must call the correct URL with task_id in the path."""
        task_id = "task-abc-999"
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"id": task_id, "status": "processing"}
        provider.client.get = AsyncMock(return_value=mock_resp)

        await provider.get_task_status(task_id)

        called_url = provider.client.get.call_args[0][0]
        assert task_id in called_url
        assert "/contents/generations/tasks/" in called_url

    async def test_get_task_status_returns_raw_response_dict(self, provider):
        """get_task_status must return the raw response dict unchanged."""
        raw_response = {
            "id": "task-xyz",
            "status": "succeeded",
            "content": [{"type": "video_url", "video_url": {"url": "https://cdn.byteplus.com/v.mp4"}}],
        }
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = raw_response
        provider.client.get = AsyncMock(return_value=mock_resp)

        result = await provider.get_task_status("task-xyz")
        assert result == raw_response

    async def test_get_task_status_uses_30s_per_request_timeout(self, provider):
        """Status poll must use a 30s per-request timeout, not the 90s client default."""
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"id": "t1", "status": "queued"}
        provider.client.get = AsyncMock(return_value=mock_resp)

        await provider.get_task_status("t1")

        call_kwargs = provider.client.get.call_args.kwargs
        # Timeout may be passed as `timeout=` kwarg or inside a httpx.Timeout object
        timeout_arg = call_kwargs.get("timeout")
        assert timeout_arg is not None
        # Accept either a numeric 30 or an httpx.Timeout with read=30
        if isinstance(timeout_arg, (int, float)):
            assert timeout_arg == 30
        else:
            # httpx.Timeout object — check its read or connect attributes
            assert hasattr(timeout_arg, "read") or hasattr(timeout_arg, "connect")
```

---

## Inline Parameters Builder Tests

```python
class TestBuildInlineParams:
    """Tests for BytePlusModelArkProvider._build_inline_params()."""

    @pytest.fixture
    def provider(self):
        return BytePlusModelArkProvider(api_key="test-key")

    def test_valid_inputs_produce_correct_suffix_string(self, provider):
        """Valid inputs must produce the 4-flag suffix string."""
        result = provider._build_inline_params(
            resolution="720p", duration=5, camerafixed=False, watermark=True
        )
        assert "--resolution 720p" in result
        assert "--duration 5" in result
        assert "--camerafixed false" in result
        assert "--watermark true" in result

    def test_camerafixed_true_produces_lowercase_true(self, provider):
        """Python True must become lowercase 'true' in the suffix string."""
        result = provider._build_inline_params(
            resolution="1080p", duration=10, camerafixed=True, watermark=False
        )
        assert "--camerafixed true" in result
        assert "--watermark false" in result

    def test_invalid_resolution_raises_value_error(self, provider):
        """Resolution not in {720p, 1080p} must raise ValueError."""
        with pytest.raises(ValueError, match="resolution"):
            provider._build_inline_params(
                resolution="4K", duration=5, camerafixed=False, watermark=True
            )

    def test_resolution_1440p_raises_value_error(self, provider):
        """1440p is not an allowed BytePlus resolution — must raise ValueError."""
        with pytest.raises(ValueError):
            provider._build_inline_params(
                resolution="1440p", duration=5, camerafixed=False, watermark=True
            )

    def test_invalid_duration_raises_value_error(self, provider):
        """Duration not in {5, 10} must raise ValueError."""
        with pytest.raises(ValueError, match="duration"):
            provider._build_inline_params(
                resolution="720p", duration=15, camerafixed=False, watermark=True
            )

    def test_duration_zero_raises_value_error(self, provider):
        """Duration=0 is not in the allowlist — must raise ValueError."""
        with pytest.raises(ValueError):
            provider._build_inline_params(
                resolution="720p", duration=0, camerafixed=False, watermark=True
            )
```

---

## Cost Calculation Tests

```python
class TestCalculateCostUsd:
    """Tests for BytePlusModelArkProvider.calculate_cost_usd()."""

    @pytest.fixture
    def provider(self):
        return BytePlusModelArkProvider(api_key="test-key")

    def test_one_million_tokens_costs_2_dollars_50(self, provider):
        """1,000,000 tokens must cost exactly $2.50."""
        assert provider.calculate_cost_usd(1_000_000) == 2.5

    def test_zero_tokens_costs_zero(self, provider):
        """0 tokens must cost $0.00."""
        assert provider.calculate_cost_usd(0) == 0.0

    def test_fractional_tokens_are_calculated_correctly(self, provider):
        """45 tokens: (45 / 1_000_000) * 2.5 ≈ 0.0001125."""
        result = provider.calculate_cost_usd(45)
        assert abs(result - 0.0001125) < 1e-10
```

---

## Status Normalization Tests

These tests target the module-level helper `_normalize_byteplus_task_state`. In the implementation plan the function lives in `media_tasks.py` (Section 06) but the TDD plan also groups them here for convenience if the implementer places them in the provider module. Adjust the import path to match where the implementation is placed.

> If `_normalize_byteplus_task_state` is placed in `app/tasks/media_tasks.py` (per the implementation plan), import from there instead.

```python
class TestNormalizeBytePlusTaskState:
    """Tests for _normalize_byteplus_task_state()."""

    @pytest.mark.parametrize(
        "byteplus_status,expected_normalized,expected_raw",
        [
            ("succeeded", "success", "succeeded"),
            ("failed", "fail", "failed"),
            ("cancelled", "fail", "cancelled"),
            ("queued", "processing", "queued"),
            ("processing", "processing", "processing"),
            ("some_unknown_status", "unknown", "some_unknown_status"),
        ],
    )
    def test_status_mapping(
        self, byteplus_status, expected_normalized, expected_raw
    ):
        """All BytePlus status strings must map to the correct internal state."""
        status_response = {"status": byteplus_status}
        normalized, raw = _normalize_byteplus_task_state(status_response)
        assert normalized == expected_normalized
        assert raw == expected_raw
```

---

## URL Extraction Tests

```python
class TestExtractBytePlusResultUrl:
    """Tests for _extract_byteplus_result_url()."""

    def test_extracts_url_from_video_url_content_item(self):
        """content item with type=video_url must return the URL."""
        response = {
            "content": [
                {"type": "video_url", "video_url": {"url": "https://cdn.byteplus.com/video.mp4"}}
            ]
        }
        url = _extract_byteplus_result_url(response)
        assert url == "https://cdn.byteplus.com/video.mp4"

    def test_extracts_url_from_image_url_content_item(self):
        """content item with type=image_url must return the URL."""
        response = {
            "content": [
                {"type": "image_url", "image_url": {"url": "https://cdn.byteplus.com/img.png"}}
            ]
        }
        url = _extract_byteplus_result_url(response)
        assert url == "https://cdn.byteplus.com/img.png"

    def test_returns_none_for_empty_content_array(self):
        """Empty content list must return None."""
        response = {"content": []}
        assert _extract_byteplus_result_url(response) is None

    def test_returns_none_when_content_key_missing(self):
        """Response with no 'content' key must return None."""
        response = {"status": "succeeded"}
        assert _extract_byteplus_result_url(response) is None

    def test_returns_none_for_non_http_url(self):
        """URLs that do not start with 'http' must be skipped."""
        response = {
            "content": [
                {"type": "video_url", "video_url": {"url": "ftp://invalid.example.com/v.mp4"}}
            ]
        }
        assert _extract_byteplus_result_url(response) is None

    def test_returns_none_for_unknown_content_type(self):
        """Content items with unrecognised types must be ignored."""
        response = {
            "content": [
                {"type": "text", "text": "some text"}
            ]
        }
        assert _extract_byteplus_result_url(response) is None
```

---

## Security Tests

These are the most critical tests and must pass before the implementation is considered complete.

### SSRF Prevention

```python
class TestSSRFPrevention:
    """Verify SSRF guards block private/localhost reference image URLs."""

    @pytest.fixture
    def provider(self):
        return BytePlusModelArkProvider(api_key="test-key")

    async def test_localhost_reference_image_url_raises_before_http_call(self, provider):
        """localhost reference_image_url must raise ValueError before any HTTP call."""
        provider.client.post = AsyncMock()
        with pytest.raises((ValueError, Exception)):
            await provider.create_video_task(
                model="seedance-1-0-lite-i2v-250428",
                prompt="Animate this",
                resolution="720p",
                duration=5,
                reference_image_url="http://localhost/img.jpg",
            )
        # Critically: no HTTP call should have been made
        provider.client.post.assert_not_called()

    async def test_loopback_ip_reference_image_url_is_blocked(self, provider):
        """127.0.0.1 reference image URL must raise before any HTTP call."""
        provider.client.post = AsyncMock()
        with pytest.raises((ValueError, Exception)):
            await provider.create_video_task(
                model="seedance-1-0-lite-i2v-250428",
                prompt="Animate this",
                resolution="720p",
                duration=5,
                reference_image_url="http://127.0.0.1/admin/img.jpg",
            )
        provider.client.post.assert_not_called()

    async def test_public_reference_image_url_is_allowed(self, provider):
        """A legitimate public URL must not be blocked."""
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"id": "task-1", "status": "queued"}
        provider.client.post = AsyncMock(return_value=mock_resp)

        # Should not raise
        await provider.create_video_task(
            model="seedance-1-0-lite-i2v-250428",
            prompt="Animate this",
            resolution="720p",
            duration=5,
            reference_image_url="https://r2.smartaihub.app/uploads/ref.jpg",
        )
        provider.client.post.assert_called_once()
```

---

## `aclose` Cleanup Test

```python
class TestAclose:
    """Verify the httpx client is properly closed."""

    async def test_aclose_closes_httpx_client(self):
        """aclose() must call close on the underlying httpx.AsyncClient."""
        provider = BytePlusModelArkProvider(api_key="test-key")
        provider.client.aclose = AsyncMock()
        await provider.aclose()
        provider.client.aclose.assert_called_once()
```

---

## Implementation Notes for the Implementer

### Key import paths

| Symbol | Location |
|---|---|
| `BytePlusModelArkProvider` | `app/llm_proxy/providers/byteplus_modelark_provider.py` |
| `_normalize_byteplus_task_state` | Same file, or `app/tasks/media_tasks.py` (per Section 06 plan) |
| `_extract_byteplus_result_url` | Same file, or `app/tasks/media_tasks.py` (per Section 06 plan) |
| `validate_uri_no_ssrf` | `app/core/media_job_validators` |

If `_normalize_byteplus_task_state` and `_extract_byteplus_result_url` are implemented in `media_tasks.py` (as described in the Section 06 plan), update the test file imports accordingly:

```python
from app.tasks.media_tasks import (
    _normalize_byteplus_task_state,
    _extract_byteplus_result_url,
)
```

### Mocking httpx

The project does not use `respx`. Mock `provider.client.post` and `provider.client.get` directly using `AsyncMock` after the provider is instantiated. The fixture pattern is:

```python
provider.client.post = AsyncMock(return_value=mock_resp)
```

### Accessing the JSON request body in assertions

`httpx.AsyncClient.post` is called with `json=...` as a keyword argument. Retrieve it from the mock call args:

```python
body = provider.client.post.call_args.kwargs.get("json") or \
       provider.client.post.call_args[1].get("json")
```

### Structlog log capture

Use the `structlog.testing.capture_logs()` context manager, which is part of the standard `structlog` library. It does not require additional packages. The captured output is a list of dicts; convert to string for the "not in" assertion:

```python
with structlog.testing.capture_logs() as cap:
    # ... call the method
assert "my-secret-key" not in str(cap)
```

### TDD workflow for this section

1. Create `python-backend/tests/providers/__init__.py` (empty)
2. Create the test file with all test stubs (functions that raise `pytest.fail("not implemented")` initially)
3. Run: `cd python-backend && uv run pytest tests/providers/test_byteplus_modelark_provider.py -v` — all tests should fail (import errors expected until Section 03 is done)
4. Once Section 03 is complete, run tests again — work through failures one class at a time
5. All tests must pass before marking this section complete
6. Run `ruff check app/` and `mypy app/` before closing out

---

## Implementation Notes (Actual vs. Planned)

### File location — `tests/unit/llm_proxy/` not `tests/providers/`

The `tests/providers/` directory does not exist. Existing convention places provider tests in
`tests/unit/llm_proxy/` (matching `test_ollama_provider.py`, `test_openrouter_provider.py`).
**Actual file:** `python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py`

### Helper functions placed in provider module

`_normalize_byteplus_task_state` and `_extract_byteplus_result_url` were implemented as
module-level functions in `byteplus_modelark_provider.py` (Section 03), not deferred to
`media_tasks.py`. Imports come from `app.llm_proxy.providers.byteplus_modelark_provider`.

### I2V tests and SSRF "public allowed" test use `1.1.1.1`

The test environment restricts DNS resolution for external hostnames. All three tests that
exercise a public reference image URL use `https://1.1.1.1/img.jpg` (Cloudflare public IP)
instead of domain-based URLs. This passes the real `validate_uri_no_ssrf` validator without
DNS lookup. No patching of the SSRF validator is used in the final implementation.

### API key sentinel strengthened in video log test

`test_create_video_task_api_key_not_in_logs` uses `bp-sk-sentinel-7f3a9d2c1e4b8f6a` as the
API key (not `"test-key"`) and instantiates the provider inline so the sentinel is the actual
`_api_key` attribute being checked.

### Final test count: 60 (3 added by code review)

Code review added:
- `test_generate_image_raises_on_500_server_error` (500 error coverage)
- `test_status_mapping["Succeeded"]` parametrize case (mixed-case `.lower()` coverage)
- `test_skips_non_matching_first_item_and_returns_second` (iterator skip behavior)