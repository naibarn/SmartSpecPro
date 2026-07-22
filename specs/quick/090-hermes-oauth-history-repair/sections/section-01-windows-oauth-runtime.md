# Section 01 - Windows OAuth runtime

Ownership: `apps/worker-app/src-tauri/src/hermes_executor.rs` and focused tests.

- First add red tests for the explicit Windows path allow-list.
- Add safe diagnostic selection/redaction tests including bearer tokens,
  refresh tokens, device codes, URL query secrets, and long opaque values.
- Preserve `env_clear()` and per-connection `HERMES_HOME`.
- Acceptance: a useful bounded error survives while credentials never do.

