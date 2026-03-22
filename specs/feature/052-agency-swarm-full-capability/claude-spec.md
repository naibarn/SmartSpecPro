# Synthesized Specification — 052 Agency Swarm Full Capability Upgrade

## Overview

SmartSpecPro has a production Agency Swarm integration (spec 027) with 8 node types, 16+ builtin tools, visual ReactFlow builder, AI Creator (7-phase pipeline), and Python graph-based orchestrator. This upgrade adds **23 features across 5 phases (~18 weeks)** to achieve feature parity with the agency-swarm framework while preserving SmartSpecPro's unique strengths.

## Decisions from Stakeholder Interview

- **Scope**: All 23 features, full plan across all 5 phases
- **SSE Architecture**: Python → Redis pub/sub → Node.js SSE proxy (consistent with existing orchestratorStream.ts pattern)
- **Custom Tools Scale**: Small (5-10 tenants, <20 tools each) — enterprise power users
- **AI Creator v2**: Must support all 14 node types from launch
- **Guardrail LLM**: Use SmartSpecPro LLM Gateway (existing model routing + credit tracking)
- **Feature Flags**: Global default + per-tenant override via systemSettings table

## Technical Auto-Decisions

- DB: Drizzle ORM pgTable, camelCase columns, all new columns nullable
- Frontend: Extend BaseAgencyNode dispatcher (single "agency" ReactFlow type)
- Tool bridge: Follow agency_tools.py HTTP bridging via adapter.create_tool_class()
- SSE: Match orchestratorStream.ts pattern (id/event/data, Redis pub/sub)
- Validation: Zod in tRPC (.superRefine() for complex rules)
- Python: Extend match statement in agency_orchestrator.py
- Tests: Vitest (tRPC), pytest (Python)
- Encryption: crypto.ts AES-256-GCM for tool headers/MCP tokens
- SSRF: Existing ssrf_guard.py patterns

## Phase 1 — Core Foundation (Weeks 1-4)

### 2.1 Custom Tool Creation UI & API
- tRPC CRUD: createCustomTool, updateCustomTool, deleteCustomTool, listCustomTools, testCustomTool
- Tool types: http_api, openapi_import, mcp_bridge (NO python_script)
- Input/output JSON Schema validation, SSRF protection, encrypted headers
- strictSchema + oneCallAtATime flags (GAP-A)
- Rate limits: create 10/min, test 20/min; max 50 tools/tenant
- Frontend: CustomToolCreator.tsx in AgencyBuilder sidebar

### 2.2 OpenAPI Import (ToolFactory)
- Parse OpenAPI 3.0/3.1 (JSON/YAML, max 500KB)
- Extract operations → preview → bulk create as custom tools
- Reject: circular $ref, depth >10, >100 operations
- SSRF validation on base URL at import AND execution time

### 2.3 Guardrails (Input + Output)
- New tables: agency_guardrails, agency_agent_guardrails
- 7 strategies: keyword_block, regex_match, llm_classify, json_schema, max_length, pii_detection, custom_endpoint
- guidance vs strict mode; validation_attempts for output retry
- llm_classify uses LLM Gateway (not hardcoded model)
- enforceOnHandoff option (GAP-G: THREAT-10)
- Cross-tenant assignment blocked (tenant isolation)

### 2.4 Agency Context (Shared State)
- AgencyRunContext: async get/set with lock, shared across all agents/tools in a run
- user_context from frontend → agencies.userContext JSONB column
- Context snapshot persisted in agency_run_traces at run end
- Tools access via self.context.get/set()

### 2.16 Agent Runtime Settings (GAP-B, GAP-C, GAP-J)
- parallelToolCalls (boolean), maxTurns (int, cap 100)
- Extend existing modelSettings JSONB: add reasoningEffort enum
- Migration: snake_case → camelCase (top_p→topP, max_tokens→maxTokens)
- Third-party model warning badge (GAP-K)

## Phase 2 — Communication & Streaming (Weeks 5-8)

### 2.5 Real-time SSE Streaming
- POST-based SSE proxy (Python → Redis → Node.js → client) or stream ticket pattern
- Events: meta, text_delta, tool_start/progress/end, agent_switch, guardrail_trigger, approval_required, run_complete, error
- Cancel: POST /cancel with immediate/after_turn modes
- Event id: field for reconnect replay
- Fallback to polling if SSE connection fails

### 2.6 Structured Output (output_type)
- Per-agent outputSchema (JSON Schema) on agency_agents
- Validate response, retry with feedback on failure
- Store structured data in agency context
- Frontend: JSON Schema editor + formatted card rendering

### 2.7 Custom Communication Flows
- New flow types: orchestrator_worker, custom (add to delegation/handoff/parallel)
- flowConfig JSONB: contextFields, requireSummary, maxRoundTrips, timeout
- maxRoundTrips server-side enforced

### 2.8 Dynamic Instructions
- Template variables: {agent_name}, {current_date}, {context.KEY}, {user.KEY}
- Resolved at agent turn start
- Resolved instructions logged for debugging

### 2.17 Agency Topology & Human Approval Runtime (GAP-D, GAP-F)
- topology column: handoff_chain | orchestrator_worker | hybrid | custom
- Topology guide tooltip in AgencyBuilder sidebar
- Human approval: request_approval → SSE event → UI approve/reject → context flag → agent resume
- Security: cryptographic approvalKey (UUID), ownership check, idempotency, timeout (30min), single-use keys

## Phase 3 — Advanced Capabilities (Weeks 9-12)

### 2.9 Few-Shot Examples
- Per-agent examples JSONB (max 10 pairs, 2000 chars/message)
- System framing wrapper; prompt injection patterns blocked
- Conversation starters (agency-level, JSONB)
- Cache toggle: Redis cache for starter responses (TTL 24h, GAP-I)

### 2.10 Shared Instructions & Tools
- agencies.sharedInstructions (text) prepended to all agents
- agency_shared_tools junction table (agencyId, toolId)
- Visual "shared" badge in builder

### 2.11 MCP Tools Server Integration
- Expose agency tools as MCP server endpoint
- Connect external MCP servers to agents (mcpServers config + encrypted tokens)
- Tool discovery from external servers

### 2.11b Knowledge Base Node Implementation Mapping (GAP-E)
- knowledge_base node → builtin-rag-knowledge tool auto-assignment
- includeSearchResults toggle for raw document injection

### 2.12 Agency Visualization Export
- HTML (interactive, vis.js/d3), PNG (html-to-image), JSON (ReactFlow state)
- Size limit: ≤5MB for ≤20 nodes

### 2.13 Observability & Tracing
- Per-run structured traces in agency_run_traces table (JSONB)
- Spans: agent turns + tool calls with timing, tokens, cost
- 30-day retention (configurable per tenant)
- Frontend: run history panel + timeline trace viewer
- Secret scrubbing: strip sk-, Bearer, Authorization from stored traces

## Phase 4 — Polish & Integration (Weeks 13-14)

### 2.14 Tool Progress Streaming
- Tool emit API: self.emit_progress() in ToolBridge
- Progress events via SSE (tool_progress)
- Add progress to slow builtin tools (web-search, browser, rag-knowledge, skill-executor)

### 2.15 Standalone Tool API Exposure
- Toggle isExposedAsApi on custom tools
- Auto-generates POST /api/v1/agency-tools/{toolId}/execute
- OpenAPI spec at /api/v1/agency-tools/openapi.json
- Auth via API key (scope: agency:tool:execute), rate limit 100 req/min
- Tenant isolation: tool.tenantId = apiKey.tenantId

## Phase 5 — New Node Types & Skill Integration (Weeks 15-18)

### 2.18 Conditional Branch Node (NEW)
- 3 evaluation modes: rule_based (7 operators), llm_classify, context_check
- Default fallback branch required
- llm_classify via LLM Gateway (fixed template, user content in human-message role)
- Frontend: amber color, GitFork icon

### 2.19 Parallel Fan-Out & Merge Node (NEW)
- N concurrent branches via asyncio.gather
- Merge strategies: wait_all, first_complete, majority, custom_prompt
- ExecutionContext.clone() for branch isolation
- maxConcurrent server-side capped ≤10
- Dynamic branches from skill_discovery output
- Credits tracked per branch

### 2.20 Loop / Retry Node (NEW)
- Exit conditions: max_iterations, rule_based, llm_evaluate, context_check
- maxIterations ≤20, total timeout ≤600s, credit cap ≤50
- Feedback injection between iterations
- Every iteration logged in trace

### 2.21 Enhanced Skill Integration (ENHANCED + NEW)
- Skill Input Mapping: field-level mapping from static/node output/context
- Skill Chaining: chainTo metadata integration
- Skill Output Routing: by category (text→next node, image→URL in context, etc.)
- Skill Discovery Node (NEW): auto-detect best skill, confidence threshold
- Multi-Skill Comparison: parallel fan-out with dynamic branches
- Skill Factory: auto-create + register skills when discovery fails
- Export as Skill: sub-graph → skill.md + schemas

### 2.22 Error Handler & Data Transform Nodes (NEW)
- Error Handler: retry (exponential backoff), fallback, skip, terminate
- Watches specific nodes via watchedNodeIds
- Fallback payload scrubbed of stack traces/internal paths
- Data Transform: jsonpath, template (Mustache), filter modes
- Output stored in context with configurable key

### 2.23 AI Agency Creator v2 — 10-Phase Pipeline
- New phases: PLAN, REVIEW_PLAN (loop ≤3), REVIEW_DESIGN (loop ≤3)
- All 14 node types known to LLM
- Skill discovery integration (available skills list in PLAN + DESIGN)
- Max 12 LLM calls, 50 credits per creation
- Frontend: 10-step stepper with review iteration display
- Fallback: use prior phase result + defaults on LLM failure

## Database Changes (Consolidated)

- **ALTER 4 tables**: 27 new columns + 1 EXTEND (modelSettings)
- **CREATE 4 tables**: agency_guardrails, agency_agent_guardrails, agency_shared_tools, agency_run_traces
- **Risk**: LOW-MEDIUM (all additive, nullable columns, no data loss)
- **Migration**: modelSettings snake_case → camelCase data migration required

## Node Type Summary (8 existing + 6 new = 14 total)

| Node Type | Status | Category |
|-----------|--------|----------|
| agent | Existing | AI Agents |
| supervisor | Existing | AI Agents |
| router | Existing | Flow Control |
| aggregator | Existing | Flow Control |
| conditional_branch | **NEW** | Flow Control |
| parallel_fan_out | **NEW** | Flow Control |
| loop_retry | **NEW** | Flow Control |
| knowledge_base | Existing | Data & Skills |
| skill_call | Enhanced | Data & Skills |
| skill_discovery | **NEW** | Data & Skills |
| data_transform | **NEW** | Data & Skills |
| error_handler | **NEW** | Resilience |
| human_approval | Existing | Human in Loop |
| browser_session | Existing | Human in Loop |

## Feature Flags

Global default + per-tenant override:
- AGENCY_CUSTOM_TOOLS_ENABLED (Phase 1)
- AGENCY_GUARDRAILS_ENABLED (Phase 1)
- AGENCY_STREAMING_ENABLED (Phase 2)
- AGENCY_MCP_BRIDGE_ENABLED (Phase 3)
- AGENCY_TOOL_API_ENABLED (Phase 4)

## Security Requirements

- SSRF validation on all user-provided URLs (custom tools, OpenAPI base URLs, MCP servers, guardrail custom endpoints)
- Encrypted storage for: tool headers, MCP tokens (dedicated *Encrypted columns via crypto.ts)
- Cross-tenant isolation on all operations (guardrails, tools, traces)
- Human approval: cryptographic keys, ownership checks, idempotency, timeout termination
- Prompt injection protection: fixed templates, user content in human-message role, content length limits
- Secret scrubbing in traces: strip API keys, Bearer tokens, connection strings
- Rate limiting on all new endpoints
