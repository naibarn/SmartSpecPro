# Section 03: Stage Engine and Run Loop

## Goal

Add the canonical Auto-Team execution service and integrate it into the run engine so every meaningful Auto-Team action is tied to a route decision, durable stage, work item, and room message metadata.

## Dependencies

- Section 01 schema/contracts
- Section 02 route policy/family gate

## Files to Create or Modify

- Create `apps/web/server/services/autoTeamExecutionService.ts`
- Create `apps/web/server/services/autoTeamTraceEventService.ts`
- Create `apps/web/server/services/autoTeamStageTimeoutPolicy.ts`
- Modify `apps/web/server/services/runEngine.ts`
- Modify `apps/web/server/services/roomService.ts` only if message metadata needs typed helpers
- Modify `apps/web/server/services/workOsService.ts` for minimal mirror/projection hooks
- Modify `apps/web/server/routers/teamRun.ts` if run snapshot endpoint needs canonical data
- Modify `apps/web/server/services/promptComposer.ts`
- Modify `apps/web/server/services/executors/contextBuilder.ts`
- Modify `apps/web/server/services/teamRunSkillExecutor.ts`
- Create `apps/web/server/services/teamRoomMemoryService.ts`
- Modify `apps/web/server/routers/teamRoom.ts`
- Create `apps/web/server/services/__tests__/autoTeamExecutionService.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamTraceEventService.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamStageTimeoutPolicy.test.ts`
- Create `apps/web/server/services/__tests__/runEngine.autoTeamStages.test.ts`
- Create `apps/web/server/services/__tests__/teamRunIntegration.autoTeamCanonical.test.ts`
- Modify `apps/web/server/services/__tests__/promptComposer.enhanced.test.ts`
- Modify `apps/web/server/services/__tests__/contextBuilder.test.ts`
- Modify `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`
- Modify `apps/web/server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts`
- Modify `apps/web/server/routers/__tests__/teamRoom.test.ts`

## TDD First

Write failing tests for:

- `startRun()` creates or reuses a route decision by idempotency key
- `startRun()` creates route-specific stage rows
- kickoff uses the team orchestrator persona as assistant sender when a persona is available
- non-system execution messages include `workItemId`, `runId`, `stageId`, and `routeClass`
- `claimNextStage()` returns the next runnable stage and is idempotent
- a stage cannot move to `completed` without evidence or an explicit terminal failure/block reason
- `advanceRun()` refuses completed status when `autoTeamCompletionEvidence` says evidence is missing
- stage changes are mirrored into Work OS projection metadata
- max rounds cannot be treated as successful completion for media routes
- trace events allocate monotonic sequence numbers per run
- repeated logical trace transition reuses idempotency key and does not duplicate events
- concurrent `runNextTurn()` calls claim only one stage
- expired claim can be reclaimed only after timeout policy allows it
- stage timeout emits durable trace event and visible blocked/waiting state
- prompt composition receives `initiatedByUserId`, current user message, room language, rule memories, project summaries, and scoped assistant/run/room/team memories
- guided/manual room send starts or resumes a `team_chat` run and returns run metadata to the client
- `auto_team` room message capture does not silently auto-answer inline as if it were unrestricted chat

## Service Design

Create `autoTeamExecutionService.ts` with functions:

- `ensureRouteDecision(input)`
- `ensureStagePlan(input)`
- `claimNextRunnableStage(input)`
- `markStageInProgress(input)`
- `markStageCompleted(input)`
- `markStageBlocked(input)`
- `markStageFailed(input)`
- `markStageCancelled(input)`
- `attachStageEvidence(input)`
- `postStageUpdate(input)`
- `getRunSnapshot(input)`
- `mirrorStageToWorkOs(input)`
- `assertCanCompleteRun(input)`
- `emitTraceEvent(input)` through `autoTeamTraceEventService`
- `evaluateStageTimeout(input)` through `autoTeamStageTimeoutPolicy`

All functions must require `tenantId`. Never load a room/run/stage by ID alone.

## Stage Plan Creation

Use Section 02 route policy to create default plan steps.

For `media.video`:

1. `route`
2. `plan`
3. `research`
4. `storyboard`
5. `prompt`
6. `media_submit`
7. `media_poll`
8. `review`
9. `human_approval` when policy requires
10. `finalize`

For `media.image`:

1. `route`
2. `prompt`
3. `media_submit`
4. `media_poll`
5. `review`
6. `human_approval` when policy requires
7. `finalize`

For `agency.swarm`:

1. `route`
2. `plan`
3. `agency_delegate`
4. `review`
5. `human_approval` when policy requires
6. `finalize`

For research/document/workflow routes, create the corresponding smaller plan, but still require review/finalize.

## Run Engine Integration

In `startRun()`:

1. Resolve tenant/team/room/run/work request context.
2. Call `ensureRouteDecision()`.
3. Call `ensureStagePlan()`.
4. Create or attach kickoff work item.
5. Post kickoff through `postStageUpdate()` with orchestrator persona.
6. Capture run snapshot that includes canonical execution summary.

In `runNextTurn()`:

1. Load canonical run snapshot.
2. Claim next runnable stage.
3. Resolve assigned persona for that stage.
4. Execute through the route-specific handler.
5. Attach evidence before posting success message.
6. Mirror stage state to Work OS.
7. Recompute completion evidence.

In guided/manual Team rooms:

1. `teamRoom.sendMessage({ autoRespond: true })` starts or resumes a `team_chat` run.
2. The latest user message becomes the next turn's `currentMessage`.
3. Prompt composition receives `initiatedByUserId`, room language, `projectId` when available, and Team-scoped memory sources.
4. The assistant reply is emitted as a run-backed room message, not a persist-only log entry.

In `auto_team` rooms:

1. user messages may be captured as continuity context
2. they do not silently switch the room into unrestricted free chat
3. automation remains governed by the stage/run loop and room controls

## Team Memory Continuity

Team execution does not need to reuse the exact `conversationId` storage model from Chat, but it must reuse the same durable memory sources that materially affect correctness:

- user entity memories
- user rule memories
- project continuity summaries
- scoped assistant memories
- scoped run memories
- scoped room memories
- scoped team memories
- selected room language

Assistant turns must persist new room/team/run scoped memories so later turns can recover continuity without relying on free-form room history alone.

## Stage Claiming and Concurrency

Use database-backed claiming. Do not rely on process memory.

Required strategy:

- stage claim uses one transaction or conditional update from `queued`/retryable status to `in_progress`
- store `claimToken`, `claimedBy`, and `claimExpiresAt` in dedicated columns or typed metadata
- only the worker with the current claim token can complete, block, fail, or cancel that claim
- if a claim expires, another worker can reclaim according to timeout policy
- provider submit still performs idempotency lookup after claim to prevent duplicate paid work

Tests must simulate two concurrent `runNextTurn()` calls and assert one stage claim, one stage execution, and one provider/agency submit.

## Durable Trace Events

Every important transition must call `autoTeamTraceEventService`.

Events required in this section:

- `automation.run.started`
- `route.decision.created`
- `stage.created`
- `stage.claimed`
- `stage.timeout`
- `stage.completed`
- `stage.blocked`
- `stage.failed`
- `run.blocked`
- `run.completed`
- `run.cancelled`

Trace events must:

- include `tenantId`, `teamId`, `roomId`, `runId`, `stageId`, `workItemId`, `routeClass`, source component, and idempotency key when available
- allocate monotonic sequence per run
- be idempotent for retried logical transitions
- redact sensitive metadata before persistence

## Stage Timeout Policy

Use `autoTeamStageTimeoutPolicy.ts` for deadlines.

Default budgets:

- route decision: 30 seconds
- plan artifact creation: 2 minutes
- research brief: 5 minutes
- storyboard: 5 minutes
- prompt generation: 3 minutes
- media job creation: 2 minutes
- media job polling: provider policy or 30 minutes default
- step review: 5 minutes
- final review: 5 minutes
- human final approval: 5 minutes
- Work OS mirror update: 1 minute

Timeout behavior:

- timeout cannot approve, complete, or finalize a stage
- transient provider timeouts may retry with backoff and jitter
- repeated timeouts create repair work or block according to policy
- timeout writes a trace event and updates run snapshot for UI

In stop policy logic:

- `maxRounds` can stop a run as `blocked` or `failed`, but not `completed`, unless completion evidence exists.
- `stopOnArtifactReady` is not enough for media routes unless the artifact is the route-required final artifact and job/review evidence exists.

## Message Attachment Rules

Every non-system message from Auto-Team execution must include in `metadataJson`:

- `autoTeam: true`
- `routeClass`
- `stageId`
- `stageType`
- `runId`
- `workItemId`
- `routeDecisionId`
- `planStepKey`
- `selectedSkillId` when known
- `capabilityFamily` when known

Also pass `workItemId` and `artifactRefsJson` through existing `postWorkUpdate()` parameters when available.

System-only messages may omit `workItemId`, but must still include `runId` and `stageId` when they describe an execution stage.

## Work Item Rules

- Create or reuse work items for stage groups.
- Stage rows must point to the current work item.
- Work item status must reflect stage state:
  - active stage -> `in_progress`
  - review stage -> `in_review`
  - repair stage -> `needs_revision`
  - waiting human -> `awaiting_approval`
  - blocked stage -> `blocked`
  - final success -> `completed`
  - terminal failure -> `failed`
  - cancel -> `cancelled`

## Work OS Mirror

This section only needs a minimal backend mirror, enough for later UI:

- update linked work case automation fields when route/stage changes
- expose current route/stage in `WorkInboxCase` or equivalent projection
- keep assigned requests visible by linking request, case, room, and run

Section 07 will finish UI display.

## Idempotency

- `ensureRouteDecision()` must not create duplicates.
- `ensureStagePlan()` must not create duplicate stages for the same `(tenantId, runId, planStepKey, attempt)`.
- `claimNextRunnableStage()` must be safe if auto-advance is called twice.
- Message posting must not be the idempotency source. Stage records are the source.

## Security Requirements

- Every query includes `tenantId`.
- Verify `roomId`, `teamId`, and `runId` belong together.
- Do not use room message text as completion evidence.
- Sanitize stage error messages before posting room updates.
- Do not store provider secrets in metadata.
- Guided/manual Team room sends must not degrade to persist-only behavior when an assistant reply is expected.

## Acceptance Criteria

- Starting an Auto-Team run creates route decision and stage plan.
- Every execution turn can be traced to a stage and work item.
- A media run cannot complete by max rounds or text-only output.
- Work OS has enough state to show route/current stage.
- Guided/manual Team chat remains supported, but sends now start or resume a run-engine-backed `team_chat` turn instead of behaving like write-only persistence.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/autoTeamExecutionService.test.ts server/services/__tests__/runEngine.autoTeamStages.test.ts server/services/__tests__/teamRunIntegration.autoTeamCanonical.test.ts server/services/__tests__/promptComposer.enhanced.test.ts server/services/__tests__/contextBuilder.test.ts server/services/__tests__/teamRunSkillExecutor.test.ts server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts server/routers/__tests__/teamRoom.test.ts
npm --prefix apps/web run check
```
