# Implementation Plan: Feature 022 — BytePlus ModelArk API Integration

**Date:** 2026-02-23
**Risk Level:** HIGH — new encrypted API key storage, external async task flow
**Phases:** 4 (Node.js template + registry → Python adapter → LLMGateway routing + polling → Tests)
**Revision:** Updated after Opus review (integration notes: `claude-integration-notes.md`)

---

## Overview

SmartSpecPro needs to add BytePlus ModelArk (ByteDance's AI platform) as a new media generation provider, alongside the existing Kie.ai provider. This enables image generation via Seedream models (synchronous API) and video generation via Seedance models (async task API).

The integration is purely additive — no existing tables, UI, or credit infrastructure changes. The work spans two runtimes: the Node.js/tRPC backend (provider template registration, connection testing, and MEDIA_MODELS registry) and the Python/Celery backend (provider adapter and LLMGateway routing).

The key architectural distinction from Kie.ai is that BytePlus uses **two different API flows** depending on media type: image generation is synchronous (URL returned immediately in the response body), while video generation is asynchronous (a task ID is returned and the result must be polled). This means the Python adapter must handle both flows and route based on the model name.

---

## System Context

SmartSpecPro's media generation pipeline works as follows:

1. The user selects a provider and model in MediaStudio
2. The Node.js `mediaGenerationService.ts` looks up the model in `MEDIA_MODELS` to get the provider, then dispatches a request to Python FastAPI (`/api/v1/media/async/image` or `/api/v1/media/async/video`)
3. The Python FastAPI handler creates a `MediaTask` DB record and dispatches a Celery task (`generate_image_task` or `generate_video_task`)
4. The Celery task calls `LLMGateway(db).generate_image(request, user)` or `.generate_video(request, user)` — **this is the correct integration point for BytePlus routing**
5. For async video: `LLMGateway.generate_video()` returns the `external_task_id` immediately; the Celery task stores it on `MediaTask` and returns
6. A periodic Celery beat task (`recover_stuck_tasks`, every 2 minutes) polls any `PROCESSING` tasks until they complete or fail
7. Results are stored in R2 and the `MediaTask` DB record is updated

BytePlus fits this model exactly: image generation completes within `LLMGateway.generate_image()`; video generation uses the `recover_stuck_tasks` supervisor. No new Celery beat tasks or queues are needed.

**Critical architectural note:** The Celery tasks themselves (`generate_image_task`, `generate_video_task`) have no provider-specific branching — they delegate entirely to `LLMGateway`. The correct integration points are `LLMGateway.generate_image()`, `LLMGateway.generate_video()`, and `recover_stuck_tasks`.

---

## Phase 1: Node.js/tRPC — Provider Template, Connection Test, and MEDIA_MODELS

### 1.1 Provider Template

**File:** `apps/web/server/routers/mediaProviders.ts`

Add a BytePlus ModelArk entry to the `PROVIDER_TEMPLATES` array. The structure must match existing entries (KieAI template). Key fields:

- `providerName`: `"byteplus_modelark"` (the string used everywhere as the provider identifier)
- `displayName`: `"BytePlus ModelArk"`
- `description`: Short description of Seedream (image) and Seedance (video) capabilities
- `providerType`: `"multimodal"` (supports both image and video)
- `baseUrl`: `"https://ark.ap-southeast.bytepluses.com/api/v3"` (configurable per provider record in admin)
- `defaultModel`: `"seedream-4-5-251128"`
- `availableModels`: All 6 models — 2 image (Seedream 4.5, Seedream 4.0) and 4 video (Seedance Pro Fast, Pro, Lite T2V, Lite I2V) — each with `id`, `name`, `type`, and `description`

### 1.2 Connection Test Function

**File:** `apps/web/server/routers/mediaProviders.ts`

Implement `testBytePlusModelArk(apiKey: string, baseUrl: string): Promise<{success, message, latencyMs}>`.

The function makes a GET request to `{baseUrl}/contents/generations/tasks?page_size=3&filter.status=succeeded` with the `Authorization: Bearer <apiKey>` header. A 200 response means the key is valid; a 401 means invalid key. Record start time before the request and compute `latencyMs` from elapsed time.

**SSRF requirement:** Call `validateExternalUrl(baseUrl)` before making any HTTP request. The function already exists in the router and blocks private/internal addresses. This must happen before the fetch — not after.

### 1.3 Wire Into testConnection Switch

**File:** `apps/web/server/routers/mediaProviders.ts`

In the `testConnection` tRPC procedure, add a `case "byteplus_modelark":` branch that calls `testBytePlusModelArk(apiKey, provider.baseUrl || "https://ark.ap-southeast.bytepluses.com/api/v3")`. Place it alongside the existing `case "kie_ai":` branch.

### 1.4 Update MEDIA_MODELS Registry and TypeScript Types

**File:** `apps/web/server/services/mediaGenerationService.ts`

This is required for correct provider routing and rate limiting in the Node.js layer. The `MEDIA_MODELS` registry is used at lines 362-363 and elsewhere to get the `provider` string for rate limiting and scheduling. Without BytePlus model entries, these models fall back to `provider: "kie.ai"` which will route them to the wrong rate limiter bucket.

**1.4a TypeScript union types** — Add all 6 BytePlus model IDs to the `ImageModel` and `VideoModel` union types near the top of the file.

**1.4b MEDIA_MODELS entries** — Add an entry for each of the 6 BytePlus models with:
- `provider: "byteplus_modelark"`
- `type: "image"` or `"video"` as appropriate
- `creditCost`: per the spec table (15/10 for images, 20/30/40 for videos)
- `capabilities`: appropriate array per model (T2V, I2V, or both)
- `description`: Short description matching the spec

**Verification:** After all Phase 1 changes, run `cd apps/web && pnpm check` to confirm no TypeScript errors.

---

## Phase 2: Python — BytePlus Provider Adapter

**New file:** `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py`

### 2.1 Class Structure

The class `BytePlusModelArkProvider` follows the `KieAIProvider` pattern: it holds an `httpx.AsyncClient` as an instance attribute (not created per-request), stores auth headers in `self._headers`, and logs via `structlog`. The API key must never appear in log output.

**Class-level constants:**
- `BASE_URL`: the default Southeast Asia endpoint (`https://ark.ap-southeast.bytepluses.com/api/v3`)
- `VIDEO_MODELS`: a set of the 4 Seedance model IDs (these use the task/polling endpoint)
- `IMAGE_MODELS`: a set of the 2 Seedream model IDs (these use the sync image endpoint)
- `SIZE_MAP`: dictionary mapping SmartSpecPro size strings to BytePlus size values. Must include both pixel formats and shorthand identity mappings: `{"1024x1024": "1K", "2048x2048": "2K", "4096x4096": "4K", "1K": "1K", "2K": "2K", "4K": "4K"}`. Without identity mappings, already-formatted inputs like `"2K"` would not be found in the dict.
- `BYTEPLUS_USD_PER_1M_TOKENS = 2.5`: the pricing constant ($2.50 USD per 1 million tokens)

**`__init__(self, api_key: str, base_url: str | None = None)`:** Stores the API key (not logged), sets `self.base_url` with trailing slash stripped, builds `self._headers` with the Bearer token and Content-Type, and creates an `httpx.AsyncClient` with a default timeout of 90s (the maximum needed for synchronous image generation). Polling requests will use per-request timeout overrides (30s) to avoid blocking the recovery task on slow status checks. The client instance persists across method calls.

### 2.2 Image Generation Method

**`async def generate_image(self, model: str, prompt: str, size: str = "2K", watermark: bool = True) -> dict`**

Maps the `size` parameter through `SIZE_MAP` to get the BytePlus size string (defaults to `"2K"` if not found). Builds the request payload with `model`, `prompt`, `size`, `response_format: "url"`, `stream: false`, `watermark`, and `sequential_image_generation: "disabled"`. POSTs to `{base_url}/images/generations`.

Returns a dict with: `result_url` (from `data[0].url`), `provider_task_id` (from `response.id`), `usage_tokens` (from `usage.total_tokens`), and the raw response for debugging.

Raises `httpx.HTTPStatusError` on non-200 responses. Logs the request (model, size) but not the API key.

### 2.3 Video Task Creation Method

**`async def create_video_task(self, model: str, prompt: str, resolution: str = "720p", duration: int = 5, camerafixed: bool = False, watermark: bool = True, reference_image_url: str | None = None) -> dict`**

Validates `reference_image_url` (if provided) using `validate_uri_no_ssrf()` from `app.core.media_job_validators` before including it in the content array. This prevents SSRF via I2V reference images.

Builds inline params via `_build_inline_params()` (see §2.5) and appends to the prompt text. Constructs the `content` array:
- Always includes a `{"type": "text", "text": "<prompt> + inline_params"}` item
- For I2V (when `reference_image_url` provided): appends `{"type": "image_url", "image_url": {"url": reference_image_url}}`

POSTs to `{base_url}/contents/generations/tasks`. Returns `provider_task_id` (from `response.id`) and initial `status` (from `response.status`).

### 2.4 Task Status Method

**`async def get_task_status(self, task_id: str) -> dict`**

GETs `{base_url}/contents/generations/tasks/{task_id}` with a per-request timeout of 30s (overrides the client default). Returns the raw response dict. The caller (`recover_stuck_tasks`) is responsible for status normalization and URL extraction.

### 2.5 Inline Parameters Builder

**`def _build_inline_params(self, resolution: str, duration: int, camerafixed: bool, watermark: bool) -> str`**

This is a security-critical method. It must validate against allowlists before any string concatenation:
- `resolution` must be in `{"720p", "1080p"}` — raise `ValueError` otherwise
- `duration` must be in `{5, 10}` — raise `ValueError` otherwise
- `camerafixed` and `watermark` are Python booleans — no additional validation needed beyond type

Returns the inline params suffix string: `"  --resolution {resolution}  --duration {duration}  --camerafixed {lower_bool}  --watermark {lower_bool}"`.

**Why this matters:** The inline params are concatenated into a string that goes to BytePlus's model as part of the prompt. Invalid values could cause unexpected model behavior or constitute prompt injection. The validated params are appended at the end of the user's text prompt — BytePlus uses the last occurrence, so these values take precedence.

### 2.6 Cost Calculation Helper

**`def calculate_cost_usd(self, total_tokens: int) -> float`**

Returns `(total_tokens / 1_000_000) * BYTEPLUS_USD_PER_1M_TOKENS`. Used by the LLMGateway routing code to report actual usage after generation.

### 2.7 Resource Cleanup

**`async def aclose(self)`**

Closes the `httpx.AsyncClient`. Called in a `try/finally` block when the provider instance is no longer needed.

### 2.8 Export Registration

**File:** `python-backend/app/llm_proxy/providers/__init__.py`

Add `from .byteplus_modelark_provider import BytePlusModelArkProvider` alongside the existing `KieAIProvider` import.

---

## Phase 3: Python — LLMGateway Routing and Polling Integration

### 3.1 Status Normalization Helpers

**File:** `python-backend/app/tasks/media_tasks.py`

Add two module-level helper functions, parallel to the existing Kie.ai helpers:

**`_normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]`**

Maps BytePlus status strings to the internal normalized state used throughout the codebase:
- `"succeeded"` → `("success", "succeeded")`
- `"failed"` or `"cancelled"` → `("fail", original_status)`
- `"queued"` or `"processing"` → `("processing", original_status)`
- anything else → `("unknown", original_status)`

Returns a `(normalized, raw)` tuple matching the convention of `_normalize_kie_task_state`.

**`_extract_byteplus_result_url(status_response: dict) -> str | None`**

Iterates over `status_response.get("content", [])`. For each item, checks:
- If `type == "video_url"`: returns `item["video_url"]["url"]` if it starts with `"http"`
- If `type == "image_url"`: returns `item["image_url"]["url"]` if it starts with `"http"`

Returns `None` if no valid URL is found.

### 3.2 Extend LLMGateway Image Generation

**File:** `python-backend/app/llm_proxy/gateway_unified.py`

In `LLMGateway.generate_image()`, before the existing Kie.ai client initialization and generation, add a model-based routing check:

```
if request.model in BytePlusModelArkProvider.IMAGE_MODELS:
    # Route to BytePlus
    ...
    return BytePlus image response (wrapped in ImageGenerationResponse)
# Otherwise fall through to existing Kie.ai code
```

The BytePlus branch:
1. Gets provider config via `get_media_provider_key("byteplus_modelark")`
2. Raises `HTTPException(503)` if config is `None` or API key missing
3. Instantiates `BytePlusModelArkProvider(api_key=config["apiKey"], base_url=config.get("baseUrl"))`
4. Extracts `size` from `request` (the `size` or `aspect_ratio` field, mapped to BytePlus size format; defaults to `"2K"`)
5. Calls `await client.generate_image(model=request.model, prompt=request.prompt, size=size)`
6. Deducts credits using `await self._deduct_credits(user, client.calculate_cost_usd(result["usage_tokens"]))`
7. Wraps the result in `ImageGenerationResponse` matching the existing return shape (data with `url`, `revised_prompt` etc.)
8. Calls `await client.aclose()` in a `try/finally` block

The credit estimation path (`_estimate_cost`) should return a reasonable estimate for BytePlus models based on model credit cost from the registry (same as Kie.ai does).

### 3.3 Extend LLMGateway Video Generation

**File:** `python-backend/app/llm_proxy/gateway_unified.py`

In `LLMGateway.generate_video()`, add the same model-based routing check:

```
if request.model in BytePlusModelArkProvider.VIDEO_MODELS:
    # Route to BytePlus
    ...
    return BytePlus video task response
```

The BytePlus branch:
1. Gets provider config and instantiates `BytePlusModelArkProvider`
2. Extracts video parameters from `request`: `resolution` (from `request.extra_params` or model configJson, default `"1080p"`), `duration` (from `request.extra_params` or configJson, default `5`), `camerafixed` (default `False`)
3. Extracts `reference_image_url` from `request.reference_image_urls[0]` if present (I2V case) — these are already resolved to public URLs by the gateway's existing R2 resolution code that runs before the provider call
4. Calls `await client.create_video_task(model=request.model, prompt=request.prompt, resolution=resolution, duration=duration, camerafixed=camerafixed, reference_image_url=reference_image_url)`
5. Returns a `VideoGenerationResponse` with `id = provider_task_id` and `status = "queued"`
6. Closes the client in a `try/finally` block

The video task ID is returned to the Celery task, which stores it in `MediaTask.task_id` for polling. No change to the Celery task infrastructure is needed.

### 3.4 Extend `recover_stuck_tasks`

**File:** `python-backend/app/tasks/media_tasks.py`

Inside `_recover_stuck_tasks_async`, in the per-task loop, add model-based provider detection. Currently the function hardcodes `get_media_provider_key("kie_ai")` for all tasks. The updated logic should be:

```python
# Detect provider from model name
from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
if task.model in BytePlusModelArkProvider.VIDEO_MODELS:
    # BytePlus task
    provider_config = await get_media_provider_key("byteplus_modelark")
    ...use BytePlusModelArkProvider + _normalize_byteplus_task_state + _extract_byteplus_result_url
else:
    # Default: Kie.ai task
    ...existing Kie.ai code (unchanged)
```

**BytePlus task handling in `recover_stuck_tasks`:**
1. Get provider config via `get_media_provider_key("byteplus_modelark")` — if None, skip task with a warning log
2. Instantiate `BytePlusModelArkProvider(api_key=config["apiKey"], base_url=config.get("baseUrl"))`
3. Call `await client.get_task_status(task.task_id)` using the stored external_task_id
4. Pass the response to `_normalize_byteplus_task_state()` to get normalized state
5. On `"success"`: call `_extract_byteplus_result_url()` to get the URL, then use the existing video download + R2 upload flow, then update `MediaTask` to `COMPLETED`
6. On `"fail"`: update `MediaTask` to `FAILED` with error message from `status_response.get("error", {}).get("message", "Task failed")`
7. On `"processing"`: do nothing — the next periodic cycle will re-check
8. Close the client in a `try/finally` block

**Rate limit (429) handling:** If `get_task_status` raises an HTTP 429, log a warning and skip that task for this cycle. Do not mark as failed.

**Polling interval note:** `recover_stuck_tasks` runs every 2 minutes via Celery beat. This means BytePlus video tasks are polled every ~2 minutes rather than the 5-second interval in the BytePlus spec. This is a deliberate production trade-off (reduces API calls and Celery worker load). Users see task completion within 2 minutes of actual completion.

---

## Phase 4: Tests

**New file:** `python-backend/tests/providers/test_byteplus_modelark_provider.py`

(Verify that `tests/providers/` exists; if not, use the top-level `tests/` directory following the existing test convention.)

### 4.1 Unit Tests — Provider Adapter

All tests mock `httpx.AsyncClient` methods to avoid real network calls. Use `pytest-asyncio` for async test functions and `respx` or `unittest.mock` (whichever the existing provider tests use) for HTTP mocking.

Required test cases and their intent:

**Image generation:**
- `test_generate_image_success`: Mock a 200 response with `data[0].url` set. Assert the returned `result_url` matches. Assert request body contains correct `model`, `size`, `watermark` fields.
- `test_generate_image_size_mapping`: Assert `"1024x1024"` maps to `"1K"`, `"2048x2048"` to `"2K"`, `"4096x4096"` to `"4K"`. Also assert that `"2K"` input maps to `"2K"` (identity mapping works).

**Video task creation:**
- `test_create_video_task_t2v`: Mock a 200 task creation response. Assert content array has exactly 1 item of type `"text"`, and text includes the inline params suffix.
- `test_create_video_task_i2v`: Provide a reference image URL. Assert content array has 2 items — text and image_url — and `image_url.url` matches the reference.

**Task status:**
- `test_get_task_status_succeeded`: Mock a succeeded response with `content[].video_url.url`. Assert `_extract_byteplus_result_url` returns the URL.
- `test_get_task_status_processing`: Assert `_normalize_byteplus_task_state` returns `("processing", "queued")` and `("processing", "processing")`.
- `test_get_task_status_failed`: Assert normalization returns `("fail", "failed")` and `("fail", "cancelled")`.

**Inline params:**
- `test_inline_params_construction`: Call `_build_inline_params` with valid values, assert the result string contains all four flags with correct values.
- `test_inline_params_invalid_resolution`: Call with `resolution="4K"` (not in allowlist), assert `ValueError` is raised.
- `test_inline_params_invalid_duration`: Call with `duration=15`, assert `ValueError` is raised.

**Status normalization:**
- `test_normalize_byteplus_status`: Parameterized test covering all 5 BytePlus status values → their internal mappings.

**URL extraction:**
- `test_extract_byteplus_result_url`: Test with `video_url` type content, `image_url` type content, empty content array, and content with no URL.

**Security:**
- `test_ssrf_validation_reference_image`: Pass a localhost URL (`http://localhost/img.jpg`) as reference image URL to `create_video_task`. Assert `ValueError` is raised before any HTTP call is made.
- `test_api_key_not_logged`: Capture structlog output during a `generate_image` call. Assert the API key string does not appear in any log record.

**Cost calculation:**
- `test_cost_calculation`: Call `calculate_cost_usd(1_000_000)` and assert result is `2.5`. Call with `45` tokens and assert approximately `0.0001125`.

### 4.2 tRPC Integration Tests

If `apps/web/server/routers/mediaProviders.test.ts` exists, add:
- Test that `byteplus_modelark` appears in the list returned by the `templates` procedure
- Test that `testConnection` with `provider_name == "byteplus_modelark"` calls `testBytePlusModelArk`
- Test that `testBytePlusModelArk` blocks SSRF by passing a private IP as `baseUrl`

---

## Security Checklist

Before marking this implementation complete, verify:

- [ ] `validateExternalUrl(baseUrl)` is called before `testBytePlusModelArk` makes any HTTP request
- [ ] `validate_uri_no_ssrf(reference_image_url)` is called before any I2V content array is built
- [ ] `_build_inline_params` validates `resolution` and `duration` against allowlists and raises `ValueError` on invalid values
- [ ] The API key never appears in any `structlog` log record (covered by `test_api_key_not_logged`)
- [ ] `getApiKey` tRPC procedure returns `{configured: boolean}` not the actual key value (already handled by existing router pattern)
- [ ] 429 responses do not mark tasks as `FAILED` — they are skipped for this poll cycle

---

## Key Design Decisions (Reference)

| Decision | Choice | Rationale |
|---|---|---|
| Routing integration point | `LLMGateway.generate_image/video()` | Correct per actual codebase; Celery tasks delegate entirely to gateway |
| Provider detection method | Model name in `BytePlusModelArkProvider.IMAGE_MODELS`/`VIDEO_MODELS` | No schema change needed; model sets are authoritative |
| Video polling | Extend `recover_stuck_tasks` with model-based detection | Consistent with KieAI; no new beat tasks or queues |
| Polling interval | 2-minute beat (not 5-second) | Pragmatic; reduces API calls; max 2-min completion delay |
| I2V URL type | Public R2 URLs (resolved by gateway before routing) | Gateway's existing R2 resolver handles this |
| Cost tracking | `calculate_cost_usd()` feeds `_deduct_credits()` in gateway | Consistent with gateway credit pipeline |
| Token rate | `$2.50 / 1M tokens` | Per spec; same for Seedream images and Seedance video |
| Watermark | Admin configJSON only | Simpler UX; no per-generation toggle |
| Test connection | GET /contents/generations/tasks?page_size=3 | Tests auth + endpoint reachability |
| Error handling | Match KieAI pattern | Consistency; 429 → skip, not fail |
| httpx timeout | Per-request override for status polls (30s) | Single client, different timeouts per operation |
| SIZE_MAP | Includes both pixel and shorthand identity entries | Handles both `"1024x1024"` and `"2K"` inputs safely |
