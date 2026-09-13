# Research notes

- `speaker-aware-runner.py` already computes adapter capabilities from real
  imports and model paths, but only exposes them in a scan result.
- The signed runtime manifest includes `speaker-aware-runner.exe`, while the
  runtime archive contains no Silero, MediaPipe, or pyannote weight files.
- `worker_app_submit_speaker_aware_job` currently probes only runner
  `--version`, so adapter-level readiness is deferred until job execution.
- Tauri commands are registered centrally in `src-tauri/src/lib.rs`; settings
  are persisted as JSON under the app data directory.
- The UI already has a Runtime route with update/repair and detailed readiness
  messaging. The new model manager belongs there and can use the existing
  native file dialog.
