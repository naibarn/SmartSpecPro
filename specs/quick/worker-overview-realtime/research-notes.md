# Research notes

- `main.tsx` already owns saved connection, connection health, executor state, loop state, and runtime doctor state, but the health retry effect currently sleeps for an hour after a disconnected result and the top bar receives only a boolean.
- `CanonicalWorkerRouteScreen` already fetches server queue data for Queue and local executor state, but Overview does not receive active jobs or the queue breakdown.
- `/api/workers/:workerId/queue` supports an optional `seriesId`; without it, the authenticated worker sees all non-archived Series work permitted to that worker.
- Rust `ExecutorState.active_jobs` is the authoritative multi-lane local activity list; `queue_depth` is the worker claim depth and `last_completed_job` can represent a failed terminal result.
- No new dependency or schema is required.
