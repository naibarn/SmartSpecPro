# Claude Research - Feature 096 Goal-Driven Auto Team Automation

## Research Decision

- Codebase research: yes
- Web research: no
- Testing: existing TypeScript/Vitest test suite in `apps/web/server/services/__tests__`

Reasoning:

- This is an existing codebase with a live orchestration layer, existing run lifecycle endpoints, and existing tests that already cover `runEngine` and adjacent services.
- The feature is primarily about changing orchestration behavior and state handling, so the codebase conventions matter more than external best-practice research.
- The spec does not require a new third-party integration, so web research is not necessary for this planning pass.

## Codebase Findings

### 1. `auto_team` is currently turn-driven, not goal-driven

Relevant files:

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/routers/teamRun.ts`

Current behavior:

- `startRun()` starts the run in `running` status and, when `executionMode === "auto_team"`, immediately queues `AUTO_TEAM_INITIAL_TURNS = 3` turns.
- `resumeRun()` re-queues one auto turn when a paused `auto_team` run is resumed.
- `advanceRun()` executes at most `MAX_ADVANCE_TURNS = 5` turns in one invocation and uses `evaluateAutoTeamLoopDecision()` to decide whether to continue.
- `shouldContinueAutoTeamLoop()` only checks `running`, `auto_team`, `completedTurns > 0`, and `!shouldStop`.
- The current loop decision is still framed around whether work items are assistant-actionable versus human/external blocking.

Important references:

- `apps/web/server/services/runEngine.ts:117-119`
- `apps/web/server/services/runEngine.ts:155-166`
- `apps/web/server/services/runEngine.ts:222-258`
- `apps/web/server/services/runEngine.ts:1005-1010`
- `apps/web/server/services/runEngine.ts:1096-1101`
- `apps/web/server/services/runEngine.ts:1288-1342`

### 2. The run status model is still coarse

Relevant files:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/runEngine.ts`

Current DB enum:

- `team_run_status` currently only supports `queued`, `running`, `paused`, `completed`, `failed`, and `stopped`.

Implication:

- The spec’s richer runtime states such as `waiting_for_worker`, `waiting_for_poll`, and `awaiting_human_approval` will likely need either:
  - a new durable state field / enum, or
  - an auxiliary runtime-state contract layered over the existing DB status.
- The existing `team_runs.status` table column does not yet encode the more granular waiting states.

Important references:

- `apps/web/drizzle/schema.ts:8699-8703`
- `apps/web/drizzle/schema.ts:8924-8941`
- `apps/web/drizzle/0085_secret_harpoon.sql:10-11`

### 3. `team_work_items` already stores enough shape for work-item-driven evaluation

Relevant file:

- `apps/web/drizzle/schema.ts`

Useful fields on `team_work_items`:

- `status`
- `revisionVersion`
- `threadRootMessageId`
- `activeDraftArtifactId`
- `priority`
- `riskClass`
- `approvalState`
- `assignedMemberId`
- `reviewerMemberId`
- `approverMemberId`
- `workerJobId`
- `workerJobState`
- `workerJobOutputJson`
- `workerJobErrorJson`

Implication:

- The spec’s verification / review / risk logic can likely be implemented on top of existing work item records instead of introducing a brand-new work ledger immediately.
- The existing schema already hints at a durable place for async worker state, reviewer assignment, and approval tracking.

Important references:

- `apps/web/drizzle/schema.ts:8954-9005`

### 4. Existing async patterns already use durable task IDs and polling

Relevant files:

- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/routers/mediaJobs.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/services/workerCallbackService.ts`

Observed patterns:

- `skillExecutor.startPythonSkillTask()` writes `skill:task:<taskId>` to Redis with `status: "running"` and later updates it to `status: "done"` with the final result.
- Media generation already uses async dispatch plus polling safety nets:
  - Cloud Tasks polling queue for Kie AI
  - celery dispatch fallback
  - polling task IDs and backoff comments in the code
- `workerCallbackService` already has durable callback lookup logic tied to `workerJobs`, `workerJobEvents`, and run context lookup via `teamRuns` / `teamRooms`.

Implication:

- The feature does not need to invent the concept of “job handle + poll until terminal state” from scratch.
- Existing services already provide implementation references for:
  - task IDs
  - durable status records
  - polling loops
  - callback idempotency
  - run-context lookup

Important references:

- `apps/web/server/services/skillExecutor.ts:1516-1565`
- `apps/web/server/routers/mediaJobs.ts:274-321`
- `apps/web/server/services/workerCallbackService.ts:222-272`

### 5. There is already a durable artifact / evidence pattern in adjacent automation flows

Relevant file:

- `apps/web/server/services/workAutomationExecutionService.ts`

Observed pattern:

- Automated skill and agency steps write durable artifacts to the library.
- Metadata includes:
  - `runId`
  - `stepKey`
  - `adapterKind`
  - result type / success / credits used / task ID
- The service creates library items with source links back to the automation step.

Implication:

- This is a strong precedent for the spec’s requirement that each step must persist evidence before advancing.
- The new plan should likely reuse this artifact/evidence pattern rather than inventing a separate ad hoc evidence record.

Important references:

- `apps/web/server/services/workAutomationExecutionService.ts:373-427`
- `apps/web/server/services/workAutomationExecutionService.ts:430-470`

### 6. Existing intervention surface is minimal and centralized

Relevant file:

- `apps/web/server/routers/teamRun.ts`

Current procedures:

- `start`
- `pause`
- `resume`
- `advance`
- `stop`
- `get`

Implication:

- The existing public surface is already small enough to support a focused orchestration change.
- The plan should decide whether new runtime states are exposed through:
  - expanded `get` response / derived status fields, or
  - new procedures for polling / job-state retrieval, rather than broad route changes.

Important references:

- `apps/web/server/routers/teamRun.ts:34-103`

### 7. Existing tests already cover the decision logic that will need to evolve

Relevant file:

- `apps/web/server/services/__tests__/runEngine.test.ts`

Current coverage includes:

- default stop policy
- kickoff title derivation
- execution mode to turn strategy mapping
- current auto-team loop continuation behavior
- human approval pause
- external connector pause
- stop-condition evaluation
- external connector dispatch candidate resolution

Implication:

- The current test suite is a good anchor for TDD.
- The next plan should extend these tests rather than replace them.
- New tests will likely need to add:
  - richer state transitions
  - goal-driven continuation
  - async worker waiting / polling
  - review and verification gates
  - escalation policy behavior

Important references:

- `apps/web/server/services/__tests__/runEngine.test.ts:53-145`
- `apps/web/server/services/__tests__/runEngine.test.ts:261-329`

## Testing Notes

### Existing test stack

- TypeScript
- Vitest
- service-level unit tests in `apps/web/server/services/__tests__`

### Existing patterns worth following

- Use small pure-function tests for state/decision helpers.
- Use service tests with mocked DB/service dependencies for orchestration flows.
- Keep assertions focused on:
  - return values
  - state transitions
  - persisted fields
  - queued side effects

### Likely test areas for the implementation plan

- auto-loop continuation and stop conditions
- transition from “running” to derived waiting states
- polling and resume behavior for async job handles
- verification / evidence writeback
- persona-based reviewer selection
- escalation behavior for high/critical risk cases
- compatibility with existing `paused` / `running` / `completed` statuses

## Research Summary

The codebase already has most of the building blocks for goal-driven automation:

- a centralized run engine
- durable work items
- existing async task handles and polling patterns
- artifact/evidence writeback in adjacent automation flows
- a compact tRPC surface for run control
- a Vitest-based test suite around the relevant orchestration functions

The main gap is not infrastructure availability, but the control model:

- the run engine still treats continuation as a turn counter problem
- the DB status model is too coarse for richer waiting states
- the system does not yet have a durable “step verified by persona reviewer” contract
- escalation is still implicit in a few human/external branches instead of being a formal risk-based policy

Those gaps should drive the implementation plan and section split.
