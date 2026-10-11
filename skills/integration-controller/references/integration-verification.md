# Integration and post-integration verification

## Fast gate before promotion

Before a safe task checkpoint enters the configured canonical ref, establish that its changed scope has no syntax/compile error, unresolved merge conflict, damaged patch, or accidental secret. Keep this gate bounded to the changed scope. Repair gate failures before promoting, while preserving a durable copy of the task changes.

Pass the slice's impacted compile/tests, security/authorization, compatibility
and feature-off fallback checks before merge. Repository-required CI and
reviews remain mandatory, including heavy checks when protection requires
them; run those on an authorized runner. Do not add unrelated full builds,
typechecks, UAT or production checks as ad hoc promotion requirements.

## Heavy checks after promotion

Run expensive checks against the integrated SHA through CI, a dedicated runner, or a safe admitted local window. Record each check as `PASS`, `FAIL`, `PENDING`, or `NOT_RUN`, with owner and next action. A canceled check is not a pass.

If a check fails, repair from current canonical state, pass the fast gate, and promote a new repair commit to the configured canonical ref. Never move the only copy of safe valuable implementation progress back to an untracked or forgotten side branch.

## Concurrency and cleanup

Serialize the short promotion step to protect the configured canonical ref, not implementation or post-integration verification. Temporary branches/PRs may be used only when required by concurrency or repository protection; merge them in the same task lifecycle and verify the resulting SHA before cleanup. Preserve dirty or unclassified worktrees until all valuable changes are integrated or durably saved.
