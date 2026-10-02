# Orchestra Lifecycle — Spec 224 D3.90

Goal: prove the remaining non-production Spec 224 database/harness paths on an isolated copy of the current schema without changing existing data, and implement only verified gaps.
Scope/risk: large/high. Current stage: IMPLEMENT. Resume from: IMPLEMENT. Stop reason: active.
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY.

| Stage | Status | Evidence | Next action |
|---|---|---|---|
| PLANNING | COMPLETE | `plan.md`, source/worktree and DB identity inspection | None |
| TDD_DESIGN | COMPLETE | `test-design.md` | None |
| IMPLEMENT | IN_PROGRESS | Existing D3.85 source preserved; full pretest backup created | Build isolated schema target and execute focused proof |
| VERIFY | PENDING | None for D3.90 | Run bounded PostgreSQL/adapter tests |
| DEBUG_FIX | PENDING | None for D3.90 | Repair only reproduced in-scope defects |
| REVIEW | PENDING | None for D3.90 | Review changed paths and DB isolation evidence |
| FINAL_VERIFY | PENDING | None for D3.90 | Verify current DB unchanged and report exact gates |

## Gap ledger
- GAP-1: Shared app DB is persistent and must not be a test write target. Severity HIGH; earliest stage VERIFY; status IN_PROGRESS. Evidence: DB `smartspec` is 2.3 GB with 341 migration records. Action: full backup and schema-only restore to a separate DB; compare original metadata afterward.
- GAP-2: Remote Trust configuration and protected test grant are absent. Severity HIGH; earliest stage VERIFY; status BLOCKED. Evidence: D3.85 final report. Action: continue all local/disposable work; protected positive execution remains blocked until real trust configuration/grant exists.
- GAP-3: Declared providers exceed Runner dispatch support. Severity MEDIUM; earliest stage PLANNING; status IN_PROGRESS. Evidence: source allows codex/claude_code/antigravity/deepseek; Runner commands currently allow codex.v1/claude.v1. Action: determine which providers have real Runner adapter/process implementations; do not advertise unsupported adapters as ready.

Completion invariants: all_mandatory_stages_closed=false; no_open_must_do_gap=false; no_stale_required_gate=false; review_converged=false; final_verify_fresh=false.
