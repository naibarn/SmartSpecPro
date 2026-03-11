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

---

## Implementation Notes (Actual)

### Files created
- `apps/web/server/services/agencyEscalation.ts` — Escalation logic, feature flag constants, metadata builder
- `apps/web/server/services/agencyEscalation.test.ts` — 12 tests
- `apps/web/server/services/agencyBridge.test.ts` — 4 tests
- `python-backend/tests/test_agency_escalation.py` — 6 tests

### Files modified
- `apps/web/server/services/agencyBridge.ts` — Extended `RunParams` with `taskMetadata?: AgencyTaskMetadata`, `RunResult` with `stepAttemptSnapshots`, `executeRun()` sends metadata in POST body
- `python-backend/app/api/agencies.py` — Added `TaskMetadata` Pydantic model, `task_metadata` field on `AgencyRunRequest`, telemetry logging in `run_agency` endpoint
- `python-backend/app/services/agency_orchestrator.py` — Extended `ExecutionContext` with `task_metadata` dict and `step_attempts` list, `run()` accepts and logs `task_metadata`

### Acceptance criteria status
1. **Planner escalation** — `shouldEscalateToAgency()` provides pure escalation decision based on task type + complexity + agent availability
2. **Metadata propagation** — `buildAgencyTaskMetadata()` builds snake_case metadata, `AgencyBridge.executeRun()` sends it, Python `TaskMetadata` receives it
3. **Context preservation** — `ExecutionContext.task_metadata` carries full planner context through the orchestrator graph; `step_attempts` list collects billing snapshots
4. **Staged rollout** — `PLANNER_AGENCY_ESCALATION_ENABLED` global flag + `PLANNER_AGENCY_ESCALATION:{taskType}` per-task-type prefix; integrates with existing `featureFlags.ts` (Redis + env var)

### Deviations from plan
- `agency_tools.py` was not modified — tool filtering by capability is deferred to when model resolution is wired into agent node execution (requires deeper integration with AgencySwarmAdapter)
- `apps/web/server/routers/agency.ts` was not modified on the Node.js side — the tRPC router delegates to `AgencyBridge` which handles metadata propagation
- Step-attempt snapshot collection in Python is scaffolded (`ctx.step_attempts` list) but not yet populated per-node — requires per-agent model resolution integration

### Test summary
- 22 total tests (16 TypeScript + 6 Python), all passing
- Tests cover: escalation decisions, metadata building, bridge transport, Python model validation, context initialization
