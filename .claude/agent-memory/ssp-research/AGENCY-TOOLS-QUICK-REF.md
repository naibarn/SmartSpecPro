---
name: Agency Tools Quick Reference
description: Quick lookup tables for builtin tools, execution methods, and code locations
type: project
---

# Agency Tools System — Quick Reference

## 16 Builtin Tools at a Glance

```
KNOWLEDGE/SEARCH (Low Risk)
├─ builtin-rag-knowledge         RAG search, configurable collectionId
├─ builtin-document-search       Multi-collection search
├─ builtin-web-search            Real-time internet search
├─ builtin-skill-discovery       Find relevant skills by keyword
└─ builtin-model-suggest         Recommend media models by quality

COMMUNICATION (Low Risk)
├─ builtin-email-notify          Send emails (configurable template)
├─ builtin-slack-message         Post to Slack (configurable channel)
└─ builtin-webhook               Trigger webhooks (configurable URL)

FILE OPERATIONS (Low/Medium Risk)
├─ builtin-file-reader           Read from workspace (Low)
├─ builtin-file-writer           Write to workspace (Medium)
└─ builtin-file-parse            Parse files (Medium)

EXECUTION (Medium/High Risk)
├─ builtin-skill-executor        Run skills in sandbox (Medium)
├─ builtin-http-request          HTTP/REST API calls (Medium, config: url/method/headers)
├─ builtin-voice                 STT/TTS conversion (Medium, config: mode/voice/duration)
├─ builtin-code-interpreter      Execute Python (Medium, sandbox)
├─ builtin-cmd-executor          Shell commands (High, requires approval)
└─ builtin-browser               Web automation (High, requires approval, config: domains/quality)

ADVANCED (High Risk)
├─ builtin-agency-call           Cross-agency calls (High, native async, config: allowedAgencies/maxDepth)
└─ builtin-present-files         File preview tool (v1.8, native agency-swarm, Low)

TOOLS MISSING FROM FRONTEND (Python-only):
└─ builtin-auto-draft            Draft content (internal, Medium)
└─ builtin-schedule-draft        Schedule future drafts (internal, High)
```

---

## Execution Routing Quick Map

```python
# In agency_tools.py lines 192-229

if toolId == "builtin-agency-call":
    result = execute_agency_call()          # Async internal function
elif riskLevel == "high":
    result = _execute_sandbox(config, query)  # POST to OpenSandbox
else:
    if riskLevel in ("medium", "high"):
        if toolId not in whitelist:
            return "Tool not authorized"    # Fails closed
    result = _execute_http(config, query)   # POST to Node.js endpoint
```

---

## Tool Assignment Flow (Simplified)

```
User: Select tool in ToolPicker
  ↓ (onSelect callback)
Frontend: Save via tRPC agency.saveBuilder
  ↓ (INSERT agency_agent_tools)
Database: Store (agentId, toolId, toolConfig)
  ↓ (Later: agency run starts)
Python: Load via resolve_tools_for_agent()
  ↓ (LEFT JOIN agency_agent_tools + agency_tools)
Python: Create tool bridge classes
  ↓ (Pass to agent via AgencySwarmAdapter)
Agent-Swarm: Agent uses tool via function calling
  ↓ (Tool wrapper runs)
Tool Bridge: Route by risk level
  ├─ HIGH: Sandbox
  ├─ MEDIUM: Whitelist check, then HTTP
  ├─ LOW: HTTP
  └─ AGENCY_CALL: Async function
  ↓
Node.js: Execute /api/internal/tools/{name}
  ↓ (Returns text result)
Result: Back to agent as string
```

---

## Database Columns

### `agency_tools` (Custom Tool Definitions)

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(36) | UUID |
| `tenantId` | varchar(36) | Tenant isolation |
| `name` | varchar(100) | Display name |
| `description` | text | Optional, for UI |
| `toolType` | varchar(20) | "builtin", "skill", "sandbox", "custom" |
| `config` | json | Tool-level defaults (base config) |
| `riskLevel` | varchar(10) | "low", "medium", "high" (defaults to "low") |
| `requiresApproval` | boolean | Execution gate (defaults false) |
| `createdAt` | timestamp | Created date |

### `agency_agent_tools` (Tool Assignments)

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(36) | UUID |
| `agentId` | varchar(36) | FK to agencyAgents |
| `toolId` | varchar(100) | "builtin-xxx" or custom UUID (NOT FK) |
| `toolConfig` | json | **Instance config** — overrides tool defaults |

**Constraint:** `UNIQUE(agentId, toolId)` — One tool per agent

---

## Config Schema Keys (Per Tool)

| Tool | Config Keys | Type | Example |
|------|-------------|------|---------|
| `builtin-rag-knowledge` | `collectionId`, `topK` | string, number | `{collectionId: "col-1", topK: 5}` |
| `builtin-skill-executor` | `skillId`, `skillSlug` | string, string | `{skillId: "skill-abc", skillSlug: "my-skill"}` |
| `builtin-http-request` | `url`, `method`, `headers` | string, string, object | `{url: "https://...", method: "POST", headers: {...}}` |
| `builtin-email-notify` | `toTemplate`, `subjectTemplate` | string, string | `{toTemplate: "user@...", subjectTemplate: "Alert: ..."}` |
| `builtin-webhook` | `webhookUrl` | string | `{webhookUrl: "https://hooks.slack.com/..."}` |
| `builtin-slack-message` | `channelId` | string | `{channelId: "C0123456789"}` |
| `builtin-document-search` | `collectionIds` | string[] | `{collectionIds: ["col-1", "col-2"]}` |
| `builtin-voice` | `allowedModes`, `defaultVoice`, `maxAudioDurationSec`, `maxTextLength` | string[], string, number, number | JSON Schema in code |
| `builtin-agency-call` | `allowedAgencies`, `maxDepth`, `timeout` | string[], number, number | `{allowedAgencies: ["agency-1"], maxDepth: 2, timeout: 120000}` |
| `builtin-browser` | `maxPageLoads`, `timeout`, `screenshotQuality`, `allowedDomains` | number, number, string, string | `{maxPageLoads: 5, timeout: 300, screenshotQuality: "medium", allowedDomains: "example.com"}` |

---

## Code Locations (One-Liner Lookup)

| What | File | Line |
|------|------|------|
| Tool list definition | `apps/web/server/routers/agency.ts` | 366-607 |
| `listTools` procedure | `apps/web/server/routers/agency.ts` | 354-631 |
| Tool picker component | `apps/web/client/src/components/agency/ToolPicker.tsx` | 37-219 |
| DB schemas | `apps/web/drizzle/schema.ts` | 4764-4814 |
| Builtin endpoint map | `python-backend/app/services/agency_tools.py` | 58-76 |
| Risk levels | `python-backend/app/services/agency_tools.py` | 78-96 |
| Tool bridge creation | `python-backend/app/services/agency_tools.py` | 307-349 |
| Tool resolution | `python-backend/app/services/agency_tools.py` | 352-453 |
| Execution routing | `python-backend/app/services/agency_tools.py` | 156-241 |
| Agent tool loading | `python-backend/app/services/agency_orchestrator.py` | 268-279 |

---

## Can Users Do This?

| Action | Today | How |
|--------|-------|-----|
| **Create builtin tools** | ❌ | Hardcoded in Node.js, requires deploy |
| **Create custom tools** | ❌ (No UI) | DB insert only, no validation |
| **Assign tools to agents** | ✅ | Via ToolPicker UI in AgencyBuilder |
| **Configure tool params** | ✅ | Via configSchema form in ToolPicker |
| **View tool status** | ❌ | No audit trail |
| **Enable/disable tools** | ❌ | Only via delete from DB |
| **Limit tool access** | ✅ (Admin only) | Via whitelist in orchestrator config |
| **Tool composition** | ❌ | Tools can't call other tools |
| **Dynamic tool selection** | ❌ | All tools pre-assigned; agent can't choose |

---

## Risk Level Execution Rules

```python
LOW_RISK:
  └─ Always allowed
  └─ Direct HTTP call to endpoint
  └─ 30s timeout

MEDIUM_RISK:
  ├─ Check if toolId in agency_whitelist
  ├─ If not whitelisted: Return "Tool not authorized" error
  └─ If whitelisted: Direct HTTP call to endpoint
  └─ 30s timeout

HIGH_RISK:
  ├─ Always check whitelist (fail if not present)
  ├─ Dispatch to OpenSandbox
  └─ 60s timeout

SPECIAL (builtin-agency-call):
  └─ Always check whitelist (fail if not present)
  └─ Run async execute_agency_call() via asyncio.run()
  └─ Cross-agency validation + depth limit enforcement
  └─ No HTTP involved (native Python function)
```

---

## Common Patterns

### How to assign a simple tool to an agent (no config)

```python
# In saveBuilder mutation:
await db.insert(agencyAgentTools).values({
    id: crypto.randomUUID(),
    agentId: "agent-123",
    toolId: "builtin-web-search",  # No config needed
    toolConfig: null,
})
```

### How to assign a tool with config

```python
# In saveBuilder mutation:
await db.insert(agencyAgentTools).values({
    id: crypto.randomUUID(),
    agentId: "agent-123",
    toolId: "builtin-http-request",
    toolConfig: {
        url: "https://api.example.com/endpoint",
        method: "POST",
        headers: { "Authorization": "Bearer token" }
    }
})
```

### How to create a custom tool (via DB)

```sql
INSERT INTO agency_tools (
    id, tenantId, name, description, toolType, config, riskLevel
)
VALUES (
    'tool-custom-1', 'tenant-xyz', 'My API',
    'Calls my custom API', 'custom',
    '{"endpoint": "https://my-api.com/v1/action"}',
    'medium'
);
```

Then assign it:
```sql
INSERT INTO agency_agent_tools (id, agentId, toolId)
VALUES ('assign-1', 'agent-123', 'tool-custom-1');
```

---

## What Tools Actually Do

| Category | Example | Implementation |
|----------|---------|-----------------|
| **Read** | RAG search, web search | HTTP POST to Node.js endpoint, returns text results |
| **Write** | Email, Slack, webhook | HTTP POST with template vars, returns confirmation |
| **Execute** | Skills, Python code, shell | HTTP POST or OpenSandbox dispatch, returns output |
| **Network** | HTTP requests, browser | Sandboxed execution, SSRF-protected |
| **Cross-agency** | Agency call | Direct async function, validates tenant + depth |

---

## Gaps vs. Full Tool System

**What SmartSpecPro has:**
- 16 builtin tools, hardcoded list
- Basic config per tool per agent
- Risk-based execution routing
- Whitelist enforcement

**What it doesn't have:**
- ❌ Input validation (any JSON passes through)
- ❌ Tool composition (tool A can't call tool B)
- ❌ Dynamic tool selection (agent gets fixed list)
- ❌ Async long-running jobs (30-60s timeout only)
- ❌ Function calling support (no Signature matching)
- ❌ Per-tool audit trail
- ❌ Tool versioning
- ❌ Custom tool creation UI

