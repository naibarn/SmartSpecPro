# P0 Focused Test Plan

## Contract matrix

For the same episode/shot and valid existing inputs, run the baseline and vary only CPE state: disabled, missing service, timeout, malformed schema, stale fingerprint/revision, provider unavailable, low score, continuity warning, identity warning, and report-persistence failure. Assert equivalent image/video eligibility and base request inputs. CPE-specific metadata may differ only as warning/diagnostic data.

## Negative controls

Keep hard controls hard: unauthorized/cross-tenant asset, disallowed or incapable provider, explicit cancel/reject, content-safety/rights block, no available credits or approved budget, missing/corrupt required media artifact. Each must still reject the unsafe operation for its existing reason and must not be relabeled a CPE quality failure.

## Billing and side effects

Use deterministic provider and credit mocks. Assert zero CPE paid retries after timeout unless an explicit budgeted retry is authorized; repeated idempotency keys do not double-deduct or submit a duplicate provider job; warnings never trigger regeneration; invalid output is not persisted as active data.

## Focused verification

Start with the relevant existing suites: `verticalDramaEpisodePipeline.locationRosterWiring.test.ts`, `verticalDramaSceneContinuityLock.test.ts`, `verticalDramaSceneVisualState.test.ts`, `verticalDramaQc.test.ts`, `verticalDramaProviderQcGate.test.ts`, `verticalDramaJudgedShotVideoPromptGeneration.test.ts`, and the narrow router tests added for image/video eligibility and explicit manual actions. Use `pnpm --filter @smartspec/web exec vitest run <focused files>`; do not use local `npm run typecheck`.

## Evidence report

Record revision, focused command, files and test count, feature-off parity, injected fault cases, hard-control negative cases, and any UI/API coverage still pending. Label pending browser/provider/rollout proof as pending, never pass.
