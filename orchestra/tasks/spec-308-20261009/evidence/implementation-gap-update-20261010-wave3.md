# SPEC-308 implementation gap update — 2026-10-10, wave 3

## Exact candidate
- PR #399 candidate commit: `da4d7d8214ffa0e144ccf89988e503663956a9f0` (source commit `a5093fdcf2641939deb8afd1891cb4a9b05d8608`).
- Base refs refreshed before implementation: `origin/main` `6dcd7934332db7929904f8da642915751a6bb79`; PR #399 remote prior to this checkpoint `2ddd19fdfeacb20f58dd01ecb75cc2844be9ada4`.
- PR #403/#405 worktrees and branches were not modified.

## Implementation
- Replaced hard-coded English in the existing Chat/Task Control/Feedback dialog, feedback file states, urgent confirmation and accessible section names with versioned English/Thai locale keys. English labels used by existing selectors remain unchanged.
- Fenced the asynchronous urgent-feedback confirmation by current user/tenant identity so a confirmation opened in one scope cannot submit that draft after a scope switch.
- Repaired the manual-motion browser fixture by installing its mocked EventSource before waiting for the baseline event. Replaced the weak balloon node-count assertion with a visibility assertion before geometry reads.
- The 29.25px drag assertion used a frozen Playwright clock while the product schedules a post-remount measurement with `requestAnimationFrame`. Playwright Clock documentation confirms `install()` controls `requestAnimationFrame`; the test now advances 32ms to permit the layout frame before measuring. The alignment threshold remains unchanged. Reference: https://playwright.dev/docs/clock.

## Fresh checks performed
- `git diff --check`: PASS.
- English and Thai chat locale JSON parse, duplicate-key scan, key parity, and source-key coverage: PASS (234 keys per locale; 50 feedback keys referenced).
- No tests, typecheck, or build run, per the requested single consolidated verification round and shared RAM policy.
- The prior exact-head CI on `2ddd19fdfeacb20f58dd01ecb75cc2844be9ada4` had 14/17 browser scenarios pass; the three failures were the missing baseline fixture, hidden balloon accepted by count-only assertion, and alignment measured before controlled rAF. New candidate remains UNVERIFIED until CI runs.

## Open gates
- Keep all 66 requirement rows OPEN/PARTIAL; no acceptance PASS is inferred from implementation or static checks.
- Next: publish this checkpoint to PR #399 and run one consolidated exact-head CI round. Repair only failures proven by its logs.
- PR #403 MCP fixtures/security gate and live MCP authority, PR #405 mandatory production audit residual, Feature-049 tenant/revision notification authorization, and approved non-production authenticated runtime remain separate blockers. Production flags remain OFF.
