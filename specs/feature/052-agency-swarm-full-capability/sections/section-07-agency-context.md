# Section 07 -- Agency Context (Shared Run State)

**Status: IMPLEMENTED**

## Implementation Notes

- All files created/modified as planned. No deviations from spec.
- Code review applied 4 fixes: sync helper documentation (lock-bypass warning), Test 8 rewrite (ToolBridge wiring), snapshot docstring, hasattr simplification.
- 10 unit tests passing. Existing orchestrator + tools tests unaffected.
- `get_sync`/`set_sync` documented as unsafe for concurrent use (section-18 parallel fan-out must use async methods).

### Files Created
- `python-backend/app/services/agency_run_context.py`
- `python-backend/tests/unit/test_agency_run_context.py`

### Files Modified
- `python-backend/app/services/agency_orchestrator.py` — ExecutionContext gains `shared_context` + `context_snapshot`; orchestrator accepts `user_context`
- `python-backend/app/services/agency_tools.py` — `run_context` param threaded through tool resolution chain
- `python-backend/app/services/agency_service.py` — Loads `userContext` from DB, passes to orchestrator
- `python-backend/app/services/agency_swarm_adapter.py` — `user_context` field on `AgencyConfig`
- `apps/web/server/routers/agency.ts` — `userContext` Zod field in `saveBuilder`, persisted to DB

---

## Overview

This section implements `AgencyRunContext`, a shared mutable state object accessible by all agents, tools, and node handlers during a single agency run. It replaces ad-hoc state passing with a structured, thread-safe context class that supports async get/set, user-provided initial context, and snapshot persistence for observability.

**Feature**: 2.4 Agency Context (Shared State)
**Phase**: 1 -- Core Foundation
**Depends on**: section-01-database-migration (agencies.userContext column must exist)
**Blocks**: section-09 (SSE streaming reads context), section-11 (structured output stores in context), section-12 (human approval writes context flags), section-17 through section-21 (all new node types read/write context)

---

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/services/agency_run_context.py` | AgencyRunContext class |
| `python-backend/tests/unit/test_agency_run_context.py` | Unit tests for context class |

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/services/agency_orchestrator.py` | Import and instantiate AgencyRunContext; pass to node handlers; snapshot at run end |
| `python-backend/app/services/agency_tools.py` | Accept context reference in ToolBridge; expose get/set to tool instances |
| `python-backend/app/services/agency_service.py` | Pass user_context from agency config to orchestrator |
| `apps/web/server/routers/agency.ts` | Accept userContext in saveBuilder Zod schema; pass to Python at run start |

---

## Tests -- Write First

All tests go in `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_run_context.py`.

```
# Test 1: AgencyRunContext.get returns default when key missing
# Test 2: AgencyRunContext.set stores value retrievable by get
# Test 3: AgencyRunContext.get_all returns full snapshot dict
# Test 4: AgencyRunContext concurrent read/write does not corrupt data
#   - Launch 50 asyncio tasks that each set a unique key, then verify all 50 keys present
# Test 5: AgencyRunContext initialized with user_context seed data
#   - Pass {"project": "Alpha", "lang": "en"} at construction
#   - get("project") returns "Alpha"
# Test 6: AgencyRunContext.snapshot returns frozen copy (mutations after snapshot don't affect it)
# Test 7: AgencyRunContext run-scoped isolation -- two separate instances don't share state
# Test 8: ToolBridge receives context reference and can call get/set
#   - Mock a tool instance, verify self.context.get/set work through the bridge
# Test 9: Orchestrator initializes AgencyRunContext from agency userContext
#   - Provide agency_config with user_context dict
#   - Verify context is seeded before first node executes
# Test 10: Orchestrator persists context snapshot in ExecutionContext at run end
#   - After run_with_context completes, verify ctx has context_snapshot attribute
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`, `@pytest.mark.asyncio` (for async tests).

---

## Implementation Guidance

### 1. AgencyRunContext Class

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_run_context.py`

The class wraps a plain dict with an `asyncio.Lock` for safe concurrent access. It must NOT import from agency-swarm (isolation pattern).

**Class signature and methods** (do not implement bodies, stubs only):

```python
class AgencyRunContext:
    """Thread-safe shared state for a single agency run.

    All agents, tools, and node handlers in the same run share one instance.
    Access is serialized via asyncio.Lock to prevent concurrent mutation issues.
    """

    def __init__(self, initial_data: dict[str, Any] | None = None) -> None:
        """Initialize with optional seed data (e.g., from agencies.userContext)."""
        ...

    async def get(self, key: str, default: Any = None) -> Any:
        """Read a value by key. Returns default if missing."""
        ...

    async def set(self, key: str, value: Any) -> None:
        """Write a value by key. Overwrites existing."""
        ...

    async def get_all(self) -> dict[str, Any]:
        """Return a shallow copy of all key-value pairs."""
        ...

    def snapshot(self) -> dict[str, Any]:
        """Return a deep copy for persistence (synchronous, used at run end)."""
        ...
```

Key design points:
- `_lock` is an `asyncio.Lock` instance, created in `__init__`.
- `_data` is a plain `dict[str, Any]`.
- `get` and `set` acquire the lock. `get_all` also acquires the lock.
- `snapshot` uses `copy.deepcopy` and does NOT acquire the async lock (it is called synchronously at run end when no concurrent access is possible).
- Values stored in context must be JSON-serializable (enforced by callers, not by the class itself -- this keeps the class simple).

### 2. Integrate into AgencyOrchestrator

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`

Modifications to `ExecutionContext`:

- Add field `shared_context: AgencyRunContext` initialized in `__init__`.
- The orchestrator's `run_with_context` method creates the `AgencyRunContext` instance, seeded with `user_context` from `agency_config` if present.
- After the run completes (before returning), call `shared_context.snapshot()` and store the result as `ctx.context_snapshot`.

Modifications to `AgencyOrchestrator.__init__`:
- Accept an optional `user_context: dict[str, Any] | None` parameter from the caller.

Modifications to `AgencyOrchestrator.run_with_context`:
- Create `AgencyRunContext(initial_data=self.user_context)`.
- Assign to `ctx.shared_context`.
- At the end (after `_execute_node` returns), set `ctx.context_snapshot = ctx.shared_context.snapshot()`.

Modifications to `_execute_node`:
- For node types that need context access (all current + future), pass `ctx.shared_context` to handlers. Specifically, `_execute_agent_node` should make the context available to tools (see next section).

### 3. Integrate into ToolBridge (agency_tools.py)

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`

The existing `_make_run_func` closure creates tool execution functions. Modify the tool resolution flow so that:

- `resolve_tools_for_agent` (or equivalent function that creates tool classes) accepts an optional `run_context: AgencyRunContext | None` parameter.
- The `run_func` closure captures the `run_context` reference.
- Inside `run_func`, the tool instance gains a `context` attribute pointing to the `AgencyRunContext`.
- Tools that need context access call `await self.context.get(key)` or `await self.context.set(key, value)`.

Since agency-swarm tool `run()` methods are synchronous, the context access from tools requires bridging async to sync. Use `asyncio.get_event_loop().run_until_complete()` or store a sync wrapper. The recommended approach:

- Add synchronous helper methods to `AgencyRunContext`: `get_sync(key, default)` and `set_sync(key, value)`. These acquire the lock via `asyncio.get_event_loop().run_until_complete(self.get(...))`. This is safe because agency-swarm runs tools in the same event loop thread.
- Alternatively, since the lock is only needed for concurrent async tasks (like parallel fan-out in section-18), simple dict access is safe for synchronous single-threaded tool calls. Document this trade-off.

### 4. Pass userContext from Node.js to Python

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

In the `saveBuilder` procedure, the `agencies.userContext` JSONB column is already added by section-01 migration. Add Zod validation:

```
userContext: z.record(z.string(), z.unknown()).optional()
```

This allows arbitrary key-value pairs. The value is stored as JSONB in the agencies table.

When the agency is run (the tRPC procedure or Express route that calls the Python backend), include `user_context` in the payload sent to Python:

```typescript
// In the run agency request to Python backend:
body: {
  // ... existing fields
  user_context: agency.userContext ?? {},
}
```

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py`

In the function that creates and runs the orchestrator, extract `user_context` from the request payload and pass it to `AgencyOrchestrator`:

```python
orchestrator = AgencyOrchestrator(
    nodes=nodes,
    edges=edges,
    adapter=adapter,
    db=db,
    agency_config=agency_config,
    user_context=payload.get("user_context"),  # NEW
)
```

### 5. Context Snapshot Persistence

The context snapshot is stored in the `ExecutionContext.context_snapshot` attribute after the run completes. Section-15 (observability-tracing) will persist this to `agency_run_traces.trace` JSONB. This section only needs to ensure the snapshot is captured and available on the context object.

The snapshot should be taken synchronously after all async operations complete, so `snapshot()` does not need the async lock.

---

## Naming Conventions

- Python class: `AgencyRunContext` (in `agency_run_context.py`)
- ExecutionContext field: `shared_context` (type: `AgencyRunContext`)
- ExecutionContext field: `context_snapshot` (type: `dict[str, Any]`, populated at run end)
- Agency table column: `userContext` (JSONB, camelCase per Drizzle convention)
- Python API payload key: `user_context` (snake_case per Python convention)

---

## Cross-Section Dependencies

| Section | How it uses AgencyRunContext |
|---------|----------------------------|
| section-09 (SSE streaming) | Emitter reads context for event metadata |
| section-11 (structured output) | Stores `{agentName}_output` in context after validation |
| section-12 (human approval) | Writes `approval:{uuid}` keys; reads approval status |
| section-17 (conditional branch) | `context_check` mode reads context keys |
| section-18 (parallel fan-out) | All branches share the SAME AgencyRunContext instance (thread-safe) |
| section-19 (loop/retry) | Reads/writes iteration state in context |
| section-20 (skill integration) | Skill input mapping resolves `{context.KEY}` references |
| section-08 (dynamic instructions) | Template `{context.KEY}` resolved via `AgencyRunContext.get()` |

---

## Security Considerations

- **No cross-run leakage**: Each run creates a fresh `AgencyRunContext` instance. Context is never shared between runs.
- **No secret storage**: Do not store API keys, tokens, or passwords in context. The context snapshot is persisted to traces (JSONB) which may be visible to admins.
- **Size limits**: Context values should be bounded by callers. The class itself does not enforce size limits, but section-15 (tracing) truncates the snapshot if it exceeds a threshold.
- **JSON-serializable values only**: The `snapshot()` method assumes all values are JSON-serializable. Callers must ensure this. Non-serializable values will cause trace persistence to fail gracefully (logged, not thrown).

---

## Verification Checklist

1. All 10 tests pass with `pytest -m "unit and agency" python-backend/tests/unit/test_agency_run_context.py`
2. Existing orchestrator tests still pass: `pytest python-backend/tests/unit/test_agency_orchestrator_runtime.py`
3. `AgencyRunContext` has no imports from `agency_swarm` (isolation pattern preserved)
4. `ExecutionContext` gains `shared_context` and `context_snapshot` fields without breaking existing callers (both are optional/defaulted)
5. The `saveBuilder` Zod schema accepts `userContext` as optional `Record<string, unknown>`
6. TypeScript type check passes: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`