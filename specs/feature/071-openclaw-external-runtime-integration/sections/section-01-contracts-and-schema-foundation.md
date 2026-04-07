# Section 01: Contracts and Schema Foundation

## Ownership

This section owns the canonical data contracts for worker runtimes and the backwards-compatible schema bridge from current external connectors to registered workers.

## Target files and modules

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0132_openclaw_worker_runtime_foundation.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/__tests__/openClawExternalRuntimeFeatureFlag.test.ts`
- `apps/web/shared/__tests__/workerRuntime.test.ts`
- `apps/web/server/services/__tests__/workerRuntimeSchema.test.ts`
- `apps/web/server/services/__tests__/tenantFeatureFlagsOpenClawSync.test.ts`

## Scope

- add worker-runtime enums and tables
- add `assistantProfiles.externalWorkerId`
- add the rollout flag contract for `openClawExternalRuntime`
- decide whether `openClawExternalRuntime` must also be added to Redis-synced route-guard wiring
- define shared request/response payload types for worker registration, heartbeat, claim, events, and artifacts
- define shared types for gateway compatibility metadata where external runtimes need a documented contract
- preserve legacy connectors with only `externalRef`

## Implementation notes

- Implemented canonical worker enums/tables in `apps/web/drizzle/schema.ts`:
  - `workerPolicies`
  - `runtimeProfiles`
  - `workers`
  - `workerHeartbeats`
  - `workerJobs`
  - `workerJobEvents`
  - `workerArtifacts`
- Added `assistantProfiles.externalWorkerId` as a nullable FK with `onDelete: set null`
- Added `assistant_profiles_external_worker_idx` as an auto-fix during section review because section 06 will query worker bindings from the team side
- Added `openClawExternalRuntime` to shared feature-flag defaults/allowlist and to Redis-synced route-guard wiring in `tenantFeatureFlagService.ts`
- Added runtime-agnostic shared contracts in `apps/web/shared/workerRuntime.ts`, including:
  - worker protocol compatibility metadata
  - registration / heartbeat / claim / event / artifact payload schemas
  - default Claw HTTP gateway compatibility metadata
- Added SQL migration `0132_openclaw_worker_runtime_foundation.sql` and journal entry for the new foundation tables
- Existing `externalRef` remains untouched, so unresolved/manual external connectors remain valid

## Tests

- `apps/web/shared/__tests__/openClawExternalRuntimeFeatureFlag.test.ts`
- `apps/web/shared/__tests__/workerRuntime.test.ts`
- `apps/web/server/services/__tests__/workerRuntimeSchema.test.ts`
- `apps/web/server/services/__tests__/tenantFeatureFlagsOpenClawSync.test.ts`
- Additional regression checks run against:
  - `apps/web/server/services/__tests__/orchestratorIdentitySchema.test.ts`
  - `apps/web/server/services/__tests__/tenantFeatureFlagsUpdate.test.ts`

Section-specific targeted tests pass:

- 14/14 tests for the new worker-runtime foundation files

Known out-of-scope baseline failures observed during regression pass:

- existing feature-flag tests in the repo currently expect older defaults such as `publicApi = false` and `canvas = false`; these failures were pre-existing and not caused by Feature 071 changes

## Code review changes

- Auto-fixed the missing `assistantProfiles.externalWorkerId` index after self-review
- No user interview was needed for this section; all findings had clear technical answers

## TDD expectations

- write schema/config tests before migrations
- assert the new nullable team binding does not invalidate existing external connector rows
- assert runtime type vocabulary includes `openclaw_gateway`
- assert the new feature flag defaults to disabled
- assert allowed/default/shared feature-flag vocabulary stays consistent between server and shared modules

## Acceptance checks

- schema supports registered OpenClaw workers
- schema supports unresolved connectors
- shared contract names match the spec and route design
- feature-flag vocabulary is ready before routes are wired
- shared types do not overfit to OpenClaw-only metadata that belongs in JSON payloads

## Risks and coordination notes

- do not overfit the schema to OpenClaw-only fields that belong in metadata JSON
- keep future runtime enums forward-compatible without implementing their behavior yet
