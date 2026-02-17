# Iteration 1 Self Review

- mode: `self_review`
- generated_at: 2026-02-16
- reviewed_artifacts:
  - `implementation-spec.md`
  - `implementation-plan.md`
  - `research-notes.md`
  - `interview-notes.md`

## Findings

### R1. Missing canonical dedup key/uniqueness design for milestone first-events
- severity: `high`
- impact: `high-impact`
- affected area: Workstream B/C, data integrity in `funnel_events`
- rationale: Plan references first-event dedup but does not define deterministic dedup keys or uniqueness guarantees. Backfill + live ingestion can race and duplicate first milestones.
- recommended action: Add explicit dedup contract (stable `eventKey` composition + DB uniqueness/index strategy + conflict handling behavior) and include verification queries.

### R2. Time-bucket and timezone normalization is underspecified
- severity: `high`
- impact: `high-impact`
- affected area: KPI, acquisition/revenue/retention aggregation correctness
- rationale: Daily/weekly funnel metrics can drift if backend procedures and frontend labels do not share one normalization rule (UTC vs tenant-local time).
- recommended action: Define canonical timezone/bucketing policy and enforce it across query builders, caches, exports, and dashboard labels.

### R3. Cache invalidation behavior during backfill/rollout is not explicit
- severity: `medium`
- impact: `low-impact`
- affected area: Workstream D/F operational correctness
- rationale: Short-TTL caches are planned, but backfill and canary changes can leave stale summaries in admin views during validation windows.
- recommended action: Add explicit invalidation triggers (backfill batch completion, rollout flag transitions, manual refresh override).

### R4. Alert ownership/escalation runbook can be sharper
- severity: `medium`
- impact: `low-impact`
- affected area: Section 9 ownership and monitoring
- rationale: Ownership is named broadly, but on-call/escalation targets and response windows are not explicit for reconciliation mismatch and leakage alerts.
- recommended action: Add response ownership matrix and target response windows for each critical alert class.

### R5. Export minimization policy can add stronger defaults
- severity: `low`
- impact: `low-impact`
- affected area: Security/privacy and export behavior
- rationale: Plan states PII restrictions, but can further reduce risk by defaulting exports to aggregate-only mode with explicit elevated override.
- recommended action: Specify aggregate-first export default and explicit audit tag when elevated per-user export is requested.
