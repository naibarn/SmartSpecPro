# Section 07: Tests, Compatibility, and Rollout

## Goal

Prove the new automation model safely with regression coverage and compatibility checks before rollout.

This section owns the testing, migration safety, and rollout story for the feature.

## What This Section Must Change

### 1. Regression coverage

Add tests for:

- goal-driven continuation
- waiting-state projection
- async job completion and polling
- verification / review / escalation behavior
- UI rendering of the richer runtime state
- plan rendering and continuous inspection in Teams
- Work OS status mirroring and contradiction detection
- deterministic status mapping between team-run overlay and Work OS state

### 2. Compatibility coverage

Add tests that prove:

- existing paused/running/completed flows still work
- older historical runs still load
- the runtime overlay can be absent without breaking consumers
- existing `teamRun.get` callers still receive a usable response
- Teams can still open and render the plan panel for in-flight runs
- Work OS projections keep the same case identity and history even when the run is repaired or resumed
- Work OS-originated work does not create a disconnected duplicate plan or case during retries or repairs
- Work OS projection failures surface a blocked or exception state instead of being treated as a settled terminal outcome

### 3. Rollout safety

Make sure the implementation can ship in additive slices:

- schema / snapshot first
- orchestration next
- async polling next
- verification and escalation next
- UI projection and plan visibility last

## Files Likely Touched

- `apps/web/server/services/__tests__/runEngine.test.ts`
- `apps/web/server/services/__tests__/runEngine.migration.test.ts`
- `apps/web/server/services/__tests__/monitoringService.test.ts`
- `apps/web/server/services/__tests__/workerCallbackService.test.ts`
- `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts`
- `apps/web/server/services/__tests__/teamRunIntegration.test.ts`
- `apps/web/server/services/__tests__/workOsService.test.ts`
- `apps/web/client/src/pages/__tests__/Teams.test.tsx`
- `apps/web/client/src/pages/__tests__/Teams.planVisibility.test.tsx`
- `apps/web/client/src/pages/__tests__/AutonomousTeamMonitor.test.tsx`

## Implementation Notes

- Keep the tests aligned with the existing Vitest structure in the repo.
- Prefer small targeted tests for the core loop helpers and integration tests for the end-to-end run flow.
- Ensure regression tests lock down the compatibility layer before any risky migration is introduced.
- The current slice adds regression coverage for async job handles, verification policy resolution, work-item reviewer selection, worker runtime status projection, and workflow-panel runtime visibility.

## Completion Criteria

- The new behavior is covered by regression tests.
- Backward compatibility is demonstrated by tests, not assumed.
- The rollout path is additive and safe to ship incrementally.
