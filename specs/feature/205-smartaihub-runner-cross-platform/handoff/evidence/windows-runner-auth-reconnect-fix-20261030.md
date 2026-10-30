# Windows Runner authentication and reconnect lifecycle fix

- WorkUnit: `SPEC205_WINDOWS_RUNNER_AUTH_RECONNECT_20261030`
- Integrated source: `origin/main` at `50df3ea7c09476ed9ea706747977fd0ecbf414ff`
- Installed owner Runner observed: `0.2.48`; exact source commit for that binary is not available in this checkout.
- Windows review build: [workflow run 41071803159](https://github.com/naibarn/SmartSpecPro/actions/runs/41071803159), requested from full source SHA `50df3ea7c09476ed9ea706747977fd0ecbf414ff`, version `0.2.49`, platform `windows` (unsigned artifact only; queued/in progress).
- Initial workflow attempt [41071550316](https://github.com/naibarn/SmartSpecPro/actions/runs/41071550316) failed at checkout because the short ref `50df3ea7c` was interpreted as a branch/tag pattern; no build or test step ran. Retried with the full SHA above.

## Failure boundary established from source and reproduction

The owner's report includes an access-token expiry followed by `RUNNER_CONNECT_REQUEST_REJECTED_401`, capability acknowledgement failure, and a transport protocol error. The owner's Windows logs and a source mapping for the installed `0.2.48` binary were not available, so the exact historical cause cannot be uniquely attributed to one event.

The current source did contain reproducible defects at the reported boundary:

1. A rejected HTTP WSS upgrade (including 401) was flattened into a generic unavailable transport error. The control loop therefore did not know that its current access token was rejected and could retry it without entering authorized refresh recovery.
2. The desktop status poll and active control loop could refresh concurrently against the same rotating refresh credential. A stale caller could overwrite/adversely race the newly persisted credential.
3. Windows credential replacement removed the existing file before rename, leaving a failure window, and credentials were stored as plaintext JSON.
4. Device-proof canonical body hashing depended on object insertion order; its nested-key regression failed before the correction.

These explain how the reported symptoms can occur in this code. They do not prove which one triggered the historical `0.2.48` incident.

## Implemented and integrated

- Serialize in-process refresh, re-read persisted credentials under the lock, and adopt a concurrently rotated credential when the server rejected an older access token.
- Preserve Runner, device, tenant, and Runner-session identity when refreshing. Persist rotated credentials before reconnecting.
- Preserve HTTP status from a rejected WebSocket upgrade; on an allowed 401 use the existing refresh contract, then reconnect and re-acknowledge capabilities and heartbeat before the loop resumes work.
- Retry transient reconnect failures with bounded exponential backoff and jitter. Keep revoked/invalid refresh credentials distinct from temporary network errors and protocol incompatibility.
- Protect Windows credential-store payloads with current-user DPAPI, migrate the legacy JSON store on successful read, and atomically replace the credential file without deleting the previous valid file first.
- Show protocol incompatibility, reconnecting, authentication-required, and offline/local-process states distinctly in the Runner UI.
- Canonicalize nested JSON keys before device-proof body hashing.

## Verification

Commands run from the repository root at the integrated source candidate above:

- `cargo test --quiet --manifest-path apps/runner-app/Cargo.toml` — 244 passed, 0 failed, 3 ignored.
- `cargo test --quiet --manifest-path apps/runner-desktop/src-tauri/Cargo.toml credential_retry_tests` — 4 passed, 8 filtered out.
- `node --check apps/runner-desktop/ui/app.js` — passed.
- `git diff --check` — passed.
- A Windows GNU cross-check could not start because `x86_64-w64-mingw32-gcc` is not installed. A Windows MSVC check in this Linux environment also lacks the Visual C++ linker/toolchain. Native platform proof is delegated to the existing Windows review workflow above.

The lifecycle regression simulates a real loopback WSS 401 with an unexpired local access token, refresh rotation, reconnect using the same Runner/device/session, capability acknowledgement, and heartbeat acknowledgement. Concurrent refresh coverage verifies one rotation and preservation of existing identity. Expired/revoked refresh and transient error classification are covered by focused tests.

## Acceptance still outstanding

- Confirm the Windows review workflow passed and record its installer SHA-256 and manifest.
- The owner or authorized Windows host must install/test the candidate as a review build without overwriting or enrolling a different Runner. Verify refresh-token rotation, restart/network recovery, fresh heartbeat and capability acknowledgement on the existing enrollment. Do not mark runtime acceptance from CI/unit tests alone.
- Keep the Debian SPEC-224 Pilot separate. Do not create a Goal or use its execution receipts as Windows lifecycle evidence.
