# Section 02: Model Seeding And Static Fallback

## Goal

Seed all phase-one Magnific model records and make their metadata available in DB-backed and DB-unavailable paths.

## Files In Scope

- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/scripts/seed-media-models-magnific.ts`
- `apps/web/scripts/__tests__/seed-media-models-magnific.test.ts` or matching local seed-test pattern
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/services/mediaGenerationService.test.ts`
- `apps/web/server/services/__tests__/modelRegistry.mapToApiModelId.test.ts`

## Implementation Requirements

### 1. Seed builder

Create a Magnific seed builder that returns concrete model definitions for every phase-one model. Each record must include:

- `modelId`
- `name`
- `provider: "magnific"`
- `modelType`
- `modelFamily`
- `aliases`
- `creditCost`
- `aspectRatios`, `durations`, or `sizes` where applicable
- `configJson`
- `isEnabled` / admin-visible readiness fields
- `sortOrder` and `priority`

### 2. Config JSON contract

Every `configJson` must include:

- `providerModelId`
- `modelFamily`
- `endpoint.submit`
- `endpoint.list` when available
- `endpoint.status` for async models
- `dispatchMode`
- `resultType`
- `outputExtractors`
- `inputFields`
- `validation`
- `pricing`
- `pricingStatus: "estimated"`
- `pricingSource: "magnific-docs-or-admin"`
- `pricingLastReviewedAt`
- `readiness`
- `readinessReason` when not fully verified

Pricing must use the provisional conversion rule from the source spec unless an admin override exists:

- `creditCost = ceil(providerPriceUsdOrEur * 1000)`
- minimum cost is 1 credit
- duration, resolution, and frame-sensitive models use a pricing matrix in `configJson.pricing`
- admin-edited pricing, tenant policy, and enablement overrides always win over seeded defaults

### 3. Variant records

Create concrete selectable records for endpoint/pricing variants.

Use `modelFamily: "magnific/veo-3-1"` for all Veo records. Do not create selectable family alias rows unless there is a compatibility need; if alias rows exist, mark them non-selectable.

The implementation must maintain a fixed expected inventory of 34 concrete selectable model ids and compare generated seed output against it in tests and dry-run summary:

| Model ID | Endpoint | Dispatch | Result |
| --- | --- | --- | --- |
| `magnific/mystic` | `/v1/ai/mystic` | async-polling | image |
| `magnific/seedream-v5-lite` | `/v1/ai/text-to-image/seedream-v5-lite` | async-polling | image |
| `magnific/seedream-v5-lite-edit` | `/v1/ai/text-to-image/seedream-v5-lite-edit` | async-polling | image |
| `magnific/nano-banana-pro` | `/v1/ai/text-to-image/nano-banana-pro` | async-polling | image |
| `magnific/nano-banana-pro-flash` | `/v1/ai/text-to-image/nano-banana-pro-flash` | async-polling | image |
| `magnific/z-image-turbo` | `/v1/ai/text-to-image/z-image` | async-polling | image |
| `magnific/upscaler-creative` | `/v1/ai/image-upscaler` | async-polling | image |
| `magnific/relight` | `/v1/ai/image-relight` | async-polling | image |
| `magnific/style-transfer` | `/v1/ai/image-style-transfer` | async-polling | image |
| `magnific/remove-background` | `/v1/ai/beta/remove-background` | sync | image-set |
| `magnific/image-expand` | `/v1/ai/image-expand/seedream-v4-5` | async-polling | image |
| `magnific/skin-enhancer-creative` | `/v1/ai/skin-enhancer/creative` | async-polling | image |
| `magnific/skin-enhancer-faithful` | `/v1/ai/skin-enhancer/faithful` | async-polling | image |
| `magnific/skin-enhancer-flexible` | `/v1/ai/skin-enhancer/flexible` | async-polling | image |
| `magnific/change-camera` | `/v1/ai/image-change-camera` | async-polling | image |
| `magnific/kling-v3-pro` | `/v1/ai/video/kling-v3-pro` | async-polling | video |
| `magnific/kling-v3-standard` | `/v1/ai/video/kling-v3-std` | async-polling | video |
| `magnific/kling-v3-omni-pro` | `/v1/ai/video/kling-v3-omni-pro` | async-polling | video |
| `magnific/kling-v3-omni-standard` | `/v1/ai/video/kling-v3-omni-std` | async-polling | video |
| `magnific/kling-v3-omni-reference-pro` | `/v1/ai/reference-to-video/kling-v3-omni-pro` | async-polling | video |
| `magnific/kling-v3-omni-reference-standard` | `/v1/ai/reference-to-video/kling-v3-omni-std` | async-polling | video |
| `magnific/kling-v3-motion-control-pro` | `/v1/ai/video/kling-v3-motion-control-pro` | async-polling | video |
| `magnific/kling-v3-motion-control-standard` | `/v1/ai/video/kling-v3-motion-control-std` | async-polling | video |
| `magnific/kling-v2-6-motion-control-pro` | `/v1/ai/video/kling-v2-6-motion-control-pro` | async-polling | video |
| `magnific/kling-v2-6-motion-control-standard` | `/v1/ai/video/kling-v2-6-motion-control-std` | async-polling | video |
| `magnific/wan-v2-7-text-to-video` | `/v1/ai/text-to-video/wan-2-7` | async-polling | video |
| `magnific/wan-v2-7-image-to-video` | `/v1/ai/image-to-video/wan-2-7` | async-polling | video |
| `magnific/wan-v2-7-reference-to-video` | `/v1/ai/reference-to-video/wan-2-7` | async-polling | video |
| `magnific/veo-3-1-text-to-video` | `/v1/ai/text-to-video/veo-3-1` | async-polling | video |
| `magnific/veo-3-1-text-to-video-fast` | `/v1/ai/text-to-video/veo-3-1-fast` | async-polling | video |
| `magnific/veo-3-1-image-to-video` | `/v1/ai/image-to-video/veo-3-1` | async-polling | video |
| `magnific/veo-3-1-image-to-video-fast` | `/v1/ai/image-to-video/veo-3-1-fast` | async-polling | video |
| `magnific/veo-3-1-reference-to-video` | `/v1/ai/reference-to-video/veo-3-1` | async-polling | video |
| `magnific/video-upscaler-precision` | `/v1/ai/video-upscaler-precision` | async-polling | video |

Enablement and readiness defaults for this inventory:

- Image, edit, enhancement, and sync rows are admin-visible and may seed as model-enabled only behind the disabled provider row. Readiness reason: `estimated-pricing`.
- Video generation rows are admin-visible but disabled for regular users until staging smoke tests pass. Readiness reason: `estimated-pricing; staging-smoke-required`.
- `magnific/video-upscaler-precision` is admin-visible but disabled for regular users until dedicated upscaler staging smoke tests pass. Readiness reason: `estimated-pricing; staging-smoke-required; high-cost`.
- If the implementation represents these defaults as fields, use `enabledDefault`, `adminVisible`, and `readinessReason` consistently in both DB seeds and static fallback metadata.

### 4. Readiness defaults

Seed provider disabled by default. Keep expensive video and video-upscaler models disabled/admin-only until rollout gates pass. Preserve admin-edited enablement and pricing on rerun.

### 5. Static fallback

Add Magnific metadata to:

- `modelRegistry.ts`
- `mediaGenerationService.ts`

DB-unavailable fallback must preserve provider routing and pricing. Unknown Magnific model ids must not silently fall back to Kie.

## TDD First

Write tests:

- dry-run prints all expected model ids
- dry-run compares generated ids to the fixed 34-record inventory and reports missing/extra ids
- required fields exist on every seed
- `pricingStatus`, `pricingSource`, `pricingLastReviewedAt`, and provisional conversion metadata exist on every seed
- all Veo records share the normalized family id
- rerun preserves admin overrides, including pricing source and tenant policy fields
- static fallback can resolve Magnific model id, provider, input fields, pricing, endpoint, and readiness
- existing Kie/WaveSpeed/ElevenLabs fallback metadata is unchanged

## Acceptance

This section is complete when an implementer can run the seed dry-run and inspect all concrete Magnific model rows with deterministic ids, explicit endpoint metadata, and fallback metadata for DB-miss behavior.

## Implementation Status

Status: COMPLETE

Implemented files:

- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/scripts/seed-media-models-magnific.ts`
- `apps/web/scripts/__tests__/seed-media-models-magnific.test.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/services/mediaGenerationService.test.ts`
- `apps/web/server/services/__tests__/modelRegistry.mapToApiModelId.test.ts`

Implemented behavior:

- Added a deterministic 34-record Magnific model seed inventory with endpoint, dispatch, result, family, validation, input-field, output-extractor, readiness, and provisional pricing metadata.
- Added `seed-media-models-magnific.ts` with dry-run summary and DB upsert behavior that preserves existing admin-edited `creditCost` and `isEnabled`.
- Added Magnific static fallback metadata to `modelRegistry.ts` and `mediaGenerationService.ts`.
- Added regression coverage for exact inventory, required config fields, Veo family normalization, disabled video/upscaler readiness defaults, dry-run summary, fallback lookup, alias mapping, provider propagation, and unknown-id behavior.

Verification:

- `npm --prefix apps/web test -- scripts/__tests__/seed-media-models-magnific.test.ts` passed.
- `npm --prefix apps/web test -- server/services/mediaProviderUtils.test.ts` passed.
- `npm --prefix apps/web test -- server/services/__tests__/modelRegistry.mapToApiModelId.test.ts` passed.
- `npm --prefix apps/web test -- server/services/mediaGenerationService.test.ts` passed.
- `npm exec tsx -- scripts/seed-media-models-magnific.ts --dry-run` from `apps/web` passed.
- `npm --prefix apps/web run check` passed.
- Targeted `git diff --check` passed.

Deviations:

- No commit was created because the repository is on protected branch `main` and already had substantial unrelated dirty work.
