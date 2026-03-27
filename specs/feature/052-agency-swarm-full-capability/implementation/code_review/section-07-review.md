## Review Report

### Verdict: APPROVE_WITH_FIXES

---

## Summary

The implementation is structurally sound and matches the spec closely. `AgencyRunContext` is correctly designed, the asyncio lock is applied consistently to async methods, and the context is correctly wired from `agencies.userContext` through `agency_config` to the orchestrator to individual tool bridges. There are no security or data-loss issues. The 10 required tests are present and cover the right scenarios. Four issues need attention before merge: one HIGH (sync helpers are not thread-safe under concurrent async conditions), one MEDIUM (Test 8 spec requirement not fulfilled), one LOW, and one NITPICK.

---

## Findings

---

### **[HIGH]** `get_sync` / `set_sync` bypass the asyncio.Lock — unsafe when called concurrently with async tasks

- **File:** `python-backend/app/services/agency_run_context.py`
- **Line:** 49–55
- **Detail:** The spec (section 07, Implementation Guidance §3) explicitly says: "since the lock is only needed for concurrent async tasks (like parallel fan-out in section-18), simple dict access is safe for synchronous single-threaded tool calls. Document this trade-off." The implementation adds the methods but the docstrings say "safe for single-threaded tool calls" — which is accurate today, but **section-18 (parallel fan-out) will execute multiple agent branches concurrently in the same event loop**. At that point a tool running in branch A can call `set_sync` while an async task in branch B calls `await ctx.set(...)`. Because `set_sync` writes `self._data[key]` directly without holding the lock, it races with the lock-protected async write. CPython's GIL prevents torn writes on individual dict operations, but a `set_sync` call interleaved with a `get_all` (which copies the entire dict under the lock) can produce an inconsistent snapshot. The spec says to document this trade-off; the implementation documents it as unconditionally "safe", which is incorrect for the section-18 future.
- **Recommendation:** Update the docstrings to explicitly state: "Unsafe if called concurrently with async `set`/`get_all` (e.g., during section-18 parallel fan-out). Use only from single-threaded agency-swarm tool `run()` methods where no concurrent async writes are in progress." Alternatively, implement `get_sync`/`set_sync` using `asyncio.get_event_loop().run_until_complete(self.get(...))` as the spec suggests for the parallel-safe variant. At minimum the current limitation must be documented so section-18 implementers know not to rely on `set_sync` from parallel branches.

---

### **[MEDIUM]** Test 8 does not verify ToolBridge context attachment — only tests the sync helpers directly

- **File:** `python-backend/tests/unit/test_agency_run_context.py`
- **Line:** 380–388
- **Detail:** The spec requires Test 8 to verify: "Mock a tool instance, verify `self.context.get`/`set` work **through the bridge**." The implemented test (`test_sync_get_set`) calls `ctx.set_sync` and `ctx.get_sync` directly on the `AgencyRunContext` — it never touches `_make_run_func`, `create_tool_bridge`, or a mock tool instance. The key invariant being tested in the spec is that `run_func` inside `_make_run_func` assigns `tool_instance.context = captured_run_context` (line 272 of `agency_tools.py`). If that line were removed, Test 8 would still pass. The ToolBridge wiring is the only path that exercises `agency_tools.py` in this test file, and it is entirely untested.
- **Recommendation:** Replace or supplement Test 8 to call `_make_run_func(tool_config, whitelist, run_context=ctx)`, invoke the returned `run_func` with a mock object, and assert that `mock_tool.context is ctx` and that `mock_tool.context.get_sync("key") == expected_value`. This is the spec-required coverage.

---

### **[LOW]** `snapshot()` is not lock-safe — calling it mid-run (not at run end) can produce a torn copy

- **File:** `python-backend/app/services/agency_run_context.py`
- **Line:** 43–45
- **Detail:** The spec says `snapshot()` does not need the async lock because it "is called synchronously at run end when no concurrent access is possible." That reasoning is valid for the current call site in `run_with_context` (line 176 of `agency_orchestrator.py`, after `await self._execute_node` returns). However, the spec also states "section-09 (SSE streaming) reads context for event metadata" and "section-19 (loop/retry) reads/writes iteration state." If a future section calls `snapshot()` mid-run (e.g., to emit a partial-state SSE event while the run is still in progress), it will race with concurrent `set` calls from other async tasks. `copy.deepcopy(self._data)` is not atomic — it iterates the dict while another coroutine could be modifying it.
- **Recommendation:** The current call site is correct and safe. Add a comment to `snapshot()` explicitly stating: "MUST only be called after all async operations on this context have completed (i.e., at run end, not mid-run). For mid-run snapshots, use `await get_all()` instead." This prevents misuse by future section implementers.

---

### **[NITPICK]** `hasattr(row, "user_context")` guard in `agency_service.py` is unnecessary

- **File:** `python-backend/app/services/agency_service.py`
- **Line:** 452
- **Detail:** The SQL query at line 411 explicitly selects `"userContext" as user_context`. SQLAlchemy `Row` objects always expose every column in the `SELECT` list as an attribute. The `hasattr` guard was likely added defensively in case the column is absent from the DB, but that case is handled by the column being `NULL` (not by the attribute being absent). `hasattr(row, "user_context")` will be `True` regardless of whether the DB value is NULL or populated, so the fallback to `None` from the `else` branch is unreachable. A NULL `userContext` column is already handled naturally: `row.user_context` returns `None`, which is the correct default.
- **Recommendation:** Simplify to `user_context=row.user_context` and remove the `hasattr` guard. Add a SQL comment noting that a NULL value results in no context seed.

---

## Contract Compliance

| Contract | Status | Notes |
|---|---|---|
| `AgencyRunContext` has no `agency_swarm` imports | PASS | Module-level docstring confirms, confirmed by reading the file |
| All 10 spec-required tests present | PARTIAL FAIL | Tests 1–7, 9, 10 match spec. Test 8 does not match spec (exercises sync helpers directly, not ToolBridge wiring) |
| `asyncio.Lock` used in all async methods | PASS | `get`, `set`, `get_all` all acquire `self._lock` |
| `snapshot()` uses `copy.deepcopy` (not shallow) | PASS | Line 45 |
| `ExecutionContext` gains `shared_context` and `context_snapshot` as optional/defaulted fields | PASS | Both default to `None` (lines 68–69 of `agency_orchestrator.py`) |
| `saveBuilder` Zod schema accepts `userContext: z.record(z.string(), z.unknown()).optional()` | PASS | Line 1093 of `agency.ts` |
| `userContext` persisted to `agencies` table via `setValues` | PASS | Line 1170 of `agency.ts` |
| `user_context` loaded from DB and passed to orchestrator in both `run` and `run_with_context` call sites | PASS | Lines 618 and 898 of `agency_service.py` |
| `run_context` parameter flows through `resolve_tools_for_agent` → `create_tool_bridge` → `_make_run_func` → `tool_instance.context` | PASS | Traced through `agency_tools.py` lines 241–272 |
| `context_snapshot` captured after `_execute_node` returns | PASS | Line 176 of `agency_orchestrator.py` — after `await _execute_node` |
| `AgencyRunContext` does not enforce JSON-serializable values (left to callers per spec) | PASS | No validation in class |
| `AgencyConfig` Pydantic model updated with `user_context` field | PASS | Line 116 of `agency_swarm_adapter.py` |
| Section-01 dependency: `agencies.userContext` JSONB column exists in schema | PASS | Confirmed at `drizzle/schema.ts:4613` |
| Naming conventions match spec (`shared_context`, `context_snapshot`, `user_context`) | PASS | All names match spec §Naming Conventions |
| No cross-run context leakage: fresh instance per `run_with_context` call | PASS | `AgencyRunContext` instantiated inside `run_with_context` body, not in `__init__` |

---

## Detailed Notes

**Thread-safety design is correct for the current execution model.** The asyncio.Lock correctly serializes access from concurrent coroutines. The concern raised in the HIGH finding is a forward-looking risk for section-18 (parallel fan-out), not a current bug. The implementation will work correctly for all sections through section-17.

**The `run()` path also benefits from context.** The `AgencyOrchestrator.run()` method delegates to `run_with_context` (line 136–143) and discards the returned `ExecutionContext`. The `AgencyRunContext` is still created and used during the run; it is just not returned to the caller. This is correct — `run()` is the non-observability path and the snapshot is not needed there.

**The spec says to pass `user_context` from the run request payload to Python.** Reading `apps/web/server/routers/agency.ts`, the `saveBuilder` procedure stores `userContext` into the `agencies` table. The run procedure in `agencies.py` (Python) loads `agency_config` from the database via `load_agency()`, which now includes `user_context` from the JSONB column. This is the correct architecture: context is configured once at the agency level and seeded at run time from the persisted config — callers do not need to repeat it in each run request.

**Test 10 uses `knowledge_base` as a stub node type to avoid needing an adapter.** This is a reasonable pragmatic choice for unit testing. The test correctly verifies that `ctx.shared_context` is seeded with the provided `user_context` and that `ctx.context_snapshot` is populated after the run. The test would fail if the orchestrator initialization or snapshot logic were removed.
