## Review Report — Section 03: Memory-Informed Planning

**Feature:** 058 — Agency Creator Intelligence Upgrade
**Section:** 03 — Memory-Informed Planning
**Files changed:** `python-backend/app/tasks/agency_creator_task.py`, `python-backend/tests/test_agency_creator_v2.py`
**Review date:** 2026-03-24

---

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agency_creator_task.py` (new func, line 34) | **Memory type mismatch with spec**: Implementation queries `memory_type IN ('constraint', 'preference', 'fact', 'skill')` but spec §Changes.1 requires `IN ('strategy_success', 'strategy_failure', 'process', 'insight')`. The valid memory types in the DB are `constraint`, `preference`, `fact`, `skill` (confirmed in `long_term_memory.py:519` and `AgencyAgentMemory` model). Spec was written expecting `strategy_success`/`strategy_failure` types that do not exist in the schema — the implementation correctly uses the real types but the spec is stale. This is a spec/implementation divergence that must be formally reconciled. Either (a) confirm the real types are intentional and update the spec, or (b) if `strategy_success`/`strategy_failure` were planned types that never got added, they are silently absent from results with no error. | Confirm the correct memory type set. If the 4 implemented types are correct, annotate the code with a comment explaining the divergence and update the spec. If `strategy_success` / `strategy_failure` were required, add them to the DB schema and `long_term_memory.py` normalisation whitelist. |
| HIGH | `agency_creator_task.py` (new func) | **`agency_improvement_history` query absent**: Spec §Changes.1 explicitly requires a second query to `agency_improvement_history` (last 30 days, limit 5, with try/except fallback). The implementation omits this entirely. `agency_improvement_advisor.py` exists but no improvement history table is queried. This is a partial delivery of the spec feature. | Add the `agency_improvement_history` secondary query block, wrapped in its own try/except as the spec dictates. |
| MEDIUM | `tests/test_agency_creator_v2.py:167-172` | **`test_scoped_by_tenant_and_user` does not validate the WHERE clause**: The test asserts only that `session.execute` was called, not that the query filters by `tenant_id == "tenant-1"` AND `user_id == 42`. A regression that removed the user_id filter would pass this test silently. This is the F02 security requirement — weak test for a security-critical constraint. | Capture and inspect the SQLAlchemy statement via `mock_session.execute.call_args[0][0]` to assert the WHERE predicates include both tenant and user conditions. Alternatively, test cross-tenant isolation by returning data for tenant-B when calling with tenant-A credentials and asserting it is empty. |
| MEDIUM | `agency_creator_task.py` (new func) | **Deferred import pattern for `sanitize_llm_input`**: `sanitize_llm_input` is imported inside the `try` block via a local import on every call. This is inconsistent with the module's other top-level imports, hides the dependency, and means if the import fails it is silently swallowed by the outer `except Exception` — the sanitization step would be skipped without any indication. | Move `from app.services.agentic_sanitizer import sanitize_llm_input` to the module-level import block at the top of `agency_creator_task.py`. |
| MEDIUM | `tests/test_agency_creator_v2.py:224` | **`_llm_call` user_message assertion is brittle**: The assertion `call_args.kwargs.get("user_message", call_args[1] if len(call_args[1]) > 1 else "")` uses a positional fallback (`call_args[1]`) that accesses the second positional arg but `_llm_call` signature is `(system_prompt, user_message, ...)`. If called with positional args, `call_args[1]` would be the second positional which is `user_message` — but accessing it with `call_args[1]` is `call_args.args[1]` in pytest-mock; `call_args[1]` on a `call` object returns the kwargs dict, not a positional argument. The condition `len(call_args[1]) > 1` will evaluate to `True` if kwargs has more than one key, not as intended. | Use `call_args.args[1]` for positional access, or assert `"Past learnings" in mock_call.call_args.kwargs["user_message"]` if the call uses keyword arguments. Verify by running the test with memories mocked to return empty and confirming it fails correctly. |
| LOW | `agency_creator_task.py` (new func, line 64) | **Log truncation may hide critical context**: `error=str(exc)[:200]` truncates at 200 chars. For connection errors or SQLAlchemy tracebacks this is often sufficient, but `logger.warning` should include `exc_info=False` explicitly so structured loggers don't inadvertently attach a full traceback on some configurations. Minor style consistency issue. | Use `logger.warning("fetch_relevant_memories_failed", error=str(exc)[:200], exc_info=False)` for explicitness. |
| LOW | `tests/test_agency_creator_v2.py` (class `TestFetchRelevantMemories`) | **No test for empty `tenant_id` early-return path**: The function returns `""` immediately when `tenant_id` is falsy, but no test exercises this guard. If the guard were accidentally removed, all tests would still pass because they all supply a tenant_id. | Add `async def test_returns_empty_for_empty_tenant_id()` calling `_fetch_relevant_memories("")` and asserting `== ""` with no session mock, verifying the guard prevents any DB call. |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| F01 — `sanitize_llm_input()` applied to each memory before injection | PASS | Applied at line 53 with `max_length=500`. Wrapped in `<historical_data>` tags with "REFERENCE DATA ONLY" framing as required. |
| F01 — Data tags with explicit untrusted framing | PASS | Header text and XML tags match the spec exactly. |
| F02 — Query scoped by BOTH `tenant_id` AND `user_id` | PASS (code) / WEAK (test) | WHERE clause includes both predicates. Test coverage for this security constraint is insufficient (see MEDIUM finding above). |
| `_llm_plan()` receives `tenant_id` | PASS | Parameter added with default `""`. `_design_async` passes `tenant_id` correctly at line 347. |
| `tenant_id` read from stored payload in design task | PASS | `payload.get("tenantId", "")` at `_design_async` line 323. |
| `_fetch_relevant_memories` returns empty string on DB failure | PASS | Outer `except Exception` catches all errors and returns `""`. |
| `_fetch_relevant_memories` returns empty string for empty tenant | PASS | Guard at function entry before any DB access. |
| `agency_improvement_history` secondary query | FAIL | Completely absent from implementation. |
| Memory type filter matches spec | FAIL | Types mismatch vs spec — real types used, spec types do not exist in schema. Needs reconciliation. |
| `_llm_call` count not affected by memory fetch | PASS | `_fetch_relevant_memories` calls the DB directly, not `_llm_call`. Does not consume budget. |
| Module-level import pattern consistent with rest of file | FAIL | `sanitize_llm_input` imported inside `try` block rather than at module level. |

---

### Summary

The core security requirements (F01 sanitization with data tags, F02 dual-scope query) are correctly implemented in the production code path. The memory retrieval integrates cleanly into `_llm_plan()` and the graceful-degradation contract (empty string on any failure) is solid. However, two spec requirements are missing from the delivery: the secondary `agency_improvement_history` query is entirely absent, and the memory type filter uses the actual DB types (`constraint`, `preference`, `fact`, `skill`) rather than the spec-prescribed types (`strategy_success`, `strategy_failure`, `process`, `insight`) — this divergence needs explicit resolution. The F02 security test is too weak to catch a regression, and the `user_message` inclusion assertion in `TestPlanIncludesMemories` has a broken positional-arg fallback that may not fire correctly. Fix the two HIGH findings and strengthen the scoping test before merge.
