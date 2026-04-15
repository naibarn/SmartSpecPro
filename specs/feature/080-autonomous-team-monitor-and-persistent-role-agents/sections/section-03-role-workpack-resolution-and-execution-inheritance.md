# Section 03 - Role-to-Workpack Resolution and Execution Inheritance

## Purpose

This section defines how persistent role routines resolve into Feature 079 workpacks while inheriting readiness, rollout, incident, autonomy, and trust posture safely.

The goal is to keep Feature 080 disciplined: roles own recurring work, but workpacks remain the bounded execution unit. Role routines should never outrun the workpack substrate they depend on.

## Why this section depends on Sections 01 and 02

- Role contracts and bindings must already exist before any resolution logic can be trusted.
- Routine-cycle boundaries, idempotency, and checkpoints must already exist so resolution happens inside a durable operational context.
- The monitor and delegation layers need one deterministic explanation of which workpack version a role routine selected and why.

## Files in scope

- `apps/web/server/services/roleWorkpackResolutionService.ts` new binding and resolution service
- `apps/web/server/services/roleExecutionService.ts` new role-to-workpack execution bridge
- `apps/web/server/services/__tests__/roleWorkpackResolutionService.test.ts` new resolution tests
- `apps/web/server/services/__tests__/roleExecutionService.test.ts` new execution-bridge tests
- `apps/web/server/routers/workpack.ts` only where existing workpack services need role-aware metadata or safe service-level integration points
- `apps/web/shared/roleAgentContracts.ts` if additional binding or resolution fields are needed

## Resolution policy

Every role routine must resolve through one explicit policy:

- `pinned_version`
- `follow_benchmark_track`
- `follow_latest_ready_in_family`

Resolution should follow this order:

1. Validate the role contract and routine status.
2. Validate the tenant rollout posture from Feature 079 flags and readiness state.
3. Evaluate the role-workpack binding policy.
4. Determine the eligible workpack family and version candidates.
5. Filter candidates by:
   - role contract authority envelope
   - workpack readiness and incident state
   - connector scope ceiling
   - side-effect class ceiling
   - budget ceiling
   - benchmark and trust requirements
6. Select the highest-priority safe candidate according to the binding policy.
7. Persist the selected workpack version on the `role_routine_run`.

If no eligible candidate remains, resolution must fail closed into blocked or review state.

## Workpack rollout inheritance

Feature 080 must consume Feature 079 rollout posture instead of inventing a second gate model.

Role-controlled autonomous execution remains blocked when:

- `workpacksEnabled` is false for the tenant
- `workpackAutonomousPilot` is false for the tenant
- the selected workpack family is not readiness-approved
- the selected workpack version is frozen, quarantined, or under incident stop
- required replay or benchmark posture is no longer valid

The role layer should surface these blockers clearly but should not replace the underlying workpack readiness or incident truth.

## Autonomy inheritance

The resolved execution posture should always inherit the lower of:

- the role routine autonomy tier
- the resolved workpack autonomy posture

Examples:

- A supervised role routine may run an autonomous-ready workpack only in supervised mode.
- An autonomous role routine may not run a workpack that is only ready for supervised execution.
- If a workpack is downgraded or frozen later, the role routine should pause, downgrade, or block accordingly.

## Version transition and rollback behavior

Automatic version changes should be deliberate and auditable.

- A newly resolved workpack version should begin a new routine-cycle boundary rather than silently mutating the current cycle.
- The cycle record should preserve:
  - selected workpack family
  - resolved version id
  - resolution mode
  - previous resolved version when applicable
  - rollback baseline
- If a promoted version later freezes or regresses, resolution should fall back to the declared rollback baseline or fail closed if no safe baseline exists.

## Role-aware execution bridge

Feature 080 should call Feature 079 through dedicated service boundaries rather than by imitating client-side router flows.

The execution bridge should:

- request workpack launch using service-level APIs
- pass role metadata for attribution
- preserve the originating `role_routine_run` id
- receive workpack run ids and link them back to the routine cycle
- consume workpack exceptions, incidents, and completion state as inputs to role state

This bridge should not reimplement workpack routing logic. It should only resolve, launch, link, and inherit posture.

## Side-effect and authority constraints

Resolution should not stop at "workpack version exists."

Before launch, the bridge should confirm:

- required connector families stay inside the role contract envelope
- required side-effect class does not exceed the role ceiling
- required budget or runtime posture stays inside the role allowance
- the selected workpack version does not widen regulated exposure beyond the routine's declared boundary

If any of these checks fail, the system should block or downgrade before execution begins.

## Implementation guidance

1. Keep resolution deterministic and policy-driven. Avoid freeform role-level planning in this layer.
2. Treat the workpack binding as a contract object, not just a loose family string.
3. Keep the selected workpack version, linked workpack run ids, and rollback target explicit on `role_routine_run`.
4. Reuse Feature 079 service boundaries so rollout, incidents, and replay posture remain authoritative in one place.
5. Make downgrade behavior explicit when underlying workpack posture changes after the role routine was configured.
6. Fail closed when eligibility, readiness, or authority checks become ambiguous.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: pinned-version resolution selects only the declared workpack version and blocks when it is no longer eligible.
- Test: benchmark-track resolution follows the configured benchmark family and preserves rollback targets.
- Test: latest-ready resolution picks the latest readiness-approved safe version in family and ignores frozen or blocked candidates.
- Test: workpack resolution fails closed when tenant rollout flags, workpack readiness, replay posture, or incident state block autonomous execution.
- Test: role routines inherit the lower of role autonomy and workpack autonomy posture.
- Test: linked workpack run ids are persisted on `role_routine_run` after launch.
- Test: automatic workpack-version changes create new routine-cycle boundaries rather than silently mutating an in-flight cycle.
- Test: connector scope, side-effect class, regulated boundary, and budget-ceiling mismatches block launch or downgrade safely.
- Test: role execution bridge delegates actual execution to Feature 079 services instead of copying workpack routing logic locally.

## Done when

This section is complete when every role routine can resolve into a safe, auditable Feature 079 workpack target, inherit the correct rollout and incident posture, and explain exactly which workpack version it used and why.
