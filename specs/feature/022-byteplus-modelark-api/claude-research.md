# Research Findings: Feature 022 — BytePlus ModelArk API Integration

**Date:** 2026-02-23
**Feature:** BytePlus ModelArk media provider integration (Seedream images + Seedance videos)
**Research sources:** Codebase exploration + web research on BytePlus API, Celery polling, httpx patterns

---

## Part 1: Codebase Architecture — Existing Provider System

### 1.1 KieAI Provider Pattern (`python-backend/app/llm_proxy/providers/kie_ai_provider.py`)

The BytePlus adapter must mirror the KieAI pattern closely. Key observations:

**Class structure:**
- `__init__(api_key, base_url, callback_url)` — stores auth, creates `httpx.AsyncClient(timeout=600s)`
- `_make_request(method, endpoint, data)` — centralized HTTP handler, logs via structlog, raises on errors
- Separate methods: `generate_image()`, `generate_video()`, `generate_audio()`
- `get_task_status(task_id, preferred_endpoint, extra_endpoints)` — multi-endpoint fallback strategy
- `_normalize_response(task_id, response)` — exhaustive URL extraction from multiple response shapes

**HTTP client:** Uses `httpx.AsyncClient` as an instance attribute (persisted across calls, not per-request). Timeout: 600s for generation calls.

**Logging:** All requests logged via `structlog`. API key never logged — only provider name and `configured: true/false`.

**Error handling:** Raises `httpx.HTTPStatusError`, `httpx.RequestError`, `json.JSONDecodeError`. Callers handle these.

**Authentication:** `Authorization: Bearer {api_key}` header, `Content-Type: application/json`.

### 1.2 Media Tasks Celery System (`python-backend/app/tasks/media_tasks.py`)

**Provider routing pattern (current):**
```python
# In generate_image_task and generate_video_task:
# The LLMGateway handles routing — tasks call gateway.generate_image/video()
# Gateway initializes KieAIProvider via get_media_provider_key("kie_ai")
```

**Critical: Video submission flow:**
- `generate_video_task` calls `gateway.generate_video(wait_for_completion=False)` — returns immediately
- Stores `external_task_id` in `task.task_id` DB column
- Status stays `PROCESSING`
- `recover_stuck_tasks` periodic task (every 2 min) polls for completion

**`recover_stuck_tasks` — the polling supervisor:**
- Queries `PROCESSING` tasks with `task_id IS NOT NULL` and `started_at < 2 minutes ago`
- Calls `kie_ai_client.get_task_status(task_id, preferred_endpoint)` for each stuck task
- Uses `_normalize_kie_task_state()` to map states
- Uses `_extract_first_kie_result_url()` to get result URLs
- Updates DB: `COMPLETED` on success, `FAILED` on failure
- Processes up to 20 tasks per cycle

**Status normalization (`_normalize_kie_task_state`):**
- Returns `(normalized_state, raw_state)` tuple
- Normalized states: `success | fail | processing | unknown`
- Checks `successFlag`, `state` field, HTTP `code`

**Result URL extraction (`_extract_first_kie_result_url`):**
- Searches multiple nested paths in the response
- Returns first valid URL starting with `http`

**`_extract_model_query_endpoint(config_json)`:**
- Parses model's `configJson` for custom status endpoint
- Keys checked: `apiQueryEndpoint`, `queryEndpoint`, `statusEndpoint`, `apiStatusEndpoint`

**`_run_async(coro)`:**
- Bridges async code into Celery's sync worker context
- Reuses existing event loop rather than calling `asyncio.run()` (critical for Celery workers)
- Located at lines 34–69 in `media_tasks.py`

### 1.3 Media Provider Service (`python-backend/app/services/media_provider_service.py`)

**`get_media_provider_key(provider_name: str) -> Optional[Dict]`:**
- Queries `media_providers` table by `providerName` where `isEnabled = true`
- 60-second TTL cache (`_provider_cache`)
- Decrypts `apiKeyEncrypted` via AES-256-GCM (key from `LLM_ENCRYPTION_KEY`)
- Returns dict: `{providerName, displayName, apiKey (decrypted), baseUrl, callbackUrl, configJson}`
- Returns `None` if provider not found, not enabled, or decryption fails

**No changes needed** — `get_media_provider_key("byteplus_modelark")` works as-is.

### 1.4 Python Providers `__init__.py`

Currently exports: `BaseLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `GoogleProvider`, `GroqProvider`, `OllamaProvider`, `OpenRouterProvider`, `ZAIProvider`, `KieAIProvider`.

Need to add: `from .byteplus_modelark_provider import BytePlusModelArkProvider`.

### 1.5 tRPC Media Providers Router (`apps/web/server/routers/mediaProviders.ts`)

**`PROVIDER_TEMPLATES` structure (KieAI example):**
```typescript
{
  providerName: "kie_ai",
  displayName: "Kie AI",
  description: "...",
  providerType: "multimodal" as const,
  baseUrl: "https://api.kie.ai/api/v1",
  defaultModel: "nano-banana-pro",
  availableModels: [
    { id: "...", name: "...", type: "image" as const, description: "..." },
    { id: "...", name: "...", type: "video" as const, description: "..." },
  ],
}
```

**`testConnection` switch:**
- Each provider has a dedicated `testXxx(apiKey, baseUrl)` function
- SSRF validation via `validateExternalUrl(url)` called before any HTTP request
- Returns `{success, message, latencyMs, balance?}`

**`testKieAI` pattern:** Calls `/account/balance` endpoint. For BytePlus, the spec suggests calling `GET /contents/generations/tasks?limit=1` (a 200/401 response confirms connectivity).

### 1.6 MediaStudio UI (`apps/web/client/src/pages/MediaStudio.tsx`)

**Reference images (I2V):**
- Users upload images, stored as `ReferenceImage[]` with `{url, name}`
- Passed to Python backend as `referenceImageUrls: string[]`
- Python backend resolves to public R2 URLs before sending to provider

**Video parameters:**
- `duration` stored in localStorage (`smartspec_duration_video`)
- `aspectRatio` stored in localStorage
- These are passed in the generation request payload

**Key implication:** MediaStudio already passes `referenceImageUrls` and `duration` correctly for existing providers. BytePlus adapter just needs to map these properly.

### 1.7 Media Job Validators (`python-backend/app/core/media_job_validators.py`)

**`validate_uri_no_ssrf(uri)`:**
- Blocks private IPs (127.x.x.x, 10.x.x.x, 192.168.x.x, 172.16-31.x.x)
- Blocks localhost, .local, .internal domains
- Blocks non-http/https schemes and shell metacharacters
- Exception: `host.docker.internal` is allowed (for local Docker networking)
- **Must be called** on `reference_image_url` before including it in BytePlus content array

### 1.8 Request Models (`python-backend/app/llm_proxy/models.py`)

Existing `VideoGenerationRequest` has:
- `model`, `prompt`, `duration`, `aspectRatio`
- `referenceImageUrls: Optional[List[str]]` — for I2V

These fields map directly to BytePlus inline params and content array construction.

### 1.9 LLM Gateway (`python-backend/app/llm_proxy/gateway_unified.py`)

Currently routes all image/video/audio to KieAI. New BytePlus routing needs to be added to `generate_image()` and `generate_video()` based on `provider_name`. The gateway also handles:
- Credit checking and deduction
- Reference image URL resolution (R2 upload)
- Response normalization back to SmartSpecPro format

### 1.10 Testing Setup

**Location:** `python-backend/tests/providers/`
**Framework:** `pytest` with `pytest-asyncio` for async tests
**Mocking:** `unittest.mock` / `pytest-mock` for httpx calls
**Pattern from existing tests:** Mock HTTP responses via `httpx.MockTransport` or `respx` library (need to verify which is used — `respx` is the standard for mocking httpx calls in tests)

---

## Part 2: BytePlus ModelArk API Findings

### 2.1 Authentication
```
Base URL:     https://ark.ap-southeast.bytepluses.com/api/v3
Auth:         Authorization: Bearer <api_key>
Content-Type: application/json
```
Regional endpoints exist. `baseUrl` should remain configurable in admin UI.

### 2.2 Image Generation (Synchronous)

**Endpoint:** `POST /api/v3/images/generations`

**Request:**
```json
{
  "model": "seedream-4-5-251128",
  "prompt": "...",
  "sequential_image_generation": "disabled",
  "response_format": "url",
  "size": "2K",
  "stream": false,
  "watermark": true
}
```

**Response:** Result URL in `data[0].url`. No polling needed — synchronous response.

**Size mapping:**
| SmartSpecPro | BytePlus |
|---|---|
| `1024x1024` / `1K` | `"1K"` |
| `2048x2048` / `2K` | `"2K"` |
| `4096x4096` / `4K` | `"4K"` |

### 2.3 Video Generation (Async Task)

**Create task:** `POST /api/v3/contents/generations/tasks`

**T2V request:**
```json
{
  "model": "seedance-1-0-lite-t2v-250428",
  "content": [{"type": "text", "text": "<prompt>  --resolution 720p  --duration 5  --camerafixed false  --watermark true"}]
}
```

**I2V request (adds image_url to content array):**
```json
{
  "model": "seedance-1-0-pro-250528",
  "content": [
    {"type": "text", "text": "<prompt>  --resolution 1080p  --duration 5  --camerafixed false"},
    {"type": "image_url", "image_url": {"url": "https://public-r2-url.jpg"}}
  ]
}
```

**Inline parameters (embedded in text content):**
- `--resolution` → `720p` or `1080p`
- `--duration` → `5` or `10`
- `--camerafixed` → `true` or `false`
- `--watermark` → `true` or `false`

**These must be validated (allowlist) before concatenation to prevent prompt injection.**

**Task creation response:** `{id, status: "queued", model, created_at}`

### 2.4 Task Status Polling

**Endpoint:** `GET /api/v3/contents/generations/tasks/{task_id}`

**Status mapping:**
| BytePlus status | Internal status |
|---|---|
| `queued` | `processing` |
| `processing` | `processing` |
| `succeeded` | `success` |
| `failed` | `fail` |
| `cancelled` | `fail` |

**Result URL extraction from `content` array:**
```python
for item in response.get("content", []):
    if item.get("type") == "video_url":
        return item.get("video_url", {}).get("url")
```

### 2.5 Polling Strategy
- Poll every 5 seconds, max 120 attempts (10-minute timeout)
- Uses existing `recover_stuck_tasks` supervisor pattern (aligns with codebase)

### 2.6 Model Registry

| Model ID | Display Name | Type | Notes |
|---|---|---|---|
| `seedream-4-5-251128` | Seedream 4.5 | image | Latest, highest quality |
| `seedream-4-0-250828` | Seedream 4.0 | image | Stable release |
| `seedance-1-0-pro-fast-251015` | Seedance 1.0 Pro Fast | video | T2V + I2V, fastest |
| `seedance-1-0-pro-250528` | Seedance 1.0 Pro | video | T2V + I2V, highest quality |
| `seedance-1-0-lite-t2v-250428` | Seedance 1.0 Lite T2V | video | T2V only |
| `seedance-1-0-lite-i2v-250428` | Seedance 1.0 Lite I2V | video | I2V only |

---

## Part 3: Celery Polling Best Practices

### 3.1 Two Approaches Compared

**Approach A — `recover_stuck_tasks` supervisor (used in this codebase):**
- Video submission task returns quickly, stores `external_task_id`
- Periodic beat task checks PROCESSING tasks every 2 minutes
- Resilient to worker restarts, easy to monitor via DB
- **Recommended for BytePlus** (matches existing architecture)

**Approach B — Countdown/ETA chain (Celery self.retry):**
- Submission task raises `self.retry(countdown=5)` to re-queue itself
- Workers freed between polls, better visibility in Flower
- Better at scale, but adds task queue pressure

### 3.2 Implementation Decision for BytePlus

**Use Approach A (supervisor pattern)** because:
1. The existing `recover_stuck_tasks` already has the infrastructure
2. Avoids adding 120 retries to the Celery queue per video
3. 10-minute polls would exceed `soft_time_limit` if done in-task
4. Consistent with KieAI approach

**Required change:** Extend `recover_stuck_tasks` to handle `provider_name == "byteplus_modelark"` using `BytePlusModelArkProvider.get_task_status()` and the new normalization helpers.

### 3.3 Error Handling Rules

- **Terminal states** (`failed`, `cancelled`): Do NOT retry, mark as `FAILED` immediately
- **Transient network errors** (`TimeoutException`, `ConnectError`, 5xx): Retry up to 3 times
- **Rate limits** (429): Retry with backoff
- **401**: Mark as failed, provider API key issue — do not retry

### 3.4 Timeout Configuration

```python
# Image generation (synchronous — may take 20-40s)
image_timeout = httpx.Timeout(90.0, connect=10.0)

# Video polling (status check — should be fast)
poll_timeout = httpx.Timeout(30.0, connect=10.0)

# Celery soft_time_limit for video tasks should be >= 660s
```

---

## Part 4: httpx Async Client Best Practices

### 4.1 Session Management

**Rule: One `AsyncClient` per provider instance, not per request.**

```python
class BytePlusModelArkProvider:
    def __init__(self, api_key: str, base_url: str | None = None):
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(90.0, connect=10.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )

    async def aclose(self):
        await self._client.aclose()
```

### 4.2 Celery Integration

Use the existing `_run_async()` helper from `media_tasks.py`:
- Do NOT use `asyncio.run()` inside Celery tasks
- `asyncio.run()` closes the event loop after each call, breaking subsequent async calls
- The `_run_async()` helper reuses the worker's event loop

**Alternative for simple Celery polling:** Use sync `httpx.Client` — simpler, no async bridge needed:

```python
# For recover_stuck_tasks polling calls (no blocking needed, just a status check)
with httpx.Client(timeout=30.0) as client:
    response = client.get(f"{base_url}/contents/generations/tasks/{task_id}",
                          headers={"Authorization": f"Bearer {api_key}"})
    return response.json()
```

### 4.3 Error Handling

Distinguish three error types:
- `httpx.HTTPStatusError`: Server responded with 4xx/5xx (has a status code)
- `httpx.TimeoutException`: Request timed out (transient, retry)
- `httpx.ConnectError`: Network/DNS failure (transient, retry)

Always log method, URL path (not full URL with credentials), status code, and timing. Never log the API key.

### 4.4 Inline Parameter Injection Prevention

Validate all video parameters before concatenating into the BytePlus prompt text:

```python
VALID_RESOLUTIONS = {"720p", "1080p"}
VALID_DURATIONS = {5, 10}

def _build_inline_params(resolution: str, duration: int, camerafixed: bool, watermark: bool) -> str:
    if resolution not in VALID_RESOLUTIONS:
        raise ValueError(f"Invalid resolution: {resolution!r}")
    if duration not in VALID_DURATIONS:
        raise ValueError(f"Invalid duration: {duration}")
    # camerafixed and watermark are typed bool — no validation needed beyond type
    return (f"  --resolution {resolution}"
            f"  --duration {duration}"
            f"  --camerafixed {str(camerafixed).lower()}"
            f"  --watermark {str(watermark).lower()}")
```

---

## Part 5: Testing Setup (from Codebase)

**Framework:** `pytest` + `pytest-asyncio` (Python 3.11+)
**Test location:** `python-backend/tests/providers/`
**Coverage requirement:** 80% minimum (enforced by pytest config)
**Mocking strategy:** Mock `httpx.AsyncClient.post` / `httpx.AsyncClient.get` for unit tests

**Key test cases to implement (from spec §8.1):**
- `test_generate_image_success()` — mock API response, verify request shape
- `test_generate_image_size_mapping()` — `1024x1024 → 1K`, `2048x2048 → 2K`
- `test_create_video_task_t2v()` — verify text-only content array
- `test_create_video_task_i2v()` — verify text + image_url content array
- `test_get_task_status_succeeded()` — extract video URL from content array
- `test_get_task_status_processing()` — return processing state
- `test_get_task_status_failed()` — return fail state
- `test_inline_params_construction()` — `--resolution 1080p --duration 5`
- `test_normalize_byteplus_status()` — `succeeded→success, failed→fail, queued→processing`
- `test_extract_byteplus_result_url()` — extract from `content[].video_url.url`
- `test_ssrf_validation_reference_image()` — reject internal URLs for I2V
- `test_api_key_not_logged()` — verify API key never in structlog output

---

## Part 6: Key Integration Decisions

### 6.1 Provider Routing Location

**Decision:** Add BytePlus routing to `gateway_unified.py` (`LLMGateway.generate_image/video()`), **not** to `media_tasks.py` directly.

**Rationale:**
- `media_tasks.py` already delegates to `LLMGateway`
- Gateway handles credit checks, R2 URL resolution, and response normalization
- Avoids duplicating provider init logic in Celery tasks

**Alternative:** Route directly in `media_tasks.py` (spec §4.3). This avoids going through the full gateway flow and is simpler if BytePlus has different credit tracking needs. The spec describes this approach in detail.

### 6.2 Polling Architecture

**Decision:** Extend `recover_stuck_tasks` to handle BytePlus (Approach A).

**Required:** Add `byteplus_modelark` branch inside `_recover_stuck_tasks_async` that:
1. Checks `provider_name == "byteplus_modelark"` from task params
2. Gets provider config via `get_media_provider_key("byteplus_modelark")`
3. Calls `BytePlusModelArkProvider.get_task_status(task_id)`
4. Uses `_normalize_byteplus_task_state()` and `_extract_byteplus_result_url()`

### 6.3 I2V Reference Image Requirement

BytePlus requires a **public URL** for the I2V reference image — cannot be a signed S3/R2 URL or localhost URL. The gateway already handles this via `r2_service.resolve_reference_urls()`. Need to verify that the R2 URLs produced are public (not signed).

### 6.4 Test Connection Endpoint

For `testBytePlusModelArk()` in the tRPC router, use:
- `GET /api/v3/contents/generations/tasks?limit=1` — lightweight list endpoint
- A 200 response confirms the API key is valid; a 401 means invalid key
- If the endpoint doesn't exist, fall back to a HEAD request on the base URL

---

## Sources

**Codebase (primary):**
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/services/media_provider_service.py`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/core/media_job_validators.py`
- `python-backend/app/llm_proxy/models.py`
- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `specs/feature/022-byteplus-modelark-api/spec.md`

**External documentation:**
- BytePlus ModelArk (main): https://docs.byteplus.com/en/docs/ModelArk
- BytePlus Create Video Task: https://docs.byteplus.com/en/docs/ModelArk/1520757
- BytePlus Retrieve Video Task: https://docs.byteplus.com/en/docs/ModelArk/1521309
- BytePlus Image Generation API: https://docs.byteplus.com/en/docs/ModelArk/1541523
- BytePlus Streaming Response: https://docs.byteplus.com/en/docs/ModelArk/1824137
- httpx AsyncClient: https://www.python-httpx.org/async/
- httpx Timeouts: https://www.python-httpx.org/advanced/timeouts/
- Celery Task Retries: https://docs.celeryq.dev/en/stable/userguide/tasks.html#retrying
