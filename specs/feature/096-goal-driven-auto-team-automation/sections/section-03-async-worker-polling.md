# Section 03: Async Worker Dispatch, Polling, and Completion

## Goal

Make delegated work behave like real async automation rather than a human-blocking pause.

This section owns the job-handle and polling lifecycle for:

- skills
- agency swarm work
- image generation
- video generation
- other worker-backed automation steps that return later

## What This Section Must Change

### 1. Job handle contract

Define how the automation engine stores and reads a job handle for delegated work.

The handle should carry enough information to answer:

- what worker or provider owns the job
- what work item or run it belongs to
- what state the job is currently in
- when it was last checked
- when it should be checked next

### 2. Polling behavior

Add a poll/resume path that checks the job state and reacts appropriately:

- continue polling while the job is still in progress
- mark completion when the job reaches a terminal success state
- mark failure when the job reaches a terminal failure state
- stop polling when the run no longer needs the result

Polling must be idempotent.

### 3. Integration points

Reuse the current async patterns already present in the codebase rather than introducing a parallel job system.

The most important integration points are:

- `skillExecutor` task handles
- `mediaJobs` polling dispatch
- `workerCallbackService`
- `runEngine` auto-advance scheduling

### 4. Result propagation

When an async job completes, the result should:

- update the durable work item or runtime overlay
- write evidence that the step completed
- make the next workflow step eligible to start immediately

The completion step should not require a human just because the job was async.

## Files Likely Touched

- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/routers/mediaJobs.ts`
- `apps/web/server/services/workerCallbackService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/__tests__/workerCallbackService.test.ts`
- `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`

## Implementation Notes

- Keep the job-handling logic compatible with existing Redis / Cloud Tasks / callback patterns.
- Make duplicate completions safe.
- Keep polling and resuming separate from human approval logic.
- The implementation should allow the orchestration loop to keep moving once the async result lands.
- The current slice adds reusable async job handle builders in `apps/web/server/services/asyncJobHandle.ts`, surfaces worker job handles through `workflowWorkerRuntimeService`, and returns pollable handles for media jobs so callers can reason about terminal vs waiting states without inventing a second job model.

## Completion Criteria

- Async work is tracked with durable job handles.
- The system polls until completion or terminal failure.
- Completed async work resumes the workflow automatically.
- Polling is safe to repeat and does not duplicate side effects.
