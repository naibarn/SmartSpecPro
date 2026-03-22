# Implementation Plan — 052 Agency Swarm Full Capability Upgrade

## 1. Context & Goals

SmartSpecPro has a production Agency Swarm integration with 8 node types, 16+ builtin tools, visual ReactFlow builder, AI Creator (7-phase pipeline), and Python graph-based orchestrator. The existing architecture uses an adapter isolation pattern where `agency_swarm_adapter.py` is the only file importing the agency-swarm library (v1.8.0), making the system highly extensible.

This plan covers **23 features across 5 phases (~18 weeks)** to achieve feature parity with the agency-swarm framework. All changes are additive and backward-compatible — existing agencies continue to work unchanged.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SSE streaming path | Python → Redis pub/sub → Node.js SSE proxy | Consistent with existing orchestratorStream.ts pattern; single auth layer |
| Custom tools scale | Small (5-10 tenants, <20 tools) | Enterprise power users; no marketplace needed yet |
| AI Creator v2 | All 14 node types from launch | Full capability required; complex prompts acceptable |
| Guardrail LLM | SmartSpecPro LLM Gateway | Existing model routing + credit tracking |
| Feature flags | Global default + per-tenant override | Via systemSettings table + useTenantFeatureFlag hook |
| New node registration | Extend BaseAgencyNode dispatcher | Single "agency" ReactFlow type; add cases to switch |
| Encryption | crypto.ts AES-256-GCM | Existing pattern; dedicated *Encrypted columns |

---

## 2. Database Schema Changes

All 23 features share a single migration. Running it first unblocks all phases.

### 2.1 New Tables

**agency_guardrails** — Stores guardrail definitions (input/output validation rules).
- Fields: id (PK), tenantId (FK→tenants, ON DELETE CASCADE), agencyId (FK→agencies, ON DELETE CASCADE), name (varchar 100), type (CHECK: 'input'|'output'), mode (CHECK: 'guidance'|'strict'), strategy (CHECK: 7 values — keyword_block, regex_match, llm_classify, json_schema, max_length, pii_detection, custom_endpoint), config (JSONB), validationAttempts (int, default 1), isEnabled (boolean, default true), sortOrder (int, default 0), createdAt, updatedAt.
- Indexes: (tenantId), (agencyId), composite (agencyId, isEnabled).

**agency_agent_guardrails** — Junction: which agents use which guardrails.
- Fields: id (PK), agentId (FK→agencyAgents, ON DELETE CASCADE), guardrailId (FK→agency_guardrails, ON DELETE CASCADE).
- Constraints: UNIQUE(agentId, guardrailId).
- App-layer check: guardrail.tenantId must match agent's agency.tenantId.

**agency_shared_tools** — Junction: tools shared across all agents in an agency.
- Fields: id (PK), agencyId (FK→agencies, ON DELETE CASCADE), toolId (varchar 100, NOT FK — allows builtin strings + UUIDs).
- Constraints: UNIQUE(agencyId, toolId).

**agency_run_traces** — Structured execution traces for observability.
- Fields: id (PK), tenantId (varchar 36), runId (varchar 36), agencyId (varchar 36), createdBy (int, FK→users ON DELETE SET NULL), trace (JSONB), durationMs (int), totalTokens (int), totalCost (decimal 10,6), status (varchar 20), createdAt.
- Indexes: (tenantId), (runId), (agencyId), (createdAt) for retention cleanup.

### 2.2 ALTER Existing Tables

**agencies** — Add columns:
- sharedInstructions (text, nullable) — shared system prompt for all agents
- userContext (JSONB, nullable) — initial context key-value pairs from frontend
- conversationStarters (JSONB, nullable) — suggestion chips for chat UI
- topology (varchar 30, default 'custom') — handoff_chain | orchestrator_worker | hybrid | custom
- cacheConversationStarters (boolean, default false) — Redis cache toggle

**agencyAgents** — Add columns:
- outputSchema (JSONB, nullable) — per-agent structured output schema
- examples (JSONB, nullable) — few-shot example conversations
- mcpServers (JSONB, nullable) — MCP server URL/config (tokens separate)
- mcpServerTokensEncrypted (text, nullable) — encrypted MCP tokens
- parallelToolCalls (boolean, default true) — disable parallel tool calls
- maxTurns (int, default 25) — per-agent turn limit

**agencyAgents.modelSettings** — EXTEND existing JSONB column (not new column):
- Add key: reasoningEffort ('minimal'|'low'|'medium'|'high')
- Data migration: rename top_p→topP, max_tokens→maxTokens

**agencyTools** — Add columns:
- inputSchema (JSONB), outputSchema (JSONB) — JSON Schema for validation
- httpMethod (varchar 10) — GET/POST/PUT/DELETE
- headersEncrypted (text) — AES-256-GCM encrypted via crypto.ts
- retryPolicy (JSONB) — {maxRetries, backoffMs}
- icon (varchar 50), category (varchar 50) — UI metadata
- version (int, default 1) — auto-increment on update
- isExposedAsApi (boolean, default false) — standalone API toggle
- strictSchema (boolean, default false) — enforce 100% schema match
- oneCallAtATime (boolean, default false) — prevent concurrent execution
- isEnabled (boolean, default true), updatedAt (timestamp)

**agencyCommunicationFlows** — Add column:
- flowConfig (JSONB, nullable) — contextFields, requireSummary, maxRoundTrips, timeout

### 2.3 Migration Strategy

1. Generate Drizzle migration from schema.ts changes
2. Run data migration for modelSettings snake_case → camelCase:
```sql
UPDATE agency_agents
SET "modelSettings" = jsonb_strip_nulls(
  "modelSettings" - 'top_p' - 'max_tokens'
  || jsonb_build_object(
      'topP', "modelSettings"->'top_p',
      'maxTokens', "modelSettings"->'max_tokens')
)
WHERE "modelSettings" ? 'top_p' OR "modelSettings" ? 'max_tokens';
```
3. Risk: LOW — all new columns nullable, no data loss, no breaking changes

---

## 3. Phase 1 — Core Foundation (Weeks 1-4)

### 3.1 Custom Tool Creation (Feature 2.1)

**Goal**: Users create HTTP API tools via UI, usable by agents alongside builtin tools.

**Backend (tRPC)**:
Add 5 procedures to `apps/web/server/routers/agency.ts`:
- `createCustomTool` — Zod: name (max 100, unique per tenant), description, endpoint (SSRF-validated), httpMethod, headersEncrypted (encrypt via crypto.ts before INSERT), inputSchema (JSON Schema), riskLevel, strictSchema, oneCallAtATime. Rate limit: 10/min. Permission: agency owner or admin. Max 50 tools per tenant.
- `updateCustomTool` — Same validation + auto-increment version. Check tool not in use by active run.
- `deleteCustomTool` — Soft-delete. Check no agents reference it (query agencyAgentTools).
- `listCustomTools` — Paginated, filtered by tenant. Exclude disabled.
- `testCustomTool` — Accept sample input, validate against inputSchema, make HTTP request (SSRF-checked), return response. Rate limit: 20/min.

**SSRF Validation**: Reuse existing ssrf_guard.py pattern. Block: private IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), localhost, cloud metadata (169.254.169.254), link-local. Allow: SMARTSPEC_INTERNAL_URL. Validate at creation time AND execution time (URL may resolve differently later).

**Frontend**:
- New `CustomToolCreator.tsx` — Form wizard: name/description → endpoint/method/headers → JSON Schema editor → test → save.
- Extend `ToolPicker.tsx` — Show custom tools alongside builtin. Filter by toolType. Badge for "custom".
- JSON Schema editor: toggle between visual form builder and raw JSON textarea.

**Python Execution**:
- In `agency_tools.py`: When resolving custom tool, create ToolBridge via `adapter.create_tool_class()` with run_fn that validates input against inputSchema (Pydantic model from JSON Schema), makes HTTP request, returns response.
- Respect strictSchema flag: pass to agency-swarm ToolConfig.
- Respect oneCallAtATime: set in ToolConfig.
- Decrypt headers server-side before HTTP call (via smartspecweb_crypto.py or Python-side decryption).

### 3.2 OpenAPI Import (Feature 2.2)

**Goal**: Import existing API specs as batches of custom tools.

**Backend**:
- New service: `apps/web/server/services/openApiToolFactory.ts`
  - Parse OpenAPI 3.0/3.1 (JSON/YAML) using `@readme/openapi-parser` or similar.
  - Reject: circular $ref, nesting depth >10, >100 operations. **50-tool cap**: imported operations + existing custom tools must not exceed 50 per tenant. Reject import if it would exceed cap.
  - Extract: operationId (or path_method), summary, parameters + requestBody → inputSchema, server.url + path, securitySchemes → headers.
  - Return: ToolPreview[] for user selection.
- Two tRPC procedures:
  - `importOpenAPITools({ specContent, specFormat, baseUrl?, apiKey? })` — Parse and return previews. Rate limit: 5/min. Spec size max 500KB (Zod `.max(500_000)` on specContent).
  - `confirmOpenAPIImport({ toolIds, agencyId? })` — Bulk INSERT selected tools.

**Frontend**:
- `OpenAPIImportModal.tsx` — Paste/upload spec → preview table with checkboxes → confirm.
- Optional: base URL override, API key input (encrypted on save).

### 3.3 Guardrails (Feature 2.3)

**Goal**: Input/output validation for agent messages with 7 strategy types.

**Backend (tRPC)**:
- CRUD procedures: createGuardrail, updateGuardrail, deleteGuardrail, listGuardrails, testGuardrail.
- assignGuardrailToAgent, removeGuardrailFromAgent — with cross-tenant check (guardrail.tenantId must match agent's agency.tenantId; return 403 otherwise).

**Python Execution** (new file: `python-backend/app/services/agency_guardrails.py`):
- `execute_guardrails(guardrails, message, type, context)` → iterate in sortOrder.
- Strategy implementations:
  - keyword_block: case-insensitive search for keywords array
  - regex_match: compile pattern, check match, action block/require
  - llm_classify: call LLM Gateway with classification prompt → blockIf check. **Latency note**: This adds an LLM call per message. Recommend using fast/cheap model (e.g., gpt-4o-mini equivalent) via `config.model` field. Default to agency's default model if unspecified.
  - json_schema: validate output JSON against schema
  - max_length: character count check
  - pii_detection: regex patterns for email/phone/SSN + optional redaction
  - custom_endpoint: POST to SSRF-validated URL, check response
- Each returns `{ passed, message, action }`.
- Integration in `agency_orchestrator.py`:
  - Before agent processes: run input guardrails. If strict mode triggers → raise error. If guidance → return guidance message.
  - After agent responds: run output guardrails. If fails → retry up to validationAttempts.
  - On handoff: if enforceOnHandoff=true → run receiving agent's input guardrails on handoff message.

**Frontend**:
- Guardrails panel in AgencyBuilder sidebar (per-agent or per-agency).
- Strategy-specific form (keyword list, regex input, classification config, etc.).
- Test guardrail: enter sample text → see pass/fail result.

### 3.4 Agency Context (Feature 2.4)

**Goal**: Shared state accessible by all agents and tools during a single run.

**Python Implementation** (`AgencyRunContext` class in agency_orchestrator.py):
- Async dict with asyncio.Lock for thread safety.
- Methods: get(key, default), set(key, value), get_all().
- Created at run start with user_context from agencies.userContext column.
- Passed to: orchestrator, tool bridges (via self.context), guardrails.
- Snapshot persisted to agency_run_traces.trace at run end.

**Tool Integration**:
- In `agency_tools.py`: ToolBridge receives context reference. Tools call `await self.context.get/set()`.
- Context is run-scoped — cleared after run ends, no cross-run leakage.

**Frontend**:
- `AgencySettingsPanel.tsx` — Key-value editor for initial user_context.
- Stored in agencies.userContext JSONB column.
- Passed to Python at agency run start via existing bridge.

### 3.5 Agent Runtime Settings (Feature 2.16)

**Goal**: Per-agent model tuning, parallel tool control, and turn limits.

**Backend**:
- Extend saveBuilder Zod validation for new agencyAgents fields:
  - parallelToolCalls: z.boolean().default(true)
  - maxTurns: z.number().int().min(1).max(100).default(25)
  - modelSettings: z.object({ temperature: z.number().min(0).max(2), topP: z.number().min(0).max(1), maxTokens: z.number().optional(), reasoningEffort: z.enum(['minimal','low','medium','high']).optional() }).optional()

**Python**:
- In orchestrator, when creating agent via adapter:
  - Pass ModelSettings(parallel_tool_calls=config.parallelToolCalls, reasoning=Reasoning(effort=config.modelSettings.reasoningEffort))
  - Pass max_turns=config.maxTurns to Agent constructor.

**Frontend**:
- "Advanced Settings" collapsible section in NodePropertyPanel.
- Fields: parallelToolCalls toggle, maxTurns input, temperature slider, reasoningEffort dropdown.
- Warning badges: parallelToolCalls=false + many tools; maxTurns < 5.
- ModelPicker: "Limited tool support" badge for non-OpenAI/Anthropic models.

---

## 4. Phase 2 — Communication & Streaming (Weeks 5-8)

### 4.1 SSE Streaming (Feature 2.5)

**Goal**: Real-time event streaming replacing 2.5s polling.

**Architecture** (decided: Node.js SSE proxy):
```
Python orchestrator
  → emit events to Redis channel (agency:stream:{runId})
  → Node.js SSE route subscribes to Redis channel
  → Proxies events to client via text/event-stream
```

**Node.js SSE Route** (new file: `apps/web/server/routes/agencyStream.ts`):
- `POST /api/agency/{agencyId}/stream` — JWT auth from request body/header. Creates SSE response. Subscribes to Redis channel `agency:stream:{runId}`.
- Alternative: stream ticket pattern for browser EventSource (POST to get ticket → GET with ticket).
- Heartbeat: 15s (match orchestratorStream.ts).
- Max duration: 30 min.
- Event format: `id: {eventId}\nevent: {eventType}\ndata: {json}\n\n`
- **Reconnection**: Every event includes monotonic `id:` field. On client reconnect, `Last-Event-ID` header sent. Route replays events from Redis list (events persisted to `agency:stream:{runId}:events` list with 30-min TTL for replay).
- **Fallback**: If SSE connection drops 3 times in 60s, client falls back to polling via existing `agency.getRun` tRPC procedure.
- **Backpressure**: Node.js SSE route uses a bounded event buffer (max 1000 events per connection). If buffer overflows (client consuming slowly), oldest events are dropped but event IDs are preserved so client can request replay on reconnect.

**Event Types**:
```
meta            — { runId, agencyId }
text_delta      — { agentName, delta }
tool_start      — { agentName, toolName, toolCallId }
tool_progress   — { toolCallId, status, message }
tool_end        — { toolCallId, status, result }
agent_switch    — { from, to, reason }
guardrail_trigger — { type, guardrailName, action }
approval_required — { approvalKey, step, summary, agentName }
run_complete    — { runId, usage: { tokens, cost } }
error           — { code, message }
```

**Python Side** (files: `python-backend/app/services/agency_orchestrator.py`, new `python-backend/app/services/agency_event_emitter.py`):
- New `AgencyEventEmitter` class encapsulates Redis publishing. Injected into orchestrator.
- In `agency_orchestrator.py`: At each event point, call `emitter.emit(event_type, data)` which publishes to Redis channel AND persists to Redis list (for replay).
- Events emitted at: agent turn start/end, tool call start/end, handoff, guardrail check, approval request, completion, error.

**Frontend** (`apps/web/client/src/hooks/useAgencyStream.ts`):
- Use `@microsoft/fetch-event-source` for POST-based SSE.
- Connect when agency run starts; dispatch events to state.
- Fallback: if SSE connection fails, revert to polling (existing behavior).
- `AgencyChatStream.tsx` — Streaming UI: character-by-character text, tool status spinners, agent switch animations, cancel button.

**Cancel**:
- `POST /api/v1/agency/{agencyId}/cancel` — { runId, mode: 'immediate' | 'after_turn' }
- Python sets cancellation flag; orchestrator checks between steps.

### 4.2 Structured Output (Feature 2.6)

**Goal**: Enforce JSON Schema on agent responses.

**Backend**: Add outputSchema to agencyAgents (already in migration). Extend saveBuilder validation.

**Python**: After agent generates response, if outputSchema is set:
- Validate response against schema (jsonschema library).
- On failure: retry with feedback message (up to validationAttempts from guardrail pattern).
- On success: store parsed data in AgencyRunContext under `{agentName}_output`.

**Frontend**: JSON Schema editor in agent property panel. Render structured output as formatted card in chat view (not raw JSON).

### 4.3 Custom Communication Flows (Feature 2.7)

**Goal**: Enhanced flow types with metadata.

**Backend**: Add flowConfig to agencyCommunicationFlows. New flow types: 'orchestrator_worker', 'custom'.
- Zod validation: flowConfig with contextFields (string[]), requireSummary (boolean), maxRoundTrips (number, server-side enforced), timeout (number).

**Python**: When orchestrator processes handoff, include contextFields in agent prompt. Enforce maxRoundTrips counter between agent pairs; terminate if exceeded.

### 4.4 Dynamic Instructions (Feature 2.8)

**Goal**: Template variables resolved at runtime.

**Python**: Before agent turn, resolve template variables in TWO phases:

**Phase A — System prompt (safe built-ins only)**:
- Only `{agent_name}`, `{current_date}`, `{current_time}`, `{tool_names}` are resolved in the system prompt string.
- Use simple string replacement. Missing keys remain as literal `{key}`.

**Phase B — Context injection as separate human-message (CRIT-1 security)**:
- `{context.KEY}` and `{user.KEY}` values are NOT interpolated into the system prompt.
- Instead, a separate human-message is prepended: `"[Agent Context] project_name=Alpha, role=engineer, ..."`
- All values: strip newlines (`\n` → ` `), strip injection patterns (`IGNORE`, `[INST]`, `<|system|>`, `<|im_start|>`), cap 200 chars per value.
- This prevents user-controlled data from entering the LLM's most trusted role (system).

- Log both pre-resolved and post-resolved instructions in trace for anomaly detection.

### 4.5 Topology & Human Approval (Feature 2.17)

**Goal**: Topology guidance + runtime approval mechanism.

**Topology**: agencies.topology column (from migration). AI Creator selects based on requirement analysis. UI tooltip with trade-off table.

**Human Approval Runtime**:
1. Agent calls `request_approval` tool → writes approval_request to AgencyRunContext (key: `approval:{uuid}`, value: {step, summary, status: 'pending'}).
2. Orchestrator emits SSE event: `approval_required` with approvalKey (crypto.randomUUID()).
3. Frontend shows Approve/Reject buttons (ApprovalCard.tsx).
4. User clicks → tRPC `agency.submitApproval({ runId, approvalKey, decision, feedback? })`.
5. tRPC handler: verify ownership (run.createdBy == ctx.user.id OR admin), verify run in awaiting_approval state, set context flag.
6. Python agent polls context → resumes on approval, receives rejection feedback on reject.
7. Timeout: 30min → run terminated with status "approval_timeout".
8. approvalKey single-use: invalidated immediately after submit.

---

## 5. Phase 3 — Advanced Capabilities (Weeks 9-12)

### 5.1 Few-Shot Examples (Feature 2.9)

**Goal**: Example conversations and conversation starters.

**Backend**: Add examples JSONB to agencyAgents, conversationStarters + cacheConversationStarters to agencies. Validation: max 10 example pairs, max 2000 chars/message. Content sanitization: strip prompt injection patterns, wrap in system framing.

**Python**: Prepend examples to agent history at runtime with system framing: "The following are example interactions for reference only:".

**Cache**: When cacheConversationStarters=true, cache first-turn responses in Redis (key: `agency:{id}:starter:{hash}`, TTL 24h). Invalidate when agency instructions/tools change.

**Frontend**: "Examples" tab in agent property panel. Conversation starters shown as suggestion chips in AgencyChatStream before first message.

### 5.2 Shared Instructions & Tools (Feature 2.10)

**Backend**: agencies.sharedInstructions text column. agency_shared_tools junction table.

**Python**: Prepend sharedInstructions to every agent's system prompt. Merge shared tools with agent-specific tools.

**Frontend**: Shared instructions textarea in agency settings. Shared tools section in builder with "shared" badge.

### 5.3 MCP Tools Server (Feature 2.11)

**Goal**: Bidirectional MCP integration.

**Expose agency tools as MCP**: New endpoint `POST /api/v1/mcp/agency/{agencyId}/tools` via existing mcpPublicServer.ts pattern. List agency's tools in MCP format. Execute tool calls through existing bridge.

**Connect external MCP servers**: agencyAgents.mcpServers JSONB (URL + transport config), mcpServerTokensEncrypted (encrypted tokens). At runtime: discover tools from MCP server via `ToolFactory.from_mcp()` pattern, add to agent's tool list.

**Frontend**: "MCP Servers" tab in agent property panel. Add/remove server connections. "Discover Tools" button.

### 5.4 Visualization Export (Feature 2.12)

**Goal**: Export agency graph as HTML, PNG, or JSON.

**Frontend-only feature** (no backend changes):
- Export button in AgencyBuilder toolbar with dropdown: HTML / PNG / JSON.
- **HTML**: Serialize ReactFlow state to self-contained HTML with embedded vis.js/d3 renderer. Size limit: ≤5MB for ≤20 nodes.
- **PNG**: Use `html-to-image` library on current canvas element.
- **JSON**: Serialize ReactFlow nodes + edges state for re-import via `JSON.parse` + `setNodes/setEdges`.
- New component: `ExportMenu.tsx` in `apps/web/client/src/components/agency/`.

### 5.5 Knowledge Base Mapping (Feature 2.11b)

In orchestrator: when node_type == "knowledge_base", auto-assign `builtin-rag-knowledge` tool to connected downstream agent. When includeSearchResults=true in nodeConfig, inject raw document chunks into agent's system prompt.

### 5.5 Visualization Export (Feature 2.12)

**Frontend-only feature**:
- Export button in AgencyBuilder toolbar.
- HTML: Serialize ReactFlow state to self-contained HTML with embedded vis.js/d3 renderer.
- PNG: Use `html-to-image` library on current canvas.
- JSON: Serialize ReactFlow nodes + edges state for re-import.

### 5.6 Observability & Tracing (Feature 2.13)

**Goal**: Structured per-run traces with timing and cost breakdown.

**Python**: Build trace during orchestrator run. Each node execution creates a span: { spanId, agentName, type, startMs, endMs, input, output (truncated at 1000 chars), tokens, cost, toolCalls[], guardrails[] }. Secret scrubbing: strip `sk-*`, `Bearer *`, `Authorization:` from stored trace data. At run end: INSERT into agency_run_traces.

**Backend (tRPC)**: listRunTraces(agencyId, dateRange, status), getRunTrace(traceId). Retention cleanup: cron job deletes traces older than tenant-configured retention (default 30 days).

**Frontend**: Run history panel (list with duration, cost, status). Trace viewer: timeline visualization of spans. Click span → detail modal with input/output/tokens.

---

## 6. Phase 4 — Polish & Integration (Weeks 13-14)

### 6.1 Tool Progress Streaming (Feature 2.14)

**Python**: Add `emit_progress(message)` method to ToolBridge base class. Publishes `tool_progress` event to Redis SSE channel.

**Builtin tools**: Add progress events to slow tools:
- builtin-web-search: "Searching...", "Processing N results..."
- builtin-browser: "Navigating to...", "Taking screenshot..."
- builtin-rag-knowledge: "Querying collection...", "Found N documents..."
- builtin-skill-executor: "Executing skill...", "Generating output..."

### 6.2 Standalone Tool API (Feature 2.15)

**Goal**: Expose custom tools as REST endpoints.

**Backend**: New Express route: `POST /api/v1/agency-tools/:toolId/execute`.
- Auth: API key from `api_keys` table with scope `agency:tool:execute`.
- Validation: request body against tool's inputSchema.
- Tenant isolation: tool.tenantId == apiKey.tenantId (mandatory).
- Rate limit: 100 req/min per API key.

**OpenAPI auto-generation**: `GET /api/v1/agency-tools/openapi.json` — dynamically build spec from all exposed tools (isExposedAsApi=true) for the authenticated tenant.

---

## 7. Phase 5 — New Node Types & Skill Integration (Weeks 15-18)

### 7.1 Conditional Branch Node (Feature 2.18)

**New node type**: `conditional_branch`

**nodeConfig schema** (ConditionalBranchConfig):
- evaluationMode: 'rule_based' | 'llm_classify' | 'context_check'
- rules: Array of { id, field (JSONPath), operator (7 types), value, targetNodeId, label }
- classificationLabel, classificationDescription (≤200 chars), categories: Array of { label, targetNodeId }
- contextKey, contextConditions
- defaultTargetNodeId (required)

**Python orchestrator** — New case in match statement:
- rule_based: Evaluate JSONPath expression against previous node output, match operator
- llm_classify: Call LLM Gateway with fixed template (classificationLabel + classificationDescription in human-message role), map result to category → targetNodeId
- context_check: Read AgencyRunContext key, match conditions
- Fallback to defaultTargetNodeId if no match

**Frontend**: ConditionalBranchNodeCard.tsx (amber, GitFork icon). Property panel: mode selector → dynamic form. Canvas: multiple outgoing edges with condition labels.

### 7.2 Parallel Fan-Out & Merge (Feature 2.19)

**New node type**: `parallel_fan_out`

**nodeConfig schema** (ParallelFanOutConfig):
- branches: Array of { id, targetNodeId, taskDescription, label }
- mergeStrategy: 'wait_all' | 'first_complete' | 'majority' | 'custom_prompt'
- mergePrompt (≤1000 chars, human-message role)
- timeoutMs (default 120000), maxConcurrent (default 5, server cap ≤10)
- continueOnError (default true)
- dynamicBranchSource: { nodeId, outputField, taskTemplate } — for skill_discovery dynamic branches

**Python orchestrator**:
- ExecutionContext.clone() — deep copy results/knowledge/accumulated_context; share user_token/tenant_id/user_id/agency_id/run_id.
- asyncio.gather(*branch_tasks, return_exceptions=continueOnError)
- Merge: wait_all (combine all), first_complete (return first), majority (vote), custom_prompt (LLM summarize via Gateway).
- Credits tracked per branch (separate creditTransactions entry). If run credit budget is exceeded mid-branch, remaining branches are cancelled (cooperative cancellation via context flag).
- Dynamic branches: read previous node output array, create branch tasks on-the-fly (capped ≤10).
- **AgencyRunContext sharing (CRIT-2 security)**: All branches share the SAME AgencyRunContext instance (thread-safe via asyncio.Lock). However, **namespace isolation** is enforced:
  - Branch tools write to `branch_{branch_id}.{key}` by default — isolated from other branches.
  - Shared writes: only via explicit `shared:{key}` prefix (opt-in for intentional cross-branch communication).
  - Orchestrator-only keys (`approval:*`, `_budget_*`, `_system_*`) cannot be written by tools — `context.set()` validates and rejects these prefixes from tool code.
  - The clone() copies results/knowledge but NOT the shared context (same instance).

**Frontend**: ParallelFanOutNodeCard.tsx (cyan, Split icon). Add/remove branches, merge strategy selector. Canvas: multiple outgoing edges with branch labels.

### 7.3 Loop / Retry Node (Feature 2.20)

**New node type**: `loop_retry`

**nodeConfig schema** (LoopRetryConfig):
- loopTargetNodeId (validated: must exist in same agency)
- exitCondition: { mode, maxIterations (cap 20), rules, evaluationPrompt (≤500 chars), contextKey }
- feedbackMode: 'auto' | 'custom_prompt', feedbackPrompt (≤500 chars)
- delayBetweenIterationsMs (cap 30000), timeoutMs (cap 600000)

**Python orchestrator**:
- Loop: execute target node → evaluate exit condition → if not met, inject feedback → repeat
- Safety: maxIterations ≤20, total timeout, credit cap ≤50
- Trace: log every iteration (count, input, output, condition result)

**Frontend**: LoopRetryNodeCard.tsx (amber, RefreshCw icon). Config: target node selector, exit condition form, feedback settings.

### 7.4 Enhanced Skill Integration (Feature 2.21)

**Skill Input Mapping** (enhance existing skill_call):
- Parse skill's input.schema.json when selected in property panel.
- SkillInputMapper.tsx: per-field mapping from static value, previous node output ($.nodeId.result), context key, or full message (backward-compatible default).
- Python: resolve mappings before calling skill executor.

**Skill Chaining**: Read chainTo from skill metadata. Show "chain" badge on skill_call nodes. Auto-suggest connecting to chained skill in builder.

**Skill Output Routing**: By skill category — prompt_enhancement → text, image_generation → URL in context, video_generation → poll job, audio_generation → URL in context.

**Skill Discovery Node** (new type: `skill_discovery`):
- nodeConfig: taskSource, taskValue/contextKey, confidenceThreshold (default 0.7), maxResults (cap ≤10), skillCategories filter.
- Python: call skill detection system → return ranked skills with confidence.
- Usable by conditional_branch: route based on confidence threshold.

**Skill Factory Pattern**:
- When skill_discovery finds no match: route to "create new skill" path.
- Call intelligent-skill-creator skill → generate skill.md + schemas.
- Register via tRPC `skills.registerGenerated` → skill registry + cache invalidation.
- Generated skill usable immediately in same run via context.

**Export as Skill**:
- ExportAsSkillDialog.tsx: select sub-graph → generate skill.md from combined instructions, input.schema.json from entry node inputs, ui.schema.json auto-generated.
- Register in skill registry for reuse.

### 7.5 Error Handler & Data Transform (Feature 2.22)

**Error Handler** (new type: `error_handler`):
- nodeConfig: watchedNodeIds, onError ('retry'|'fallback'|'skip'|'terminate'), retryConfig (maxRetries cap 5, backoffMs, multiplier), fallbackNodeId, fallbackMessage.
- Python: Orchestrator builds error_handler_map at graph load time. Before executing any node, check if it has watchers. On error: route to handler.
- Retry: exponential backoff. Fallback: redirect to fallbackNodeId. Skip: return skipMessage. Terminate: abort run.
- SSE event: error_handled { nodeName, strategy, attempt }.
- Security: scrub stack traces, internal paths, DB connection strings from fallback payload before entering context.

**Data Transform** (new type: `data_transform`):
- nodeConfig: transformMode ('jsonpath'|'template'|'filter'), jsonpathExpression, template (Mustache), filterCondition, outputKey.
- Python: apply transform to previous node output. JSONPath via `jsonpath_ng`. Template via `pystache` (HTML-escaped output). Filter via condition evaluation.
- Store result in context if outputKey specified.

**Frontend**: ErrorHandlerNodeCard.tsx (red, ShieldAlert, dashed edges to watched nodes). DataTransformNodeCard.tsx (slate, Braces icon). Dynamic config forms.

### 7.6 AI Agency Creator v2 (Feature 2.23)

**Goal**: Upgrade from 7-phase to 10-phase pipeline. Generate production-ready agencies with all 14 node types.

**New Phases**:

**Phase 3 — PLAN**: New Celery task `_llm_plan(requirement, intent, answers, available_skills, model)`. LLM generates planSteps with nodeType recommendations, topology selection, skill references. System prompt includes all 14 node types with descriptions and selection criteria: agent, supervisor, router, aggregator, conditional_branch, parallel_fan_out, loop_retry, knowledge_base, skill_call, skill_discovery, data_transform, error_handler, human_approval, browser_session.

**Phase 4 — REVIEW_PLAN**: New task `_llm_review_plan(plan, model)`. LLM reviews plan against 8 criteria (completeness, dependencies, node types, error handling, quality gates, human oversight, skills, efficiency). Loop: max 3 iterations until verdict="pass". Use fixedPlan from review if needs_fix.

**Phase 5 — DESIGN (enhanced)**: Update `_llm_design` prompt to accept planSteps as input. Include all 14 node types with nodeConfig schemas. Generate correct configs for conditional_branch (rules/categories/defaultTarget), parallel_fan_out (branches/mergeStrategy), loop_retry (exitCondition/maxIterations), skill_call (input field mapping), etc.

**Phase 6 — REVIEW_DESIGN**: New task `_llm_review_design(spec, model)`. LLM reviews agency spec against 10 criteria (connectivity, entry point, conditional completeness, loop safety, parallel completeness, error coverage, skill configs, edge types, tool assignments, credit safety). Loop: max 3 iterations.

**Phase 7 — VALIDATE (enhanced)**: Add validation rules for new node types: conditional_branch targets exist + has default, loop_retry maxIterations ≤20, parallel_fan_out has ≥2 branches + merge strategy, error_handler watchedNodeIds exist, skill_call has valid skillId.

**Skill Discovery Integration**: Phase 3 PLAN receives available skills list via internal API `GET /api/internal/skills/list?tenantId=xxx`. LLM can recommend skill_call nodes with correct skillIds.

**Safety**: Max 12 LLM calls, 50 credits per creation. Fallback: on LLM failure at any phase, use prior phase result + minimal defaults. Soft timeout 540s, hard timeout 600s.

**Frontend**: Update AutoCreateAgencyModal.tsx stepper from 7 → 10 steps. Review phases show iteration count. New SSE events: plan_created, plan_review_iteration, design_review_iteration.

---

## 8. Feature Flags

Implement using existing systemSettings table + useTenantFeatureFlag hook:

| Flag | Phase | Default |
|------|-------|---------|
| AGENCY_CUSTOM_TOOLS_ENABLED | 1 | false |
| AGENCY_GUARDRAILS_ENABLED | 1 | false |
| AGENCY_STREAMING_ENABLED | 2 | false |
| AGENCY_MCP_BRIDGE_ENABLED | 3 | false |
| AGENCY_TOOL_API_ENABLED | 4 | false |

Each flag: global row in systemSettings + optional per-tenant override. Frontend checks via `useTenantFeatureFlag(flagName)`. Backend checks in tRPC middleware/guards.

---

## 9. Security Checklist (Enhanced per Security Audit)

| Area | Requirement | Implementation |
|------|-------------|----------------|
| SSRF | Block private IPs on all user URLs | ssrf_guard.py at creation AND execution; **DNS rebinding protection: pin resolved IP at check time, use IP directly for HTTP call** |
| Encryption | Tool headers, MCP tokens | crypto.ts AES-256-GCM, dedicated *Encrypted columns |
| Tenant isolation | Cross-tenant guardrail/tool/trace access | WHERE tenantId = ctx.tenantId on all queries |
| Approval security | Cryptographic keys, ownership, idempotency | crypto.randomUUID(), ownership check, state check, single-use; **HMAC-sign Redis approval messages** |
| Prompt injection | Fixed templates, content length limits | User content in human-message role, strip injection patterns |
| Secret scrubbing | No keys/tokens in traces | **Comprehensive regex battery**: sk-*, Bearer, Authorization, AKIA*, gh_*, xoxb-*, postgresql://, mysql://, redis://, SSH key headers, .env KEY=value patterns |
| Rate limiting | All new endpoints | Per-endpoint configs via existing Bottleneck + BullMQ; **agency chat POST: 10 req/min per user** |
| Input validation | All tRPC inputs | Zod schemas with .superRefine() for complex rules |

### 9.1 CRITICAL Security Requirements (from Audit)

**CRIT-1: Dynamic Instructions — Prevent System Prompt Takeover**
- `{context.*}` and `{user.*}` template variables MUST NOT be interpolated into the LLM system prompt
- Instead, resolved values go into a separate human-message: `"[Context] project_name=Alpha, role=engineer"`
- Only built-in variables (`{agent_name}`, `{current_date}`, `{current_time}`, `{tool_names}`) may appear in system prompt
- All interpolated values: strip newlines, strip injection patterns (`IGNORE`, `[INST]`, `<|system|>`), cap 200 chars per value
- **Affects**: section-11 (dynamic instructions), section-07 (context), section-08

**CRIT-2: Parallel Branch Context Isolation**
- Default: branches write to namespace `branch_{id}.{key}` in AgencyRunContext
- Shared writes: only via explicit `shared:{key}` prefix (opt-in)
- Approval keys (`approval:*`) are orchestrator-only — tools CANNOT write keys matching `approval:*` (validated in `context.set()`)
- **Affects**: section-07 (AgencyRunContext), section-18 (parallel fan-out), section-12 (approval)

**CRIT-3: testCustomTool Response Controls**
- Cap response body at 64KB (stream with abort)
- Reject responses with Content-Type text/html (only accept application/json, text/plain)
- DNS rebinding protection: resolve hostname → pin IP → use pinned IP for actual connection
- **Affects**: section-02 (custom tools backend)

**CRIT-4: Comprehensive Secret Scrubbing**
- Create shared `python-backend/app/services/secret_scrubber.py` used by: traces (section-15), SSE events (section-09), error handler fallback (section-21), context snapshots (section-07)
- Patterns: `sk-*`, `Bearer *`, `Authorization:*`, `AKIA[A-Z0-9]{16}`, `gh_[a-zA-Z0-9]+`, `xoxb-*`, `postgresql://`, `mysql://`, `redis://`, `mongodb://`, `-----BEGIN.*KEY-----`, `.env`-style `KEY=secret_value`
- Truncate trace input/output at 2000 chars, tool output at 1000 chars
- Add `scrubbed: true` metadata flag to trace spans

### 9.2 HIGH Security Requirements (from Audit)

| ID | Requirement | Affected Section |
|----|------------|-----------------|
| HIGH-1 | `llm_classify` guardrail: user content ALWAYS in human role, NEVER in system prompt; fail-safe default on unrecognized LLM response | section-05 |
| HIGH-2 | Standalone tool API: OpenAPI spec endpoint must be tenant-scoped; return 404 (not 403) for cross-tenant requests | section-16 |
| HIGH-3 | MCP tool output: inject as ToolMessage role only; sanitize `{{`/`}}` before template processing; rate-limit 20 MCP calls per run | section-14 |
| HIGH-4 | Trace `createdBy` ON DELETE SET NULL: add `deletedAt` column; soft-delete traces on user deletion; purge JSONB after 7 days | section-15 |
| HIGH-5 | Approval Redis channel: HMAC-sign messages with `AGENCY_APPROVAL_HMAC_KEY`; Python verifies HMAC before updating context | section-12 |
| HIGH-6 | `includeSearchResults=true`: cap injected RAG at 4000 chars; wrap in `<knowledge_base>` tags; strip injection patterns | section-20 |
| HIGH-7 | Parallel credit cancellation: hard cap at LLMGatewayClient level; `asyncio.Task.cancel()` when budget exceeded; allow 20% overage buffer | section-18 |
| HIGH-8 | Mustache template: serialize context to plain dict before rendering; disable lambda sections; cap template at 2000 chars | section-21 |
| HIGH-9 | OpenAPI import: wrap parsing in 5s timeout; Python re-validates SSRF at execution time (not just import time) | section-04 |

### 9.3 MEDIUM Security Recommendations

- MED-1: Scrub `tool_end.result` in SSE events before streaming to browser (section-09)
- MED-2: Conversation starter cache: use full SHA-256 hash; rate-limit cache invalidations 5/min (section-13)
- MED-3: `llm_classify` credit drain: cap guardrail LLM credits at 10% of run budget; agency chat rate limit 10 req/min (section-05)
- MED-4: Skill Factory auto-generated skills: create in `pending_review` status or limit to `prompt_enhancement` category only (section-20)
- MED-5: Context snapshot: exclude keys starting with `_secret.` or `_private.` from trace; apply secret scrubber (section-07)
- MED-6: `maxRoundTrips`: key by agent ID (not name); validate unique agent names at saveBuilder (section-11)
- MED-7: Celery tasks: check tenant feature flags via internal API before executing (section-22, section-23)
- MED-8: MCP discovery: use stored encrypted token server-side, don't accept plaintext from client (section-14)

---

## 10. Implementation Order (Dependency-Aware)

```
Week 1-2: Database migration (all tables + columns)
          Custom Tool backend (tRPC CRUD)
          Guardrails backend (tRPC + Python execution)
          Agency Context (Python class)
          Agent Runtime Settings (backend + Python)

Week 3-4: Custom Tool frontend (creator, picker)
          OpenAPI Import (service + frontend)
          Guardrails frontend (panel, strategy forms)
          Agency Context frontend (settings panel)
          Runtime Settings frontend (property panel)

Week 5-6: SSE streaming (Node.js route, Redis bridge, Python emitter)
          Structured Output (backend + Python + frontend)
          Custom Communication Flows (backend + Python)
          Dynamic Instructions (Python template resolution)

Week 7-8: Topology & Human Approval (full stack)
          SSE frontend (useAgencyStream hook, streaming UI)
          Cancel mechanism (full stack)

Week 9-10: Few-Shot Examples (full stack + Redis caching)
           Shared Instructions & Tools (full stack)
           MCP Tools Server (bidirectional integration)
           Knowledge Base mapping (orchestrator enhancement)

Week 11-12: Visualization Export (frontend)
            Observability & Tracing (full stack + trace viewer)

Week 13-14: Tool Progress Streaming (Python + SSE events)
            Standalone Tool API (Express route + OpenAPI generation)

Week 15-16: Conditional Branch Node (full stack)
            Parallel Fan-Out & Merge (full stack)
            Loop / Retry Node (full stack)

Week 17-18: Enhanced Skill Integration (full stack)
            Error Handler & Data Transform (full stack)
            AI Agency Creator v2 (Python pipeline + frontend stepper)

Week 18+:  Integration testing, security audit, documentation
```

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Complex LLM prompts for AI Creator v2 (14 node types) | Hallucinated configs | Review loops (max 3), programmatic validation after LLM, fallback to simpler configs |
| SSE connection stability | Dropped events | Event id: field for replay, polling fallback, Redis persistence |
| Parallel fan-out credit drain | Unexpected costs | maxConcurrent cap ≤10, credit tracking per branch, total run budget |
| Cross-phase dependencies | Blocked work | Database migration first (unblocks all phases), phase 1-2 features independent within phase |
| modelSettings migration (snake→camel) | Data corruption | Run migration with WHERE clause, backup table first, verify row counts |
| 6 new Python node type handlers | Orchestrator complexity | Each handler is isolated function, individual unit tests, error_handler_map built at load time |
| Dynamic instructions prompt injection (CRIT-1) | System prompt takeover | Context/user vars go to human-message only; built-ins only in system prompt |
| Shared context cross-branch poisoning (CRIT-2) | Data leakage between branches | Namespace isolation (branch_{id}.{key}); orchestrator-only keys protected |
| DNS rebinding bypassing SSRF checks (CRIT-3) | Internal network access | Pin resolved IP at check time; use IP for actual HTTP connection |
| Secret leakage in traces (CRIT-4) | 30-day plaintext exposure | Comprehensive scrubber library; encrypt trace JSONB at rest |
| Redis approval channel spoofing (HIGH-5) | Unauthorized approval bypass | HMAC-sign all approval messages; verify before context update |
| RAG chunk injection into system prompt (HIGH-6) | Prompt manipulation via documents | Cap 4000 chars; wrap in tags; strip injection patterns |
| Auto-generated skills without review (MED-4) | Untrusted skill execution | Create in pending_review status; limit to prompt_enhancement category |
