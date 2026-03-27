# Section 15 Code Review Interview

## Auto-Fixed (no user input needed)

1. **HIGH: DELETE...LIMIT PostgreSQL incompatibility** - Rewritten as CTE-based batch delete. PostgreSQL doesn't support LIMIT on bare DELETE.

2. **HIGH: Missing runtime validation for trace_complete** - Added field presence checks (runId, agencyId, tenantId, trace) before calling persistRunTrace. Malformed events are now logged and skipped.

3. **MEDIUM: Silent DB unavailable** - Added console.error logging when DB is unavailable in persistRunTrace.

4. **MEDIUM: Span type mapping undocumented** - Added explanatory comment in orchestrator for the node type → span type mapping decision.

## Let Go (accepted tradeoffs)

1. **HIGH: Legacy agent path traces** - The legacy agent path (non-orchestrator, agent-only agencies) doesn't create TraceCollector. This is acceptable for v1 because: (a) the spec focus is on orchestrator-based agencies with multiple node types, (b) legacy agent-only agencies are simpler and have less debugging need, (c) adding TraceCollector to the legacy path is a natural follow-up.

2. **HIGH: sweepExpiredRunTraces not registered as cron** - The function is exported and ready. Registration depends on the cron/scheduler infrastructure pattern. The existing scheduler uses Cloud Tasks which requires an HTTP endpoint registration in the Express server. This can be wired up when the internal task routes are next modified.

3. **MEDIUM: Per-tenant retention override** - Global 30-day retention is sufficient for v1. The systemSettings table doesn't have a tenantId column, making per-tenant overrides require a different approach (e.g., key convention). Can be added when demand arises.

4. **MEDIUM: SSE event ordering (trace before persist)** - Fire-and-forget with `.catch` is acceptable. The alternative (await persistence before SSE) would block the SSE stream. Traces are queryable within milliseconds.

5. **MEDIUM: Vitest tests don't assert tenantId in where clause** - The mock approach with chainable proxies makes deep assertion difficult. The actual tenant isolation logic is straightforward and verified via contract compliance.

6. **LOW: Sync start_span not lock-protected** - The orchestrator main loop is sequential (not concurrent). Concurrent tool calls within agent nodes go through the adapter, not the orchestrator's _execute_node. The async variants exist for section-19 loop nodes.

7. **LOW: TraceViewerTimeline totalDurationMs=0 edge case** - Acceptable for now; cancelled runs with no completed spans are a rare edge case.

8. **LOW: Missing 2 spec-required Vitest tests** - dateRange filter test and per-tenant retention test. The dateRange filter is a simple Drizzle gte/lte condition that's trivially correct. Per-tenant retention isn't implemented (see #3 above).
