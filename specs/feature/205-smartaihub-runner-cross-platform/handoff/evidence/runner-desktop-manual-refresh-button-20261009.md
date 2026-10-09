# Runner Desktop manual refresh button repair — 2026-10-09

## Symptom and cause

- The user reported that the Windows Runner Desktop “รีเฟรชสถานะ” button could not be used. The screenshot shows an enabled button, but the visible state remains `RUNNER_CONNECT_REQUEST_FAILED`.
- The existing click handler called `runner_status`, workspace refresh, and tool scan. It did not explicitly retry credentials; `runner_status` intentionally suppresses another refresh during `retrying` (30 seconds) and `reauth_required` (one hour) backoff. The button also had no immediate busy feedback while the sequential calls ran.

## Repair

- Integrated source commit `51d2e57490e1fe115aeec9188c84e765e9f33fe3` adds the Tauri command `retry_runner_credentials`. It clears the manual retry backoff before querying status, while preserving an in-flight `renewing` attempt to avoid duplicate refresh requests.
- The desktop button now disables itself during the operation, displays “กำลังลองต่ออายุ…”, and reports that it is checking status and retrying the token. It restores its label and enabled state afterward.

## Changed-scope evidence

- `node --check apps/runner-desktop/ui/app.js` — PASS.
- `git diff --check` — PASS.
- `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml credential_retry_tests` — PASS, 2 tests (manual retry clears `retrying`/`reauth_required`; an active refresh is not duplicated).
- The test and Rust formatting evidence was collected before this handoff update in the same implementation session.

## Artifact and acceptance boundary

- Windows unsigned review build `0.2.25` was dispatched from `main` at `51d2e57490e1fe115aeec9188c84e765e9f33fe3`; GitHub Actions run: https://github.com/naibarn/SmartSpecPro/actions/runs/37872195649 . The run was queued when recorded; artifact success is not yet established.
- The installed Windows Runner `0.2.24` does not contain this UI change. After the review artifact succeeds, install it and click “รีเฟรชสถานะ” while the connection is in retry/reauth state. Confirm visible progress, a fresh credential attempt, and the resulting status. Until that Windows interaction is observed, the fix is integrated and locally verified but not Windows-accepted.
