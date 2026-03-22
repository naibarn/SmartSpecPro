---
name: Agency Tools Executive Summary
description: One-page executive summary of the Agency tools system — what exists, how it works, and what's missing
type: project
---

# Agency Tools System — Executive Summary

**Research Date:** 2026-03-22
**Status:** ✅ COMPLETE
**Scope:** Frontend UI → Backend routing → Agent execution

---

## What Exists Today

### 16 Builtin Tools

**Available to Users (Frontend):**
- **Knowledge:** RAG (Knowledge Base Reader), Document Search, Web Search
- **Communication:** Email, Slack, Webhook
- **Execution:** Skills, HTTP/REST, Voice (STT/TTS)
- **Advanced:** Agency Call (cross-agency), Browser Automation

**Backend-Only (Python, not in UI list):**
- Auto-Draft, Model Suggest, File Parse, Schedule-Draft, Skill Discovery, Present Files

### Tool Assignment Architecture

```
Agent → (N) Tools via agency_agent_tools table
Tool = ID + optional config overrides
Config = base defaults from agency_tools + instance overrides from agency_agent_tools
```

### Execution Methods

| Method | Tools | Where | Timeout |
|--------|-------|-------|---------|
| **HTTP Wrapper** | Most builtin (14) | Python → POST to Node.js `/api/internal/tools/{name}` | 30s |
| **Sandbox Dispatch** | browser, cmd-executor, code-interpreter | Python → OpenSandbox | 60s |
| **Native Async** | builtin-agency-call | Direct Python function (no HTTP) | Configurable |
| **Native Agency-Swarm** | builtin-present-files | Python returns class directly | N/A |

---

## How It Works

### 1. User Perspective (Frontend)

1. Open AgencyBuilder → Select agent → Click "Add Tool"
2. ToolPicker opens: Show all tools (builtin + custom), grouped by type
3. Select tool → If configurable, show form for params (collection ID, webhook URL, etc.)
4. Confirm → Tool assigned to agent with config

### 2. Storage (Database)

```sql
agency_agent_tools:
  agentId = "agent-123"
  toolId = "builtin-web-search"           -- String, not UUID FK
  toolConfig = { collectionId: "col-1" }  -- Instance-specific overrides
```

### 3. Execution (Python)

When agent runs:
1. Orchestrator calls `resolve_tools_for_agent(agent_id)`
2. Load from DB: tool metadata + instance config
3. Merge configs: base defaults + instance overrides
4. Create tool bridge class (agency-swarm BaseTool subclass)
5. Pass to agent
6. Agent calls tool via function calling
7. Tool wrapper routes by risk level:
   - LOW: HTTP call
   - MEDIUM: Check whitelist, then HTTP
   - HIGH: Check whitelist, then Sandbox
8. Response back to agent as string

---

## Key Constraints

### What Tools CAN Do
- ✅ Read (knowledge bases, files, documents)
- ✅ Write (emails, webhooks, Slack)
- ✅ Search (web, documents, skills)
- ✅ Execute (skills, Python code, shell commands)
- ✅ Browse (web automation)
- ✅ Call other agencies (with depth limits)

### What Tools CAN'T Do
- ❌ Call other tools (no composition)
- ❌ Be dynamically selected by agent (all pre-assigned)
- ❌ Have input validation (any JSON passes through)
- ❌ Run long-running jobs (timeouts: 30-60s)
- ❌ Chain multi-step workflows (agent must orchestrate)
- ❌ Be created via UI (DB insert only)

---

## Gaps vs. Full Tool System (agency-swarm BaseTool)

| Feature | SmartSpecPro | agency-swarm | Gap? |
|---------|---|---|---|
| Tool definitions | JSON metadata + HTTP endpoint | Python class with type hints | ❌ No types, no auto-docs |
| Input validation | None (unvalidated JSON) | Pydantic model | ❌ Dangerous |
| Tool registry | Hardcoded list (16) + DB table | Dynamic discovery | ⚠️ Static, limited |
| Function calling | Pre-assigned tools per agent | Agent selects from registry | ❌ No dynamic selection |
| Tool composition | Not supported | Tool A → Tool B registry lookup | ❌ Inefficient |
| Async support | Timeout-only (30-60s) | Native async/await | ❌ No long-running jobs |
| Error handling | Return string to agent | Tool-level retry logic | ⚠️ Agent must handle |

---

## Code Map (30-Second Lookup)

| Layer | File | Key Function | Lines |
|-------|------|------|-------|
| **Frontend UI** | `components/agency/ToolPicker.tsx` | Tool selection UI, 2-step flow | 1-219 |
| **Backend API** | `routers/agency.ts` | `listTools` procedure, tool definitions | 354-631 |
| **Database** | `drizzle/schema.ts` | `agencyTools`, `agencyAgentTools` tables | 4764-4814 |
| **Python Bridge** | `agency_tools.py` | `create_tool_bridge()`, tool execution routing | 156-453 |
| **Orchestrator** | `agency_orchestrator.py` | Tool loading in agent nodes | 268-279 |

---

## Operational Insights

### How Custom Tools Work

1. **Create** (Manual, no UI):
   ```sql
   INSERT INTO agency_tools (id, tenantId, name, toolType, config, riskLevel)
   VALUES ('custom-1', 'tenant-1', 'My API', 'custom', '{}', 'medium');
   ```

2. **Assign** (Can't do in UI yet, must be via database or future API):
   ```sql
   INSERT INTO agency_agent_tools (agentId, toolId, toolConfig)
   VALUES ('agent-1', 'custom-1', '{"endpoint": "https://..."}');
   ```

3. **Execute** (Same as builtin — HTTP POST to endpoint you provide)

### Tool Config Merging

```python
# Base defaults (from agency_tools table)
base = { "maxRetries": 3, "timeout": 30 }

# Instance overrides (from agency_agent_tools.toolConfig)
instance = { "timeout": 60 }

# Merged (instance wins)
merged = { "maxRetries": 3, "timeout": 60 }
```

---

## Top Risks

| Risk | Severity | Why | Mitigation |
|------|----------|-----|------------|
| No input validation | **HIGH** | Any JSON passes to tools; no schema enforcement | Add Zod/JSON Schema validation at Python layer |
| No custom tool UI | **MEDIUM** | Users can't create tools without DB access | Implement `agency.createCustomTool` tRPC procedure |
| SSRF in custom tools | **HIGH** | User-defined custom tool endpoint not validated | Validate all custom tool URLs against blocklist |
| Silent tool failures | **MEDIUM** | HTTP errors returned as strings; agent might misinterpret | Add structured error responses with error codes |
| No audit trail | **LOW** | Can't track who used what tool, when | Add `agency_tool_usage_log` table |

---

## Next Steps (If Extending Tools System)

### Phase 1 (MVP — 2 weeks)
1. Add custom tool creation API (`agency.createCustomTool`)
2. Validate custom tool URLs (SSRF check)
3. Add input schema support for custom tools

### Phase 2 (Intermediate — 4 weeks)
1. Tool composition (tool A can call tool B via registry)
2. Async job support (return job ID, poll for results)
3. Per-tool audit trail

### Phase 3 (Advanced — 6+ weeks)
1. Tool Marketplace (share tools across tenants)
2. Tool versioning & rollback
3. Agent-native dynamic tool selection via function calling

---

## Q&A

**Q: Can an agent choose which tools to use?**
A: No. Tools are pre-assigned per agent at agency creation time. Agent gets fixed list and can call any of them via function calling, but can't choose to add/remove tools at runtime.

**Q: Can tools call other tools?**
A: No. Tools are atomic; they can't invoke other tools directly. To chain tools, the agent must call tool A, interpret result, then call tool B.

**Q: How are tools discovered?**
A: Tools are hardcoded in Node.js (16 builtin) or read from `agency_tools` table (custom). When an agent is created, tools are assigned explicitly. There's no dynamic discovery at runtime.

**Q: Can I create a tool that calls an external API with auth headers?**
A: Yes, via `builtin-http-request`. You provide URL, method, headers, and the tool makes the HTTP call. Or create a custom tool by inserting into `agency_tools` and pointing it to your endpoint.

**Q: What happens if a tool times out?**
A: Tool wrapper returns error string to agent. Agent can retry (if it decides to), but there's no automatic retry at tool level.

---

## Files to Read (In Order)

1. **Overview:** This file
2. **Comprehensive:** `AGENCY-TOOLS-SYSTEM-RESEARCH.md`
3. **Quick Lookup:** `AGENCY-TOOLS-QUICK-REF.md`

---

## Related Areas

- **Agency Creator:** Auto-generates agencies using LLM; assigns tools during design phase
- **Agency Orchestrator:** Graph-walking engine; loads tools per agent via `resolve_tools_for_agent()`
- **Skill System:** Tools can execute skills via `builtin-skill-executor`
- **API Gateway:** Internal endpoints (`/api/internal/tools/{name}`) serve tool logic in Node.js
