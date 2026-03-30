# Feature 053 — Python Security Audit Round 2

**Auditor:** CMD-6 FastAPI Security Auditor
**Date:** 2026-03-23
**Branch:** codex/feature-044-multimodal-chat-memory
**Scope:** Verify all Round-1 findings fixed; check 5 new concerns.

---

## Per-File Verdicts

### 1. `long_term_memory.py` — PASS

**Round-1 findings — verified fixed:**

| Prior Finding | Status |
|---|---|
| Safety filter too sparse (was 10 patterns) | FIXED — 34 patterns across `unsafe_patterns` list + structural prefix checks + imperative-verb ratio check |
| `delete_memory` no user_id check for non-admin | FIXED — `conditions.append(AgencyAgentMemory.user_id == actor_user_id)` at line 210 when `is_admin=False` |
| `_check_memory_flag` missing → save_memory ran unconditionally | FIXED — `if not await self._check_memory_flag(tenant_id): return None` at line 67 |
| `run_result` passed raw to LLM in `extract_memories` | FIXED — `sanitize_llm_input(run_result, max_length=3000)` at line 304 |

**No new issues found.** Structured logger (`logging.getLogger`) used throughout, no `print()` calls.

---

### 2. `agentic_cost_controls.py` — PASS (with one LOW observation)

**Round-1 finding — verified fixed:**

| Prior Finding | Status |
|---|---|
| `acquire()` race condition: INCR+check+DECR was non-atomic | FIXED — full Lua script `_ACQUIRE_LUA` executes check+increment atomically in one `redis.eval()` call |

**Observation (LOW — not a security issue):**
`acquire()` signature declares `user_id: str` (line 130) but callers in `agency_orchestrator.py` pass `ctx.user_id` which is typed as `int` (line 115 of orchestrator's `ExecutionContext`). Python's Redis key-building via f-string coercion means this works at runtime, but it is a type contract violation that mypy will flag. Not a security vulnerability; limiter key remains correct because `str(int)` is deterministic.

**No `print()` calls. No secrets logged.**

---

### 3. `agency_orchestrator.py` — PASS

**Round-1 finding — verified fixed:**

| Prior Finding | Status |
|---|---|
| `_execute_autonomous_node` missing (no "autonomous_agent" case) | FIXED — method exists at line 649; `case "autonomous_agent":` present at line 346 in `_execute_node` match block |
| `_execute_react_path` still works | CONFIRMED — method at line 519, still called from `_execute_agent_node_agentic` at line 816 |

**New concern A — `agencyAutonomousAgentEnabled` flag gate:** PASS
Feature flag checked at lines 662–667 before any execution. Exception during flag check defaults to `False` (fail-closed). If flag is off, falls back to `_execute_agent_node` rather than raising.

**New concern B — `ConcurrentRunLimiter` released in finally:** PASS
`limiter.release()` is called in a `finally` block at lines 735–739, guaranteeing release even on exception.

**New concern C — SSRF in `_resolve_tool_configs_for_react` custom tool endpoints:** PARTIAL — see F01 below.

**New concern D — `user_token` logged or stored in Redis/DB:** PASS
`user_token` is stored in `ExecutionContext.user_token` (in-memory only). It is passed as `api_key=ctx.user_token` to the `AsyncOpenAI` client and as `Authorization: Bearer` header in HTTP calls. No structlog call emits it. No Redis `SET` of the token value was found. The `ConcurrentRunLimiter` keys contain only `tenant_id`, `user_id`, and `run_type` — not the token.

**New concern E — structured logging:** PASS
Uses `structlog.get_logger(__name__)` throughout; no `print()` calls in orchestrator.

---

### 4. `react_executor.py` — PASS

**Round-1 finding — verified fixed:**

| Prior Finding | Status |
|---|---|
| Context injected into LLM without sanitization | FIXED — `sanitize_llm_input(json.dumps(context), max_length=4000)` at line 96; task sanitized at line 99 |

**SSRF:** `_validate_tool_url(url)` called at line 254 before every HTTP tool call. Result sanitized via `sanitize_llm_input(result, max_length=2000)` before returning at line 269.

**No `print()` calls. No secrets logged.**

---

### 5. `autonomous_executor.py` — PARTIAL — see F02 below

**Round-1 findings:** None were raised for this file specifically; it is newly audited in Round 2.

**Delegation depth:** PASS — `delegation_depth >= MAX_DELEGATION_DEPTH` check at line 291 before calling `_execute_node`. Incremented correctly in `delegated_ctx` before recursing (line 301).

**Plan validation:** PASS — `_validate_plan` enforces minimum 1 sub-task, enforces max sub-task count, checks dependency references, and runs Kahn's algorithm cycle detection.

**`cross_agency` execution mode:** PARTIAL — see F02.

---

## Findings Table

| ID  | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|-----|----------|-----------|--------------|-------------|-----------------|
| F01 | HIGH | `python-backend/app/services/agency_orchestrator.py:784-790` | SSRF bypass path | `_resolve_tool_configs_for_react` calls `_validate_tool_url` only at execution time inside `ReActExecutor._handle_tool_call`. However, custom tools (non-`builtin-` prefix) receive their `endpoint_url` directly from `tool_config.get("endpoint_url")` at build time with **no pre-validation** before populating `tool_endpoint_map`. If `_handle_tool_call` has a code path that bypasses the validator (e.g., an exception in `_validate_tool_url` is swallowed incorrectly), the URL reaches `httpx`. Currently `_handle_tool_call` does call `_validate_tool_url` before the request (line 254 of `react_executor.py`), but there is no defense-in-depth validation at the point `tool_endpoint_map` is constructed — a future refactor removing the per-call check would open a direct SSRF. | Add `_validate_tool_url(endpoint_url)` inside `_resolve_tool_configs_for_react` when resolving custom tool URLs (line ~786), before appending to `tool_endpoint_map`. Raise or `continue` on failure. This creates defense-in-depth so the map never contains an invalid URL. |
| F02 | HIGH | `python-backend/app/services/autonomous_executor.py:44, 269` | Missing execution mode guard | `SubTask.execution_mode` accepts the string `"cross_agency"` in its docstring comment, but `_execute_subtask` only branches on `"delegate"` (line 269) — `"cross_agency"` falls through to the `else` branch and executes via the local `react_executor_factory`. This means an LLM-generated plan could set `execution_mode = "cross_agency"` and the system silently ignores the cross-agency intent rather than blocking it. More importantly, if `"cross_agency"` handling is later added to `_execute_subtask`, it would have **no feature flag gate** (unlike `_execute_autonomous_node` which checks `agencyAutonomousAgentEnabled`) — potentially bypassing tenancy controls. | Either remove `"cross_agency"` from `SubTask` docstring and schema entirely (treat it as unsupported), or add an explicit branch: `elif subtask.execution_mode == "cross_agency": return "[cross_agency delegation not permitted]"` until the feature is fully implemented with proper flag gating. |
| F03 | MEDIUM | `python-backend/app/services/agentic_cost_controls.py:130, 682` | Type contract violation | `ConcurrentRunLimiter.acquire()` and `release()` declare `user_id: str`, but both `_execute_react_path` and `_execute_autonomous_node` pass `ctx.user_id` which is `int`. Python coerces this correctly in f-strings, so no runtime bug exists today, but mypy will fail and any future code using `user_id` as a string (e.g., JSON serialization, log filtering by string match) will silently produce wrong results. | Change callers to pass `str(ctx.user_id)` explicitly, or change the parameter type to `int | str` with explicit coercion in `_user_key`. |

---

## Summary

| File | Verdict | Notes |
|---|---|---|
| `long_term_memory.py` | PASS | All 4 Round-1 findings confirmed fixed |
| `agentic_cost_controls.py` | PASS | Lua-atomic acquire confirmed; one LOW type observation (F03) |
| `agency_orchestrator.py` | PASS | Autonomous node wired, flag-gated, limiter in finally, no token leak |
| `react_executor.py` | PASS | Context sanitized, SSRF validated at call time |
| `autonomous_executor.py` | PARTIAL | `cross_agency` mode unguarded (F02); delegation depth and plan validation OK |

**New findings this round:** 3 (1 HIGH, 1 HIGH, 1 MEDIUM). No new CRITICAL issues. The most urgent fix is F01 (defense-in-depth SSRF gap in `_resolve_tool_configs_for_react`) and F02 (unguarded `cross_agency` execution mode).
