# Section 04: Funnel Analytics Router, Aggregation, and Caching

## Objective
Deliver the backend `funnelAnalytics` API surface with stable MVP contracts, scoped authorization filters, canonical UTC time bucketing, bounded query behavior, and cache controls.

## Scope
- Add and register `funnelAnalytics` router.
- Implement procedures for KPI summary, acquisition, activation, revenue, retention, engagement, lifecycle, time series, raw events, and export.
- Enforce `admin` / `domain_admin` access boundaries with tenant-first and domain-fallback filtering.
- Lock UTC day/week/month bucket semantics across API responses and export outputs.
- Apply heavy-range bounds and short-TTL caching with explicit invalidation hooks.

## Out of Scope
- Frontend tab implementation details.
- Backfill campaign processing.
- Final operational rollout decisioning.

## Dependencies
- section-01-data-schema-migration-and-index-foundation
- section-02-tracker-service-dedup-and-analytics-sidechannels

## Implementation Tasks
1. Create router file and register it in the top-level app router.
2. Define validated input schemas and response contracts for each funnel procedure.
3. Implement shared query helpers for UTC bucketing and metric derivation logic.
4. Implement tenant/domain scope resolver for role-aware query filters.
5. Add query bounds for expensive windows and enforce max range behavior.
6. Add caching wrapper for summary procedures with bypass/invalidation hooks (backfill checkpoints, feature-flag transitions, manual refresh).
7. Implement export endpoints aligned to API buckets/labels and role-based data exposure defaults.

## TDD-First Test Stubs
- Test: router registration exposes expected procedures and guards unauthorized roles.
- Test: domain-admin requests are limited to allowed tenant/domain scope.
- Test: UTC bucketing is consistent across day/week/month procedures.
- Test: export bucket labels match API payload buckets for identical date ranges.
- Test: heavy query range limits reject or clamp out-of-policy requests.
- Test: cache invalidates or bypasses on backfill checkpoint and rollout-state triggers.

## Risk Controls
- Freeze MVP response shapes to prevent frontend contract churn.
- Keep raw-event procedures isolated from cached aggregate paths.
- Capture structured logs for fallback-to-domain filter paths.

## Deliverables
- `funnelAnalytics` router with full MVP and phase-2 procedure surface.
- Shared UTC-bucket query utility and scoped-filter helpers.
- Router-level and integration-level tests for scope, bucketing, and cache behavior.

## Done Criteria
- Backend API contracts are stable for MVP tabs.
- UTC semantics are consistently applied across APIs and exports.
- Role/scoping tests prove no cross-tenant leakage.

## Actual Implementation

### Files Created
- `apps/web/server/routers/funnelAnalytics.ts` — Router with 5 procedures: summary, timeSeries, rawEvents, export, invalidateCache
- `apps/web/server/routers/funnelAnalytics.test.ts` — 14 unit tests for helpers and stage presets

### Files Modified
- `apps/web/server/routers.ts` — Registered funnelAnalyticsRouter in appRouter

### Procedures
| Procedure | Auth | Cached | Stage Filter | Description |
|-----------|------|--------|-------------|-------------|
| summary | domainAdmin | Yes (5min TTL) | Yes | Aggregate event counts by eventName |
| timeSeries | domainAdmin | Yes (5min TTL) | Yes | Time-bucketed (day/week/month) event counts |
| rawEvents | domainAdmin | No | No (eventName filter) | Paginated raw event list with properties |
| export | domainAdmin | No | Yes | CSV/JSON export of bucketed aggregates |
| invalidateCache | domainAdmin | N/A | N/A | Clear cache for tenant via SCAN |

### Stage Presets (server-side eventName filtering)
- `acquisition`: signup_completed, email_verified
- `activation`: first_conversation, first_llm_request
- `usage`: first_media_generation
- `revenue`: purchase_completed, subscription_started

### Deviations from Plan
- **Generic + stage filter instead of dedicated stage procedures**: Per user decision, a single summary/timeSeries procedure with optional `stage` parameter replaces multiple dedicated procedures. Simpler API surface, same filtering capability.
- **CSV injection protection**: Added escapeCsvField() after code review identified formula injection risk.
- **SCAN-based cache invalidation**: Replaced redis.keys() with scanStream to avoid blocking Redis.
- **Strict tenant scope**: Throws TRPCError instead of falling back to "default" tenantId.
- **Restrictive role default**: Defaults to "domain_admin" when role is missing (safer than "admin").
- **Scope logging**: Added structured console.log for scope resolution audit trail.

### Test Coverage
- 14 tests covering: scope filter (4), date range clamping (3), UTC bucket SQL (4), stage presets (3)
- All 14 passing
