# Feature 054: fal.ai LTX/Lux Models — Usage Guide

## What Was Built

Integration of fal.ai media models into SmartSpecPro:

- **7 LTX-2.3 video models** (text-to-video, image-to-video, audio-to-video, extend, retake + fast variants)
- **1 Lux TTS audio model** (fal-ai/lux-tts)
- **4 Flux image models** (schnell, dev, pro, stable-diffusion-v3-medium)

## Implementation Summary

| Section | Commit | Description |
|---------|--------|-------------|
| 01 | 18d5fd14 | Provider templates + seed script |
| 02 | 5cf59718 | Seed script for 12 model definitions |
| 03 | 7fb436e0 | Python FalAIProvider class |
| 04 | c54fbe0b | Gateway routing for video/audio/image |
| 05 | 7ef79b0d | Celery polling for stuck task recovery |
| 06 | c0ce630e | tRPC SSRF defense-in-depth |
| 07 | 8310ed30 | Redis rate limiting for Lux TTS |
| 08 | 99042236 | Post-completion credit reconciliation |
| 09 | 3ad5d18d | Comprehensive Python tests |

## Key Files

### Python Backend
- `python-backend/app/llm_proxy/providers/fal_ai_provider.py` — FalAIProvider class
- `python-backend/app/llm_proxy/gateway_unified.py` — fal.ai routing in gateway
- `python-backend/app/tasks/media_tasks.py` — Celery polling branch + helper functions

### Node.js Backend
- `apps/web/server/routers/media.ts` — SSRF validation, rate limiting, credit reconciliation
- `apps/web/server/services/ssrfValidation.ts` — validateExtraParamsNoSsrf()
- `apps/web/server/services/rateLimiter.ts` — checkLuxTtsRateLimit()
- `apps/web/scripts/seed-media-providers.ts` — Provider template
- `apps/web/scripts/seed-media-models-fal-ai.ts` — Model seed data

### Tests
- `python-backend/tests/unit/services/test_fal_ai_provider.py` — Provider tests
- `python-backend/tests/unit/services/test_fal_ai_ssrf.py` — SSRF validation tests
- `python-backend/tests/unit/services/test_fal_ai_celery_polling.py` — Celery polling tests
- `apps/web/server/__tests__/media-ssrf-validation.test.ts` — TS SSRF tests
- `apps/web/server/__tests__/creditReconciliation.test.ts` — Credit reconciliation tests
- `apps/web/server/services/__tests__/luxTtsRateLimit.test.ts` — Rate limit tests

## Security Features

1. **SSRF Defense-in-Depth**: Both tRPC (Node.js) and FalAIProvider (Python) validate URLs
2. **host.docker.internal blocked**: Explicitly rejected in fal.ai provider
3. **Rate limiting**: Lux TTS limited to 5 requests/10 min/user via Redis
4. **Error sanitization**: HTTP error messages never leak response bodies or API keys
5. **Video file size limit**: HEAD check rejects video_url > 500MB

## Post-Deployment Steps

1. Run seed script: `cd apps/web && npx tsx scripts/seed-media-models-fal-ai.ts`
2. Set `FAL_AI_API_KEY` in admin panel (Media Providers section)
3. Verify via admin: check fal.ai provider health shows "connected"
4. Test: submit a video generation with `fal-ai/ltx-2.3/text-to-video` model
