# Plan Uplift Checkpoint

- date: 2026-02-15
- based_on: `implementation-plan.md`

## Recommended Uplifts

1. `U1` Capability Matrix and Strict-Parity Contract
- severity: `high`
- impact: `high-impact`
- rationale: strict parity is a core product decision; without an explicit matrix, UI and renderer can drift and reintroduce unsupported controls.
- plan_delta: add a dedicated deliverable defining a versioned capability matrix (UI-exposed fields, ASS support, fast-path eligibility) and require tests to assert matrix compliance.

2. `U2` Parity Golden Fixtures for Timestamp Assertions
- severity: `high`
- impact: `high-impact`
- rationale: visual parity claims need deterministic regression checks across representative timestamps and overlap scenarios.
- plan_delta: include golden fixture strategy (fixed fonts, deterministic timeline inputs, expected per-timestamp assertions) in verification phase.

3. `U3` Security Hardening for Text Escaping and Font Mapping
- severity: `high`
- impact: `high-impact`
- rationale: FFmpeg filter injection or unsafe font path handling is a security and stability risk.
- plan_delta: add explicit security test cases for escaping/encoding and enforce font ID -> bundled asset mapping only.

4. `U4` Observability SLOs for Text Rendering
- severity: `medium`
- impact: `low-impact`
- rationale: current monitoring notes are generic; release readiness improves with concrete alert thresholds.
- plan_delta: define baseline SLO targets (render success rate, text-render error budget) and alert triggers.

5. `U5` Fast-Path Decision Telemetry
- severity: `medium`
- impact: `low-impact`
- rationale: diagnosing parity issues is faster if each render records whether fast-path was used and why fallback happened.
- plan_delta: add structured reason codes for fast-path acceptance/rejection and include in logs.

6. `U6` Compatibility Snapshot Tests for Legacy Projects
- severity: `medium`
- impact: `low-impact`
- rationale: backward compatibility is a major requirement but currently only described at a high level.
- plan_delta: add snapshot-based load/save compatibility fixtures for legacy payload shapes.
