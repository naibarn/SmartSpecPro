# P1 Section 01 — Director and Shot Intent Evidence

- Scope: atomic storyboard revision guard, stale-result fallback, optional
  director location validation, and storyboard-to-start-frame prompt projection.
- Source revision at check: `cd1a2ddf60c8c34f6a48e3c8c81fd2eb77b4ad8b`.
- Profile: `quick`.
- Resource snapshot at 2026-11-07 06:59 UTC: 30 GiB RAM total, 24 GiB
  available, 15 GiB swap total, 12 GiB free.
- Test run time: 2026-11-07 07:02 UTC.
- Result: passed; 5 focused test files, 61 tests passed, 0 failed.

## Verification

```text
pnpm --filter @smartspec/web exec vitest run \
  server/services/__tests__/verticalDramaShotSceneIntent.test.ts \
  server/services/__tests__/verticalDramaShotSceneIntent.runner.test.ts \
  server/services/__tests__/verticalDramaEpisodePipeline.distinctLocations.test.ts \
  server/services/__tests__/verticalDramaEpisodePipeline.locationRosterWiring.test.ts \
  server/services/__tests__/verticalDramaEpisodePipeline.repairStage.test.ts
```

Also passed: `git diff --check`.

Coverage includes accepted dual-view intent reaching the existing start-frame
prompt contract; unknown director location keys; duplicate, unknown and missing
shot IDs; bounded planner behavior; timeout/provider fallback; and compare-and-set
fallback when a user edits the storyboard during generation or location
reconciliation. Stale generation keeps the latest valid draft in the stage
artifact and records a warning. The async worker and repair paths share the same
compare-and-set helper.

## Limits and next work

- No browser/provider E2E was run for this section.
- The remaining P1 sections 02–04 are still open; this evidence does not certify
  full CPE acceptance or production readiness.
- No schema migration or database mutation was needed.
