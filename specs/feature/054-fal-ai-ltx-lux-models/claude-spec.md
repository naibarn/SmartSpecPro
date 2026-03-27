# Specification: fal.ai LTX-2.3 Video Models & Lux TTS Integration

## Overview

Add 12 media models from fal.ai to SmartSpecPro:
- **7 Video models** from the LTX-2.3 family: text-to-video (standard + fast), image-to-video (standard + fast), audio-to-video, extend-video, retake-video
- **1 Audio model**: Lux TTS for text-to-speech with voice cloning
- **4 Image models**: Flux Schnell, Flux Dev, Flux Pro, SD3 Medium (existing in provider template, now getting Python backend routing)

## Current State

### What exists (TypeScript layer)
- fal.ai provider template in `mediaProviders.ts` (`providerName: "fal_ai"`) — UI template only with image + some video models
- `mediaModels` table, `mediaProviders` table, seed scripts infrastructure
- Celery task pipeline for media generation (image/video/audio)
- Provider connection test (`testFalAI()`) — uses OPTIONS request, **does not validate API key**
- Frontend dynamic form renderer (`ModelInputFieldsPanel.tsx`) supports all needed field types

### What does NOT exist (Python backend)
- No fal.ai provider handler — unknown providers fallback to KieAIProvider
- No routing branch for `fal_ai` in `gateway_unified.py`
- No fal.ai polling branch in `recover_stuck_tasks` Celery task
- No Redis-based rate limiting for TTS

## Model Catalog

### Video Models (7)

| Model ID | Display Name | Category | creditCost | Pricing |
|----------|-------------|----------|-----------|---------|
| `fal-ai/ltx-2.3/text-to-video` | LTX-2.3 Text to Video | text-to-video | 360 | resolution × duration matrix |
| `fal-ai/ltx-2.3/text-to-video/fast` | LTX-2.3 Text to Video (Fast) | text-to-video | 240 | resolution × duration matrix |
| `fal-ai/ltx-2.3/image-to-video` | LTX-2.3 Image to Video | image-to-video | 360 | resolution × duration matrix |
| `fal-ai/ltx-2.3/image-to-video/fast` | LTX-2.3 Image to Video (Fast) | image-to-video | 240 | resolution × duration matrix |
| `fal-ai/ltx-2.3/audio-to-video` | LTX-2.3 Audio to Video | audio-to-video | 600 | flat per-second (100/sec) |
| `fal-ai/ltx-2.3/extend-video` | LTX-2.3 Extend Video | extend-video | 500 | flat per-second (100/sec) |
| `fal-ai/ltx-2.3/retake-video` | LTX-2.3 Retake Video | retake-video | 500 | flat per-second (100/sec) |

### Audio Models (1)

| Model ID | Display Name | Category | creditCost | Pricing |
|----------|-------------|----------|-----------|---------|
| `fal-ai/lux-tts` | Lux TTS (Voice Cloning) | text-to-speech | 2 | per 1K chars (1.4 credits/1K) |

### Image Models (4, existing — adding backend routing)

| Model ID | Display Name | Category | creditCost | Pricing |
|----------|-------------|----------|-----------|---------|
| `fal-ai/flux/schnell` | Flux Schnell | text-to-image | TBD | flat |
| `fal-ai/flux/dev` | Flux Dev | text-to-image | TBD | flat |
| `fal-ai/flux-pro` | Flux Pro | text-to-image | TBD | flat |
| `fal-ai/stable-diffusion-v3-medium` | SD3 Medium | text-to-image | TBD | flat |

## Pricing Design

### Approach: Composite Tier Keys (Decision from Interview)

Use pre-computed composite keys matching the BytePlus pattern. **No changes** to `pricingCalculator.ts` needed.

**Resolution-tiered video models** (T2V, I2V standard/fast):
```
pricingFormula: "matrix"
pricingTiers: {
  "1080p-6s": 360,   "1080p-8s": 480,   "1080p-10s": 600,
  "1440p-6s": 720,   "1440p-8s": 960,   "1440p-10s": 1200,
  "2160p-6s": 1440,  "2160p-8s": 1920,  "2160p-10s": 2400,
  "default": 360
}
// Fast variants: multiply all by 2/3 ratio
```

**Flat per-second models** (A2V, extend, retake):
```
pricingFormula: "matrix"
pricingTiers: {
  "5s": 500, "6s": 600, "8s": 800, "10s": 1000,
  "12s": 1200, "14s": 1400, "16s": 1600, "18s": 1800, "20s": 2000,
  "default": 500
}
```

**Lux TTS** (per-unit character pricing):
```
pricingFormula: "per_unit"
pricingUnitMetric: "characters"
pricingUnitField: "prompt"
pricingUnitSize: 1000
pricingUnitRounding: "ceil"
pricingMinUnits: 1
pricingTiers: { "default": 1.4 }
```

## Credit Reconciliation (Decision: Full Reconciliation)

1. **Pre-reserve**: Node.js pre-reserves credits based on user-selected resolution × duration at submit time
2. **Store actual metrics**: Python `recover_stuck_tasks` stores `actual_duration` and `actual_resolution` in `task.result_data` when fal.ai completes
3. **Reconcile**: Node.js media status handler reads `result_data.actual_duration`, computes actual cost, and adjusts credits
4. **Policy**: Always charge based on actual output — if actual > estimated, charge the difference (no cap)

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `apps/web/scripts/seed-media-models-fal-ai.ts` | Seed 12 fal.ai model definitions |
| `python-backend/app/llm_proxy/providers/fal_ai_provider.py` | fal.ai provider handler |
| `python-backend/tests/unit/services/test_fal_ai_provider.py` | Provider unit tests |
| `python-backend/tests/unit/services/test_fal_ai_ssrf.py` | SSRF validation tests |

### Modified Files
| File | Change |
|------|--------|
| `apps/web/server/routers/mediaProviders.ts` | Update `PROVIDER_TEMPLATES` fal_ai entry + fix `testFalAI()` |
| `apps/web/scripts/seed-media-providers.ts` | Update `DEFAULT_PROVIDERS` fal_ai entry (must match template) |
| `python-backend/app/llm_proxy/providers/__init__.py` | Export `FalAIProvider` |
| `python-backend/app/llm_proxy/gateway_unified.py` | Add fal_ai routing in 3 methods + normalize alias |
| `python-backend/app/tasks/media_tasks.py` | Add fal.ai polling branch |
| `apps/web/server/services/rateLimiter.ts` | Add Redis-based `luxTtsLimiter` |
| `apps/web/server/routers/media.ts` (or relevant) | Add tRPC SSRF validation + credit reconciliation |

### Files NOT changing
- `pricingCalculator.ts` — composite keys work with existing code
- `ModelInputFieldsPanel.tsx` — existing renderer handles all field types
- `media_generation.py` — generic, provider-agnostic
- `unified_client.py` — LLM text providers only; media providers instantiate per-request

## fal.ai API Patterns

| Method | URL | Purpose | When |
|--------|-----|---------|------|
| POST | `https://queue.fal.run/{model_id}` | Queue submission | **Always for video** |
| GET | `https://queue.fal.run/{model_id}/requests/{request_id}/status` | Status check | Polling |
| GET | `https://queue.fal.run/{model_id}/requests/{request_id}` | Get result | When COMPLETED |
| POST | `https://fal.run/{model_id}` | Synchronous generation | **TTS + Image** |

**Authentication**: `Authorization: Key {FAL_KEY}`

## Security Requirements

### SSRF Prevention (CRITICAL) — Both Layers
1. **Python**: `FalAIProvider._validate_urls()` calls `validate_uri_no_ssrf()` for all URL fields + explicitly rejects `host.docker.internal`
2. **tRPC**: Zod `.refine()` on `extraParams` validates URLs don't target internal hosts (benefits all providers)

### Voice Cloning Controls (HIGH)
- Redis-based rate limit: 5 req/10min per user
- Reference audio SSRF validation
- Audit logging with masked URLs (domain only)
- Prompt length: max 5000 chars at tRPC level

### Concurrent Task Limit
- Max 3 in-flight fal.ai tasks per user (SQL count in gateway)

### Error Message Sanitization
- Wrap `raise_for_status()` — map 401/422/429 to user-friendly messages
- Never log rejected prompt content for 422 content policy errors

### Prompt Sanitization
- Strip HTML/XML tags from prompts before sending to fal.ai

### API Key Validation
- Fix `testFalAI()` to use authenticated POST instead of OPTIONS

## URL Re-hosting Decision

**Not re-hosting** — store fal.ai CDN URLs directly, matching BytePlus pattern. Can add cross-provider re-hosting later.

## Testing Requirements

### Python Unit Tests
- `test_fal_ai_provider.py`: All provider methods (generate_video, generate_audio, generate_image, queue submission/polling, error handling, aclose)
- `test_fal_ai_ssrf.py`: SSRF validation for all URL fields, host.docker.internal rejection

### TypeScript Tests
- Pricing calculator tests for all composite tier combinations
- Seed script verification (12 rows in DB)

## Implementation Order

1. Provider template + seed script (TypeScript)
2. Python provider handler + SSRF validation
3. Gateway routing (3 methods) + provider export
4. Celery polling branch
5. Rate limiting (Redis-based for TTS)
6. tRPC SSRF defense-in-depth
7. Credit reconciliation in media status handler
8. Fix testFalAI() authentication probe
9. Tests (Python + TypeScript)
