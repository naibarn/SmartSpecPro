# Section 02: Goal-Driven Orchestration Loop

## Goal

Refactor `auto_team` so it continues based on goal progress instead of a short fixed turn budget.

This section owns the control loop that decides whether the run should:

- continue immediately
- wait for a worker
- wait for a poll
- pause for human approval
- stop due to policy or anomaly

## What This Section Must Change

### 1. Loop decision helpers

Expand the existing auto-loop decision helpers in `runEngine.ts` so they evaluate goal progress, not just turn count.

The loop should consider:

- whether the objective is complete
- whether there is actionable work left
- whether current work is waiting on a worker result
- whether a human approval boundary is actually required
- whether the run is spinning without progress

### 2. Continuation logic

Change `startRun`, `resumeRun`, `advanceRun`, and any queue/auto-advance helpers so `auto_team` can continue until the run is actually done or blocked.

The control flow should no longer assume that a small initial burst of turns is enough to finish the job.

### 3. Stop-policy integration

Stop policies remain important, but they should act as guardrails rather than the primary engine of continuation.

The loop should still respect:

- maximum duration
- budget
- idle timeout
- explicit stop flags
- anomaly / no-progress signals

### 4. Run-state transitions

Use the runtime overlay to distinguish:

- active execution
- waiting on a worker
- waiting on a poll
- awaiting human approval
- blocked

Do not collapse every non-running condition into the same coarse paused state unless the pause was explicitly user-initiated.

## Files Likely Touched

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/services/__tests__/runEngine.test.ts`
- `apps/web/server/services/__tests__/teamRunIntegration.test.ts`

## Implementation Notes

- Reuse the current `runEngine` entry points instead of replacing them.
- Add helper functions for progress detection and loop continuation.
- Keep the control logic deterministic and testable with unit tests.
- The control loop should stay compatible with the existing team-run lifecycle and event emission.

## Completion Criteria

- `auto_team` keeps going while there is still actionable progress.
- The run can switch between active and waiting states without losing context.
- Existing pause/resume/stop behavior still works for user-driven intervention.
- Loop continuation decisions are explainable and testable.

## Implementation Notes (Current Slice)

- `apps/web/server/services/runEngine.ts` now treats actionable goal progress as a valid continuation signal even before the turn counter has warmed up.
- `evaluateAutoTeamLoopDecision()` still pauses for true human or external dependencies, but it no longer depends only on the initial burst of turns to keep the loop alive.
- `apps/web/server/services/__tests__/runEngine.test.ts` now includes a regression for continuation when goal progress exists at turn zero.
