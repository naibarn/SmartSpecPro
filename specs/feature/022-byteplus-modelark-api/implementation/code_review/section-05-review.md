# Section 05 Code Review

## Overall: CONDITIONAL PASS — two FAIL items must be fixed before commit

### FAIL-1 [SECURITY] — Error detail may leak API key via httpx exception messages
Lines: gateway_unified.py:233 (image), 444 (video)

`str(httpx.HTTPStatusError)` can include the full request URL and response body. If BytePlus echoes back auth info in an error response, it propagates to the client. Fix: log raw error via structlog, return sanitized fixed string.

### FAIL-2 [BUG] — NameError if BytePlusModelArkProvider.__init__ raises
Lines: gateway_unified.py:206 (image), 409 (video)

`client = BytePlusModelArkProvider(...)` is outside the `try` block. If `__init__` raises, `finally: await client.aclose()` will hit NameError. Fix: move `client = ...` inside the `try` block.

### CONCERN-1 [TEST] — Missing video test for empty apiKey
`test_raises_503_when_api_key_missing` exists only for image path. Video path only tests `None` case. Minor asymmetry.

### PASS Items
- HTTP 503 used for unconfigured provider (not 500)
- HTTPException re-raised before general except
- aclose() in finally for both paths
- API key not logged in error log lines
- BytePlus block inserted BEFORE Kie.ai block
- VideoGenerationResponse correctly omits `status=` field
- _deduct_credits uses estimated_cost for async video, actual_cost for synchronous image
- 15 tests covering all section stubs plus extras
- Regression tests for Kie.ai non-BytePlus models
- CONCERN-3 (R2 URL resolution for video reference images) is a known plan gap, not a regression

## Auto-Fix Plan
1. Sanitize error messages in both exception handlers
2. Move `client = BytePlusModelArkProvider(...)` inside `try` block for both methods
3. Add `test_raises_503_when_video_api_key_missing` to test suite
