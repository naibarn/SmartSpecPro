# BytePlus ModelArk API Integration — Usage Guide

## What Was Built

Full integration of BytePlus ModelArk (Volcano Engine) as a media generation provider alongside the existing Kie.ai provider. Covers image generation (synchronous), video generation (async with polling), Node.js type system, and Celery task recovery.

---

## Commits

| Section | Commit | Description |
|---------|--------|-------------|
| 01 | `89eb883` | Node.js template — `BytePlusModelArkTemplate` class stub in `apps/web/server/services/mediaProviders/` |
| 02 | `97ad19e` | Node.js media model registry — `BYTEPLUS_MEDIA_MODELS`, rate limiter config, shared constants in `packages/shared/src/constants/menu.ts` |
| 03 | `ab748d3` | Python adapter — `BytePlusModelArkProvider` class with `generate_image()`, `create_video_task()`, `get_task_status()`, `aclose()` |
| 04 | `985ae9d` | Python adapter tests — comprehensive test suite for `BytePlusModelArkProvider` |
| 05 | `51b8e91` | Gateway routing — BytePlus dispatch in `generate_image()` and `generate_video()` in `gateway_unified.py` |
| 06 | `6f6ad75` | Polling integration — BytePlus branch in `recover_stuck_tasks` with `_normalize_byteplus_task_state`, `_extract_byteplus_result_url` |

---

## Key Files

### Python Backend

| File | Role |
|------|------|
| `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py` | HTTP client for BytePlus ModelArk API |
| `python-backend/app/llm_proxy/gateway_unified.py` | Routing layer — dispatches image/video requests to BytePlus when model is in `IMAGE_MODELS`/`VIDEO_MODELS` |
| `python-backend/app/tasks/media_tasks.py` | Polling recovery — `_recover_stuck_tasks_async` routes BytePlus video tasks to new BytePlus polling branch |

### Node.js Backend

| File | Role |
|------|------|
| `apps/web/server/services/mediaProviders/BytePlusModelArkTemplate.ts` | Provider template for admin UI |
| `packages/shared/src/constants/menu.ts` | `BYTEPLUS_MEDIA_MODELS` registry with `VIDEO_MODELS` and `IMAGE_MODELS` |

### Tests

| File | Tests |
|------|-------|
| `python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py` | BytePlusModelArkProvider unit tests |
| `python-backend/tests/unit/llm_proxy/test_gateway_unified_byteplus.py` | Gateway routing tests (16 tests) |
| `python-backend/tests/tasks/test_media_tasks_byteplus.py` | Polling integration tests (22 tests) |

---

## Supported Models

### Image Models (`BytePlusModelArkProvider.IMAGE_MODELS`)
- `seedream-4-5-251128`
- `seedream-4-0-250429`

### Video Models (`BytePlusModelArkProvider.VIDEO_MODELS`)
- `seedance-1-0-pro-250528`
- `seedance-1-0-pro-fast-251015`
- `seedance-1-0-lite-t2v-250428`
- `seedance-1-0-lite-i2v-250428`

---

## Configuration

Add BytePlus ModelArk credentials via **Admin > Media Providers**:

| Field | Description |
|-------|-------------|
| `apiKey` | BytePlus ModelArk API key (Volcano Engine IAM access key) |
| `baseUrl` | Optional — defaults to `https://ark.ap-southeast.bytepluses.com/api/v3` |

The system stores the key via `get_media_provider_key("byteplus_modelark")` (same infrastructure as Kie.ai).

---

## Request Flow

### Image Generation (synchronous)

```
Client → gateway_unified.generate_image()
       → BytePlusModelArkProvider.generate_image()
       → POST /images/generations
       → returns ImageGenerationResponse with result URL
```

### Video Generation (asynchronous)

```
Client → gateway_unified.generate_video()
       → BytePlusModelArkProvider.create_video_task()
       → POST /videos/generations  (returns task_id immediately)
       → MediaTask saved with status=PROCESSING, task_id=provider_task_id
       → Celery beat recover_stuck_tasks (runs every 2 min)
         → BytePlusModelArkProvider.get_task_status(task_id)
         → GET /contents/generations/tasks/{task_id}
         → On succeeded: MediaTask → COMPLETED, result_url set
         → On failed/cancelled: MediaTask → FAILED, error_message set
         → On 429: task left PROCESSING, retried next cycle
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Provider not configured (no API key) | HTTP 503 with message "BytePlus ModelArk not configured" |
| BytePlus HTTP 500/4xx during generation | HTTP 500 with sanitized message (no raw httpx details) |
| BytePlus HTTP 429 during polling | Task left PROCESSING, retried on next 2-min cycle |
| BytePlus reports `failed`/`cancelled` | MediaTask marked FAILED, error from `response["error"]["message"]` truncated to 200 chars |
| `BytePlusModelArkProvider` init or network failure | `aclose()` called in `finally` block regardless |

---

## Security Notes

- API key never logged — only `user_id` and `model` appear in structlog output
- Error details from provider (httpx exceptions) are NOT forwarded to clients; a fixed sanitized string is returned
- `error_msg` from provider's `error.message` field is truncated to 200 chars before storage/logging

---

## Running Tests

```bash
cd python-backend

# All BytePlus tests
uv run pytest tests/ -k "byteplus" -v --no-cov

# Section-specific
uv run pytest tests/tasks/test_media_tasks_byteplus.py -v --no-cov
uv run pytest tests/unit/llm_proxy/test_gateway_unified_byteplus.py -v --no-cov
uv run pytest tests/unit/llm_proxy/test_byteplus_modelark_provider.py -v --no-cov
```

---

## Known Gaps

- **R2 URL resolution for video reference images**: The `reference_image_url` field passed to `create_video_task()` uses the raw URL from the request. If the image is stored in Cloudflare R2 (private bucket), the URL may not be publicly accessible to BytePlus. A pre-signed URL or proxy step would be needed for private R2 images.
- **Image model polling**: Seedream image models generate synchronously and are not included in the `VIDEO_MODELS` polling branch. If a future BytePlus image model becomes async, it would fall through to the Kie.ai branch incorrectly and would need its own polling path.
