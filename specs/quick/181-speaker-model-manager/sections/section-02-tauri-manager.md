# Section 02 — persisted model manager and admission

Add `speaker_model_manager.rs`, register it in `lib.rs`, and wire commands in
`commands.rs`. Persist only allow-listed model paths in app data, apply them to
the runner environment, parse `--capabilities`, and validate required stages
before enqueue. Preserve explicit fallback semantics and redact path/token data
from errors returned to the server.

Acceptance: set/clear/status/preflight commands work on real local files;
missing models block before network submission; Rust tests pass.
