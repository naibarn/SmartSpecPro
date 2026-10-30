# Windows Runner reauthorization button recovery

- WorkUnit: `SPEC205_WINDOWS_RUNNER_REAUTH_BUTTON_20261030`
- Source SHA: `f8e0b3bffac9df51cca9b729fbea292b45d19c60`
- Owner-observed installed version: `0.2.50`.
- Owner screenshot reports `RUNNER_REFRESH_CREDENTIAL_SIGNATURE_INVALID`; the cause of the server-side signature rejection (for example, key rotation versus an invalid stored credential) is not established by the screenshot.
- The screenshot also shows a disabled browser-connect action while the Runner process is still marked running. Source inspection confirmed the action was unconditionally disabled whenever the process was running, and signature-invalid refresh failures were treated as transient retries.

## Implemented

- Classify invalid refresh signatures and expired/revoked credentials as requiring browser reauthorization.
- Enable the browser reauthorization action for a running Runner in that state. Stop the stale loop safely before pairing; after successful authorization, resume from the existing Runner settings.
- Reuse the persisted device ID, machine fingerprint, public/private proof key, Runner ID, and enrollment data. Fail closed on Runner/device identity drift rather than silently generating another identity.
- Explain that the action reauthorizes the existing account/device, and show the signature-invalid condition separately from transient retry states.

## Focused verification

- `cargo test --manifest-path apps/runner-app/Cargo.toml connection::tests::browser_reauthorization -- --test-threads=1` — 2 passed.
- `cargo test --offline --manifest-path apps/runner-desktop/src-tauri/Cargo.toml credential_retry_tests -- --test-threads=1` — 4 passed. The test resolved a newer lock graph locally; the generated `Cargo.lock` delta was discarded and is not part of this change.
- `node --check apps/runner-desktop/ui/app.js` — passed.
- `cargo fmt --check` for both Runner crates and `git diff --check` — passed.
- GitHub Actions review build [41083080276](https://github.com/naibarn/SmartSpecPro/actions/runs/41083080276) was dispatched for Windows version `0.2.51` from this source SHA. Artifact/build result is pending at the time of this record.

## Acceptance boundary

The source fix cannot alter the already installed `0.2.50` UI. The existing Windows installation has not been changed. Runtime acceptance remains pending: install the eventual `0.2.51` unsigned review artifact over the existing current-user installation, verify the button is actionable, complete browser reauthorization, and confirm unchanged Runner/device identity plus fresh capability acknowledgement and heartbeat. Do not infer runtime success from unit tests or the CI artifact.
