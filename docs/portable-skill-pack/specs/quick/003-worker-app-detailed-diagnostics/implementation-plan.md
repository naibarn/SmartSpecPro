# Implementation plan

## Objective

Ship Worker App 0.1.199 with durable local diagnostics, crash evidence, and a
one-click log export from Settings.

## Work units

1. Extend `diagnostics.rs` with a bounded text redactor, lifecycle marker
   helpers, panic-hook installation, and merged export content generation.
2. Wire startup/clean exit/self-update and worker/sidecar lifecycle events in
   `lib.rs`, `commands.rs`, and `worker_loop.rs` without logging credentials.
3. Add `worker_app_export_diagnostics` and register it in Tauri commands. The
   command receives a user-selected destination and writes the merged JSONL
   export atomically.
4. Add Settings controls for diagnostics level, Download diagnostics, and Open
   log folder. Show success/failure state and explain local-only behavior.
5. Bump the Worker App version, rebuild Windows NSIS artifacts, publish the
   installer/manifest into the existing local release path, and verify parity.

## Acceptance and verification

- Unit-test marker transitions, redaction, export ordering, and rotation.
- Run Cargo tests and frontend build.
- Run the Windows cross-target build if the existing toolchain is available.
- Verify installer version, runtime version, and release endpoint metadata.
- Run `git diff --check` and inspect only owned diffs for accidental changes.

## Security boundary

The export must use only the app's own diagnostics directory and a destination
selected by the user. It must not accept arbitrary source paths from the UI.
Redaction must run before writing both the event and export copies.
