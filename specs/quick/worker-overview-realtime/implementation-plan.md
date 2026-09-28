# Implementation plan

1. Add a shared UI status model for connection state, expiry, last check, and reconnect guidance. Update `WorkerTopbar` and `WorkerAppShell` to consume it.
2. Replace the health timer's hour-long disconnected sleep with a five-second, non-overlapping health refresh. Keep the existing retry budget and notification deduplication.
3. Fetch the all-Series worker queue for Overview and pass executor/remote queue data to `CanonicalWorkerRouteScreen`. Render live summary cards and links without duplicating queue mutations.
4. Localize all new copy through the existing Worker locale. Make timestamps and status labels explicit.
5. Add focused tests for the status matrix and queue aggregation, then run worker/web typechecks, Rust checks, formatting, and existing focused suites.

Risks: repeated full doctor checks are expensive, so the existing executor refresh remains separate from the connection health cadence; the Overview queue call is read-only and uses the same worker auth boundary as Queue.
