# Iteration 1 Review Summary

## Improvement Items

### I1. Define first-event dedup contract and uniqueness enforcement
- severity: `high`
- impact: `high-impact`
- affected area: event ingestion and backfill consistency
- rationale: Prevent duplicate first-milestone events caused by retries or concurrent live/backfill writes.
- recommended action: Specify deterministic `eventKey` and DB uniqueness/ON CONFLICT behavior, plus reconciliation query.

### I2. Lock timezone and bucket semantics for all funnel metrics
- severity: `high`
- impact: `high-impact`
- affected area: aggregation correctness and UI/API consistency
- rationale: Avoid metric drift caused by mixed UTC/local bucketing definitions.
- recommended action: Add canonical UTC bucketing policy and shared labeling/export rules.

### I3. Add cache invalidation triggers for backfill and rollout transitions
- severity: `medium`
- impact: `low-impact`
- affected area: operational freshness of KPI and tab data
- rationale: TTL-only caching can present stale values during rollout validation.
- recommended action: Invalidate or bypass cache on backfill checkpoints and flag transition events.

### I4. Add explicit alert ownership and response windows
- severity: `medium`
- impact: `low-impact`
- affected area: incident response readiness
- rationale: Faster remediation requires clear escalation for mismatch/leakage alerts.
- recommended action: Attach owner + SLA window per critical alert type.

### I5. Strengthen export minimization defaults
- severity: `low`
- impact: `low-impact`
- affected area: privacy and abuse resistance
- rationale: Aggregate-first defaults reduce accidental exposure in routine exports.
- recommended action: Set aggregate-only default and elevated export audit tag requirement.
