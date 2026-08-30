# TDD guidance

## Tests first

1. Add a public `mediaModels.list` regression with enabled image, video, and
   audio models backed by one enabled and one disabled provider; assert only
   enabled-provider models and providers are returned.
2. Add recommended image/video/audio regressions with registry fixtures that
   include a disabled provider model; assert it is absent from each response.
3. Add a model-registry regression for a successful DB load with provider rows
   but zero eligible models; assert the result is empty rather than static.
4. Add provider-router cache invalidation assertions for create/update/delete.
5. Retain the existing Admin readiness test to prove disabled rows remain
   visible.

## Expected initial failures

- Public list currently returns disabled-provider model rows.
- Registry/recommended endpoints currently return disabled-provider rows.
- Provider mutation tests currently have no cache invalidation call.
- Empty filtered registry currently falls back to static models.

## Mocking and fixtures

- Use normalized and alias-form provider names in at least one fixture.
- Keep provider rows explicit: `providerName`, `isEnabled`, and any fields
  required by the existing query shape.
- Do not mock away the filtering helper in the regression tests.
- Keep existing DB failure tests asserting that true DB failures still use the
  established fallback/error behavior.

## Regression commands

```bash
npm --workspace apps/web test -- server/routers/__tests__/mediaModels.readiness.test.ts server/routers/__tests__/mediaModels.persistence.test.ts
npm --workspace apps/web test -- server/routers/__tests__/media.db-first.contract.test.ts server/services/__tests__/enabledMediaModelSelection.test.ts
git diff --check
```
