<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-nodejs-template
section-02-nodejs-media-models
section-03-python-adapter
section-04-python-adapter-tests
section-05-gateway-routing
section-06-polling-integration
END_MANIFEST -->

# Implementation Sections Index — Feature 022: BytePlus ModelArk API Integration

This feature adds BytePlus ModelArk (ByteDance) as a media generation provider, spanning two runtimes:
- **Node.js/TypeScript** (sections 01–02): Provider template, connection test, and MEDIA_MODELS registry in `apps/web/`
- **Python/Celery** (sections 03–06): Provider adapter, LLMGateway routing, and polling integration in `python-backend/`

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-nodejs-template | — | section-02 (weakly), section-07 | Yes |
| section-02-nodejs-media-models | — | section-07 | Yes |
| section-03-python-adapter | — | section-04, section-05, section-06 | Yes |
| section-04-python-adapter-tests | section-03 | — | Yes (after 03) |
| section-05-gateway-routing | section-03 | — | Yes (after 03) |
| section-06-polling-integration | section-03 | — | Yes (after 03) |

## Execution Order

1. **Batch 1** — sections 01, 02, 03 in parallel (no dependencies)
2. **Batch 2** — sections 04, 05, 06 in parallel (all depend on section-03 planning)

## Section Summaries

### section-01-nodejs-template

**Files:** `apps/web/server/routers/mediaProviders.ts`
**Test command:** `cd apps/web && pnpm test` (Vitest)

Add BytePlus ModelArk to the `PROVIDER_TEMPLATES` array (6 models: 2 Seedream image, 4 Seedance video). Implement `testBytePlusModelArk(apiKey, baseUrl)` — calls `GET /contents/generations/tasks?page_size=3` with Bearer auth, validates SSRF before any HTTP call, returns `{success, message, latencyMs}`. Wire into `testConnection` switch with `case "byteplus_modelark"`. Include Vitest tests for the template structure, connection test function (happy path, 401, SSRF block), and the switch routing.

### section-02-nodejs-media-models

**Files:** `apps/web/server/services/mediaGenerationService.ts`
**Test command:** `cd apps/web && pnpm check && pnpm test` (TypeScript + Vitest)

Add all 6 BytePlus model IDs to the `ImageModel` and `VideoModel` TypeScript union types. Add 6 entries to the `MEDIA_MODELS` registry with `provider: "byteplus_modelark"`, correct `type` (image/video), `creditCost` (per spec table: 15/10 image, 40/30/20/20 video), and `capabilities` (T2V/I2V as appropriate). Include Vitest tests asserting provider, type, and creditCost for all 6 models. TypeScript compilation (`pnpm check`) serves as validation for the union types.

### section-03-python-adapter

**Files:**
- `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py` (new)
- `python-backend/app/llm_proxy/providers/__init__.py` (update export)

**Test command:** `cd python-backend && ruff check app/ && mypy app/`

Create the `BytePlusModelArkProvider` class following the `KieAIProvider` pattern:
- Class constants: `BASE_URL`, `VIDEO_MODELS` (4 Seedance IDs), `IMAGE_MODELS` (2 Seedream IDs), `SIZE_MAP` (pixel→shorthand + identity entries), `BYTEPLUS_USD_PER_1M_TOKENS = 2.5`
- `__init__`: stores api_key (never logged), sets base_url, builds Bearer headers, creates `httpx.AsyncClient(timeout=90)`
- `generate_image(model, prompt, size, watermark)`: POST `/images/generations`, maps size through SIZE_MAP, returns `{result_url, provider_task_id, usage_tokens}`
- `create_video_task(model, prompt, resolution, duration, camerafixed, watermark, reference_image_url)`: validates reference_image_url via `validate_uri_no_ssrf()`, builds inline params via `_build_inline_params()`, constructs content array (text always; image_url for I2V), POST `/contents/generations/tasks`, returns `{provider_task_id, status}`
- `get_task_status(task_id)`: GET `/contents/generations/tasks/{task_id}` with 30s per-request timeout, returns raw response dict
- `_build_inline_params(resolution, duration, camerafixed, watermark)`: validates resolution ∈ {720p, 1080p} and duration ∈ {5, 10}, raises ValueError on invalid values, returns `"  --resolution X  --duration Y  --camerafixed Z  --watermark W"` suffix
- `calculate_cost_usd(total_tokens)`: returns `(total_tokens / 1_000_000) * BYTEPLUS_USD_PER_1M_TOKENS`
- `aclose()`: closes httpx client
- Export `BytePlusModelArkProvider` from `providers/__init__.py`

### section-04-python-adapter-tests

**Files:** `python-backend/tests/providers/test_byteplus_modelark_provider.py` (new)
**Test command:** `cd python-backend && uv run pytest tests/providers/test_byteplus_modelark_provider.py -v`

Comprehensive pytest test suite for `BytePlusModelArkProvider`. Uses `respx` for httpx mocking (matching existing provider test conventions). Covers:
- **Image generation**: happy path (request shape, size mapping for all 4 inputs including identity), HTTP error propagation, usage_tokens extraction
- **Video task T2V**: content array has 1 text item with prompt + inline params
- **Video task I2V**: content array has 2 items (text + image_url), reference URL matches
- **Task status**: correct URL format with task_id, 30s timeout applied, raw response returned
- **Inline params**: valid inputs → correct suffix string, boolean lowercase, ValueError for invalid resolution/duration
- **Cost calculation**: 1M tokens → 2.5, 0 → 0.0, 45 → ≈0.0001125
- **Status normalization** (via `_normalize_byteplus_task_state`): all 5 status values (succeeded/failed/cancelled/queued/processing) mapped correctly
- **URL extraction** (`_extract_byteplus_result_url`): video_url type, image_url type, empty content, non-http url, unknown type
- **Security**: localhost/127.0.0.1 reference_image_url raises ValueError before any HTTP call; API key does not appear in captured structlog output

### section-05-gateway-routing

**Files:** `python-backend/app/llm_proxy/gateway_unified.py`
**Test command:** `cd python-backend && uv run pytest tests/ -k "gateway" -v`

Extend `LLMGateway.generate_image()` and `LLMGateway.generate_video()` with model-based BytePlus routing:

**Image routing** (in `generate_image`):
- Check `if request.model in BytePlusModelArkProvider.IMAGE_MODELS`
- Get `get_media_provider_key("byteplus_modelark")` → raise HTTP 503 if None
- Instantiate `BytePlusModelArkProvider`, call `generate_image()`, deduct credits via `_deduct_credits(user, calculate_cost_usd(usage_tokens))`
- Return `ImageGenerationResponse` with result_url; call `aclose()` in try/finally
- Fall through to existing KieAI code for non-BytePlus models (no regression)

**Video routing** (in `generate_video`):
- Check `if request.model in BytePlusModelArkProvider.VIDEO_MODELS`
- Get provider config, instantiate, extract `resolution`/`duration`/`camerafixed` from `request.extra_params` or model configJson (defaults: "1080p", 5, False)
- Extract `reference_image_url = request.reference_image_urls[0]` if present (I2V)
- Call `create_video_task()`, return `VideoGenerationResponse` with `id = provider_task_id`, `status = "queued"`
- Call `aclose()` in try/finally

Include pytest tests (mock `BytePlusModelArkProvider`) asserting:
- Image routing for both Seedream models; 503 on missing config; KieAI regression unchanged
- Video routing for a Seedance model; reference_image_url passed for I2V; KieAI regression unchanged
- `aclose()` called in finally block even on error

### section-06-polling-integration

**Files:** `python-backend/app/tasks/media_tasks.py`
**Test command:** `cd python-backend && uv run pytest tests/ -k "byteplus" -v`

Add status normalization helpers and extend `recover_stuck_tasks` with BytePlus support:

**New module-level helpers:**
- `_normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]`: maps BytePlus status strings to internal state (succeeded→success, failed/cancelled→fail, queued/processing→processing, else→unknown)
- `_extract_byteplus_result_url(status_response: dict) -> str | None`: iterates `content[]`, returns URL from first `video_url` or `image_url` item that starts with "http"

**Extend `_recover_stuck_tasks_async`** — in the per-task loop, add model-based provider detection before the existing KieAI code:
- Import and check `if task.model in BytePlusModelArkProvider.VIDEO_MODELS`
- Get `get_media_provider_key("byteplus_modelark")` → log warning + skip if None
- Instantiate `BytePlusModelArkProvider`, call `get_task_status(task.task_id)`
- On success: extract URL via `_extract_byteplus_result_url()`, run existing download/R2-upload flow, update MediaTask to COMPLETED
- On fail: update MediaTask to FAILED with `status_response.get("error", {}).get("message", "Task failed")`
- On processing: do nothing (next cycle will re-check)
- On HTTP 429: log warning, skip (do NOT mark failed)
- Call `aclose()` in try/finally for every task

Include pytest tests (mock `BytePlusModelArkProvider.get_task_status`) in `tests/tasks/test_media_tasks_byteplus.py`:
- Dispatches to BytePlus for Seedance model, KieAI for non-BytePlus (regression)
- COMPLETED on succeeded + valid URL; FAILED on failed status; no change on processing
- Warning log + skip when BytePlus not configured; no FAILED on HTTP 429
- `aclose()` called after each task check
