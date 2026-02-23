# TDD Plan: Feature 022 — BytePlus ModelArk API Integration

**Testing frameworks:**
- Python: `pytest` + `pytest-asyncio` + `respx` (for httpx mocking) — follows `python-backend/tests/` conventions
- TypeScript: `Vitest` — follows `apps/web/` conventions
- Coverage requirement: 80% minimum (Python), enforced by CI

---

## Phase 1: Node.js/tRPC — Provider Template, Connection Test, and MEDIA_MODELS

### 1.1 Provider Template

Tests (Vitest, in `apps/web/server/routers/mediaProviders.test.ts`):
```
# Test: PROVIDER_TEMPLATES includes an entry with providerName "byteplus_modelark"
# Test: BytePlus template has providerType "multimodal"
# Test: BytePlus template has exactly 6 models in availableModels (2 image, 4 video)
# Test: BytePlus template defaultModel is "seedream-4-5-251128"
# Test: BytePlus template baseUrl is the Southeast Asia endpoint
```

### 1.2 Connection Test Function

Tests (Vitest):
```
# Test: testBytePlusModelArk returns {success: true, latencyMs: number} on 200 response
# Test: testBytePlusModelArk returns {success: false} on 401 response
# Test: testBytePlusModelArk calls validateExternalUrl(baseUrl) before fetch
# Test: testBytePlusModelArk raises/rejects when baseUrl is a private IP (SSRF blocked)
# Test: testBytePlusModelArk uses correct Authorization header format (Bearer token)
```

### 1.3 Wire Into testConnection Switch

Tests (Vitest):
```
# Test: testConnection procedure with provider_name "byteplus_modelark" invokes testBytePlusModelArk
# Test: testConnection procedure with provider_name "kie_ai" still invokes the KieAI test (no regression)
```

### 1.4 MEDIA_MODELS Registry and TypeScript Types

Tests (Vitest):
```
# Test: MEDIA_MODELS["seedream-4-5-251128"] has provider "byteplus_modelark" and type "image"
# Test: MEDIA_MODELS["seedream-4-0-250828"] has provider "byteplus_modelark" and type "image"
# Test: MEDIA_MODELS["seedance-1-0-pro-250528"] has provider "byteplus_modelark" and type "video"
# Test: MEDIA_MODELS["seedance-1-0-lite-t2v-250428"] has provider "byteplus_modelark" and type "video"
# Test: MEDIA_MODELS["seedance-1-0-lite-i2v-250428"] has provider "byteplus_modelark" and type "video"
# Test: MEDIA_MODELS["seedance-1-0-pro-fast-251015"] has provider "byteplus_modelark" and type "video"
# Test: TypeScript compilation succeeds (pnpm check) — this validates the union types
```

---

## Phase 2: Python — BytePlus Provider Adapter

### 2.1 Class Structure

Tests (pytest, `tests/providers/test_byteplus_modelark_provider.py`):
```
# Test: BytePlusModelArkProvider.__init__ does not log the api_key value
# Test: BytePlusModelArkProvider.__init__ sets self.base_url with trailing slash stripped
# Test: IMAGE_MODELS set contains exactly 2 model IDs (both Seedream)
# Test: VIDEO_MODELS set contains exactly 4 model IDs (all Seedance)
# Test: SIZE_MAP includes both pixel format and shorthand identity entries
```

### 2.2 Image Generation Method

Tests (pytest + respx):
```
# Test: generate_image — happy path: POST to correct URL, returns result_url from data[0].url
# Test: generate_image — request body contains correct model, size, watermark, stream:false
# Test: generate_image_size_mapping — "1024x1024" → "1K"
# Test: generate_image_size_mapping — "2048x2048" → "2K"
# Test: generate_image_size_mapping — "4096x4096" → "4K"
# Test: generate_image_size_mapping — "2K" → "2K" (identity mapping)
# Test: generate_image — returns usage_tokens from usage.total_tokens
# Test: generate_image — raises httpx.HTTPStatusError on 401 response
# Test: generate_image — raises httpx.HTTPStatusError on 500 response
```

### 2.3 Video Task Creation Method

Tests (pytest + respx):
```
# Test: create_video_task T2V — content array has exactly 1 text item
# Test: create_video_task T2V — text item contains the prompt + inline params suffix
# Test: create_video_task I2V — content array has 2 items (text + image_url)
# Test: create_video_task I2V — image_url item url matches reference_image_url
# Test: create_video_task — returns provider_task_id from response.id
# Test: create_video_task — returns initial status from response.status
```

### 2.4 Task Status Method

Tests (pytest + respx):
```
# Test: get_task_status — GET to correct URL with task_id in path
# Test: get_task_status — returns raw response dict unchanged
# Test: get_task_status — uses per-request 30s timeout (not the 90s client default)
```

### 2.5 Inline Parameters Builder

Tests (pytest):
```
# Test: _build_inline_params — valid inputs produce correct suffix string with all 4 flags
# Test: _build_inline_params — camerafixed=True produces "--camerafixed true" (lowercase bool)
# Test: _build_inline_params — resolution="4K" raises ValueError
# Test: _build_inline_params — resolution="1440p" raises ValueError
# Test: _build_inline_params — duration=15 raises ValueError
# Test: _build_inline_params — duration=0 raises ValueError
```

### 2.6 Cost Calculation Helper

Tests (pytest):
```
# Test: calculate_cost_usd(1_000_000) == 2.5
# Test: calculate_cost_usd(0) == 0.0
# Test: calculate_cost_usd(45) ≈ 0.0001125 (floating point tolerance)
```

### Security Tests

Tests (pytest):
```
# Test: create_video_task — localhost reference_image_url raises ValueError before any HTTP call
# Test: create_video_task — 127.0.0.1 reference_image_url raises ValueError
# Test: generate_image — API key does not appear in structlog captured output
# Test: create_video_task — API key does not appear in structlog captured output
```

---

## Phase 3: Python — LLMGateway Routing and Polling Integration

### 3.1 Status Normalization Helpers

Tests (pytest, in `tests/tasks/test_media_tasks_byteplus.py` or alongside existing tests):
```
# Test: _normalize_byteplus_task_state("succeeded") → ("success", "succeeded")
# Test: _normalize_byteplus_task_state("failed") → ("fail", "failed")
# Test: _normalize_byteplus_task_state("cancelled") → ("fail", "cancelled")
# Test: _normalize_byteplus_task_state("queued") → ("processing", "queued")
# Test: _normalize_byteplus_task_state("processing") → ("processing", "processing")
# Test: _normalize_byteplus_task_state("unknown_status") → ("unknown", "unknown_status")

# Test: _extract_byteplus_result_url — content with video_url → returns url
# Test: _extract_byteplus_result_url — content with image_url → returns url
# Test: _extract_byteplus_result_url — empty content → returns None
# Test: _extract_byteplus_result_url — content with non-http url → returns None
# Test: _extract_byteplus_result_url — content with unknown type → returns None
```

### 3.2 Extend LLMGateway Image Generation

Tests (pytest, mock `BytePlusModelArkProvider.generate_image`):
```
# Test: LLMGateway.generate_image routes to BytePlus when model is "seedream-4-5-251128"
# Test: LLMGateway.generate_image routes to BytePlus when model is "seedream-4-0-250828"
# Test: LLMGateway.generate_image raises HTTP 503 when BytePlus not configured (no provider key)
# Test: LLMGateway.generate_image still routes to KieAI for non-BytePlus model (no regression)
# Test: LLMGateway.generate_image returns ImageGenerationResponse with result url on success
# Test: LLMGateway.generate_image calls aclose() in finally block (even on error)
```

### 3.3 Extend LLMGateway Video Generation

Tests (pytest, mock `BytePlusModelArkProvider.create_video_task`):
```
# Test: LLMGateway.generate_video routes to BytePlus when model is in VIDEO_MODELS
# Test: LLMGateway.generate_video passes reference_image_url[0] for I2V models
# Test: LLMGateway.generate_video returns VideoGenerationResponse with provider_task_id
# Test: LLMGateway.generate_video still routes to KieAI for non-BytePlus model (no regression)
# Test: LLMGateway.generate_video calls aclose() in finally block
```

### 3.4 Extend `recover_stuck_tasks`

Tests (pytest, mock both KieAI and BytePlus clients):
```
# Test: recover_stuck_tasks dispatches to BytePlus for task with Seedance model
# Test: recover_stuck_tasks dispatches to KieAI for task with non-BytePlus model (no regression)
# Test: recover_stuck_tasks marks task COMPLETED on BytePlus "succeeded" + valid URL
# Test: recover_stuck_tasks marks task FAILED on BytePlus "failed" status
# Test: recover_stuck_tasks skips task (no state change) on BytePlus "processing" status
# Test: recover_stuck_tasks skips task with warning log when BytePlus not configured
# Test: recover_stuck_tasks does NOT mark task FAILED on HTTP 429 from BytePlus
# Test: recover_stuck_tasks calls aclose() after each BytePlus task check
```

---

## Implementation Order (TDD-first approach)

For each phase, follow this sequence:
1. Write the stub test file (test functions with `assert False` or `pytest.mark.skip`)
2. Run tests — confirm they all fail (red)
3. Implement the production code
4. Run tests — confirm they all pass (green)
5. Refactor if needed, keeping tests passing
6. `ruff check` + `mypy app/` before moving to next phase

**Phase-level integration test:** After Phase 3, run the full `pytest python-backend/` suite to catch regressions. After Phase 1 TypeScript changes, run `cd apps/web && pnpm check && pnpm test`.
