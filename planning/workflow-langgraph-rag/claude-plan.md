# Implementation Plan: SmartSpecPro Workflow Engine Rebuild

## 1. Executive Summary

Rebuild the SmartSpecPro workflow orchestrator around LangGraph as the core runtime, expand from 21 to 74+ production-grade nodes across three phases, implement intelligent LLM optimization (caching, policy gates, model routing), and add AI-powered workflow generation. Phase 1 delivers a production-ready execution engine with ~33 nodes covering triggers, I/O, data transformation, reliability, security, and human-in-the-loop. Phase 2 adds RAG pipelines, AI optimization, and "Create with AI." Phase 3 completes industry-specific outputs and enterprise features.

---

## 2. Context and Motivation

### Current State
The system has a custom `WorkflowOrchestrator` with basic LangGraph usage (StateGraph, sequential edges). It supports 21 nodes, file-based checkpointing, in-memory state management, and dual-mode LLM execution (LCEL + legacy). The frontend uses ReactFlow with a registry-driven architecture where the Python backend defines all node types.

### Why Rebuild
- The current orchestrator wraps LangGraph lightly but doesn't leverage its core strengths (PostgreSQL checkpointing, native `interrupt()`, `astream_events`, subgraph composition)
- File-based checkpointing is not production-grade (no concurrency, no distributed support)
- The node set (21 nodes) is too limited for real-world automation
- No caching layer for LLM/API calls
- No policy gate system for safety and compliance
- Expanding to 74 nodes on the existing architecture would create maintenance burden

### Key Decision: Full Rebuild vs. Enhancement
The stakeholder chose full rebuild. The existing `orchestrator.py` will be replaced (not extended). The `node_executors/` pattern (ExecutionContext + NodeExecutionData protocol) is preserved since it works well and all new executors follow this interface.

### Existing Node Migration Map

The current 21 nodes must be mapped to the new system. Status per existing node:

| Existing Node | Phase 1 Equivalent | Action |
|---|---|---|
| `llm_call` | LLM Call (preserved) | Wrap with adapter, integrate MemoryService |
| `approval_gate` | Approval / HITL (Section 9 #32) | Rewrite to use `interrupt()` |
| `conditional` | If (Section 6 #13) | Replace executor, same config schema |
| `loop` | Loop Controller (Phase 3) | **Keep as-is in Phase 1**, adapter-wrap |
| `generate_image` | Generate Image (preserved) | Wrap with adapter, no changes |
| `manual_trigger` | Manual Trigger (Section 4 #1) | Verify compatibility |
| `event_trigger` | Webhook / HTTP Trigger (Section 4 #2) | Extend existing |
| `file_upload_trigger` | Manual Trigger variant | Merge into Manual Trigger config |
| `error_trigger` | On Error Trigger (Phase 3) | **Keep as-is in Phase 1** |
| `wait` | Wait / Delay (Phase 3) | **Keep as-is in Phase 1** |
| `set_variable` | Set / Edit Fields (Section 6 #10) | Replace executor |
| `merge_data` | Merge / Join (Section 6 #15) | Replace executor |
| `code_runner` | Code Step (Section 9 #33) | Rewrite with sandbox |
| `form_input` | Manual Trigger variant | Merge into Manual Trigger config |
| `workflow_response` | Webhook Response (Section 5 #9) | Extend existing |
| `generate_video` | Generate Video (preserved) | Wrap with adapter |
| `email` | Email/SMS/Chat (Section 5 #8) | Replace executor |
| `telegram` | Email/SMS/Chat variant | Merge into notification executor |
| `webhook` | Webhook / HTTP Trigger (Section 4 #2) | Already covered |
| `api_call` | HTTP Request (Section 5 #5) | Replace executor |
| `data_transform` | JSON/XML/CSV Transformer (Section 6 #18) | Replace executor |

**Nodes kept as-is** (`loop`, `error_trigger`, `wait`, `generate_image`, `generate_video`): These are adapter-wrapped to work in the new runtime without rewriting. They will be upgraded to new implementations in Phase 3.

### Existing Subsystem Integration

| Subsystem | Current Location | Phase 1 Strategy |
|---|---|---|
| `MemoryService` | `orchestrator.py` lines 80+ | Inject via `config["configurable"]["memory_service"]`, available to LLM nodes |
| `EpisodicMemoryService` | `orchestrator.py` | Same injection pattern as MemoryService |
| `LCELChainExecutor` | `orchestrator.py` | Preserved inside `llm_executor.py`, called by adapter |
| `KiloSessionManager` / `KiloSkillManager` | `orchestrator.py` | **Deferred to Phase 2** — not part of core runtime rebuild |
| `FlowCompiler` | `flow_compiler.py` | **Replaced** by new `WorkflowCompiler` — old file deprecated |
| `StateManager` | `state_manager.py` | **Deprecated** — LangGraph state replaces it |
| `CheckpointManager` | `checkpoint_manager.py` | **Deprecated** — `AsyncPostgresSaver` replaces it |
| `EventStore` | `event_store.py` | **Replaced** — new SSE uses in-memory ring buffer for reconnection replay (see Section 2) |
| `CostEstimator` | `cost_estimator.py` | Extended with cost mappings for new node types |

---

## 3. Architecture Overview

### 3.1 Compilation Pipeline

The visual workflow in the frontend compiles into a LangGraph StateGraph:

```
ReactFlow JSON → Python Compiler → LangGraph StateGraph → AsyncPostgresSaver → Execute
```

The compiler (replaces existing `FlowCompiler`):
1. Receives ReactFlow nodes + edges from the frontend
2. Validates the graph:
   - Cycle detection (DAG enforcement)
   - Exactly one trigger node per workflow
   - No orphan nodes (every node has at least one edge, except trigger)
   - Required inputs satisfied
   - Port type compatibility (7 data types)
   - Unreachable nodes flagged as warnings
3. Maps each visual node to a LangGraph node function (wrapping the existing executor protocol)
4. Maps edges to LangGraph edges:
   - Normal edges for direct connections
   - Conditional edges for If/Switch/Router nodes
   - For Switch with N dynamic cases: compiler generates a routing function at compile time that returns the case key string mapped to the target node name
5. Identifies parallel execution groups (fork-join patterns)
6. Expands composite nodes into subgraphs (Approval → interrupt subgraph, with explicit input/output channel mapping between parent and subgraph state)
7. Compiles with `AsyncPostgresSaver` checkpointer
8. Returns execution handle (compiled graph can be cached for repeat executions)

### 3.2 Workflow State Schema

```python
class WorkflowState(TypedDict):
    node_outputs: dict[str, Any]       # Output keyed by node_id
    current_node: str                   # Currently executing node
    messages: Annotated[list, add]     # Append semantics for LLM conversation history
    errors: Annotated[list[dict], add]  # Append semantics for error accumulation
    audit_trail: Annotated[list[dict], add]  # Append semantics
    cache_hits: int
    schema_version: int                # For checkpoint migration (start at 1)
```

**Execution context via `config["configurable"]`** (immutable during execution, not checkpointed):
```python
config = {
    "configurable": {
        "thread_id": f"{tenant_id}:{execution_id}",
        "user_id": user_id,
        "tenant_id": tenant_id,
        "workflow_id": workflow_id,
        "execution_id": execution_id,
        "credits_available": credits,  # Read from DB at start, tracked in DB not state
        "memory_service": memory_service_instance,
        "episodic_memory": episodic_memory_instance,
    }
}
```

**Why credits are NOT in state**: If a node fails and the graph retries from checkpoint, the credits in state would be stale. Credit tracking uses the existing 3-phase DB lifecycle (reserve → finalize → rollback). Nodes access credits via `config["configurable"]["credits_available"]` which is re-read from DB on resume.

**State size management**: `node_outputs` can accumulate large payloads. Mitigation:
- Outputs > 1MB are stored externally (Redis/S3) and replaced with a reference URL in state
- Checkpoint compression enabled via `AsyncPostgresSaver` options

### 3.3 Hybrid Graph Architecture

**Individual nodes**: Most workflow nodes (HTTP Request, Set Fields, Filter, etc.) compile directly as LangGraph node functions.

**Subgraph patterns**: Common multi-node patterns are pre-built as reusable LangGraph subgraphs:
- **Approval subgraph**: interrupt() → wait → resume (with timeout + escalation)
- **Retry subgraph**: execute → check result → retry with backoff → DLQ on max retries
- **RAG subgraph** (Phase 2): retrieve → rerank → build context → generate

When a user adds an "Approval" node in the visual editor, the compiler inserts the approval subgraph rather than a single node.

### 3.4 Node Executor Adapter

Each node executor follows the existing protocol:

```python
class NodeExecutor(Protocol):
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict
```

The LangGraph adapter wraps this:

```python
def make_langgraph_node(executor: NodeExecutor, node_id: str):
    """Create a LangGraph node function from an executor."""
    # Returns async function(state) -> state_update
```

This adapter pattern means all 21 existing executors work with zero changes. New executors follow the same pattern.

---

## 4. Phase 1 Implementation Sections

### Section 1: LangGraph Runtime Core

**What**: Replace `WorkflowOrchestrator` with a new `LangGraphRuntime` class.

**Files to create/modify**:
- `python-backend/app/orchestrator/langgraph_runtime.py` (new - core runtime)
- `python-backend/app/orchestrator/workflow_compiler.py` (new - ReactFlow → StateGraph)
- `python-backend/app/orchestrator/node_adapter.py` (new - executor → LangGraph node wrapper)
- `python-backend/app/orchestrator/orchestrator.py` (modify - delegate to new runtime)
- `python-backend/app/core/checkpointer.py` (modify - use AsyncPostgresSaver)

**Key behaviors**:
- `LangGraphRuntime.compile(workflow_json)` builds and returns a compiled LangGraph app
- `LangGraphRuntime.execute(compiled_app, input, config)` runs with streaming
- `LangGraphRuntime.resume(thread_id, command)` resumes from interrupt
- Backward compatibility: existing `orchestrator.execute_workflow()` delegates to new runtime
- Checkpointer pool size: configurable, default 10 connections

**Decisions**:
- Use `TypedDict` (not Pydantic) for LangGraph state compatibility
- Thread ID = `{tenant_id}:{execution_id}` (namespaced for multi-tenant isolation)
- Checkpoint tables auto-created by `AsyncPostgresSaver.setup()` — these tables are NOT managed by Drizzle, documented as Python-managed
- Existing `psycopg` monkey-patch on `AsyncPostgresSaver.MIGRATIONS` (removes `CONCURRENTLY` from index creation) is preserved and documented as tech debt; fix by using `autocommit=True` for the migration connection in a future PR

**Error handling strategy**:
- Unhandled node exceptions: caught by the adapter, stored in `errors` state field, graph terminates (no "continue on fail" in Phase 1 — add as option in Phase 2)
- Checkpointer connection drops: wrapped with retry (3 attempts, 1s backoff); if all fail, execution marked as `failed` with error detail
- Invalid compiled graph: compiler raises `CompilationError` with specific validation failures, returned to frontend

**Connection pool coordination**:
- `AsyncPostgresSaver` uses its own `psycopg` pool (max_size=10, configurable)
- SQLAlchemy async pool (existing) handles all app queries
- Combined pool budget: ensure `psycopg_pool + sqlalchemy_pool_size < PostgreSQL max_connections - 10` (safety margin)
- Monitor via existing `HealthService` — add pool utilization metrics

**Checkpoint GC strategy**:
- Celery periodic task runs daily
- Retention: completed workflow checkpoints kept for 30 days, failed for 7 days
- In-progress (abandoned) checkpoints: mark as stale after 24h of no activity, delete after 7 days
- Estimated growth: ~5 checkpoints/workflow × 100 workflows/day × 30 days = ~15K rows

**Concurrent workflow limit**: Preserve existing `max_parallel_workflows` setting (default 5), enforced via asyncio.Semaphore in `LangGraphRuntime.execute()`.

### Section 2: Streaming Integration

**What**: Replace custom SSE with LangGraph `astream_events`.

**Files to modify**:
- `python-backend/app/api/workflows.py` (modify SSE endpoint)
- `apps/web/client/src/hooks/useSSEWorkflowStream.ts` (modify if event format changes)
- `apps/web/client/src/stores/executionStore.ts` (no change expected)

**Key behaviors**:
- Use `astream_events(version="v2")` for detailed event streaming
- Map LangGraph events to existing frontend protocol:
  - `on_chain_start` (with node metadata) → `node_start`
  - `on_chain_end` (with node metadata) → `node_complete`
  - `on_chain_error` → `node_error`
  - `dispatch_custom_event("workflow_complete")` → `workflow_complete`
- Support token-level streaming for LLM nodes via `on_llm_stream` events
- Maintain Last-Event-ID for reconnection

**SSE reconnection/replay**: The existing `EventStore` is replaced with an in-memory ring buffer per execution (last 100 events). On SSE reconnection with `Last-Event-ID`, the buffer replays missed events. For long-running workflows, the checkpoint state provides full recovery without event replay.

**LangGraph event mapping table**:
| LangGraph Event | Metadata Key | SSE Event | Notes |
|---|---|---|---|
| `on_chain_start` | `metadata["langgraph_node"]` | `node_start` | Filter by node name, skip internal routing nodes |
| `on_chain_end` | `metadata["langgraph_node"]` | `node_complete` | Include `node_outputs` in data |
| `on_chain_error` | `metadata["langgraph_node"]` | `node_error` | Include error message + stack trace |
| `on_chat_model_stream` | LLM chunk | `token` | Token-level streaming for LLM nodes |
| `dispatch_custom_event` | `workflow_complete` | `workflow_complete` | Emitted by runtime after final node |
| `dispatch_custom_event` | `interrupt` | `approval_required` | HITL interrupt data |

**Token streaming**: LLM node executors must use LangChain LLM wrappers (not raw API calls) for `on_chat_model_stream` events to fire. The existing `LCELChainExecutor` already uses LangChain; raw `LLMProxy` calls will be wrapped with `ChatOpenAI`/`ChatAnthropic` for streaming compatibility.

**Decisions**:
- Keep the existing SSE protocol on the frontend side to minimize frontend changes
- The Python endpoint translates LangGraph events to the existing format

### Section 3: Human-in-the-Loop (HITL)

**What**: Replace custom `HumanInterruptManager` with LangGraph native `interrupt()`.

**Files to modify**:
- `python-backend/app/orchestrator/node_executors/approval_executor.py` (rewrite)
- `python-backend/app/api/workflows.py` (add resume endpoint changes)
- `apps/web/server/routers/workflow.ts` (modify resume tRPC procedure)

**Key behaviors**:
- Approval node executor calls `interrupt({"message": ..., "options": ..., "timeout": ...})`
- Graph pauses and checkpoints state
- Frontend receives SSE event with interrupt data
- User responds via API → `graph.invoke(Command(resume=response), config)`
- Timeout handling: separate async task checks pending interrupts and auto-rejects after timeout

**Decisions**:
- Interrupt data stored in checkpoint (survives server restart)
- Timeout check runs as Celery periodic task (check every 30 seconds)

### Section 4: Trigger Nodes (4 nodes)

**What**: Implement Manual, Webhook, Schedule, and Message Queue triggers.

**Files to create/modify**:
- `python-backend/app/orchestrator/node_executors/trigger_executors/` (modify existing + add queue trigger)
- `python-backend/app/orchestrator/node_registry.py` (add new node definitions)
- `python-backend/app/api/workflows.py` (webhook endpoint handling)

**Node specifications**:

1. **Manual Trigger**: Already exists, verify compatibility with new runtime.
2. **Webhook / HTTP Trigger**: Already exists, add request body parsing, header extraction, query parameter mapping. Support POST/GET/PUT/PATCH/DELETE.
3. **Schedule Trigger**: Already exists, verify cron integration with `workflowSchedules` table.
4. **Message Queue Trigger** (new): Consume from configurable queue backend (Redis Streams initially, abstract for RabbitMQ/SQS later). Config: queue_name, consumer_group, batch_size, ack_mode.

### Section 5: Core I/O Nodes (5 nodes)

**What**: HTTP Request, Database Query, Storage Action, Email/Notification, Webhook Response.

**Files to create**:
- `python-backend/app/orchestrator/node_executors/io_executors/http_request_executor.py`
- `python-backend/app/orchestrator/node_executors/io_executors/database_query_executor.py`
- `python-backend/app/orchestrator/node_executors/io_executors/storage_executor.py`
- `python-backend/app/orchestrator/node_executors/io_executors/notification_executor.py`

**Node specifications**:

5. **HTTP Request**: Method, URL, headers, body, auth (none/basic/bearer/oauth2), timeout, follow redirects, pagination (offset/cursor/link-header). Outputs: status, headers, body (parsed JSON or raw). Uses `httpx` async client.
   **SSRF Protection** (CRITICAL): URL validation MUST block:
   - Private/internal IPs: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
   - Link-local: 169.254.0.0/16 (AWS metadata endpoint)
   - Localhost: `localhost`, `0.0.0.0`
   - Internal service ports: block access to known internal services (PostgreSQL :5432, Redis :6379)
   - Implementation: resolve DNS first, check IP against blocklist, then connect. Use `httpx` with custom `AsyncResolver`.
   - Configurable URL allowlist per tenant (for enterprise use cases needing internal APIs).

6. **Database Query**: Connection type (PostgreSQL/MySQL), query (parameterized only - no raw SQL injection), parameters, transaction mode. Uses connection pool from `ExecutionContext`. Outputs: rows, row_count, columns.
   **SQL Safety**: Operation allowlist — only `SELECT`, `INSERT`, `UPDATE` permitted by default. `DELETE`, `DROP`, `TRUNCATE`, `ALTER` require explicit tenant-level permission. Query is parsed (via `sqlparse`) before execution to enforce this.

7. **Storage Action**: Operation (upload/download/list/delete), provider (S3/local), bucket, key, content_type. Uses existing S3/R2 abstraction. Outputs: url, signed_url, metadata.

8. **Email/SMS/Chat Send**: Channel (email/slack/webhook), template, recipients, subject, body. Email via existing SMTP integration. Outputs: message_id, status.

9. **Webhook Response**: Already exists, verify HTTP status code, headers, and body configuration work with new runtime.

### Section 6: Data Shaping & Control Nodes (10 nodes)

**What**: Set Fields, Map Fields, Filter, If, Switch, Merge, Split, Batch, JSON Transform, Schema Validate.

**Files to create**:
- `python-backend/app/orchestrator/node_executors/data_executors/` (expand directory)

**Expression Language**: All data nodes share a common expression engine:
- Syntax: `{{node_id.field.nested_field}}` (mustache-style, matching existing `FlowCompiler` pattern)
- Engine: Custom evaluator using safe property access (no function calls, no globals access)
- Supported operations: field reference, dot notation for nested access, array indexing (`[0]`), optional chaining (`?.`)
- NOT supported (security): function calls, `eval`, `exec`, `import`, template literals with code
- Implementation: `python-backend/app/orchestrator/expression_engine.py` (new file)
- Condition expressions (Filter/If/Switch): extend with operators (`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `startsWith`, `endsWith`, `matches` regex, `in`, `not_in`)
- Boolean combinators: `AND`, `OR`, `NOT` for compound conditions

**Node specifications**:

10. **Set / Edit Fields**: Operation per field (set/rename/delete/copy), value expressions (static, reference to upstream node output via `{{node_id.field}}`). Outputs: modified data object.

11. **Map / Rename Fields**: Mapping table (old_name → new_name), unmapped field handling (keep/drop). Outputs: remapped object.

12. **Filter**: Condition expression (field, operator, value), AND/OR groups, per-item evaluation. Outputs: matching_items, rejected_items (two output ports).

13. **If (Conditional)**: Condition (same expression language as Filter), two output ports (true, false). Only one branch executes.

14. **Switch / Router**: Value field, case table (value → output port name), default port. Multiple output ports.

15. **Merge / Join**: Strategy (append, zip, deep_merge, key_join), join key (for key_join). Multiple input ports.

16. **Split / Iterator**: Input array field, output per item. Works with downstream Batch/Merge to reassemble.

17. **Batch / Chunk Processor**: Batch size, delay between batches (for rate limiting). Inputs array, outputs batched results.

18. **JSON/XML/CSV Transformer**: Source format, target format, options (delimiter, encoding, root element). Uses `json`, `xml.etree`, `csv` stdlib.

19. **Schema Validator**: JSON Schema or Zod-compatible schema definition, validation mode (strict/coerce), on_failure (reject/annotate). Outputs: valid_items, invalid_items.

### Section 7: Reliability Nodes (6 nodes)

**What**: Retry, Rate Limiter, Circuit Breaker, Idempotency, DLQ, Checkpoint.

**Files to create**:
- `python-backend/app/orchestrator/node_executors/reliability_executors/`

**Node specifications**:

**Architecture note**: Retry and Rate Limiter are implemented as **execution middleware** in `node_adapter.py` (not standalone graph nodes), because they modify how another node executes rather than producing their own output. Circuit Breaker, Idempotency, DLQ, and Checkpoint are standalone nodes.

20. **Retry with Backoff**: Middleware that wraps the target node's execution. Config: max_retries (1-10), base_delay (seconds), max_delay, backoff_factor (2.0), jitter (bool), retryable_error_codes. Applied in `node_adapter.py` when the node's config includes `retry` settings. NOT a subgraph (simpler, avoids subgraph state interop complexity).

21. **Rate Limiter / Throttle**: Middleware that wraps the target node's execution. Token bucket algorithm. Config: rate (requests per second), burst capacity. Uses Redis for distributed rate limiting. Awaits until token available before executing the wrapped node.

22. **Timeout / Circuit Breaker**: Config: timeout_seconds, failure_threshold (trips circuit), recovery_timeout (cooldown). State tracked in Redis (per node_type + target_url). Three states: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing).

23. **Idempotency / De-dup Key**: Config: key_expression (fields to hash), ttl (how long to remember). Stores hash in Redis. If duplicate detected, returns previous result.

24. **Dead Letter Queue (DLQ)**: Config: queue_name, max_retries_before_dlq. Stores failed items in PostgreSQL table with error details, original input, timestamp. Provides admin API for reprocessing.

25. **Checkpoint / Resume**: Explicitly saves LangGraph checkpoint. Config: label (human-readable checkpoint name). Used for long-running workflows to create named resume points.

### Section 8: Security & Governance Nodes (6 nodes)

**What**: Secrets Vault, RBAC, Audit Log, Structured Logging, Metrics, Run History.

**Files to create**:
- `python-backend/app/orchestrator/node_executors/security_executors/`
- `python-backend/app/core/secrets_vault.py` (abstraction layer)

**Node specifications**:

26. **Secrets / Credential Vault**: Abstraction layer with two backends:
    - Default: existing AES-256-GCM encryption via `LLM_ENCRYPTION_KEY`
    - Pluggable: interface for HashiCorp Vault / AWS Secrets Manager
    Config: secret_name, vault_backend. Outputs: secret_value (never logged).
    **Secret propagation protection**: Secret values are tagged with a `__secret__` wrapper. The node adapter scrubs `__secret__`-tagged values from `node_outputs` before writing to state/checkpoint. Downstream nodes that need secrets must re-fetch from the vault node directly.

27. **Permission & RBAC**: Check user role against required permission. Config: required_role (viewer/editor/admin/owner), resource_type. Outputs: allowed (bool), user_role. Uses existing tenant role system.

28. **Audit Log**: Write structured audit event to `provider_usage_log` or dedicated audit table. Config: event_type, fields_to_log, include_input (bool), include_output (bool). Auto-redacts fields marked as sensitive.

29. **Structured Logging**: Write structured log entry. Config: level (info/warn/error), message_template, fields. Outputs to JSONL audit log files (existing pattern).

30. **Metrics & Alerting**: Emit metric and optionally trigger alert. Config: metric_name, value_expression, alert_threshold, alert_channel. Stores in metrics table, alert via notification executor.

31. **Run History & Replay**: Read-only node that queries execution history. Config: workflow_id, limit, status_filter. Outputs: execution_list. Replay triggers a new execution from a checkpoint.

### Section 9: HITL & Code Nodes (2 nodes)

**What**: Approval gate (leveraging Section 3 HITL) and Code sandbox.

32. **Approval / Human-in-the-loop**: Uses the `interrupt()` pattern from Section 3. Config: message, approval_type (approve_reject/input/decision), options (for decision type), timeout_minutes, required_approvers (count), notification_channel.

33. **Code Step**: Dual-language sandbox (Python + JavaScript).
    **CRITICAL SECURITY**: Must use subprocess isolation, NOT in-process execution.
    - Python: **Subprocess with `resource` limits** (NOT `RestrictedPython` with `exec()` — known bypass risks, `signal.SIGALRM` doesn't work in async context, no memory limit). Implementation:
      - Spawn subprocess via `asyncio.create_subprocess_exec`
      - Set `resource.setrlimit` for CPU time (RLIMIT_CPU), memory (RLIMIT_AS), file size (RLIMIT_FSIZE)
      - Network disabled via `seccomp` profile or `unshare --net`
      - Blocked imports: `os`, `sys`, `subprocess`, `socket`, `ctypes`, `importlib`
      - Timeout enforced via `asyncio.wait_for` on the subprocess
    - JavaScript: **`isolated-vm`** (NOT `vm2` — deprecated, CVE-2023-29017 and CVE-2023-37903 sandbox escapes). Alternative: Deno subprocess with `--no-net --no-read --no-write --no-env` flags.
    Config: language (python/javascript), code (string), timeout_seconds (max 30), memory_limit_mb (max 256).
    Inputs: serialized as JSON, available as `inputs` variable in sandbox. Outputs: JSON-serializable return value.
    **Secrets protection**: Code sandbox does NOT have access to `config["configurable"]` or any credentials. Inputs are explicitly passed and scrubbed of secret references.

### Section 10: Exact-Hash Caching System

**What**: Redis-based caching layer for deterministic node results.

**Files to create**:
- `python-backend/app/core/workflow_cache.py` (cache service)
- `python-backend/app/orchestrator/cache_middleware.py` (node execution wrapper)

**Key behaviors**:
- Cache key: `sha256(node_type + normalized_config + normalized_input + model_id + prompt_version)`
- Normalization: trim whitespace, lowercase, remove timestamps/random IDs, sort JSON keys
- Storage: Redis with configurable TTL per node type
- Default TTLs: API responses (5-30 min), LLM classification (1-7 days), LLM generation (no cache)
- Cache stampede protection: Redis `SET NX` lock per key during cache miss
- Metrics: hit_count, miss_count, eviction_count per node_type
- Cache-enabled nodes: HTTP Request, Database Query, LLM Call (when deterministic config)
- Cache opt-out: per-node config flag `cache_enabled: false`

### Section 11: Node Registry Expansion

**What**: Register all ~33 Phase 1 nodes in the node registry.

**Files to modify**:
- `python-backend/app/orchestrator/node_registry.py` (add new node definitions)

**New categories** (in addition to existing):
- `reliability` (color: orange) - Retry, Rate Limiter, Circuit Breaker, Idempotency, DLQ, Checkpoint
- `security` (color: red) - Secrets, RBAC, Audit, Logging, Metrics, Run History
- `communication` (color: cyan) - Email/SMS/Chat, Webhook Response
- `code` (color: purple) - Code Step

**Registry changes**:
- Update `NodeTypeSpec.category` type to include new categories
- Add `InputSpec` definitions for each new node (controls, validation, connections)
- Add `OutputSpec` with proper data types
- Set executor paths
- Choose appropriate Lucide icons

### Section 12: Frontend Updates

**What**: Update the workflow editor to support the expanded node set.

**Files to modify**:
- `apps/web/client/src/pages/WorkflowEditor.tsx` (add new category sections)
- `apps/web/client/src/lib/workflow/colorMap.ts` (add new category colors)
- `apps/web/client/src/lib/workflow/useNodeRegistry.ts` (update category type)
- `apps/web/client/src/components/workflow/nodes/BaseNode.tsx` (no structural changes needed)

**Key changes**:
- Add category sections for reliability, security, communication, code in the node palette
- Add color definitions for new categories
- Update TypeScript types for new categories
- Search filter already works (from previous enhancement) - just needs to handle new nodes

### Section 13: Database Schema Changes

**What**: Add tables for DLQ, circuit breaker state, policy rules, cache metadata.

**Files to modify**:
- `apps/web/drizzle/schema.ts` (add new tables)
- Run `pnpm db:push` after changes

**New tables**:
- `workflow_executions` (id, workflow_id, tenant_id, user_id, status [pending/running/completed/failed/cancelled], input_data, output_data, started_at, completed_at, error, node_count, credits_used) — **Essential** for listing/tracking executions, currently missing (TODO at `workflows.py` line 240)
- `workflow_dead_letter_queue` (id, workflow_id, execution_id, node_id, input_data, error, retry_count, status, created_at)
- `workflow_cache_metadata` (id, cache_key, node_type, hit_count, last_hit_at, created_at, ttl_seconds)
- `workflow_audit_events` (id, workflow_id, execution_id, node_id, event_type, actor_id, data, created_at)
- `workflow_secrets` (id, tenant_id, name, encrypted_value, vault_backend, created_at, updated_at) — Encrypted credentials for the Secrets Vault node
- `workflow_policy_rules` (id, tenant_id, rule_type, condition, action [allow/deny/require_approval], priority, enabled, created_at) — Placeholder for Phase 2 Policy Gate, schema defined now to avoid migration later

**Note**: LangGraph checkpoint tables are auto-created by `AsyncPostgresSaver.setup()` in the Python backend — these tables are NOT managed by Drizzle. Documented in the schema file as a comment.

### Section 14: API Endpoint Updates

**What**: Update Python API endpoints for new runtime.

**Files to modify**:
- `python-backend/app/api/workflows.py`

**Endpoint changes**:
- `POST /compile` - Update to use new `WorkflowCompiler`
- `POST /execute` - Use `LangGraphRuntime.execute()` with streaming
- `GET /execute/{id}/stream` - Translate `astream_events` to existing SSE format
- `POST /execute/{id}/resume` - Use `LangGraphRuntime.resume()` for HITL
- `GET /node-types` - Return expanded registry (no change needed - auto-serves from registry)
- `POST /dlq/{id}/reprocess` (new) - Reprocess DLQ item
- `GET /dlq` (new) - List DLQ items

### Section 15: Testing Strategy

**What**: Comprehensive test coverage for all new components.

**Executor test contract**: Every node executor MUST pass these standard tests (implemented as a shared test base class):
```python
class ExecutorTestContract:
    """Every executor test must verify:"""
    async def test_returns_dict(self): ...
    async def test_handles_missing_required_input(self): ...
    async def test_handles_invalid_input_type(self): ...
    async def test_respects_timeout(self): ...
    async def test_output_keys_match_output_spec(self): ...
```

**Test structure**:
- Unit tests for each executor using the test contract (mock external services)
- Integration tests for the compilation pipeline (ReactFlow JSON → LangGraph)
- Integration tests for checkpoint/resume (including checkpoint restore with state migration)
- Integration tests for HITL (interrupt → resume → timeout auto-reject)
- E2E test for a complete workflow (trigger → transform → output)
- Cache tests (hit/miss/invalidation/stampede protection)
- Security tests: SSRF blocking, SQL allowlist, sandbox escape attempts, secret scrubbing

**Test files**:
- `python-backend/tests/test_langgraph_runtime.py`
- `python-backend/tests/test_workflow_compiler.py`
- `python-backend/tests/test_expression_engine.py`
- `python-backend/tests/test_node_executors/` (per-executor tests, each inheriting test contract)
- `python-backend/tests/test_cache.py`
- `python-backend/tests/test_security/` (SSRF, SQL injection, sandbox, secret propagation)
- `python-backend/tests/integration/test_workflow_e2e.py` (expand existing)

**Coverage target**: 80% minimum (enforced).

### Section 16: Backward Compatibility

**What**: Ensure existing 21-node workflows continue to function.

**Strategy**:
- All 21 existing executors wrapped by the new `node_adapter.py`
- The `orchestrator.py` public API (`execute_workflow`, `resume_from_checkpoint`) delegates to `LangGraphRuntime`
- Existing `workflowJson` format (ReactFlow nodes/edges) is preserved
- Frontend receives the same SSE event format
- Budget enforcement lifecycle (reserve → finalize → rollback) remains unchanged
- Old checkpoints (file-based) can't be resumed in new system - document as breaking change for in-progress workflows

**Deprecation schedule for replaced subsystems**:
| Component | Status in Phase 1 | Remove When |
|---|---|---|
| `FlowCompiler` (`flow_compiler.py`) | Deprecated, replaced by `WorkflowCompiler` | After Phase 1 E2E tests pass |
| `StateManager` (`state_manager.py`) | Deprecated, replaced by LangGraph state | After backward compat verified |
| `CheckpointManager` (`checkpoint_manager.py`) | Deprecated, replaced by `AsyncPostgresSaver` | After backward compat verified |
| `EventStore` (`event_store.py`) | Deprecated, replaced by ring buffer + `astream_events` | After streaming tests pass |
| `HumanInterruptManager` | Deprecated, replaced by `interrupt()` | After HITL tests pass |

**Verification**: Run `grep -r "from.*import.*StateManager\|from.*import.*CheckpointManager\|from.*import.*EventStore"` to find all remaining imports before removal.

---

## 5. Phase 2 Outline (AI Layer + RAG)

Phase 2 adds ~12 more nodes and the AI optimization layer:

1. **RAG Pipeline Subgraph**: Document Ingest, Text Chunker, Embedding Generator, Vector Store Write, Vector Store Query, Reranker, Context Builder, RAG Chain (composite)
2. **LLM Optimization Nodes**: Semantic Cache, Policy Gate, Model Router, Short-Circuit Evaluator
3. **"Create with AI"**: Natural language → workflow generation using node registry as context
4. **Retrieval Cache**: pgvector similarity cache for RAG queries
5. **Enhanced Policy Gate**: Pre-LLM redaction, budget caps, tool allowlist (code defaults + DB overrides)

---

## 6. Phase 3 Outline (Enterprise + Industry)

Phase 3 completes the remaining ~25 nodes and enterprise features:

1. **Industry Output Nodes**: CRM, Marketing/Ads, Analytics/DWH, Search/Index, Payments, E-sign, IoT, CI/CD, Feature Flags, etc.
2. **Advanced Flow Nodes**: Loop Controller, Wait/Delay, Concurrency Controller, Reusable Subflow, Template Library
3. **Enterprise Features**: Tenant policy admin UI, workflow versioning/rollback, environment separation, multi-tenant hardening

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LangGraph rebuild breaks existing workflows | High | Backward compatibility layer (Section 16), verify BEFORE adding new nodes |
| Code sandbox security (Python + JS) | **Critical** | Subprocess isolation mandatory, no in-process exec, memory/CPU/network limits |
| HTTP Request SSRF vulnerability | **Critical** | IP blocklist, DNS resolution check, tenant-level URL allowlist |
| Database Query injection/destruction | High | SQL operation allowlist, `sqlparse` validation, parameterized queries only |
| Secret value propagation to checkpoints | High | `__secret__` tagging, scrub from state before checkpoint |
| PostgreSQL connection pool exhaustion | Medium | Coordinate psycopg + SQLAlchemy pools, monitor via HealthService |
| Checkpoint state size growth | Medium | External storage for outputs > 1MB, compression, GC policy |
| Multi-tenant checkpoint collision | Medium | Thread ID namespaced as `{tenant_id}:{execution_id}` |
| State schema evolution breaks old checkpoints | Medium | `schema_version` field, migration strategy per version |
| 33 new node executors quality | Medium | Shared test contract, unit tests per executor, 80% coverage |
| Redis cache stampede under load | Low | Lock-per-key pattern, short lock TTL |
| Migration of in-progress workflows | Low | Document as breaking change, provide export/re-import path |
| `psycopg` monkey-patch fragility | Low | Pin `langgraph-checkpoint-postgres` version, fix with autocommit migration conn |

---

## 8. Dependencies

**New Python packages**:
- `langgraph-checkpoint-postgres` (PostgreSQL checkpointer)
- `psycopg[binary]` v3 (async PostgreSQL driver for checkpointer)
- `httpx` (async HTTP client for HTTP Request node)
- `sqlparse` (SQL statement parsing for operation allowlist validation)
- `isolated-vm` (JavaScript sandbox — via Node.js subprocess)
- `croniter` (cron expression parsing, if not already present)

**Existing packages leveraged**:
- `langgraph` (already installed)
- `langchain` (already installed)
- `redis` / `ioredis` (already used)
- `sqlalchemy` (already used)

**No new infrastructure**: All new components use existing PostgreSQL + Redis.

---

## 9. Implementation Order

Within Phase 1, implement in this order (respects dependencies):

1. **Section 1**: LangGraph Runtime Core (foundation everything depends on)
2. **Section 13**: Database Schema Changes (tables needed by executors and tracking)
3. **Section 14**: API Endpoint Updates (needed to test runtime — moved up from #14)
4. **Section 2**: Streaming Integration (depends on API endpoints for testing)
5. **Section 3**: HITL via interrupt() (depends on runtime + streaming)
6. **Section 16**: Backward Compatibility verification (verify existing 21 nodes work BEFORE adding new ones)
7. **Section 10**: Caching System (middleware for node execution)
8. **Section 11**: Node Registry Expansion (register existing nodes first, then new ones as executors are built)
9. **Section 4-9**: Node Executors (can be partially parallelized):
   - Section 4: Trigger Nodes (entry points)
   - Section 5: Core I/O Nodes (data sources and sinks)
   - Section 6: Data Shaping Nodes (transformation layer)
   - Section 7: Reliability Nodes (execution safety)
   - Section 8: Security Nodes (governance layer)
   - Section 9: Code Step Node (sandbox requires careful security review — last in group)
10. **Section 12**: Frontend Updates (display new nodes after registry is populated)
11. **Section 15**: Testing (throughout, but final comprehensive pass here)
