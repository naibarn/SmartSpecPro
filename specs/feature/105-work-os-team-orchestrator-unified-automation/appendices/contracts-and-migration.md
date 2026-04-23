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

## Approved-plan persistence decision gate

Before Feature 105 leaves internal/admin-only preview, engineering must decide whether approved preflight bundles remain in JSON metadata or move into dedicated tables.

JSON metadata is acceptable for v1 only when:

- approved bundles are loaded primarily by automation run id
- Team kickoff and runtime dispatch can validate the bundle with shared schemas at read time
- operators do not need cross-run filtering or dashboards over plan steps, snapshots, or budget envelopes
- retention/audit can be satisfied by existing Work OS timeline and run metadata

Dedicated migrations are required before broader rollout when any of these are true:

- approved bundles must be searched, filtered, or joined across runs
- approval source snapshots need independent retention or audit lifecycle
- Team ledger, workpack learning, or monitoring needs reliable joins to individual plan steps
- operators need dashboards over blocked surfaces, budget caps, or team-resolution outcomes
- JSON blobs become too large or too expensive to hydrate for routine list views

Minimum normalized records, if the gate chooses migration:

- approved preflight bundle header
- approval source snapshot rows
- execution plan step rows
- budget envelope rows or immutable budget snapshots
- team-resolution decision rows
- governance and contract-compatibility block rows

The decision must be recorded in `decision-log.md` and referenced by the rollout checklist before enabling requester-visible launch enforcement.

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
- If approved-plan metadata needs cross-run queryability, land the approved-bundle persistence migration before enabling requester-visible launch approval.

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
