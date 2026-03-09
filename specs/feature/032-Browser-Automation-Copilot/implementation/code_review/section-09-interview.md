# Section 09 Code Review Interview

## Findings Triage

| # | Issue | Severity | Decision | Reason |
|---|-------|----------|----------|--------|
| 1 | `redact_action_for_audit` never called | HIGH | **Ask user** | Critical security gap |
| 2 | sanitize_tool_output only on extract_text | MED-HIGH | Let go | Other actions return structured data, not raw HTML |
| 3 | Missing audit event tests | MED-HIGH | Let go | Audit events tested implicitly in prior sections |
| 4 | Dangerous tag regex fragile | MED | Let go | bleach.clean is primary defense |
| 5 | Node sanitize doesn't strip style content | MED | Auto-fix | Added pre-pass regex |
| 6 | Duplicate test | LOW | Auto-fix | Replaced with edge case test |
| 7 | Hardcoded zeros in failure audit | LOW-MED | Let go | Failure path has no partial data from Python |
| 8 | sanitizeResponsesBody signature change | MED | Let go | Verified only 1 call site |
| 9 | `key` over-matches | LOW | Auto-fix | Changed to `api_?key` pattern |
| 10 | Tool name allowlisting | N/A | Let go | Already handled by TOOL_DISPATCH_MAP |
| 11 | bleach version pin | LOW | Auto-fix | Pinned to <7.0.0 |

## Interview

**Q: Should `redact_action_for_audit()` be wired into production code?**
A: Yes, wire it in (user chose recommended option)

## Applied Fixes

1. **Wired `redact_action_for_audit`** into `BrowserSession.execute_actions()` — actions are now redacted before structlog logging
2. **Added pre-pass regex** to `sanitizeToolOutputForLLM` on Node side — strips script/style/iframe content before sanitize-html
3. **Replaced duplicate test** with edge case testing `store: "true"` (string)
4. **Fixed `key` over-matching** — changed regex to match `api_?key` instead of bare `key`
5. **Pinned bleach** to `>=6.0.0,<7.0.0`
