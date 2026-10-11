# Orchestra Lifecycle — SmartAIHub Marathon R10

Goal: prove the safely executable synthetic DevelopmentRun completion slice while keeping live and production execution denied absent genuine authority.

Scope/risk: large/high
Current stage: REVIEW
Resume from: REVIEW
Stop reason: active; partial verification with external authority and CI gates unresolved
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
- PLANNING — COMPLETE. R10 brief is the accepted design; current handoffs and clean canonical base inspected.
- TDD_DESIGN — COMPLETE. Disposable test-only adapter keeps production runtime fail-closed; exact acceptance and negative gates are written in `plan.md`.
- IMPLEMENT — IN_PROGRESS. PR #676 integrated normally at `86d744878dcd67e1f8187a125f713b9364353573`; follow-up `f42e3d9f` adds same-run lease-expiry/reclaim and stale worker fencing acceptance.
- VERIFY — IN_PROGRESS. Focused integration profile passed 4 files/24 tests on `f42e3d9f`; full typecheck not completed because the manual scoped invocation expanded to about 3.3 GiB RSS. CI baseline failures are recorded.
- DEBUG_FIX — COMPLETE. Fixed the missing DEBUG_REPAIR→TEST successor and stale admission-snapshot comparison exposed by the full phase-chain PostgreSQL run; reran focused suite successfully.
- REVIEW — IN_PROGRESS. Conductor review must inspect tenant/run/job binding, worker output limits and the diff; normal PR gates remain pending.
- FINAL_VERIFY — BLOCKED_TRUE_EXTERNAL for run completion. Final Verify is reached through canonical reconciliation but correctly waits for genuine workspace convergence/retirement receipts. No canonical completion event exists.

Gap ledger:
- GAP-1 | VERIFY | MUST_DO_NOW | follow-up fencing checkpoint PR checks have not run | owner: conductor | action: submit normal PR, classify checks; no bypass | status: OPEN | resume: REVIEW
- GAP-2 | IMPLEMENT | MUST_DO_NOW | same-run lease/reclaim stale-worker denial is proven on disposable PostgreSQL: fence 1→2, stale result/output unchanged | owner: conductor | action: retain the evidence on exact source SHA | status: CLOSED | resume: VERIFY
- GAP-3 | FINAL_VERIFY | BLOCKED | real canonical workspace convergence and retirement authority unavailable for the disposable run | owner: lifecycle authority | action: use registered workspace lifecycle authority for the exact run; never synthesize receipts | status: BLOCKED | resume: FINAL_VERIFY
- GAP-4 | FINAL_VERIFY | BLOCKED | fresh Windows Runner/Codex/session/source trust/job grant/budget evidence unavailable | owner: authorized Windows Runner owner | action: obtain/record fresh nonproduction readiness evidence before any protected dispatch | status: BLOCKED | resume: FINAL_VERIFY

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: false
  review_converged: false
  final_verify_fresh: false
