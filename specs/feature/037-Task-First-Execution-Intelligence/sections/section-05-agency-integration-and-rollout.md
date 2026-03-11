# Section 05 — Agency Integration and Rollout

## Objective

Make AgencySwarm a planner-selected execution strategy and roll out the new runtime safely.

## Scope

1. planner escalation into AgencySwarm
2. propagation of requirement intent, resolved model snapshots, and budget/task metadata into agency runs
3. agency artifact linkage back to task runs
4. feature flags, telemetry, and rollout controls

## Primary files

- `apps/web/server/routers/agency.ts`
- `python-backend/app/services/agency_orchestrator.py`
- `python-backend/app/services/agency_tools.py`
- planner/task-run services

## Rollout requirements

- feature-flag planner-driven routing
- allow per-task-type rollout
- log routeReason, strategy, and effective model
- preserve step-attempt snapshot semantics across agency handoff
- measure:
  - cost per completed artifact
  - task completion latency
  - fallback rate
  - agency escalation rate

## Acceptance criteria

1. planner can escalate a task into agency execution
2. agency runs receive planner metadata needed for budget/model alignment
3. agency handoff does not discard approval, reservation, or resolved snapshot context
4. rollout can be staged without forcing planner mode across the whole product
