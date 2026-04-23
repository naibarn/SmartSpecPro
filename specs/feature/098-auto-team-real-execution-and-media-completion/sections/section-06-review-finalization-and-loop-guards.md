# Section 06: Review, Finalization, and Loop Guards

## Goal

Add automatic reviewer scoring, repair loops, human approval gates, route-specific completion evidence, stop/cancel/retry behavior, and protection against broken repetitive execution.

## Dependencies

- Section 01 schema/contracts
- Section 02 route policy/family gate
- Section 03 execution service/stage engine
- Section 04 media lifecycle
- Section 05 agency lifecycle

## Files to Create or Modify

- Create `apps/web/server/services/autoTeamReviewService.ts`
- Create `apps/web/server/services/autoTeamCompletionEvidence.ts`
- Create or extend `apps/web/server/services/autoTeamLoopGuard.ts`
- Modify `apps/web/server/services/runEngine.ts`
- Modify `apps/web/server/routers/teamRun.ts` for stop/cancel/retry mutations if missing
- Create `apps/web/server/services/__tests__/autoTeamReviewService.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamCompletionEvidence.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamLoopGuard.test.ts`

## TDD First

Write failing tests for:

- reviewer sees artifact/job evidence, not just objective text
- below-threshold score creates repair stage with reviewer comments
- repair attempt includes previous failure and reviewer comments
- passing reviewer record is persisted
- human approval is required when policy says so
- final result cannot be created unless route evidence is complete
- repeated text-only media turns trigger loop guard
- stop/cancel prevents further auto-advance
- retry starts from last safe blocked/failed stage without duplicate provider submission
- reviewer unavailable on media/image/agency routes fails closed with retry, backup reviewer, human review, or `reviewer_unavailable`
- heuristic review cannot pass media/image/agency final review
- human rejection carries prior reviewer score/comment, human comment, failed artifact refs, and improvement instructions into repair/replan

## Review Service

Create `autoTeamReviewService.ts` with functions:

- `selectReviewerPersona(input)`
- `buildReviewPrompt(input)`
- `runAutomaticReview(input)`
- `persistReviewRecord(input)`
- `createRepairStageFromReview(input)`
- `isReviewPassing(input)`

Reviewer inputs:

- route decision
- completed stages
- artifact refs
- media job refs
- agency run refs
- final candidate result
- user objective
- language
- prior repair attempts

The reviewer must score actual outputs. For media routes, reviewing only the generated prompt is insufficient unless the media provider failed and the review is of the failure handling.

## Reviewer Availability

Reviewer availability is fail-closed for:

- `media.video`
- `media.image`
- `agency.swarm`

Allowed outcomes:

- retry with same reviewer when the failure is transient
- route to an approved backup reviewer persona
- request human review if policy allows
- block with `reviewer_unavailable`

Disallowed outcomes:

- heuristic reviewer marks media/agency route passed
- final result is completed without reviewer or human approval evidence
- work item approval is set to approved when reviewer is unavailable

## Completion Evidence Service

Create `autoTeamCompletionEvidence.ts` with functions:

- `evaluateCompletionEvidence(input)`
- `assertCanCreateFinalResult(input)`
- `createFinalResult(input)`
- `createFailureFinalResult(input)`
- `summarizeMissingEvidence(input)`

Route requirements:

- `media.video`: research/storyboard or equivalent, video prompt, media job ref, terminal media job status, review record, final result
- `media.image`: image prompt, media job/result ref, terminal media status, review record, final result
- `agency.swarm`: agency run handle, terminal agency status, review record, final result
- `document.writing`: final document artifact, review record, final result
- `research.synthesis`: research artifact, review record, final result
- `workflow.automation`: execution evidence, review or approval record, final result

Return a structured result:

- `ok`
- `routeClass`
- `missingEvidence`
- `blockingStageIds`
- `userMessage`
- `diagnostics`

## Repair Loop

When review fails:

1. Persist review record with score/comments.
2. Mark reviewed stage or work item `needs_revision`.
3. Create repair stage with `attempt + 1`.
4. Include prior artifacts, failure evidence, and reviewer comments in repair input.
5. Re-enter route-specific execution from the appropriate stage.

Maximum repair attempts must be configurable and enforced.

## Human Approval

If policy requires human final approval:

- create `human_approval` stage
- mark run as waiting human
- show approval/reject controls in UI
- if approved, finalize
- if rejected, create repair/replan stage with human comments
- timeout behavior must follow policy and be recorded

Human rejection must create repair or replan work carrying:

- reviewer score and comment
- human comment
- failed artifact refs
- failed stage id or final result id
- improvement instructions
- prior attempt summary

The next plan must reference prior attempts and explain what will improve. Do not restart vague conversation from the original brief unless the route itself must be re-planned.

## Loop Guard

Create or extend `autoTeamLoopGuard.ts`.

Trigger when:

- same stage type and same selected skill repeat beyond threshold
- output fingerprint is materially the same
- no new artifact/job/review/final-result evidence appears
- same blocked reason repeats
- run spends budget/rounds without stage transition

Actions:

- mark current stage `blocked`
- set run stop/pause reason `loop_guard_triggered`
- post room update with user-safe explanation
- surface retry/cancel controls
- do not mark run completed

The guard must not block valid multi-step work when each turn adds new durable evidence.

## Stop, Cancel, Retry

Server mutations must:

- require tenant/user permission
- verify room/run/stage belongs to tenant
- be idempotent
- update stage/run/work item/final result consistently
- prevent auto-advance after cancel
- avoid duplicate media/agency submissions on retry

Expected controls:

- stop/pause current automation
- cancel run
- retry blocked stage
- rerun from beginning as a new run

## Security Requirements

- Reviews must not leak provider secrets or private logs into room messages.
- Human comments must be sanitized before inserting into prompts.
- Retry must not bypass route gate or tenant checks.
- Completion/failure summaries must be user-safe.

## Acceptance Criteria

- Final results are route-specific and evidence-based.
- Reviewer can force repair and the repair uses review comments.
- Human approval gate is respected.
- Repetitive broken runs stop visibly instead of looping.
- Stop/cancel/retry work from server-controlled state transitions.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/autoTeamReviewService.test.ts server/services/__tests__/autoTeamCompletionEvidence.test.ts server/services/__tests__/autoTeamLoopGuard.test.ts
npm --prefix apps/web run check
```
