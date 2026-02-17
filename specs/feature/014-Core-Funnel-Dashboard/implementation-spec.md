# Implementation Spec - Core Funnel Dashboard

## 1. Objective
Deliver a gated admin analytics surface at `/admin/funnel` that provides actionable AARRR funnel visibility across acquisition, activation, revenue, retention, and engagement, using both existing operational tables and a new explicit `funnel_events` stream.

## 2. Confirmed Decisions
- Retention semantics: hybrid by tab.
  - Retention cohort/churn views use activity-based definition.
  - Engagement summary cards can continue presenting login-oriented metrics where appropriate.
- `domain_admin` scope: enforce both tenant and domain attribution with fallback rules.
  - Primary: tenant-context filter.
  - Fallback: domain-based attribution when tenant linkage is unavailable.
- Historical backfill: core milestone events only.
- Rollout: feature-flagged phased delivery, shipping MVP tabs first.

## 3. In-Scope Deliverables
### 3.1 Data and schema
- Add `funnel_events` table and indexes for time-bounded and user-bounded analytics queries.
- Add missing performance indexes on existing high-volume tables used by funnel queries.
- Keep migrations non-destructive and compatible with existing write paths.

### 3.2 Event tracking services
- Add server-side funnel tracking service for standardized event writes.
- Add first-event dedup mechanism for `first_*` milestones.
- Add GA4 measurement-protocol sender and integrate with existing analytics-provider configuration.
- Reuse existing PostHog server capture helper.

### 3.3 Backend analytics API
- Add `funnelAnalytics` router with admin/domain-admin access controls and tenant/domain-safe filtering.
- Support procedures for:
  - KPI summary
  - acquisition funnel
  - activation funnel
  - revenue funnel
  - retention cohorts
  - engagement metrics
  - lifecycle breakdown
  - combined time series
  - raw events viewer
  - CSV/JSON export
- Enforce input validation, date-range limits for heavy queries, and role-based PII exposure controls.

### 3.4 Frontend dashboard
- Add `/admin/funnel` route and page.
- Build 6-tab dashboard: Overview, Acquisition, Activation, Revenue, Retention, Engagement.
- Add KPI cards, date-range controls, auto-refresh (default 30s), and export actions.
- Use `recharts` for standard visualizations and lightweight custom components for funnel/heatmap where needed.

### 3.5 Backfill and rollout
- Add one-time backfill script for milestone events only:
  - `signup_completed`
  - `email_verified`
  - `first_conversation`
  - `first_llm_request`
  - `first_media_generation`
  - `credit_purchased`
  - first subscription milestone where derivable
- Gate dashboard and router exposure behind a feature flag.
- Ship in phases with MVP-first tab enablement.

## 4. Integration Constraints from Current Codebase
- Current route/menu state is partially prepared (`admin-funnel` menu exists), but client route/page wiring is missing.
- Existing analytics surfaces (`usage`, `adminOps`, `audit`) should remain unchanged and non-regressive.
- Tenant attribution is mixed in current code (`currentTenantId` and domain-based patterns coexist); implementation must centralize consistent fallback behavior for funnel queries.
- `lastSignedIn` is updated through request authentication flow, so login-based metrics must not be over-trusted for retention cohorts.

## 5. Security and Access Requirements
- All funnel analytics procedures require `admin` or `domain_admin` authorization.
- Domain admins are tenant/domain constrained and must not view cross-tenant data.
- Export defaults exclude direct user PII unless caller has full admin permissions and explicitly requests extended export.
- Sanitize `funnel_events.properties` before UI rendering and export.
- Add route-level throttling for analytics queries and export endpoints.

## 6. Data and Migration Requirements
- Migration strategy must follow expand -> backfill -> validate -> contract principle.
- Index creation must be sequenced to avoid lock-heavy impact on hot paths.
- Backfill must be idempotent and safe to retry.
- Add reconciliation checks comparing milestone counts from source tables to backfilled events.

## 7. Performance Requirements
- Query latency targets:
  - KPI/acquisition/revenue: sub-500ms typical.
  - activation/engagement: sub-1s typical.
  - retention cohort: sub-2s with bounded period window.
- Apply short TTL caching for expensive summaries, except raw event explorer.
- Enforce date-range caps for expensive procedures.

## 8. Testing and Verification Requirements
- Unit tests for event tracker, first-event dedup logic, GA4 sender, and key router procedures.
- Integration tests for core funnel aggregates and tenant/domain filtering behavior.
- Backfill dry-run plus post-run reconciliation checks.
- RBAC tests confirming admin/domain-admin behavior and PII restrictions.
- UI smoke tests for tab rendering, refresh behavior, and export action wiring.

## 9. Out of Scope (Current Iteration)
- Referral/invite funnel.
- Custom funnel builder UX.
- Real-time websocket streaming for dashboard updates.
- External BI integrations.
- Full-catalog historical replay for every event type.

## 10. Acceptance Criteria
- `/admin/funnel` available only when feature flag is enabled.
- MVP phase delivers stable KPI, acquisition, activation, and revenue visibility with valid export.
- Retention tab uses activity-centric cohorts; engagement cards can still include login-centric counters.
- Domain-admin queries obey tenant-first filtering with documented fallback path.
- Backfill completes on production-scale data within operational window and passes reconciliation thresholds.
- No regressions in existing auth, credit, chat, analytics, or admin operations flows.
