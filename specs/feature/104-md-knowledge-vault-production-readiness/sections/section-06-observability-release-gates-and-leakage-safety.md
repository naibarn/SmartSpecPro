# Section 06: Observability, Release Gates, and Leakage Safety

## Objective

Make vault readiness measurable through metrics, dashboards, diagnostics, and automated release gates.

## Scope

- metric collection
- release-gate evaluation
- hidden-note leakage checks
- context-pack citation coverage
- latency and coverage dashboards
- alerting and operator diagnostics

## Likely Files and Modules

- `apps/web/server/services/contextEngineEvaluationService.ts`
- `apps/web/server/services/monitoringService.ts`
- `apps/web/client/src/components/admin/ContextEngineEvaluationDashboard.tsx`
- `apps/web/server/services/libraryKnowledgeReadService.ts`
- `apps/web/server/services/libraryKnowledgeBackfillService.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- new `libraryKnowledgeObservabilityService.ts`
- new admin/router endpoints as needed

## Implementation Guidance

### 1. Track required metrics

- backfill coverage per tenant
- stale cache ratio
- refresh latency p50/p95/p99
- quick-switch latency p95
- inspector latency p95
- local graph latency p95
- context-pack resolution latency p95
- citation coverage percentage
- hidden-note leakage attempts and successful leaks
- private-vault blocked count
- telemetry persistence failure count
- unresolved and ambiguous reference rates
- delegated unauthorized resolve attempts

### 2. Add release gate evaluator

- Gates should compare observed metrics against thresholds:
  - hidden-note leakage = 0
  - citation coverage = 100%
  - readable Markdown backfill coverage >= 99%
  - save-to-refresh p95 <= 5 seconds
  - quick switch p95 <= 250 ms
  - local graph p95 <= 400 ms
  - context-pack resolution p95 <= 1200 ms
- Gate output should be machine-readable and UI-readable.
- A bare config value of `overridden` must not pass the gate.
- Audited overrides must include actor, approver, reason, scope, created time, expiry time, status, and revocation state.
- Override workflow must preserve explicit statuses for `pending_approval`, `active`, `rejected`, `revoked`, and derived `expired`.
- Self-approval must fail closed; a second admin must approve a tenant-scoped override before protected surfaces can unlock.
- Break-glass overrides must be short-lived and include an incident reference in metadata.
- Expired, revoked, malformed, or wrong-scope overrides must fail closed.
- Readiness reports must show override metadata without hiding the underlying failed checks.

### 3. Add leakage probes

- Synthetic tests should attempt:
  - backlink access to unreadable note
  - unlinked mention of private-vault note
  - graph neighbor access after share revocation
  - context pack resolve with revoked item
  - delegated MCP resolve without pack grant
- Leakage probe results should be visible in admin diagnostics.

### 4. Add dashboard surfaces

- Tenant coverage view.
- Pack readiness and stale view.
- Runtime context pack latency/citation view.
- Leakage gate view.
- Refresh worker failure view.

### 5. Keep logs safe

- Diagnostics must not log private note content.
- Leakage probe output should identify blocked conditions without exposing hidden titles/content.

### 6. Persist telemetry safely

- Store raw events for short-term inspection.
- Evaluate release gates from the full measurement window through paginated reads or rollups, not a fixed small raw-event cap.
- Maintain rollup rows by tenant, window, event type, surface, and status for high-volume production tenants.
- Expose telemetry persistence failures in readiness output.
- Prefer stale/insufficient-data over falsely reporting `pass` when telemetry is incomplete.

## Test-First Checklist

- Test: release gate evaluator returns blocked when leakage count > 0.
- Test: release gate evaluator returns blocked when citation coverage < 100%.
- Test: release gate evaluator ignores expired, malformed, or wrong-scope overrides.
- Test: valid audited override reports `overridden` while preserving failed checks.
- Test: requester cannot approve their own pending override.
- Test: break-glass request without incident metadata is rejected.
- Test: bare `overridden` config does not enable protected surfaces.
- Test: coverage metric computes correctly from knowledge note rows vs readable Markdown count.
- Test: context-pack resolution emits latency and citation metrics.
- Test: unauthorized delegated resolve attempt increments blocked metric.
- Test: private-vault probe output does not include hidden title/content.
- Test: telemetry report paginates raw events or uses rollups beyond 1,000 events.

## Acceptance Checkpoints

- Operators can see whether the vault is safe to enable.
- Release gates are executable, not only documented.
- Overrides are time-bounded, scoped, revocable, and visible in audit/readiness output.
- Security-sensitive diagnostics avoid leaking hidden content.
