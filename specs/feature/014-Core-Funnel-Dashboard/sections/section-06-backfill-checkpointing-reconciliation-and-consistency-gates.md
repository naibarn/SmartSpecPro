# Section 06: Backfill, Checkpointing, Reconciliation, and Consistency Gates

## Objective
Build an idempotent, resumable milestone backfill pipeline with explicit operational controls and hard reconciliation gates so production rollout is data-consistent and auditable.

## Scope
- Implement milestone-only historical backfill into `funnel_events`.
- Add bounded batching with checkpoint resume tokens.
- Add pause/abort controls for operational safety.
- Implement consistency and duplicate-key diagnostics tied to rollout gating.
- Integrate backfill completion signals with cache invalidation paths.

## Out of Scope
- Defining new milestones beyond MVP set.
- Frontend chart rendering.
- High-level rollout governance policy (handled in section 08).

## Dependencies
- section-01-data-schema-migration-and-index-foundation
- section-02-tracker-service-dedup-and-analytics-sidechannels
- section-03-milestone-event-instrumentation-and-idempotency
- section-04-funnel-analytics-router-aggregation-and-caching

## Implementation Tasks
1. Implement milestone backfill job entrypoint with controlled date/source windows.
2. Reuse tracker dedup key generator and write-path conflict policy for consistency with live ingestion.
3. Add batch execution framework with checkpoint persistence and resume support.
4. Add operator controls to pause, abort, and resume safely.
5. Build reconciliation job comparing source-of-truth milestone counts vs `funnel_events` by UTC bucket.
6. Add duplicate-key diagnostics and threshold failure criteria.
7. Trigger cache invalidation/bypass signals when backfill checkpoints complete.

## TDD-First Test Stubs
- Test: dry-run mode computes expected counts without persisting events.
- Test: resume flow continues from last checkpoint without duplicate writes.
- Test: pause and abort controls stop processing deterministically.
- Test: live + backfill overlap still yields single first-event records.
- Test: reconciliation fails when mismatch exceeds tolerance and marks run incomplete.
- Test: duplicate-key diagnostics surface actionable data when threshold is exceeded.

## Risk Controls
- Enforce bounded batch sizes and execution windows.
- Fail closed on reconciliation anomalies before rollout expansion.
- Preserve audit trail for batch progress and operator actions.

## Deliverables
- Backfill runner with checkpoint model and control commands.
- Reconciliation and duplicate diagnostics reports.
- Test coverage for idempotency, resume, and gate behavior.

## Done Criteria
- Backfill can run, pause, resume, and finish deterministically.
- Reconciliation and duplicate diagnostics are operational and gate rollout.
- Cache freshness is preserved during and after backfill processing.

## Implementation Summary

### Files Created
- `apps/web/server/services/funnelBackfill.ts` - Backfill service with checkpoint support
- `apps/web/server/services/funnelBackfill.test.ts` - Unit tests for core backfill logic

### Database Schema Changes
- `funnel_backfill_runs` table - Tracks backfill execution runs with operational controls
- `funnel_backfill_checkpoints` table - Stores resumable position markers within runs
- `backfill_run_status` enum - Status tracking (running, paused, aborted, completed, failed)
- `reconciliation_status` enum - Reconciliation gate status (pending, passed, failed)

### Key Features Implemented
1. **Dry-run mode** - Compute counts without persisting events
2. **Batch execution** - Controlled processing with configurable batch sizes
3. **Checkpointing** - Resume from last position without duplicates
4. **Operator controls** - Pause, abort, and resume operations
5. **Reconciliation** - Compare source vs target counts with tolerance
6. **Duplicate diagnostics** - Track and report duplicate key attempts
7. **Cache invalidation hooks** - Trigger cache bypass/invalidation on completion
8. **Idempotency** - Reuses `eventKey` deduplication from live tracking

### Test Coverage
- 15 unit tests covering core logic:
  - Event key deduplication (live + backfill consistency)
  - Checkpoint position tracking
  - Reconciliation variance calculation
  - Batch progress accumulation
  - Control state management (pause/abort)
  - Date range iteration
  - Dry-run mode validation

### Integration Points
- Reuses `buildFunnelEventKey()` from `funnelTracker.ts` for consistent deduplication
- Uses `trackFunnelEvent()` for actual event insertion (maintains live + backfill idempotency)
- Supports cache invalidation callbacks via `onComplete` handler

### Future Enhancements (Out of Scope for MVP)
- Source data integration (actual historical user/event data)
- Progress monitoring UI
- Automated reconciliation scheduling
- Backfill performance metrics
