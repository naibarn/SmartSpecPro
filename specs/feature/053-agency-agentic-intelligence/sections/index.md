<!-- PROJECT_CONFIG
runtime: python-uv
test_command: cd python-backend && pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation
section-02-orchestrator-agentic
section-03-frontend-level1
section-04-feature-flags
section-05-react-executor
section-06-working-memory
section-07-cost-controls
section-08-react-integration
section-09-db-migration
section-10-autonomous-executor
section-11-execution-memory
section-12-long-term-memory
section-13-frontend-level3
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-foundation | - | 02, 05, 06, 07 | Yes (batch 1) |
| section-02-orchestrator-agentic | 01 | 03, 08 | Yes (batch 2) |
| section-03-frontend-level1 | 02 | - | Yes (batch 2) |
| section-04-feature-flags | - | 02, 08 | Yes (batch 1) |
| section-05-react-executor | 01 | 08, 10 | Yes (batch 2) |
| section-06-working-memory | 01 | 08 | Yes (batch 2) |
| section-07-cost-controls | 01 | 08 | Yes (batch 2) |
| section-08-react-integration | 02, 05, 06, 07 | 10 | No (batch 3) |
| section-09-db-migration | - | 12 | Yes (batch 1) |
| section-10-autonomous-executor | 05, 08 | 13 | Yes (batch 4) |
| section-11-execution-memory | 01 | 10 | Yes (batch 2) |
| section-12-long-term-memory | 09 | 13 | Yes (batch 4) |
| section-13-frontend-level3 | 10, 12 | - | No (batch 5) |

## Execution Order (Batches)

1. **Batch 1** (parallel): section-01-foundation, section-04-feature-flags, section-09-db-migration
2. **Batch 2** (parallel): section-02-orchestrator-agentic, section-03-frontend-level1, section-05-react-executor, section-06-working-memory, section-07-cost-controls, section-11-execution-memory
3. **Batch 3** (sequential): section-08-react-integration
4. **Batch 4** (parallel): section-10-autonomous-executor, section-12-long-term-memory
5. **Batch 5** (sequential): section-13-frontend-level3

## Section Summaries

### section-01-foundation
**Level 1 shared infrastructure.** Creates `agentic_limits.py` (hard caps), `agentic_sanitizer.py` (prompt injection prevention), `agentic_strategies.py` (planning templates). Tests for all three modules.

### section-02-orchestrator-agentic
**Level 1 orchestrator modification.** Adds `_execute_agent_node_agentic()` method with reflection loop and `_parse_completion()` with structured CompletionSignal detection. Modifies `_execute_agent_node()` to branch on `executionMode`. Adds `delegation_depth` to ExecutionContext.

### section-03-frontend-level1
**Level 1 frontend.** Adds "Intelligence" section to NodePropertyPanel with execution mode dropdown, planning strategy selector, max cycles slider, and cost warning banner. Extends saveBuilder Zod schema.

### section-04-feature-flags
**All levels feature flag registration.** Adds 4 flags to TenantFeatureFlags interface, ALLOWED_FEATURE_FLAGS, and FEATURE_FLAG_DEFAULTS. Python flag check mechanism.

### section-05-react-executor
**Level 2 core engine.** Creates `react_executor.py` with ReActExecutor class. Direct LLM calls via OpenAI SDK through Node.js gateway. Tool execution via HTTP. CompletionSignal-based exit. Message compression. Circuit breaker for tool failures.

### section-06-working-memory
**Level 2 per-run memory.** Creates `working_memory.py` with Redis-backed WorkingMemory class. Tenant-namespaced keys. Eviction strategy. Content sanitization. Summary generation for LLM context injection.

### section-07-cost-controls
**Level 2 budget + rate limiting.** Creates `agentic_cost_controls.py` with TokenBudgetTracker and ConcurrentRunLimiter. SSE budget_warning events. Per-user and per-tenant limits. 429 response on limit exceeded.

### section-08-react-integration
**Level 2 orchestrator integration.** Wires ReActExecutor into orchestrator's agentic path when `planningStrategy == "react"`. Creates AsyncOpenAI gateway client. Converts ToolConfig to function definitions. Emits SSE events per iteration.

### section-09-db-migration
**Level 3 database.** Adds `agency_agent_memories` table to Drizzle schema with VARCHAR(36) FKs, user_id column, content_hash unique index. SQLAlchemy model for Python. Migration generation.

### section-10-autonomous-executor
**Level 3 core engine.** Creates `autonomous_executor.py` with AutonomousPlanner (structured output), AutonomousExecutor (topological sort + delegation), and AutonomousReflector (quality evaluation). Plan validation. Depth-controlled delegation. Cross-agency via builtin-agency-call.

### section-11-execution-memory
**Level 3 dual storage.** Creates `execution_memory_store.py` with Redis scratch-pad + PostgreSQL durable checkpoint. Tenant-namespaced keys. Crash recovery logic.

### section-12-long-term-memory
**Level 3 cross-run memory.** Memory extraction with safety filter. Per-user scoped retrieval. Confidence decay via Celery Beat. Audit trail via log_agency_event. tRPC CRUD procedures (list/delete/reset).

### section-13-frontend-level3
**Level 3 frontend components.** AutonomousAgentNode card, AutonomousConfigPanel, ExecutionTimeline (live view), MemoryViewer (admin CRUD). Node type registration in builder.
