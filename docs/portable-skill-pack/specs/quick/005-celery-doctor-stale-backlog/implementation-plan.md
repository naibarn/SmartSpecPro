# Implementation plan

1. Add a pure `deriveQueueUserState` helper and use it when normalizing SQL
   aggregates.
2. Query pending rows by claim state and retain a bounded list of stale task IDs.
3. Aggregate semantic stale counts and pass affected IDs from the monitor.
4. Extend auto-report normalization/dedup storage for affected IDs.
5. Update admin copy and counters.
6. Prove the capacity/backlog/stall matrix with focused tests.
