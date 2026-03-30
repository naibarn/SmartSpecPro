# Implementation Plan: fal.ai LTX-2.3 Video Models & Lux TTS Integration

## 1. Context & Motivation

SmartSpecPro's media generation pipeline supports multiple providers (Kie.ai, BytePlus, UVoice) for image, video, and audio generation. This plan adds fal.ai as a new provider with 12 models: 7 LTX-2.3 video models covering text-to-video, image-to-video, audio-to-video, extend-video, and retake-video workflows; 1 Lux TTS audio model for text-to-speech with voice cloning; and 4 Flux image models (already in the provider template but lacking Python backend routing).

The implementation spans both the TypeScript web layer (provider templates, seed scripts, rate limiting, SSRF defense, credit reconciliation) and the Python backend (provider handler, gateway routing, Celery polling).

## 2. Architecture Overview

### Data Flow

```
User selects fal.ai model in MediaStudio UI
  → tRPC media router validates input + SSRF checks extraParams URLs
  → Pre-reserves credits (composite tier key lookup)
  → Calls Python gateway_unified.py via HTTP
  → gateway routes to FalAIProvider based on resolved_provider == "fal_ai"
  → FalAIProvider validates URLs (SSRF + host.docker.internal)
  → Submits to fal.ai API:
      Video: queue.fal.run/{model_id} (async, returns request_id)
      Audio/Image: fal.run/{model_id} (sync, returns result immediately)
  → For video: Celery recover_stuck_tasks polls queue status
  → On completion: stores result URL + actual_duration in task.result_data
  → Node.js media status handler reconciles credits (actual vs pre-reserved)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pricing tier keys | Composite (`"1080p-6s": 360`) | Matches BytePlus pattern, no pricingCalculator changes needed |
| Credit reconciliation | Full (actual vs reserved) | Charges based on actual output; if actual > estimated, charges the difference |
| URL re-hosting | Direct URL storage | Matches BytePlus pattern; re-hosting deferred as cross-provider improvement |
| Image routing | Included | Makes fal.ai provider complete for all media types |
| TTS rate limiting | Redis-based | Stronger protection against voice cloning abuse |
| SSRF validation | Both tRPC + Python layers | Defense-in-depth; tRPC check benefits all providers |
| Concurrent task limit | Included (max 3) | Simple SQL check, prevents abuse |

## 3. Provider Template & Seed Script (TypeScript Layer)

### 3.1 Provider Template Update

Update `PROVIDER_TEMPLATES` in `apps/web/server/routers/mediaProviders.ts` to add LTX-2.3 video models and Lux TTS to the existing fal_ai entry's `availableModels` array. The same change must be mirrored in `apps/web/scripts/seed-media-providers.ts` `DEFAULT_PROVIDERS` — both must match exactly.

New models to add to `availableModels`:
- 7 LTX-2.3 video models (text-to-video standard/fast, image-to-video standard/fast, audio-to-video, extend-video, retake-video)
- 1 Lux TTS audio model

Also update the provider `description` to mention LTX-2.3 and Lux TTS capabilities.

### 3.2 Seed Script

Create `apps/web/scripts/seed-media-models-fal-ai.ts` following the pattern of `seed-media-models-byteplus.ts`:

**12 model definitions total:**
- 4 resolution-tiered video models (T2V standard/fast, I2V standard/fast) using `pricingFormula: "matrix"` with composite keys
- 3 flat-rate video models (A2V, extend, retake) using `pricingFormula: "matrix"` with duration-only keys
- 1 TTS model using `pricingFormula: "per_unit"` with character-based pricing
- 4 Flux image models using `pricingFormula: "flat"` — creditCost TBD (research fal.ai Flux pricing during implementation; use reasonable defaults like 10 credits for Schnell, 20 for Dev, 30 for Pro, 15 for SD3)

**Pricing tier structure for resolution-tiered models:**

Standard variants (T2V, I2V): `resolution` and `duration` fields both have `affectsPricing: true`
```
"1080p-6s": 360, "1080p-8s": 480, "1080p-10s": 600,
"1440p-6s": 720, "1440p-8s": 960, "1440p-10s": 1200,
"2160p-6s": 1440, "2160p-8s": 1920, "2160p-10s": 2400
```

Fast variants: Same structure with 2/3 pricing ratio.

Fast variants also support extended durations (12-20s) so need additional tier entries.

**Key configJson fields per model:**
- `apiEndpoint` — fal.ai endpoint path
- `apiPayloadFormat: "custom"` — FalAIProvider handles payload construction
- `generateType` — "video" or "audio" or "image"
- `inputFields` — field definitions matching the spec's parameter tables
- Resolution field must have `affectsPricing: true` on resolution-tiered models
- Duration field must have `affectsPricing: true` on all video models

**Seeding pattern:** DELETE existing fal_ai models then INSERT fresh (matching BytePlus seed script pattern). Uses `postgres` npm package for direct DB access.

### 3.3 API Key Validation Fix

Update `testFalAI()` in `mediaProviders.ts` to use an authenticated POST request instead of OPTIONS:
- POST to `https://queue.fal.run/fal-ai/flux/schnell` with `Authorization: Key {apiKey}`
- 422 (bad input) = key valid
- 401 = key invalid

## 4. Python Provider Handler

### 4.1 FalAIProvider Class

Create `python-backend/app/llm_proxy/providers/fal_ai_provider.py` as a plain class (no base class, matching KieAI/BytePlus convention).

**Class attributes:**
- `BASE_URL = "https://fal.run"` — sync endpoint
- `QUEUE_BASE_URL = "https://queue.fal.run"` — async queue endpoint
- `VIDEO_MODELS: frozenset[str]` — 7 LTX-2.3 model IDs (used by polling task to identify fal.ai tasks)
- `AUDIO_MODELS: frozenset[str]` — `{"fal-ai/lux-tts"}`
- `IMAGE_MODELS: frozenset[str]` — 4 Flux model IDs

**Constructor:** Takes `api_key: str` and optional `base_url: str`. Creates `httpx.AsyncClient(timeout=300.0)`. Sets `Authorization: Key {api_key}` header.

**Methods:**

```python
def _validate_urls(self, params: dict) -> None:
    """SSRF validation for user-supplied URL fields.
    Calls validate_uri_no_ssrf() + explicitly rejects host.docker.internal."""

async def generate_video(self, model_id: str, params: dict) -> dict:
    """Submit video to queue. Returns {id: request_id, status: PROCESSING, ...}"""

async def generate_audio(self, model_id: str, params: dict) -> dict:
    """Sync TTS generation. Returns {data: [{url: ...}], status: COMPLETED, ...}"""

async def generate_image(self, model_id: str, params: dict) -> dict:
    """Sync image generation. Returns {data: [{url: ...}], status: COMPLETED, ...}"""

async def _submit_queue(self, model_id: str, params: dict) -> str:
    """POST to queue.fal.run/{model_id}, returns request_id."""

async def get_queue_status(self, model_id: str, request_id: str) -> dict:
    """GET queue status. Returns {status: IN_QUEUE|IN_PROGRESS|COMPLETED}"""

async def get_queue_result(self, model_id: str, request_id: str) -> dict:
    """GET completed result. Normalizes to {data: [{url: ...}], actual_duration, ...}"""

async def aclose(self) -> None:
    """Close httpx client. MUST be called in finally block."""
```

**Error handling:** Wrap `raise_for_status()` to sanitize error messages:
- 401 → "Invalid fal.ai API key"
- 422 → "Content policy rejection"
- 429 → "fal.ai rate limit exceeded"
- Other → "fal.ai error (HTTP {status})" with no response body logged

**Prompt sanitization:** Strip HTML/XML tags from prompt before sending to fal.ai. Applied in all three generation methods (`generate_video`, `generate_audio`, `generate_image`) before the HTTP request.

### 4.2 SSRF Validation Details

The `_validate_urls()` method checks all user-supplied URL fields: `image_url`, `end_image_url`, `audio_url`, `video_url`.

Two-layer validation:
1. Call `validate_uri_no_ssrf()` from `media_job_validators.py` — rejects private IPs, localhost, file:// scheme
2. Explicitly reject `host.docker.internal` — the global validator whitelists it for asset downloads, but fal.ai URL fields should NOT allow it as it can access internal Node.js API

### 4.3 Provider Registration

Add `from .fal_ai_provider import FalAIProvider` and `"FalAIProvider"` to `__all__` in `providers/__init__.py`.

## 5. Gateway Routing

### 5.1 Provider ID Normalization

Add fal.ai aliases to `_normalize_provider_id()` in `gateway_unified.py`:
- Normalize `"fal"`, `"fal_ai"`, `"falai"`, `"fal_ai_provider"` → `"fal_ai"`

### 5.2 Video Routing

Add `elif resolved_provider == "fal_ai"` block in `generate_video()`:
1. Fetch provider config via `get_media_provider_key("fal_ai")`
2. Check concurrent task limit (max 3 in-flight per user)
3. Instantiate `FalAIProvider` with decrypted API key
4. Call `fal_client.generate_video(request.model, request.extra_params or {})`
5. `aclose()` in finally block
6. Return result dict (contains `request_id` for queue polling)

The result's `id` field contains the fal.ai `request_id` which gets stored in `task.task_id` for Celery polling.

### 5.3 Audio Routing

Add `elif resolved_provider == "fal_ai"` block in `generate_audio()`:
1. Fetch provider config
2. Instantiate `FalAIProvider`
3. Call `fal_client.generate_audio(request.model, request.extra_params or {})`
4. TTS is synchronous — result already contains audio URL
5. Deduct credits using `_deduct_credits()` with actual cost as USD Decimal
6. `aclose()` in finally block

### 5.4 Image Routing

Add `elif resolved_provider == "fal_ai"` block in `generate_image()`:
1. Same pattern as audio — synchronous POST to `fal.run/{model_id}`
2. Instantiate `FalAIProvider`, call `generate_image()`
3. `aclose()` in finally block

### 5.5 Concurrent Task Limit

Before submitting video tasks, count in-flight fal.ai tasks for the user:
```python
async def _check_fal_concurrent_limit(self, user_id: int) -> None:
    """Raise ValueError if user has >= 3 in-flight fal.ai tasks."""
```
Query `media_tasks` table: `WHERE user_id = X AND status = PROCESSING AND model IN (FalAIProvider.VIDEO_MODELS)`

## 6. Celery Polling Branch

### 6.1 recover_stuck_tasks Integration

Add fal.ai branch in `_recover_stuck_tasks_async()` in `media_tasks.py`, positioned BEFORE the Kie.ai fallback block and AFTER the BytePlus block.

**Detection:** `task.model in FalAIProvider.VIDEO_MODELS or task.model in FalAIProvider.AUDIO_MODELS`

**Polling flow:**
1. Fetch provider config via `get_media_provider_key("fal_ai")`
2. Instantiate `FalAIProvider`
3. Call `get_queue_status(task.model, task.task_id)` — `task.task_id` stores fal.ai `request_id`
4. If COMPLETED: call `get_queue_result()`, extract video URL, store in `task.result_url`
5. Store actual metrics in `task.result_data`: `actual_duration`, `actual_resolution` (derived from video width)
6. If FAILED: set `task.status = FAILED` with sanitized error message (max 200 chars)
7. If IN_QUEUE/IN_PROGRESS: skip (re-check next cycle)
8. `aclose()` in finally block

**Resolution derivation from width:**
- width >= 3840 → "2160p"
- width >= 2560 → "1440p"
- else → "1080p"

## 7. Credit Reconciliation

### 7.1 Pre-reservation (Existing)

Node.js tRPC media router already pre-reserves credits using `calculateCreditCost()` with composite tier keys before calling Python gateway. No changes needed here.

### 7.2 Post-completion Reconciliation (New)

In the Node.js media status polling handler (where frontend checks task status):

When task status transitions to COMPLETED and `task.resultData.actual_duration` is present:
1. Compute actual cost using the model's pricing tiers + actual duration + actual resolution
2. Compare to pre-reserved credits (`task.creditsReserved`)
3. If actual < reserved: refund the difference
4. If actual > reserved: charge the additional amount (per interview decision — no cap)

This requires the media status handler to know which model was used and its pricing config. The model ID is already stored on the task.

**File**: `apps/web/server/routers/media.ts` — the media status polling endpoint that frontend calls to check task progress.

**Edge cases:**
- If `actual_duration` is missing from `result_data`: skip reconciliation, keep pre-reserved amount (conservative)
- If actual > reserved: charge difference via `creditService.deductCredits()`
- If actual < reserved: refund difference via `creditService.refundCredits()`

## 8. Security Controls

### 8.1 tRPC SSRF Defense-in-Depth

Add Zod `.refine()` on `extraParams` in the tRPC media generation input schema. For every string value in `extraParams` that looks like a URL (`^https?://`), validate that its hostname is not in the blocklist: `localhost`, `127.0.0.1`, `host.docker.internal`, `0.0.0.0`, `10.*`, `172.16-31.*`, `192.168.*`.

This check applies to ALL media providers (not just fal.ai), providing defense-in-depth.

### 8.2 Redis-based TTS Rate Limiting

Create a Redis-based rate limiter for Lux TTS in `apps/web/server/services/rateLimiter.ts`:
- 5 requests per 10 minutes per user
- Block duration: 60 seconds if exceeded

Implementation: Check if `apps/web/server/services/distributedRateLimit.ts` provides a Redis-based sliding window counter. If so, use that. Otherwise, create a new function using IORedis with a ZSET-based sliding window (key: `ratelimit:lux-tts:{userId}`, score: timestamp, member: request ID).

The rate limit check should be applied in the tRPC media router (`apps/web/server/routers/media.ts`) when the selected model is `fal-ai/lux-tts`.

### 8.3 Video Input File Size Limit

In `FalAIProvider._validate_urls()`, for `video_url` fields (used by extend-video and retake-video), send a HEAD request to check `Content-Length` before submission. Reject files > 500MB.

### 8.4 Prompt Sanitization

Strip HTML/XML-like tags from prompts before sending to fal.ai:
```python
def _sanitize_prompt(self, prompt: str) -> str:
    """Strip HTML/XML tags from prompt."""
```

### 8.5 Audit Logging

For Lux TTS requests, log reference audio URL masked (domain + path prefix only, strip query params/signed tokens). Never log rejected prompt content for 422 content policy errors.

### 8.6 Environment Variable Safety

If both `FAL_AI_API_KEY` env var AND DB-stored encrypted key exist, log a startup warning. In production, always prefer the DB-stored key. The env var is for dev/testing fallback only.

### 8.7 Queue Timeout Handling

If a fal.ai task stays in IN_QUEUE/IN_PROGRESS for more than 30 minutes (configurable), mark it as FAILED with a timeout error. This prevents stuck tasks from accumulating. Check task age against `task.created_at` in `recover_stuck_tasks`.

## 9. Testing Strategy

### 9.1 Python Unit Tests

**`test_fal_ai_provider.py`:**
- Test all three generation methods (video, audio, image)
- Test queue submission returns request_id
- Test queue status polling returns correct states
- Test queue result normalization (extracts video URL, actual_duration)
- Test auth header format (`Key {api_key}`)
- Test error handling: 401, 422, 429 → user-friendly messages
- Test `aclose()` is called
- Mock httpx responses using `httpx.MockTransport` or `respx`

**`test_fal_ai_ssrf.py`:**
- Test internal IPs rejected (169.254.x.x, 10.x.x.x, 192.168.x.x, 127.0.0.1)
- Test `host.docker.internal` explicitly rejected
- Test public HTTPS URLs allowed
- Test validation applies to all URL fields (image_url, end_image_url, audio_url, video_url)
- Test prompt sanitization strips HTML tags

### 9.2 TypeScript Tests

**Pricing tests:**
- Matrix formula with composite keys: verify all resolution × duration combinations
- Per-unit formula for TTS: verify character counting and rounding
- Default fallback when tier key not found

**Seed script verification:**
- Run seed and verify 12 rows created with correct creditCost, priority, sortOrder

### 9.3 Integration Verification

After deployment:
- Verify admin UI shows all 12 fal.ai models
- Verify `testFalAI()` correctly validates/rejects API keys
- Test each model type end-to-end (requires FAL_KEY)
- Verify credit deduction matches pricing tiers

## 10. Implementation Phases

### Phase 1: TypeScript Layer (Provider Template + Seed + Pricing)
1. Update `mediaProviders.ts` PROVIDER_TEMPLATES
2. Update `seed-media-providers.ts` DEFAULT_PROVIDERS (must match)
3. Create `seed-media-models-fal-ai.ts` with 12 model definitions
4. Fix `testFalAI()` authentication probe
5. Run seed script, verify DB entries

### Phase 2: Python Provider + Gateway
1. Create `fal_ai_provider.py` with SSRF validation
2. Export in `providers/__init__.py`
3. Add `_normalize_provider_id()` alias
4. Add routing blocks in `generate_video()`, `generate_audio()`, `generate_image()`
5. Add concurrent task limit check
6. Write Python unit tests

### Phase 3: Celery Polling + Credit Reconciliation
1. Add fal.ai branch in `_recover_stuck_tasks_async()`
2. Store actual_duration/actual_resolution in result_data
3. Implement credit reconciliation in Node.js media status handler

### Phase 4: Security & Rate Limiting
1. Add tRPC SSRF defense-in-depth (Zod refine on extraParams)
2. Implement Redis-based luxTtsLimiter
3. Add video file size limit (HEAD check)
4. Verify all security controls with tests

## 11. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| SSRF via user URLs | CRITICAL | Two-layer validation (Python + tRPC) |
| Credit undercharge | HIGH | Composite tier keys + post-reconciliation from actual output |
| Voice cloning abuse | HIGH | Redis rate limit + audit logging |
| pricingCalculator regression | MEDIUM | Using composite keys avoids changing shared code |
| fal.ai API changes | MEDIUM | Pin to LTX-2.3 endpoints, model IDs in frozenset |
| Long video generation timeout | MEDIUM | Always queue-based (never sync for video) |
| Concurrent task exhaustion | LOW | Max 3 per-user limit |

## 12. Files Summary

### New Files (4)
- `apps/web/scripts/seed-media-models-fal-ai.ts`
- `python-backend/app/llm_proxy/providers/fal_ai_provider.py`
- `python-backend/tests/unit/services/test_fal_ai_provider.py`
- `python-backend/tests/unit/services/test_fal_ai_ssrf.py`

### Modified Files (7)
- `apps/web/server/routers/mediaProviders.ts` — template + testFalAI
- `apps/web/scripts/seed-media-providers.ts` — DEFAULT_PROVIDERS
- `python-backend/app/llm_proxy/providers/__init__.py` — export
- `python-backend/app/llm_proxy/gateway_unified.py` — routing + normalize
- `python-backend/app/tasks/media_tasks.py` — polling branch
- `apps/web/server/services/rateLimiter.ts` — Redis TTS limiter
- `apps/web/server/routers/media.ts` — tRPC SSRF + credit reconciliation
