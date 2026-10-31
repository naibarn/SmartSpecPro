# Windows Runner Website Save While Running — 2026-10-31

Source: `2c315edae371a580dab24620c0cd41a0249beb17` (`fix(runner): save next launch website while running`).

## Root cause

`save_connection_environment` rejected every save while the Runner loop was active with `RUNNER_STOP_BEFORE_ENVIRONMENT_CHANGE`. The UI catch handler then cleared `connectionEnvironmentDirty` and refreshed status, which replaced the user's unsaved selection with the persisted Production target. This made the website selector appear to save and then revert.

## Repair

The save command now persists the next-launch environment regardless of whether the Runner loop is running. It does not mutate the current process's already-loaded RunnerConfig or reconnect it; the selected Production/Developer target takes effect after restarting the app. On save failure, the UI keeps the selection dirty so a status refresh cannot overwrite it.

## Verification

- `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml -- --test-threads=1` — 14 passed.
- `cargo fmt --manifest-path apps/runner-desktop/src-tauri/Cargo.toml -- --check` — passed.
- `node --check apps/runner-desktop/ui/app.js` — passed.
- `git diff --check -- apps/runner-desktop/src-tauri/src/main.rs apps/runner-desktop/ui/app.js` — passed.
- Windows review build workflow 41158883985 was dispatched from this exact source SHA. Its Runner release UI/API job passed; the Windows installer job is still running at the Tauri CLI installation step at evidence capture time.

## Runtime status

No owner Windows installation was changed. The new build is not yet available, and the existing Windows device has not yet verified website selection persistence, authentication, capability ACK, or heartbeat. Live Runner runtime acceptance remains pending.
