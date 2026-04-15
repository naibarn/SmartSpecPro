# Section 04 - Role Monitor Aggregation and Control Backend

## Purpose

This section defines the backend services, projection logic, and router payloads that power the Autonomous Team Monitor.

The goal is to answer, truthfully and quickly, what each role is doing now, how healthy it is, what is blocking it, which routines are active, and how underlying workpack posture affects it, without forcing operators to piece together raw logs or several disconnected pages.

## Why this section follows Sections 01 to 03

- The monitor depends on durable role, routine, and checkpoint vocabulary from Section 01.
- It needs routine-cycle and recovery boundaries from Section 02.
- It needs resolved workpack version and linked workpack evidence from Section 03.
- Building the control backend earlier would create a run-centric dashboard again instead of the intended role-centric projection.

## Files in scope

- `apps/web/server/services/roleMonitorService.ts` new aggregation service
- `apps/web/server/services/roleCommandService.ts` new pause, resume, quarantine, and stop command service
- `apps/web/server/routers/roleMonitor.ts` new dedicated router or equivalent role-monitor router surface
- `apps/web/server/routers/monitoring.ts` only where shared monitoring summaries should expose role-level integration points
- `apps/web/server/services/__tests__/roleMonitorService.test.ts` new monitor-aggregation tests
- `apps/web/server/services/__tests__/roleCommandService.test.ts` new command tests
- `apps/web/server/routers/__tests__/roleMonitor.test.ts` new router tests

## Monitor projection model

The monitor should be a projection over durable role and workpack evidence, not a second execution truth.

For every role, aggregation should combine:

- current role-agent lifecycle state
- active contract version
- routine roster
- active and recent `role_routine_run` records
- checkpoint freshness and recovery status
- backlog depth and SLA posture
- role exception bindings
- linked workpack readiness, incident, and replay posture
- role KPI, budget, and autonomy status
- current blockers and operator actions

The projection should be explainable. Operators must be able to trace every "current state" summary back to durable role and workpack records.

## Required backend views

The backend should expose at least these logical views:

- role roster summary
- role detail summary
- routine-cycle timeline
- current blockers and dependency posture
- role-aware exception view
- workpack dependency posture
- KPI and backlog rollups
- recent communication and handoff summary

Each payload should be shaped for control-plane consumption rather than raw database dumping.

## Control actions

Operators must be able to act from the role monitor without breaking safety boundaries.

The backend should support:

- pause one routine
- resume one routine
- pause one role
- quarantine one role or routine
- stop one org slice
- request safe resume review
- deep link to underlying workpack incident or replay surface

Control rules:

- role-level stop should fan into the underlying routine cycles and workpack controls rather than inventing a disconnected kill switch.
- workpack incident services remain authoritative for workpack stop, freeze, and safe-resume state.
- role command handlers should preserve operator attribution and audit metadata.

## Approval workflow matrix

This section should define a consistent review state machine for operator-facing approvals instead of letting each backend action invent its own semantics.

At minimum, the matrix should cover:

- contract expansion review
- safe resume review after quarantine or stale recovery
- promotion or downgrade review when automatic gate handling is insufficient
- delegated approval requests created through typed role communication
- high-risk exception remediation that would otherwise cross a consequence boundary

For each workflow, the implementation should define:

- approval subject
- requester
- allowed approver scope
- optional quorum or single-approver requirement
- expiry or stale-review timeout
- allowed decisions
- state fanout into role, routine, checkpoint, workpack, and exception posture

The goal is not one universal review object for every situation. The goal is one understandable state model that keeps approval semantics consistent and auditable.

## Current-state explanation

The monitor should be able to answer questions such as:

- What is this role doing now?
- Which routine cycle is active?
- Which workpack version was selected?
- Is the role blocked by checkpoint staleness, workpack readiness, incident freeze, or KPI deterioration?
- What action can the operator take next?

To support this, the aggregation model should prefer:

- active `role_routine_run`
- linked workpack run ids
- latest checkpoint
- current role exception bindings

over loose inference from room messages or event streams alone.

## Ownership boundaries

This section owns:

- role-centric aggregation payloads
- role-centric operator commands
- role monitor router shapes
- translation of workpack posture into role monitor summaries

This section does not own:

- workpack execution
- workpack replay payloads
- workpack incident truth
- UI layout or final presentation details

Those remain with Feature 079 services or later UI sections.

## Implementation guidance

1. Introduce a dedicated role monitor service instead of overloading existing monitoring handlers with role-only orchestration logic.
2. Keep aggregation deterministic and projection-oriented. Do not embed freeform explanation generation into the core projection path.
3. Reuse existing monitoring summaries where possible, but convert them into role vocabulary explicitly instead of passing raw run-monitor payloads into the UI.
4. Make control actions narrow, attributable, and fail closed when role or workpack state is ambiguous.
5. Preserve deep links into Feature 079 surfaces rather than copying replay, incident, or connector detail payloads into the monitor backend.
6. Keep approval workflows explicit and typed so safe resume, contract change, promotion review, and delegated approvals do not drift into incompatible state machines.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: role roster summaries include current status, autonomy tier, backlog, exception count, KPI trend, checkpoint freshness, and blockers.
- Test: role detail payloads expose active contract, routines, current routine cycle, resolved workpack dependency posture, and current recovery state.
- Test: monitor aggregation can answer "what is this role doing now?" from routine-cycle, checkpoint, and linked workpack evidence without raw log reconstruction.
- Test: stale checkpoints, blocked workpacks, or active incidents are surfaced as explicit blockers rather than hidden in status text.
- Test: pause, resume, quarantine, and org-slice stop commands affect only the intended role or routine scope.
- Test: control actions preserve operator attribution and audit metadata.
- Test: role monitor router payloads stay stable and tenant-scoped.
- Test: workpack incident and readiness truth remain authoritative and are reflected into role monitor summaries without duplication.
- Test: approval workflows for safe resume, contract expansion, promotion review, and delegated approvals preserve approver scope, expiry, and state fanout semantics.

## Done when

This section is complete when the backend can project one truthful, role-centric control surface over routine cycles, checkpoints, workpack posture, and operator commands without inventing a second runtime truth.
