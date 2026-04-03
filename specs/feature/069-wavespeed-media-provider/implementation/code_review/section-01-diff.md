# Section 01 Diff Summary

Files touched:

- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/mediaModels.ts`

Summary:

- Added canonical WaveSpeed provider normalization and shared URL/endpoint safety helpers.
- Added static launch-model fallback metadata with tiered pricing and reusable config JSON.
- Updated DB-first router and persistence paths to reuse canonical provider and endpoint sanitization rules.
