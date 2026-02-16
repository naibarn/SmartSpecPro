# Section 01: Data Schema, Migration, and Index Foundation

## Objective
Establish the additive database foundation for funnel analytics by introducing `funnel_events` and performance-critical indexes, without regressing existing auth, credit, or analytics workloads.

## Scope
- Define `funnel_events` schema in Drizzle with columns needed for milestone analytics, tenant/domain scoping, dedup keys, and event timestamps.
- Add non-destructive indexes for high-read analytics paths on both new and existing tables.
- Prepare migration sequencing and operational checks for low-lock production execution.
- Ensure schema supports deterministic first-event uniqueness constraints required by later sections.

## Out of Scope
- Tracker service behavior and side-channel analytics calls.
- Event instrumentation in business flows.
- Router procedures and frontend rendering.
- Backfill execution logic.

## Dependencies
- None. This is the root section.

## Implementation Tasks
1. Extend Drizzle schema with `funnel_events` table including explicit scoping fields (`tenant`, `domain`, `user`, `event_name`, `event_time`, `event_key`, properties payload).
2. Add DB-level uniqueness strategy for deterministic first-event dedup contract (`event_key` uniqueness or equivalent constrained index).
3. Add planned supporting indexes on existing tables used by funnel aggregations (time-bucket and user/tenant query paths).
4. Generate migration files with additive operations only.
5. Validate migration ordering with current journal state and avoid renumbering collisions.
6. Write migration-run instructions with pre/post checks (index existence, row-count sanity, query plan smoke checks).

## TDD-First Test Stubs
- Test: schema contract includes required `funnel_events` columns and index definitions.
- Test: uniqueness constraint rejects duplicate first-event records with identical dedup key.
- Test: migration ordering test confirms new migration appears in expected sequence.
- Test: non-destructive migration check ensures no drop/alter operations on existing critical columns.
- Test: index presence verification confirms required indexes are created after migration.

## Risk Controls
- Use additive expand-first migration sequence only.
- Keep migration rollback-safe by allowing feature-flag disable without schema rollback for routine incidents.
- Schedule lock-sensitive index operations for low-traffic windows and capture pre-run DB snapshot metadata.

## Deliverables
- Updated Drizzle schema and migration files.
- Migration execution and verification checklist.
- Schema/index test coverage proving dedup and index contract readiness.

## Done Criteria
- `funnel_events` exists with dedup-ready uniqueness enforcement.
- Required analytics indexes exist and are verifiable.
- Migration and schema tests pass in CI.
- No destructive schema behavior introduced.

## As-Built Update (2026-02-16)

### Files Changed
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0026_add_funnel_events.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/server/__tests__/funnelEvents.schema.test.ts`
- `apps/web/server/__tests__/funnelEvents.migration.test.ts`

### Implementation Notes
- Added `funnel_events` Drizzle schema with required scope columns, canonical event timestamp, deterministic dedup key, and JSONB properties payload.
- Added DB-level uniqueness via `funnel_events_event_key_unique`.
- Added analytics indexes for tenant/domain/event and user drilldown query paths.
- Added supporting indexes for existing aggregation-heavy sources:
  - `registration_events_created_user_idx`
  - `messages_created_at_idx`
  - `credit_transactions_type_created_idx`

### Deviation From Plan
- Supporting indexes on existing tables were narrowed to three high-impact paths (`registration_events`, `messages`, `credit_transactions`) for low-lock rollout safety. Additional read-optimization indexes can be added after query profiling in section 04.

### Tests Added
- `apps/web/server/__tests__/funnelEvents.schema.test.ts`
- `apps/web/server/__tests__/funnelEvents.migration.test.ts`

### Migration Run Instructions (Section 01)
1. Pre-check:
   - Confirm journal sequence contains `0026_add_funnel_events`.
   - Capture baseline row counts for `registration_events`, `messages`, and `credit_transactions`.
2. Apply migration in a low-traffic window.
3. Post-check:
   - Validate `funnel_events` table exists with `funnel_events_event_key_unique`.
   - Validate index creation for the three supporting source tables.
   - Run `npm --workspace @smartspec/web test -- server/__tests__/funnelEvents.schema.test.ts server/__tests__/funnelEvents.migration.test.ts`.
