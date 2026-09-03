# Worker App detailed diagnostics and log export

## Goal

Make an unexpected Worker App shutdown diagnosable after the process is gone,
while giving a non-technical user a one-click way to export the evidence.
The feature is local-only and must not require editing `.env` or placing private
keys in the application.

## Design

- Keep the existing JSONL event log and rotation, but add durable session state
  so the next launch records whether the previous process ended unexpectedly.
- Install a panic hook during application setup. It writes a bounded panic
  event and backtrace before the process terminates.
- Capture WebView `error` and `unhandledrejection` events into the same local
  log so frontend failures are not lost in a GUI build without a console.
- Record startup, clean shutdown, self-update shutdown, worker-loop lifecycle,
  runtime checks, child-process start/exit, and capped stdout/stderr excerpts.
- Use the existing `errors`, `standard`, and `verbose` levels from settings;
  expose them in the Worker App Settings UI. Default remains `standard`.
- Redact token/private-key-like values and cap diagnostic text. No refresh,
  execution, device-proof, or signing private key is written to disk.
- Preserve the current 8 MiB file limit and five rotated generations.
- Add a native Save dialog command that writes a single timestamped
  `smart-ai-hub-worker-diagnostics-*.jsonl` export containing the current and
  rotated logs. Also retain an `Open log folder` button as a fallback.

## User flow

1. User opens Settings in Worker App.
2. User chooses a diagnostics level if needed.
3. User clicks `Download diagnostics` and chooses a save location.
4. The app writes the merged, ordered log export and reports the exact path.

The download is a copy of local logs; it does not upload anything to the
server. The UI explains this and warns the user to treat the file as sensitive
operational data even though credentials are redacted.

## Acceptance criteria

- A clean close produces `app.exit` and a clean session marker.
- A process killed or panicking before clean close is identified on next start
  as an unclean previous session.
- Panic evidence is persisted without requiring a visible console window.
- Runtime and sidecar failures include command identity, exit status, elapsed
  time, and bounded redacted output where available.
- Log size remains bounded and export includes all existing generations.
- Download works from the UI without browsing `%APPDATA%` manually.
- No private key, access token, refresh token, or token-bearing URL appears in
  tests or exported logs.
- Rust tests, frontend build, Windows release build, and release endpoint
  parity are verified for the new Worker App version.

## Non-goals

- No remote telemetry or automatic upload.
- No changes to server authentication or runtime signing policy.
- No macOS build; this release remains Windows-only as requested previously.
