# Code Review: Section 04 -- Python Services

## Summary

The implementation covers the basic structure of all five service files with 44 passing tests. Several functional gaps exist around async/sync bridging, tool integration, and the streaming variant.

## Findings

| # | Severity | Issue |
|---|----------|-------|
| 1 | CRITICAL | `total_gateway_cost` hardcoded to 0.0; multiplier markup never charged |
| 2 | HIGH | `_load_agents` called twice in `execute_run` (redundant DB query) |
| 3 | HIGH | `_credit_multiplier` monkey-patched onto Pydantic model |
| 4 | HIGH | Tool bridge does NOT extend `BaseTool` from agency-swarm |
| 5 | HIGH | Persistence hooks are async but agency-swarm requires sync callbacks |
| 6 | HIGH | `execute_run_stream` missing heartbeat, run record, credit check, feature flag |
| 7 | MEDIUM | `resolve_tools_for_agent` omits `endpoint_url` (no such DB column) |
| 8 | MEDIUM | `tool_calls` JSON insertion without explicit cast may fail |
| 9 | MEDIUM | Raw SQL throughout instead of SQLAlchemy models from section-02 |
| 10 | MEDIUM | Missing `status` check on loaded agency |
| 11 | LOW | `InsufficientCreditsError` raised contradicts "advisory-only" pre-check |
| 12 | LOW | Missing round-trip and ordering tests from plan |
| 13 | LOW | `execute_run_stream` return type annotation should be AsyncGenerator |
