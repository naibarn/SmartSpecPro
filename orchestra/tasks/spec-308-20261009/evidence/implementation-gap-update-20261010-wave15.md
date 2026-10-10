# SPEC-308 continuation wave 15 — consolidated browser CI repair

## Evidence ledger

- Source: GitHub browser test output and downloaded Playwright artifact.
- Run: `38012035018`, exact source SHA `1b508beee866d1fec41ae146bfb3b59e0ce02b69`.
- Result: 21/23 mocked Chromium cases passed. Two tests failed on their assertions; the remaining browser cases passed.
- Failure A: `spec-308-dual-surface.spec.ts:623` expected a button named `Demo reminder balloon`, but the actual product surface is an `aside.assistant-reminder-balloon` containing named CTA/dismiss buttons. The error context showed the generic launcher but did not prove the mascot preference/gate had completed. Fix: wait for the launcher's rendered `[data-mascot-style]` marker after feature flag enablement, then assert the reminder surface by its actual class.
- Failure B: `spec-308-side-effects.spec.ts:140` selected every descendant button in `global-notification-bell`; when the popover opened, eight buttons matched and Playwright strict mode rejected the assertion. Product behavior was correct; error context showed the Bell trigger already had `aria-expanded="true"`. Fix: select the Bell trigger by its stable `aria-controls="global-notification-popover"` contract.

## Implemented

- Corrected only the two Playwright selectors and added an explicit mascot-render readiness assertion before dispatching the demo event in the metrics scenario.
- No production component, authorization, notification, chat, task-control, feedback, security policy, or feature-flag behavior changed.

## Other gates from the same CI cycle

- Run `38012034963`, exact PR #399 SHA `1b508beee866d1fec41ae146bfb3b59e0ce02b69`: MCP focused tests 76 passed / 44 failed on the canonical baseline fixture/import defects (PostgreSQL-backed session state fixture mismatch and stale tests importing retired `agencyMcpService`). `check:mcp146`, `security:mcp146`, and mandatory production audit were skipped by workflow dependency after the focused suite failed. No gate was bypassed.
- The separate live MCP smoke failed closed because `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN` are absent. This requires authorized CI/runtime authority.
- PR #403 read-only audit confirms its old exact-head MCP/check/security tests passed; its production audit still fails on existing dependencies and live MCP remains authority-blocked. PR #405 remains first in integration order and blocked by the unapproved Moderate `sprintf-js@1.1.3` disposition.

## Verification and state

- This is a test-source repair derived from exact failure evidence. No local test suite was run; the next candidate is to receive one consolidated exact-SHA workflow run after the current implementation checkpoint.
- `git diff --check` passed before checkpointing.
- SPEC-308 requirement ledger remains 66/66 OPEN. Mocked CI does not close requirements or establish live authenticated acceptance.
- Latest canonical `origin/main` refreshed to `9cedee5ea2590f2671d7541244de8846f6c732f6`; this task branch was merged with that ref before this repair.
- Production feature flags remain OFF; no deployment or security-gate changes.
