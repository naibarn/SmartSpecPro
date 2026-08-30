# Enabled Media Model Provider Filter Design

## Problem

Media model selectors can expose an enabled `media_models` row even when its
backing `media_providers` row has `isEnabled = false`. The public
`mediaModels.list` procedure filters only the model row, while the model
registry used by recommended image/video/audio selectors also filters only
model state. Provider changes do not consistently invalidate the model registry
cache. As a result, users can select a model that cannot be dispatched.

## Goal

Make the user-facing image, video, and audio model catalog provider-aware
across all existing selection paths:

- A model is user-selectable when its model row is enabled and, when a matching
  provider row exists, that provider is enabled.
- A disabled provider's models are removed from public and recommended image,
  video, and audio catalogs.
- Server-side selection paths use the same effective catalog and reject stale
  selections rather than silently dispatching through a disabled provider.
- Admin provider/model pages continue to show disabled rows for management and
  diagnosis.

## Non-goals

- Do not delete or mutate `media_models` rows when a provider is disabled.
- Do not change Admin catalog visibility.
- Do not broaden this change to provider API-key or health-test policy where the
  existing endpoint does not already enforce it.
- Do not change provider routing, credit pricing, or fallback ordering beyond
  excluding disabled providers.

## Contract and data flow

The effective user catalog is derived from the database-backed model catalog
and provider state:

```text
media_models.isEnabled = true
        +
matching media_providers row is absent or isEnabled = true
        -> user catalog

matching media_providers row isEnabled = false
        -> excluded from user catalog
        -> existing persisted selection fails closed at generation time
```

Provider names must be compared through the existing
`normalizeMediaProviderName` helper so legacy aliases and canonical provider
names resolve consistently.

The model registry must distinguish these states:

1. Database load failed: retain the existing static fallback behavior.
2. Database loaded with provider rows but no eligible models: cache an empty
   catalog; never revive static models belonging to disabled providers.
3. Database loaded without provider rows: retain the existing compatibility
   fallback behavior for installations that have not created provider rows.

## Implementation approach

1. Add provider-aware filtering to the database-backed model registry. Load the
   provider enabled state alongside model rows, normalize provider names, and
   remove models backed by disabled providers before caching.
2. Update the public `mediaModels.list` procedure to apply the same provider
   filter after loading model/provider rows. Keep its provider list derived from
   the filtered result for every media type.
3. Keep recommended image/video/audio endpoints on the registry path so they
   inherit the same filter. Add explicit regression coverage for disabled
   providers across all three media types.
4. Update the existing `media.getModels` provider-configuration lookup so
   present-but-disabled provider rows remain authoritative. This prevents its
   compatibility fallback from leaking models when all providers are disabled.
5. Invalidate the model registry cache whenever an admin creates, updates, or
   deletes a media provider, especially when `isEnabled` changes.
6. Preserve the existing Admin readiness annotations and Admin list behavior.

## Acceptance criteria

- A model with `media_models.isEnabled = true` and a matching provider with
  `isEnabled = false` is absent from `mediaModels.list` for image, video, and
  audio types.
- The same model is absent from `media.getModels` even when every provider row
  is disabled.
- The same model is absent from `listRecommendedImageModels`,
  `listRecommendedVideoModels`, and `listRecommendedAudioModels` when
  applicable.
- If all configured providers are disabled, no static fallback model is exposed
  by the DB-backed registry.
- Re-enabling a provider makes its enabled models available after cache
  invalidation without modifying model rows.
- Admin list still returns disabled provider/model rows and readiness metadata.
- Existing generation validation continues to reject stale selections and does
  not silently substitute a disabled provider.
- Focused tests cover public catalog, registry/recommended catalog, cache
  invalidation, and existing Admin behavior.

## Verification boundary

Run focused Vitest suites for the touched router/service contracts and
`git diff --check`. A live authenticated browser check, production database
state check, deployment, and provider generation are separate verification
boundaries and are not implied by local tests.
