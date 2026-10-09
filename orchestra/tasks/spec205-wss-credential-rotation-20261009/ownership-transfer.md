# SPEC-205 WSS Credential Rotation Ownership Transfer

**Decision:** `TRANSFERRED_BOUNDED_SCOPE`
**Canonical source:** `origin/main` at `481a9f665dfb9b06de0d78ad44580cc0cb9bfa48`
**WorkUnit:** `SPEC205_WSS_CREDENTIAL_ROTATION`
**Decision date:** 2026-10-09 (Asia/Bangkok)

## Authority

The project owner authorized resolving the historical Runner/Rust reservation only after checking for a conflicting active writer or unreconciled changes. This record exercises that bounded authorization; it does not authorize overwriting another session or expanding the file scope.

## Ownership evidence

- The prior reservation cited PR #379 and `apps/runner-app/src/connection.rs` plus `apps/runner-app/src/diagnostics.rs`. PR #379 is merged; its author is `@naibarn` and its merge SHA is in canonical history.
- No Runner-related PR is currently open. PRs #337, #341, and #348, whose historical branches still differ from current main, are merged; their work is already represented in canonical history.
- Read-only inspection covered 151 registered worktrees. No worktree has dirty or staged changes in the three authorized source files. The remaining worktree branch deltas touching these files correspond to already merged PRs; no unmerged change set was found.
- The Export Debug integration path `apps/runner-desktop/src-tauri/src/main.rs` was also checked across the registered worktrees; no dirty or staged change was found there. The path is included only for the requested sanitized report fields.
- The current collaboration agent registry contains only this conductor. No separate active writer or target-path reservation is visible in current repository coordination metadata.
- The pre-existing user-facing primary checkout remains untouched. Implementation is isolated in `/home/dev/worktrees/spec205-wss-credential-rotation-20261009`.

## Exact transferred paths

Write ownership transfers to this WorkUnit for:

- `apps/runner-app/src/connection.rs`
- `apps/runner-app/src/diagnostics.rs`
- `apps/runner-app/src/transport.rs`
- Directly related Rust regression tests under `apps/runner-app/src/` and `apps/runner-app/tests/`
- `apps/runner-desktop/src-tauri/src/main.rs`, limited to adding the sanitized Runner credential runtime snapshot to the existing Export Debug report, as explicitly required by Phase 3.

Any other path requires a separate ownership check and authorization. Existing Linux/Windows runtime installations, credentials, sessions, protected dispatch, grants, budgets, and production systems remain outside this transfer.

## Handoff conditions

Keep the transferred scope through the bounded reproduction/fix and normal PR integration. Before further path expansion, recheck canonical main, dirty worktrees, open PRs, and owner reservations. Restore the single-writer reservation to the next declared Runner owner in the merged handoff. This transfer is not Windows runtime acceptance and does not change SPEC-224 dispatch `DENY`.
