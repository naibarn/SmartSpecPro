# Windows Runner browser reconnect action — 2026-10-31

- WorkUnit: `SPEC205_WINDOWS_RUNNER_BROWSER_RECONNECT_UX_20261031`
- Integrated source SHA: `0f70bb90c2443b09ec36d09b958636bd609e91b0`
- Owner-observed version: `0.2.51`; refresh reports `RUNNER_REFRESH_CREDENTIAL_SIGNATURE_INVALID`, and clicking browser reconnect does not visibly complete the connection.
- The screenshot proves the connect action is enabled, but does not establish why the Control Plane rejects the saved refresh credential or whether the browser was opened and left awaiting approval. Do not infer credential revocation or signing-key rotation from this error alone.

## Repair

- The Windows path now opens the verification URL through the registered system URL handler (`ShellExecuteW`) rather than spawning `rundll32`.
- As soon as the existing pairing request is created, the desktop UI receives and displays its verification URL while the command waits for the authenticated owner to approve it. The URL remains visible during status refresh and is preserved in the failure message so it can be copied if the browser does not launch.
- Existing Runner/device proof material and the approval boundary are unchanged. No new enrollment or simulated approval is introduced.

## Verification and artifact

- `cargo test --manifest-path apps/runner-app/Cargo.toml connection::tests --lib` — 17 passed.
- `cargo check --manifest-path apps/runner-desktop/src-tauri/Cargo.toml` — passed.
- `node --check apps/runner-desktop/ui/app.js`, Rust formatting checks, and `git diff --check` — passed.
- Windows hosted review workflow [41145171095](https://github.com/naibarn/SmartSpecPro/actions/runs/41145171095) — passed: Windows Runner boundary tests, workspace binding test, NSIS build, manifest checksum, and artifact upload. Runner release UI/API checks also passed.
- Artifact `smartaihub-runner-windows-x64-0.2.52-unsigned-review`, ID `13021741314`; installer `SmartAIHub Runner_0.2.52_x64-setup.exe`; source SHA matches the integrated SHA above; `signingStatus=unsigned-review`.
- Installer SHA-256 from the downloaded artifact and its manifest: `61a34aab2b84ef1ed7504c11d42116f2c53cc3703349f3ff23badff727d02a46`.
- Artifact archive SHA-256: `48adea89ab94715314d834fb0cfe1db98ef000ce9dc6655b2fe8991473eea9de`.

## Acceptance boundary

Windows host runtime acceptance remains pending. Install 0.2.52 over the existing current-user installation without uninstalling or clearing app data; verify the same Runner/device identity is retained; click browser reconnect; approve the displayed request in the browser using the authorized account; then verify fresh capability acknowledgement and heartbeat. Do not mark SPEC-205 runtime acceptance complete until those host observations exist.
