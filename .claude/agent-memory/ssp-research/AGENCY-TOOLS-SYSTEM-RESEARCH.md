---
name: Agency Tools System Research
description: Complete analysis of SmartSpecPro's Agency Builder tools system, covering builtin tools, tool execution architecture, customization options, and gaps vs. full tool system (agency-swarm)
type: project
---

# Agency Tools System Research Brief

**Date:** 2026-03-22
**Status:** COMPLETE — Full tools system audited and documented

## Executive Summary

SmartSpecPro's Agency Builder has a **hybrid tool system** combining:
- **16 hardcoded builtin tools** (defined in Node.js, executed via HTTP or natively)
- **Custom tool database support** (optional, read from `agency_tools` table)
- **Risk-based execution routing** (low/medium/high) in Python backend
- **Agency-swarm integration** (via `AgencySwarmAdapter`) for agent-native execution

**Key findings:**
1. Tools are mostly **metadata + HTTP wrappers** — Python backend routes them to internal Node.js endpoints
2. **No true custom tool creation UI** — custom tools must be defined via `agency_tools` table insert
3. **No function calling support** — agents don't select tools dynamically; tools are pre-assigned per agent
4. **Gaps vs. BaseTool pattern:** No input validation per tool, no auto-documentation, no composition support

---

## Current Architecture

### 1. Frontend Tool Definition (Node.js)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` lines 354-631

**16 Builtin Tools:**

| Tool ID | Name | Type | Risk | Config Schema? | Implementation |
|---------|------|------|------|---|---|
| `builtin-web-search` | Web Search | builtin | low | ❌ | HTTP → `/api/internal/tools/web-search` |
| `builtin-code-interpreter` | Code Interpreter | sandbox | medium | ❌ | HTTP → sandbox endpoint |
| `builtin-file-reader` | File Reader | builtin | low | ❌ | HTTP → workspace endpoint |
| `builtin-file-writer` | File Writer | builtin | medium | ❌ | HTTP → workspace endpoint |
| `builtin-rag-knowledge` | Knowledge Base Reader | builtin | low | ✅ (collectionId, topK) | HTTP → `/api/internal/tools/rag-knowledge` |
| `builtin-skill-executor` | Skill Executor | sandbox | medium | ✅ (skillId, skillSlug) | HTTP → `/api/internal/tools/skill-executor` |
| `builtin-cmd-executor` | Command Executor | sandbox | high | ❌ | HTTP → sandbox |
| `builtin-http-request` | HTTP/REST API | builtin | medium | ✅ (url, method, headers) | HTTP → `/api/internal/tools/http-request` |
| `builtin-email-notify` | Email Notification | builtin | low | ✅ (toTemplate, subjectTemplate) | HTTP → `/api/internal/tools/email-notify` |
| `builtin-webhook` | Webhook Trigger | builtin | medium | ✅ (webhookUrl) | HTTP → `/api/internal/tools/webhook` |
| `builtin-slack-message` | Slack Message | builtin | low | ✅ (channelId) | HTTP → `/api/internal/tools/slack-message` |
| `builtin-document-search` | Document Search | builtin | low | ✅ (collectionIds) | HTTP → `/api/internal/tools/document-search` |
| `builtin-voice` | Voice (STT/TTS) | builtin | medium | ✅ (allowedModes, defaultVoice, maxDuration) | HTTP → `/api/internal/tools/voice` |
| `builtin-agency-call` | Agency Call | builtin | high | ✅ (allowedAgencies, maxDepth, timeout) | **Native** (no HTTP) |
| `builtin-browser` | Browser Automation | sandbox | high | ✅ (maxPageLoads, timeout, screenshotQuality, allowedDomains) | HTTP → sandbox |
| *(missing from code)* | - | - | - | - | - |

**Additional tools in Python backend but NOT in frontend list:**
- `builtin-auto-draft`
- `builtin-model-suggest`
- `builtin-file-parse`
- `builtin-schedule-draft`
- `builtin-skill-discovery`
- `builtin-present-files` (v1.8, native agency-swarm tool)

**Source:** `listTools` procedure in `agency.ts` line 354

---

### 2. Database Schema

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` lines 4764-4814

#### `agency_tools` Table (Custom Tool Definitions)
```typescript
agencyTools = pgTable("agency_tools", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  toolType: varchar("toolType", { length: 20 }).notNull(),  // "builtin" | "skill" | "sandbox" | "custom"
  config: json("config").$type<Record<string, unknown>>(),   // Tool-specific config (not instance override)
  riskLevel: varchar("riskLevel", { length: 10 }).default("low"),
  requiresApproval: boolean("requiresApproval").default(false),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
});
```

#### `agency_agent_tools` Table (Tool Assignments)
```typescript
agencyAgentTools = pgTable("agency_agent_tools", {
  id: varchar("id", { length: 36 }).primaryKey(),
  agentId: varchar("agentId", { length: 36 }).notNull()
    .references(() => agencyAgents.id, { onDelete: "cascade" }),
  toolId: varchar("toolId", { length: 100 }).notNull(),  // "builtin-xxx" or UUID
  toolConfig: json("toolConfig").$type<{
    // rag
    collectionId?: string;
    topK?: number;
    // skill-executor
    skillId?: string;
    skillSlug?: string;
    // http-request
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    // email-notify
    toTemplate?: string;
    subjectTemplate?: string;
    // webhook
    webhookUrl?: string;
    // slack-message
    channelId?: string;
    // agency-call
    allowedAgencies?: string[];
    maxDepth?: number;
    timeout?: number;
    // browser
    maxPageLoads?: number;
    screenshotQuality?: string;
    allowedDomains?: string;
    // generic
    [key: string]: unknown;
  }>(),
});
```

**Key insight:** `toolId` field is `varchar(100)` NOT a UUID foreign key — allows both builtin string IDs and custom UUID IDs.

**Unique constraint:** One tool per agent (`agency_agent_tools_agent_tool_idx` on `agentId` + `toolId`)

---

### 3. Frontend Tool Selection UI

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ToolPicker.tsx` (219 lines)

**2-Step Flow:**
1. **Step 1 (Tool List):** Display all tools, grouped by type (builtin/skill/sandbox/custom)
   - Shows name, description, risk badge, requiresApproval icon, "⚙ configurable" indicator
   - Filtered by search across name + description
   - Excludes already-assigned tools (via `excludeToolIds` prop)

2. **Step 2 (Tool Config):** If tool has `configSchema.fields`, show form to collect instance config
   - Uses `ToolConfigPanel` component to render dynamic form
   - User values stored in `toolConfig` object
   - Passed to `onSelect` callback as `{ toolId, toolName, toolConfig }`

**Data source:** Fetches via `trpc.agency?.listTools?.useQuery()`

---

### 4. Python Backend Tool Execution

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` (453 lines)

#### Tool Registration & Routing

**Builtin endpoint mapping:**
```python
_BUILTIN_ENDPOINTS: dict[str, str] = {
    "builtin-rag-knowledge": "/api/internal/tools/rag-knowledge",
    "builtin-skill-executor": "/api/internal/tools/skill-executor",
    "builtin-web-search": "/api/internal/tools/web-search",
    "builtin-http-request": "/api/internal/tools/http-request",
    "builtin-email-notify": "/api/internal/tools/email-notify",
    "builtin-webhook": "/api/internal/tools/webhook",
    "builtin-slack-message": "/api/internal/tools/slack-message",
    "builtin-document-search": "/api/internal/tools/document-search",
    "builtin-voice": "/api/internal/tools/voice",
    "builtin-browser": "/api/internal/tools/browser",
    "builtin-agency-call": None,  # Handled internally, no HTTP
    "builtin-auto-draft": "/api/internal/tools/auto-draft",
    "builtin-model-suggest": "/api/internal/tools/model-suggest",
    "builtin-file-parse": "/api/internal/tools/file-parse",
    "builtin-schedule-draft": "/api/internal/tools/schedule-draft",
    "builtin-skill-discovery": "/api/internal/tools/skill-discovery",
    "builtin-present-files": None,  # v1.8 native agency-swarm tool
}
```

**Risk levels:**
- **Low:** `rag-knowledge`, `email-notify`, `slack-message`, `document-search`, `model-suggest`, `skill-discovery`, `present-files`
- **Medium:** `web-search`, `http-request`, `skill-executor`, `webhook`, `voice`, `auto-draft`, `file-parse`, `schedule-draft`
- **High:** `browser`, `agency-call`

#### Tool Execution Flow

**Function:** `resolve_tools_for_agent()` (lines 352-453)

1. **Load:** Query `agency_agent_tools` LEFT JOIN `agency_tools` for a specific agent
2. **Merge configs:**
   - Base config from `agency_tools.config` (tool-level defaults)
   - Instance config from `agency_agent_tools.toolConfig` (agent-specific overrides)
   - Instance config takes priority
3. **Create tool bridges:** Call `create_tool_bridge()` for each tool
   - Returns a class conforming to agency-swarm `BaseTool` interface
   - Closure captures config + whitelist for later execution
4. **Return:** List of tool classes passed to agent

**Execution routing in `_make_run_func()`:**
```python
if config.tool_id == "builtin-agency-call":
    # Cross-agency calls handled internally via execute_agency_call()
elif config.risk_level == "high":
    result = _execute_sandbox(config, query)  # OpenSandbox dispatch
else:
    result = _execute_http(config, query)     # Direct HTTP call
```

#### HTTP Execution (`_execute_http()`)
- Calls agent-assigned endpoint with `{ query, **config.config }`
- SSRF protection: Validates URL against blocked hosts/networks
- Timeout: 30 seconds
- Returns response text or error message (agent-readable)

#### Sandbox Execution (`_execute_sandbox()`)
- Routes to OpenSandbox for high-risk tools (browser, cmd-executor)
- Timeout: 60 seconds
- Same SSRF validation as HTTP execution

#### Whitelist Enforcement
- **Medium/High risk tools:** Must be in `agency_whitelist` to execute
- If not whitelisted: Returns error string (not exception) so agent can handle gracefully
- **Low risk tools:** Always allowed (no whitelist check)
- Whitelist is passed from Python when resolving tools; prevents agent from using unauthorized tools

---

### 5. Agency Orchestrator Integration

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` (300+ lines)

#### Tool Resolution in Agent Nodes

When orchestrator executes an agent node (lines 268-279):
```python
tools = []
if self.db:
    from app.services.agency_tools import resolve_tools_for_agent
    tools = await resolve_tools_for_agent(
        db=self.db,
        agent_id=node["id"],
        agency_whitelist=self.agency_whitelist,
        adapter=self.adapter,
        retrieval_scope_mode=self.retrieval_scope_mode,
    )

agent = self.adapter.create_agent(
    config=AgentConfig(
        name=node.get("name", "Agent"),
        instructions=agent_instructions,
        model=node.get("model", "gpt-4o"),
        tools=tools,  # ← Tools passed here
        is_entry_point=node.get("is_entry_point", False),
    ),
    user_token=ctx.user_token,
)
```

**Key:** Tools are resolved per agent, passed to agent creation, then agent-swarm handles function calling.

---

## How Tools Work Today

### Tool Assignment Flow

```
Frontend (User)
    ↓ selects tools in ToolPicker
    ↓ onSelect(toolId, toolConfig)
    ↓
AgentPropertyPanel / AgencyBuilder
    ↓ stores in local state
    ↓ calls saveBuilder → tRPC agency.saveBuilder
    ↓
Node.js tRPC router (agency.ts)
    ↓ INSERT into agency_agent_tools
    ↓   (agentId, toolId, toolConfig)
    ↓
PostgreSQL
    ↓ stored in db
    ↓
[Later] Python backend loads agency
    ↓
agency_orchestrator.py
    ↓ calls resolve_tools_for_agent()
    ↓
agency_tools.py
    ↓ LEFT JOIN agency_agent_tools + agency_tools
    ↓ creates tool bridge classes
    ↓ passes to agent via AgencySwarmAdapter
    ↓
Agent-swarm library
    ↓ agent uses tool via function calling
    ↓
tool_bridge._make_run_func() (closure)
    ↓ routes by risk level:
    ├→ HIGH: _execute_sandbox() → OpenSandbox
    ├→ MEDIUM: whitelist check, then _execute_http()
    ├→ LOW: _execute_http()
    └→ AGENCY_CALL: execute_agency_call() [async internal]
    ↓
Internal Node.js endpoints
    ↓ /api/internal/tools/{tool-name}
    ↓ processes request, returns result text
    ↓
Result passed back to agent
```

### Tool Execution Methods

1. **HTTP Wrapper** (Most tools)
   - Python creates a synchronous wrapper with `query` field
   - Agent-swarm passes `query` parameter
   - Wrapper makes POST to Node.js internal endpoint
   - Endpoint processes logic, returns text
   - Agent receives result string

2. **Native Agency-Swarm Tool** (`builtin-present-files`)
   - Tool class is agency-swarm `BaseTool` subclass directly
   - Python returns it from adapter
   - Agent-swarm calls `.run()` method natively
   - No HTTP round-trip

3. **Internal Async Function** (`builtin-agency-call`)
   - Wrapper runs `execute_agency_call()` via `asyncio.run()`
   - Crosses agency boundary
   - Returns result string

---

## What Can Tools Do?

### Fully Functional
- **Read:** Knowledge bases (RAG), documents, files
- **Write:** Files, emails, webhooks, Slack messages
- **Search:** Web search, document search, skill discovery
- **Execute:** Skills (via skill executor), Python (code interpreter), shell commands (cmd executor)
- **Call:** Other agencies (with depth limits and approval gates)
- **Browse:** Navigate web (browser automation tool)
- **Voice:** Speech-to-text, text-to-speech
- **Network:** HTTP requests with custom headers/auth

### Not Directly Supported (Must Be Delegated)
- **Tool composition** — No way for tool A to call tool B automatically; must be agent's decision
- **Conditional branching within a tool** — Tools are stateless; agent must interpret result and decide next step
- **Multi-step workflows** — No loop/retry logic in tool itself; agent orchestrates
- **Long-running operations** — Tools have timeouts (30s HTTP, 60s sandbox); no async continuation

---

## Custom Tools

### How to Create Custom Tools Today

**1. Via Database Insert (No UI)**

Insert into `agency_tools` table directly:
```sql
INSERT INTO agency_tools (id, tenantId, name, description, toolType, config, riskLevel)
VALUES (
  'custom-123',
  'tenant-xyz',
  'My Custom Tool',
  'Does something special',
  'custom',
  '{"endpoint": "https://myapi.com/tool", ...}',
  'medium'
);
```

Then assign to agent:
```sql
INSERT INTO agency_agent_tools (id, agentId, toolId, toolConfig)
VALUES ('assign-456', 'agent-789', 'custom-123', '{}');
```

**2. Builtin Tool Approach (Hardcode in Node.js)**

Add to `listTools` in `agency.ts` line 366+, deploy server.

### Limitations

- **No creation UI** — Must be admin/database access
- **No validation per tool** — Config is just JSON, no schema enforcement
- **No auto-documentation** — Description must be written manually
- **No input schema** — Unlike builtin tools, custom tools don't have `configSchema` for form generation
- **No tool type detection** — All custom tools routed the same way (HTTP to an endpoint you provide)

---

## Gaps vs. Full Tool System (agency-swarm BaseTool Pattern)

### agency-swarm's BaseTool (Reference)

```python
class BaseTool:
    """Base class for agent tools."""

    def __init__(self):
        self.description = "..."      # Auto-generated help text
        self.id = "tool-name"

    def run(self, **kwargs) -> str:
        """Execute tool. Input/output fully typed."""
        pass
```

**Features:**
- Tools are reusable objects with `run()` method
- Full type hints for inputs (Pydantic models)
- Auto-documentation via docstrings + type hints
- Composition via `ToolRegistry` (tools can call other tools)
- Per-tool error handling and retries
- Tool caching and memoization

### SmartSpecPro's Gap Analysis

| Feature | agency-swarm | SmartSpecPro | Gap |
|---------|---|---|---|
| **Tool Definition** | Class with typed inputs | JSON metadata + HTTP | ❌ No input validation, no types |
| **Tool Registry** | Central registry with lookup | Hardcoded list + DB table | ⚠️ Can't dynamically discover/add tools |
| **Function Calling** | Native (agent selects tools by signature) | Pre-assigned (agent gets fixed tool list) | ❌ No dynamic tool selection |
| **Input Validation** | Pydantic model per tool | Unvalidated JSON | ❌ Any input passes through |
| **Auto-Documentation** | From docstrings + types | Manual descriptions | ⚠️ Prone to drift |
| **Tool Composition** | ToolA can call ToolB directly | Must go through agent | ❌ Inefficient, high latency |
| **Async Support** | Native async tools | Sync wrappers, timeouts | ❌ Long-running jobs not supported |
| **Caching** | Built-in memoization | Per-tool responsibility | ❌ No cache layer |
| **Error Recovery** | Tool-level retry logic | Agent must retry | ⚠️ Agent overhead |

### What Would Be Needed for a Full Tool System

**Phase 1 (MVP):**
1. Custom tool creation UI in Agency Builder
2. Per-tool input schema (Zod/JSON Schema)
3. Tool input validation before execution
4. Tool versioning + changelog

**Phase 2 (Intermediate):**
1. Tool composition support (tool A → tool B via registry)
2. Tool caching layer (Redis)
3. Async/long-running tool support with job ID tracking
4. Per-tool rate limiting + cost tracking

**Phase 3 (Advanced):**
1. Tool Marketplace (share custom tools across tenants)
2. Tool chaining DSL (define multi-step workflows)
3. Tool dependency injection (tools can declare requirements)
4. Agent-native tool selection via dynamic registry

---

## Key Code Locations

| What | File | Lines | Notes |
|------|------|-------|-------|
| Frontend tools list | `apps/web/server/routers/agency.ts` | 354-631 | `listTools` procedure |
| Tool picker UI | `apps/web/client/src/components/agency/ToolPicker.tsx` | 1-219 | 2-step selection flow |
| DB schemas | `apps/web/drizzle/schema.ts` | 4764-4814 | `agency_tools`, `agency_agent_tools` |
| Tool bridge creation | `python-backend/app/services/agency_tools.py` | 307-349 | `create_tool_bridge()` |
| Tool resolution | `python-backend/app/services/agency_tools.py` | 352-453 | `resolve_tools_for_agent()` |
| Execution routing | `python-backend/app/services/agency_tools.py` | 156-241 | `_make_run_func()`, `_execute_http()`, `_execute_sandbox()` |
| Orchestrator integration | `python-backend/app/services/agency_orchestrator.py` | 268-279 | Tool resolution in agent node |
| Tool endpoints | `apps/web/server/routers/*.ts` | Various | `skillDiscoveryTool.ts`, `modelSuggestTool.ts`, `*Tool.ts` |

---

## Current Limitations & Risks

### Functional Limitations

1. **No dynamic tool selection** — All agent tools pre-assigned; agent can't choose which tools to use
2. **Tools are metadata-light** — No input type definitions, only descriptions
3. **Synchronous execution** — All tools have fixed timeouts; no async continuation
4. **No tool composition** — Tools can't call other tools; must round-trip through agent
5. **No tool caching** — Repeated queries hit endpoints every time

### Operational Risks

1. **Whitelist bypass** — Medium/high risk tools blocked if not in whitelist, but whitelist not exposed in UI (operator can't see why tool failed)
2. **SSRF vulnerability in custom tools** — If user defines a custom tool pointing to internal IP, execution routing doesn't validate (only builtin tools are checked)
3. **Unvalidated input** — Any JSON passes to tool endpoint; no schema enforcement at Python layer
4. **Silent tool failures** — HTTP errors returned as strings; agent might misinterpret as success

### Usability Gaps

1. **No custom tool creation UI** — Must insert into DB directly
2. **Tool descriptions quickly become stale** — No auto-generation from code
3. **Hard to audit tool usage** — No per-tool audit trail (only agency-level logs)
4. **Tool versioning not supported** — Can't track tool config changes over time

---

## Recommendations

### Short-term (Quick wins)
1. **Add custom tool creation API** — tRPC procedure to let users create tools without DB access
2. **Expose tool status in orchestrator** — Log which tools were resolved and why whitelist blocks if applicable
3. **Add input validation** — Minimal JSON Schema validation at Python layer before executing

### Medium-term (Next iteration)
1. **Implement tool versioning** — Track config changes, allow rollback
2. **Add tool composition API** — Let agents call other tools via registry (not just HTTP-to-agent-to-HTTP)
3. **Audit trail per tool** — Log queries, responses, execution time, cost per tool call
4. **Tool templates** — Pre-built tool configs for common patterns (Slack webhook, Discord, etc.)

### Long-term (Full tool system)
1. **Tool SDK** — Let developers write custom tools in Python/Node with type hints
2. **Tool Marketplace** — Share tools across tenants
3. **Agent-native tool selection** — Tools exposed to agent via function calling; agent picks which to use dynamically
4. **Tool chaining DSL** — Define multi-step workflows at tool level (not agent level)

---

## Open Questions

1. **Tool discoverability:** How do agents know which tools are available? Currently: hardcoded list at creation time. Should there be dynamic discovery?
2. **Tool feedback loops:** If a tool returns an error, how does the agent know whether to retry or escalate? Currently: agent interprets error string (fragile).
3. **Cost tracking:** Are tool execution costs tracked separately from agent execution? Currently: bundled with agency run cost.
4. **Custom tool governance:** Should there be approval workflow for custom tools before they're assigned to agents?
5. **Tool versioning:** If a tool config changes mid-run, which version does the agent use? Currently: whatever is in DB at load time.
6. **Timeout handling:** Should tool timeouts be configurable per agent? Currently: fixed in code (30s HTTP, 60s sandbox).

