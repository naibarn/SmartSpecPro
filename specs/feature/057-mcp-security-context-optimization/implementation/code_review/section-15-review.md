## Section 15 Code Review

**File:** `python-backend/app/services/mcp_rate_limiter.py`
**Spec:** section-15-cross-system-protections.md (14.1–14.11)
**Reviewer:** CMD-6 FastAPI Security Auditor

---

### Issues

#### I-01 — HIGH — Truncation math uses char offset, not byte offset (truncate_response, line 49)

The byte-length check on line 46 is correct (`encode("utf-8")`), but the slice on line 49 cuts by character index, not by bytes:

```python
truncated = result[: max_bytes - len(TRUNCATION_MARKER)]
```

For UTF-8 content containing multi-byte characters (CJK, emoji, Arabic, etc.) a character slice of `max_bytes` characters can produce a result whose encoded size significantly exceeds `max_bytes`. The truncation marker length (`len(TRUNCATION_MARKER) == 24`) is also measured in characters, not bytes, compounding the error. A response from a CJK MCP server could still inject up to ~3× `max_bytes` into the agent context.

**Fix:** Encode first, slice the byte buffer, then decode:
```python
encoded = result.encode("utf-8", errors="replace")
cut = encoded[: max_bytes - len(TRUNCATION_MARKER.encode("utf-8"))]
return cut.decode("utf-8", errors="replace") + TRUNCATION_MARKER
```

---

#### I-02 — HIGH — INCR/EXPIRE race on tenant rate limit — key can persist forever (check_tenant_rate_limit, lines 100–102)

The pattern:
```python
count = await redis_client.incr(key)
if count == 1:
    await redis_client.expire(key, window_seconds)
```

has a well-known TOCTOU gap. If the worker process is killed (OOM, deploy restart, network partition) between `incr` and `expire`, the key is left without a TTL and persists indefinitely. On the next server restart the counter will be stuck at its pre-crash value and the tenant will be permanently rate-limited until manual Redis intervention.

The same issue exists in `check_run_rate_limit` (lines 82–84), but the impact is lower there because run keys are naturally short-lived.

**Fix:** Use a Lua script or `SET key value EX ttl NX` to make it atomic. For an INCR-based pattern the simplest safe form is:
```python
pipe = redis_client.pipeline()
pipe.incr(key)
pipe.expire(key, window_seconds)  # always set, not only on count==1
count = (await pipe.execute())[0]
```
Setting `expire` unconditionally on every call is safe because it resets only if the key already exists and the TTL is not yet expired; the sliding-window semantics are identical when the window is short (60 s).

---

#### I-03 — HIGH — on_tenant_disabled scans the wrong key pattern (line 115)

`check_run_rate_limit` writes keys as `mcp:rate:run:{run_id}` (no tenant segment). The cleanup function scans for `mcp:rate:run:{tenant_id}:*`, which will never match any real key. Run-scoped rate limit counters are therefore never cleared on tenant disable.

**Fix:** Either embed `tenant_id` in the run key at write-time — `mcp:rate:run:{tenant_id}:{run_id}` — and update `check_run_rate_limit` to construct the same pattern, or document that run keys expire naturally via TTL (3600 s) and remove the pattern-scan from `on_tenant_disabled` to avoid giving a false guarantee.

The test at line 313 only asserts on the minute key and never exercises the pattern scan, so this bug is invisible in the test suite.

---

#### I-04 — HIGH — Integration gap: mcp_rate_limiter is never called from agency_tools.py

The `_make_run_func` closure at `agency_tools.py:826–841` that calls `call_tool(...)` has no invocation of any function from `mcp_rate_limiter`. Specifically absent:

- `wrap_mcp_response` — MCP responses enter the agent context unwrapped (prompt injection risk)
- `truncate_response` — Large responses are passed through without size bounds
- `check_run_rate_limit` / `check_tenant_rate_limit` — Redis rate limits are not enforced
- `scrub_params` — Tool kwargs are forwarded to external servers without secret scrubbing
- `PerTurnCounter` — Per-tool invocation counting is not wired

The module was created but not connected to the actual MCP call path. All seven spec requirements (14.1–14.5, M13, 14.7) that depend on this wiring are unmet at runtime.

**Fix:** In `agency_tools.py:_make_run_func`, after `call_tool` returns, apply `truncate_response`, then `wrap_mcp_response`. Before calling out, apply `scrub_params`. Instantiate a `PerTurnCounter` per execution context and thread it through `_make_run_func`. Pass redis client and run/tenant IDs from `run_context`.

---

#### I-05 — MEDIUM — Integration gap: long_term_memory.py missing MCP memory-extraction guard (14.6)

The spec requires:
```python
if agent_has_mcp_tools and not agent_config.get("memory_extraction_enabled", False):
    return
```

`extract_and_store_memories` (line 501) has no such guard. An agent with MCP tools will continue to extract and store memories from MCP-sourced content, which can exfiltrate data returned by external servers into the persistent memory store.

The test `TestMemoryExtractionGuard` validates the logic inline in test code but does not call `extract_and_store_memories` — it is a self-contained assertion on a local dict, not an integration test of the real function.

**Fix:** Add the guard at the top of `extract_and_store_memories`, taking `agent_config: dict` as an optional parameter.

---

#### I-06 — MEDIUM — scrub_params does not recurse into lists (line 145)

`scrub_params` recurses into nested dicts but passes list values through unchanged:
```python
else:
    scrubbed[key] = value  # lists fall through here
```

MCP tool parameters commonly contain arrays of strings (e.g., `{"messages": ["Bearer sk-...", "user text"]}`). Any secret inside a list element is not scrubbed.

**Fix:** Add a `list` branch that recurses into each element:
```python
elif isinstance(value, list):
    scrubbed[key] = [
        pattern.sub("[REDACTED]", item) if isinstance(item, str) else item
        for pattern in secret_patterns
        for item in value  # NOTE: this needs to be restructured to apply all patterns per item
    ]
```
Or more correctly:
```python
elif isinstance(value, list):
    result_list = []
    for item in value:
        if isinstance(item, str):
            for pattern in secret_patterns:
                item = pattern.sub("[REDACTED]", item)
        elif isinstance(item, dict):
            item = scrub_params(item, secret_patterns)
        result_list.append(item)
    scrubbed[key] = result_list
```

---

#### I-07 — MEDIUM — Missing spec items: 14.7 audit trail, 14.8 credit tracking, 14.10 health check task, 14.11 Celery worker constraint

Four of the 11 protections listed in the spec are absent from the diff entirely:

| ID | Requirement | Status |
|----|-------------|--------|
| 14.7 | `mcp_tool_call` audit event + TraceCollector integration | Not implemented |
| 14.8 | Per-call credit charging via `credit_manager.charge_mcp_call` | Not implemented |
| 14.10 | Health check Celery task pinging enabled servers every 5 minutes | Not implemented |
| 14.11 | Celery worker constraint documentation (HTTP proxy, no stdio) | Not implemented |

These are not merely test gaps — the spec lists them as required files-to-modify (`agency_trace_collector.py`, `agency_credits.py`). None of those files appear in the diff.

---

#### I-08 — LOW — PerTurnCounter increments before checking limit (line 56–58)

The counter is incremented unconditionally before the limit check. A call at count == max_calls+1 returns an error but the incremented value is persisted. On the next call at max_calls+2 it returns another error. This is correct behavior, but the error message says "max N/turn" while the first blocked call is actually at N+1 — an off-by-one in the user-facing message that could be confusing during debugging.

The test at line 222–227 uses `max_calls=2` and calls three times, correctly expecting an error on the third call (count=3 > 2), so the behavior is as tested. This is a cosmetic issue only.

---

#### I-09 — LOW — Tenant rate limit key is not scoped by time window

The key `mcp:rate:{tenant_id}:minute` is static. If a second 60-second window starts before the key expires (e.g., Redis is slow to evict), the counter from the previous window bleeds into the new one. A fixed sliding-window key is more robust than a fixed-name key with a 60-second TTL for rate limiting.

This is a known tradeoff for simple INCR-based rate limiters; the risk is low given 60-second TTLs and Redis's eviction behavior. Flagged for awareness.

---

### Security Assessment

**CONDITIONAL PASS**

The module establishes a correct foundational design: constants are reasonable, the `PerTurnCounter` logic is sound, loop detection correctly handles both circular references and chain depth, and `McpToolError` provides the typed error surface specified. The test coverage for the module in isolation is thorough.

However two HIGH-severity findings block unconditional pass:

1. **I-04 (integration gap)**: The module is dead code — none of its protections are wired into the actual MCP call path in `agency_tools.py`. Until integrated, protections 14.1–14.5, M13, and 14.7 are not enforced at runtime despite the test suite passing.

2. **I-02 (Redis race)**: The INCR/EXPIRE split on the tenant rate limit key can produce a persistent key with no TTL, permanently blocking a tenant after a worker restart.

3. **I-03 (wrong scan pattern)**: `on_tenant_disabled` scans a key prefix that does not match any real key, giving a false guarantee that run counters are cleaned up.

**Required before merge:**
- Wire `mcp_rate_limiter` into `agency_tools.py:_make_run_func` (I-04)
- Fix byte-vs-char truncation (I-01)
- Fix INCR/EXPIRE atomicity on tenant limit key (I-02)
- Correct the `on_tenant_disabled` scan pattern or document the TTL-only cleanup approach (I-03)
- Add list recursion to `scrub_params` (I-06)
- Add the MCP guard to `long_term_memory.extract_and_store_memories` (I-05)

**Deferred (tracked separately):** 14.7 audit trail, 14.8 credit tracking, 14.10 health check task, 14.11 Celery constraint documentation (I-07).
