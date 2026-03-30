---
name: MCP Server Integration in Agency Builder — Current State
description: Research on how MCP servers are integrated (or not) into the Agency Builder left panel and tool selection system
type: project
---

# MCP Server Integration in Agency Builder — Current State Analysis

**Date:** 2026-03-24
**Status:** RESEARCH COMPLETE — All 6 integration points identified

## Executive Summary

MCP servers are **partially integrated** into the Agency Builder:
- **Configured at agent level** (per-agent MCP server URLs + tokens)
- **Not visible in the left panel** (no "MCP Tools" section in AgencySidebar)
- **Discovered but not auto-added to tool picker** (tools must be manually added via ToolPicker)
- **Design gap:** Users configure MCP servers but cannot see discovered tools in the agent's available tools list

---

## Question 1: What does the left panel currently show?

**File:** `apps/web/client/src/components/agency/AgencySidebar.tsx` (391 lines)

### Current left panel structure (lines 223-389):

**Three tabs:**
1. **Nodes Tab** (default) — Lines 246-303
   - 7 node type sections (AI Agents, Flow Control, Data & Skills, Human in the Loop, Resilience)
   - Draggable node templates (agent, supervisor, router, aggregator, etc.)
   - No MCP server section

2. **Templates Tab** — Lines 305-359
   - Pre-configured agent templates (grouped by category)
   - Draggable onto canvas

3. **Guardrails Tab** — Lines 361-369
   - Agency-level guardrails management (requires agency save)

### Bottom shortcut — Lines 372-383:
- **"Create Custom Tool"** button that opens `CustomToolCreator` modal

### **Missing:** No MCP server panel in the left sidebar. MCP configuration is per-agent, not global.

---

## Question 2: Is there already an MCP server listing/management UI?

**Files:**
- `apps/web/client/src/components/agency/McpServersPanel.tsx` (291 lines)
- `apps/web/client/src/components/agency/NodePropertyPanel.tsx` (handles agent/supervisor tabs)

### Current MCP UI (McpServersPanel):

**Location:** Per-agent, in the agent's property panel (right sidebar)
- Appears only for `agent` and `supervisor` node types (lines 923-950 in NodePropertyPanel)
- Collapsible section titled "MCP Servers"

**Features:**
- Add MCP server URL + optional name + optional bearer token
- List connected servers (up to 5 per agent, line 41)
- Discover tools from server (calls `discoverMcpTools` endpoint, line 104)
- Expanded tools list (collapsible per server, lines 194-222)
- Save MCP configuration button (lines 273-287)

**Design:** This is separate from the tool picker. Tools are **discovered but not auto-added** to the agent's tools list.

---

## Question 3: How are tools currently listed?

**File:** `apps/web/server/routers/agency.ts` (lines 496-816)

### `listTools` endpoint (lines 496-816):

**Structure:**
```
Combined tool list = Built-in tools + Custom DB tools
```

**Built-in tools (lines 508-790):**
- 12+ hardcoded tools (web-search, code-interpreter, file-reader/writer, rag-knowledge, skill-executor, cmd-executor, http-request, etc.)
- All marked `toolType: "builtin"`
- No MCP tools

**Custom tools (lines 793-810):**
```sql
SELECT * FROM agencyTools
WHERE tenantId = X
  AND (toolType = "http_api" OR "openapi_import" OR "mcp_bridge")
```
- Retrieved from database
- Marked with their actual `toolType` (including "mcp_bridge" if applicable)
- Include `isEnabled` flag, `riskLevel`, `description`

**Return:** Combined array, sorted by type, with "builtin" vs "custom" labels (ToolPicker.tsx lines 33-41)

### Key observation:
- **MCP tools are queried from `agencyTools` table if they were pre-created as `toolType: "mcp_bridge"`**
- **But discovered tools from MCP servers are NOT automatically stored in `agencyTools`**
- **The discovery is ephemeral** — tools are discovered at UI time but not persisted or listed in the main tool picker

---

## Question 4: Is there a tRPC endpoint to list MCP servers/tools?

**Files:** `apps/web/server/routers/agency.ts` (lines 4300-4426)

### Two MCP endpoints:

1. **`saveMcpServers`** (lines 4306-4381) — Mutation
   - Input: `agentId`, array of `{ url, name, transport }`, optional `tokens` dict
   - Stores MCP server config + encrypted tokens on agent via `agencyAgents.mcpServers` and `agencyAgents.mcpServerTokensEncrypted`
   - Feature flag: `agencyMcpBridge` (line 4324)
   - SSRF validation for each URL (line 4334)
   - Token encryption via `encryptMcpTokens()` (line 4346)

2. **`discoverMcpTools`** (lines 4383-4426) — Query
   - Input: `serverUrl`, optional `token`
   - Returns: `{ tools: McpToolDef[] }`
   - Calls `discoverToolsFromServer()` from `agencyMcpService.ts`
   - Timeout: 10 seconds (line 4417)
   - Feature flag: `agencyMcpBridge` (line 4396)

### Service layer (agencyMcpService.ts, lines 131-183):

```typescript
export async function discoverToolsFromServer(
  serverUrl: string,
  token?: string,
  timeoutMs = 10_000,
): Promise<McpToolDef[]>
```

- Makes JSON-RPC POST to `${serverUrl}/rpc` with method `tools/list`
- Returns array of `{ name, description, inputSchema }`

---

## Question 5: What's the current state of MCP integration from spec 057?

**Status:** **Section-14 completed**, MCP endpoints are live

**Implementation files:**
- `apps/web/server/routers/agency.ts` — tRPC endpoints (lines 4304-4426)
- `apps/web/server/services/agencyMcpService.ts` — Discovery, encryption, validation
- `apps/web/client/src/components/agency/McpServersPanel.tsx` — UI for adding servers
- `apps/web/client/src/components/agency/NodePropertyPanel.tsx` — Integration point (lines 922-950)
- Schema: `agencyAgents.mcpServers` and `agencyAgents.mcpServerTokensEncrypted` (schema.ts lines 4980-4981)

**Feature flag:** `agencyMcpBridge` (must be enabled per tenant)

---

## Question 6: What files would need to change to show MCP tools in the left panel?

### Gap: MCP tools are discovered but **NOT visible in the main tool picker**

**Current user flow:**
1. Create agent
2. Open MCP Servers section (right panel, agent properties)
3. Add MCP server URL
4. Click "Discover" button → tools listed in collapsed section
5. **Problem:** Tools are visible there but NOT added to agent's tools list

**Needed changes for "MCP Tools in left panel":**

There are **two possible interpretations**:

### Option A: Show MCP tools in the left sidebar (separate section)

Files to change:
- `AgencySidebar.tsx` (lines 20-135) — Add new section `{ label: "MCP Tools", items: [] }`
- Requires real-time discovery from all agents' MCP servers (complex, N+1 queries)
- **Not recommended** — MCP tools are per-agent, not global

### Option B: Auto-add discovered MCP tools to ToolPicker (recommended)

**Current flow:**
1. Discover tools from MCP server
2. Manually navigate to `ToolPicker` (embedded in NodePropertyPanel)
3. Select tool from list

**Improved flow:**
1. Discover tools from MCP server
2. Click "Add to agent" button in McpServersPanel
3. Tools automatically appear in agent's tools list

**Files to change:**
1. **McpServersPanel.tsx** (lines 193-222)
   - Add "Add Tool" button next to each discovered tool
   - Call mutation to save tool assignment

2. **NodePropertyPanel.tsx** (lines 922-950)
   - Pass callback `onAddMcpTool` to McpServersPanel
   - Wire into tools list update

3. **agencyAgentTools table** — Already supports `mcp_bridge` type (schema.ts line 5107)
   - Store mapping: agentId → toolId → toolConfig

4. **ToolPicker.tsx** (lines 92-128)
   - Already filters by `toolType` in TYPE_LABELS (line 40: `mcp_bridge: "MCP"`)
   - Should already show MCP tools if they're in `agencyTools` table

---

## Current Schema State

### Database tables:

1. **agencyAgents** (schema.ts lines 4867-4988)
   - `mcpServers`: jsonb array of `{ url, name?, transport? }`
   - `mcpServerTokensEncrypted`: text (encrypted token map)

2. **agencyTools** (schema.ts lines 5049-5090)
   - `toolType`: varchar — supports `"mcp_bridge"` (queried in listTools line 3685)
   - `name`, `description`, `icon`, `category`, `riskLevel`, `requiresApproval`

3. **agencyAgentTools** (schema.ts lines 5107-5131)
   - `agentId` + `toolId` junction
   - `toolConfig`: json for per-agent configuration

---

## Key Findings

| Question | Answer | Status |
|----------|--------|--------|
| **Left panel shows?** | Nodes (7 types), Templates, Guardrails | Complete |
| **MCP UI exists?** | Yes, per-agent in right panel (McpServersPanel) | Partial (UI only) |
| **Tools listed where?** | `ToolPicker` (builtin + DB custom tools) | Complete |
| **MCP endpoint exists?** | Yes, `discoverMcpTools` + `saveMcpServers` | Complete |
| **Spec 057 state?** | Section-14 complete (discovery + storage) | Done |
| **Gap: MCP tools in picker?** | Tools discovered but NOT auto-listed | **Open** |

---

## Recommendations

1. **Low effort:** Add "Add Tool" button in McpServersPanel to quickly assign discovered tools to agent
2. **Medium effort:** Show MCP tools already assigned to agent in a dedicated section of ToolPicker
3. **High effort:** Real-time MCP discovery in left sidebar (not recommended — MCP is per-agent)

**Recommended next step:** Add quick "Add Tool" UX in McpServersPanel so discovered tools are auto-added to agent's tools list via `agencyAgentTools` table.
