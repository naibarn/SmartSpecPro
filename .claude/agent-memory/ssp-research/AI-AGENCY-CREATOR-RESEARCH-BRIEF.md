---
name: AI Agency Creator Research Brief
description: Complete architectural analysis and implementation guide for the AI Agency Creator feature
type: reference
---

# Research Brief: AI Agency Creator

## Findings

### What Exists

SmartSpecPro has a fully-functional **AI Agency Creator** — an end-to-end system that transforms a user's text requirement into a multi-agent swarm on the ReactFlow canvas. The feature spans:

1. **Frontend Modal** (`AutoCreateAgencyModal.tsx`) — 448 lines, handles user input, phase display, interview questions, polling
2. **tRPC Bridge** (`agency.ts` routers) — 3 procedures: autoCreate, autoCreateStatus, autoCreateAnswer
3. **Python Backend** (2 Celery tasks + FastAPI endpoints) — Orchestrates 7-phase pipeline with LLM integration
4. **Canvas Hydration** (`AgencyBuilder.tsx`) — Loads and renders the created agency with nodes, edges, and tools

The system is production-ready but has no public documentation, making it difficult to understand or extend.

### Architecture

```
User Types Requirement
         │
         ▼
 AutoCreateAgencyModal
    (client-side)
         │
         ├─ Validates input (10-10k chars, optional file)
         ├─ Calls tRPC autoCreate mutation
         ├─ Gets task_id, starts polling
         └─ Updates phase bar every 2.5s
         │
         ▼
 tRPC autoCreate Mutation
    (Node.js bridge)
         │
         └─ POST to Python /api/v1/agency-creator/start
         │
         ▼
 Python FastAPI
    (HTTP gateway)
         │
         ├─ Create task_id: "agcreate-{12-hex}"
         ├─ Store initial status in Redis
         └─ Enqueue Celery Task 1 (discover)
         │
         ▼
 Celery Task 1: DISCOVER + INTERVIEW
    (async, pauseable)
         │
         ├─ Phase 1: LLM analyzes requirement
         │   → is_clear? domain? estimated_agents?
         │
         ├─ Phase 2: Decide if interview needed
         │   ├─ If YES → store questions in Redis, return to frontend
         │   │           Frontend shows interview form
         │   │           User submits answers via autoCreateAnswer
         │   │
         │   └─ If NO → enqueue Task 2 immediately
         │
         └─ Loop: Frontend polls autoCreateStatus every 2.5s
         │
         ▼
[User fills interview form]
         │
         ▼
 tRPC autoCreateAnswer Mutation
    (Node.js bridge)
         │
         └─ POST to Python /api/v1/agency-creator/answer
         │
         ▼
 Python FastAPI /answer
         │
         ├─ Validate task exists, status is "awaiting_answers"
         ├─ Store answers in Redis: key = "agency-creator:{task_id}:ans"
         └─ Enqueue Celery Task 2 (design)
         │
         ▼
 Celery Task 2: DESIGN → DOCUMENT
    (5 phases, 30-60s total)
         │
         ├─ Phase 3: LLM designs agency spec
         │   Output: JSON with nodes (agents), edges (flows), toolIds
         │
         ├─ Phase 4: Validate spec (self-review)
         │   Ensure: 1 entry point, valid node refs, router configs, tool whitelist
         │
         ├─ Phase 5: Call internal API /api/internal/agency/create
         │   Creates agency + agents + tools + flows in database
         │   Returns agencyId
         │
         ├─ Phase 6: Verify (database check)
         │
         └─ Phase 7: LLM generates usage guide
         │
         └─ Update Redis: status="completed", agencyId=..., guide=...
         │
         ▼
 Frontend Polling Sees Completion
         │
         ├─ Stop polling
         ├─ Show success toast
         ├─ Call onCreated(agencyId) callback
         └─ Navigate to /agencies/{agencyId}/edit
         │
         ▼
 AgencyBuilder Canvas Loads
         │
         ├─ Fetch agency via tRPC getById
         ├─ Convert agents to ReactFlow nodes
         ├─ Convert flows to edges
         ├─ Apply auto-layout if all nodes same position
         └─ Render canvas with all UI controls
```

### Data Structures

**Task Status in Redis** (key: `agency-creator:{task_id}`)
```json
{
  "status": "queued|processing|awaiting_answers|completed|failed",
  "phase": "discover|interview|design|validate|implement|verify|document|done",
  "message": "Human-readable status",
  "_user_id": 123,
  "questions": [{"id": "q1", "question": "?", "type": "text"}],  // Phase 2
  "previewJson": {node/edge spec},                                // Phase 3+
  "agencyId": "uuid",                                              // Phase 5+
  "guide": "usage guide text",                                     // Phase 7
  "error": "error message"                                         // On failure
}
```

**Agency Spec from LLM** (DESIGN phase output)
```json
{
  "name": "Agency Name",
  "description": "...",
  "nodes": [
    {
      "id": "node-1",
      "nodeType": "agent|supervisor|router|aggregator|knowledge_base|skill_call|human_approval",
      "name": "Agent Name",
      "instructions": "Detailed instructions",
      "model": "gpt-4o",
      "isEntryPoint": true,
      "toolIds": ["builtin-web-search", "builtin-code-interpreter"],
      "nodeConfig": {...}
    }
  ],
  "edges": [
    {
      "fromNodeId": "node-1",
      "toNodeId": "node-2",
      "flowType": "delegation|handoff|parallel"
    }
  ],
  "rationale": "Design decisions"
}
```

### Key Technologies

| Component | Tech | Why |
|-----------|------|-----|
| Frontend modal | React + TypeScript | tRPC + TanStack Query + Sonner toast |
| Polling | setInterval (2.5s) | Simple, works for ~5 min operations |
| Status store | Redis | Fast ephemeral storage, 2h TTL, no DB round-trips |
| Task queue | Celery (Python) | Async background work, soft/hard timeouts |
| Spec generation | LLM (gpt-4o) | Structured JSON outputs, self-review validation |
| DB creation | Internal Node.js API | Cleaner separation (Python spec, Node.js DB) |
| Canvas render | ReactFlow | Node/edge management, auto-layout |

### 7-Phase Pipeline

| Phase | Duration | Input | Output | Decision |
|-------|----------|-------|--------|----------|
| DISCOVER | 5-10s | Requirement | intent dict (is_clear, domain, questions) | Skip interview? |
| INTERVIEW | User-driven | Questions | Answers | (Pause here) |
| DESIGN | 15-30s | Requirement + intent + answers | Agency spec (nodes, edges, tools) | Spec valid? |
| VALIDATE | <1s | Spec | Spec (fixed: entry point, tool whitelist) | Config valid? |
| IMPLEMENT | 2-5s | Spec | agencyId from internal API | DB create OK? |
| VERIFY | <1s | agencyId | (health check) | Ready? |
| DOCUMENT | 5-10s | Spec | Usage guide text (300 words) | Done. |

**Total typical time**: 30-90 seconds (bottleneck: DESIGN + DOCUMENT LLM calls)

### Validation Logic (Phase 4)

The system self-reviews the LLM spec before database creation:

1. **Entry Point**: Ensure exactly ONE entry point, must be agent or supervisor
   - Missing → auto-assign first agent/supervisor
   - Multiple → keep only first
   - Wrong type → reassign to first agent/supervisor

2. **Node References**: Remove edges that reference non-existent nodes

3. **Router Config**: Ensure routers have:
   - `routingMode` (default: "llm_classify")
   - `routes` array
   - `defaultTargetNodeId` (if missing, infer from nodes)

4. **Tool Whitelist**: Only allow 10 builtin tool IDs, reject unknowns

This prevents invalid specs from reaching the database.

---

## Current Architecture

### Frontend (React)

**Component**: `AutoCreateAgencyModal.tsx` (448 lines)
- **State**: requirement, file, taskId, status, phase, message, questions, answers, errors, elapsed time
- **Lifecycle**:
  1. Idle (input form)
  2. Queued → processing (phase bar + timer)
  3. Awaiting answers (interview form) — optional
  4. Completed (success) or failed (error + retry)
- **Polling**: `useEffect` with `setInterval(2.5s)`, max 5 minutes
- **Input Limits**: 10-10k chars, optional file <7.5 MB (PDF/DOCX/TXT/MD)
- **Rate Limit**: 5 creates per minute per user

**Canvas Page**: `AgencyBuilder.tsx` (900+ lines)
- **Post-creation**: Navigate to `/agencies/{agencyId}/edit`
- **Hydration**:
  - Fetch agency via `trpc.agency.getById`
  - Convert agents to ReactFlow nodes
  - Convert flows to edges
  - Auto-layout if all nodes have same position
- **Render**: Full ReactFlow canvas with toolbar, sidebar, properties panel

### Backend (Node.js)

**tRPC Routers**: `agency.ts` (lines 2260-2362)

1. **autoCreate** (mutation)
   - Input: requirement, specFileBase64?, model?, skipInterview?
   - Bridge: POST to Python `/api/v1/agency-creator/start`
   - Return: taskId
   - Rate limit: 5/min

2. **autoCreateStatus** (query)
   - Input: taskId
   - Bridge: GET to Python `/api/v1/agency-creator/status/{taskId}`
   - Return: status, phase, message, questions?, previewJson?, agencyId?, guide?, error?
   - Called every 2.5s by frontend

3. **autoCreateAnswer** (mutation)
   - Input: taskId, answers: Record<string, string>
   - Bridge: POST to Python `/api/v1/agency-creator/answer`
   - Return: { ok: true }

All procedures:
- Use Bearer token auth (forwarded from context)
- Call Python backend via HTTP
- Strip internal fields (_user_id, _payload, etc.) before returning to client

### Backend (Python)

**FastAPI Routes**: `app/api/agency_creator.py` (164 lines)

1. **POST /api/v1/agency-creator/start**
   - Validate requirement (10-10k chars)
   - Create task_id
   - Enqueue `create_agency_discover_task` in Celery
   - Return { task_id }
   - Fallback: Run synchronously in thread if Celery unavailable

2. **GET /api/v1/agency-creator/status/{task_id}**
   - Validate task_id format (regex)
   - Check user ownership (_user_id in Redis)
   - Return status object (minus internal fields)

3. **POST /api/v1/agency-creator/answer**
   - Validate task exists and is "awaiting_answers"
   - Store answers in Redis
   - Enqueue `create_agency_design_task`
   - Return { ok: true }

**Celery Tasks**: `app/tasks/agency_creator_task.py` (661 lines)

1. **create_agency_discover_task** (Task 1)
   - Soft limit: 300s, hard limit: 360s
   - Calls `_discover_async()` (pauseable)
   - Returns: Either immediate dispatch to Task 2, or awaiting_answers state
   - Status updates via `_set_status()` to Redis

2. **create_agency_design_task** (Task 2)
   - Soft limit: 540s, hard limit: 600s
   - Calls `_design_async()` (5 continuous phases)
   - On completion: Set status to "completed" + agencyId + guide
   - On error: Set status to "failed" + error message

**Helper Functions**:
- `_llm_call()`: Call LLM via LLMGatewayClient (with auth, timeout, retry)
- `_llm_discover()`: Phase 1 analysis (5-10s)
- `_llm_design()`: Phase 3 spec generation (15-30s)
- `_validate_spec()`: Phase 4 self-review (<1s)
- `_implement_agency()`: Phase 5 DB creation (calls internal Node.js API, 2-5s)
- `_llm_document()`: Phase 7 guide generation (5-10s)
- `_safe_json_parse()`: Parse JSON from LLM (handles markdown code blocks)
- `_fallback_agency_spec()`: Single-agent minimal spec if LLM fails

**Error Handling**:
- LLM failures logged but caught; fallback spec returned
- DB creation failures: status=failed, previewJson preserved for user inspection
- Celery task failures: logged, status=failed with error message
- Network errors: logged, client sees timeouts

**Redis Schema**:
```
agency-creator:{task_id}        TTL 2h   Task status
agency-creator:{task_id}:ans    TTL 2h   Interview answers
```

---

## Risks

### Current Risks

1. **No Public Documentation**
   - Users/developers can't understand the flow
   - No troubleshooting guide if creation fails
   - Hard to extend or debug

2. **Hard-Coded Timeouts**
   - 5-minute total poll timeout (frontend) may be too short for slow LLM providers
   - No way for user to extend timeout
   - Leads to frustration on slow networks

3. **No Streaming**
   - Simple polling every 2.5s, not real-time
   - Could miss phase changes if poll intervals misalign
   - More network overhead than SSE/WebSocket

4. **Limited Error Context**
   - If spec creation fails, user sees generic error
   - previewJson not exposed to UI for debugging
   - No detailed validation error feedback

5. **LLM Spec Fragility**
   - If LLM changes format slightly, parsing fails (JSON decoder)
   - No structured output guarantee
   - Fallback spec too minimal for complex agencies

6. **Tool ID Whitelist Not Extensible**
   - Hard-coded in validation; new tools require code change
   - No way to add custom tools without modifying backend

7. **No Cancellation**
   - Can't stop a stuck task
   - User must wait 5 minutes for timeout

8. **Single-Model Assumption**
   - All phases use same LLM model (default: gpt-4o)
   - No option to use different models for different phases
   - No fallback to cheaper model if first fails

9. **No Audit Trail**
   - LLM prompts/responses not logged for debugging
   - Task decision path not recorded
   - Hard to troubleshoot why spec is incorrect

### Future Risks (Not Yet Issues)

1. **Interview Questions Not Localized**
   - Questions generated in English only
   - Non-English users may struggle with ambiguous questions

2. **Tool Assignment Not Intelligent**
   - LLM assigns tools based on role description only
   - Doesn't validate tool compatibility with agent type
   - No cost optimization (cheaper alternatives suggested)

3. **No Spec Preview Before Creation**
   - User doesn't see spec until after DB create
   - If spec is wrong, too late to cancel
   - Could waste database resources/credits

---

## Options

### Option 1: Status Quo — No Changes
**Effort**: 0 hours
**Pros**:
- System works as-is
- No regression risk
Cons:
- No documentation
- Hard to troubleshoot
- No extensibility
**Recommendation**: Not viable long-term

### Option 2: Add Observability & Documentation (Recommended Phase 1)
**Effort**: 8-12 hours
**Changes**:
- Write comprehensive docs (this research brief + quick-ref)
- Add structured logging to all phases (JSON with traceId)
- Log LLM prompts + responses (sanitized)
- Add `/api/internal/agency-creator/debug/{taskId}` endpoint to fetch full task details + logs
- Add previewJson display in UI (collapsible)
- Add estimated duration to modal ("Typical: 30-90 seconds")
**Pros**:
- Easier troubleshooting
- Users understand what's happening
- Developers can extend intelligently
Cons**:
- No functional improvements
- Logging overhead
**Recommendation**: Do this first

### Option 3: Add Streaming & Real-Time Updates (Phase 2, Optional)
**Effort**: 16-20 hours
**Changes**:
- Implement Server-Sent Events (SSE) instead of polling
- Frontend opens `/api/v1/agency-creator/stream/{taskId}` on creation
- Python backend sends status updates via SSE (server push)
- Frontend updates UI in real-time
- WebSocket fallback for unsupported environments
**Pros**:
- Real-time phase updates (no 2.5s latency)
- Less network traffic overall
- More responsive UX
Cons**:
- More complex (SSE connection management)
- Requires deployment of SSE-capable server
- Backward compatibility needed
**Recommendation**: Defer; polling works fine for 5-minute operations

### Option 4: Add Spec Preview Before Creation (Phase 2, Optional)
**Effort**: 6-8 hours
**Changes**:
- After DESIGN phase, before IMPLEMENT, pause and show preview modal
- Display spec tree (agent names, tools, flows)
- User can:
  - Accept → continue to IMPLEMENT
  - Edit spec JSON → revalidate → continue
  - Cancel → don't create, go back to input
**Pros**:
- User sees spec before database write
- Can catch bad specs early
- Can manually fix spec if LLM messed up
Cons**:
- Adds another pause point (increases total time)
- More UI complexity
- User might not understand JSON
**Recommendation**: Nice-to-have, defer unless user feedback demands it

### Option 5: Extensible Tool System (Phase 3, Optional)
**Effort**: 12-16 hours
**Changes**:
- Move tool whitelist to database table (agencyTools or new table)
- Each tool has: id, name, description, nodeTypes (who can use it), schema, config
- LLM can use any tool in database (not hard-coded list)
- Admin panel to register custom tools
- Validation still checks tool exists in database
**Pros**:
- No code changes to add new tools
- Admin-extensible system
- Tools can be enabled/disabled per tenant
Cons**:
- Requires admin UI for tool management
- LLM might hallucinate invalid tool IDs
- Validation needs database lookup
**Recommendation**: Good long-term goal, but current hard-coded list is sufficient

---

## Recommendation

### Immediate (Phase 1, 8-12 hours)
1. **Document**: Write this research brief (done)
2. **Logging**: Add structured JSON logging to all phases
3. **Debug endpoint**: `/api/internal/agency-creator/debug/{taskId}` to fetch task state + logs
4. **UI improvements**:
   - Show previewJson in completion state (collapsible JSON viewer)
   - Add estimated duration ("Usually 30-90 seconds")
   - Show validation errors if spec creation fails
5. **Help docs**: Create help article explaining 7 phases

### Medium Term (Phase 2, if user feedback demands)
1. **Interview questions**: Localize to user's language
2. **Error context**: Show spec errors with suggestion how to fix
3. **Tool assignment**: Validate tool-agent type compatibility

### Long Term (Phase 3, architectural)
1. **Streaming**: Switch to SSE if polling becomes bottleneck
2. **Spec preview**: Show spec before creation, allow manual edits
3. **Tool extensibility**: Database-driven tool catalog

---

## Open Questions

1. **Should interview answers be rephrased by LLM?**
   - Currently passed raw to DESIGN phase
   - Could improve spec quality if rephrased for clarity
   - Adds 5-10s to timeline

2. **Should we support multi-language agencies?**
   - Requirement can be in any language
   - LLM spec generation uses English system prompt
   - Should nodes/instructions be in original language?
   - Requires language detection + localized prompts

3. **How to handle very large requirements (near 10k char)?**
   - Current limit 10k chars (reasonable, ~2000 words)
   - Could support file uploads for specs >10k
   - Already supports optional specFileBase64, but not used by LLM

4. **Should users be able to re-run discovery?**
   - If design phase fails, can user tweak answers + retry?
   - Or must they start over with new requirement?
   - Could save time if iteration allowed

5. **What's the cost per agency creation?**
   - 3 LLM calls (discover, design, document)
   - Plus internal API call for DB creation
   - Should we track credits/cost per creation?
   - Show user cost estimate upfront?

6. **Should agencies have version history from creation?**
   - Currently version history starts after creation
   - Should creation spec + LLM decisions be saved as v0?
   - Would help users understand design rationale

---

## Summary

The AI Agency Creator is a **well-architected, production-ready feature** that successfully automates the creation of multi-agent swarms via a 7-phase pipeline. The main gaps are **observability and documentation**.

**Priority 1**: Document the flow thoroughly (this research brief) and add structured logging for troubleshooting.

**Priority 2**: Expose spec preview and error details to users for better UX.

**Priority 3**: Consider streaming updates and spec preview/edit capability as user feedback accumulates.

The system is low-risk, works reliably, and needs mainly UX/visibility improvements to be a production feature users can confidently use.
