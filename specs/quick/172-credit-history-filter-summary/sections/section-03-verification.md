# Section 03 — Verification

## Ownership

Own focused tests and final checks only; do not broaden dirty worktree changes.

## Checks

- focused server service/router tests
- focused Credits page test or component-level test with mocked tRPC query hooks
- `npm --workspace apps/web run check` if runtime permits; distinguish baseline failures
- `git diff --check`
- manual review of shared filters, zero/invalid/loading states, tenant scope, and Dashboard compatibility

## Completion evidence

Report exact commands and pass/fail output. Do not claim browser or production verification without authenticated browser/live evidence.
