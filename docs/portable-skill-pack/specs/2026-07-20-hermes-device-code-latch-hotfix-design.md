# Hermes Device-Code Latch Hotfix

## Approved outcome

Make the Grok browser authorization flow progress reliably on Windows instead
of leaving Settings at "Connecting" with a blank console window.

## Evidence

Production Worker App 0.1.132 claimed the authorization job and emitted
`job.running`. Hermes 0.18.2 printed its real multi-line device flow:

1. `To continue`
2. an `Open` line containing the verification URL
3. an `enter code` line containing the user code

The Worker App emitted and latched a `hermes_device_code` event after line 2.
That event contained only `raw`, so Settings received neither
`verificationUrl` nor `userCode` and polled forever.

## Runtime design

The Worker App accumulates stdout until both a safe verification URL and user
code are parsed. An incomplete raw candidate never emits or latches a device
event. Exactly one structured event is emitted. The production fixture must
match Hermes 0.18.2's real three-line output.

On Windows, Hermes child processes use `CREATE_NO_WINDOW` while retaining
piped stdout/stderr. This removes the blank terminal without changing the
OAuth flow or credential isolation.

## UI and recovery design

Settings continues polling while the connection is pending, but distinguishes
between starting Hermes and waiting for a structured authorization code. A
raw-only legacy event is treated as a typed process failure so an older broken
Worker App cannot leave the UI silently pending. The error surface retains the
existing retry action and Thai/English safety copy.

## Security

Raw OAuth lines are never sent to the server. Device codes remain confined to
the dedicated structured event and the authenticated status response. Logs,
diagnostics, tests, and UI history must not expose token or code values.

## Release and proof

Worker App 0.1.133 is the minimum desktop Hermes control version. Verification
requires Rust tests, focused server/UI tests, typechecks, an NSIS build,
atomic web deployment, production artifact checksum comparison, a 0.1.133
heartbeat, and a new authorization attempt that contains structured
`verificationUrl`/`userCode` fields.
