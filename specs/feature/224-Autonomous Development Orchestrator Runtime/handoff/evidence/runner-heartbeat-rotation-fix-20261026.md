# Runner heartbeat and connection-state fix — 2026-10-26

## Source findings

- The Desktop `connected` flag previously meant that a stored access token was valid. It did not prove that the local control loop was running or that SmartAIHub had accepted a recent heartbeat.
- The Admin runner projection uses the server's `lastSeenAt` and marks a runner offline when the last accepted heartbeat is at least five minutes old. Capability publication and WSS authentication acknowledgements alone do not prove a fresh heartbeat.
- During token rotation, `RotatingControlTransport::receive_server_message` could replace and close its authenticated WSS socket, then treat the expected empty-socket read as fatal. That ends the control worker and stops later heartbeats despite valid stored credentials.

## Changes

- Treat credential rotation detected during or before a blocking WSS receive as an idle loop turn. The control loop observes the new credential revision, opens WSS with the rotated token and matching device proof, then republishes capabilities.
- Record a sanitized millisecond timestamp only after an accepted/applied/duplicate `runner.reconcile` acknowledgement. Clear it on control-loop restart and credential rotation.
- Split Desktop state into `credentialsReady` and `controlPlaneConnected`; the latter requires a running worker and a heartbeat acknowledgement fresher than five minutes. The UI now shows the last acknowledged heartbeat and distinguishes temporary token renewal from reauthorization.
- Preserve the existing Runner identity, credential store, workspace registry, and task-probe evidence paths. No pairing or capability result was fabricated.

## Focused verification

- `cargo test --manifest-path apps/runner-app/Cargo.toml diagnostics::rotating_transport_tests` — 6 passed, including loopback token rotation while a WSS read is blocked and subsequent heartbeat acknowledgement with the new token.
- `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml heartbeat_requires_a_recent_acknowledgment_and_rejects_future_or_missing_times` — 1 passed.
- `node --check apps/runner-desktop/ui/app.js` and `git diff --check` — passed.
- Source fixes are integrated in `origin/main` at `bc2950f0a84404e8b8074523251fb5abc373c6cf` (heartbeat behavior at `f670365a72afbc2acdb1b522ce04103bc0b2c697`).
- Windows x64 review workflow [40215438638](https://github.com/naibarn/SmartSpecPro/actions/runs/40215438638) completed successfully from exact source SHA `bc2950f0a84404e8b8074523251fb5abc373c6cf`. Runner release UI/API checks, native Windows boundary suites, Desktop workspace-binding test, and unsigned NSIS build all passed.
- Produced `SmartAIHub Runner_0.2.38_x64-setup.exe`, version `0.2.38`, target `x86_64-pc-windows-msvc`, build date `2026-10-25T17:14:52Z`, signing status `unsigned-review`, installer SHA-256 `cc84313a2fb2373b2d31de7c12ca1ed573a27a6bfe9817639c2c6fe81f4528f3`. Downloaded the workflow artifact and verified `SHA256SUMS` against the installer.

## Acceptance still pending

- The affected installed Runner is v0.2.36 per the supplied screenshot. This Linux environment cannot open or install into the user's Windows Desktop session, so interactive UI behavior, idle resource use, current production `lastSeenAt`, configured Codex real-task verification, and live SPEC-224 dispatch have not been observed here.
- Install review version `0.2.38` over the existing per-user application while retaining the existing `local-runner` enrollment and workspace registry. Confirm the Admin heartbeat timestamp advances without pairing, then run the configured Codex task probe and continue SPEC-224 live E2E with the same Runner identity/workspace and a real scoped DevelopmentRun grant.
- Keep the result partial until those native Windows and live-run observations exist. Mini-App work remains closed.
