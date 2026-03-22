Now I have enough context to write the section. Let me produce it.

# Section 15 — Observability & Tracing

## Overview

This section implements per-run structured tracing for agency executions. During each orchestrator run, a hierarchical trace is built (root span with child spans for agent turns, tool calls, and guardrail checks). At run completion the trace is persisted to the `agency_run_traces` table (created in section-01). Secret scrubbing ensures no API keys, bearer tokens, or authorization headers leak into stored traces. The Node.js backend exposes tRPC procedures to list and retrieve traces, plus a retention cleanup job. The frontend provides a run history panel and a timeline-based trace viewer.

### Dependencies

| Section | What this section uses |
|---------|----------------------|
| section-01-database-migration | `agency_run_traces` table schema (id, tenantId, runId, agencyId, createdBy, trace JSONB, durationMs, totalTokens, totalCost, status, createdAt) |
| section-09-sse-streaming-backend | `AgencyEventEmitter` for emitting trace-related SSE events during run; event type definitions in `apps/web/shared/agencyStreamEvents.ts` |

### Blocks

| Section | What depends on this |
|---------|---------------------|
| section-19-loop-retry-node | Per-iteration trace logging calls `TraceCollector.startSpan` / `endSpan` within the loop body |

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_trace_collector.py` | `TraceCollector` class: builds hierarchical span tree, secret scrubbing, persistence |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_agency_trace_collector.py` | pytest unit tests for TraceCollector |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyTraces.test.ts` | Vitest tests for tRPC trace procedures and retention cleanup |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/RunHistoryPanel.tsx` | Run history list (table with duration, cost, status columns) |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/TraceViewerTimeline.tsx` | Timeline visualization of trace spans with click-to-detail |

## Files to Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` | Inject `TraceCollector`, call `startSpan` / `endSpan` around each node execution |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py` | Create `TraceCollector` at run start, persist trace at run end via `persist_trace()` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` | Add `listRunTraces` and `getRunTrace` tRPC procedures |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts` | Add daily retention cleanup job for expired traces |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgencyBuilder.tsx` | Add "Run History" tab/button that opens `RunHistoryPanel` |

---

## TDD: Tests to Write First

### Python Tests

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_agency_trace_collector.py`

Framework: pytest. Use `@pytest.mark.unit` marker. All tests are synchronous or `@pytest.mark.asyncio` as appropriate.

```
Test: "TraceCollector builds correct span hierarchy"
- Create a TraceCollector(run_id, agency_id, tenant_id)
- Call start_span(name="agent:Researcher", type="agent_turn")
- Call start_span(name="tool:web-search", type="tool_call", parent_span_id=<agent_span_id>)
- Call end_span(<tool_span_id>, output="results...", tokens=150, cost=0.002)
- Call end_span(<agent_span_id>, output="summary...", tokens=300, cost=0.005)
- Assert trace.spans has 2 entries
- Assert tool span has parent_span_id matching agent span's spanId
- Assert each span has startMs, endMs, durationMs fields computed correctly

Test: "TraceCollector secret scrubbing strips sk-* patterns"
- Create a TraceCollector
- Call end_span with output containing "sk-abc123secretkey" and "Bearer eyJhbGciOi..."
- Assert stored output does NOT contain "sk-abc123secretkey"
- Assert stored output contains "[REDACTED]" in place of the secret
- Assert "Bearer" token value is scrubbed

Test: "TraceCollector secret scrubbing strips Authorization headers"
- Create trace with output containing 'Authorization: Basic dXNlcjpwYXNz'
- Assert the value after "Authorization:" is replaced with "[REDACTED]"

Test: "TraceCollector truncates tool output at 1000 chars"
- Call end_span with output string of 2000 characters
- Assert the stored span output length is <= 1003 (1000 + "..." suffix)

Test: "TraceCollector persist_trace returns correct summary dict"
- Build a trace with 2 spans (agent + tool), end both
- Call get_trace_summary()
- Assert returned dict has keys: runId, agencyId, tenantId, trace (with spans list), durationMs, totalTokens, totalCost, status
- Assert totalTokens = sum of all span tokens
- Assert totalCost = sum of all span costs

Test: "TraceCollector handles concurrent spans safely"
- Use asyncio to start/end multiple spans concurrently
- Assert no data corruption, all spans present in final trace

Test: "scrub_secrets handles None and empty input"
- Assert scrub_secrets(None) returns None
- Assert scrub_secrets("") returns ""
```

### TypeScript Tests (Vitest)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyTraces.test.ts`

```
Test: "listRunTraces filters by tenantId"
- Mock DB with traces from tenant-A and tenant-B
- Call listRunTraces with tenantId=tenant-A
- Assert only tenant-A traces returned, tenant-B excluded

Test: "listRunTraces supports dateRange filter"
- Mock DB with traces at various createdAt timestamps
- Call listRunTraces with startDate and endDate
- Assert only traces within range returned

Test: "listRunTraces supports status filter"
- Mock DB with traces having status 'completed' and 'failed'
- Call listRunTraces with status='failed'
- Assert only failed traces returned

Test: "listRunTraces paginates with limit and offset"
- Mock DB with 15 traces
- Call listRunTraces with limit=10, offset=0
- Assert 10 results, then limit=10, offset=10 returns 5

Test: "getRunTrace returns full trace with spans for valid traceId"
- Mock DB with a single trace row
- Call getRunTrace with the trace id
- Assert complete trace JSONB returned with spans array

Test: "getRunTrace enforces tenant isolation"
- Mock DB with trace belonging to tenant-A
- Call getRunTrace as tenant-B user
- Assert returns null or throws FORBIDDEN error

Test: "retention cleanup deletes traces older than configured period"
- Mock DB with traces older than 30 days and newer traces
- Run retention cleanup function
- Assert old traces deleted, new traces untouched

Test: "retention cleanup respects per-tenant retention override"
- Mock systemSettings with tenant-X having retentionDays=7
- Insert traces at 10 days and 3 days old for tenant-X
- Run retention cleanup
- Assert 10-day-old trace deleted, 3-day-old trace preserved
```

---

## Implementation Guidance

### 1. Python: TraceCollector Class

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_trace_collector.py`

The `TraceCollector` is instantiated once per agency run and threaded through the orchestrator execution.

**Class structure (stubs only):**

```python
class TraceSpan:
    """Single span representing an agent turn, tool call, or guardrail check."""
    # Fields: span_id (uuid4), parent_span_id (optional), name, type, start_ms,
    # end_ms, duration_ms, input (truncated), output (truncated + scrubbed),
    # tokens, cost, tool_calls (list), guardrails (list), metadata (dict)

class TraceCollector:
    """Builds a hierarchical trace during an agency orchestrator run."""

    def __init__(self, run_id: str, agency_id: str, tenant_id: str, user_id: int | None = None):
        """Initialize with run metadata. Creates root span automatically."""

    def start_span(self, name: str, type: str, parent_span_id: str | None = None,
                   input_data: str | None = None) -> str:
        """Start a new span. Returns span_id. Type: 'agent_turn', 'tool_call', 'guardrail'."""

    def end_span(self, span_id: str, *, output: str | None = None,
                 tokens: int = 0, cost: float = 0.0,
                 tool_calls: list[dict] | None = None,
                 guardrails: list[dict] | None = None,
                 error: str | None = None) -> None:
        """End a span. Applies secret scrubbing and output truncation."""

    def get_trace_summary(self) -> dict:
        """Return the full trace dict suitable for INSERT into agency_run_traces."""

    def set_status(self, status: str) -> None:
        """Set the final run status: 'completed', 'failed', 'cancelled', 'timeout'."""
```

**Secret scrubbing function (`scrub_secrets`):**

- Pattern list to scrub (applied to both `input_data` and `output`):
  - `sk-[a-zA-Z0-9]{20,}` (OpenAI-style API keys)
  - `Bearer\s+[a-zA-Z0-9._-]+` (Bearer tokens)
  - `Authorization:\s*\S+` (Authorization header values)
  - `key-[a-zA-Z0-9]{20,}` (generic API key patterns)
  - `postgresql://[^\s]+` (connection strings)
- All matches replaced with `[REDACTED]`
- Applied in `end_span()` before storing

**Output truncation:**

- Tool outputs truncated to 1000 characters with `"..."` suffix
- Agent outputs truncated to 2000 characters (more context useful for debugging)

**Thread safety:**

- Use `asyncio.Lock` to protect the `_spans` dict for concurrent tool calls within a single agent turn

### 2. Python: Orchestrator Integration

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`

Modify the `AgencyOrchestrator` class (or the top-level `run` function) to:

1. Accept a `TraceCollector` instance (created in `agency_service.py` before calling orchestrator)
2. Before each node execution: `span_id = trace.start_span(name=f"{node_type}:{node_name}", type="agent_turn", input_data=context_text)`
3. After each node execution: `trace.end_span(span_id, output=result, tokens=usage.tokens, cost=usage.cost)`
4. For tool calls within agent nodes: nest child spans under the agent span using `parent_span_id`
5. On run failure: `trace.set_status("failed")` with error info in the span

### 3. Python: Persistence (agency_service.py)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py`

At run end (both success and failure paths):

1. Call `trace_summary = trace_collector.get_trace_summary()`
2. POST the summary to the Node.js backend via the internal gateway: `POST /api/internal/agency-traces` with the trace payload
3. Alternatively, the Node.js side can persist when it receives the `run_complete` SSE event (simpler architecture -- the `run_complete` event already passes through the SSE pipeline from section-09)

**Recommended approach:** Emit a `trace_complete` event via `AgencyEventEmitter` (from section-09) containing the full trace summary. The Node.js SSE route handler in `agencyStream.ts` persists it to `agency_run_traces` upon receiving this event. This avoids adding a new internal HTTP endpoint.

### 4. Node.js: tRPC Procedures

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Add two procedures to the existing agency router:

**`listRunTraces`:**

```
Input: { agencyId: string, startDate?: Date, endDate?: Date, status?: string, limit?: number (default 20, max 100), offset?: number (default 0) }
Auth: JWT required, must be agency owner or admin
Query: SELECT from agency_run_traces WHERE tenantId = ctx.tenantId AND agencyId = input.agencyId, filtered by optional date range and status, ORDER BY createdAt DESC, with LIMIT/OFFSET
Returns: { traces: Array<{ id, runId, status, durationMs, totalTokens, totalCost, createdAt }>, total: number }
```

**`getRunTrace`:**

```
Input: { traceId: string }
Auth: JWT required, must be agency owner or admin
Query: SELECT * from agency_run_traces WHERE id = input.traceId AND tenantId = ctx.tenantId
Returns: Full trace row including the JSONB trace field with all spans
Tenant isolation: WHERE clause always includes tenantId from session context
```

### 5. Node.js: Retention Cleanup

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/scheduler.ts`

Add a daily cron job (e.g., at 03:00 UTC) that:

1. Queries per-tenant retention settings from `systemSettings` (key: `agency_trace_retention_days`, default: 30)
2. For each tenant, deletes traces where `createdAt < NOW() - INTERVAL '{retentionDays} days'`
3. Uses a batched delete (LIMIT 1000 per iteration) to avoid long-running transactions
4. Logs the count of deleted traces per tenant

**SQL pattern:**

```sql
DELETE FROM agency_run_traces
WHERE tenant_id = $1 AND created_at < NOW() - INTERVAL '1 day' * $2
LIMIT 1000;
```

Repeat until 0 rows affected.

### 6. Frontend: RunHistoryPanel

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/RunHistoryPanel.tsx`

- Fetches `trpc.agency.listRunTraces.useQuery({ agencyId })`
- Displays a table: Run ID (truncated), Status (badge: green/red/yellow), Duration, Tokens, Cost, Date
- Click row opens `TraceViewerTimeline` in a sheet/modal
- Filter controls: date range picker, status dropdown
- Pagination: "Load More" or offset-based

### 7. Frontend: TraceViewerTimeline

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/TraceViewerTimeline.tsx`

- Fetches `trpc.agency.getRunTrace.useQuery({ traceId })`
- Renders a horizontal timeline bar chart:
  - Each span is a horizontal bar positioned at `(startMs, endMs)` relative to run start
  - Color-coded by type: agent_turn (blue), tool_call (green), guardrail (orange)
  - Nested spans indented under parent
- Click a span bar to show detail panel:
  - Name, type, duration, tokens, cost
  - Input (collapsible)
  - Output (collapsible, already scrubbed)
  - Tool calls list (if any)
  - Guardrail results (if any)
  - Error message (if any, highlighted red)
- Summary bar at top: total duration, total tokens, total cost, status badge

---

## Trace JSONB Schema

The `trace` column in `agency_run_traces` stores a JSON object with this structure:

```json
{
  "version": 1,
  "spans": [
    {
      "spanId": "uuid",
      "parentSpanId": "uuid | null",
      "name": "agent_turn:Researcher",
      "type": "agent_turn | tool_call | guardrail",
      "startMs": 0,
      "endMs": 1234,
      "durationMs": 1234,
      "input": "truncated input text...",
      "output": "truncated + scrubbed output...",
      "tokens": 450,
      "cost": 0.0067,
      "toolCalls": [
        { "toolId": "builtin-web-search", "name": "web_search", "durationMs": 800 }
      ],
      "guardrails": [
        { "name": "pii_check", "passed": true, "durationMs": 5 }
      ],
      "error": null,
      "metadata": {}
    }
  ]
}
```

The `version` field enables future schema evolution without breaking existing traces.

---

## Integration Points with Other Sections

- **section-09 (SSE Streaming):** The `TraceCollector` feeds span events to `AgencyEventEmitter` during the run. The `trace_complete` event at run end carries the full trace for persistence. The frontend can display live span progress using `tool_start` / `tool_end` events already defined in section-09.

- **section-19 (Loop/Retry Node):** Each loop iteration creates a child span under the loop node span. The loop node handler calls `trace.start_span(name=f"loop_iteration:{i}", type="agent_turn", parent_span_id=loop_span_id)` and `trace.end_span(...)` for each iteration.

- **section-01 (Database Migration):** The `agency_run_traces` table must already exist. Column types: `trace` is JSONB (no size limit enforced at DB level; size controlled by output truncation in TraceCollector), `totalCost` is `decimal(10,6)`.

---

## Naming Conventions

- Python: snake_case for all functions, classes use PascalCase. Module name: `agency_trace_collector.py`.
- TypeScript: camelCase for functions and variables. tRPC procedures: `listRunTraces`, `getRunTrace`.
- React components: PascalCase file names: `RunHistoryPanel.tsx`, `TraceViewerTimeline.tsx`.
- Database: camelCase columns as per Drizzle convention (`totalTokens`, `durationMs`).
- Trace span types: lowercase with underscore: `agent_turn`, `tool_call`, `guardrail`.