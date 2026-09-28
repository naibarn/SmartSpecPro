# Section 04 — Focused Verification

## Ownership

Run focused tests, diff checks, and changed-file diagnostics without touching
unrelated dirty files.

## Acceptance

All new regression tests pass; existing focused character generation tests pass
or any baseline failures are identified separately. `git diff --check` is clean.

## Deferred proof

No provider submission, authenticated browser session, deployment, or full-repo
typecheck is claimed unless actually run.
