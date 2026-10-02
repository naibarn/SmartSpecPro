# Task Lifecycle — Worker App and Chrome Extension Recovery

Goal: restore Worker App pairing, add UI-managed encrypted keyring lifecycle, and preserve Chrome Companion behavior.

Scope/risk: large/high. No Production deployment or secret change is authorized in this workspace.

Current stage: PLANNING
Resume from: TDD_DESIGN
Stop reason: active

| Stage | Status | Entry evidence | Exit evidence | Next action |
|---|---|---|---|---|
| PLANNING | COMPLETE | screenshot, source routes, env-presence inspection, read-only DB preflight | `plan.md` and `test-design.md` | start RED tests |
| TDD_DESIGN | IN_PROGRESS | test matrix in `test-design.md` | focused RED assertions and commands | implement smallest server/UI changes |
| IMPLEMENT | PENDING | — | — | — |
| VERIFY | PENDING | — | — | — |
| DEBUG_FIX | PENDING | — | — | — |
| REVIEW | PENDING | — | — | — |
| FINAL_VERIFY | PENDING | — | — | — |

## Gap ledger
- GAP-1: determine whether keyless legacy ciphertexts exist in a deployed database; local table has 0 rows, Production inventory unavailable. Earliest stage: VERIFY. Severity: HIGH. Do not prune a legacy decrypt path until target inventory is available.
- GAP-2: local Web app upstream is not currently serving port 3000; nginx returns 502 for proxied app traffic. Earliest stage: VERIFY. Severity: MEDIUM. Attempt a local process smoke only after code tests/build; Production browser proof remains separate.

Completion invariants: every in-scope local gate passes, no secret is exposed, `.env` remains untouched, extension regression proof is current, and external deployment gaps are explicitly reported.
