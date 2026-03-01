# Code Review Interview — Section 07: Browser Automation Tool

## Auto-confirmation mode: User approved all fixes automatically.

## Findings Triage

### Asked User (skipped — auto-confirm mode)
None required. All items auto-triaged.

### Auto-Fixed Items

| # | Severity | Issue | Fix Applied |
|---|----------|-------|-------------|
| F1 | HIGH | Missing feature flag check (browserAutomation) | Added `getTenantFeatureFlag("browserAutomation")` before concurrency check |
| F2 | HIGH | No auth on browserTool.ts endpoint | Added `verifyInternalToken()` check using `crypto.timingSafeEqual` |
| F3 | HIGH | Race condition in tenant semaphore (INCR/EXPIRE not atomic) | Switched to Redis pipeline for atomic INCR+EXPIRE |
| F6 | HIGH | Raw Python error body leaked to caller | Log internally, return sanitized 502 response |
| F7 | HIGH | SYS_ADMIN capability in docker-compose | Removed `cap_add: SYS_ADMIN`, added comment about --disable-setuid-sandbox |
| F8 | MEDIUM | Fragile string-based exception discrimination in IP check | Restructured to flag pattern (no string-matching) |
| F10 | MEDIUM | `actual_cost` from Python not clamped | Added `Math.max(0, Math.min(..., BROWSER_RESERVE_CREDITS))` |
| F11 | MEDIUM | Double releaseConcurrency call paths | Moved releaseConcurrency to `finally` block only, used `concurrencyAcquired` flag |
| F12 | MEDIUM | Python upstream status codes forwarded to caller | Normalized all Python errors to 502 |

### Let Go (Low Priority / Out of Scope)

| # | Severity | Reason |
|---|----------|--------|
| F4 | HIGH | Stub implementation is acceptable for initial release gated behind feature flag (disabled by default). Real Playwright integration is follow-up work. |
| F5 | HIGH | DNS resolution async issue — deferred since feature is behind feature flag and stub |
| F9 | MEDIUM | allowed_domains validation — deferred to follow-up |
| F13 | MEDIUM | Redundant `npx playwright install` in Dockerfile — deferred since container not built yet |
| F14 | MEDIUM | Concurrency tests test constants only — acceptable for stub implementation |
| F15 | MEDIUM | TS tests test mock setup only — acceptable for stub phase |
| F16 | MEDIUM | Registration test is vacuous — acceptable stub |
| F17 | LOW | Redis `as any` cast — existing pattern in codebase, acceptable |
| F18 | LOW | break on any error in execute_actions — acceptable for stub |
| F19 | LOW | Token fallback names in Python — deferred cleanup |
| F20 | LOW | Unused redis_client param — deferred cleanup |
