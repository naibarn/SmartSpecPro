# Research notes

- `apps/worker-app/src-tauri/src/diagnostics.rs` already appends JSONL and
  rotates at 8 MiB with five generations. It has safe token references but no
  panic hook, session marker, or export operation.
- `apps/worker-app/src-tauri/src/lib.rs` logs `app.start` and a normal
  `app.exit`; the process is a Windows GUI subsystem, so console panic output
  is not dependable. Self-update is another intentional exit path.
- `apps/worker-app/src-tauri/src/settings.rs` already defines and persists
  `DiagnosticsLevel`; the frontend type/default also exists, but no visible
  selector currently uses it.
- `worker_app_get_diagnostics_log` currently exposes the log path and folder,
  and the UI can open the folder. It needs a save/export command and buttons.
- Render sidecars write `render.log` in the job directory and keep only a
  bounded in-memory tail for errors. This is useful but does not explain a
  process-level shutdown, so lifecycle events must be added to the app log.
- SocratiCode discovery was unavailable in this environment; targeted `rg` and
  bounded source reads were used instead.
