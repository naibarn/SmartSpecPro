# Section-05 Code Review Triage — 2026-07-16

Mode: autonomous (user waived interviews). Auto-triage by conductor.

| # | Finding | Severity | Decision |
|---|---|---|---|
| 1 | Non-atomic admission (Redis 2-step + unlocked DB counts) | BLOCKER | AUTO-FIX (Lua script + advisory-lock seam + concurrency test) |
| 2 | Queued-cap counting not outputCount-weighted | MAJOR | AUTO-FIX (weighted SUM baselines) |
| 3 | Auto-pick ignores assetType/busy | MEDIUM | AUTO-FIX |
| 4 | Idempotency after admission burns budget | MEDIUM | AUTO-FIX (reorder) |
| 5 | Silent refund-failure swallow | MINOR | AUTO-FIX (logger.error) |
| 6 | Repo method not tenant-scoped | NIT | AUTO-FIX |

Implementer deviations reviewed and accepted (idempotency-before-fee,
validation-before-admission per TDD authority, optional connectionId for
auto-pick, manifest-only op gate with future model-row hook, documented
no-rollback of window increments on later-check rejection — superseded by
fix 4's reorder + fix 1's atomic seam).
