# P0-WU-4 conservative worktree collector checkpoint

- Implementation commit tested: `598e10f41` (merged PR #109).
- Integrated `origin/main`: `a56d221aa17b5986c2175e7b4ad5e59042917a89`.
- Scope: registered-worktree collector modes (`REPORT_ONLY`, default `AUDIT_ONLY`, explicit `RETIRE_SAFE`), role-aware protection for canonical/recovery/external/unknown-owner workspaces, reuse of fenced retirement checks, and historical previous-path receipt.
- Evidence: `python3 -B -m unittest scripts.development-lifecycle.test_workspace_authority` — 35 passed; includes default audit preserving canonical and unknown-owner workspaces, explicit safe retirement, existing owner-registration race, and matrix consistency (31 scenarios).
- `python3 -m py_compile scripts/development-lifecycle/workspace_authority.py scripts/development-lifecycle/test_workspace_authority.py` — PASS.
- `git diff --check` — PASS.
- This is a callable local collector, not a scheduled periodic service. Project-level Mission Control/actions, cross-host authority, production evidence adapters, integration-completion race coverage, and Spec-224 compatibility diagnosis remain open.

## Follow-up CLI correction

- Implementation commit tested: `c48a357b1` (merged PR #111).
- Integrated `origin/main`: `8d45273a3f1844bd80629a54a0b990e551a1f98a`.
- Fixed successful `WORKTREE_AUDIT_COMPLETE` CLI exit status; added scenario 32 and CLI regression.
- Re-ran `python3 -B -m unittest scripts.development-lifecycle.test_workspace_authority` — 36 passed; `py_compile` and `git diff --check` passed.
