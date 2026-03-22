# AgencySwarm Tool System — Complete Research Brief

**Date**: 2026-03-10
**Status**: RESEARCH COMPLETE
**Scope**: Tool registration, invocation flow, builtin tools, agent-to-tool interaction, presentation creation

---

## Findings

### Overview: How Agents Invoke Tools

The AgencySwarm tool system is a **bridge pattern** that translates agent tool calls into Node.js HTTP endpoints:

1. **Agent (Python/AgencySwarm)** calls a tool via agency-swarm's `Tool` interface
2. **Tool Bridge** (SSPToolBridge in agency_tools.py) intercepts the call
3. **Risk Level Routing**: Low-risk tools → direct HTTP; High-risk → OpenSandbox dispatch; Special: builtin-agency-call → internal async
4. **HTTP POST** to Node.js internal service (`/api/internal/tools/{tool-id}`)
5. **Node.js** executes the tool (creates presentation, searches, executes skill, etc.)
6. **Response** returned as string to the agent

**Tool classes are created per-request** — no reuse, full lifecycle isolation.

---

## Current Architecture

### Tool Registration Pattern (agency_tools.py)

#### Builtin Tool Mapping (Lines 58-70)
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
    "builtin-agency-call": None,  # Internal async, no HTTP
}
```

#### Risk Level Assignments (Lines 72-84)
```python
_BUILTIN_RISK_LEVELS: dict[str, str] = {
    "builtin-web-search": "medium",
    "builtin-http-request": "medium",
    "builtin-skill-executor": "medium",
    "builtin-webhook": "medium",
    "builtin-rag-knowledge": "low",      # Direct HTTP
    "builtin-email-notify": "low",       # Direct HTTP
    "builtin-slack-message": "low",      # Direct HTTP
    "builtin-document-search": "low",    # Direct HTTP
    "builtin-voice": "medium",
    "builtin-browser": "high",           # OpenSandbox dispatch
    "builtin-agency-call": "high",       # Internal async (no HTTP)
}
```

### Tool Invocation Flow (Diagram)

```
┌──────────────────────────────────────────────────────────────────┐
│ AGENT (Python/AgencySwarm)                                       │
│ ├─ Calls: tool_instance.run()                                   │
│ └─ Tool instance: SSPTool_{builtin_xxx}                         │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ TOOL BRIDGE (_make_run_func in agency_tools.py)                 │
│ ├─ 1. Whitelist check (medium + high risk)                      │
│ ├─ 2. Risk level routing decision                               │
│ └─ 3. Dispatch to handler                                       │
└────────┬────────────────────────────────────────────────────────┘
         │
    ┌────┴─────────────────────────┬────────────────────┐
    │                              │                    │
    ▼                              ▼                    ▼
LOW RISK              MEDIUM RISK/HTTP      HIGH RISK/SANDBOX
_execute_http()       _execute_http()       _execute_sandbox()
Direct POST to:       Direct POST to:       POST to sandbox:
/api/internal/tools/  /api/internal/tools/  /api/sandbox/
rag-knowledge         web-search            execute
document-search       skill-executor
email-notify          http-request          SPECIAL:
slack-message         webhook               builtin-agency-call
voice                                       → async in Python
                                            (no HTTP)
```

### Tool Bridge Creation (Lines 281-323)

**Key Function**: `create_tool_bridge(tool_config, whitelist, adapter)`

```typescript
// Returns a BaseTool subclass for agency-swarm
// Has a run() method that executes the handler closure
// Stores ToolConfig as accessible ._tool_config attribute
```

**Tool Lifecycle**:
1. `resolve_tools_for_agent()` queries DB for agent's tools
2. `LEFT JOIN agency_tools` for optional config (builtin tools may not have row)
3. Merge base config + instance config
4. Create tool bridge with `create_tool_bridge()`
5. Return list of tool classes (not instances) to Agent constructor

---

## Builtin Tool Details

### All 10+ Builtin Tools

| Tool ID | Type | Risk | Endpoint | Purpose | Whitelist? |
|---------|------|------|----------|---------|-----------|
| **builtin-rag-knowledge** | builtin | low | `/api/internal/tools/rag-knowledge` | Search knowledge base | No |
| **builtin-skill-executor** | builtin | medium | `/api/internal/tools/skill-executor` | Execute SmartSpec skill | YES |
| **builtin-web-search** | builtin | medium | `/api/internal/tools/web-search` | Web search (Bing/Google) | YES |
| **builtin-http-request** | builtin | medium | `/api/internal/tools/http-request` | HTTP GET/POST/PUT | YES |
| **builtin-email-notify** | builtin | low | `/api/internal/tools/email-notify` | Send email via SMTP | No |
| **builtin-webhook** | builtin | medium | `/api/internal/tools/webhook` | Trigger webhook | YES |
| **builtin-slack-message** | builtin | low | `/api/internal/tools/slack-message` | Post to Slack | No |
| **builtin-document-search** | builtin | low | `/api/internal/tools/document-search` | Search uploaded docs | No |
| **builtin-voice** | builtin | medium | `/api/internal/tools/voice` | Voice input/output | YES |
| **builtin-browser** | builtin | high | `/api/internal/tools/browser` | Browser automation | YES (OpenSandbox) |
| **builtin-agency-call** | builtin | high | (internal) | Call another agency | YES (async in Python) |

### NOT YET IMPLEMENTED:
- **builtin-presentation-create** — This is the MISSING tool being researched
- Any custom tools (type="custom", "skill", "sandbox")

---

## Missing: builtin-presentation-create

### Current State
- **NOT in _BUILTIN_ENDPOINTS** (agency_tools.py:58-70)
- **NOT in _BUILTIN_RISK_LEVELS** (agency_tools.py:72-84)
- **NO endpoint defined** on Node.js side
- **Mentioned in context** but no implementation exists

### What It Should Do
Based on presentation architecture (`apps/web/shared/presentation/aiTypes.ts`):
- Create a presentation from a prompt/content
- Input: topic, num_slides, layout template, style preset, images
- Output: presentation JSON with slides
- Should call: `/api/internal/tools/presentation-create`

### Integration Points
- **Node.js**: Would handle Drizzle ORM calls to create presentation record
- **Config**: Tool config could specify presentation owner, tenant context
- **Skill**: Likely wraps the existing presentation AI generation skill

---

## Tool Config & Instance Configuration

### Base Configuration (from agency_tools table)
```sql
SELECT
  t.id,                    -- UUID tool ID
  t."toolType",           -- builtin/skill/custom/sandbox
  t."riskLevel",          -- low/medium/high
  t."requiresApproval",   -- bool
  t.config                -- JSON: {endpoint_url, ...}
```

### Per-Agent Instance Configuration (from agency_agent_tools.toolConfig)
```sql
SELECT aat."toolConfig"  -- Instance overrides like:
                         -- { collectionId, skillSlug, webhookUrl, ... }
```

### Merge Order
Instance config **overrides** base config — allows per-agent customization.

**Example: builtin-skill-executor**
- Base config: `{ endpoint_url: "/api/internal/tools/skill-executor" }`
- Instance config: `{ skillSlug: "image-prompt-engineer", modelOverride: "gpt-4o" }`
- Merged: Both used by Node.js to select + execute the skill

---

## Agent-to-Tool Interaction Pattern

### How Agent Calls a Tool

1. **AgencySwarm Agent instantiation** (agency_service.py lines 122-165):
   ```python
   agent = adapter.create_agent(
       config=agent_config,  # includes tools list
       user_token=user_token,
   )
   ```

2. **Tools attached** (agency_service.py line 145):
   ```python
   "tools": list(config.tools),  # Tool classes from resolve_tools_for_agent()
   ```

3. **During run**, agent may output:
   ```json
   {"type": "function_call", "name": "SSPTool_builtin_web_search", "input": {"query": "..."}}
   ```

4. **agency-swarm** calls `tool_instance.run()` with the input merged into `.query` field

5. **Tool bridge** executes the closure `_make_run_func()` → routes → executes

### Request Format to Node.js

**POST /api/internal/tools/{tool-id}** (from agency_tools.py:234)
```json
{
  "query": "the_input_string",
  ...config  // Spread the tool's merged config
}
```

**Response**: Plain string (tool.run() → str)

---

## Agency Data Flow: Template → Chat → Execution

### 1. Agency Template (Database)
Stored in `agencies` table:
- id, tenantId, name, systemPrompt, status
- creditMultiplier, maxRunTimeSeconds

### 2. Agents (agency_agents table)
Each agency has N agents:
- id, agencyId, name, instructions, model
- nodeType ("agent" | "supervisor" | "router" | etc.)
- nodeConfig (JSON, used by orchestrator)
- isEntryPoint (marks which agents can be called externally)

### 3. Tools Assigned (agency_agent_tools)
Each agent has M tools:
- agentId, toolId, toolConfig (instance overrides)
- toolId can be builtin or custom UUID

### 4. Conversation (agencyConversations)
User creates a conversation for an agency:
- id (UUID), agencyId, userId, createdAt
- No message history in this table (stored separately)

### 5. Message Flow (agencyRouter.sendMessage)
```
User Message (tRPC)
  → Node.js: agencyRouter.sendMessage()
  → Validate: conversation belongs to user + agency
  → Call: agencyBridge.executeRun()
    → Python: POST /api/v1/agencies/run
    → AgencyService.execute_run()
      → Load agency config + agents
      → Check orchestrator path (has non-agent nodes?)
        → YES: AgencyOrchestrator
        → NO: Traditional AgencySwarmAdapter
      → Build agents with tools
      → Call adapter.run(agency, message)
      → Return result
  → Update conversation (agencyConversations)
  → Return to frontend
```

---

## Node.js Internal Tool Endpoints (Not Yet Implemented)

### Patterns Observed in Codebase

**Browser Tool** (browserTool.ts):
- Route: POST `/api/internal/tools/browser`
- Auth: X-Internal-Token header validation
- Request: `{ query, config: {...} }`
- Response: JSON or error message

**Key characteristics**:
1. Internal-only endpoints (checked by middleware)
2. No external auth; use internal token
3. Receive tool config in request
4. Return string response

### For presentation-create endpoint

Should follow same pattern:
- Route: POST `/api/internal/tools/presentation-create`
- Auth: X-Internal-Token validation
- Request:
  ```json
  {
    "query": "Create a 5-slide presentation about AI",
    "tenantId": "...",
    "userId": 123,
    "config": {
      "numSlides": 5,
      "template": "hero_center",
      "style": "dark-professional"
    }
  }
  ```
- Response:
  ```json
  {
    "presentationId": "uuid",
    "slideCount": 5,
    "content": {...}
  }
  ```

---

## Risks

### 1. Tool Configuration Not Persisted
- **Issue**: builtin tools don't have rows in agency_tools table
- **Risk**: If risk level or endpoint needs to change, requires code modification
- **Mitigation**: Infer from hardcoded tables; only override if explicit DB entry exists

### 2. No Tool Discovery for Agents
- **Issue**: Agent doesn't know what tools are available without DB query
- **Risk**: Tool config drift (agent configured with invalid toolId)
- **Mitigation**: `resolve_tools_for_agent()` validates; silently ignores missing tools

### 3. Whitelist Enforcement Is String-Based
- **Issue**: If whitelist is stored as JSON string, parsing could fail
- **Risk**: All medium/high risk tools silently denied
- **Mitigation**: Always validate whitelist is valid set[str]

### 4. Error Messages Return to Agent
- **Issue**: Tool bridge returns human-friendly error strings
- **Risk**: Agent may misinterpret "not whitelisted" as a recoverable condition
- **Mitigation**: Agent instructions should not rely on tool availability; graceful fallback

### 5. Presentation Tool Missing
- **Issue**: No builtin-presentation-create defined
- **Risk**: Agents cannot create presentations despite being useful for agencies
- **Mitigation**: Implement presentation creation tool as part of spec completion

### 6. No Config Validation Before Tool Creation
- **Issue**: Tool config fields not validated against endpoint requirements
- **Risk**: Tool accepts malformed config; endpoint fails at runtime
- **Mitigation**: Schema validation in `resolve_tools_for_agent()` or at endpoint

### 7. Cross-Agency Calls Bypass HTTP
- **Issue**: builtin-agency-call uses asyncio.run() in sync context
- **Risk**: Nested agency calls may deadlock or cause event loop issues
- **Mitigation**: Async context manager pattern; limit nesting depth

---

## Options

### Option A: Add presentation-create as Builtin (Recommended)

**Steps**:
1. Add to _BUILTIN_ENDPOINTS: `"builtin-presentation-create": "/api/internal/tools/presentation-create"`
2. Add to _BUILTIN_RISK_LEVELS: `"builtin-presentation-create": "medium"`  (requires approval?)
3. Implement Node.js endpoint: POST `/api/internal/tools/presentation-create`
4. Endpoint creates presentation via existing presentation skill or tRPC router
5. Test via agency run that includes the tool

**Pros**:
- Follows existing pattern; low implementation risk
- Agents can call natively via agency-swarm
- Consistent with other tools (skill-executor, web-search)

**Cons**:
- Need to define request/response schema
- Requires careful credit deduction (presentations are expensive)
- Tool config flexibility needed (num slides, template, style)

### Option B: Wrap as Skill Tool (Alternative)

**Steps**:
1. Create custom tool with type="skill"
2. Skill uses existing presentation AI generation
3. Per-agent config specifies skill version + parameters
4. No code change needed; configuration-driven

**Pros**:
- Reuses existing presentation generation
- More flexible parameter passing
- No new endpoint needed

**Cons**:
- Indirect tool invocation via skill-executor
- Agent doesn't directly control presentation options
- Harder to track tool-specific metrics

### Option C: Custom Tool per Agency (Not Recommended)

**Steps**:
1. Each agency defines custom presentation tool via UI
2. Config specifies Node.js endpoint + auth token
3. Agents use generic custom tool dispatch

**Pros**:
- Maximum flexibility per agency

**Cons**:
- High complexity; duplicates work
- Hard to maintain; harder for users
- Creates operational burden

---

## Recommendation

**Implement Option A: builtin-presentation-create**

**Rationale**:
1. Presentation creation is core SmartSpec functionality
2. Multiple agencies will want this capability
3. Follows proven builtin tool pattern
4. Cleaner than wrapping in skill-executor
5. Enables standardized metrics/auditing

**Implementation Scope**:
- File: `python-backend/app/services/agency_tools.py` — add two lines
- File: `apps/web/server/routes/presentationTool.ts` — new 150-200 line endpoint
- File: `apps/web/server/_core/index.ts` — register route
- Test: Agency run that creates presentation via tool call

**Estimated Effort**: 4-6 hours (including tests + docs)

---

## Open Questions

1. **Credit Deduction**: Should presentation creation reserve credits like browser tool?
   - Suggestion: Yes, medium reserve (depends on slides + images)

2. **Tool Config Schema**: What parameters should agents specify?
   - Current thoughts: numSlides, template (enum), style (enum), topic
   - Or minimal: query only, infer rest?

3. **Presentation Ownership**: Who owns the presentation created by an agent?
   - Option A: The agency owner
   - Option B: The user who initiated the conversation
   - Option C: Both (shared group)

4. **Async Generation**: Should tool wait for full presentation or return task ID?
   - Current builtin tools return immediate results
   - Presentations take seconds; agent may timeout
   - Suggestion: Return presentation ID + status polling endpoint

5. **Integration with Spec 034**: Is this part of the "Autonomous Presentation Builder" feature?
   - If yes, tie to spec 034 requirements + skill orchestration

6. **Audit Trail**: How to track "presentation created by agent" in audit logs?
   - Should create apiAuditEvent with tool_called, presentation_id, agent_name

---

## Key Files

**Python Backend**:
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` (Lines 1-400) — Tool bridge, routing, whitelist
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_swarm_adapter.py` (Lines 1-431) — Agent/Agency construction
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py` (Lines 1-250) — Run orchestration
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/agencies.py` (Lines 1-100) — API endpoints

**Node.js Backend**:
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` (Lines 1-1393) — tRPC agency router
- `/home/dev/projects/SmartSpecPro/apps/web/server/routes/browserTool.ts` (Lines 1-200+) — Example builtin tool endpoint pattern
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` — Route registration

**Shared Types**:
- `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts` — Presentation schemas

---

## Summary

The AgencySwarm tool system is a **clean, well-designed bridge** from Python agents to Node.js capabilities. Tools are:
- Registered in DB with config
- Created per-request with risk-based routing
- Whitelist-enforced for medium/high risk
- HTTP-routed or sandbox-dispatched based on risk
- Responding as strings back to agents

**builtin-presentation-create is ready for implementation** and should follow the established pattern. No architectural changes needed; pure extension via config + new endpoint.
