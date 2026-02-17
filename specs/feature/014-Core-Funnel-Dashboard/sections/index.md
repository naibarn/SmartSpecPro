<!-- SECTION_MANIFEST
section-01-data-schema-migration-and-index-foundation
section-02-tracker-service-dedup-and-analytics-sidechannels
section-03-milestone-event-instrumentation-and-idempotency
section-04-funnel-analytics-router-aggregation-and-caching
section-05-admin-dashboard-route-tabs-and-export-ux
section-06-backfill-checkpointing-reconciliation-and-consistency-gates
section-07-security-rbac-tenant-scope-and-privacy-controls
section-08-rollout-slo-gates-rollback-and-operational-runbooks
section-09-verification-suite-and-release-readiness
END_MANIFEST -->

<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web test
END_PROJECT_CONFIG -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-data-schema-migration-and-index-foundation | - | section-02, section-04, section-06 | Yes |
| section-02-tracker-service-dedup-and-analytics-sidechannels | section-01-data-schema-migration-and-index-foundation | section-03, section-04, section-06 | Yes |
| section-03-milestone-event-instrumentation-and-idempotency | section-02-tracker-service-dedup-and-analytics-sidechannels | section-06, section-09 | No |
| section-04-funnel-analytics-router-aggregation-and-caching | section-01-data-schema-migration-and-index-foundation, section-02-tracker-service-dedup-and-analytics-sidechannels | section-05, section-06, section-07, section-09 | No |
| section-05-admin-dashboard-route-tabs-and-export-ux | section-04-funnel-analytics-router-aggregation-and-caching | section-07, section-08, section-09 | No |
| section-06-backfill-checkpointing-reconciliation-and-consistency-gates | section-01-data-schema-migration-and-index-foundation, section-02-tracker-service-dedup-and-analytics-sidechannels, section-03-milestone-event-instrumentation-and-idempotency, section-04-funnel-analytics-router-aggregation-and-caching | section-08, section-09 | No |
| section-07-security-rbac-tenant-scope-and-privacy-controls | section-04-funnel-analytics-router-aggregation-and-caching, section-05-admin-dashboard-route-tabs-and-export-ux, section-06-backfill-checkpointing-reconciliation-and-consistency-gates | section-08, section-09 | No |
| section-08-rollout-slo-gates-rollback-and-operational-runbooks | section-05-admin-dashboard-route-tabs-and-export-ux, section-06-backfill-checkpointing-reconciliation-and-consistency-gates, section-07-security-rbac-tenant-scope-and-privacy-controls | section-09 | No |
| section-09-verification-suite-and-release-readiness | section-03-milestone-event-instrumentation-and-idempotency, section-04-funnel-analytics-router-aggregation-and-caching, section-05-admin-dashboard-route-tabs-and-export-ux, section-06-backfill-checkpointing-reconciliation-and-consistency-gates, section-07-security-rbac-tenant-scope-and-privacy-controls, section-08-rollout-slo-gates-rollback-and-operational-runbooks | - | No |

## Execution Order

1. section-01-data-schema-migration-and-index-foundation (no dependencies)
2. section-02-tracker-service-dedup-and-analytics-sidechannels (after section-01)
3. section-03-milestone-event-instrumentation-and-idempotency (after section-02)
4. section-04-funnel-analytics-router-aggregation-and-caching (after section-01 and section-02)
5. section-05-admin-dashboard-route-tabs-and-export-ux (after section-04)
6. section-06-backfill-checkpointing-reconciliation-and-consistency-gates (after section-01, section-02, section-03, and section-04)
7. section-07-security-rbac-tenant-scope-and-privacy-controls (after section-04, section-05, and section-06)
8. section-08-rollout-slo-gates-rollback-and-operational-runbooks (after section-05, section-06, and section-07)
9. section-09-verification-suite-and-release-readiness (final)

## Section Summaries

### section-01-data-schema-migration-and-index-foundation
Add `funnel_events`, introduce required analytics indexes, and establish additive migration ordering and rollback-safe DB preparation.

### section-02-tracker-service-dedup-and-analytics-sidechannels
Implement the core funnel tracker service, deterministic dedup-key strategy, uniqueness enforcement contract, and non-blocking PostHog/GA4 side channels.

### section-03-milestone-event-instrumentation-and-idempotency
Instrument signup, verification, activation, usage, media, and revenue milestones so first-event semantics remain deterministic under retries.

### section-04-funnel-analytics-router-aggregation-and-caching
Create the `funnelAnalytics` router procedures with UTC bucket semantics, scoped filtering, range guards, cache policy, and export contracts.

### section-05-admin-dashboard-route-tabs-and-export-ux
Ship `/admin/funnel` UI with phased tabs, resilient panel behavior, date/refresh controls, and export interactions aligned to backend contracts.

### section-06-backfill-checkpointing-reconciliation-and-consistency-gates
Build idempotent milestone backfill with checkpoint resume, pause/abort controls, duplicate diagnostics, and consistency gates for production readiness.

### section-07-security-rbac-tenant-scope-and-privacy-controls
Harden access and data boundaries: role checks, tenant/domain fallback audits, export safeguards, rate controls, and payload sanitization.

### section-08-rollout-slo-gates-rollback-and-operational-runbooks
Define operational rollout gates, canary policy, rollback triggers/actions, and owner-oncall response windows.

### section-09-verification-suite-and-release-readiness
Deliver the final end-to-end validation matrix and release gate checklist spanning functional, security, integrity, performance, and compatibility criteria.
