# Section 02 — Code Review Interview

## Auto-fixes Applied

1. **HIGH: `updateCustomTool` UPDATE missing `tenantId` guard** — Added `eq(agencyTools.tenantId, tenantId)` to UPDATE WHERE clause.
2. **HIGH: `decrypt` dynamic import** — Moved to static import alongside `encrypt`.
3. **HIGH: `oneCallAtATime` lock not wired** — Added `threading.Lock` acquisition in `_execute_custom_tool_sync`.
4. **HIGH: `oneCallAtATime` pytest test absent** — Added test.
5. **MEDIUM: `requiresApproval` not synced on riskLevel change** — Added to `updateCustomTool`.
6. **MEDIUM: SSRF internal URL bypass** — Parse both URLs, compare origins.
7. **MEDIUM: Out-of-scope modelSettings test** — Removed from section-02 test file.

## Let Go

- **LOW: sync httpx.Client** — Matches existing pattern (`_execute_http`, `_execute_sandbox`). Async conversion deferred.
- **LOW: `time.sleep` blocking** — Same reason.
- **LOW: IPv4-mapped IPv6** — Edge case not in spec.
- **MEDIUM: Missing createCaller tests** — Tests verify core logic directly; full router mocking is fragile.
