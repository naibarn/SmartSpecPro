# Section 02 Acceptance Interview

Date: 2026-05-06

## Questions

### Does the seed builder produce the exact phase-one inventory?

Yes. `buildMagnificModelSeeds()` returns 34 concrete selectable Magnific model ids in deterministic order. The dry-run and unit tests compare against the fixed inventory.

### Does each model carry enough runtime metadata for DB and fallback paths?

Yes. Each seed has `configJson` with `providerModelId`, `modelFamily`, endpoint metadata, dispatch mode, result type, output extractors, input fields, validation, provisional pricing, pricing provenance, and readiness fields.

### Are expensive or unverified models protected by defaults?

Yes. Image and sync models are enabled by model default while the provider remains disabled from Section 01. Video rows and the video upscaler row are admin-visible but disabled by model default with staging smoke-test readiness reasons.

### Are admin overrides preserved?

Yes. The Magnific seed script uses `ON CONFLICT` updates that keep existing `creditCost` and `isEnabled` values while refreshing deterministic metadata such as names, endpoints, aliases, config, ratios, durations, and sizes.

### Does static fallback know Magnific?

Yes. `modelRegistry.ts` and `mediaGenerationService.ts` now include Magnific seed metadata. Regression tests cover Magnific model-id lookup, alias lookup, provider propagation, and unknown-id behavior.

## Residual Risks

- Provider pricing is explicitly provisional until staging/admin review updates production values.
- Video and upscaler rows remain disabled by default until later smoke-test gates are implemented and passed.

