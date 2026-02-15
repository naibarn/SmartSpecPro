# Plan Uplift Decisions

- date: 2026-02-15
- decision: `apply_all`
- mode: `asked`

## Applied Items

1. `U1` Capability Matrix and Strict-Parity Contract
- status: applied
- reason: core guardrail for product requirement strict parity.

2. `U2` Parity Golden Fixtures for Timestamp Assertions
- status: applied
- reason: required for deterministic preview/render regression detection.

3. `U3` Security Hardening for Text Escaping and Font Mapping
- status: applied
- reason: protects FFmpeg invocation and asset mapping boundaries.

4. `U4` Observability SLOs for Text Rendering
- status: applied
- reason: improves release readiness with measurable thresholds.

5. `U5` Fast-Path Decision Telemetry
- status: applied
- reason: needed to diagnose fallback and misclassification behavior.

6. `U6` Compatibility Snapshot Tests for Legacy Projects
- status: applied
- reason: validates backward compatibility requirements explicitly.

## Updated Artifacts

- `implementation-plan.md` updated to incorporate U1-U6 across phases, regression prevention, and done criteria.
