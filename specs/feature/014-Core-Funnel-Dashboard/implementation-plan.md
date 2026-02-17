# Implementation Plan - Core Funnel Dashboard

## 1. Delivery Strategy
Implement this feature in controlled, feature-flagged phases so the system can ship value early (MVP tabs) while reducing risk to auth, credit, and analytics-critical flows.

Phase sequencing:
1. Foundation data layer and tracking primitives.
2. Backend analytics router and query contracts.
3. MVP dashboard tabs behind flag.
4. Remaining tabs and deeper event coverage.
5. Hardening, rollout expansion, and operational cleanup.

## 2. Impact and Regression Map
### 2.1 Directly impacted areas
- Database schema and migration pipeline in `apps/web/drizzle`.
- Event-producing backend surfaces across registration, auth/login, chat/LLM usage, media, workflow, and credits.
- Admin analytics router registry and permission handling.
- Admin UI routing and menu-linked pages.
- Export and rate-limited admin query surfaces.

### 2.2 Likely regression paths
- Registration/login latency regression from synchronous event writes.
- Credit transaction side effects if purchase/subscription event emission is coupled incorrectly.
- Mis-scoped domain-admin data visibility due mixed tenant/domain attribution paths.
- Analytics query slowness on larger date ranges without strict limits/caching.
- Incorrect retention metrics if login proxy semantics leak into activity cohorts.

### 2.3 Regression prevention strategy
- Keep event emission non-blocking where analytics side channels are optional.
- Add contract tests for router responses and role-scoped filtering.
- Add focused integration tests around auth, signup bonus, and credit purchase flows.
- Roll out with feature flag disabled by default and enable per environment/canary cohort.
- Track dashboard query latency and error rates before broad enablement.

## 3. Architecture and Workstreams
### 3.1 Workstream A: Schema and index expansion
- Add `funnel_events` table as additive schema change with required indexes.
- Add missing composite/single indexes on existing tables used by funnel queries.
- Ensure migration ordering favors low-lock operations and off-peak execution.

### 3.2 Workstream B: Funnel tracking services
- Introduce unified server tracking service for standardized writes to `funnel_events`.
- Implement first-event dedup guard with deterministic event-key contract for milestone events.
- Persist a canonical dedup key (for example: `tenant_scope + user_id + event_name + first_occurrence_bucket`) and enforce DB-level uniqueness so retries and concurrent writers converge safely.
- Define insert conflict behavior (`insert-once`, no mutable overwrite on conflict) and operationally track conflict counts as integrity signals.
- Integrate existing PostHog server capture and new GA4 sender as non-blocking side channels.
- Keep analytics provider toggles consistent with existing infrastructure settings.

### 3.3 Workstream C: Event integration points
- Wire tracking at verified registration, login/activation, LLM/media, and revenue milestones.
- Prioritize milestone completeness over full-catalog parity in first release.
- Ensure idempotent semantics at integration points where retries are possible.
- Ensure live ingestion and backfill share the same event-key generator and dedup conflict policy.

### 3.4 Workstream D: Analytics router and query layer
- Add `funnelAnalytics` router and register it in app router.
- Implement validated procedures for KPI, acquisition, activation, revenue, retention, engagement, lifecycle, combined series, raw events, and export.
- Freeze MVP API contracts for phase-1 procedures and defer breaking response-shape changes to explicit phase boundaries.
- Apply tenant-first and domain-fallback filtering for `domain_admin`.
- Lock canonical time semantics to UTC bucket boundaries for all server aggregations (`day`, `week`, `month`) and reuse the same bucket rules in exports.
- Enforce query bounds for heavy windows and apply short-lived cache where beneficial.
- Add cache invalidation/bypass hooks tied to backfill checkpoint completion, feature-flag phase transitions, and explicit admin refresh actions.

### 3.5 Workstream E: Frontend dashboard
- Add `/admin/funnel` page route and feature-flag gate.
- Implement 6-tab layout with date controls, KPI row, refresh cadence, and export actions.
- MVP-first tab activation: overview/acquisition/activation/revenue first, then retention/engagement.
- Add loading, empty, and partial-error states so one failing panel does not collapse the full dashboard.

### 3.6 Workstream F: Backfill and operational rollout
- Implement one-time idempotent backfill for core milestone events only.
- Execute backfill in bounded batches with checkpoint resume tokens and explicit pause/abort controls.
- Run staged execution: dry run in lower env, timed production run during low-traffic window.
- Execute reconciliation checks against source-table expected counts and investigate drift.

## 4. Data Safety and Migration Strategy
### 4.1 Risk classification
- Data risk: `low`.
- Justification: changes are additive (new table/indexes + derived inserts), but production index creation and backfill on large tables carry operational risk.

### 4.2 Pre-migration backup plan
- Capture pre-migration database snapshot and migration metadata.
- Export row-count checkpoints for source tables participating in backfill.
- Prepare rollback scripts for newly introduced artifacts (feature-flag disable + stop backfill workers).

### 4.3 Non-destructive migration sequence
1. Expand schema: create new table and indexes; do not alter existing columns/constraints relied on by current features.
2. Deploy read/write capable code paths with feature flag off.
3. Run milestone-only backfill with idempotent guards.
4. Validate row counts and query sanity.
5. Enable dashboard flag for canary admins.
6. Expand rollout and tune performance.

### 4.4 Rollback and restore runbook
- Trigger rollback if any of the following occurs:
  - sustained p95 latency degradation on critical auth/credit endpoints;
  - backfill mismatch exceeds tolerance threshold;
  - cross-tenant data leakage detected;
  - dashboard query error rate exceeds agreed SLO.
- Rollback actions:
  - disable feature flag immediately;
  - stop backfill/reconciliation jobs;
  - restore from pre-migration snapshot only if data corruption is confirmed;
  - keep additive schema in place if safe, but isolate from production reads until remediated.
- Verification after rollback:
  - auth, credit transaction, and chat request smoke checks pass;
  - no new cross-tenant exposure in admin endpoints;
  - database health returns to baseline.

### 4.5 Automated consistency checks
- Compare source-of-truth milestone counts to `funnel_events` counts per date bucket.
- Verify uniqueness for first-event milestones per user.
- Run explicit duplicate-key diagnostics for first-event milestones and fail validation when duplicates exceed tolerance.
- Alert when mismatch exceeds tolerance and mark backfill run incomplete.

## 5. Backward Compatibility Plan
- Existing admin pages and analytics endpoints remain unchanged.
- `/admin/funnel` remains hidden unless feature flag is enabled.
- Event producers retain prior behavior; funnel tracking augments rather than replaces existing logging.
- Domain-admin compatibility is preserved via tenant-primary, domain-fallback logic to handle current mixed attribution model.
- Export defaults use aggregate-only outputs by default; per-user detail requires elevated permissions and explicit request context.

## 6. Security, Permissions, and Privacy
- Restrict all funnel procedures to `admin` and `domain_admin` roles.
- Enforce strict scoped filters for domain admins and explicit fallback path auditing.
- Emit structured telemetry whenever tenant filtering falls back to domain-based attribution, and review fallback anomalies on a recurring cadence.
- Sanitize event property payloads to avoid leaking session identifiers or sensitive raw metadata.
- Apply route-level throttling to query and export endpoints.
- Record access and export actions through existing audit surfaces where available.
- Add export-specific abuse controls: stricter export rate limits, size caps, per-export audit entries, and explicit elevated-export audit tags.

## 6.1 Metric Definition Lock
- Maintain a canonical metric-definition appendix for this feature.
- Define retention semantics explicitly as hybrid by tab:
  - Retention cohort/churn metrics use activity-based sources.
  - Engagement summary cards may use login-oriented counters.
- Require backend query logic and frontend labels to reference the same definitions to avoid drift.
- Require all metric definitions to include explicit UTC bucket semantics and label format so frontend chart titles, API responses, and export headers remain aligned.

## 7. Testing and Validation Plan
### 7.1 Unit and component verification
- Tracker service behavior and first-event dedup logic.
- GA4 sender configuration and fail-safe behavior.
- Router-level validation and transformation logic.
- Dashboard components for KPI, tab-specific rendering, and fallback states.

### 7.2 Integration and system verification
- End-to-end aggregation correctness for acquisition, activation, revenue, retention, and engagement procedures.
- Role-scoped data checks for admin and domain-admin scenarios.
- Backfill idempotency and reconciliation checks on representative datasets.
- Live-ingest + backfill concurrency tests validating dedup-key uniqueness and deterministic first-event outcomes.
- Export correctness and PII restrictions by role.
- Cross-surface timezone consistency checks ensuring dashboard cards/charts and exported aggregates match for identical ranges.
- Reusable canary validation pack with expected aggregates for acquisition, activation, and revenue before each rollout expansion.

### 7.3 Performance and operational verification
- Measure query latency under expected date ranges and data volume.
- Confirm cache hit behavior for summary endpoints.
- Validate UI auto-refresh does not violate rate limits.

## 8. Rollout Plan
1. Deploy schema and backend plumbing with feature flag off.
2. Run backfill and reconciliation.
3. Enable MVP tabs for internal admins only when rollout gates are met:
   - funnel API p95 latency within agreed threshold;
   - funnel API error rate within agreed threshold;
   - backfill/reconciliation mismatch within tolerance.
4. Observe metrics and resolve issues.
5. Enable to domain admins after scope-filter verification and fallback-anomaly review.
6. Ship retention and engagement tabs broadly.

## 9. Ownership and Monitoring
- Assign backend owner for migration/backfill and query performance.
- Assign frontend owner for dashboard resiliency and UX behavior.
- Define escalation ownership for critical alerts:
  - reconciliation mismatch and cross-tenant leakage alerts: acknowledge within 15 minutes, mitigation within 60 minutes.
  - sustained funnel API SLO breach alerts: acknowledge within 30 minutes, mitigation plan within 2 hours.
- Monitor:
  - request latency and error rates for funnel procedures;
  - backfill completion and mismatch alerts;
  - feature-flag adoption and admin usage.

## 10. Post-Change Validation
A release is complete when all checks pass:
- functional: all enabled tabs render valid data and export works;
- security: role and scope restrictions validated in tests and manual spot checks;
- data integrity: reconciliation within tolerance and first-event uniqueness preserved;
- performance: dashboard and API latencies meet targets under expected load;
- compatibility: existing auth, credit, and chat flows show no regression.
