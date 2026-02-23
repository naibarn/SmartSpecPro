Now I have all the context I need. Let me generate the section content for `section-03-python-adapter`.

# Section 03: Python Adapter — BytePlusModelArkProvider

## Overview

This section creates the `BytePlusModelArkProvider` class in the Python backend. It is the lowest-level provider adapter and has no dependencies on other sections in this feature — it can be implemented immediately in parallel with sections 01 and 02.

Sections 04, 05, and 06 all depend on the class and constants defined here, so this section must be completed first in the Python batch.

## Files to Create / Modify

- **New file:** `/home/dev/projects/SmartSpecPro/python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py`
- **Modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/llm_proxy/providers/__init__.py`

## Background Context

### Role of This Provider

The `BytePlusModelArkProvider` is a thin, stateful HTTP client wrapper for the BytePlus ModelArk API. It follows the exact same structural pattern as `KieAIProvider` (found at `python-backend/app/llm_proxy/providers/kie_ai_provider.py`):

- Holds a single `httpx.AsyncClient` instance (created in `__init__`, not per-request)
- Stores `Authorization: Bearer <apiKey>` headers in `self._headers` at init time
- Logs via `structlog` — **the API key must never appear in any log record**
- Is instantiated by `LLMGateway` in sections 05 and 06, used, then closed via `await client.aclose()`

This provider handles **two distinct API flows**:

| Media Type | Flow | API |
|---|---|---|
| Image (Seedream models) | **Synchronous** — URL returned immediately | POST `/images/generations` |
| Video (Seedance models) | **Asynchronous task** — returns a task ID, result polled later | POST `/contents/generations/tasks` |

The polling for video tasks is handled by `recover_stuck_tasks` in `media_tasks.py` (section 06), not by this adapter. This adapter only creates video tasks and checks their status on demand.

### BytePlus API Endpoints

- **Base URL (default):** `https://ark.ap-southeast.bytepluses.com/api/v3`
- **Image generation:** `POST {base_url}/images/generations`
- **Video task creation:** `POST {base_url}/contents/generations/tasks`
- **Video task status:** `GET {base_url}/contents/generations/tasks/{task_id}`
- **Authentication:** `Authorization: Bearer <api_key>` header on all requests

### SSRF Security Requirement

The `create_video_task` method accepts an optional `reference_image_url` for image-to-video (I2V) models. This URL must be validated with `validate_uri_no_ssrf()` from `app.core.media_job_validators` **before** it is placed into the content array. This blocks SSRF attacks via crafted I2V reference image URLs.

The `validate_uri_no_ssrf()` function raises `ValueError` for private IPs (`127.0.0.1`, `10.x.x.x`, `192.168.x.x`, `localhost`, etc.) and unresolvable hostnames. It returns the URI unchanged if safe.

### Inline Params Security

BytePlus video tasks pass generation parameters (resolution, duration, camerafixed, watermark) as inline flags appended to the user's text prompt. This is an API design requirement of the BytePlus ModelArk video endpoint.

Because these parameters are concatenated into a prompt string, `_build_inline_params` must validate `resolution` and `duration` against explicit allowlists before string formatting. Invalid values raise `ValueError`. This prevents unexpected model behavior and prompt injection via malformed parameter values.

## Tests First

The tests for this section are in section 04 (`section-04-python-adapter-tests`). However, to follow TDD, the implementer should write stub test functions now and verify they fail before implementing. See the test stubs below for the full list of required test cases.

The test file is: `/home/dev/projects/SmartSpecPro/python-backend/tests/providers/test_byteplus_modelark_provider.py`

If `tests/providers/` does not exist, check whether the existing test conventions use a flat `tests/` structure (look for `tests/test_kie_ai_provider.py` or similar) and place the file accordingly.

### Test Stubs to Write Before Implementation

```python
# python-backend/tests/providers/test_byteplus_modelark_provider.py
"""
Tests for BytePlusModelArkProvider.
Uses respx for httpx mocking (matching existing provider test conventions).
All tests are async (pytest-asyncio, asyncio_mode=auto per pyproject.toml).
"""
import pytest
import respx
import httpx
from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider


# --- Class structure ---

def test_image_models_set_has_two_entries():
    """IMAGE_MODELS contains exactly 2 Seedream model IDs."""
    assert len(BytePlusModelArkProvider.IMAGE_MODELS) == 2

def test_video_models_set_has_four_entries():
    """VIDEO_MODELS contains exactly 4 Seedance model IDs."""
    assert len(BytePlusModelArkProvider.VIDEO_MODELS) == 4

def test_size_map_includes_pixel_formats():
    """SIZE_MAP maps "1024x1024" → "1K", "2048x2048" → "2K", "4096x4096" → "4K"."""
    assert BytePlusModelArkProvider.SIZE_MAP["1024x1024"] == "1K"
    assert BytePlusModelArkProvider.SIZE_MAP["2048x2048"] == "2K"
    assert BytePlusModelArkProvider.SIZE_MAP["4096x4096"] == "4K"

def test_size_map_includes_identity_entries():
    """SIZE_MAP also maps shorthand inputs to themselves (e.g., "2K" → "2K")."""
    assert BytePlusModelArkProvider.SIZE_MAP["1K"] == "1K"
    assert BytePlusModelArkProvider.SIZE_MAP["2K"] == "2K"
    assert BytePlusModelArkProvider.SIZE_MAP["4K"] == "4K"

def test_init_strips_trailing_slash():
    """__init__ strips trailing slash from base_url."""
    provider = BytePlusModelArkProvider(api_key="test-key", base_url="https://example.com/api/v3/")
    assert not provider.base_url.endswith("/")

def test_init_api_key_not_in_headers_value():
    """API key is stored only as Bearer token, not exposed elsewhere."""
    # Structural check: headers contain Authorization but key not leaked as plain field
    provider = BytePlusModelArkProvider(api_key="super-secret-key-123")
    assert "super-secret-key-123" not in str(provider._headers.get("X-API-Key", ""))


# --- Image generation ---

@pytest.mark.asyncio
async def test_generate_image_success():
    """generate_image returns result_url, provider_task_id, usage_tokens on 200."""
    ...  # Use respx to mock POST /images/generations

@pytest.mark.asyncio
async def test_generate_image_request_body_fields():
    """Request body contains model, size (mapped), watermark, stream:false."""
    ...

@pytest.mark.asyncio
async def test_generate_image_size_mapping_pixel_formats():
    """1024x1024 → 1K, 2048x2048 → 2K, 4096x4096 → 4K in the outgoing request."""
    ...

@pytest.mark.asyncio
async def test_generate_image_size_mapping_identity():
    """'2K' input maps to '2K' (identity mapping is present in SIZE_MAP)."""
    ...

@pytest.mark.asyncio
async def test_generate_image_raises_on_401():
    """generate_image raises httpx.HTTPStatusError on 401 response."""
    ...

@pytest.mark.asyncio
async def test_generate_image_raises_on_500():
    """generate_image raises httpx.HTTPStatusError on 500 response."""
    ...


# --- Video task creation ---

@pytest.mark.asyncio
async def test_create_video_task_t2v_content_array():
    """T2V: content array has exactly 1 text item."""
    ...

@pytest.mark.asyncio
async def test_create_video_task_t2v_text_includes_inline_params():
    """T2V: text item contains prompt + inline params suffix."""
    ...

@pytest.mark.asyncio
async def test_create_video_task_i2v_content_array():
    """I2V: content array has 2 items — text and image_url."""
    ...

@pytest.mark.asyncio
async def test_create_video_task_i2v_image_url_matches_reference():
    """I2V: image_url item url matches the reference_image_url parameter."""
    ...

@pytest.mark.asyncio
async def test_create_video_task_returns_provider_task_id():
    """Returns provider_task_id from response.id."""
    ...

@pytest.mark.asyncio
async def test_create_video_task_returns_initial_status():
    """Returns initial status from response.status."""
    ...


# --- Task status ---

@pytest.mark.asyncio
async def test_get_task_status_correct_url():
    """GET request goes to .../contents/generations/tasks/{task_id}."""
    ...

@pytest.mark.asyncio
async def test_get_task_status_returns_raw_dict():
    """Returns the raw response dict unchanged."""
    ...


# --- Inline params ---

def test_build_inline_params_valid_inputs():
    """Valid inputs produce correct suffix string with all 4 flags."""
    provider = BytePlusModelArkProvider(api_key="k")
    result = provider._build_inline_params(resolution="1080p", duration=5, camerafixed=False, watermark=True)
    assert "--resolution 1080p" in result
    assert "--duration 5" in result
    assert "--camerafixed false" in result
    assert "--watermark true" in result

def test_build_inline_params_camerafixed_true_lowercase():
    """camerafixed=True produces '--camerafixed true' (lowercase Python bool)."""
    provider = BytePlusModelArkProvider(api_key="k")
    result = provider._build_inline_params(resolution="720p", duration=5, camerafixed=True, watermark=False)
    assert "--camerafixed true" in result

def test_build_inline_params_invalid_resolution_raises():
    """resolution='4K' (not in allowlist) raises ValueError."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        provider._build_inline_params(resolution="4K", duration=5, camerafixed=False, watermark=False)

def test_build_inline_params_invalid_resolution_1440p_raises():
    """resolution='1440p' raises ValueError."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        provider._build_inline_params(resolution="1440p", duration=5, camerafixed=False, watermark=False)

def test_build_inline_params_invalid_duration_raises():
    """duration=15 raises ValueError."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        provider._build_inline_params(resolution="1080p", duration=15, camerafixed=False, watermark=False)

def test_build_inline_params_invalid_duration_zero_raises():
    """duration=0 raises ValueError."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        provider._build_inline_params(resolution="1080p", duration=0, camerafixed=False, watermark=False)


# --- Cost calculation ---

def test_calculate_cost_usd_one_million_tokens():
    """calculate_cost_usd(1_000_000) == 2.5."""
    provider = BytePlusModelArkProvider(api_key="k")
    assert provider.calculate_cost_usd(1_000_000) == pytest.approx(2.5)

def test_calculate_cost_usd_zero():
    """calculate_cost_usd(0) == 0.0."""
    provider = BytePlusModelArkProvider(api_key="k")
    assert provider.calculate_cost_usd(0) == 0.0

def test_calculate_cost_usd_45_tokens():
    """calculate_cost_usd(45) ≈ 0.0001125."""
    provider = BytePlusModelArkProvider(api_key="k")
    assert provider.calculate_cost_usd(45) == pytest.approx(0.0001125, rel=1e-5)


# --- Security ---

@pytest.mark.asyncio
async def test_ssrf_localhost_reference_image_raises():
    """create_video_task raises ValueError for localhost reference_image_url before HTTP."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        await provider.create_video_task(
            model="seedance-1-0-pro-250528",
            prompt="test",
            reference_image_url="http://localhost/img.jpg"
        )

@pytest.mark.asyncio
async def test_ssrf_private_ip_reference_image_raises():
    """create_video_task raises ValueError for 127.0.0.1 reference_image_url."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        await provider.create_video_task(
            model="seedance-1-0-lite-i2v-250428",
            prompt="test",
            reference_image_url="http://127.0.0.1/img.jpg"
        )

@pytest.mark.asyncio
async def test_api_key_not_in_structlog_output(capsys):
    """API key value does not appear in captured structlog output during generate_image."""
    # Use respx mock + structlog capture; assert "my-secret-api-key-xyz" not in logs
    ...
```

## Implementation

### File: `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py`

Create this file from scratch. The structure to implement:

**Imports required:**
```python
import httpx
import structlog
from app.core.media_job_validators import validate_uri_no_ssrf
```

**Class-level constants** (define as class attributes on `BytePlusModelArkProvider`):

| Constant | Type | Value |
|---|---|---|
| `BASE_URL` | `str` | `"https://ark.ap-southeast.bytepluses.com/api/v3"` |
| `IMAGE_MODELS` | `frozenset[str]` | `{"seedream-4-5-251128", "seedream-4-0-250828"}` |
| `VIDEO_MODELS` | `frozenset[str]` | `{"seedance-1-0-pro-250528", "seedance-1-0-pro-fast-251015", "seedance-1-0-lite-t2v-250428", "seedance-1-0-lite-i2v-250428"}` |
| `SIZE_MAP` | `dict[str, str]` | See note below |
| `BYTEPLUS_USD_PER_1M_TOKENS` | `float` | `2.5` |

**SIZE_MAP must include both pixel format and shorthand identity entries:**
```python
SIZE_MAP = {
    "1024x1024": "1K",
    "2048x2048": "2K",
    "4096x4096": "4K",
    "1K": "1K",
    "2K": "2K",
    "4K": "4K",
}
```

The identity entries are required because gateway code may pass already-formatted values like `"2K"` directly.

**`__init__(self, api_key: str, base_url: str | None = None)`:**
- Store `api_key` as `self._api_key` (leading underscore signals it is internal; never log its value)
- Set `self.base_url = (base_url or self.BASE_URL).rstrip("/")`
- Build `self._headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}`
- Create `self.client = httpx.AsyncClient(timeout=90.0)` — 90s covers the longest synchronous image generation
- Log `byteplus_provider_init` with `base_url=self.base_url` only (not the key)

**`async def generate_image(self, model: str, prompt: str, size: str = "2K", watermark: bool = True) -> dict`:**

Docstring should explain: synchronous endpoint, returns `result_url`, `provider_task_id`, `usage_tokens`.

Logic summary:
1. Map `size` through `SIZE_MAP`, defaulting to `"2K"` if not found
2. Build payload: `{"model": model, "prompt": prompt, "size": byteplus_size, "response_format": "url", "stream": False, "watermark": watermark, "sequential_image_generation": "disabled"}`
3. POST to `f"{self.base_url}/images/generations"` using `self._headers`
4. Call `response.raise_for_status()` — propagates `httpx.HTTPStatusError` on 4xx/5xx
5. Parse JSON response; return `{"result_url": data[0]["url"], "provider_task_id": resp["id"], "usage_tokens": resp["usage"]["total_tokens"], "raw_response": resp}`
6. Log `byteplus_generate_image` with `model=model, size=byteplus_size` (not the API key)

**`async def create_video_task(self, model: str, prompt: str, resolution: str = "1080p", duration: int = 5, camerafixed: bool = False, watermark: bool = True, reference_image_url: str | None = None) -> dict`:**

Docstring should explain: async task endpoint, returns `provider_task_id` and initial `status` for polling.

Logic summary:
1. If `reference_image_url` is not `None`, call `validate_uri_no_ssrf(reference_image_url)` — raises `ValueError` if unsafe, **before any other processing**
2. Build inline params string via `self._build_inline_params(resolution, duration, camerafixed, watermark)` — raises `ValueError` if resolution/duration invalid
3. Build `content` array: always start with `[{"type": "text", "text": f"{prompt}{inline_params}"}]`
4. If `reference_image_url` is provided, append `{"type": "image_url", "image_url": {"url": reference_image_url}}`
5. Build payload: `{"model": model, "content": content}`
6. POST to `f"{self.base_url}/contents/generations/tasks"` using `self._headers`
7. Call `response.raise_for_status()`
8. Parse JSON; return `{"provider_task_id": resp["id"], "status": resp["status"]}`
9. Log `byteplus_create_video_task` with `model=model, resolution=resolution, duration=duration` (not the key)

**`async def get_task_status(self, task_id: str) -> dict`:**

Docstring should explain: polls BytePlus for current task state; returns raw response dict for caller to normalize.

Logic summary:
1. GET `f"{self.base_url}/contents/generations/tasks/{task_id}"` using `self._headers`
2. Use a **per-request timeout override** of 30 seconds: `self.client.get(url, headers=self._headers, timeout=30.0)` — this overrides the 90s client default for status polls
3. Call `response.raise_for_status()`
4. Return `response.json()` unchanged — callers in sections 05/06 normalize the status

**`def _build_inline_params(self, resolution: str, duration: int, camerafixed: bool, watermark: bool) -> str`:**

Docstring should explain: security-critical — validates against allowlists before string concatenation to prevent prompt injection.

Logic summary:
1. `ALLOWED_RESOLUTIONS = {"720p", "1080p"}` — raise `ValueError(f"Invalid resolution: {resolution!r}. Must be one of {ALLOWED_RESOLUTIONS}")` if not in set
2. `ALLOWED_DURATIONS = {5, 10}` — raise `ValueError(f"Invalid duration: {duration}. Must be one of {ALLOWED_DURATIONS}")` if not in set
3. Return `f"  --resolution {resolution}  --duration {duration}  --camerafixed {str(camerafixed).lower()}  --watermark {str(watermark).lower()}"`

Note: `str(True).lower()` produces `"true"` and `str(False).lower()` produces `"false"` — correct for the BytePlus API.

**`def calculate_cost_usd(self, total_tokens: int) -> float`:**

```python
def calculate_cost_usd(self, total_tokens: int) -> float:
    """Return USD cost for the given token count at $2.50 per 1M tokens."""
    return (total_tokens / 1_000_000) * self.BYTEPLUS_USD_PER_1M_TOKENS
```

**`async def aclose(self) -> None`:**

```python
async def aclose(self) -> None:
    """Close the underlying httpx client. Call in a finally block after use."""
    await self.client.aclose()
```

### File: `python-backend/app/llm_proxy/providers/__init__.py`

Add the new provider import and export alongside the existing `KieAIProvider` entry. The current file ends with:

```python
from .kie_ai_provider import KieAIProvider

__all__ = [
    ...
    "KieAIProvider",
]
```

Add:

```python
from .byteplus_modelark_provider import BytePlusModelArkProvider
```

And add `"BytePlusModelArkProvider"` to the `__all__` list.

## Implementation Notes (Actual vs. Planned)

**Files actually created/modified:**
- `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py` ✅ (new)
- `python-backend/app/llm_proxy/providers/__init__.py` ✅ (updated export)
- `python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py` ✅ (stub tests placed per existing convention, not `tests/providers/` which doesn't exist)

**Deviations from plan:**
1. Test stubs placed in `tests/unit/llm_proxy/` (not `tests/providers/`) — matches existing provider test convention (test_ollama_provider.py, test_openrouter_provider.py etc.)
2. Added defensive `.get()` response parsing with explicit `ValueError` for missing required fields — plan showed bare dict access which would crash on malformed 200 responses
3. Added error-path structlog events (`*_http_error`, `*_request_error`) in all three async methods — matching KieAIProvider pattern the plan mandates
4. `frozenset[str]` and `dict[str, str]` type annotations (spec called for these but example code showed bare `frozenset`)

**Test count:** 32 stub tests pass (14 sync structural + 18 async stubs with `...` bodies — full async tests in section 04)

## Verification Steps

After implementing, run the following (no test suite needed yet — section 04 owns the tests):

```bash
cd /home/dev/projects/SmartSpecPro/python-backend

# 1. Lint — must pass with zero errors
ruff check app/llm_proxy/providers/byteplus_modelark_provider.py

# 2. Type check — must pass (gradual mode, missing stubs tolerated)
mypy app/llm_proxy/providers/byteplus_modelark_provider.py

# 3. Verify the import works
python -c "from app.llm_proxy.providers import BytePlusModelArkProvider; print('OK')"

# 4. Verify class constants are correct
python -c "
from app.llm_proxy.providers import BytePlusModelArkProvider
assert len(BytePlusModelArkProvider.IMAGE_MODELS) == 2
assert len(BytePlusModelArkProvider.VIDEO_MODELS) == 4
assert BytePlusModelArkProvider.SIZE_MAP['2048x2048'] == '2K'
assert BytePlusModelArkProvider.SIZE_MAP['2K'] == '2K'
assert BytePlusModelArkProvider.BYTEPLUS_USD_PER_1M_TOKENS == 2.5
print('All constants verified OK')
"
```

## Security Checklist for This Section

Before marking implementation complete:

- [ ] `validate_uri_no_ssrf(reference_image_url)` is called as the **first action** in `create_video_task` when `reference_image_url` is not `None` — before building the content array or making any HTTP call
- [ ] `_build_inline_params` validates `resolution` against `{"720p", "1080p"}` and raises `ValueError` on any other value (including `"4K"`, `"1440p"`, `"SD"`, etc.)
- [ ] `_build_inline_params` validates `duration` against `{5, 10}` and raises `ValueError` on any other integer
- [ ] The API key never appears in any `structlog` log event (check all `logger.info/warning/error` calls — log `base_url`, `model`, `size`, `resolution`, `duration`, but not `self._api_key` or `api_key`)
- [ ] The `httpx.AsyncClient` is created once in `__init__` and reused — not created per method call
- [ ] `get_task_status` uses a 30s per-request timeout override, not the 90s client default

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| `httpx.AsyncClient` timeout | 90s default, 30s per-request override for status polls | Image generation can take up to ~90s synchronously; status polls should fail fast |
| SIZE_MAP identity entries | `"1K": "1K"`, `"2K": "2K"`, `"4K": "4K"` | Gateway may pass pre-formatted shorthand values; prevents silent fallthrough to default |
| Inline params via allowlist | `{"720p", "1080p"}` and `{5, 10}` | Parameters are concatenated into model prompt; allowlists prevent prompt injection |
| `validate_uri_no_ssrf` before content array | First thing in `create_video_task` | Fail fast before any network activity; prevents SSRF via I2V reference images |
| `_api_key` with underscore prefix | Convention for internal attribute | Signal to logging code not to log it; consistent with Python privacy convention |
| `frozenset` for model sets | `IMAGE_MODELS`, `VIDEO_MODELS` are `frozenset` | Immutable class-level sets; `in` checks are O(1) |

## Section Dependencies

This section has **no dependencies** on other sections in this feature. It can be implemented immediately.

Sections that depend on this section:
- **section-04** (`python-backend/tests/providers/test_byteplus_modelark_provider.py`): Full test suite for this class
- **section-05** (`gateway_unified.py` routing): Imports `BytePlusModelArkProvider` and its `IMAGE_MODELS`/`VIDEO_MODELS` constants
- **section-06** (`media_tasks.py` polling): Imports `BytePlusModelArkProvider` and its `VIDEO_MODELS` constant; uses `get_task_status()`