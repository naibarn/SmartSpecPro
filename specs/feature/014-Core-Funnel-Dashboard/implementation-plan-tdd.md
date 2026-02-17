# Implementation Plan (TDD) - Core Funnel Dashboard

## Testing Context
- Existing codebase testing stack: `vitest` in `apps/web`.
- Baseline command for this feature: `cd apps/web && npm test`.
- Test placement should follow existing patterns in `server/services/*.test.ts`, `server/routers/*.test.ts`, and targeted client component tests.

## 1. Delivery Strategy
### Test stubs to define before implementation
- Test: feature flag OFF keeps `/admin/funnel` unreachable and hidden from admin navigation.
- Test: phased tab enablement only exposes MVP tabs in phase 1.
- Test: phased rollout can promote to additional tabs without breaking existing tab contracts.

## 2. Impact and Regression Map
### 2.1 Directly impacted areas
- Test: auth, credit, and chat critical paths remain behaviorally unchanged after funnel tracking hooks are introduced.
- Test: admin router registration includes `funnelAnalytics` without affecting existing router procedures.

### 2.2 Likely regression paths
- Test: event writes from login/registration paths remain non-blocking under downstream analytics failures.
- Test: domain-admin scope queries never include data outside authorized tenant/domain fallback boundaries.
- Test: bounded date queries reject or clamp excessive ranges for expensive analytics procedures.

### 2.3 Regression prevention strategy
- Test: contract snapshots for MVP procedures remain stable across non-breaking releases.
- Test: canary validation pack assertions detect aggregate mismatches before rollout expansion.

## 3. Architecture and Workstreams
### 3.1 Workstream A: Schema and index expansion
- Test: migration introduces `funnel_events` and required indexes without destructive schema diffs.
- Test: migration ordering guard confirms new migration sequence is additive and correctly journaled.
- Test: schema-level smoke verifies expected index names and key columns exist.

### 3.2 Workstream B: Funnel tracking services
- Test: tracker emits standardized event payload shape for milestone events.
- Test: deterministic dedup key generation is stable for identical inputs.
- Test: DB uniqueness + conflict handling enforces insert-once semantics for first-event milestones.
- Test: conflict counter/telemetry increments when duplicate first-event writes occur.
- Test: GA4 sender failure does not block primary funnel event persistence.
- Test: PostHog side-channel failures do not block primary funnel event persistence.

### 3.3 Workstream C: Event integration points
- Test: registration verification flow emits expected milestone events exactly once.
- Test: first conversation / first LLM request / first media / credit purchase milestones emit only first-event records.
- Test: retry scenarios (or repeated source triggers) do not duplicate first-event milestones.
- Test: live-ingest and backfill share identical dedup key behavior for the same source milestone.

### 3.4 Workstream D: Analytics router and query layer
- Test: RBAC allows `admin` and scoped `domain_admin`; rejects unauthorized roles.
- Test: tenant-first filtering and domain fallback return only authorized rows.
- Test: timezone bucketing uses canonical UTC semantics for day/week/month endpoints.
- Test: export output buckets and labels match API response buckets for identical ranges.
- Test: heavy-window guardrails enforce max range limits for costly procedures.
- Test: cache invalidates/bypasses on backfill checkpoint events and flag transitions.

### 3.5 Workstream E: Frontend dashboard
- Test: `/admin/funnel` route renders gated dashboard only when feature flag is enabled.
- Test: tab rendering supports MVP-first order and later-tab rollout safely.
- Test: KPI and chart components handle loading, empty, and partial-error states independently.
- Test: manual refresh triggers data fetch while preserving tab/date state.
- Test: export action wiring calls correct backend procedures and handles failures gracefully.

### 3.6 Workstream F: Backfill and operational rollout
- Test: backfill dry-run mode reports expected counts without writing events.
- Test: batched backfill checkpoints persist and resume from last checkpoint token.
- Test: pause/abort controls stop batch writes safely and allow controlled continuation.
- Test: reconciliation reports mismatches and marks run incomplete above tolerance.
- Test: duplicate-key diagnostics surface first-event duplication beyond threshold.

## 4. Data Safety and Migration Strategy
### 4.1 Risk classification
- Test: risk-classification checklist is present and ties to migration/backfill gating criteria.

### 4.2 Pre-migration backup plan
- Test: pre-migration snapshot/runbook checklist is required before production backfill execution.

### 4.3 Non-destructive migration sequence
- Test: release gate prevents enabling funnel flag before schema + backfill validation completion.

### 4.4 Rollback and restore runbook
- Test: rollback trigger matrix evaluates latency, leakage, and mismatch thresholds correctly.
- Test: rollback procedure disables feature flag and stops backfill jobs in correct order.

### 4.5 Automated consistency checks
- Test: source-of-truth vs `funnel_events` aggregate comparisons run per date bucket.
- Test: first-event uniqueness verification fails when duplicate keys are introduced intentionally.

## 5. Backward Compatibility Plan
- Test: existing admin analytics routes remain functional and response-compatible.
- Test: legacy auth/credit/chat flow smoke checks pass with funnel feature both disabled and enabled.
- Test: export default mode is aggregate-only unless elevated context is explicitly provided.

## 6. Security, Permissions, and Privacy
- Test: analytics and export procedures enforce role checks and scoped filters.
- Test: fallback-to-domain telemetry is emitted whenever tenant scope fallback path is used.
- Test: export-specific rate limits and size caps are enforced independently of query-only limits.
- Test: elevated export requests generate explicit audit tags.
- Test: sensitive property sanitization removes banned fields from API and export outputs.

## 6.1 Metric Definition Lock
- Test: canonical metric definition appendix includes retention and engagement semantics.
- Test: frontend labels and backend metric identifiers remain aligned with canonical definitions.
- Test: UTC bucket semantics in definitions match router aggregation behavior.

## 7. Testing and Validation Plan
### 7.1 Unit and component verification
- Test stub suite exists for tracker, dedup key, GA4 sender, and router validators.
- Test stub suite exists for dashboard cards/charts and fallback state rendering.

### 7.2 Integration and system verification
- Test: end-to-end acquisition/activation/revenue aggregates validate against fixture datasets.
- Test: domain-admin scoped requests across mixed tenant/domain attribution scenarios.
- Test: concurrent live-ingest + backfill produces deterministic first-event counts.
- Test: export role restrictions prevent unauthorized per-user detail access.

### 7.3 Performance and operational verification
- Test: representative KPI/acquisition queries remain within target p95 under expected dataset size.
- Test: retention and engagement queries stay within bounded performance targets for allowed ranges.
- Test: auto-refresh cadence does not exceed endpoint rate limits under sustained dashboard sessions.

## 8. Rollout Plan
- Test: rollout gate check blocks phase advancement when latency/error/mismatch thresholds fail.
- Test: internal-admin canary validation pack passes before domain-admin expansion.
- Test: fallback anomaly review checklist is required prior to domain-admin rollout.

## 9. Ownership and Monitoring
- Test: alert routing metadata maps reconciliation/leakage alerts to named owners.
- Test: alert policy includes acknowledgment/mitigation window assertions in runbook artifacts.

## 10. Post-Change Validation
- Test: final release gate aggregates functional, security, integrity, performance, and compatibility checks into a single pass/fail report.
- Test: release checklist requires explicit sign-off for all gate categories before feature is marked complete.
