# Runner Website Target Selection — 2026-10-31

Implementation source: `ecba27a9e` (`feat(runner): select SmartAIHub website environment`).

The Runner now exposes Production (`https://smartaihub.app`) and Developer
(`https://aimarkethubs.com`) in its connection configuration. The selected
website is persisted in desktop settings and takes effect on the next app
launch. Current and selected targets are displayed separately. Production and
Developer credentials/device identities use separate local stores; the
authorized workspace registry remains shared. A matching legacy connection is
migrated without changing its Runner/device identity. No production service or
existing Windows installation was changed.

Verification:

- `cargo test --manifest-path apps/runner-app/Cargo.toml --quiet -- --test-threads=1` — 249 passed, 3 ignored after the final target-store regression test.
- `cargo test --manifest-path apps/runner-app/Cargo.toml config::tests --quiet -- --test-threads=1` — 7 passed after the final target-store and identity-isolation changes.
- `cargo test --manifest-path apps/runner-app/Cargo.toml connection::tests -- --test-threads=1` — 17 passed.
- `cargo test --manifest-path apps/runner-app/Cargo.toml --test desktop_workspace_binding -- --test-threads=1` — 4 passed.
- `cargo test --manifest-path apps/runner-app/Cargo.toml --test interrupted_command_recovery -- --test-threads=1` — 8 passed.
- `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml --quiet` — 13 passed.
- `cargo fmt --manifest-path apps/runner-app/Cargo.toml -- --check` and `cargo fmt --manifest-path apps/runner-desktop/src-tauri/Cargo.toml -- --check` — passed.
- `node --check apps/runner-desktop/ui/app.js` and `git diff --check` — passed.

Windows review build `41155738291` was dispatched for version `0.2.53` from
source SHA `ecba27a9eb14e4a61e94e31d855f8dbfba0a11c0`; it must complete before
the artifact or its checksum can be claimed. The workflow produces an
unsigned-review installer, not a public release. Runtime acceptance remains
pending: the installer has not been installed on the existing owner device,
and neither target has been reconnected from that device after this change.
