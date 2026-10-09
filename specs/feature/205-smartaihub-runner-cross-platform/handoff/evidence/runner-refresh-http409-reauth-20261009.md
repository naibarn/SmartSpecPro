# Runner refresh HTTP 409 recovery — 2026-10-09

## Runtime evidence

- User screenshot from Windows Runner `0.2.25` shows access token expiry `2026-10-09 06:28:18`, refresh/reconnect deadline `2026-10-16 06:13:18`, and repeated `RUNNER_CONNECT_REQUEST_REJECTED_409` after refresh attempts.
- Debian `smartspec-web.service` journal after 09:00 +07 shows `local-runner` WSS events rejected with `Invalid token: jwt expired`. The service does not log the refresh route's response body, and the client intentionally retained only the HTTP status; therefore the precise 409 server error code is not established by these observations.
- Source inspection confirms the refresh route can return HTTP 409 for a Runner session conflict (`RUNNER_SESSION_STALE`) or other non-transient state conflict. The old desktop classified 409 as `retrying`, so it retried every 30 seconds even though retrying the same session cannot resolve a conflict.

## Repair

- Integrated commit `14e705d366aa7eac5e95abd321823a6983536906` classifies HTTP 409, as well as the existing 401/403/revoked cases, as `reauth_required`. Transient server errors such as HTTP 503 remain retryable.
- The desktop notice now explains that HTTP 409 will not be fixed by automatic retry and directs the user to reconnect through the browser to establish a fresh session. The exact HTTP code remains visible in credential details.

## Changed-scope evidence

- RED: `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml credential_retry_tests::refresh_conflicts_require_browser_reauthorization_but_server_errors_retry --no-run` — failed as expected because the classifier did not exist.
- GREEN: `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml credential_retry_tests` — PASS, 3 tests; verifies 409/401 require browser reauthorization and 503 remains retryable, plus both manual retry backoff invariants.
- `cargo fmt --manifest-path apps/runner-desktop/src-tauri/Cargo.toml`, `node --check apps/runner-desktop/ui/app.js`, and `git diff --check` — PASS.

## Artifact and acceptance boundary

- Windows unsigned review build `0.2.26` was dispatched from source `14e705d366aa7eac5e95abd321823a6983536906`; workflow: https://github.com/naibarn/SmartSpecPro/actions/runs/37877391451 . The run was queued when this evidence was written.
- After installing the artifact, click browser reconnect once and approve the Runner to replace the stale/conflicting session. Then verify the UI stops automatic 30-second retries on any remaining 409 and shows the browser reconnect instruction. Windows runtime acceptance is pending.
