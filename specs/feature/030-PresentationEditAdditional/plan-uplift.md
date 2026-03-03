# Plan Uplift Checkpoint

## Recommended Uplifts

### U1. Explicit idempotency and dedupe handling for export retries
- severity: high
- impact: high-impact
- rationale: readiness retries + worker retries can duplicate job effects unless idempotency keys are consistently enforced end-to-end.
- concrete plan delta to apply: add a dedicated implementation task to verify `triggerPresentationExport` idempotency key propagation and worker-side duplicate suppression assertions for retry scenarios.

### U2. Define a canonical warning contract version and compatibility test matrix
- severity: high
- impact: high-impact
- rationale: warning taxonomy changes can break existing UI/reporting consumers if code semantics drift without versioned expectations.
- concrete plan delta to apply: add contract versioning note and compatibility tests for old/new warning consumers, including unknown-code forward handling.

### U3. Add chaos-style timeout scenario coverage for readiness gate
- severity: medium
- impact: low-impact
- rationale: current tests target nominal timeout paths but not intermittent asset delays and partial readiness flapping.
- concrete plan delta to apply: add test scenarios for delayed fonts/media, intermittent ready signal, and fallback convergence within 8000ms budget.

### U4. Add tenant-isolation verification in internal render/export integration tests
- severity: high
- impact: high-impact
- rationale: refactoring readiness/degradation flow can accidentally broaden data access or token claim handling in internal routes.
- concrete plan delta to apply: include negative-path tests for deck/slide claim mismatch and tenant-cross access attempts in render/export integration tests.

### U5. Add observability field-level spec for warnings and readiness lifecycle
- severity: medium
- impact: low-impact
- rationale: rollout thresholds rely on metrics not yet explicitly mapped to emitted fields/events.
- concrete plan delta to apply: define required telemetry fields (`warning_code`, `slide_index`, `retry_count`, `ready_wait_ms`, `degrade_reason`) and owners for dashboard/alert wiring.

### U6. Add rollback rehearsal gate before 25% rollout stage
- severity: medium
- impact: low-impact
- rationale: thresholds are defined, but rollback readiness is unproven without a dry-run at low traffic.
- concrete plan delta to apply: require one staged rollback drill (including dashboard verification and on-call handoff checklist) before advancing beyond 5%.

## Checklist Coverage Summary

- missing edge cases / failure modes: addressed by U1, U3
- acceptance criteria clarity / verification strength: addressed by U2, U3
- rollout / rollback gaps: addressed by U6
- migration / data integrity gaps: not DB-migration related in scope; contract compatibility gap addressed by U2
- security hardening / tenant isolation: addressed by U4
- backward compatibility / regression-risk gaps: addressed by U2, U5
- observability / monitoring / alerting gaps: addressed by U5
