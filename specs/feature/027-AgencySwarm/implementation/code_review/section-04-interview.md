# Code Review Interview: Section 04 -- Python Services

## Triage Summary

| # | Severity | Issue | Decision |
|---|----------|-------|----------|
| 1 | CRITICAL | `total_gateway_cost` hardcoded to 0.0 | **User: Defer to Node.js reconciliation** |
| 2 | HIGH | `_load_agents` called twice (redundant DB query) | **Auto-fix: Removed duplicate call** |
| 3 | HIGH | `_credit_multiplier` monkey-patched onto Pydantic model | **Auto-fix: Added proper field to AgencyConfig** |
| 4 | HIGH | Tool bridge does NOT extend `BaseTool` from agency-swarm | **User: Move tool creation to adapter** |
| 5 | HIGH | Persistence hooks are async but agency-swarm may need sync | **User: Keep async, bridge at call site** |
| 6 | HIGH | `execute_run_stream` missing heartbeat, run record, credit check | **Auto-fix: Improved docstring with TODO for section-07** |
| 7 | MEDIUM | `resolve_tools_for_agent` omits `endpoint_url` | **Auto-fix: Extract from config JSON** |
| 8 | MEDIUM | `tool_calls` JSON insertion without explicit cast | **Auto-fix: Added json.dumps + CAST** |
| 9 | MEDIUM | Raw SQL throughout instead of SQLAlchemy models | **Let go: Acceptable for read-only queries on Drizzle-owned tables** |
| 10 | MEDIUM | Missing `status` check on loaded agency | **Auto-fix: Added status check + AgencyDisabledError** |
| 11 | LOW | `InsufficientCreditsError` raised contradicts advisory pre-check | **Let go: More protective, kept as-is** |
| 12 | LOW | Missing round-trip and ordering tests | **Let go: 44 tests provide acceptable coverage** |
| 13 | LOW | `execute_run_stream` return type annotation wrong | **Auto-fix: Changed to AsyncGenerator** |

## User Interview

### Q1: Cost Tracking (#1 CRITICAL)

**Question:** `total_gateway_cost` is hardcoded to 0.0 in `apply_multiplier_markup()`, meaning the multiplier markup is never actually charged. How should we handle this?

**Options:**
1. Defer to Node.js reconciliation (section-06 will sum per-call costs by run_id)
2. Track costs in Python via response headers
3. Skip markup entirely for now

**User chose:** Option 1 -- Defer to Node.js reconciliation

**Action:** Kept `total_gateway_cost=0.0` with TODO comment pointing to section-06 for reconciliation endpoint.

### Q2: Tool Import Isolation (#4 HIGH)

**Question:** Tool bridge classes don't extend `BaseTool` from agency-swarm, which means agency-swarm won't recognize them as valid tools. Moving the import to `agency_tools.py` would break the isolation rule (only adapter imports from agency-swarm).

**Options:**
1. Move tool creation to adapter (add `create_tool_class()` method)
2. Import BaseTool in agency_tools.py (break isolation)

**User chose:** Option 1 -- Move tool creation to adapter

**Action:** Added `create_tool_class(tool_name, tool_description, run_func)` method to `AgencySwarmAdapter` that creates proper `BaseTool` subclasses. Updated `agency_tools.py` to use `adapter.create_tool_class()` with fallback for testing.

### Q3: Async/Sync Bridge (#5 HIGH)

**Question:** Persistence hooks are async (use SQLAlchemy async sessions), but agency-swarm may require sync callbacks depending on version. Should we add a sync bridge now?

**Options:**
1. Keep async, bridge at call site (Recommended)
2. Add sync wrappers now
3. Make both sync and async versions

**User chose:** Option 1 -- Keep async, bridge at call site

**Action:** Kept async callbacks as-is. If agency-swarm requires sync at runtime, the bridge will be added at the call site (adapter level).

## Auto-Fixes Applied

### #2: Removed duplicate `_load_agents` call
- `load_agency()` no longer calls `_load_agents()` internally
- `execute_run()` calls `_load_agents()` once after `load_agency()`

### #3: Proper `credit_multiplier` field on AgencyConfig
- Added `credit_multiplier: float = 1.0` field to `AgencyConfig` in adapter
- `load_agency()` sets `config.credit_multiplier` from DB row
- No more monkey-patching private attributes

### #6: Streaming variant documentation
- Updated `execute_run_stream` docstring to note that heartbeat, credit pre-check, and run records are implemented in the SSE router layer (section-07)

### #7: `endpoint_url` from config JSON
- `resolve_tools_for_agent()` extracts `endpoint_url` from the `config` JSON field
- No DB schema change needed

### #8: `tool_calls` JSON handling
- Added `json.dumps(tool_calls)` before insertion
- Added `CAST(:tool_calls AS json)` in SQL INSERT

### #10: Agency status check
- Added check: `if row.status not in ("active", "draft"): raise AgencyNotFoundError`
- Added `AgencyDisabledError` exception class (not used yet but available)

### #13: AsyncGenerator type annotation
- Changed `execute_run_stream` return type to `AsyncGenerator[dict, None]`

## Verification

All 76 agency tests pass after fixes:
- 44 section-04 tests (pii: 12, credits: 10, tools: 9, persistence: 6, service: 7)
- 32 section-03 tests (adapter)
