# Decision Log

## 2026-03-30

### Decision 1

Recommendation history will use dedicated maintenance tables, not only `skills.configJson`.

Reason:

- recommendation history is operational data
- it needs filtering, auditability, and run history
- `configJson` should remain for runtime settings

### Decision 2

The maintenance system will reuse the existing ISC / Skill Studio proposal workflow where useful, but the recommendation domain remains separate.

Reason:

- proposal files and apply mechanics already exist
- maintenance needs stronger compatibility and scheduling semantics than ad hoc studio usage

### Decision 3

`migrate-to-genjs` is allowed only through a compatibility-gated preview/apply flow.

Reason:

- runtime upgrades are powerful but risky
- bundle generation must not silently break callers

### Decision 4

Section 01 will use dedicated maintenance enums and tables instead of trying to reuse existing schedule or approval enums.

Reason:

- maintenance lifecycle semantics are related to, but distinct from, existing scheduler and approval flows
- a dedicated schema keeps filtering and audit logic clearer for later slices
