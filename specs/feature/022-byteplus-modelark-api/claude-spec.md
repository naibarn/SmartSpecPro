# Combined Specification: Feature 022 — BytePlus ModelArk API Integration

**Date:** 2026-02-23
**Status:** Ready for plan generation
**Source:** Initial spec + codebase research + web research + stakeholder interview

---

## 1. What We Are Building

Integrate **BytePlus ModelArk** (ByteDance's AI model platform) as a new media generation provider in SmartSpecPro, enabling users to generate:
- **Images** via Seedream models (synchronous, result returned immediately)
- **Videos** via Seedance models (asynchronous, task-based polling)

The integration adds BytePlus as a peer to the existing Kie.ai provider, reusing the same admin UI, model registry, credit system, polling supervisor, and storage infrastructure.

---

## 2. BytePlus API Summary

### Authentication
```
Base URL:  https://ark.ap-southeast.bytepluses.com/api/v3  (configurable per provider record)
Auth:      Authorization: Bearer <api_key>
Content-Type: application/json
```

### Image Generation (Synchronous)
- **Endpoint:** `POST /api/v3/images/generations`
- **Result:** Returned immediately in response body at `data[0].url`
- **No polling needed**
- Models: `seedream-4-5-251128`, `seedream-4-0-250828`
- Key params: `model`, `prompt`, `size` ("1K"/"2K"/"4K"), `response_format: "url"`, `stream: false`, `watermark: bool`

**Size mapping:**
| SmartSpecPro | BytePlus |
|---|---|
| `1024x1024` / `"1K"` | `"1K"` |
| `2048x2048` / `"2K"` | `"2K"` |
| `4096x4096` / `"4K"` | `"4K"` |

### Video Generation (Async)
- **Create task:** `POST /api/v3/contents/generations/tasks`
- **Poll status:** `GET /api/v3/contents/generations/tasks/{task_id}`
- Models: `seedance-1-0-pro-fast-251015`, `seedance-1-0-pro-250528`, `seedance-1-0-lite-t2v-250428`, `seedance-1-0-lite-i2v-250428`

**Content array format:**
- T2V: `[{"type": "text", "text": "<prompt>  --resolution 720p  --duration 5  --camerafixed false  --watermark true"}]`
- I2V: T2V content + `{"type": "image_url", "image_url": {"url": "<public_r2_url>"}}`

**Inline parameters** (validated allowlist before concatenation):
- `--resolution`: `"720p"` or `"1080p"`
- `--duration`: `5` or `10`
- `--camerafixed`: `true` or `false`
- `--watermark`: `true` or `false`

**Task status values:**
- `queued` / `processing` → internal `"processing"` (continue polling)
- `succeeded` → internal `"success"` (extract `content[].video_url.url`)
- `failed` / `cancelled` → internal `"fail"` (terminal, do not retry)

### API Limits
- **Rate limit:** 300 RPM
- **Concurrency:** 5 simultaneous tasks
- Must handle 429 responses with backoff (not task failure)

---

## 3. Models to Register

| Model ID | Display Name | Type | Suggested Credits |
|---|---|---|---|
| `seedream-4-5-251128` | Seedream 4.5 | image | 15 |
| `seedream-4-0-250828` | Seedream 4.0 | image | 10 |
| `seedance-1-0-pro-fast-251015` | Seedance 1.0 Pro Fast | video | 30 |
| `seedance-1-0-pro-250528` | Seedance 1.0 Pro | video | 40 |
| `seedance-1-0-lite-t2v-250428` | Seedance 1.0 Lite T2V | video | 20 |
| `seedance-1-0-lite-i2v-250428` | Seedance 1.0 Lite I2V | video | 20 |

Model configJson defaults:
- Images: `{"size": "2K", "watermark": true}`
- Video: `{"resolution": "1080p", "duration": 5, "camerafixed": false, "watermark": true}`

---

## 4. Cost Calculation

**Rate:** $2.50 USD per 1 million tokens (same for images and video)

**Formula:** `cost_usd = (usage.total_tokens / 1_000_000) * 2.5`

**Source field:** `usage.total_tokens` from BytePlus API response (both image and task status responses include this field)

**Credit reporting:** Match KieAI behavior — return actual cost from Celery task so the system can reconcile credits charged vs. actually used.

---

## 5. Architecture Decisions

### 5.1 Routing Layer: `media_tasks.py` Direct

The BytePlus adapter is initialized directly in `generate_image_task` and `generate_video_task` Celery tasks (not via `gateway_unified.py`). This avoids touching the complex gateway and matches the spec's explicit guidance.

The Celery tasks already have the necessary context:
- `request_data` contains model, prompt, parameters
- Provider config is fetched via `get_media_provider_key("byteplus_modelark")`

### 5.2 Polling: Extend `recover_stuck_tasks`

The existing periodic supervisor task (`recover_stuck_tasks`, runs every 2 minutes) is extended to handle BytePlus providers. When `provider_name == "byteplus_modelark"`:
1. Fetch provider config via `get_media_provider_key("byteplus_modelark")`
2. Call `BytePlusModelArkProvider.get_task_status(external_task_id)`
3. Use `_normalize_byteplus_task_state()` to map status
4. Use `_extract_byteplus_result_url()` to extract video URL
5. Update `MediaTask` in DB (COMPLETED or FAILED)

### 5.3 I2V Reference Image URLs

R2 URLs in this codebase are **public** (no expiry). No URL conversion is needed before passing to BytePlus. The adapter must still call `validate_uri_no_ssrf()` on the URL as a security check before including it in the content array.

### 5.4 Watermark Control

Watermark default stored in `configJson.defaultWatermark` per model record (admin-controlled only). No UI toggle for users. BytePlus adds watermarks by default (`watermark: true`).

### 5.5 Test Connection

The `testBytePlusModelArk()` function uses:
```
GET /api/v3/contents/generations/tasks?page_size=3&filter.status=succeeded
Authorization: Bearer <api_key>
```
A 200 response confirms connectivity; a 401 confirms the API key is invalid.

---

## 6. Files to Create or Modify

### New Files
1. `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py` — Provider adapter class
2. `python-backend/tests/providers/test_byteplus_modelark_provider.py` — Unit tests

### Modified Files
3. `python-backend/app/llm_proxy/providers/__init__.py` — Export `BytePlusModelArkProvider`
4. `python-backend/app/tasks/media_tasks.py` — Add BytePlus routing in `generate_image_task`/`generate_video_task`, add normalization helpers, extend `recover_stuck_tasks`
5. `apps/web/server/routers/mediaProviders.ts` — Add provider template, `testBytePlusModelArk()`, wire into `testConnection` switch

---

## 7. Security Requirements

### 7.1 API Key Safety
- Stored encrypted in `media_providers.apiKeyEncrypted` (AES-256-GCM)
- Never logged — only log `configured: true/false` and provider name
- Decrypted by `media_provider_service.decrypt_api_key()` (no changes needed)

### 7.2 SSRF Prevention — Test Connection
- Call `validateExternalUrl(baseUrl)` before `testBytePlusModelArk()` makes any HTTP request
- BytePlus base URL (`ark.ap-southeast.bytepluses.com`) is public — passes validation

### 7.3 SSRF Prevention — I2V Reference Image
- Call `validate_uri_no_ssrf(reference_image_url)` before including in content array
- Raises `ValueError` if private/local URL detected

### 7.4 Inline Parameter Injection
- Validate `--resolution`, `--duration`, `--camerafixed`, `--watermark` values against allowlists
- NEVER interpolate raw user prompt text into inline params suffix
- `_build_inline_params()` must raise `ValueError` on invalid values

---

## 8. Error Handling

### 429 Rate Limit
- Do NOT mark task as failed
- Retry with exponential backoff (match KieAI behavior)
- Log warning with `provider_name`, endpoint, attempt count

### 401 Unauthorized
- Log error: API key invalid or expired
- Mark task as FAILED with error message: "BytePlus API key is invalid"
- Do not retry

### 5xx Server Errors
- Transient — retry up to 3 times
- Log error with status code and (truncated) response body

### Terminal Task States (failed/cancelled)
- Extract error message from BytePlus response if available
- Store in `MediaTask.errorMessage`
- Match KieAI pattern for what to surface to user vs. log only

---

## 9. Testing Requirements

### Unit Tests (`python-backend/tests/providers/test_byteplus_modelark_provider.py`)

Required test cases:
- `test_generate_image_success` — Mock API response, verify request shape and result URL extraction
- `test_generate_image_size_mapping` — `"1024x1024" → "1K"`, `"2048x2048" → "2K"`, `"4096x4096" → "4K"`
- `test_create_video_task_t2v` — Text-only content array, verify inline params in text
- `test_create_video_task_i2v` — Text + image_url content array
- `test_get_task_status_succeeded` — Extract video URL from `content[].video_url.url`
- `test_get_task_status_processing` — Returns processing state
- `test_get_task_status_failed` — Returns fail state
- `test_inline_params_construction` — Valid params produce correct suffix
- `test_inline_params_invalid_resolution` — Raises ValueError on invalid value
- `test_normalize_byteplus_status` — `succeeded→success`, `failed→fail`, `queued→processing`
- `test_extract_byteplus_result_url` — Extract from `content[].video_url.url`
- `test_ssrf_validation_reference_image` — Reject internal/local URLs for I2V
- `test_api_key_not_logged` — structlog capfd shows no API key in output
- `test_cost_calculation` — `(45 tokens / 1_000_000) * 2.5 = correct USD`

### tRPC Integration Tests
- BytePlus template appears in `mediaProviders.templates` list
- `testConnection` switch routes to `testBytePlusModelArk()`
- SSRF validation blocks private IPs in `testBytePlusModelArk()`

---

## 10. Implementation Order

### Phase 1 — Node.js Router (low risk)
1. Add BytePlus template to `PROVIDER_TEMPLATES` in `mediaProviders.ts`
2. Implement `testBytePlusModelArk()` with SSRF validation
3. Wire into `testConnection` switch
4. Run: `cd apps/web && pnpm check`

### Phase 2 — Python Provider Adapter
1. Create `byteplus_modelark_provider.py`
2. Update `__init__.py` export
3. Add status normalization and URL extraction helpers in `media_tasks.py`
4. Add BytePlus routing in `generate_image_task` and `generate_video_task`
5. Extend `recover_stuck_tasks` for BytePlus polling
6. Run: `ruff check app/ && mypy app/`

### Phase 3 — Tests
1. Write all unit tests in `test_byteplus_modelark_provider.py`
2. Run: `pytest tests/providers/test_byteplus_modelark_provider.py -v`
3. Run full suite: `pytest`

### Phase 4 — Manual Verification
1. Register BytePlus provider in admin
2. Create 6 models via admin UI (or seed script)
3. End-to-end test per checklist in spec §8.3
