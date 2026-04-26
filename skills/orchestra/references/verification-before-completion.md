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

## Final Summary Requirements

The final summary must include:

- commands run
- pass/fail result
- checks skipped and why
- known unrelated dirty work that was not touched
- residual risk if a gate could not run

## No-Evidence Rule

If no fresh verification ran, the final answer must say the work is implemented
but unverified, and must not describe the task as complete.

## Retry Rule

For blocking gates, retry at most three times. After three failures, stop and
report the exact failing command, relevant output, and likely owner.

