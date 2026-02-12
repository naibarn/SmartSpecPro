# Plan Uplift Decisions

Date: 2026-02-12
Decision mode: smart_auto
User decision: apply_all

## Applied Items

- U1 (high / high-impact): Add hard gate against unsafe bypass directives and uncontrolled `any` growth.
- U2 (high / high-impact): Add single-batch rollback playbook with owner/on-call and max response window.
- U3 (medium / high-impact): Add per-phase error-budget thresholds and explicit sign-off gates.
- U4 (medium / low-impact): Add machine-readable typecheck report artifact (JSON).
- U5 (medium / low-impact): Add deterministic sensitive test command set.
- U6 (low / low-impact): Add remediation matrix mapping file clusters to error classes and verification state.

## Rationale

User requested full uplift application to maximize plan quality and reduce regression risk in single-batch rollout mode.
