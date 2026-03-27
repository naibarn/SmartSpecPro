# Code Review Interview: Section 01 - Foundation

**Date:** 2026-03-23

## Triage Summary

All findings are auto-fixable. No items need user discussion.

## Auto-Fixes

### FIX 1: Add try/except to `_env_int` (MEDIUM)
**Issue:** `_env_int` crashes on non-integer env var values, killing FastAPI at import time.
**Fix:** Wrap `int()` in try/except, fall back to default with warning log.

### FIX 2: Add `@pytest.mark.unit` to all test functions (MEDIUM)
**Issue:** Missing markers break selective test runs via `pytest -m unit`.
**Fix:** Add `@pytest.mark.unit` decorator to all 15 test functions.

### FIX 3: Clean up module reload in test (MEDIUM)
**Issue:** `test_limits_read_from_env` leaves dirty module state after reload.
**Fix:** Add teardown reload to restore defaults.

### FIX 4: Make sanitizer accept `str | None` explicitly (MEDIUM)
**Issue:** Function signature says `str` but handles `None` via `if not text`.
**Fix:** Change signature to `str | None` and document the behavior.

### FIX 5: Remove trailing space in "You are now" replacement (LOW)
**Issue:** Inconsistent spacing in replacement output.
**Fix:** Use `[FILTERED]` without trailing space, matching other patterns.

### FIX 6: Add str.format() brace escaping comment (LOW)
**Issue:** Future maintainers could introduce KeyError by forgetting to double braces.
**Fix:** Add module-level comment.

## Let Go (No Action)

- **Unicode private-use area filtering:** Spec explicitly defines the range. Not changing.
- **Loose completion assertion in test:** Test checks what spec requires. Sufficient.
