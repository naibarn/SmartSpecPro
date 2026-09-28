# Implementation plan

## Objective

Deliver a reliable structured xAI device-code flow on Windows and prevent
Settings from staying silently pending when an incompatible worker emits a
raw-only event.

## Approach

1. Add Rust regressions matching the real Hermes 0.18.2 multi-line output.
   Remove raw candidate emission, keep exactly-once structured emission, and
   add Windows `CREATE_NO_WINDOW` to the shared Hermes spawn path.
2. Add server regression coverage that maps a raw-only device event to
   `HERMES_PROCESS_FAILED` without returning raw content. Reuse the current UI
   error/retry card and add explicit waiting-stage copy where appropriate.
3. Raise the desktop minimum to 0.1.133, run focused/full gates, build the NSIS
   installer, atomically deploy web assets/server code, and verify production.

## Risks and mitigations

- Lost device event: fixture tests deliver URL and code on separate lines.
- Secret leakage: raw content is checked only for presence and is never
  returned or logged.
- Visible console regression: Windows-only process flag; other platforms
  retain current behavior.
- Duplicate attempts: verification waits for the current attempt to terminate
  before starting one new connection.

## Acceptance criteria

- Exactly one event contains `verificationUrl` and `userCode`.
- No raw-only device event is emitted by Worker App 0.1.133.
- Hermes does not open a console window on Windows.
- Legacy raw-only events produce a visible recoverable error instead of
  indefinite "Connecting".
- Production serves a byte-identical 0.1.133 installer.
- A live 0.1.133 attempt reaches the device authorization screen.

## Verification status (2026-07-20)

- Complete: structured URL/code parser regression against Hermes 0.18.2 output.
- Complete: raw-only legacy event recovery, private-worker readiness gate, and
  UI polling stop regression.
- Complete: Windows x64 NSIS 0.1.133 cross-build with `CREATE_NO_WINDOW`.
- Complete: production health, latest-release metadata, file size, and
  byte-identical SHA-256 verification.
- Pending user-side proof: install 0.1.133 on the Windows machine and start one
  fresh authorization attempt.
