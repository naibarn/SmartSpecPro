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

## Final Summary Requirements

The final summary must include:

- commands run
- pass/fail result
- checks skipped and why
- review convergence rounds run and stop reason, when triggered
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

## Retry Rule

For blocking gates, retry at most three times. After three failures, stop and
report the exact failing command, relevant output, and likely owner.
