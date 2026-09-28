# Section 07 — Client polling and completion repair

Replace long mutation awaits across the Drama Series UI with submit/poll hooks. Show queued/running/progress/succeeded/failed and a background-running state after polling budget expiry. Persist active job IDs on the server-backed workspace; refresh must rehydrate status/result. Add server completion checks after full-story generation for episode, shot and dialogue completeness. Missing content enqueues a real repair job with normal billing and is not reported as complete until the repair succeeds.

Tests cover UI state transitions, refresh recovery, duplicate-submit guard, plan-to-draft chain, missing-dialogue repair, and terminal failure rendering.
