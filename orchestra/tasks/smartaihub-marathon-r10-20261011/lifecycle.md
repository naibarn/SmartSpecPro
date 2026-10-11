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
- IMPLEMENT — COMPLETE. Commits `25cf163a`, `c9785207`, `501e2381`, and `e4628527` implement the fixture proof, phase successor, durable digests, cancellation guard, and phase-ordered synthetic acceptance.
- VERIFY — IN_PROGRESS. Focused integration profile passed 4 files/24 tests on `e4628527`; full typecheck not completed because the manual scoped invocation expanded to about 3.3 GiB RSS. CI baseline failures are recorded.
- DEBUG_FIX — COMPLETE. Fixed the missing DEBUG_REPAIR→TEST successor and stale admission-snapshot comparison exposed by the full phase-chain PostgreSQL run; reran focused suite successfully.
- REVIEW — IN_PROGRESS. Conductor review must inspect tenant/run/job binding, worker output limits and the diff; normal PR gates remain pending.
- FINAL_VERIFY — BLOCKED_TRUE_EXTERNAL for run completion. Final Verify is reached through canonical reconciliation but correctly waits for genuine workspace convergence/retirement receipts. No canonical completion event exists.

Gap ledger:
- GAP-1 | VERIFY | MUST_DO_NOW | exact-SHA PR checks have not run; repository's pre-R10 canonical CI fails broadly | owner: conductor | action: submit normal PR, classify checks; no bypass | status: OPEN | resume: REVIEW
- GAP-2 | IMPLEMENT | MUST_DO_NOW | stale lease/reclaim and stale-worker denial are not demonstrated on this run | owner: conductor | action: add safe disposable-PostgreSQL proof or record exact supported test gap | status: OPEN | resume: IMPLEMENT
- GAP-3 | FINAL_VERIFY | BLOCKED | real canonical workspace convergence and retirement authority unavailable for the disposable run | owner: lifecycle authority | action: use registered workspace lifecycle authority for the exact run; never synthesize receipts | status: BLOCKED | resume: FINAL_VERIFY
- GAP-4 | FINAL_VERIFY | BLOCKED | fresh Windows Runner/Codex/session/source trust/job grant/budget evidence unavailable | owner: authorized Windows Runner owner | action: obtain/record fresh nonproduction readiness evidence before any protected dispatch | status: BLOCKED | resume: FINAL_VERIFY

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: false
  review_converged: false
  final_verify_fresh: false
