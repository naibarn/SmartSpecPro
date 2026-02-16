# Section 02: Tracker Service, Dedup, and Analytics Side Channels

## Objective
Implement a unified server funnel tracker that writes canonical milestone events reliably, enforces deterministic first-event dedup semantics, and emits non-blocking analytics side-channel events.

## Scope
- Create funnel tracking service with standardized event write contract.
- Implement deterministic dedup key construction and conflict-handling policy (`insert-once`).
- Integrate PostHog server capture and GA4 sender as optional non-blocking side channels.
- Add conflict/health telemetry for dedup and side-channel failures.

## Out of Scope
- Wiring tracker into all business flows.
- Analytics router query procedures.
- Dashboard UI rendering.
- Backfill orchestration.

## Dependencies
- section-01-data-schema-migration-and-index-foundation

## Implementation Tasks
1. Introduce a tracker module that accepts a normalized event payload and persists to `funnel_events`.
2. Define canonical dedup key generation (tenant scope + user + event name + first-occurrence bucket rules).
3. Enforce conflict behavior at write time: preserve first write, ignore duplicate conflict updates.
4. Add service-level result model indicating `inserted`, `duplicate_ignored`, or `failed` states.
5. Implement PostHog and GA4 sender adapters behind existing analytics settings.
6. Ensure side-channel failures never block primary event persistence.
7. Emit structured logs/metrics for conflict rate, side-channel errors, and write latency.

## TDD-First Test Stubs
- Test: tracker writes canonical event shape with required fields and defaults.
- Test: deterministic dedup key generation is stable for identical input.
- Test: duplicate first-event write resolves to conflict-ignored behavior (no second row).
- Test: side-channel adapter failures do not fail primary insert path.
- Test: tracker result model distinguishes inserted vs duplicate vs failure outcomes.
- Test: dedup conflict telemetry is emitted with expected labels.

## Risk Controls
- Keep write path minimal and non-blocking for auth-critical transactions.
- Guard side channels by feature/config toggles and bounded timeout behavior.
- Avoid mutable overwrite semantics for first-event milestones.

## Deliverables
- Funnel tracker service and dedup key helper.
- GA4 sender integration and PostHog side-channel hook.
- Unit tests for dedup, conflict handling, and fail-safe side-channel behavior.

## Done Criteria
- Primary event persistence works independently of external analytics providers.
- Dedup contract is enforced in both service logic and DB constraint behavior.
- Telemetry exists for insert outcomes and failure diagnostics.

## As-Built Update (2026-02-16)

### Files Changed
- `apps/web/server/services/funnelTracker.ts`
- `apps/web/server/services/funnelTracker.test.ts`

### Implementation Notes
- Added `trackFunnelEvent` service with deterministic event-key generation and insert-once conflict behavior (`onConflictDoNothing` on `eventKey`).
- Implemented result model states: `inserted`, `duplicate_ignored`, and `failed`.
- Added optional, non-blocking PostHog and GA4 side-channel dispatch with provider gating from `ANALYTICS_PROVIDER`.
- Added telemetry hooks for insert, duplicate, failed, and side-channel-error outcomes.

### Deviation From Plan
- Analytics provider configuration currently resolves from process env (`ANALYTICS_PROVIDER`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`) rather than dynamic settings reads to keep write-path latency minimal.

### Tests Added
- `apps/web/server/services/funnelTracker.test.ts`
  - canonical event payload and defaults
  - deterministic dedup key stability
  - duplicate conflict handling
  - non-blocking side-channel failures
  - explicit failure result on DB write errors
