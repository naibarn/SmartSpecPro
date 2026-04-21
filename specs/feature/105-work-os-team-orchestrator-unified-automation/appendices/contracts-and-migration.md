# Appendix - Contracts and Migration

## Purpose

Make the rollout of `workflow` and `skill_studio` safe by defining how planner-visible surfaces become runtime-dispatchable across existing Work OS contracts.

## Current contract boundaries in the codebase

- `apps/web/server/services/workAutomationPolicyService.ts`
  - `WorkAutomationSurface` currently ends at `video_editor`
- `apps/web/server/routers/workOs.ts`
  - `automationSurfaceSchema` currently ends at `video_editor`
- `apps/web/server/services/workAutomationFabricService.ts`
  - step progress input unions currently end at `video_editor`
- `apps/web/drizzle/schema.ts`
  - `workAutomationSurfaceEnum` currently ends at `video_editor`
  - `workAutomationRunSteps.surface` persists that enum

## Required migration work

1. Shared contracts
   - extend shared surface unions and execution-plan types
   - add `contractCompatibilityState` to capability and plan-step schemas
2. Router contracts
   - extend `automationSurfaceSchema`
   - extend step-route and execute-step input/output schemas
3. Persistence
   - migrate `workAutomationSurfaceEnum`
   - verify `workAutomationRunSteps.surface` and any related read models accept the new values
   - preserve compatibility for historical rows without rewriting prior data
4. Service layer
   - extend `workAutomationPolicyService`
   - extend `workAutomationFabricService`
   - extend any Team/Work OS adapters that switch on surface value
5. UI and telemetry
   - ensure Work OS and Team ledger surfaces render new surface labels cleanly
   - record compatibility blocks separately from auth/flag failures

## Rollout phases

### Phase A - Preview-only compatibility mode

- The planner may emit `workflow` and `skill_studio` as candidate capabilities.
- Every such candidate must carry `contractCompatibilityState`.
- If contracts are not yet migrated, the capability is shown as:
  - `blocked`
  - reason: `surface_contract_not_migrated`
- No launch or dispatch may target that surface yet.

### Phase B - Contract migration

- Land shared type changes.
- Land router schema changes.
- Land persistence enum changes.
- Land service union/switch updates.
- Add compatibility regression tests before enabling execution.

### Phase C - Controlled execution enablement

- Keep runtime dispatch behind feature flags.
- Enable one privileged surface at a time.
- Require telemetry on:
  - compatibility blocks
  - runtime dispatch attempts
  - governance downgrades

## Backward-compatibility rules

- Historical automation rows must remain valid without rewrite.
- Readers must tolerate older runs that never mention `workflow` or `skill_studio`.
- New code should treat unknown future surfaces defensively in logs/UI instead of crashing.

## Test expectations

- planner marks unsupported new surfaces with `surface_contract_not_migrated`
- router validation accepts new surfaces only after migration lands
- persisted automation-step rows accept new enum values only after DB migration lands
- read models and telemetry render the new surfaces without breaking historical runs
