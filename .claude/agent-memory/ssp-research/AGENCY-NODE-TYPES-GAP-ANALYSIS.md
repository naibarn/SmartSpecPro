---
name: Agency Node Types & Skill System Gap Analysis
description: Comprehensive audit of 8 existing node types, skill integration, and missing agentic patterns
type: project
---

# Agency Node Types & Skill System — Gap Analysis (2026-03-22)

## Research Scope

Analyzed:
- 8 implemented node types (agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval, browser_session)
- Skill system architecture (50+ skills, category-based routing, execution modes)
- LLM gateway integration (multi-provider, tool bridging)
- Agency orchestrator execution engine (Python backend)
- Database schema (agencyAgents.nodeType, agencyAgents.nodeConfig)
- Client-side node components (React/ReactFlow)

## Current 8 Node Types — Implementation Status

### AGENT NODE (Core)
- **Code location**: `AgentNodeCard.tsx`, `agency_orchestrator.py:_execute_agent_node()`
- **Execution**: Delegated to AgencySwarmAdapter
- **Capabilities**: LLM + tools (16 builtin + custom), knowledge base context injection, model settings
- **Input/Output**: Single message in, single response out
- **Config schema**: instructions, model, modelSettings, knowledgeBase (document IDs + search params)
- **Status**: PRODUCTION — fully operational

### SUPERVISOR NODE (Coordination)
- **Code location**: `SupervisorNodeCard.tsx`, delegated to agent executor
- **Execution**: Same as Agent (subclass pattern in frontend only)
- **Capabilities**: Similar to Agent, but UI suggests "manages other agents"
- **Documentation**: "AI coordinator that manages other agents" (misleading — no actual supervisor logic in orchestrator)
- **Gap identified**: Supervisor is semantic, not functional — just an Agent node with different styling
- **Status**: PARTIAL — UI exists, but orchestrator treats it as plain agent

### ROUTER NODE (Conditional Routing)
- **Code location**: `RouterNodeCard.tsx`, `agency_orchestrator.py:_route()`
- **Execution**: LLM classification, regex, or keyword matching
- **Routing modes**: `keyword` | `regex` | `llm_classify`
- **Config schema**: routingMode, routes (array of {condition, targetNodeId, label}), defaultTargetNodeId
- **Output handles**: "True" (right), "False" (left), "Default" (bottom) in UI, but only one route executed
- **Limitation**: Binary decision routing, not multi-branch (WATCH: UI suggests 3 paths but implementation is sequential)
- **Status**: PRODUCTION — fully operational, 3-option routing works

### AGGREGATOR NODE (Result Merging)
- **Code location**: `AggregatorNodeCard.tsx`, `agency_orchestrator.py:_aggregate()`
- **Execution**: Parallel execution upstream, single merge downstream
- **Aggregation modes**: `first_wins` | `majority_vote` | `llm_merge` | `concatenate`
- **Use case**: Collect N agent outputs, merge into 1 response
- **Limitation**: Only supports POST-aggregation (collects from upstream), not pre-aggregation (no "broadcast to N agents")
- **Status**: PRODUCTION — fully operational

### KNOWLEDGE BASE NODE (RAG)
- **Code location**: `KnowledgeBaseNodeCard.tsx`, `agency_orchestrator.py:_search_knowledge()`
- **Execution**: HybridRAGEngine (vector + keyword search)
- **Config schema**: searchScope (`all` | `specific`), collectionId, topK, searchMode (hybrid/vector/keyword), scoreThreshold
- **Scope handling**: Tenant-wide or single document, with permission enforcement
- **Integration**: Populates ctx.knowledge, passed to downstream agents via context
- **Status**: PRODUCTION — fully operational, multi-scope search works

### SKILL CALL NODE (SmartSpec Integration)
- **Code location**: `SkillCallNodeCard.tsx`, `agency_orchestrator.py:_call_skill()`
- **Execution**: HTTP to `/api/v1/skills/execute` on Python backend
- **Config schema**: skillSlug | skillId
- **Input**: Passes ctx.input + ctx.get_context_text() (accumulated knowledge + prior results)
- **Output**: Returns skill's output as string
- **Skill types**: image_generation, video_generation, audio_generation, prompt_enhancement, chat_assistant, product_review, article_generation, etc.
- **Missing**: Input mapping (skills have input.schema.json, but node doesn't configure which skill field gets which context)
- **Status**: PRODUCTION — operational but input mapping is static

### HUMAN APPROVAL NODE (Handoff)
- **Code location**: `HumanApprovalNodeCard.tsx`, `agency_orchestrator.py:_await_approval()`
- **Execution**: Creates approval request, waits for decision (async with timeout)
- **Config schema**: approvalMessage, timeoutHours, onTimeout (auto_approve | auto_reject | escalate)
- **Output**: Returns approval decision as string
- **Integration**: HTTP to `/api/v1/approvals/create` (Python backend)
- **Status**: PRODUCTION — fully operational, async approval flow works

### BROWSER SESSION NODE (Hands-off Work)
- **Code location**: `BrowserSessionNodeCard.tsx`, `AgencyBrowserSessionExecutor`
- **Execution**: Launches shared browser, agent performs work, returns result
- **Config schema**: Browser session management (not fully exposed in node config)
- **Integration**: Tight coupling to browser session orchestration
- **Status**: PRODUCTION — fully operational for automation work

---

## Skill System Architecture

### Skill Definition & Metadata
- **Location**: `apps/web/skills/{skill-name}/skill.md` (50+ skills)
- **Frontmatter**: name, description, category, execution_mode, icon, version, author, isAutoTrigger, enabledByDefault, priority, creditMultiplier, defaultModel, triggerPatterns, tags
- **Storage**: `skills` table (id, slug, name, description, category, createdAt, updatedAt, definitions JSON)
- **Registry**: `skillRegistry.ts` — loads from database + auto-syncs folder on startup (60s cache TTL)

### Skill Types (Categories)
- **Execution**: `image_generation`, `video_generation`, `audio_generation`, `prompt_enhancement`
- **Specialized**: `chat_assistant`, `product_review`, `article_generation`, `automation`, etc.
- **Execution modes**: `llm-only` (system prompt), `media-generate` (auto-execute), `python` (sandbox), `http` (external)

### Skill Chaining
- **Field**: `chainTo` (metadata) — next skill slug to auto-execute
- **Impl**: `getMetadataChainTarget()` in skillRegistry.ts
- **Usage**: Limited — only parsed from metadata, not actively used in routing
- **Status**: PARTIAL — data structure exists, but not integrated into orchestrator

### Skill Detection
- **File**: `skillDetector.ts` — pattern matching + LLM confidence
- **Confidence thresholds**: >= 0.6 (assistant), >= 0.7 (human)
- **Fallback**: Always returns `general-article-writer` if no match
- **Integration**: Detected in Chat, NOT in Agency orchestrator

### Skill Execution
- **File**: `skillExecutor.ts` — routes to media service or Python sandbox
- **Rate limiting**: Per user per skill type (image: 10/min, video: 15/min, audio: 10/min)
- **Sandbox dispatch**: For Python skills with configurable model selection
- **Integration**: Used in Chat skill flow, NOT in Agency skill_call node

---

## LLM Gateway & Tool Execution

### Tool System (16 Builtin Tools)
- **HTTP-bridged**: rag-knowledge, skill-executor, web-search, http-request, email-notify, webhook, slack-message, document-search, voice, auto-draft, model-suggest, file-parse, schedule-draft, skill-discovery
- **Native agency-swarm**: present-files (v1.8)
- **No HTTP endpoint**: agency-call (internal)
- **Risk levels**: low (always), medium (whitelist check), high (whitelist + sandbox dispatch)
- **Execution**: HTTP wrappers + SSRF protection + sandbox fallback for high-risk

### Tool Routing
- **Frontend**: `ToolPicker.tsx` (2-step flow: select tool → configure)
- **Backend**: `agency_tools.py` — resolve tools for agent (LEFT JOIN + toolConfig merge)
- **DB schema**: `agencyTools` (global), `agencyAgentTools` (per-agent assignments)

---

## Execution Flow Analysis

### Entry Points
- Agencies have ONE entry node (marked `is_entry_point = true`)
- Entry must be agent or supervisor (orchestrator enforces this)
- All other nodes reachable via edge graph

### Message Flow
- User message → entry agent → routes/aggregates/skills/approvals → downstream agents → final response
- Knowledge accumulates in `ExecutionContext.knowledge` list
- Results accumulate in `ExecutionContext.results[node_id]` dict
- Context is passed to downstream agents via `ctx.get_context_text()` (includes prior results + knowledge)

### Edge Execution
- **Sequential**: Default — await each node in sequence
- **Parallel**: If edge.flow_type == "parallel" — run N nodes concurrently, collect all results
- **Router exception**: Router immediately switches to target node, skips normal edge following

---

## Gaps Identified

### CRITICAL GAPS (High Impact)

1. **No Conditional/Loop Node** ❌
   - Users cannot implement "if X then agent A, else agent B" logic
   - Workaround: Use router (but limited to single branch, not true if/else)
   - Impact: Cannot model complex decision trees

2. **No Parallel Fan-Out Node** ❌
   - Cannot send work to N agents simultaneously, collect results
   - Aggregator only merges POST-results, doesn't dispatch
   - Workaround: Manual edge setup (clunky, error-prone)
   - Impact: Users must hardcode parallel patterns instead of data-driven

3. **No Loop/Retry Node** ❌
   - Cannot implement "until condition met" patterns
   - No built-in retry logic for failed nodes
   - No circuit breaker or backoff strategy
   - Impact: Fragile orchestrations, no auto-recovery

4. **No Data Transform Node** ❌
   - Cannot map/filter/template intermediate results
   - Skill nodes receive full context but have no filter
   - Cannot extract specific fields from prior results
   - Impact: Every skill sees ALL prior results; no data hygiene

5. **No Timer/Delay Node** ❌
   - Cannot implement "wait N seconds" or scheduled tasks
   - No polling interval support
   - No cron trigger support
   - Impact: Real-time workflows only; no async scheduled work

6. **No Memory/State Node** ❌
   - Cannot persist state across multiple runs
   - ExecutionContext is request-scoped only
   - No conversation state management
   - Impact: Stateless workflows; cannot maintain ongoing context

### MEDIUM GAPS (Moderate Impact)

7. **Skill Input Mapping is Static** ⚠️
   - skill_call node doesn't configure skill input schema mapping
   - All skills receive same context (full message + knowledge + results)
   - Skills have input.schema.json but it's ignored by orchestrator
   - Impact: Cannot route specific data to specific skill fields

8. **No Sub-Workflow/Agency Call Node** ⚠️
   - `builtin-agency-call` tool exists but not exposed as node type
   - Cannot visually nest agencies (no sub-agency composition)
   - Workaround: Agent tool, but not first-class
   - Impact: No agency reuse/composition in UI

9. **Supervisor is Semantic, Not Functional** ⚠️
   - Supervisor UI suggests it "manages other agents"
   - Orchestrator treats it as plain agent
   - No delegation strategy (round-robin, broadcast, custom)
   - Impact: Confusing for users; no real supervisor behavior

10. **Router is Binary + Sequential** ⚠️
    - UI shows 3 handles (True/False/Default) but only 1 executes
    - Each route is sequential, not parallel fan-out
    - No "multi-branch router" for N outcomes
    - Impact: Users must chain routers for N-way decisions (verbose)

11. **No Webhook Trigger Node** ⚠️
    - Agencies are REST-only (POST /api/v1/agencies/{id}/run)
    - Cannot trigger from external events (no pub/sub, no webhooks)
    - Impact: No event-driven architectures

12. **No Code Execution Node** ⚠️
    - No first-class "run code" node (JS/Python)
    - Workaround: Python skill via skillExecutor, but not orchestrator-native
    - Impact: Complex data transforms must be skills, not nodes

13. **No API Call Node (HTTP as First-Class)** ⚠️
    - `builtin-http-request` exists as tool, not node
    - Cannot visually wire HTTP calls in canvas
    - Impact: Workflow transparency lost for API integrations

14. **Knowledge Base is Read-Only** ⚠️
    - Can search documents but not insert/update
    - No ability to add learned facts to KB during execution
    - Impact: Single-pass workflows; no adaptive learning

15. **No Error Handling Node** ⚠️
    - No try/catch node type
    - No "on failure" branch
    - Errors just propagate up
    - Impact: Workflows fail silently; no graceful degradation

---

## Existing Patterns to Leverage

### From Skills System
1. **Chaining**: `chainTo` field in metadata — can extend to nodes
2. **Detection**: Pattern-based trigger system — can model similar for node entry conditions
3. **Categories**: Skill types (prompt_enhancement, image_generation) — can inform node grouping
4. **Execution modes**: Multiple execution modes (llm-only, media-generate, python, http) — can extend to nodes

### From Orchestrator
1. **Context Accumulation**: ExecutionContext is rich (input, results, knowledge, history) — can add state fields
2. **Parallel Execution**: asyncio.gather() pattern exists — extend to more node types
3. **Scope Filtering**: Knowledge base uses permission scopes — can apply to all nodes
4. **Timeout Handling**: Approval node has timeout logic — can generalize

---

## Skill Integration Opportunities

### Current Integration (Partial)
- skill_call node exists, but static input mapping
- Skills have rich UI schemas (input.schema.json, ui.schema.json) but ignored
- Skill detection exists in Chat, NOT in Agency (separate system)

### Missing Integrations
1. **Dynamic skill selection** — conditional skill execution (route to different skill based on input)
2. **Skill composition** — chain skills without explicit nodes (macro expansion)
3. **Skill form UI** — display skill input form in node property panel, auto-map fields
4. **Skill versioning** — support multiple versions of same skill

---

## Implementation Considerations

### DB Schema Extensions Needed
- `nodeType` enum expansion (currently: agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval, browser_session)
- `nodeConfig` JSON schema expansion for each new type
- Possible: `agency_edge_flows` table to encode flow metadata (currently stored in parent node config)

### Orchestrator Engine Changes
- Extend `_execute_node()` match statement
- Add new executor methods for each node type
- Enhance ExecutionContext for state persistence

### Frontend Changes
- New node card components for each type
- Extend sidebar categories
- Property panels for configuration

### Client Performance Implications
- Conditional/loop nodes could increase execution time (more LLM calls)
- Parallel nodes could stress agent API rate limits
- Memory nodes could increase database size (state storage)

---

## Recommendations Summary

**Top 3 High-Impact Additions:**
1. **Conditional Branch Node** (if/else, multi-branch) — unlocks decision-tree workflows
2. **Parallel Dispatch Node** (fan-out/collect) — enables concurrent work
3. **Loop/Retry Node** (until condition, exponential backoff) — adds resilience

**Top 3 Quick Wins:**
1. **Data Transform Node** (map/filter/template) — 6-8 hrs, low complexity
2. **Skill Input Mapping** (use skill schemas in node config) — 4-6 hrs, improves UX
3. **Sub-Agency Node** (expose agency-call as first-class) — 3-4 hrs, existing tool, just UI

**Future Consideration (Lower Priority):**
- Webhook trigger node (requires infrastructure)
- Code execution node (sandbox integration, security)
- Memory/state persistence (architectural, impacts cost)
- Error handling branch (complex coordination logic)

