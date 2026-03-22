---
name: Agency-Swarm v1.6-1.8 Integration Status
description: Complete audit of which agency-swarm v1.6-1.8 features are wired up vs missing in SmartSpecPro
type: project
---

# Agency-Swarm v1.6-1.8 Integration Status Report

**Date**: 2026-03-13
**Status**: RESEARCH COMPLETE
**Finding**: 7 of 16 features fully wired; 8 features NOT wired; 1 feature partially wired

---

## Executive Summary

The SmartSpecPro integration with agency-swarm v1.8.0 has robust coverage of **agent metadata and streaming** features, but is missing:
1. Per-agent guardrails (input/output validation)
2. Per-agent MCP servers and hooks
3. Run-time recipient_agent targeting, file_ids, and additional_instructions
4. Shared resources (shared_tools, shared_files_folder, shared_mcp_servers)
5. Persona_prefix persistence across storage

### Impact Assessment
- **HIGH PRIORITY**: Recipient_agent + file_ids + additional_instructions (required for multi-target agent delegation)
- **MEDIUM PRIORITY**: Guardrails, MCP servers (advanced agent control features)
- **LOW PRIORITY**: Shared resources (less common use case; exists in adapter but not passed from DB)

---

## Feature-by-Feature Integration Status

### 1. Agent Description
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ✅ | `agencyAgents.description` (text column) exists |
| **Node Config Storage** | ✅ | Read from DB via `agent_data["description"]` |
| **Adapter Integration** | ✅ | Passed to `AgentConfig.description` in agency_service.py:640, 889, 1409 |
| **UI Control** | ✅ | `NodePropertyPanel.tsx` displays description field |
| **API Exposure** | ✅ | Included in FastAPI responses and tRPC |

**Implementation Path**:
```
DB (agencyAgents.description) → agency_service.py (agent_data["description"])
  → AgentConfig(description=...) → adapter.create_agent()
```

---

### 2. Output Type (Structured Output)
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ✅ | Stored in `agencyAgents.nodeConfig.outputType` (JSON) |
| **Node Config Storage** | ✅ | Read via `node_config.get("outputType")` |
| **Adapter Integration** | ✅ | Passed to `AgentConfig.output_type` in agency_service.py:648, 897 |
| **UI Control** | ⚠️ | Unknown if editable in UI (not found in grep) |
| **API Exposure** | ✅ | Accepted in AgencyRunRequest but not validated |

**Call Sites**:
- `python-backend/app/services/agency_service.py:648` (non-streaming run)
- `python-backend/app/services/agency_service.py:897` (streaming run)

---

### 3. Files Folder
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ✅ | Stored in `agencyAgents.nodeConfig.filesFolder` (JSON) |
| **Node Config Storage** | ✅ | Read via `node_config.get("filesFolder")` |
| **Adapter Integration** | ✅ | Passed to `AgentConfig.files_folder` in agency_service.py:649, 898 |
| **UI Control** | ❌ | NOT found in UI components |
| **API Exposure** | ✅ | Accepted in AgencyRunRequest |

**Note**: Backend is ready; frontend UI needs implementation.

---

### 4. Conversation Starters
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ✅ | Stored in `agencyAgents.nodeConfig.conversationStarters` (JSON) |
| **Node Config Storage** | ✅ | Read via `node_config.get("conversationStarters")` |
| **Adapter Integration** | ✅ | Passed to `AgentConfig.conversation_starters` in agency_service.py:646, 895, 1403-1414 |
| **UI Control** | ⚠️ | Unknown if editable in UI |
| **API Exposure** | ✅ | Used in agency metadata endpoint (line 1414) |

**Call Sites**:
- `agency_service.py:646` (non-streaming)
- `agency_service.py:895` (streaming)
- `agency_service.py:1403-1414` (metadata with graph generation)

---

### 5. Quick Replies
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ✅ | Stored in `agencyAgents.nodeConfig.quickReplies` (JSON) |
| **Node Config Storage** | ✅ | Read via `node_config.get("quickReplies")` |
| **Adapter Integration** | ✅ | Passed to `AgentConfig.quick_replies` in agency_service.py:647, 896, 1404-1415 |
| **UI Control** | ⚠️ | Unknown if editable in UI |
| **API Exposure** | ✅ | Used in agency metadata endpoint |

---

### 6. Tool Use Behavior
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ✅ | Stored in `agencyAgents.nodeConfig.toolUseBehavior` (JSON) |
| **Node Config Storage** | ✅ | Read via `node_config.get("toolUseBehavior")` |
| **Adapter Integration** | ✅ | Passed to `AgentConfig.tool_use_behavior` in agency_service.py:650, 899 |
| **UI Control** | ❌ | NOT found in UI |
| **API Exposure** | ✅ | Accepted in request |

---

### 7. Validation Attempts
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ✅ | Stored in `agencyAgents.nodeConfig.validationAttempts` (JSON) |
| **Node Config Storage** | ✅ | Read via `node_config.get("validationAttempts", 1)` with default fallback |
| **Adapter Integration** | ✅ | Passed to `AgentConfig.validation_attempts` in agency_service.py:651, 900 |
| **UI Control** | ❌ | NOT found in UI |
| **API Exposure** | ✅ | Accepted in request |

---

### 8. Input Guardrails
**Status**: ❌ **NOT WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ❌ | NOT in `agencyAgents` table or `nodeConfig` |
| **Node Config Storage** | ❌ | Not extracted from agent data |
| **Adapter Integration** | ❌ | `AgentConfig.input_guardrails` exists but never populated |
| **UI Control** | ❌ | No UI form for guardrails |
| **API Exposure** | ❌ | Not in request/response models |

**What's needed**:
1. Add `inputGuardrails` to `agencyAgents.nodeConfig` JSON schema (frontend)
2. Extract via `node_config.get("inputGuardrails")` in agency_service.py (Python backend)
3. Pass to `AgentConfig(input_guardrails=...)` in all three call sites (lines 637, 886, 1406)
4. Add UI form fields in `NodePropertyPanel.tsx` (frontend)

**Estimated Effort**: 3-4 hours

---

### 9. Output Guardrails
**Status**: ❌ **NOT WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ❌ | NOT in schema |
| **Node Config Storage** | ❌ | Not extracted |
| **Adapter Integration** | ❌ | `AgentConfig.output_guardrails` exists but never populated |
| **UI Control** | ❌ | No UI form |
| **API Exposure** | ❌ | Not in request/response models |

**Implementation**: Same as input guardrails (coupled change).

---

### 10. Per-Agent MCP Servers
**Status**: ❌ **NOT WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ❌ | NOT in schema |
| **Node Config Storage** | ❌ | Not extracted from `nodeConfig` |
| **Adapter Integration** | ❌ | `AgentConfig.mcp_servers` and `mcp_config` exist but never populated |
| **UI Control** | ❌ | No UI form |
| **API Exposure** | ❌ | Not exposed |

**Notes**:
- Adapter has full support (agency_swarm_adapter.py:89-91, 248-252)
- Would require MCP server registry in database
- Lower priority than other features

**Estimated Effort**: 6-8 hours (complex: requires MCP config schema, server management)

---

### 11. Agent Hooks (Lifecycle Callbacks)
**Status**: ❌ **NOT WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ❌ | NOT in schema |
| **Node Config Storage** | ❌ | Not extracted |
| **Adapter Integration** | ❌ | `AgentConfig.hooks` exists but never populated |
| **UI Control** | ❌ | No UI form |
| **API Exposure** | ❌ | Not exposed |

**Notes**:
- Adapter ready (agency_swarm_adapter.py:92-93, 254-256)
- Low priority: advanced lifecycle management feature

---

### 12. Recipient Agent (Run-Time Targeting)
**Status**: ❌ **NOT WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ❌ | Not needed (run-time param) |
| **Request Modeling** | ❌ | NOT in `AgencyRunRequest` |
| **Adapter Integration** | ✅ | `adapter.run(recipient_agent=...)` parameter exists |
| **FastAPI Endpoint** | ⚠️ | Endpoint accepts it but doesn't pass to adapter |
| **UI Control** | ❌ | No way to specify target agent in frontend |

**Current Flow**:
```
❌ AgencyRunRequest.recipient_agent → (not extracted) → adapter.run()
```

**What's needed**:
1. Add `recipient_agent: Optional[str]` field to `AgencyRunRequest` in apis/agencies.py
2. Extract in `run_agency()` and `stream_agency()` endpoints
3. Pass to `service.execute_run(recipient_agent=...)` in agency_service.py
4. Forward to `adapter.run(recipient_agent=recipient_agent)` at line 683 and in `run_stream()`

**Estimated Effort**: 2-3 hours

---

### 13. File IDs (Run-Time Files)
**Status**: ❌ **NOT WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ❌ | Not needed (run-time param) |
| **Request Modeling** | ❌ | NOT in `AgencyRunRequest` |
| **Adapter Integration** | ✅ | `adapter.run(file_ids=...)` and `run_stream(file_ids=...)` exist |
| **FastAPI Endpoint** | ❌ | Not accepted in request |
| **UI Control** | ❌ | No way to attach files in AgencyChat UI |

**Current Flow**:
```
❌ AgencyRunRequest.file_ids → (not extracted) → adapter.run()
```

**What's needed**:
1. Add `file_ids: Optional[List[str]]` to `AgencyRunRequest` in apis/agencies.py
2. Validate file_ids reference tenant-accessible documents
3. Extract in endpoints and pass to service
4. Forward to adapter at lines 683, 924 in agency_service.py

**Estimated Effort**: 2-3 hours

---

### 14. Additional Instructions (Run-Time Override)
**Status**: ❌ **NOT WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Database Field** | ❌ | Not needed (run-time param) |
| **Request Modeling** | ❌ | NOT in `AgencyRunRequest` |
| **Adapter Integration** | ✅ | `adapter.run(additional_instructions=...)` exists |
| **FastAPI Endpoint** | ❌ | Not accepted |
| **UI Control** | ❌ | No UI field |

**Current Flow**:
```
❌ AgencyRunRequest.additional_instructions → (not extracted) → adapter.run()
```

**Implementation**: Same pattern as recipient_agent and file_ids.

**Estimated Effort**: 1-2 hours

---

### 15. Stream Cancellation (v1.6)
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Adapter Method** | ✅ | `adapter.cancel_stream(stream, mode=...)` implemented (agency_swarm_adapter.py:666-679) |
| **Service Integration** | ✅ | Called at agency_service.py:1336 in `cancel_run()` |
| **API Endpoint** | ✅ | FastAPI endpoint `POST /{agency_id}/cancel` at agencies.py:422+ |
| **Request Model** | ✅ | `AgencyCancelRequest` with mode validation (immediate/after_turn) |
| **Registry Tracking** | ✅ | `_active_streams` dict maintains stream lifecycle (agency_service.py:39-42) |

**Call Chain**:
```
POST /cancel → cancel_run() → _active_streams.get(run_id)
  → adapter.cancel_stream(stream, mode=mode)
```

---

### 16. Usage Tracking & Extract Stream Usage (v1.6)
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Per-Model Breakdown** | ✅ | `UsageBreakdown` model exists (adapter + APIs) |
| **Streaming Usage** | ✅ | `adapter.extract_stream_usage()` called at agency_service.py:1020 |
| **Response Serialization** | ✅ | Usage included in `AgencyRunResponse` (apis/agencies.py:108-112) |
| **Non-Streaming Usage** | ✅ | `adapter._extract_usage()` used in non-streaming path (line 550) |
| **Credits Reconciliation** | ✅ | Multiplier markup applied (line 1041) |

**Call Chain**:
```
stream.final_result → adapter.extract_stream_usage()
  → (total_tokens, pt, ct, step_count, breakdown)
  → UsageBreakdownResponse[] → AgencyRunResponse
```

---

### 17. PresentFiles Built-In Tool (v1.8)
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Adapter Support** | ✅ | `adapter.get_present_files_tool()` returns `PresentFiles` class (agency_swarm_adapter.py:697-708) |
| **Tool Registry** | ✅ | Listed in `_NATIVE_SWARM_TOOL_IDS` (agency_tools.py:99-100) |
| **Risk Classification** | ✅ | "builtin-present-files" marked as "low" risk (agency_tools.py:95) |
| **HTTP Endpoint** | ✅ | No endpoint needed (native agency-swarm tool) |
| **Tool Bridge** | ✅ | Handled natively by adapter, not via HTTP bridge |

**Note**: This is a native agency-swarm tool, not bridged through HTTP. It's available for agents to use directly.

---

### 18. Shared Resources (v1.7) — Shared Tools, Files, MCP Servers
**Status**: ⚠️ **PARTIALLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Adapter Support** | ✅ | `AgencyConfig.shared_tools`, `shared_files_folder`, `shared_mcp_servers` all supported (adapter.py:112-114, 338-344) |
| **Database Fields** | ❌ | NOT in `agencies` table schema |
| **Service Integration** | ❌ | Never extracted from database or passed to adapter |
| **API Exposure** | ❌ | Not in request/response models |
| **UI Control** | ❌ | No UI form for shared resources |

**Current State**:
- Adapter is **ready and willing** to accept shared resources
- Database has **no fields** to store them
- Service **never populates** them

**What's needed**:
1. Add fields to `agencies` table:
   - `sharedToolIds` (JSON array of tool IDs)
   - `sharedFilesFolder` (text path)
   - `sharedMcpServers` (JSON config)
2. Extract in agency_service.py when loading agency config
3. Build shared_tools list from tool registry
4. Pass to `adapter.create_agency(shared_tools=..., shared_files_folder=..., shared_mcp_servers=...)`
5. Add UI controls for managing shared resources

**Estimated Effort**: 4-6 hours

---

### 19. Agency Graph & Metadata API (v1.7)
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Adapter Methods** | ✅ | `adapter.get_agency_graph()` and `adapter.get_agency_metadata()` (agency_swarm_adapter.py:681-695) |
| **Service Integration** | ✅ | Called in `get_agency_metadata()` at agency_service.py:1440 |
| **API Endpoint** | ✅ | `GET /{agency_id}/metadata` at agencies.py:481+ |
| **Response Model** | ✅ | `AgencyMetadataResponse` with graph inclusion option |
| **Tool Discovery** | ✅ | Graph includes tool schemas when `include_tools=True` |

---

### 20. Create Tool Class Utility (v1.8)
**Status**: ✅ **FULLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Adapter Method** | ✅ | `adapter.create_tool_class(tool_name, description, run_func)` (agency_swarm_adapter.py:710-747) |
| **Usage** | ✅ | Used by agency_tools.py to bridge custom tools to agency-swarm |
| **Version Isolation** | ✅ | All agency-swarm imports isolated in adapter |

**Note**: Utility for creating dynamic tool classes. Already integrated.

---

### 21. Persona Prefix (Run-Config)
**Status**: ⚠️ **PARTIALLY WIRED**

| Component | Status | Details |
|-----------|--------|---------|
| **Request Modeling** | ✅ | `AgencyRunRequest.persona_prefix` exists (apis/agencies.py:64-66, 75-84) |
| **Sanitization** | ✅ | Blocked patterns checked via `safe_persona_prefix` property |
| **Adapter Integration** | ✅ | Passed to `adapter.create_agent(run_config={"persona_prefix": ...})` (agency_service.py:903) |
| **Agent Prepending** | ✅ | Prepended to agent instructions in adapter (agency_swarm_adapter.py:202-204) |
| **Persistence** | ❌ | NOT preserved in conversation storage |
| **Non-Streaming Path** | ❌ | NOT passed to run() in non-streaming execute_run() |

**Current State**:
- Streaming run (line 903): ✅ persona_prefix passed via run_config
- Non-streaming run (line 637): ❌ run_config not used; persona_prefix not applied

**What's needed**:
1. Extract persona_prefix from request in `execute_run()`
2. Build run_config dict with persona_prefix
3. Pass run_config to `adapter.create_agent()` at line 653 (currently only in streaming path)

**Estimated Effort**: 1-2 hours

---

## Summary Table

| Feature | Status | Call Sites | Priority |
|---------|--------|-----------|----------|
| Agent description | ✅ WIRED | service.py:640, 889, 1409 | — |
| Output type | ✅ WIRED | service.py:648, 897 | — |
| Files folder | ✅ WIRED | service.py:649, 898 | — |
| Conversation starters | ✅ WIRED | service.py:646, 895, 1414 | — |
| Quick replies | ✅ WIRED | service.py:647, 896, 1415 | — |
| Tool use behavior | ✅ WIRED | service.py:650, 899 | — |
| Validation attempts | ✅ WIRED | service.py:651, 900 | — |
| Input guardrails | ❌ NOT WIRED | — | MEDIUM |
| Output guardrails | ❌ NOT WIRED | — | MEDIUM |
| Per-agent MCP servers | ❌ NOT WIRED | — | LOW |
| Agent hooks | ❌ NOT WIRED | — | LOW |
| Recipient agent | ❌ NOT WIRED | — | HIGH |
| File IDs | ❌ NOT WIRED | — | HIGH |
| Additional instructions | ❌ NOT WIRED | — | HIGH |
| Stream cancellation | ✅ WIRED | service.py:1336 | — |
| Usage tracking | ✅ WIRED | service.py:1020 | — |
| PresentFiles tool | ✅ WIRED | tools.py:99-100 | — |
| Shared resources | ⚠️ PARTIAL | adapter.py:112-114 | MEDIUM |
| Agency graph API | ✅ WIRED | service.py:1440 | — |
| Create tool class | ✅ WIRED | tools.py | — |
| Persona prefix | ⚠️ PARTIAL | service.py:903 (streaming only) | LOW |

---

## Critical Path for Missing Features

### Phase 1: Run-Time Targeting & Files (HIGH PRIORITY — 5-7 hours)
1. Add `recipient_agent`, `file_ids`, `additional_instructions` to `AgencyRunRequest`
2. Extract in `run_agency()` and `stream_agency()` endpoints
3. Pass through to `service.execute_run()` and `service.execute_run_stream()`
4. Forward to `adapter.run()` and `adapter.run_stream()` calls
5. Add validation for file_ids (tenant access checks)

### Phase 2: Guardrails (MEDIUM PRIORITY — 4-6 hours)
1. Add `inputGuardrails` and `outputGuardrails` to `agencyAgents.nodeConfig`
2. Extract from nodeConfig in agency_service.py
3. Pass to `AgentConfig()` in all call sites (3 places)
4. Add UI form controls in `NodePropertyPanel.tsx`

### Phase 3: Shared Resources (MEDIUM PRIORITY — 4-6 hours)
1. Add schema fields to `agencies` table
2. Extract in `AgencyService.load_agency_config()`
3. Build shared_tools list from tool registry
4. Pass to `adapter.create_agency()`
5. Add UI controls for shared resource management

### Phase 4: Advanced Features (LOW PRIORITY)
- Per-agent MCP servers (6-8 hours)
- Agent hooks (2-3 hours)
- Persona prefix non-streaming path (1-2 hours)

---

## Files That Need Changes

| File | Change Type | Effort |
|------|-------------|--------|
| `python-backend/app/api/agencies.py` | Add request fields, pass through | 2-3h |
| `python-backend/app/services/agency_service.py` | Extract new params, forward to adapter | 3-4h |
| `apps/web/drizzle/schema.ts` | Add nodeConfig fields (guardrails) + agencies fields (shared_*) | 1-2h |
| `apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Add UI forms | 3-4h |
| `apps/web/server/routers/agency.ts` | Schema validation for new fields | 1h |

---

## Key Code Locations

**Adapter Definition**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_swarm_adapter.py`
- Lines 66-93: AgentConfig definition
- Lines 96-114: AgencyConfig definition
- Lines 181-277: create_agent() method
- Lines 279-360: create_agency() method

**Service Integration**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py`
- Lines 637-654: Non-streaming AgentConfig construction
- Lines 886-904: Streaming AgentConfig construction
- Lines 1406-1418: Metadata AgentConfig construction
- Lines 683: adapter.run() call (needs recipient_agent, file_ids, additional_instructions)
- Lines 922-927: adapter.run_stream() call (same params needed)

**FastAPI Endpoints**: `/home/dev/projects/SmartSpecPro/python-backend/app/api/agencies.py`
- Lines 54-73: AgencyRunRequest model (add new optional fields here)
- Lines 286-349: run_agency() endpoint
- Lines 351-406: stream_agency() endpoint

---

## Recommendations

1. **DO FIRST**: Implement recipient_agent, file_ids, additional_instructions (HIGH priority, enables delegation use cases)
2. **DO SECOND**: Implement guardrails (MEDIUM, common feature)
3. **DO THIRD**: Implement shared resources (MEDIUM, useful for multi-agent setups)
4. **DO LAST**: Per-agent MCP servers and hooks (LOW, advanced features)

**Quick Win**: Persona prefix non-streaming path (1-2 hours, closes gap in current partial implementation)

