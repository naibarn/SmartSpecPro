# Windows Runner authentication and reconnect lifecycle fix

- WorkUnit: `SPEC205_WINDOWS_RUNNER_AUTH_RECONNECT_20261030`
- Integrated source: `origin/main` at `50df3ea7c09476ed9ea706747977fd0ecbf414ff`
- Installed owner Runner observed: `0.2.48`; exact source commit for that binary is not available in this checkout.
- Windows review build: [workflow run 41071803159](https://github.com/naibarn/SmartSpecPro/actions/runs/41071803159), source SHA `50df3ea7c09476ed9ea706747977fd0ecbf414ff`, version `0.2.49`, platform `windows` — succeeded. The unsigned review artifact is `SmartAIHub Runner_0.2.49_x64-setup.exe`, SHA-256 `cdf25374b26585200340ffe19c9f3fbe2c6a9bdd516fab316897d5f8ec31dcd2`.
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

- Download the unsigned review artifact from workflow run 41071803159. Verify its supplied checksum before use. The artifact is for the already enrolled Windows host only; owner/authorized installation is still needed.
- On the existing enrollment, verify refresh-token rotation, restart/network recovery, fresh heartbeat and capability acknowledgement while preserving Runner/device/session identity. Do not mark runtime acceptance from CI/unit tests alone.
- Keep the Debian SPEC-224 Pilot separate. Do not create a Goal or use its execution receipts as Windows lifecycle evidence.

## 0.2.49 review artifact delivery and upgrade-preservation review

- GitHub Actions run: [41071803159](https://github.com/naibarn/SmartSpecPro/actions/runs/41071803159), successful at source SHA `50df3ea7c09476ed9ea706747977fd0ecbf414ff`. The run title identifies this as a manual workflow dispatch (`build_id=manual`), not a public GitHub Release.
- Existing Actions artifact: `smartaihub-runner-windows-x64-0.2.49-unsigned-review`, artifact ID `12985264751`, 5,137,961 bytes, currently unexpired (artifact retention through `2027-01-28T14:28:43Z`). Download it from the Artifacts section of the run page above; GitHub access is required. Do not present it as a public release or invent a standalone download URL.
- Installer: `SmartAIHub Runner_0.2.49_x64-setup.exe`, target `x86_64-pc-windows-msvc`, build date `2026-10-30T14:29:45Z`; manifest explicitly marks `unsigned-review`. SHA-256 in both the artifact manifest and `SHA256SUMS`, independently recomputed after downloading the artifact: `cdf25374b26585200340ffe19c9f3fbe2c6a9bdd516fab316897d5f8ec31dcd2`.
- Existing local upgrade path review: Tauri product identifier remains `com.smartaihub.runner`, NSIS is configured for `currentUser`, and the desktop resolves its persistent data root through Tauri `app_data_dir()` before loading `runner-connection.json` and `desktop_settings.json`. The Runner loads the prior connection record to retain Runner ID, device ID, server/account/session binding; `workspace_registry.json` is stored under that same data root. No upgrade/reset/delete hook is configured in this installer. This is source/config evidence for an in-place upgrade; it is not proof from the owner's Windows host.
- Before installing, make a recoverable copy of the existing Tauri app-data folder (on Windows, the folder for `com.smartaihub.runner` under the current user's roaming AppData). Run the installer over the existing current-user install; do not uninstall first, clear AppData, pair a new device, or change account/workspace configuration. Unsigned review installers can trigger Windows SmartScreen/unknown-publisher prompts; report signing honestly and use only if the owner accepts that review-build risk.
- Distribution boundary: the completed run is a manual Actions artifact. The authenticated Runner Release review endpoint lists correlated Admin build records; this run is not represented as an Admin-created/public release record. The current authorized distribution location is the Actions run's artifact UI.

### Owner-host runtime acceptance remains pending

No installation or runtime interaction occurred on the owner's Windows host. Therefore version `0.2.49` installation, unchanged Runner/device/session IDs, authentication refresh/rotation, transient-disconnect recovery, fresh Capability Snapshot/ACK, heartbeat resumption, workspace availability, and absence of duplicate registrations/sessions remain **UNVERIFIED**. After the owner installs this artifact over the existing installation, collect host evidence for those facts; do not infer them from the successful Windows CI workflow or installer metadata. SPEC-205 remains partial and acceptance remains unknown.
