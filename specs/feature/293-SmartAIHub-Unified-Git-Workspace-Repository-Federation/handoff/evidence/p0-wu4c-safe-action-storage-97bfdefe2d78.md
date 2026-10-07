# Safe-action storage contract checkpoint — 97bfdefe2d78

Integrated on `refs/heads/main` at `97bfdefe2d787899ec498e1bee9633ec23b75eda` via [PR #128](https://github.com/naibarn/SmartSpecPro/pull/128).

- Removed `SqliteActionLedger` and its `safe_action_receipts` parallel database from `runtime_authority.py`. The dispatcher accepts an injected idempotency-store port; production caller remains responsible for binding it to canonical Spec-224/`worker_jobs` state.
- Dispatcher contract tests still verify exact replay, conflicting payload rejection, permission denial, owner recheck, receipt, and audit using an in-memory test adapter. Focused Python suite: 39 passed; bytecode compilation and `git diff --check` passed.
- This removes an architectural violation but does not mean the seven safe actions are wired to authenticated API/Runner execution. Mission Control completeness, persistent cross-host facts, lifecycle event call sites, and provider/runtime source consumption remain partial. P0 remains `PARTIAL`, next workunit `P0_INTERNAL_GAP_CLOSURE`.
