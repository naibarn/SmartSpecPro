# Windows Runner idle control-loop recovery

- WorkUnit: `SPEC205_WINDOWS_RUNNER_IDLE_CONTROL_LOOP_RECOVERY_20261031`
- Integrated source: `origin/main` at `6d2fbe3d5d55fa92b8a7fb4e8c08b8ee97b760e9`.
- Owner-provided diagnostics were generated `2026-10-31T12:03:18Z`, from Runner `0.2.55` targeting `https://aimarkethubs.com`. At report time the access credential was still valid, WSS auth was true, and the last capability ACK was `applied` at `2026-10-31T08:56:52.731Z`. The Runner later reported `running:false` and normalized `RUNNER_CONNECTION_REQUIRED`. This report did not include the exact control-loop failure code, so the specific historical trigger on the owner's machine remains unproven.

## Repair

- `apps/runner-app/src/diagnostics.rs` now treats credential/session binding drift as recoverable instead of terminating the desktop control loop. The next attempt reconstructs from persisted authorization and performs the normal authenticated handshake; work remains gated until it succeeds.
- Diagnostics preserve the specific safe code `RUNNER_CREDENTIAL_SESSION_BINDING_MISMATCH` instead of collapsing it into `RUNNER_CONNECTION_REQUIRED`. Protocol incompatibility remains terminal and security checks are unchanged.
- Regression test: `credential_binding_change_is_retried_and_reported_without_exposing_raw_errors`.

## Verification and delivery

- `cargo test --manifest-path apps/runner-app/Cargo.toml --lib -- --test-threads=1` — 250 passed, 0 failed, 3 ignored.
- `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml -- --test-threads=1` — 14 passed.
- `cargo fmt --manifest-path apps/runner-app/Cargo.toml -- --check` and `git diff --check` — passed.
- Source fix was pushed to `origin/main` as `6d2fbe3d5d55fa92b8a7fb4e8c08b8ee97b760e9`.
- The separately dispatched review workflow `41199813695` passed its Runner release UI/API checks, then was canceled before artifact build at the owner's direction to use the existing Runner Release build/download flow in the website. It produced no installer artifact. Use the authenticated Runner Releases UI for the review build and download; do not treat CI source tests as host acceptance.

## Runtime acceptance remains pending

No installer was built or installed on the owner's device. The existing Runner ID, long-running refresh/reconnect behavior, fresh capability ACK and heartbeat after upgrade, and 24-hour idle operation remain unverified. Use the existing enrolled installation and normal in-product release flow; do not create another enrollment. Keep the Debian SPEC-224 pilot separate.
