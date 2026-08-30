# TDD guidance

- Test connection status mapping for no session, pending approval, healthy with expiry, transient/unavailable, expired/reconnect-required, and loop stopped.
- Test queue aggregation across active local jobs and remote queued/processing/failed/expired/canceled records.
- Test polling cleanup and no overlapping refresh calls where the hook/component owns a timer.
- Preserve existing Tauri executor, series workspace, server control-plane, and WorkerAccessKeysPanel tests.
