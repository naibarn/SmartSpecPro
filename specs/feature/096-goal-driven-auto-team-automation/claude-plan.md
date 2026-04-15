# Claude Plan - Feature 096 Goal-Driven Auto Team Automation

Date: 2026-04-15
Mode: self_review
Source files:

- `claude-spec.md`
- `claude-research.md`
- `claude-interview.md`

## Objective

Turn `auto_team` into a goal-driven automation loop that keeps working until the objective is done, while still respecting hard safety and policy boundaries.

The implementation must:

- plan every incoming topic/objective/spec before execution begins
- split work into persona-aware subtasks instead of sending one large prompt to a single LLM pass
- persist a durable plan artifact with ownership, review, verification, and repair rules
- keep the current plan visible in Teams at all times with step ownership, reviewer ownership, status, and evidence
- keep work inside automation by default
- verify every step before advancing
- persist durable evidence for every completed step
- review each step with a persona that matches the work type
- classify risk and escalate only when automation cannot safely continue
- expose the richer waiting / review / blocked states to the user

This is not a new workflow engine. It is a control-model upgrade for the existing run engine, work-item model, polling patterns, and status surfaces.

## Plan Structure

1. Planning artifact and persona-aware decomposition
2. Durable runtime state and evidence model
3. Goal-driven orchestration loop and stop-policy integration
4. Async worker dispatch, polling, and completion lifecycle
5. Verification, reviewer routing, risk classes, and escalation
6. Runtime status projection and UI visibility
7. Teams UI plan visibility and continuous plan inspection
8. Tests, compatibility, and rollout

## 1. Planning artifact and persona-aware decomposition

### What to build

- Add a durable plan artifact that records how a topic, objective, or spec was decomposed before execution starts.
- Make the planning step output:
  - interpreted objective
  - subtask list
  - persona ownership for each subtask
  - reviewer persona for each subtask
  - verification method for each subtask
  - retry / repair loop rule for each subtask
  - expected evidence for each subtask
- Allow the planner to use an LLM or agent to help split the work, but require the output to be explicit about who owns, who reviews, and what qualifies as done.
- Prefer splitting work by persona, dependency, and surface before execution begins.
- Record the plan durably so execution can be audited and resumed from it.

### Decision: plan source-of-truth and read contract

- The durable plan artifact is the canonical plan record for the run or case.
- The UI and runtime must consume the plan through one normalized read helper or service, not by reconstructing it ad hoc from scattered work items.
- The plan read contract must merge the durable decomposition artifact with the latest execution status, evidence references, and reviewer / owner assignments for each step.
- The plan record should remain versioned so retries and repairs can update the same plan identity without losing history.

### Why this is first

The stakeholder explicitly wants the system to stop treating incoming work as one giant prompt. A plan-first step is required so the system can split the work, assign personas, and establish review/evidence rules before any execution begins.

### Implementation notes

- Reuse the existing planning-directory workflow as the blueprint for a durable plan artifact.
- If the runtime needs to persist the plan in the product DB later, keep the initial shape compatible with a document-based plan record.
- Make the plan readable by both humans and agents.
- Likely files:
  - planning artifacts under `specs/feature/096-goal-driven-auto-team-automation/`
  - any planning service used to persist work decomposition if one already exists
  - tests that validate the plan artifact shape and review requirements

## 2. Durable runtime state and evidence model

### What to build

- Add a durable runtime-state payload that can express richer run phases than the coarse `team_runs.status` enum.
- Use the existing `runSnapshots` table as the primary durable snapshot layer for these richer runtime states instead of overloading `team_runs.status` immediately.
- Extend the snapshot contract so it can persist:
  - current runtime phase
  - waiting reason
  - next poll time
  - risk class
  - reviewer persona
  - verification status
  - evidence references
  - job handle metadata
- Preserve the existing terminal lifecycle on `team_runs.status` (`queued`, `running`, `paused`, `completed`, `failed`, `stopped`) for compatibility.
- Make snapshot capture include the new runtime state so the current run can always be reconstructed from durable records.

### Decision: Work OS sync failure policy

- Work OS remains the business-facing mirror for intake-originated work, but the system must not silently diverge if a mirror write fails.
- If a Work OS projection update fails, the runtime must record a sync failure state and keep the execution overlay authoritative for the run itself.
- The bridge should retry idempotently on the next meaningful transition, snapshot, or polling cycle.
- If the same transition repeatedly fails to project, the run should surface a blocked or exception state with the sync error attached instead of claiming the business projection is current.
- A terminal run transition must not be considered fully settled in the operator surface until the corresponding Work OS write-back has either succeeded or been explicitly marked as blocked or escalated.

### Why this is first

The rest of the feature needs a durable place to write and read the current automation state. The codebase already has `runSnapshots`, so it is the cleanest place to hold the richer runtime overlay without forcing a disruptive enum migration as the first step.

### Implementation notes

- Reuse the snapshot pattern already in `monitoringService.captureSnapshot()`.
- Keep `team_runs.status` as the compatibility layer while the richer runtime overlay is read from the latest snapshot.
- Store state in a shape that can be consumed by both backend decision logic and UI status surfaces.
- Keep evidence references deep and durable, not ephemeral.
- Likely files:
  - `apps/web/drizzle/schema.ts`
  - `apps/web/server/services/monitoringService.ts`
  - `apps/web/server/services/runEngine.ts`
  - `apps/web/server/routers/teamRun.ts`

## 3. Goal-driven orchestration loop and stop-policy integration

### What to build

- Refactor the continuation logic in `runEngine.ts` so `auto_team` continues based on goal progress rather than a short fixed turn budget.
- Keep stop-policy checks, but make them a safety boundary rather than the primary driver of continuation.
- Make the loop evaluation ask:
  - is the objective complete?
  - is there still an actionable automated step?
  - is the run waiting on a worker result?
  - is a human approval boundary actually required?
  - is the run repeating without meaningful progress?
- Remove any assumption that a small initial burst of turns is enough for correctness.
- Preserve user pause / resume / stop semantics, but separate them from async waiting.

### Why this matters

This is the core behavioral change. Without a goal-driven loop controller, the rest of the feature would still feel like a conservative assistant loop with a few more states.

### Implementation notes

- Keep the existing `startRun`, `resumeRun`, `advanceRun`, and `runNextTurn` entry points, but change how they decide whether to queue the next action.
- Reuse the existing `shouldContinueAutoTeamLoop()` and `evaluateAutoTeamLoopDecision()` concepts, but expand them to inspect goal completion, waiting states, and risk gates.
- Avoid breaking the rest of the team run lifecycle while changing the auto loop behavior.
- Track loop progress at the run level and the work-item level so the controller can distinguish “still making progress” from “spinning”.
- Likely files:
  - `apps/web/server/services/runEngine.ts`
  - `apps/web/server/routers/teamRun.ts`

## 4. Async worker dispatch, polling, and completion lifecycle

### What to build

- Introduce a clear contract for async work handles used by automation steps.
- Use existing async patterns from skills, media generation, and worker callbacks as the implementation model.
- Persist the job handle and job state on the relevant work item or runtime snapshot when a step is delegated externally.
- Add a polling/resume path that:
  - checks the external job state
  - updates durable status and evidence when the job completes
  - retries polling until the job finishes or hits a policy boundary
  - avoids duplicate completion writes
- Make the polling path idempotent and safe to re-run.

### Why this matters

The spec explicitly distinguishes “waiting for a job result” from “waiting for a person”. The implementation needs a durable job lifecycle so the engine can keep moving once the external worker finishes.

### Implementation notes

- Reuse existing worker/job patterns where possible instead of inventing a parallel async system.
- The codebase already has strong precedents in:
  - `skillExecutor.startPythonSkillTask()`
  - `mediaJobs` polling enqueue
  - `workerCallbackService`
- Keep job handles attached to the originating run and work item so evidence and replay remain auditable.
- Make completion transitions update evidence, review state, and next-step eligibility together.
- Likely files:
  - `apps/web/server/services/skillExecutor.ts`
  - `apps/web/server/routers/mediaJobs.ts`
  - `apps/web/server/services/workerCallbackService.ts`
  - `apps/web/server/services/runEngine.ts`

## 5. Verification, reviewer routing, risk classes, and escalation

### What to build

- Add a verification contract that every step must satisfy before the engine can advance.
- Make the engine persist proof that the step passed verification.
- Route each step through a reviewer persona that matches the step type and risk class.
- Use the risk classes defined in the spec:
  - `low`
  - `medium`
  - `high`
  - `critical`
- Use the risk-to-reviewer matrix to decide the default reviewer:
  - low -> technical reviewer or domain persona
  - medium -> technical reviewer plus QA/validator
  - high -> safety or policy persona
  - critical -> human approval with safety oversight
- Add a repair loop that re-runs verification after correction when a step fails.
- Escalate to human approval only for the safety-critical and policy-gated cases from the escalation policy.

### Why this is central

This feature is not just about continuing longer. It is about continuing correctly. The workflow must not trust a single pass from the worker that produced the step.

### Implementation notes

- Reuse existing `team_work_items` fields for `riskClass`, `approvalState`, reviewer IDs, approver IDs, and worker job fields where possible.
- Reuse durable artifact writeback patterns from adjacent automation flows so every completed step leaves evidence behind.
- Add explicit reviewer selection helpers rather than scattering persona logic through multiple services.
- Make failure paths produce explainable reasons that can be surfaced in UI and logs.
- Likely files:
  - `apps/web/server/services/runEngine.ts`
  - `apps/web/server/services/workAutomationExecutionService.ts`
  - `apps/web/server/services/workItemService.ts`
  - `apps/web/server/services/monitoringService.ts`

## 6. Runtime status projection and UI visibility

### What to build

- Expose the richer runtime state through read models so the UI can show what the run is actually doing.
- Update the `teamRun.get` response path to include the latest runtime snapshot or a derived view of it.
- Keep the Work OS case / request projection synchronized with the team run overlay so the business-facing status never contradicts the execution-facing status.
- Write state transitions back into Work OS events, case status, task status, or exception state using the same underlying run identity.
- Treat Work OS as the canonical business-facing projection when the work originates from intake, request, or case routing flows.
- Keep the execution overlay and Work OS projection on a deterministic mapping table so the same state means the same thing in both systems.
- Update status displays on the main team surfaces so they can show:
  - running
  - waiting for worker
  - waiting for poll
  - awaiting human approval
  - blocked
  - completed
  - failed
- Surface the waiting reason, next poll hint, and human approval reason where available.
- Keep user-facing “paused” language reserved for explicit pause conditions, not generic async waiting.

### Why this matters

The spec asks for visible status clarity. If the engine changes but the UI still shows only a vague paused/running distinction, the new behavior will be hard to trust and operate.

### Implementation notes

- Existing UI surfaces already invalidate `teamRun.get`:
  - `Teams.tsx`
  - `TeamRoomView.tsx`
  - `RoomWorkflowPanel.tsx`
- Extend those surfaces to read the richer runtime projection and render the new waiting / review / blocked language.
- Make sure any status displayed in Teams matches the mirrored Work OS projection for the same case.
- Keep the visual language consistent with the existing team/workflow UI instead of inventing a new product shell.
- Use the snapshot overlay as the source of truth for transient runtime state.
- When work originates in Work OS, derive the Team plan from the Work OS case/request objective and preserve the same case identity through planning, execution, repair, and completion.
- If Work OS write-back or status mirroring fails, surface a sync warning and keep the run in a blocked or exception-friendly state until the bridge recovers or a human overrides the failure.
- Likely files:
  - `apps/web/client/src/pages/Teams.tsx`
  - `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
  - `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
  - `apps/web/server/services/workOsService.ts`
  - `apps/web/client/src/pages/__tests__/Teams.test.tsx`
  - `apps/web/client/src/pages/__tests__/AutonomousTeamMonitor.test.tsx`

## 7. Teams UI plan visibility and continuous plan inspection

### What to build

- Add a Teams page plan panel or equivalent view that shows the current plan continuously.
- Make the plan view display, at minimum:
  - the goal or topic being worked on
  - the subtask breakdown
  - the owner of each subtask
  - the reviewer of each subtask
  - the current status of each subtask
  - the evidence already written
  - the remaining verification criteria
- Keep the plan visible while the run is executing, waiting, blocked, or being reviewed.
- Make the plan state refreshable so operators can inspect it at any time without waiting for the run to finish.
- Prefer a design that uses the existing Teams workflow surfaces instead of creating a separate planning product.
- Keep the plan panel tied to the durable plan artifact, not only to transient runtime state.
- Make each step visibly trackable as owner, reviewer, status, evidence, and remaining verification criteria.
- Treat plan visibility as a live operator surface that refreshes alongside the run detail and room workflow panels.

### Why this matters

The stakeholder wants the system to be inspectable at all times. The team must be able to see not only runtime status, but also the planned path, ownership, review chain, and completion evidence while the run is in flight.

### Implementation notes

- The plan view should be fed by the durable plan artifact introduced in section 1.
- Keep the UI readable enough that operators can reason about ownership and next steps at a glance.
- The plan panel should make the current stage obvious:
  - still planning
  - executing
  - waiting on review
  - waiting on worker result
  - blocked
  - ready for next step
- The plan panel should also show whether the latest Work OS mirror write is synced, pending, or failed when the work originated from intake.
- Likely files:
  - `apps/web/client/src/pages/Teams.tsx`
  - `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
  - `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
  - `apps/web/client/src/pages/__tests__/Teams.planVisibility.test.tsx` or equivalent Teams tests
  - any plan-read service or query used to surface the durable plan

## 8. Tests, compatibility, and rollout

### What to build

- Add unit tests for the new loop decisions, state projection, review routing, escalation, and polling behavior.
- Extend existing `runEngine` tests instead of replacing them.
- Add snapshot/schema tests so the new runtime fields are covered.
- Add service tests for the polling and evidence writeback paths.
- Add UI tests for the new visible waiting states and reasons.
- Preserve compatibility with existing paused/running/completed flows and existing callers of `teamRun.get`.

### Why this is last

The core model and control logic need to be defined before broadening test coverage and rollout paths.

### Implementation notes

- Use the existing Vitest test style already present in `apps/web/server/services/__tests__` and the frontend component test patterns.
- Favor additive changes that do not break the existing run lifecycle.
- If a compatibility shim is needed, keep it thin and document the migration path clearly.
- Treat run snapshot and status compatibility as a first-class requirement so the new behavior can be introduced safely.
- Likely files:
  - `apps/web/server/services/__tests__/runEngine.test.ts`
  - `apps/web/server/services/__tests__/runEngine.migration.test.ts`
  - `apps/web/server/services/__tests__/monitoringService.test.ts`
  - `apps/web/server/services/__tests__/workerCallbackService.test.ts`
  - `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts`
- `apps/web/server/services/__tests__/teamRunIntegration.test.ts`
- `apps/web/client/src/pages/__tests__/Teams.test.tsx`
- `apps/web/client/src/pages/__tests__/AutonomousTeamMonitor.test.tsx`
- `apps/web/client/src/pages/__tests__/Teams.planVisibility.test.tsx` or the existing Teams test suite
- Work OS sync failure handling should be rolled out together with the runtime overlay so operators never see a state that looks settled when the mirror write failed.

## Acceptance Criteria

- Every incoming topic/objective/spec is decomposed into a documented plan before execution begins unless the task is trivially small and policy allows a direct pass.
- The plan records subtask ownership, reviewer ownership, verification method, and repair-loop rules.
- Work that can be safely split by persona, dependency, or surface is split before execution rather than being sent as one large prompt.
- `auto_team` runs goal-driven rather than short-turn-driven.
- The system keeps work inside automation unless human approval is truly required.
- Every step has a verification method, durable evidence, and persona-appropriate review.
- Low and medium risk work remain in automation first.
- High and critical risk work are gated by safety policy and human approval where required.
- The system escalates immediately only for explicitly safety-critical or policy-gated cases.
- Async worker tasks are polled until completion and then resume the workflow automatically.
- The user can see clear runtime states and reasons instead of a vague paused/running split.
- Work OS projection failures surface a blocked or exception state instead of silently diverging from the run overlay.
- Existing run lifecycle behavior remains compatible for current callers and historical data.
