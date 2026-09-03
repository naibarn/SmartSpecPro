# Decision log

## Depth

Standard quick plan. The change is cross-file but stays within the Worker App;
there is no DB schema, API contract, or remote telemetry change.

## Decisions

- Use one merged JSONL export rather than a ZIP dependency. It is easy to open,
  attach, and inspect, and avoids adding archive format complexity.
- Use a native save dialog in the frontend and a Rust command for the actual
  copy so the user explicitly chooses the destination.
- Keep standard logging as the default. Verbose output is opt-in and bounded.
- Use a marker file with atomic replacement for crash detection. Missing marker
  is treated as unknown, not as a crash.
- Sync lifecycle/error/panic writes where practical; ordinary event writes stay
  lightweight.

## Risks and mitigations

- Export could expose operational paths: document sensitivity and redact
  secrets, but keep paths because they are needed for local diagnosis.
- A panic hook can itself fail: make it best-effort and never panic/abort again.
- Concurrent app instances can interleave logs: retain session ID and PID.
