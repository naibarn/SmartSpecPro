# Code Review: Section 02 — UI and Server Integration

Final status: APPROVE

Initial review requested two changes:

1. High — server canonical semantics were conditional, so old episodes without
   storyboard/start-frame metadata could still fall back to raw clip counting.
2. Medium — tests injected prepared UI counts and did not prove router
   one-per-shot submission or canonical partial fallback.

Both findings were fixed. The server now always uses the canonical resolver,
the panel derives readiness from raw episode artifacts, and focused coverage
proves clip-derived fallback, partial semantics, router resolver inputs, and
the exact selected clips submitted to the assembly job.

The re-review found no remaining blocker/high/medium issues and confirmed
authorization remains scoped through `loadOwnedEpisode`.
