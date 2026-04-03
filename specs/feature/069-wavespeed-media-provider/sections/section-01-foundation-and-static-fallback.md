# Section 01: Foundation and Static Fallback

## Goal

Lay the foundation that every later section depends on:

- canonical provider naming for WaveSpeed
- static model-registry coverage for the launch model
- pricing fallback that preserves duration tiers on DB miss
- a single base-URL normalization rule that later health-check and runtime code can share

This section should leave the codebase able to recognize WaveSpeed consistently even before the admin UI and Python runtime are wired up.

## Files in scope

- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/mediaModels.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/services/pricingCalculator.ts`
- any shared helper file introduced to centralize provider-name or base-URL normalization
- any shared helper introduced to validate relative-only endpoint metadata for media models

## Why this section comes first

The existing system resolves providers, pricing, and fallback metadata in multiple places. If WaveSpeed is added only at the UI or runtime layer first, the implementation will drift:

- provider readiness may fail because the provider key is not normalized everywhere
- pricing may regress on DB miss because fallback metadata is incomplete
- runtime may receive a provider or model id that the web side cannot resolve consistently

This section removes those hazards before feature-specific behavior is layered on top.

## Implementation requirements

### 1. Canonical provider key

Normalize WaveSpeed to `wavespeed_ai` anywhere provider names are resolved or compared. The normalization logic should treat at least these forms as equivalent:

- `wavespeed_ai`
- `wavespeed-ai`
- `wavespeed ai`
- `wavespeedai`

Apply the same normalization rule in both:

- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/mediaModels.ts`

If a shared helper is introduced, later sections must reuse it instead of duplicating another mapping table.

### 2. Static model registry coverage

Add the launch model to the static registries that back:

- metadata fallback
- provider resolution
- default model lookups where applicable

The static launch model should include:

- id: `wavespeed-ai/cinematic-video-generator`
- type: `video`
- provider: `wavespeed_ai`
- name: `Seedance 2.0 Grade Cinematic Video Generator`
- durations: `5`, `10`, `15`
- aspect ratios: `16:9`, `9:16`, `4:3`, `3:4`
- fallback `configJson` with the same contract later expected from the seeded DB row

The fallback `configJson` must include:

- `apiPayloadFormat: "wavespeed"`
- `generateType: "text-to-video"`
- `providerModelId: "wavespeed-ai/cinematic-video-generator"`
- `apiEndpoint: "/wavespeed-ai/cinematic-video-generator"`
- `apiQueryEndpoint: "/predictions/{requestId}/result"`
- `apiConfig.provider: "wavespeed_ai"`
- `pricingFormula: "per_duration"`
- `pricingTiers`
- launch-model `inputFields`, including optional image input capped at four items

### 3. DB-miss pricing preservation

Update the fallback path used by media credit estimation so a DB miss still returns effective pricing metadata instead of only a flat credit cost. The intended behavior is:

- DB hit: use the DB row normally
- DB miss: use the static model entry as a degraded but still fully-priced substitute

Do not leave the WaveSpeed fallback at `configJson: null`, because that would collapse `10s` and `15s` into the flat default cost.

### 4. Shared base-URL normalization rule

Define a single normalization rule for WaveSpeed base URLs:

- if configured value already ends with `/api/v3`, keep it
- if configured value ends at the service root, append `/api/v3`
- never produce `/api/v3/api/v3`
- never silently strip a non-empty path segment other than the optional `/api/v3`

This rule should be easy for later sections to reuse in both the admin connection test and the Python runtime.

### 5. Shared endpoint-metadata safety rule

Define a reusable validation rule for media-model endpoint metadata so later sections do not invent their own parsing rules. For this feature:

- `apiEndpoint` and `apiQueryEndpoint` must be relative paths only
- reject values beginning with `http://`, `https://`, or `//`
- reject any path containing `..`
- reject arbitrary template placeholders
- allow only the task-id placeholder family already needed for polling, with `{requestId}` as the canonical WaveSpeed form

This is groundwork because the admin/UI section and the runtime section should both consume the same safe endpoint contract.

## Tests to write first

- Vitest: provider normalization returns `wavespeed_ai` for supported WaveSpeed name variants.
- Vitest: adding WaveSpeed does not change normalization of existing providers.
- Vitest: static model lookup resolves `wavespeed-ai/cinematic-video-generator`.
- Vitest: fallback pricing for the launch model still exposes `pricingFormula` and `pricingTiers`.
- Vitest: credit calculation returns the correct `per_duration` values for `5`, `10`, and `15`.
- Vitest: service-root and API-root base URLs normalize to the same effective API root.
- Vitest: unsafe endpoint metadata is rejected by the shared validation rule.

## Acceptance criteria

- Web-side provider normalization consistently resolves WaveSpeed to `wavespeed_ai`.
- Static registries know the launch model and its provider.
- DB-miss pricing retains duration-tier behavior for the launch model.
- A single normalization rule exists for WaveSpeed base URLs and can be reused by later sections.
- A single endpoint-safety rule exists for WaveSpeed model metadata and can be reused by later sections.

## Implementation Notes

Implemented in:

- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/mediaModels.ts`

Deviation from plan: the shared fallback model contract was centralized in `buildWaveSpeedLaunchModelConfigJson()` and `buildWaveSpeedLaunchModelSeed()` so the static registry, admin persistence path, and seed script all reuse the same metadata instead of carrying separate literals.

## Tests

- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/services/pricingCalculator.test.ts`
