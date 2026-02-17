# Plan Quality Uplift

## U1. Domain-admin fallback observability
- severity: `high`
- impact: `high-impact`
- rationale: Tenant/domain fallback is a known complexity area; without explicit observability, silent scope drift can leak or hide data.
- concrete plan delta to apply: add explicit telemetry and audit markers for every fallback-to-domain decision path, with periodic anomaly review.

## U2. Backfill guardrails and batching controls
- severity: `high`
- impact: `high-impact`
- rationale: Large historical inserts can affect write pressure and replication lag if run in uncontrolled batches.
- concrete plan delta to apply: require bounded batch execution with checkpoint resume tokens and configurable pause/abort controls.

## U3. API contract freeze for MVP tabs
- severity: `medium`
- impact: `low-impact`
- rationale: MVP-first rollout benefits from stable API contracts to prevent frontend churn during phase expansion.
- concrete plan delta to apply: define a versioned contract baseline for MVP procedures and defer breaking response-shape changes to phase boundaries.

## U4. Error budget and SLO gates for enablement
- severity: `medium`
- impact: `high-impact`
- rationale: Feature-flag rollout needs explicit objective gates; otherwise enablement can outpace operational readiness.
- concrete plan delta to apply: add go/no-go thresholds for p95 latency, error rate, and reconciliation mismatch before each rollout expansion.

## U5. Export abuse and data-exfiltration checks
- severity: `medium`
- impact: `low-impact`
- rationale: Export endpoints are common abuse points and need stronger guardrails than query-only endpoints.
- concrete plan delta to apply: add per-user export audit entries, stricter export-specific rate limiting, and file-size safeguards.

## U6. Retention metric definition lock
- severity: `medium`
- impact: `high-impact`
- rationale: Hybrid retention rules can drift if not codified clearly, causing KPI inconsistency across tabs and releases.
- concrete plan delta to apply: add a canonical metric-definition appendix used by backend queries and frontend labels, including exact activity sources per metric.

## U7. Canary dataset validation pack
- severity: `low`
- impact: `low-impact`
- rationale: Synthetic and sampled production-like fixtures reduce regression risk during post-deploy checks.
- concrete plan delta to apply: add a reusable canary validation pack with expected aggregates for acquisition, activation, and revenue before widening rollout.
