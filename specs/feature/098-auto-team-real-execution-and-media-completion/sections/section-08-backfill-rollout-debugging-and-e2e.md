# Section 08: Backfill, Rollout, Debugging, and E2E

## Goal

Finish the feature safely with rollout controls, legacy handling, debug tooling, and end-to-end tests that prove Auto-Team can complete real media work and block the old failure mode.

## Dependencies

- Sections 01 through 07

## Files to Create or Modify

- Create `apps/web/server/services/autoTeamBackfillService.ts`
- Create `apps/web/server/services/autoTeamDebugSnapshotService.ts`
- Create `apps/web/server/services/autoTeamRetentionService.ts`
- Modify feature flag/config module used by server services
- Modify Work OS/Team routers to expose debug snapshots to authorized users
- Create optional script `apps/web/scripts/debug-auto-team-room.ts`
- Create `apps/web/server/services/__tests__/autoTeamBackfill.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamDebugSnapshot.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamRolloutFlag.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamMigrationRollback.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamRetention.test.ts`
- Create `apps/web/server/services/__tests__/teamRunSongkranVideo.e2e.test.ts`

## TDD First

Write failing tests for:

- legacy-derived records are marked `legacy_unverified`
- legacy rooms can be retried into a new canonical run
- feature flag disabled preserves current execution while optionally writing shadow records
- feature flag enabled enforces route gate and completion evidence
- debug snapshot explains route/stage/job/review/final state for a room/run
- Songkran video happy path produces media job, review, and final result
- old misroute pattern is blocked before generic writing can complete the run
- migration verification confirms new canonical tables/indexes and prior Work OS automation columns exist
- rollback/flag-disable mode preserves read-only visibility of canonical records while disabling enforcement for new legacy-compatible runs
- debug snapshot shows whether a run is shadow, enforced, rollback, or legacy unverified
- guided/manual Team room follow-up starts or resumes a `team_chat` run with language and continuity context
- scoped-memory access verification proves same-tenant-but-unrelated users cannot read or mutate room/team/project/run memory
- run mode is frozen at route-decision creation and cannot change mid-run even if feature flags toggle later
- retention cleanup archives or purges expired prompts, provider payloads, generated assets, trace data, and artifact refs idempotently without mutating live run state

## Feature Flags

Add or reuse flags:

- `AUTO_TEAM_CANONICAL_EXECUTION`
- `AUTO_TEAM_CANONICAL_SHADOW_MODE`
- `AUTO_TEAM_MEDIA_JOB_ENFORCEMENT`
- `AUTO_TEAM_COMPLETION_EVIDENCE_GATE`
- `AUTO_TEAM_ROLLBACK_READONLY_MODE`
- `AUTO_TEAM_RETENTION_CLEANUP`

Recommended rollout:

1. Shadow write records without blocking legacy behavior.
2. Enable route hard gate for new runs.
3. Enable media job enforcement.
4. Enable completion evidence gate.
5. Enable UI panels by default.
6. Freeze the execution mode snapshot when the run starts so later flag changes only affect future runs.

Flag behavior must be tested and documented in code comments.

Rollback behavior:

- disabling enforcement must not delete canonical records
- read-only projections must continue to show route/stage/job/review/final evidence already created
- new provider submissions must stop when rollback read-only mode is active
- in-flight provider jobs must continue polling or be safely cancelled according to provider policy
- debug snapshot must identify rollback mode clearly
- the enforcement mode stored on a live run remains immutable after kickoff; later flag changes affect only new runs

## Backfill Behavior

Do not convert old messages into verified completion.

Backfill service must:

- inspect legacy rooms/runs/messages
- create best-effort route/stage snapshots only when safe
- mark all inferred records `legacy_unverified`
- attach source message IDs in metadata
- never mark a legacy media route completed unless actual media job/result evidence exists
- allow retry/re-run into a new canonical run
- only run from trusted operator/admin/debug tooling; caller identity alone must not imply elevated backfill access

This protects users from historical fake completions.

## Debug Snapshot

Create `autoTeamDebugSnapshotService.ts`.

Input:

- `tenantId`
- one of `roomId`, `runId`, `workRequestId`, or `workCaseId`
- requesting user context

Output:

- room details
- run details
- work request/case links
- route decisions
- execution mode / rollout mode
- stage timeline
- work items
- room messages summary
- media job refs
- agency run refs
- review records
- final result
- missing evidence summary
- loop guard state
- sanitized errors
- trace events with sequence/idempotency summary
- timeout, budget, provider decision, and safety status
- memory continuity status summary: room language, initiator user, available scoped memory classes, and whether guided chat is run-backed or automation-led
- retention state summary showing what was archived or purged and whether cleanup is complete for the tenant
- raw diagnostic fields only when caller has admin/debug permission

This directly addresses the repeated debugging pain: future investigations should query evidence instead of guessing from screenshots.

Optional script:

```bash
npm --prefix apps/web exec tsx apps/web/scripts/debug-auto-team-room.ts --room <room-id>
```

The script must never print secrets.

## E2E Scenario: Songkran Video

Create a deterministic server-side e2e-style test with mocked provider calls.

Scenario:

1. User creates Work OS request: "create a 24-30 second Songkran video using Veo 3.1".
2. User selects a team and Thai or English language.
3. Start automation creates new Auto-Team room.
4. Route decision is `media.video`.
5. Kickoff is owned by orchestrator persona.
6. Research stage creates artifact.
7. Storyboard stage creates artifact.
8. Prompt stage creates artifact.
9. Media submit calls mocked video provider and stores job ref.
10. Poll updates job to succeeded with result artifact.
11. Reviewer scores actual result.
12. Final result is created.
13. Work OS and My Requests still list the request.

Assertions:

- no primary `writing.article` route was used
- all messages are attached to stages/work items except system status messages
- final run status is completed only after completion evidence passes
- run snapshot shows final result and media job

## E2E Scenario: Guided Team Continuity

Scenario:

1. A guided/manual Team room exists with room language set to Thai or English.
2. The requester sends a follow-up message after previous room activity exists.
3. The send starts or resumes a `team_chat` run.
4. Prompt composition receives room language plus available user/entity/rule/project/scoped continuity.
5. The assistant reply is emitted through the run engine and appears in monitoring state.

Assertions:

- the room message is not persist-only
- the reply language matches the room language unless quoting source text
- run snapshot shows the new `team_chat` run or resumed run
- unrelated same-tenant users cannot inspect scoped memory for that room

## E2E Scenario: Misroute Guard

Scenario:

1. Video objective is classified as `media.video`.
2. Candidate selected skill is a writing/article skill.
3. Route gate blocks execution.
4. Stage is marked blocked with `route_skill_family_mismatch`.
5. Run does not complete.
6. UI snapshot shows blocked reason and retry/replan controls.

## E2E Scenario: Provider Failure

Scenario:

1. Video route reaches media submit.
2. Provider returns entitlement or unavailable failure.
3. Stage is blocked/failed.
4. Work OS shows blocked state.
5. Final result is not successful.
6. User-safe failure message is available.

## Rollout and Migration Verification

Before enabling by default:

- apply migration in dev/staging
- verify new tables exist
- verify indexes and unique constraints exist for idempotency, trace sequence, and artifact refs
- verify `work_cases` automation columns from earlier migrations still exist
- verify `scoped_memories` and any room-language migrations already relied on by Team continuity are present and compatible
- verify generated schema artifacts such as `schema.js` are updated when required
- verify run-mode snapshots are frozen at route-decision creation and remain immutable for in-flight runs
- run targeted tests
- run typecheck
- run one manual Work OS request in staging
- inspect debug snapshot
- document flag-disable/rollback procedure before production rollout

## Security Requirements

- Debug snapshot must be tenant and permission scoped.
- Scripts must not print provider tokens, signed URLs, raw private payloads, or cross-tenant data.
- Artifact access endpoints must require explicit permission and must not expose raw storage refs in user-visible payloads.
- Feature flag fallback must not bypass route/security gates once enforcement is enabled.
- Legacy backfill must not create false verified results.
- Rollback mode must not expose raw diagnostics to non-admin users.
- Rollback mode must not create new duplicate provider jobs.
- Rollback and debug tooling must not bypass scoped-memory ACL checks.
- Debug and public snapshots must not leak raw storage refs after retention cleanup.
- Live runs must keep the execution mode they started with even if flags change later.

## Acceptance Criteria

- Feature can be rolled out gradually.
- Legacy rooms are visible but not falsely verified.
- Debug output explains why a run is waiting, blocked, failed, cancelled, or completed.
- E2E tests prove real media job completion path.
- E2E tests prove old text-only misroute cannot complete.
- E2E and debug tooling prove guided Team continuity is run-backed and room/project/user memory-aware.
- Retention cleanup tests prove expired traces, payloads, and artifact refs are removed or archived safely without affecting live runs.
- Artifact access tests prove unauthorized callers see redacted projections rather than raw storage refs.
- Room-health monitoring tests prove non-participants and non-admins cannot inspect the context-engine health view for another room.
- Mode-freeze tests prove in-flight runs are not reclassified by later feature-flag changes.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/autoTeamBackfill.test.ts server/services/__tests__/autoTeamDebugSnapshot.test.ts server/services/__tests__/autoTeamRolloutFlag.test.ts server/services/__tests__/teamRunSongkranVideo.e2e.test.ts server/routers/__tests__/teamRoom.test.ts server/routers/__tests__/scopedMemoryRouter.test.ts
npm --prefix apps/web run check
```
