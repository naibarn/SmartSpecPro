# TDD plan

## Tests first

- Rust: classify timeout, connection failure, 429, 503 as transient.
- Rust: classify 401, 403, revoked, and device mismatch as permanent.
- Rust: verify health response status is transient/unavailable for refresh
  transport errors and does not erase the saved connection.
- UI/source: verify transient health does not call the native error dialog.
- UI/source: verify healthy after transient clears the reconnecting state.

## Regression checks

- Existing refresh coalescing and auth rejection tests must remain green.
- Run `npm --workspace @smartspec/worker-app run typecheck`.
- Run `npm --workspace @smartspec/worker-app test`.

## Test constraints

The Worker App package has Rust tests but no established React test script.
Prefer extracting small pure TypeScript helpers and testing them with the
repository's existing web Vitest setup only if this can be done without adding
dependencies; otherwise use source-level assertions plus typecheck and report
browser evidence as a separate boundary.
