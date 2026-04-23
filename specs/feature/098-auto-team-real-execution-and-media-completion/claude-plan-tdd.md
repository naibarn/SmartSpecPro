# TDD Plan: Feature 098 Auto-Team Real Execution and Media Completion

## Testing Strategy

Write tests before implementation for each layer. The tests must fail against the current behavior where media objectives can route to generic writing, messages can float without work items, and runs can stop without route-specific evidence.

Primary command:

```bash
npm --prefix apps/web test -- <target test files>
```

Typecheck command:

```bash
npm --prefix apps/web run check
```

## Section 01: Schema and Contracts

### New/Updated Test Files

- `apps/web/shared/__tests__/autoTeamExecution.test.ts`
- `apps/web/drizzle/__tests__/autoTeamExecutionSchema.test.ts`

### Tests

1. Route class constants include `media.video`, `media.image`, `agency.swarm`, `workflow.automation`, `research.synthesis`, `document.writing`, and `unknown.blocked`.
2. Stage statuses include queued/running/waiting/review/failure/cancel states required by the spec.
3. Required evidence helper returns media job requirements for video/image routes.
4. Required evidence helper rejects prompt-only completion for media routes.
5. Schema exports all new tables with tenant, room, run, route, stage, job, review, and final-result fields.
6. Schema contains indexes and unique constraints for idempotency keys.
7. Schema exports `auto_team_trace_events` with monotonic sequence/idempotency constraints.
8. Schema exports `auto_team_artifact_refs` with tenant, stage, artifact type, storage/external refs, content hash, visibility, and retention fields.
9. Shared contracts include timeout policy, provider decision, budget decision, access decision, trace event, and artifact ref types.
10. Shared contracts include artifact access decision and retention policy types for redacted artifact projections and cleanup control.
11. Route decision records include a frozen execution mode field so shadow/enforced/rollback cannot drift mid-run.

### Acceptance

- Contract tests can be used by server and client without server-only imports.
- Schema test verifies the migration and `schema.ts` stay aligned.

## Section 02: Route Policy and Family Gate

### New/Updated Test Files

- `apps/web/server/services/__tests__/autoTeamRoutePolicy.test.ts`
- `apps/web/server/services/__tests__/teamRunSkillExecutor.routeGate.test.ts`
- `apps/web/server/services/__tests__/autoTeamProviderPolicy.test.ts`

### Tests

1. A Songkran video objective classifies as `media.video`.
2. A generated image objective classifies as `media.image`.
3. A broad multi-agent objective classifies as `agency.swarm`.
4. Article/document writing skill is rejected for `media.video` as `route_skill_family_mismatch`.
5. Video prompt skills are allowed only as prompt/storyboard stages.
6. Video prompt skill without downstream media submit cannot satisfy completion evidence.
7. `executeUnified()` receives `capabilitiesAllowed` matching the route.
8. Unknown/unsafe objective returns `unknown.blocked` with a user-safe reason.
9. Explicit `veo 3.1` provider/model preference is preserved in provider decision.
10. Unavailable requested provider/model creates `provider_unavailable` or `model_not_entitled`, not text fallback.
11. Provider substitution is allowed only when policy permits and records requested and selected provider/model.

### Acceptance

- Current wrong route pattern (`writing.article` for video objective) fails the test.
- Route decision is deterministic for identical objective/request metadata.

## Section 03: Stage Engine and Run Loop

### New/Updated Test Files

- `apps/web/server/services/__tests__/autoTeamExecutionService.test.ts`
- `apps/web/server/services/__tests__/runEngine.autoTeamStages.test.ts`
- `apps/web/server/services/__tests__/teamRunIntegration.autoTeamCanonical.test.ts`
- `apps/web/server/services/__tests__/autoTeamTraceEventService.test.ts`
- `apps/web/server/services/__tests__/autoTeamStageTimeoutPolicy.test.ts`
- `apps/web/server/services/__tests__/promptComposer.enhanced.test.ts`
- `apps/web/server/services/__tests__/contextBuilder.test.ts`
- `apps/web/server/services/__tests__/contextEngineAdapter.test.ts`
- `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`
- `apps/web/server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts`
- `apps/web/server/routers/__tests__/teamRoom.test.ts`

### Tests

1. `startRun()` creates a route decision and route-specific stage plan.
2. Orchestrator persona owns kickoff for auto-team runs.
3. Every non-system execution message is posted with `workItemId`, `runId`, `stageId`, and route metadata.
4. Stage cannot complete without durable evidence.
5. `runNextTurn()` claims next stage idempotently.
6. `advanceRun()` refuses completion when required route evidence is missing.
7. Run snapshot projection includes route, current stage, blocked reason, and work item linkage.
8. Work OS mirror receives stage transitions.
9. Trace events allocate monotonic sequence numbers per run.
10. Replayed trace event idempotency key returns the same event and does not create duplicate downstream records.
11. Concurrent `runNextTurn()` calls claim only one runnable stage.
12. Expired stage claim can be reclaimed only after timeout policy allows it.
13. Stage timeout emits durable trace event and cannot approve or complete a stage.
14. Team prompt composition receives the shared context pack built from `initiatedByUserId`, current user message, room language, rule memories, project summaries, and scoped room/team/run/assistant memories.
15. `buildTeamContext()` forwards initiator, current message, and memory mode into the shared context-engine adapter rather than rebuilding memory selection locally.
16. Guided/manual Team room send starts or resumes a `team_chat` run and returns run metadata to the client while preserving the shared context pack contract.
17. `auto_team` room message capture does not silently auto-answer inline as if it were unrestricted chat.

### Acceptance

- The old failure case cannot reach `completed` by exhausting max rounds.
- Guided/manual Team turns use the shared context-engine contract from Feature 099 even if Team history storage remains room-based.

## Section 04: Media Job Lifecycle

### New/Updated Test Files

- `apps/web/server/services/__tests__/autoTeamMediaExecutionService.test.ts`
- `apps/web/server/services/__tests__/mediaRoutingIntegration.autoTeam.test.ts`
- `apps/web/server/services/__tests__/mediaJobIdempotency.autoTeam.test.ts`
- `apps/web/server/services/__tests__/autoTeamBudgetService.test.ts`
- `apps/web/server/services/__tests__/autoTeamSafetyService.test.ts`
- `apps/web/server/services/__tests__/autoTeamArtifactRefService.test.ts`

### Tests

1. Video route creates research, storyboard, prompt, media submit, media poll, review, and finalize stages.
2. Media submit creates exactly one `auto_team_media_job_refs` row for a stable idempotency key.
3. Retrying submit with same prompt/provider/model reuses unfinished job ref.
4. Polling updates the existing job ref and stage status.
5. Terminal provider success attaches result artifact refs.
6. Terminal provider failure marks stage blocked/failed with sanitized user message.
7. Provider unavailable or entitlement failure blocks the stage, not fake completion.
8. Image route either adapts synchronous result into a terminal job ref or uses async image job refs consistently.
9. Client-supplied provider token is ignored/rejected; server injects auth.
10. Unsafe media reference URLs are rejected by existing SSRF controls.
11. Budget preflight blocks media submit before provider call when credits/quota are insufficient.
12. Retried media submit reuses billing idempotency key and does not double-charge.
13. Prompt-injection content from uploaded/archived context is scrubbed before provider/LLM prompt.
14. Provider payload contains only minimum context and excludes unrelated Work OS notes/history/secrets.
15. Media output safety failure creates repair/human-review/block state and cannot finalize.
16. Canonical artifact refs are created for prompt, storyboard, media result, and final result with tenant-scoped access metadata.

### Acceptance

- Media route cannot complete without a media job ref and terminal media status.
- Duplicate provider submissions are prevented.

## Section 05: Agency Delegation and Complex Work

### New/Updated Test Files

- `apps/web/server/services/__tests__/autoTeamAgencyExecutionService.test.ts`
- `apps/web/server/services/__tests__/teamRunSkillExecutor.agencyCanonical.test.ts`

### Tests

1. Complex swarm objective routes to `agency.swarm`.
2. Agency delegation creates durable stage with agency run handle.
3. Agency status polling updates the same stage and run snapshot.
4. Agency terminal success requires reviewer and final-result record.
5. Agency terminal failure creates blocked/failure evidence.
6. Agency run IDs are tenant scoped.

### Acceptance

- Agency output is governed by the same evidence gate as media output.

## Section 06: Review, Finalization, and Loop Guards

### New/Updated Test Files

- `apps/web/server/services/__tests__/autoTeamReviewService.test.ts`
- `apps/web/server/services/__tests__/autoTeamCompletionEvidence.test.ts`
- `apps/web/server/services/__tests__/autoTeamLoopGuard.test.ts`

### Tests

1. Reviewer scores actual artifacts/job refs, not only objective text.
2. Score below threshold creates repair stage with reviewer comments.
3. Repair attempt references prior attempt and reviewer instructions.
4. Passing review creates review record but still waits for human approval when policy requires it.
5. Final result cannot be created without route-required evidence.
6. Repeated text-only media turns with no new evidence trigger loop guard.
7. Loop guard blocks or pauses run and exposes retry/cancel state.
8. Stop/cancel prevents further auto-advance and records terminal cancelled state.
9. Reviewer unavailable on media/image/agency route fails closed with `reviewer_unavailable`, backup reviewer, or human review.
10. Heuristic review cannot pass media/image/agency final review.
11. Human rejection carries reviewer score, human comment, failed artifact refs, and improvement instructions into repair/replan.

### Acceptance

- A media run that only has chat messages fails completion-evidence checks.

## Section 07: Work OS, Team UI, and Monitoring

### New/Updated Test Files

- `apps/web/server/services/__tests__/workOsService.autoTeamVisibility.test.ts`
- `apps/web/server/routers/__tests__/teamRunCanonicalSnapshot.test.ts`
- `apps/web/server/routers/__tests__/autoTeamAccessPolicy.test.ts`
- `apps/web/client/src/components/orchestrator/__tests__/TeamRoomView.autoTeamExecution.test.tsx`
- `apps/web/client/src/components/orchestrator/__tests__/RoomWorkflowPanel.canonicalStages.test.tsx`
- `apps/web/client/src/pages/__tests__/WorkRequest.languageAndEdit.test.tsx`
- `apps/web/server/routers/__tests__/scopedMemoryRouter.test.ts`
- `apps/web/server/services/__tests__/scopedMemoryService.test.ts`

### Tests

1. My Requests lists requests after they are assigned to a team room.
2. Work OS Console shows route, stage, media job, review, and final-result evidence.
3. Team room cards show room ID snippet, created date/time, language, and latest run status.
4. User can return to room list and switch rooms after opening a room.
5. Top room grid can collapse and current room identity remains visible in side/right panel.
6. Right work panel sections collapse independently.
7. Stop/cancel/retry controls call server mutations and reflect disabled/loading states.
8. `/work/request` has English/Thai language toggle with English default.
9. Created room stores selected language and the run snapshot exposes it.
10. Editing a not-started request opens the original request details.
11. Request owner, team member, reviewer, and tenant admin receive only allowed evidence/actions.
12. Non-member and cross-tenant copied links cannot read room/run/stage/job/review/final/debug data.
13. Debug snapshots expose raw diagnostics only to users with admin/debug permission.
14. Scoped memory create/search/update/delete/promote rejects room/team/project/run access that the caller does not actually own or participate in.
15. Guided/manual room UX reflects that sends trigger run-backed assistant work, not persist-only logging.
16. Artifact read/download endpoints require the shared access helper and return redacted projections when the caller lacks explicit artifact-read permission.

### Acceptance

- UI tests prove the request does not disappear and users can identify/switch the latest room.
- Access tests prove scoped memory is protected by actual membership/ownership, not tenant scope alone.
- Artifact access tests prove raw storage refs are server-only and deep links do not leak cross-tenant existence.

## Section 08: Backfill, Rollout, Debugging, and E2E

### New/Updated Test Files

- `apps/web/server/services/__tests__/autoTeamBackfill.test.ts`
- `apps/web/server/services/__tests__/autoTeamDebugSnapshot.test.ts`
- `apps/web/server/services/__tests__/autoTeamRolloutFlag.test.ts`
- `apps/web/server/services/__tests__/teamRunSongkranVideo.e2e.test.ts`
- `apps/web/server/services/__tests__/autoTeamMigrationRollback.test.ts`

### Tests

1. Legacy message-derived records are marked `legacy_unverified`.
2. Legacy rooms can be retried into a new canonical run.
3. Feature flag disabled preserves legacy behavior while writing shadow records if configured.
4. Feature flag enabled enforces route gate and completion evidence.
5. Debug snapshot returns route, stages, messages, media jobs, reviews, final result, and sanitized errors for one room/run.
6. End-to-end Songkran video happy path reaches final result with media job and review evidence.
7. End-to-end misroute attempt is blocked before generic writing can complete the run.
8. Migration verification confirms all new tables/indexes and prior Work OS automation columns exist.
9. Rollback/flag-disable mode preserves read-only visibility of canonical records without enforcing new execution on legacy runs.
10. Debug snapshot identifies whether the run is shadow, enforced, rollback, or legacy unverified.
11. Run mode is frozen at route-decision creation and cannot change mid-run even if feature flags toggle later.
12. Retention cleanup archives or purges expired prompts, provider payloads, generated assets, trace data, and artifact refs idempotently without mutating live run state.
13. Backfill tooling rejects implicit privilege escalation and only accepts trusted operator/admin/debug callers for legacy reconstruction.
14. Room-health/context-engine monitoring views reject non-participants and non-admins even within the same tenant.
15. Retention cleanup best-effort purges provider-side assets when supported and always scrubs local refs before deletion.

### Acceptance

- A single debug command/query can explain why a run is waiting, blocked, failed, or complete.
- Mode-freeze tests prove in-flight runs keep their original enforcement mode.
- Retention tests prove cleanup is idempotent, tenant-scoped, and preserves debug readability.
- Access tests prove room-health monitoring is room-participant or admin scoped rather than tenant scoped.

## Manual Verification Scenarios

1. Create a Work OS request for a 24-30 second Songkran video, Thai language, selected creative team.
2. Start automation and confirm a new room is created with Thai language.
3. Confirm kickoff is from orchestrator persona.
4. Confirm route is `media.video` and article skills are not selected as primary execution.
5. Confirm research/storyboard/prompt artifacts appear.
6. Confirm media video job ref appears and updates status.
7. Confirm Work OS and My Requests still show the request.
8. Confirm reviewer score/comment appears after result.
9. Confirm final result appears or blocked reason is clear.
10. Confirm stop/cancel prevents further messages.
11. In a guided/manual Team room, send a follow-up and confirm it starts or resumes a `team_chat` run.
12. Confirm the follow-up reply respects room language and prior user/project/team context.
13. Confirm a user who is not a member of the room/team cannot read or mutate its scoped memory.

## Non-Regression Scenarios

- Existing manual rooms still load.
- Existing team run tests still pass.
- Existing media provider tests still pass.
- Existing Work OS automation fabric tests still pass.
- No cross-tenant route/stage/job/review/final-result read succeeds.
- No cross-tenant trace/debug/artifact read succeeds.
- No same-tenant-but-unrelated room/team/project/run scoped-memory access succeeds.
- Provider payload redaction excludes unrelated Work OS context and secrets.
- Budget and billing idempotency prevents duplicate charges on retry.
- UI remains usable on desktop and responsive widths.
