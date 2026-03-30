---
section: 09-vector-memory
date: 2026-03-23
---

## Review Triage

### Applied Fixes (auto-fix, no user input needed)

1. **HIGH: SQL fallback test assertion** — Added negative assertion `assert "embedding <=> CAST" not in first_sql` to `test_semantic_memory_retrieval_falls_back_without_embedding` to verify the vector path was NOT taken. Also replaced `object()` with `MagicMock(spec=[])` for clearer intent.

### Let Go (not in scope)

1. **HIGH: autouse fixture patch target** — The patch on `app.services.embedding_service.get_embedding_service` works correctly because `long_term_memory.py` does a fresh `from ... import` inside `_generate_embedding()`, and Python resolves this through `sys.modules` where the patch is active. Theoretical fragility, not a real bug.

2. **MEDIUM: Missing tests for `extract_and_store_memories` and `boost_confidence_for_memories`** — Pre-existing gap, not introduced by this diff. Out of scope for a test-fix commit.

3. **MEDIUM: HTML-escape test assertions** — Both assertions pass because `sanitize_llm_input` converts `</past_learnings>` to `[FILTERED]` while `<system>` remains and gets HTML-escaped by `html.escape()`. The assertions test different parts of the output string.

4. **MEDIUM: Commit count assertion** — Left as `>= 2` since the exact count depends on implementation details that may change.

5. **LOW: SQL string inspection comment** — Minor, not blocking.
