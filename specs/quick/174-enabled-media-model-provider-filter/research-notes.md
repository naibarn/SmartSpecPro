# Research notes

## Discovery method

SocratiCode MCP was not exposed in this session, so targeted `rg` and narrow
file reads were used as the documented fallback.

## Confirmed current behavior

1. `mediaModels.list` in `apps/web/server/routers/mediaModels.ts` queries
   enabled model rows but does not read/filter `mediaProviders.isEnabled`.
2. `listRecommendedImageModels`, `listRecommendedVideoModels`, and
   `listRecommendedAudioModels` call `getModelsByTypeAsync`, so they inherit
   the registry's provider-blind catalog.
3. `loadModelsFromDatabase` in `modelRegistry.ts` filters only
   `mediaModels.isEnabled`. It does not join or otherwise consult
   `mediaProviders`.
4. `refreshModelCache` treats an empty database result as a reason to set the
   registry cache to `null`, which reactivates static fallback models. If all
   providers are disabled, this could re-expose static models.
5. `media.getModels` already has a separate provider configuration filter, but
   its fallback behavior and contract are not shared by the registry and
   `mediaModels.list`; before this repair, filtering all enabled providers out
   made an all-disabled provider state look like no provider rows.
6. `enabledMediaModelSelection.ts` already rejects disabled providers for
   direct DB-backed selection. This should remain the generation safety net;
   catalog repair must not weaken it.
7. `mediaProviders.update/create/delete` do not clear the model registry cache,
   so recommended catalogs can remain stale after provider changes.
8. Admin `mediaModels.adminList` intentionally returns disabled models and
   annotates provider readiness; it must remain unchanged in visibility.

## Relevant existing tests

- `apps/web/server/routers/__tests__/mediaModels.readiness.test.ts`
- `apps/web/server/routers/__tests__/mediaModels.persistence.test.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`
- `apps/web/server/services/__tests__/enabledMediaModelSelection.test.ts`

## Key risks

- Test mocks for database query builders may assume one select chain; tests
  need explicit provider-row fixtures.
- Provider aliases require normalized comparison rather than raw equality.
- Empty-but-successful catalogs must be distinguished from DB failures to avoid
  static fallback leakage.
- Public list and registry can drift if they implement different filters; keep
  the predicate equivalent and test both surfaces.
