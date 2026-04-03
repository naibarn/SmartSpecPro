# Usage Guide

## Quick Start

1. Seed the launch model metadata:

```bash
npm --workspace apps/web run seed:media:wavespeed
```

2. In Admin > Media Providers, create or edit a provider using the WaveSpeedAI template:

- provider name: `wavespeed_ai`
- base URL: `https://api.wavespeed.ai/api/v3`
- API key: WaveSpeed bearer token

3. Run the built-in provider connection test. The implementation calls `GET /balance` and only accepts success when `data.balance` is numeric.

## Runtime Entry Points

- Web model metadata and validation:
  - `apps/web/server/services/mediaProviderUtils.ts`
  - `apps/web/server/routers/media.ts`
  - `apps/web/client/src/pages/MediaStudio.tsx`
- Seed script:
  - `apps/web/scripts/seed-media-models-wavespeed.ts`
- Python submit/poll runtime:
  - `python-backend/app/llm_proxy/providers/wavespeed_media_provider.py`
  - `python-backend/app/llm_proxy/gateway_unified.py`
  - `python-backend/app/tasks/media_tasks.py`

## Behavior Notes

- Model id: `wavespeed-ai/cinematic-video-generator`
- Provider key: `wavespeed_ai`
- Supported durations: `5`, `10`, `15`
- Supported aspect ratios: `16:9`, `9:16`, `4:3`, `3:4`
- Optional reference images: up to `4`
- Pricing tiers: `5s=800`, `10s=1600`, `15s=2400`
- Async polling starts at roughly `3s`, backs off up to `15s`, and times out after `30m`

## Verification Commands

```bash
PATH=/home/dev/.nvm/versions/node/v24.13.0/bin:$PATH apps/web/node_modules/.bin/vitest run \
  apps/web/server/routers/mediaProviders.test.ts \
  apps/web/server/services/mediaProviderUtils.test.ts \
  apps/web/server/routers/__tests__/mediaModels.persistence.test.ts \
  apps/web/client/src/lib/mediaModelInputs.test.ts \
  apps/web/server/routers/__tests__/media.db-first.contract.test.ts \
  apps/web/server/services/pricingCalculator.test.ts
```

```bash
DEBUG=false python-backend/.venv/bin/pytest --no-cov \
  python-backend/tests/unit/test_media_provider_service_wavespeed.py \
  python-backend/tests/unit/llm_proxy/test_wavespeed_media_provider.py \
  python-backend/tests/unit/llm_proxy/test_gateway_unified_wavespeed.py \
  python-backend/tests/tasks/test_media_tasks_wavespeed.py
```

## Manual Smoke Checks

- Seed the model and confirm it appears in Admin > Media Models with provider `wavespeed_ai`.
- Test the provider with a valid key and with an intentionally invalid key.
- In Media Studio, verify prompt-only generation works and the fifth reference image is blocked or trimmed.
- Submit an async request and confirm the final task result stores a true output URL, not just a polling link.
