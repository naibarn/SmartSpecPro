# TDD plan

- Rust unit tests: safe roots, source checksum, probe normalization, time-map math, segment bounds, audio policy and manifest validation.
- Media fixtures: speech, leading/trailing/middle silence, black/frozen frames, multiple scenes, no-audio and corrupt files.
- HyperFrames compatibility: CLI help, Thai `large-v3`, word-level transcript artifact, missing binary/model and version mismatch.
- Job lifecycle: queue, running, heartbeat, cancellation, retry classification, restart reconciliation and idempotent completion.
- Render fixtures: exact B-roll start/end, source in/out, mute default, overflow rejection, preview/final separation and failed-QC non-publication.
- Control-plane fixtures: ordered event delivery, duplicate replay, expired-token refresh, stale lease, staged-artifact reuse and unsent-event outbox recovery.
- Benchmark/doctor: CPU/RAM/time budgets, concurrency backpressure and temp cleanup.
