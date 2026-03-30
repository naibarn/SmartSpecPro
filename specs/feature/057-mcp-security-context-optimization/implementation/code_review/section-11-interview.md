# Section 11 Code Review Interview

## Triage Summary

### Auto-fixed (applied without user input)
1. **HIGH: `hash()` cache key** → Replaced with `hashlib.md5().hexdigest()` for deterministic, collision-resistant caching
2. **MEDIUM: FIFO eviction order** → Now evicts before insert (`>= _CACHE_MAX_SIZE`)
3. **MEDIUM: `deduplicate_chunks` pre-sort** → Added `sorted()` by `final_score` descending inside the function for safety
4. **LOW: Empty `ex_text`** → Added `if not ex_text: continue` with default 0.0 similarity
5. **LOW: Missing exclusion assertions** → Added `assert "Recipe..." not in result_texts` and `assert "sales pitch..." not in result_texts`
6. **LOW: Cache test docs** → Added explicit verification that example keys exist in cache

### Let go (not actionable)
1. **HIGH: Wrong patch target** → Reviewer incorrect. Patching source module works correctly for deferred imports. Tests pass.
2. **MEDIUM: Not wired into production** → Out of scope per spec. Function is available for orchestrator integration.
3. **LOW: Dedup asymmetry** → Pre-existing architecture concern, not introduced by this change.

## Verification
All 12 tests pass after fixes.
