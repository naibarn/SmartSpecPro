# Implementation Plan: Warning-Only Video Prompt Safety After Approved Image

## Outcome

Every approved-image Vertical Drama shot reaches a persisted video prompt unless
the request fails for an operational or data precondition. The story safety
analyzer remains useful for warnings and audit, but it no longer owns a hard-stop
decision during prompt authoring.

## Invariants

- An approved start frame is required for grounded authoring; missing media remains
  a `PRECONDITION_FAILED`, not a policy failure.
- No `VerticalDramaStorySafetyError` is thrown from video prompt generation solely
  because of analyzer findings.
- The analyzer must not cause credit deduction to occur on a failed operation, and
  warning-bearing success must use the same single successful charge/persistence
  path as an ordinary success.
- Prompt authoring and actual video rendering remain separate boundaries.
- Existing image safety behavior and unrelated worktree changes remain untouched.

## Section 1 — Safety decision contract

Update `verticalDramaStorySafety.ts` only as needed to expose a stable warning
projection for video-prompt consumers without weakening the existing analyzer's
ability to identify signals. Keep the finding codes and metadata exclusion rules.
Do not make `restrained` globally disappear: the analyzer may still report it as
an advisory signal. If contextual filtering is added, scope it to modifier/audio
phrases and cover it with tests for both `restrained tension` and actual physical
restraint.

In `verticalDramaVideoMotionPromptGeneration.ts`, remove the policy-only hard
throws from whole-pack, single-shot, and speaker-switch input/output boundaries.
Run the analyzer after generation as advisory telemetry. Add optional warning
fields to the service result if the existing result type has a safe additive
location; warnings must include codes/messages, not raw prompt text. The result
must continue through assurance, prompt length checks, and persistence.

The service must not introduce a second rewrite loop that can fail an approved
shot. If it keeps any normalization, it is best-effort and non-blocking; the
authoritative output remains the generated prompt and the user sees the warning.

## Section 2 — Queue, router, persistence, and UI boundary

Extend `verticalDramaShotVideoPromptJobs.ts` and the protected router result
projection only with optional warning data. A result with warnings is terminal
`succeeded`, clears the active pointer, advances the sequence, and persists the
clip exactly like a clean result. Preserve current idempotency behavior.

Update `verticalDramaEpisodes.ts` so warning fields are carried into the durable
motion-prompt clip/pack or an existing warning channel without changing the prompt
shape required by render providers. Ensure the ordinary generate action does not
convert warning-bearing success into an error toast. Keep missing frame, worker
authorization, LLM/schema, vision, queue, and credit errors hard and actionable.

Inspect the storyboard panel's polling/result/error branches. Add only the copy
and state handling needed to display an advisory warning beside a successfully
persisted prompt. Do not disable the generate action after a policy warning.

## Section 3 — Regression tests and verification

Add a safety unit fixture for the exact phrase `the child's sudden cry ...
restrained tension`: it may produce advisory findings but must not be considered
a blocking video-authoring result. Keep a positive fixture for physical restraint
and real minor threat/surveillance.

Add generator tests proving low/medium/high analyzer results do not throw from
video-prompt authoring, that the exact episode-232 assistant output reaches the
result path, and that operational errors still throw. Add queue/router tests for
warning-bearing success, prompt persistence, sequence advancement, idempotency,
and no user debit before success.

Run focused Vitest suites, `git diff --check`, a local database/Redis replay using
the real episode-232 records, and an authenticated browser flow against the
running app if credentials/session are available. Compare the post-change audit
and credit rows with the expected successful path. Report production deployment,
provider render, and browser boundaries separately if they cannot be executed.

## Files owned by this change

- `apps/web/server/services/verticalDramaStorySafety.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaShotVideoPromptJobs.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- focused tests adjacent to the above files

## Rollback

The change is additive at the result/warning level. If warning projection causes
consumer incompatibility, disable the warning display while retaining successful
prompt persistence. Do not restore the old policy hard throw for video-prompt
authoring; provider/render failures remain the rollback signal for media output.
