# Section 07 Code Review Interview

## Review Findings Triage

### Auto-fixed (no user input needed)

1. **[HIGH] Sync helpers lock-bypass documentation**
   - Added explicit docstrings warning that `get_sync`/`set_sync` bypass the asyncio.Lock
   - Documented they are only safe for single-threaded sequential execution
   - Added note that section-18 parallel fan-out callers must use async methods
   - Status: APPLIED

2. **[MEDIUM] Test 8 didn't test ToolBridge wiring**
   - Rewrote test to actually call `_make_run_func` with `run_context` param
   - Verifies `tool_instance.context` is set to the `AgencyRunContext` by the closure
   - Status: APPLIED

3. **[LOW] snapshot() race documentation**
   - Added docstring clarifying it MUST only be called after all async operations complete
   - Points to `await get_all()` for mid-run reads
   - Status: APPLIED

4. **[NITPICK] hasattr guard removal**
   - Simplified `user_context=row.user_context if hasattr(row, "user_context") else None` to `user_context=row.user_context`
   - The SQL always selects the column, so hasattr was always True
   - Status: APPLIED

### Let go (no action needed)

None — all findings were valid and auto-fixed.

## Verification

- All 10 unit tests pass after fixes
- Existing orchestrator tests (5) pass
- Existing tools tests (11) pass
- No regressions
