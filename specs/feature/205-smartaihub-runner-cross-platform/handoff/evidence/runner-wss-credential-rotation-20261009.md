# WSS Credential Rotation Handoff Evidence

- WorkUnit: `SPEC205_WSS_CREDENTIAL_ROTATION`
- PR: [#415](https://github.com/naibarn/SmartSpecPro/pull/415)
- Integrated source: `origin/main` at `79805356f9252e1ba6858d993dbcc42476788745`
- Implementation commit: `25d212780ea6c2481fd8344ba74d38d505d1c94f`
- Prior canonical source: `481a9f665dfb9b06de0d78ad44580cc0cb9bfa48`

## Findings and implementation

The active Runner loop held the startup bearer and device proof inside `NativeControlTransport`; Desktop refresh persisted a new connection token, but the live loop did not reload it. Reconnecting only the WSS socket reused the original bearer. A deterministic loopback test reproduces A rejected → stored B → active loop handshake/event accepted with B. A separate test observes A after socket-only close, proving socket close alone is insufficient.

The fix polls the existing trusted connection store at bounded control-loop boundaries, verifies the original runner/device/session/tenant binding and token freshness, rebuilds the device proof using the latest token, replaces the bearer and proof together, and discards the old WSS socket. It republishes capabilities after rotation and keeps existing receipt-journal replay/idempotency. Credential authority failures fail closed and cancel active external processes. No second credential store or authorization authority was added.

Desktop Export Debug now includes bounded sanitized credential revision, refresh/runtime update, WSS transport recreation, authentication acknowledgement, capability acknowledgement, and typed failure/timestamp fields. It excludes tokens, keys, assertions, and sensitive headers.

## Verification

- `cargo test --manifest-path apps/runner-app/Cargo.toml`: 173 unit tests + 8 integration tests passed (181 total).
- `cargo fmt --manifest-path apps/runner-app/Cargo.toml -- --check`: passed.
- `git diff --check`: passed.
- Twelve focused QA/security review passes are recorded in `orchestra/tasks/spec205-wss-credential-rotation-20261009/review-rounds.md`.

## Limits and next action

The deterministic test reproduces the stale-token mechanism in current code, but the historical Windows event is not cryptographically/session-correlated to a credential revision; its exact cause remains unconfirmed. PR checks exposed only the skipped PR Preview job; the repository's Windows build workflow is manual. The Tauri Windows crate/build, installed candidate, live session continuity, backend deployment, and Windows acceptance remain pending. The Windows workflow produces an unsigned review artifact and should be run only after the project owner authorizes that review candidate. Keep SPEC-224 protected dispatch `DENY`.
