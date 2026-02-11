# Plan Uplift Recommendations (2026-02-11)

These recommendations are additive improvements after applying the tenant-attribution strictness delta.

## U1 - Enforce DB constraints in phased cutover
- severity: high
- impact: high-impact
- affected area: callback/DLQ schema migration
- rationale: strict logic in application code alone can drift; DB constraints are the strongest guardrail.
- recommended plan delta: add phased migration path (`nullable -> backfill -> validation query -> NOT NULL + index + FK`), with explicit rollback checkpoint between phases.

## U2 - Add migration idempotency + lock strategy
- severity: medium
- impact: low-impact
- affected area: migration execution reliability
- rationale: repeated execution or concurrent runs can produce inconsistent attribution states.
- recommended plan delta: require migration lock, idempotent SQL guards, and rerunnable backfill batches.

## U3 - Quarantine operation playbook for unresolved rows
- severity: medium
- impact: low-impact
- affected area: tenant attribution reconciliation
- rationale: unresolved rows are expected in real systems; operators need deterministic handling.
- recommended plan delta: define quarantine queue semantics, owner workflow, and SLA for attribution remediation.

## U4 - Explicit API contract split: tenant-admin vs super-admin global
- severity: high
- impact: high-impact
- affected area: ops router/service boundary
- rationale: mixed-route behavior is a common source of privilege mistakes.
- recommended plan delta: define separate endpoints/permissions/contracts for tenant-admin and super-admin global actions.

## U5 - Security observability baseline
- severity: medium
- impact: low-impact
- affected area: runtime monitoring
- rationale: hardening without observability is difficult to operate safely.
- recommended plan delta: add metrics/log events for denied missing-attribution ops, cross-tenant denial, and quarantine counts.

## U6 - Release gate with tenant-attribution canary checks
- severity: medium
- impact: low-impact
- affected area: release validation
- rationale: catches hidden fallback pathways before full rollout.
- recommended plan delta: add canary validation checklist and automated smoke tests for representative tenants.
