# P0-WU-4 collector integration-race regression

- Tested implementation commit: `1c88e4511` (merged PR #115).
- Integrated `origin/main`: `283edf93d94d572e79f3b1a4c0c3d57d9219ad64`.
- Scenario 33 completes integration immediately after the collector's canonical fetch. The stale observation conservatively blocks retirement and preserves the worktree; the next fresh `RETIRE_SAFE` audit observes integration and retires it. This verifies safe defer/resume and idempotent recovery.
- Validation: `python3 -B -m unittest scripts.development-lifecycle.test_workspace_authority` — 37 passed; matrix contains 33 mapped cases; `git diff --check` passed.
- Collector scheduling remains unimplemented; invocation is explicit CLI/API only.
