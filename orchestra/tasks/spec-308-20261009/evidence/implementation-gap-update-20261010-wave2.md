# SPEC-308 implementation gap closure — 2026-10-10, wave 2

## Source checkpoint

- PR #399 source candidate: `dd6a42f82ba1452dcc7a58a7626455b31970ee4d` (`fix(spec-308): fence chat scope and localize states`).
- Canonical base refreshed before commit: `origin/main` `6dcd7934332db7929904f8da642915751a6bb79d`.
- PR #399 base before commit: `596fcdbfc656f62c7a3b9205c44d252849f5e859`.
- No other worktree or PR branch was modified.

## Implemented

- Fence the existing Chat conversation ID and in-flight `createConversation` result by authenticated user and current tenant. The scope distinguishes guests, users without a tenant, and tenant-bound users. On a scope transition, close the old dialog, clear its conversation/task/map context and Feedback draft state, reset the create mutation, and ignore stale task prompts.
- Add English and Thai strings for the launcher-owned Chat startup/retry and Feedback upload/submit fallback states. Server-provided error messages remain unchanged.
- Fix the browser fixture race reported by CI run `37975735432` (`16/17` passed): wait for the notification baseline before dispatching the manual-motion demo event so `FeedbackButton` has loaded preferences and registered the demo listener.

## Fast-gate evidence and verification limits

- `git diff --check`: passed.
- English and Thai chat locale JSON parsing: passed with `python3 -m json.tool`.
- `git_capabilities.py inspect`: no merge/rebase/cherry-pick and no unmerged paths; four changed paths were task-owned.
- Tests and TypeScript typecheck were intentionally not run pending the requested single consolidated round.
- ESLint/Prettier could not run in this checkout: no project ESLint configuration/dependency is present (`pnpm exec eslint` fell back to ESLint 6.4 and reported no configuration; `pnpm exec prettier` reported command not found). No full/local typecheck was substituted.

## Requirement impact

Implementation progress supports `REQ-BAE8E6B0A985`, `AC-308-025`, `AC-308-026`, `AC-308-035`, and `AC-308-036`. No ledger row is marked PASS. All 66 requirements remain OPEN/UNVERIFIED until the consolidated exact-head tests, integration and required acceptance evidence are available.

## Remaining gates

- The consolidated exact-head test round remains pending on the candidate PR SHA.
- This is deterministic mocked browser fixture evidence, not live authenticated acceptance.
- Feature-049 authorization/revision authority, approved non-production runtime and identity, PR #403 live MCP credentials, and Security/Runtime Owner disposition for `sprintf-js` remain external blockers for their respective gates.
- Production flags remain OFF; no deployment or production acceptance occurred.
