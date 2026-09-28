# Section 01 — Provider-aware model registry

## Ownership

Own `apps/web/server/services/modelRegistry.ts` and its focused tests only.

## Work

- Load provider enabled state together with the model catalog.
- Compare provider names with `normalizeMediaProviderName`.
- Exclude model rows whose matching provider is explicitly disabled.
- Preserve the existing compatibility fallback when the database/provider
  catalog cannot be loaded or provider rows do not exist.
- Ensure a successful provider-aware load with zero eligible models caches an
  empty catalog instead of restoring static models.

## TDD expectations

- Add a fixture containing image, video, and audio models across enabled and
  disabled providers.
- Assert disabled-provider rows are absent from `getModelsByTypeAsync`.
- Assert all configured providers disabled returns an empty registry.
- Assert genuine DB failure does not throw unexpectedly and retains the
  documented fallback behavior.

## Acceptance checks

- Registry output contains only enabled models from non-disabled providers.
- No API/provider secret is returned or cached.
- Existing model capability enrichment remains unchanged.

## Risks

- Avoid changing the public `ModelDefinition` shape.
- Do not accidentally treat a successful empty DB catalog as a DB outage.
- Keep query/mocking compatibility with the existing Drizzle adapter.

## Implemented

- Added normalized disabled-provider filtering and authoritative empty-cache
  semantics in `modelRegistry.ts`.
- Added image/video/audio and all-disabled regression coverage.
