# Synthesized Specification: SmartSpecPro Workflow Editor - LangGraph Rebuild + Expanded Node System

Date: 2026-02-08

---

## 1. Project Overview

Rebuild the SmartSpecPro workflow orchestrator around LangGraph as the core runtime engine, expand the node system from 21 to 74+ production-grade nodes, implement intelligent LLM call optimization (caching, policy gates, model routing), and add "Create with AI" workflow generation. The work is divided into three phases.

## 2. Current System Architecture

### Existing Components
- **Workflow Editor Frontend**: React + ReactFlow with registry-driven node rendering via `BaseNode.tsx`
- **Node Registry**: Python backend singleton with 21 node types (NodeTypeSpec with InputSpec/OutputSpec)
- **Orchestrator**: `WorkflowOrchestrator` in Python with basic LangGraph StateGraph usage
- **Execution Flow**: ReactFlow JSON → compile → LangGraph execution → SSE streaming → frontend
- **State Management**: In-memory `StateManager` + file-based `CheckpointManager`
- **LLM Integration**: Dual-mode (LCEL + legacy), credit enforcement (3-phase: reserve → finalize → rollback)
- **Database**: PostgreSQL (Drizzle ORM) with workflow tables, Redis for cache/queue
- **Frontend State**: Zustand execution store, TanStack Query for data fetching

### Key Existing Patterns to Preserve
- Registry-driven architecture (backend = source of truth)
- Port type compatibility matrix (7 data types)
- Budget enforcement lifecycle
- SSE streaming for real-time execution
- tRPC proxy pattern (Node.js → Python)
- Multi-tenant isolation

## 3. Phase 1: LangGraph Core Runtime + MVP Node Set + Reliability/Safety

### Goal
Run workflows end-to-end in production with diverse node types, risk control, and debug/replay capability.

### 3.1 LangGraph Runtime Rebuild

**Architecture Decision: Full Rebuild**

Replace the custom orchestrator with a pure LangGraph-based runtime:
- Each workflow node compiles to a LangGraph node in a dynamic StateGraph
- Common patterns (approval flow, retry chain) as reusable LangGraph subgraphs
- Use `TypedDict` for state with `Annotated` reducers for append semantics

**Core Runtime Components:**

1. **Workflow Compiler**: Transform ReactFlow JSON → LangGraph StateGraph
   - Map visual nodes to LangGraph node functions
   - Map visual edges to LangGraph edges (normal + conditional)
   - Support fork-join for parallel execution
   - Validate DAG (cycle detection, required inputs)

2. **PostgreSQL Checkpointing**: Replace file-based checkpointer
   - Use `AsyncPostgresSaver` from `langgraph-checkpoint-postgres`
   - `psycopg[binary]` v3 with `AsyncConnectionPool`
   - Pool `max_size` matching expected concurrent workflows
   - Auto-create checkpoint tables via `setup()`

3. **Streaming via `astream_events`**:
   - Replace custom SSE with LangGraph native streaming
   - Map events to existing frontend protocol (node_start, node_complete, node_error, workflow_complete)
   - Support token-level streaming for LLM nodes
   - Custom events via `dispatch_custom_event()` for progress updates

4. **Human-in-the-loop via `interrupt()`**:
   - Replace custom `ApprovalExecutor` with LangGraph's native `interrupt()`
   - Resume via `Command` with user response
   - Timeout + escalation chain support
   - Frontend notification via SSE when approval needed

### 3.2 Phase 1 Node Set (~30 nodes)

#### Triggers (4 nodes)
1. **Manual Trigger** - Start workflow manually
2. **Webhook / HTTP Trigger** - Expose endpoint for external events
3. **Schedule Trigger** - Cron-based scheduling
4. **Message Queue Trigger** - Consume from RabbitMQ/SQS/Kafka for async/scale

#### Core I/O (5 nodes)
5. **HTTP Request** - REST/GraphQL API calls with auth, headers, pagination
6. **Database Query** - Read/write SQL/NoSQL with parameterized queries
7. **Storage Action** - Upload/download files (S3/local)
8. **Email/SMS/Chat Send** - Send notifications (at least 1 channel)
9. **Webhook Response** - Return HTTP response to webhook caller

#### Data Shaping & Control (10 nodes)
10. **Set / Edit Fields** - Create/modify/select fields
11. **Map / Rename Fields** - Remap field names for schema mismatches
12. **Filter** - Pass only items matching conditions
13. **If (Conditional)** - Branch into true/false paths
14. **Switch / Router** - Multi-way branching by value
15. **Merge / Join** - Combine data from multiple branches
16. **Split / Iterator** - Break arrays into individual items
17. **Batch / Chunk Processor** - Process in batches for rate limit control
18. **JSON/XML/CSV Transformer** - Convert between data formats
19. **Schema Validator** - Validate data structure before proceeding

#### Reliability & Cost Control (6 nodes)
20. **Retry with Backoff** - Auto-retry with exponential backoff + jitter
21. **Rate Limiter / Throttle** - Limit requests per time window
22. **Timeout / Circuit Breaker** - Cut off slow calls, stop cascading failures
23. **Idempotency / De-dup Key** - Prevent duplicate processing
24. **Dead Letter Queue (DLQ)** - Store failed items for reprocessing
25. **Checkpoint / Resume** - Save state (paired with LangGraph Postgres checkpointer)

#### Security/Governance (6 nodes)
26. **Secrets / Credential Vault** - Access keys securely via abstraction layer (internal crypto default + external vault pluggable via HashiCorp Vault/AWS SM)
27. **Permission & RBAC** - Role-based access for edit/run/view
28. **Audit Log** - Record who did what, when, with what data
29. **Structured Logging** - Log with requestId, step, latency
30. **Metrics & Alerting** - Track KPIs, fire alerts on anomalies
31. **Run History & Replay** - View past runs, replay specific steps

#### HITL & Code (2 nodes)
32. **Approval / Human-in-the-loop** - Pause for human approval (binds to LangGraph `interrupt()`)
33. **Code Step** - Execute Python or JavaScript code in sandbox (dual-language support)

### 3.3 Exact-Hash Caching (Phase 1)

- Redis-based exact-hash cache for deterministic tool/LLM results
- Cache key: `sha256(normalized_input + model_id + temperature + prompt_version)`
- Normalization: trim, lowercase, remove timestamps/random IDs, sort JSON keys
- TTL by content type: tool results (5-30 min), classification (1-7 days), RAG (1 hour)
- Cache stampede protection via Redis lock per key
- Track hit/miss rates in metrics dashboard

### 3.4 Node Executor Architecture

Each node executor implements:
```
Protocol NodeExecutor:
    async execute(data: NodeExecutionData, context: ExecutionContext) -> dict
```

Where:
- `ExecutionContext`: user_id, tenant_id, workflow_id, execution_id, credits_available
- `NodeExecutionData`: node_id, node_type, config, inputs, state

Executors are organized by category in `python-backend/app/orchestrator/node_executors/`.

### 3.5 Frontend Changes (Phase 1)

- Update node registry to handle ~30 node types (expand categories)
- Add new category colors and icons for reliability, security, and code nodes
- Update DynamicNodeConfig for new InputSpec patterns
- No major architectural changes to WorkflowEditor.tsx

## 4. Phase 2: AI Layer + RAG + Model Routing + Policy Gate

### Goal
Add AI capabilities without making the system fragile or expensive.

### 4.1 RAG Pipeline Nodes (8 nodes)
34. **Document Ingest** - Load PDF/DOCX/HTML/CSV into pipeline
35. **Text Chunker** - Split documents (fixed/semantic/recursive strategies)
36. **Embedding Generator** - Generate vector embeddings (configurable model)
37. **Vector Store Write** - Write to pgvector (primary)
38. **Vector Store Query** - Semantic/hybrid search against pgvector
39. **Reranker** - Re-rank results (mxbai-rerank-v2 for self-hosted, Cohere for API)
40. **Context Builder** - Assemble retrieved chunks into optimized context
41. **RAG Chain** - End-to-end composite node (retrieve + rerank + generate)

RAG pipeline available as a reusable LangGraph subgraph.

### 4.2 LLM Optimization Nodes (4 nodes)
42. **Semantic Cache** - pgvector similarity matching for near-duplicate queries
43. **Policy Gate** - Pre-flight checks: redaction, tool allowlist, budget caps, content policy
44. **Model Router** - Two-stage routing: triage (fast) → select model + strategy
45. **Short-Circuit Evaluator** - Skip LLM when rules/confidence/cache can answer

### 4.3 Enhanced Policy Gate System

Gate positions:
1. **Pre-LLM gate**: Redact PII, check tool allowlist, enforce budget
2. **Pre-action gate**: Approval required for destructive actions
3. **Post-action gate**: Audit logging, compliance recording

Gate results: `ALLOW`, `DENY` (with reason), `REQUIRE_APPROVAL` (route to HITL)

Policy storage: Code defaults + DB overrides per tenant (admin UI in Phase 3).

**Key principle**: Policy gates are deterministic (rule-based), never LLM-decided.

### 4.4 "Create with AI" Workflow Generation

- "Create with AI" button in workflow editor
- Takes natural language description
- Uses LLM with node registry as context (schema-aware prompting)
- Generates ReactFlow JSON definition
- Loads into editor for human review and refinement
- Few-shot examples for quality
- Validation loop: generated workflow must pass compilation

### 4.5 Retrieval Cache

- Cache "retrieved document lists" from similar queries
- pgvector similarity search with TTL (1 hour for RAG results)
- Event-based invalidation when source documents change

## 5. Phase 3: Industry Outputs + Enterprise Integrations

### Goal
Complete all 74+ nodes and support real enterprise deployment.

### 5.1 Industry Output Nodes (~20 nodes)
46-74. CRM Object Output, Marketing/Ads Event, Analytics/DWH Load, Search/Index Output, Cache/KV Store, Object Storage + Signed Link, Document/Report Generation, Calendar/Task, Payment/Invoice, E-sign/Approval Workflow, IoT/Device Command, CI/CD/Deployment, Feature Flag/Config, Push Notification, Create/Update Ticket, Event Subscription Trigger, File Watch Trigger, Form/Input Trigger, Connector Action, Spreadsheet/Table Action, Enrichment/Lookup, Publish to Message Queue

### 5.2 Enterprise Features
- Tenant-level policy override admin UI
- Workflow versioning + rollback
- Environment separation (dev/stage/prod)
- Multi-tenant hardening: quotas, rate controls, isolation
- Comprehensive governance dashboard

### 5.3 Additional Nodes
- Loop Controller (controlled loop with break/continue)
- Wait / Delay (pause for duration or event)
- Concurrency Controller (limit parallel execution)
- Sort / Limit / Deduplicate
- Date & Time Utilities
- Text & Regex Utilities
- Number & Math Utilities
- Error Catch / Try-Catch Block
- On Error Trigger
- Fallback Path
- PII Redaction
- Environment & Versioning
- Script Sandbox (restricted execution environment)
- Reusable Subflow / Function
- Template / Snippet Library

## 6. Technical Architecture

### 6.1 Workflow Compilation Pipeline
```
ReactFlow JSON (frontend)
    → POST /api/v1/workflows/compile (Python)
    → Validate DAG (cycles, required inputs, type compatibility)
    → Map nodes to LangGraph node functions
    → Map edges to LangGraph edges (normal + conditional)
    → Build StateGraph with TypedDict state
    → Compile with AsyncPostgresSaver checkpointer
    → Return compiled workflow manifest
```

### 6.2 Execution Pipeline
```
POST /api/v1/workflows/execute
    → Load compiled StateGraph
    → Create execution context (user, tenant, budget)
    → Execute via graph.astream_events()
    → Stream events to SSE endpoint
    → Frontend receives: node_start, node_complete, node_error, workflow_complete
    → Checkpoint after each super-step
```

### 6.3 State Schema
```python
class WorkflowState(TypedDict):
    messages: Annotated[list, add]  # Append semantics
    node_outputs: dict[str, Any]     # Output per node
    current_node: str
    execution_context: ExecutionContext
    cache_store: dict[str, Any]
    error: Optional[str]
```

### 6.4 Database Changes
- Checkpoint tables (auto-created by LangGraph)
- Policy rules table (for DB overrides)
- Cache metadata table (for cache hit/miss tracking)
- Secrets vault table (encrypted credentials)
- Audit log enhancements

### 6.5 Caching Architecture
```
Phase 1: Redis exact-hash cache
    key = sha256(normalized_input + model + temp + prompt_version)
    TTL by content type

Phase 2: + pgvector semantic cache
    Embed normalized prompt
    Cosine similarity > 0.95 threshold
    Stored with metadata (model, response, hit_count)
```

## 7. Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LangGraph approach | Full rebuild | User wants production-grade LangGraph, not a wrapper |
| Graph architecture | Hybrid (subgraphs + individual nodes) | Reusability for common patterns, flexibility for individual nodes |
| Checkpointing | PostgreSQL (AsyncPostgresSaver) | Already have PostgreSQL, production-grade |
| Vector store | pgvector | No new infra, good for < 5M vectors |
| Cache strategy | Exact-hash first (Phase 1), semantic later (Phase 2) | Quick wins first, add complexity when ready |
| Policy storage | Code defaults + DB overrides | Sensible defaults, tenant customization |
| Code sandbox | Python + JavaScript | Both common automation languages |
| Secrets management | Abstraction layer (internal + external) | Flexibility for enterprise deployment |
| AI workflow gen | Must-have (Phase 2) | Core differentiator for UX |
| Phase 1 scope | ~33 nodes + runtime + caching + security | Foundation for rapid Phase 2-3 growth |

## 8. Success Criteria

### Phase 1
- LangGraph runtime executes workflows with PostgreSQL checkpointing
- ~30 node types registered and functional
- SSE streaming works via `astream_events`
- Human-in-the-loop works via `interrupt()`
- Exact-hash caching reduces redundant API calls
- Audit trail captures all execution events
- All existing 21-node workflows continue to function (backward compatibility)

### Phase 2
- RAG pipeline composable via visual nodes
- Model routing optimizes cost vs. quality
- Policy gate prevents unauthorized/over-budget LLM usage
- Semantic cache reduces near-duplicate queries by 30%+
- "Create with AI" generates valid workflow definitions from natural language

### Phase 3
- All 74+ node types functional
- Enterprise-ready: multi-tenant isolation, governance, compliance
- Tenant-configurable policies via admin UI
- Full industry coverage (marketing, finance, DevOps, IoT, etc.)

## 9. Constraints

- Must work with existing ReactFlow-based frontend
- Python backend (FastAPI + Celery) is the execution engine
- PostgreSQL for persistence, Redis for caching/queues
- Must support multi-tenant isolation
- Credit-based billing for LLM usage must be maintained
- 80% test coverage enforced (pytest + Vitest)
- Backward compatibility with existing 21-node workflows
