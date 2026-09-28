# Hermes Windows OAuth and Connection History Repair

## Approved outcome

Repair the private Worker App xAI OAuth flow without inheriting the host's
secret-bearing environment, publish Worker App 0.1.132, and reduce Settings
page clutter by separating actionable connections from collapsed terminal
history.

## Runtime design

The Worker App continues to call Hermes with `env_clear()`. It adds only the
non-secret OS path variables Hermes/Python require on Windows:
`LOCALAPPDATA`, `APPDATA`, `USERPROFILE`, and `HOME`, alongside the existing
PATH, SystemRoot, and temp variables. `HERMES_HOME` remains the authoritative,
per-connection isolated profile.

Failure diagnostics select the last meaningful stderr/stdout line, redact
credentials, authorization codes, sensitive URL query values, and long
token-like strings, then clamp the result. The Worker App reports that safe
diagnostic to the server and records it locally. Raw OAuth output and tokens
must never enter server events.

Worker App 0.1.132 becomes the minimum compatible desktop Hermes version.
Central Hermes workers remain unaffected.

## UI design

The main list shows only actionable states: pending, authorized,
reauth-required, and entitlement-restricted. Terminal error/disconnected rows
move into a collapsed "Connection history" disclosure. The header shows the
total count. Expanding shows the five newest rows and a "Show more" action in
increments of five.

The current connect-flow error remains visible next to its retry action even
when its row is historical. The admin central-account section displays only
`server_shared` rows, preventing private rows from being duplicated under a
misleading heading. All new labels and accessibility names follow the active
Thai/English language.

## Verification

- Rust tests prove the Windows allow-list, safe diagnostics, and no credential
  leakage.
- React tests prove collapsed-by-default history, five-row limit, show-more,
  active/history partitioning, central-scope admin filtering, localization,
  and disclosure accessibility.
- Focused server tests prove the 0.1.132 version gate.
- Release verification covers installer build, production manifest, checksum,
  health, live worker upgrade, OAuth device-code event, browser consent, and
  capability probe.

