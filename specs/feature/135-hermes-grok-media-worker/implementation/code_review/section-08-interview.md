# Section-08 Code Review Triage — 2026-07-16

Mode: autonomous (user waived interviews). Auto-triage by conductor.

| # | Finding | Severity | Decision |
|---|---|---|---|
| 1 | Foreign MCP auto-resolve hunk in mediaTransportResolver.ts | BLOCKER-as-scoped | ACCEPT AS RIDE-ALONG — pre-existing dirty content from the concurrent MCP-sharing session (companion service file dirty too); commit-body note; concern about missing tests relayed to owner |
| 2 | ON CONFLICT omits creditCost (helper/SQL parity) | MEDIUM | AUTO-FIX |
| 3 | storyboardReviewWorkspace normalizer narrows hermes values | MEDIUM | DEFER → REQUIRED item in section-09/10 briefs (fix before hermes reaches storyboard_review) |

Also recorded: section-08's agent detected `hermesMediaAdapter.ts`
(section-06 agent's in-progress file) failing the namespace guard via a
doc comment containing a forbidden literal — to be fixed when section-06
closes (its review will enforce).
