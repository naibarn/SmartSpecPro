# Runner background probe window regression (2026-10-19)

## Evidence and cause

The supplied redacted Windows debug report identifies desktop 0.2.34
(build date 2026-10-17T22:16:01Z), a Playwright-cache Chromium executable,
and a previous RUNNER_CONNECTION_INTERRUPTED while the Runner is running.
The report is inventory/status, not a process creation trace; it cannot prove
which executable produced every reported window.

Source inspection found that capability scans run at connection startup,
credential changes and every 120 seconds. Browser readiness first executed
`chrome.exe --version` outside the isolated headless profile. Failure then
executed another version probe. Workspace publication also ran multiple Git
commands without Windows CREATE_NO_WINDOW. These are background paths that
must not create GUI/default-profile or console windows.

## Repair

- Read browser version from the isolated headless CDP version endpoint.
- Reuse that same browser process for authenticated readiness/execution.
- Never retry a failed readiness probe solely to obtain a version string.
- Hide Windows consoles for browser probes and workspace Git inspection.
- Preserve explicit browser pairing, authorized jobs, authorization guards,
  capability refresh, process cleanup and user workspaces.

## Verification and remaining work

Use scoped Rust adapter, workspace_registry, process and lifecycle tests.
The fake executable regression checks repeated scans, unique profiles,
cleanup and rejected grant/adapter behavior. The opt-in real Chromium test
checks three version scans remain unauthenticated and process/profile cleanup.
A native Windows test checks background child GetConsoleWindow returns zero;
the existing desktop review workflow runs the windows_ test scope.

The first Linux Chromium cold launch hit the five-second test deadline;
a subsequent run passed. The version test now uses the existing supported
ten-second bound. This is recorded separately from the Windows symptom.

Windows installer replacement and observation on the affected machine are
required before claiming the user's installed app is repaired. No production
DB changes, SPEC-224 dispatch or website service restart is part of this fix.
