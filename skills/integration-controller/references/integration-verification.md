# Integration and post-integration verification

## Fast gate before promotion

Before a safe task checkpoint enters `origin/main`, establish that its changed scope has no syntax/compile error, unresolved merge conflict, damaged patch, or accidental secret. Keep this gate bounded to the changed scope. Repair gate failures before promoting, while preserving a durable copy of the task changes.

Do not require full typecheck/build, heavy tests, integration/UAT, provider/rights checks, or production gates before central integration. Those checks may reveal later work, but safe valuable code, including partial progress, must first become visible in `origin/main`.

## Heavy checks after promotion

Run expensive checks against the integrated SHA through CI, a dedicated runner, or a safe admitted local window. Record each check as `PASS`, `FAIL`, `PENDING`, or `NOT_RUN`, with owner and next action. A canceled check is not a pass.

If a check fails, repair from current `main`, pass the fast gate, and promote a new repair commit to `main`. Never move the only copy of a safe valuable implementation progress back to an untracked or forgotten side branch.

## Concurrency and cleanup

Serialize the short promotion step to protect `origin/main`, not implementation or post-integration verification. Temporary branches/PRs may be used only when required by concurrency or repository protection; merge them in the same task lifecycle and verify the resulting SHA before cleanup. Preserve dirty or unclassified worktrees until all valuable changes are integrated or durably saved.
