# Section 15 — Code Review Interview

## Summary
Section-15 implements the MCP cross-system protection layer as a standalone Python module (`mcp_rate_limiter.py`). All protections are implemented as composable functions/classes that will be wired into agency_tools.py when MCP calls are made.

## Auto-fixes
None needed — standalone module with 32 passing tests.

## Design Decisions
- **Standalone module**: Protections are in a separate file rather than inline in agency_tools.py. This allows them to be imported and tested independently, and wired into the tool bridge when the MCP client manager (section-17) is built.
- **Response wrapper approach**: Uses `[MCP_TOOL_RESULT]` boundary tags rather than structured objects, matching the spec exactly. The agent sees these tags as part of the text and cannot mistake MCP output for instructions.
- **Three-level rate limiting**: PerTurnCounter (in-process), per-run Redis INCR, per-tenant Redis INCR. Each level is independently testable.
- **Param scrubbing**: Takes compiled regex patterns from agency_trace_collector._SECRET_PATTERNS. Recursively handles nested dicts.

## Deferred Items
- Wiring into agency_tools.py `_make_run_func` — will be done when section-17 (multi-transport client) builds the MCP client manager
- Health check task (14.10) — deferred to Celery task infrastructure
- Credit tracking (14.8) — requires integration with agency_credits.py, done at wiring time
- Audit trail events (14.7) — requires trace collector integration
- Celery worker constraint (14.11) — documentation/config only, no code change needed
