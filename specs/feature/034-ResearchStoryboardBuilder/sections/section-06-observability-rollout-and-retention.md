# Section 06 - Observability Rollout And Retention

## Objective

Add the operational controls needed to ship preview-first structured results safely: preview retention, phased rollout gates, routing and commit telemetry, and failure visibility.

## Prerequisites

- Section 02 complete.
- Section 03 complete.
- Section 04 complete.
- Section 05 complete.

## Scope

- Define retention and cleanup rules for ephemeral previews.
- Add metrics and logs for parsing, routing, preview creation, commit attempts, and commit failures.
- Stage rollout so preview-only behavior can be validated before commit paths are broadly enabled.

## Primary files and areas

- Agency routing and persistence services
- Any background cleanup or scheduled job locations
- Existing metrics/audit infrastructure for agency and presentation flows
- Feature-flag or settings infrastructure used for phased rollout

## Required implementation work

### 1. Define preview retention

Establish:

- preview retention window
- cleanup trigger or job
- what immutable metadata remains after preview cleanup
- UI behavior for expired previews
- payload-size thresholds for inline preview storage versus referenced snapshot storage
- operational behavior for very large previews, including truncation or summarization at API boundaries

For Phase 1, operational defaults are:

- inline threshold: `64KB`
- out-of-line snapshot storage for anything above `64KB`
- hard limit: `5MB` for direct preview persistence
- previews exceeding the hard limit must store a summarized preview or fail structured preview persistence deterministically

### 2. Add observability

Record and expose:

- parse success and failure rates
- preview creation rates
- preview expiration counts
- commit success and failure rates
- duplicate commit suppression counts
- deck creation failure causes

### 3. Phase rollout

Roll out in stages:

1. structured persistence plus preview-only
2. research and storyboard commit flows
3. deck commit flow
4. broader template exposure

Each stage should have explicit health checks before moving to the next.

## Tests to write first

- Node test: preview expiration changes state but leaves immutable run metadata accessible.
- Node test: commit and parse metrics are emitted for success and failure cases.
- Node test: feature gates can disable commit while leaving preview enabled.
- Operational verification stub: preview-only rollout can be enabled without deck commit exposure.

## Risks and safeguards

- Storage growth risk if previews never expire. Add cleanup and state transitions.
- Silent failure risk if parse/commit metrics are missing. Make logs and counters part of the acceptance criteria.
- Rollout blast-radius risk if deck commit launches too early. Gate each stage independently.

## Exit criteria

- Preview retention and expiration behavior is defined and implemented.
- Core parse/routing/commit telemetry is available.
- Feature-gated phased rollout path exists for preview and commit features.

## Implementation notes

- Added `apps/web/server/services/agencyPreviewLifecycleService.ts` with a Phase 1 preview retention policy: previews older than 7 days are marked `expired_preview` opportunistically on preview read/commit.
- `agency.getRunPreview` and `agency.commitPreview` now apply the retention check before loading preview details so stale previews become non-committable without mutating immutable run metadata.
- Added `recordAgencyPreviewMetric()` hooks around structured-result parse outcomes, preview expiration, commit success, commit failure, and commit-blocked rollout checks.
- `agency.commitPreview` now honors tenant rollout flags for library-backed commits and deck commits separately, allowing preview-only rollout while commit paths remain disabled.
- Template exposure is also feature-gated: built-in experience seeding only happens when `AGENCY_TEMPLATE_EXPERIENCES_ENABLED` is enabled for the tenant.
- The observability layer is intentionally lightweight in Phase 1: metrics emit through structured application logs, while the retention trigger remains opportunistic rather than a scheduled cleanup worker.

## Tests added and updated

- `apps/web/server/services/agencyPreviewLifecycleService.test.ts`
- `apps/web/server/routers/__tests__/agency.test.ts`

## Known follow-ups

- Preview expiration currently runs on preview read/commit rather than via a background sweep, so long-idle previews are cleaned up lazily.
- Telemetry currently emits structured logs; if operators need aggregated counters or dashboards, the next step is to bind these events into the system’s metrics backend.
