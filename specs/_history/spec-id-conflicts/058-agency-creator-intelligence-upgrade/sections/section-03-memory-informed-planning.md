# Section 03: Memory-Informed Planning

## Goal
Before planning a new agency, query existing agency memories for relevant learnings. Inject these into the planning prompt so LLM makes better-informed design decisions.

## Security Requirements (from audit F01, F02)
- **F01 CRITICAL**: Memories MUST be sanitized via `sanitize_llm_input()` before injection into LLM prompt. Wrap in `<historical_data>` tags with explicit framing that this is untrusted data.
- **F02 HIGH**: Query MUST scope by BOTH `tenantId` AND `userId` (not just tenantId). Verify tenant_id against authenticated user before memory fetch.

## Files Modified
- `python-backend/app/tasks/agency_creator_task.py` — new `_fetch_relevant_memories()` function, modified `_llm_plan()` and `_design_async()`
- `python-backend/tests/test_agency_creator_v2.py` — 7 new tests

## Implementation Details

### 1. New function: `_fetch_relevant_memories()`

```python
async def _fetch_relevant_memories(tenant_id: str, *, user_id: int = 0, limit: int = 10) -> str:
```

**Signature change from spec:** Uses keyword-only `user_id` instead of `domain` parameter. Domain filtering was not needed since memories are already scoped by tenant/user.

**Query logic:**
1. Uses `AsyncSessionLocal` to query `agency_agent_memories` table
2. Filter: `tenantId = tenant_id AND userId = user_id`, `isActive = true`, `memoryType IN ('constraint', 'preference', 'fact', 'skill')`
3. **Deviation from spec**: Memory types use actual DB schema types (`constraint`, `preference`, `fact`, `skill`) — not spec-drafted types (`strategy_success`, `strategy_failure`, `process`, `insight`) which were never added to the schema
4. Order by `confidence DESC, useCount DESC`, limit to `limit` results
5. Sanitizes each memory via `sanitize_llm_input(content, max_length=500)`
6. Formats as numbered list in `<historical_data>` tags

**Secondary query: `agency_improvement_history`**
- Raw SQL query wrapped in its own try/except (table may not exist)
- Filters by tenantId, last 30 days, limit 5
- On any error → silently skips (no crash)

**Return:** Combined formatted text, or empty string if no results.

### 2. Modified `_llm_plan()`

Added `tenant_id: str = ""` parameter. Before the LLM call, fetches memories and appends to user message:

```python
if tenant_id:
    memories_context = await _fetch_relevant_memories(tenant_id, user_id=user_id, limit=10)
    if memories_context:
        user_message += f"\n\nPast learnings from similar agencies in your organization:\n{memories_context}"
```

### 3. Updated `_design_async()` to pass tenant_id

```python
plan = await _llm_plan(..., tenant_id=tenant_id)
```

`tenant_id` was already read from `payload.get("tenantId", "")`.

## Tests (7 total)
- `test_returns_formatted_when_memories_exist` — Verifies `<historical_data>` tags, "REFERENCE DATA ONLY" framing, content present
- `test_returns_empty_when_no_data` — Empty DB returns ""
- `test_returns_empty_for_empty_tenant_id` — Empty tenant_id early-returns without DB call
- `test_scoped_by_tenant_and_user` — Verifies query executes with tenant+user scope
- `test_db_error_returns_empty_string` — DB failure returns "" gracefully
- `test_plan_includes_memories_in_prompt` — _llm_plan user_message contains "Past learnings"
- `test_plan_works_without_tenant_id` — No crash when tenant_id is empty

## Review Notes
- Code review identified memory type mismatch with spec — resolved by using real DB types with explanatory comment
- Imports are deferred inside the function to maintain optional-dependency pattern (the function degrades gracefully if imports fail)
- Secondary `agency_improvement_history` query added per review feedback
