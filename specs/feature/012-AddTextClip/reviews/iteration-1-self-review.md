# Iteration 1 Self Review

- date: 2026-02-15
- mode: `self_review`
- reviewed_file: `implementation-plan.md`

## Findings

1. `R1` API contract versioning and downgrade behavior are underspecified
- severity: `high`
- affected_area: project save/load + render job contract boundaries between frontend and worker
- rationale: The plan adds new text payload semantics, but it does not explicitly require version negotiation or graceful handling when older components encounter unsupported text fields. This can cause runtime failures during staggered deployments.
- recommendation: Add an explicit contract versioning strategy and compatibility behavior (reject with clear error vs feature gate downgrade), plus tests covering mixed-version rollout windows.

2. `R2` Font availability fallback policy is not fully defined
- severity: `high`
- affected_area: preview parity + backend render reliability
- rationale: A whitelist policy exists, but the plan does not define what happens when a referenced font ID is missing or unavailable in runtime artifacts. Undefined fallback can produce preview/render divergence.
- recommendation: Define deterministic fallback font policy and fail-fast telemetry when requested font IDs are invalid; add parity tests for fallback scenarios.

3. `R3` International text shaping coverage is missing
- severity: `medium`
- affected_area: parity test matrix and capability boundaries
- rationale: Current tests focus on overlap/easing/style but do not explicitly include multi-line Unicode, RTL, and ligature cases where browser and libass behavior can diverge.
- recommendation: Add representative i18n shaping fixtures in parity tests and define explicit out-of-scope scripts if not supported in v1.

4. `R4` Performance acceptance thresholds are too generic
- severity: `medium`
- affected_area: verification/hardening and rollout guardrails
- rationale: Monitoring SLOs exist, but there is no explicit pre-release performance threshold for text-heavy timelines.
- recommendation: Add a repeatable benchmark scenario (e.g., N overlapping clips, M keyframes) with pass/fail latency and render-time thresholds.

5. `R5` Operational incident response details can be tightened
- severity: `low`
- affected_area: rollback and monitoring operations
- rationale: Rollback strategy is defined, but the plan does not enumerate the exact dashboard panels/log fields needed for first-response triage.
- recommendation: Add required diagnostics checklist (job ID, fast-path reason code, ASS generation status, font ID resolution status) to release runbook.
