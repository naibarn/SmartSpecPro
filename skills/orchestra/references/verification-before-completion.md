# Verification Before Completion

Do not claim a task is complete without fresh verification evidence from the
current worktree.

## Completion Evidence

At least one fresh verification signal is required before final summary:

- targeted unit or integration tests
- a completed Test Design Gate with requirement-to-test rows, RED/GREEN evidence,
  and residual proof boundaries for behavior-changing work
- typecheck or lint command for touched language/runtime
- `bash skills/audit-skills.sh` for skill-system changes
- `bash skills/verify-installed-skills-sync.sh` after publishing skills
- Playwright or screenshot evidence for user-visible UI changes
- explicit manual inspection notes when no automated check exists
- review convergence evidence for medium+ scope/risk or any task with review findings
- final Loop Policy ledger from `agent-loop-policy.md`
- gap closure triage from `gap-closure-before-final.md`
- lifecycle convergence evidence from `completion-loop.md` and `orchestra/lifecycle.md`

For TypeScript, apply `typecheck-resource-policy.md`. A typecheck status of
`SKIPPED_POLICY`, `BLOCKED_RESOURCE`, `UNVERIFIED_OOM`, `UNVERIFIED_TIMEOUT`,
or `UNVERIFIED_SESSION_LOSS` is not a passing verification signal. Report the
status and residual risk explicitly; never convert it to pass because the
process was retried or the SSH session ended.

## Final Summary Requirements

The final summary must include:

- commands run
- pass/fail result
- checks skipped and why
- review convergence rounds run and stop reason, when triggered
- gap closure status: must-do-now fixed, safely deferred, or blocked
- loop policy counters and final stop reason, including unknown exact cost/tool-call
  telemetry when unavailable
- known unrelated dirty work that was not touched
- residual risk if a gate could not run
- TypeScript status, including whether it was explicit, changed-scope, skipped
  by policy, or unverified due to resource/session limits
- seven-stage lifecycle status, current/resume stage, open gaps, and typed stop reason

## No-Evidence Rule

If no fresh verification ran, the final answer must say the work is implemented
but unverified, and must not describe the task as complete.

## No-Convergence Rule

For medium+ scope/risk, or any task where review/gate feedback caused fixes, the final answer
must not describe the task as complete until `review-convergence.md` criteria pass or a stop
condition is reached and reported. A single post-completion review is not enough after
material fixes; run the required consecutive clean rounds.

## Lifecycle No-Skip Rule

For non-trivial work, do not finalize unless `PLANNING`, `TDD_DESIGN`,
`IMPLEMENT`, `VERIFY`, `DEBUG_FIX`, `REVIEW`, and `FINAL_VERIFY` are all closed
in `orchestra/lifecycle.md`. A `BLOCKED`, `IN_PROGRESS`, stale, or missing stage
must trigger recovery from `resume_from`, or a final
`implemented_but_blocked`/`implemented_with_deferred_gap` report with the open
gap and smallest next action. A blocker is never evidence that a stage was
skipped safely.

## No-Unclosed-Must-Do Gap Rule

Before final summary, apply `gap-closure-before-final.md`. If any safe,
in-scope `must_do_now` gap is discovered, fix it and rerun the relevant stale
verification before finalizing. Do not present a `must_do_now` item as a next
step. Only defer gaps that are optional, out of scope, blocked by missing
external state, destructive, high-cost, or require a product/security decision.

## Retry Rule

For blocking gates, retry at most three times. After three failures, stop and
report the exact failing command, relevant output, and likely owner.
