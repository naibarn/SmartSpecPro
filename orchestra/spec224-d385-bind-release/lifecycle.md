# Orchestra Lifecycle — Spec 224 Bind/Release Recovery

Goal: make the existing authorization bind/release path safely retryable without allowing a previously persisted or dispatched binding to be replaced.
Scope/risk: medium/high. Current stage: FINAL_VERIFY. Resume from: VERIFY. Stop reason: implemented_with_deferred_gap.
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY.

| Stage | Status | Evidence | Next action |
|---|---|---|---|
| PLANNING | COMPLETE | `orchestra/spec224-d385-bind-release/plan.md`; source inspection of `bind`, `persistBinding`, and `releaseAuthorizationHold` | None |
| TDD_DESIGN | COMPLETE | `orchestra/spec224-d385-bind-release/test-design.md`; RED reproduced for conflicting replay and absent binding persistence guard | None |
| IMPLEMENT | COMPLETE | Immutable binding predicate wired into persistence; stable digest stored and checked on release replay | None |
| VERIFY | COMPLETE | 7 focused files / 102 tests; Prettier check and `git diff --check` pass | PostgreSQL-specific proof deferred |
| DEBUG_FIX | COMPLETE | Both RED cases repaired; targeted rerun passed | None |
| REVIEW | COMPLETE | Two targeted conductor passes: binding/collision semantics; tenant, digest replay, and fail-closed queued state | Independent external reviewer not run |
| FINAL_VERIFY | BLOCKED | Fresh local tests pass; no PostgreSQL crash/concurrency test for bind/release transaction window | Resume at VERIFY when isolated disposable PostgreSQL target is available |

## Gap ledger
- GAP-1: Prior binding could be replaced and release replay did not compare binding identity. Classification: MUST_FIX, severity HIGH, earliest stage IMPLEMENT, status VERIFIED. Evidence: RED then GREEN focused tests in `test-design.md`.
- GAP-2: No PostgreSQL crash/concurrency evidence for this boundary. Classification: BLOCKED, severity HIGH, earliest stage VERIFY, status BLOCKED, resume_from VERIFY. No isolated DB test target was verified in this slice; unit tests do not claim DB recovery.

Completion invariants: code-slice stages are closed; broader runtime claim remains blocked by GAP-2; no unaddressed code must-do gap in this bounded slice; local review convergence recorded; PostgreSQL/runtime final verification is not fresh.
