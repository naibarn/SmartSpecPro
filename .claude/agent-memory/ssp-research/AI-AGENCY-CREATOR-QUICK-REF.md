---
name: AI Agency Creator Quick Reference
description: Quick lookup table for files, endpoints, phases, and data structures
type: reference
---

# AI Agency Creator — Quick Reference

## Critical Task IDs

- **Task 1 (DISCOVER + INTERVIEW)**: `create_agency_discover_task` (soft limit: 300s, hard: 360s)
- **Task 2 (DESIGN → DOCUMENT)**: `create_agency_design_task` (soft limit: 540s, hard: 600s)
- **Task ID Format**: `agcreate-{12-char-hex}` (validated via regex: `^agcreate-[a-f0-9]{12}$`)

## Endpoints at a Glance

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/v1/agency-creator/start` | POST | Enqueue Task 1 | Bearer token |
| `/api/v1/agency-creator/status/{task_id}` | GET | Poll task progress | Bearer token |
| `/api/v1/agency-creator/answer` | POST | Submit interview answers | Bearer token |
| `/api/internal/agency/create` | POST | Create agency in DB (internal) | X-Internal-Token |

## 8 Phases Summary

| # | Phase | Duration | Input | Output | Trigger |
|---|-------|----------|-------|--------|---------|
| 1 | DISCOVER | 5-10s | Requirement | intent dict | Task 1 start |
| 2 | INTERVIEW | User-driven | Questions | Answers | If intent.questions exists |
| 3 | DESIGN | 15-30s | intent + answers | spec (nodes/edges) | Task 2 start |
| 4 | VALIDATE | <1s | spec | spec (fixed) | Auto (Task 2) |
| 5 | IMPLEMENT | 2-5s | spec | agencyId | Auto (Task 2) |
| 6 | VERIFY | <1s | agencyId | (none) | Auto (Task 2) |
| 7 | DOCUMENT | 5-10s | spec | guide text | Auto (Task 2) |
| 8 | DONE | — | — | — | Task 2 complete |

## Frontend States

```
idle → (submit requirement)
     → queued → processing (with phase bar)
              → awaiting_answers (interview form) → (submit answers)
                                                 → processing (phase bar)
              → completed (success) → (navigate to canvas)
              → failed (error, offer retry)
```

**Polling**: Every 2.5s, max 5 minutes, stops on completed/failed/timeout

## Redis Schema

```
Key: agency-creator:{task_id}
Value: JSON object
  - status: string (queued|processing|awaiting_answers|completed|failed)
  - phase: string
  - message: string
  - _user_id: int (internal, ownership check)
  - _payload: dict (during interview, temp storage)
  - _intent: dict (during interview, temp storage)
  - questions?: [{ id, question, type }] (phase 2)
  - previewJson?: dict (phase 3+)
  - agencyId?: string (phase 5+)
  - guide?: string (phase 7+)
  - error?: string (on failure)
TTL: 2 hours
```

## LLM Prompts (Simplified)

### DISCOVER Phase
- Input: Requirement
- Output: JSON with `is_clear`, `domain`, `estimated_agents`, `questions`
- Max tokens: 1000
- Timeout: 60s

### DESIGN Phase
- Input: Requirement + intent + answers
- Output: JSON with `name`, `description`, `nodes` (agents), `edges` (flows), `rationale`
- Node fields: id, nodeType, name, description, instructions, model, isEntryPoint, toolIds, nodeConfig
- Max tokens: 4000
- Timeout: 120s

### DOCUMENT Phase
- Input: Agency name + description + node names
- Output: Plain text guide (max 300 words, 3 example prompts)
- Max tokens: 500
- Timeout: 60s

## Tool IDs (Whitelist)

```
builtin-web-search
builtin-code-interpreter
builtin-file-reader
builtin-file-writer
builtin-rag-knowledge
builtin-http-request
builtin-email-notify
builtin-webhook
builtin-slack-message
builtin-document-search
```

## Critical Code Paths

### Frontend Modal (AutoCreateAgencyModal.tsx)
- Lines 73-90: State initialization
- Lines 110-165: Polling useEffect
- Lines 190-221: handleSubmit (create agency)
- Lines 223-235: handleSubmitAnswers (interview response)
- Lines 261-443: Render logic (idle → processing → awaiting → completed/failed)

### tRPC Bridge (agency.ts)
- Line 2262: `autoCreate` mutation (calls Python /start)
- Line 2304: `autoCreateStatus` query (calls Python /status/{id})
- Line 2337: `autoCreateAnswer` mutation (calls Python /answer)

### Python Tasks (agency_creator_task.py)
- Line 98: `create_agency_discover_task` (Task 1)
- Line 132: `_discover_async` (DISCOVER + INTERVIEW logic)
- Line 197: `create_agency_design_task` (Task 2)
- Line 229: `_design_async` (DESIGN → DOCUMENT logic)
- Line 351: `_llm_discover` (Phase 1 LLM call)
- Line 384: `_llm_design` (Phase 3 LLM call)
- Line 470: `_validate_spec` (Phase 4 validation)
- Line 531: `_implement_agency` (Phase 5 DB creation)
- Line 612: `_llm_document` (Phase 7 guide generation)

### Canvas Hydration (AgencyBuilder.tsx)
- Lines 247-257: Fetch agency data via tRPC
- Lines 263-323: Convert agents to nodes + flows to edges
- Line 814-817: onCreated callback navigates to /agencies/{agencyId}/edit

## Validation Rules (Phase 4)

1. **Entry Point**: Exactly ONE, must be agent/supervisor
2. **Node References**: Remove edges to non-existent nodes
3. **Router Config**: Ensure routingMode, routes, defaultTargetNodeId
4. **Tool IDs**: Keep only whitelisted IDs
5. **Node Count**: Typically 2-6 agents (LLM encouraged to keep simple)

## Error Scenarios

| Error | Cause | Recovery |
|-------|-------|----------|
| Task not found | Poll after task expired (2h TTL) | Show error, offer retry |
| Invalid task_id | Malformed ID, doesn't match regex | Reject in validation |
| LLM parse error | Invalid JSON from LLM | Use fallback single-agent spec |
| DB create failed | Internal API error | status=failed, preserve previewJson |
| Timeout (5min) | Network slow, task taking too long | Graceful timeout, offer retry |
| User ID mismatch | Polling task created by different user | HTTPException 404 |

## Key Design Decisions

1. **Two Tasks**: Can't block-wait for interview answers in Celery → split into discover (pause for answers) + design (resume)
2. **Redis Storage**: Fast, ephemeral status updates without DB round-trips during polling
3. **Polling**: No SSE/WebSocket complexity; simple client-side polling works well for 5min operation
4. **Internal API**: Python creates spec, Node.js creates DB record (cleaner separation)
5. **Auto-Layout**: Canvas applies tree layout if all nodes have identical positions from creation
6. **Fallback Spec**: LLM failure doesn't fail task; user gets minimal agency to edit manually
7. **Rate Limiting**: 5 creates per minute per user (prevent spam)

## Testing Checklist

- [ ] Happy path: requirement → design → canvas (no interview)
- [ ] Interview path: ambiguous → questions → answers → design → canvas
- [ ] Timeout: exceed 5 minutes, see graceful error
- [ ] LLM failure: mock failing chat completion, verify fallback spec
- [ ] Invalid file: upload >7.5 MB, verify rejection
- [ ] Poll after expiry: wait 2+ hours, poll status, verify 404
- [ ] Rate limit: submit 6 requests in 60s, verify 429
- [ ] Canvas hydration: verify nodes + edges + tools loaded correctly
- [ ] Auto-layout: verify nodes spread vertically if all same position
