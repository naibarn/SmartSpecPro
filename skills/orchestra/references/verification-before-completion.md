# Verification Before Completion

Do not claim a task is complete without fresh verification evidence from the
current worktree.

## Completion Evidence

At least one fresh verification signal is required before final summary:

- targeted unit or integration tests
- typecheck or lint command for touched language/runtime
- `bash skills/audit-skills.sh` for skill-system changes
- `bash skills/verify-installed-skills-sync.sh` after publishing skills
- Playwright or screenshot evidence for user-visible UI changes
- explicit manual inspection notes when no automated check exists
- review convergence evidence for medium+ scope/risk or any task with review findings
- final Loop Policy ledger from `agent-loop-policy.md`
- gap closure triage from `gap-closure-before-final.md`

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

## No-Evidence Rule

If no fresh verification ran, the final answer must say the work is implemented
but unverified, and must not describe the task as complete.

## No-Convergence Rule

For medium+ scope/risk, or any task where review/gate feedback caused fixes, the final answer
must not describe the task as complete until `review-convergence.md` criteria pass or a stop
condition is reached and reported. A single post-completion review is not enough after
material fixes; run the required consecutive clean rounds.

## No-Unclosed-Must-Do Gap Rule

Before final summary, apply `gap-closure-before-final.md`. If any safe,
in-scope `must_do_now` gap is discovered, fix it and rerun the relevant stale
verification before finalizing. Do not present a `must_do_now` item as a next
step. Only defer gaps that are optional, out of scope, blocked by missing
external state, destructive, high-cost, or require a product/security decision.

## Retry Rule

For blocking gates, retry at most three times. After three failures, stop and
report the exact failing command, relevant output, and likely owner.
