# Section 01 — Code Review Interview

## Auto-fixes Applied (no user input needed)

| # | Finding | Action | Status |
|---|---------|--------|--------|
| 1 | HIGH: `test_executor_uses_clamped_timeout` could silently pass if executor short-circuits | Added `assert mock_factory.called` guard | Applied |
| 2 | HIGH: `httpx.HTTPError(string)` incompatible with httpx 0.23+ | Changed to `httpx.ConnectError` which accepts bare string | Applied |
| 3 | HIGH: Redundant `.replace("/", ".")` in structlog test | Removed, used `MODULE_PATH` directly | Applied |
| 4 | MEDIUM: Missing `workflow_id` leakage assertion | Added `assert "123" not in result.error` and `assert "999" not in result.error` | Applied |
| 5 | MEDIUM: Cross-tenant cache test used separate mock contexts | Restructured to single mock context, assert `post.call_count == 2` | Applied |
| 6 | LOW: SSRF tests don't guard against DB being reached | Added `patch(AsyncSessionLocal, side_effect=AssertionError)` to both SSRF tests | Applied |

## Let Go (no action)

| # | Finding | Reason |
|---|---------|--------|
| 1 | LOW: `clear_cache` uses exported fn instead of internal dict | Positive deviation from spec — tests the public API |
| 2 | LOW: F09 test doesn't exercise pre-fix regression | Acceptable given fix confirmed in source; mutation testing out of scope |

## Verification

All 21 tests pass after fixes applied.
