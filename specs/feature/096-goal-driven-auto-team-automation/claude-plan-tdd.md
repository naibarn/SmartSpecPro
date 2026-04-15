# TDD Plan - Feature 096 Goal-Driven Auto Team Automation

## Testing Context

- Primary test command: `pnpm --prefix apps/web test`
- Test framework: Vitest
- Existing service test patterns live in `apps/web/server/services/__tests__`
- Existing UI test patterns live in `apps/web/client/src/pages/__tests__` and `apps/web/client/src/components/**/__tests__`

The implementation should follow the existing Vitest style in this repo:

- small helper-function tests for pure logic
- service tests with mocked DB/service dependencies
- UI tests that assert visible runtime state and controls
- schema tests that confirm durable fields exist and remain backwards compatible

## 0. Planning artifact and persona-aware decomposition

### Test stubs

- `specs/feature/096-goal-driven-auto-team-automation` planning artifact tests or any planning-service tests introduced for this feature
  - Test that a topic/objective/spec is decomposed into named subtasks before execution begins.
  - Test that the plan artifact records persona ownership for each subtask.
  - Test that the plan artifact records reviewer persona, verification method, and repair-loop rules for each subtask.
  - Test that the plan is written durably before the first execution step starts.
  - Test that clearly parallel work is split into separate subtasks instead of remaining as one large prompt.

## 1. Durable runtime state and evidence model

### Test stubs

- `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts`
  - Test that the runtime snapshot contract includes the new runtime-state fields needed by the feature.
  - Test that snapshot fields remain backward compatible when older rows omit the new runtime overlay.
  - Test that the schema still exposes the existing `activeAssistantId`, token usage, and approval counters.

- `apps/web/server/services/__tests__/monitoringService.test.ts`
  - Test that `captureSnapshot()` persists the new runtime-state payload when the run includes a richer phase/waiting/reviewer context.
  - Test that snapshot capture still succeeds for legacy running runs that do not yet have the new overlay fields populated.
  - Test that evidence-related fields are written durably and do not disappear between captures.

- `apps/web/server/services/__tests__/workOsService.test.ts`
  - Test that team-run status changes are reflected into the Work OS case projection or event timeline without contradicting the run overlay.
  - Test that Work OS projections keep the same case identity and history when the run is repaired, retried, or resumed.
  - Test that unmapped or conflicting states are surfaced as exceptions or blocked states instead of silently diverging.
  - Test that Work OS-originated work keeps the same case identity through plan creation, execution, repair, and completion.

- `apps/web/server/services/__tests__/runEngine.migration.test.ts`
  - Test that the compatibility path still recognizes old `team_runs.status` values.
  - Test that the new runtime overlay does not require existing historical rows to be backfilled immediately.

## 2. Goal-driven orchestration loop and stop-policy integration

### Test stubs

- `apps/web/server/services/__tests__/runEngine.test.ts`
  - Test that `shouldContinueAutoTeamLoop()` is no longer the only source of truth for continuation when the run still has actionable goal progress.
  - Test that `evaluateAutoTeamLoopDecision()` continues when the open work items are assistant-actionable even if the initial turn burst has been exhausted.
  - Test that `evaluateAutoTeamLoopDecision()` does not continue when the run is waiting on a true human decision.
  - Test that `evaluateAutoTeamLoopDecision()` pauses only for the explicit dependency cases and not for ordinary async waiting.
  - Test that no-actionable-work-item cases still stop queueing additional turns.

- `apps/web/server/services/__tests__/teamRunIntegration.test.ts`
  - Test an end-to-end run path where `auto_team` continues across multiple turns and stops only when the objective is resolved or policy stops the run.
  - Test that user pause / resume still works and does not get confused with async waiting states.

## 3. Async worker dispatch, polling, and completion lifecycle

### Test stubs

- `apps/web/server/services/__tests__/workerCallbackService.test.ts`
  - Test that callback resolution can map a worker job back to the originating run and room context.
  - Test that repeated callback events remain idempotent.
  - Test that job completion writes the expected durable event payload before the workflow advances.

- `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`
  - Test that skill execution can return a pollable task handle and that completion produces a usable result payload.
  - Test that the workflow can continue after the task transitions from running to done.

- `apps/web/server/services/__tests__/mediaRoutingIntegration.test.ts`
  - Test that asynchronous media jobs stay in a pollable state until the provider result is ready.
  - Test that a completed media job advances the workflow without a manual intervention step.

- `apps/web/server/services/__tests__/monitoringService.test.ts`
  - Test that stuck / no-progress polling eventually surfaces a blocked or failed state instead of spinning forever.

## 4. Verification, reviewer routing, risk classes, and escalation

### Test stubs

- `apps/web/server/services/__tests__/runEngine.test.ts`
  - Test that each risk class maps to the expected default reviewer persona.
  - Test that low-risk and medium-risk steps remain automation-first and enter the repair loop instead of escalating immediately.
  - Test that high-risk steps block or escalate according to policy.
  - Test that critical-risk steps require explicit human approval.
  - Test that failed verification triggers repair + re-verify rather than advancing directly.

- `apps/web/server/services/__tests__/workAutomationExecutionService.test.ts`
  - Test that skill and agency outputs only count as complete when evidence is written back and the review gate passes.
  - Test that a failed step remains in a repairable state until verification passes.

- `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts` or any new work-item service tests introduced for this feature
  - Test the durable risk class / approval state / reviewer assignment transitions on work items if new helpers or services are introduced.

## 5. Runtime status projection and UI visibility

### Test stubs

- `apps/web/client/src/pages/__tests__/Teams.test.tsx`
  - Test that the active run panel shows the richer runtime status text instead of only coarse paused/running labels.
  - Test that waiting reasons and stop reasons are rendered distinctly.
  - Test that the run controls remain usable when the runtime is waiting on async work.

- `apps/web/client/src/pages/__tests__/Teams.planVisibility.test.tsx`
  - Test that the Teams plan panel renders the current goal, subtasks, owner, reviewer, status, evidence, and remaining verification criteria.
  - Test that the plan panel stays visible and refreshable while the run is planning, executing, waiting, blocked, or reviewing.
  - Test that the plan panel is tied to the durable plan artifact rather than only to transient UI state.
  - Test that plan visibility remains usable for partially planned or newly started runs.

- `apps/web/client/src/pages/__tests__/AutonomousTeamMonitor.test.tsx`
  - Test that the monitor shows waiting-for-worker / waiting-for-poll / awaiting-human-approval states clearly.
  - Test that the monitor surfaces next-poll hints or blocked reasons when available.

- `apps/web/client/src/components/orchestrator/TeamRoomView`-adjacent tests
  - Test that invalidations still refresh the run detail after workflow events.
  - Test that the room workflow panel reflects the latest runtime overlay from `teamRun.get`.

- `apps/web/client/src/components/orchestrator/RoomWorkflowPanel`-adjacent tests
  - Test that workflow state labels and action buttons remain correct when the run is in a waiting state.

## 6. Tests, compatibility, and rollout

### Test stubs

- `apps/web/server/services/__tests__/runEngine.migration.test.ts`
  - Test that historical rows and old status values still load cleanly after the runtime overlay is introduced.
  - Test that the plan does not require a destructive migration of old run history.

- `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts`
  - Test that the schema export still includes the existing public run fields and the new runtime overlay fields together.

- `apps/web/server/services/__tests__/runEngine.bridgeRemoval.test.ts`
  - Test that any legacy bridge behavior that should disappear does not reappear after the new goal-driven controller lands.

- `apps/web/client/src/pages/__tests__/Teams.test.tsx`
  - Test that the UI degrades gracefully when the richer runtime overlay is absent, such as for older historical runs.

- `apps/web/client/src/pages/__tests__/Teams.planVisibility.test.tsx`
  - Test that older runs still render the plan panel without crashing when plan data is missing or partial.
  - Test that the plan panel can be opened and refreshed repeatedly without losing visible ownership or evidence data.

- `apps/web/server/services/__tests__/workOsService.test.ts`
  - Test that Work OS overview and case projection remain compatible with the team-run overlay and do not show contradictory terminal states.
  - Test that the status mapping table stays deterministic across queued/running/waiting/blocked/completed transitions.

## Section-by-Section Execution Notes

- Write the state-model and schema tests first so the runtime overlay contract is locked before orchestration changes land.
- Follow with the pure run-engine tests so the goal-driven continuation behavior is defined before async polling work is added.
- Add polling / callback tests next because they define the waiting lifecycle.
- Add verification and reviewer-routing tests before wiring the UI so the status labels reflect the actual policy model.
- Finish with UI tests and compatibility tests once the backend contract is stable.
