# Implementation plan

## Objective

Make the effective user-selectable media catalog exclude enabled model rows
whose matching media provider is disabled, across image, video, and audio,
while preserving Admin visibility and fail-closed generation behavior.

## Current-codebase fit

The existing registry already centralizes enabled model filtering and the
provider-name normalization helper already exists. The smallest safe repair is
to enrich registry loading with provider state, reuse the same predicate in
`mediaModels.list`, and invalidate the registry when provider state changes.
The separate `media.getModels` contract remains intact unless a focused test
shows it leaks the same disabled-provider case.

## Affected files

- `apps/web/server/services/modelRegistry.ts`
  - load provider enabled state with the model catalog
  - filter disabled-provider models
  - represent successful empty catalogs without static fallback leakage
- `apps/web/server/routers/mediaModels.ts`
  - filter public list results using provider state
  - preserve Admin list/readiness behavior
- `apps/web/server/routers/media.ts`
  - keep provider rows authoritative even when every provider is disabled in
    the existing `media.getModels` compatibility path
- `apps/web/server/routers/mediaProviders.ts`
  - clear model registry cache after provider create/update/delete
- Focused tests adjacent to the above modules
  - disabled provider for image/video/audio
  - recommended endpoint inheritance
  - all providers disabled does not revive static models
  - cache invalidation and Admin visibility

## Implementation sequence

1. Add small internal provider-state loading/filter helpers in the model
   registry, using normalized names and a typed load result.
2. Change registry refresh semantics so DB failure and successful empty result
   are distinguishable, while preserving the no-provider-row compatibility
   fallback.
3. Add provider-state filtering to `mediaModels.list` and derive providers
   after filtering.
4. Invalidate registry cache on provider mutations.
5. Add tests first for each regression, then implement until green.
6. Run focused Vitest suites, `git diff --check`, and inspect the owned diff.

## Security and boundary concerns

- User catalog filtering is not authorization by itself; generation-time
  `resolveEnabledMediaModelSelection` remains authoritative for stale or
  forged model IDs.
- Do not expose API keys or provider secrets in catalog responses.
- Do not use static fallback after a successful DB/provider load that proves no
  eligible model exists.
- Preserve Admin-only access on provider/model management procedures.

## Acceptance criteria

- Public image/video/audio lists omit models of disabled providers.
- Recommended image/video/audio lists omit the same models.
- All-disabled provider state yields no leaked static model from the DB-backed
  registry.
- Re-enabling a provider becomes visible after cache invalidation.
- Admin still sees disabled models and readiness metadata.
- Existing direct generation rejection tests remain green.

## Verification notes

Local focused tests prove contract behavior only. Browser, production DB,
deployment, and paid provider generation remain unverified unless explicitly
run later.
