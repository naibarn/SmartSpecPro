# Research Notes

## Repository scan

- `apps/web/server/routers/mediaProviders.ts` already drives provider templates for the Admin > Media Providers page. Adding a new provider template is enough to surface it in the UI.
- `apps/web/server/routers/mediaModels.ts` and `apps/web/server/routers/media.ts` both normalize provider names. They currently understand `kie_ai`, `uvoice`, `byteplus_modelark`, and `knplabai`, but not WaveSpeed.
- `apps/web/server/services/modelRegistry.ts` and `apps/web/server/services/mediaGenerationService.ts` both hold static fallback metadata for media models. Any new model should be added to both places so the UI still works when DB reads are unavailable.
- `apps/web/scripts/seed-media-providers.ts` seeds provider rows, while the provider-specific model seed scripts seed catalog rows. A new WaveSpeed model seed script should follow the same pattern.
- `apps/web/client/src/lib/mediaModelInputs.ts` already supports `image_urls`, `video_urls`, `audio_urls`, `per_duration` pricing, and reference-image/video detection. The Seedance model can use the existing generic form system.
- `python-backend/app/llm_proxy/gateway_unified.py` already routes media requests by provider and model id, and `python-backend/app/tasks/media_tasks.py` already handles recovery for long-running media jobs. WaveSpeed should fit that pattern rather than introducing a new execution path.

## WaveSpeed docs

- Official API intro and workflow: [How WaveSpeedAI Works](https://wavespeed.ai/docs/how-wavespeedai-works)
- Official API model listing: [List Models API](https://wavespeed.ai/docs/docs-common-api/models)
- Official getting-started page: [WaveSpeedAI docs](https://wavespeed.ai/docs/get-started-api)
- Official Seedance 2.0 model page: [Seedance 2.0 Grade Cinematic Video Generator](https://wavespeed.ai/models/wavespeed-ai/cinematic-video-generator)
- Official Seedance 2.0 guide: [Seedance 2.0 complete guide](https://wavespeed.ai/blog/posts/seedance-2-0-complete-guide-multimodal-video-creation)

Key details from the docs:

- WaveSpeedAI uses a REST-style API with bearer-token auth.
- The docs expose a read-only `GET https://api.wavespeed.ai/api/v3/models` endpoint for listing models and parameters.
- The docs expose a balance-check endpoint at `GET https://api.wavespeed.ai/api/v3/balance`, returning `data.balance` in USD, which is suitable for provider connection testing.
- API auth is always `Authorization: Bearer <api_key>`, and invalid or inactive keys return `401 Unauthorized`.
- The Cinematic Video Generator page uses `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/cinematic-video-generator` for submission and `GET https://api.wavespeed.ai/api/v3/predictions/{requestId}/result` for polling.
- The Seedance 2.0 cinematic model page documents prompt, up to 4 reference images, aspect ratio, and duration inputs.
- The public model page shows duration pricing at 5s, 10s, and 15s, with the 5s price at $0.80.
- The model API response exposes `data.id`, `data.status`, `data.outputs`, `data.error`, and `data.urls.get`, which is enough to map provider task ids, terminal status, and final output URLs.
- The blog post describes Seedance 2.0 as reference-first and mentions broader multimodal behavior, but the specific model page only guarantees prompt + reference images for this integration target.
- WaveSpeed docs mention sync mode globally, but the current repo architecture for long-running video jobs already relies on async submission plus recovery polling, so sync mode is the wrong default for this integration.

## Scope implication

- The planning should stay focused on one initial WaveSpeed provider template and one Seedance 2.0 model.
- The runtime adapter should use the documented submit/poll path for Seedance 2.0 instead of inventing sync-mode behavior that the model page does not need.
- The model should enforce the documented 4-image ceiling even if the generic form component itself does not have a built-in max-count control.
- The provider template should seed the API root as `https://api.wavespeed.ai/api/v3`, but the Python provider should still normalize either `https://api.wavespeed.ai` or `https://api.wavespeed.ai/api/v3` defensively.
- Static fallback metadata must include pricing tiers, not just a flat base cost, otherwise the existing reservation flow can undercharge 10s and 15s runs when DB config is unavailable.
