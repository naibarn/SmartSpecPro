# Worker App one-click installer update

## Problem

The Worker App update prompt currently calls `worker_app_open_url`, which only
opens the dashboard download URL in the default browser. It does not download,
launch, or report the installer lifecycle, so the user must finish the update
manually.

## Decision

Keep the existing startup version check and same-origin URL policy, but replace
the browser-open action with a Tauri command that:

1. validates the URL against the configured Smart AI Hub origin;
2. downloads the installer to a unique temporary `.download` file;
3. requires a successful HTTP response, a non-empty payload, and the Windows
   `MZ` executable signature before promoting it to the installer path;
4. stops the worker loop, launches the installer normally so Windows/UAC can
   show its standard install UI, and schedules the Worker App to exit;
5. returns actionable errors before exit and lets the UI show the download and
   launch state.

The installer remains a normal visible NSIS installer. This avoids silent
installation failures and preserves the user's standard Windows permission and
install-location flow. The command is Windows-only; non-Windows builds return a
clear unsupported-platform error.

## Failure and security behavior

- Cross-origin and non-HTTP(S) URLs remain rejected.
- Partial downloads never become the executable path; they remain under the
  temporary update directory and are overwritten on the next attempt.
- HTTP errors, empty files, invalid executable signatures, filesystem errors,
  and process-launch errors are surfaced in the native error dialog.
- The app stops its worker loop before launching the installer so the running
  executable is not holding active work while NSIS replaces it.

## Verification

- Rust tests cover same-origin validation and installer payload/signature
  validation helpers.
- Worker App TypeScript build and full Rust test suite must pass.
- The final Windows release must be rebuilt with the next patch version and
  copied to both dashboard release locations.
