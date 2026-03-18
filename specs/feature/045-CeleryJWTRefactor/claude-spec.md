# Feature 045: Remove JWT from Celery Task Arguments — Synthesized Spec

## Problem Statement

SmartSpecPro passes full user JWT tokens as Celery task arguments in 4 tasks across 2 files. These tokens are stored in plaintext in the Redis message broker, visible in monitoring tools, and persisted for the task duration (2-10+ minutes). This is a HIGH security vulnerability.

## Affected Tasks

| Task | File | JWT Used? | What JWT Does |
|------|------|-----------|---------------|
| `create_agency_discover_task` | `agency_creator_task.py` | YES | Bearer token for `/v1/chat/completions` + `/api/internal/agency/create` |
| `create_agency_design_task` | `agency_creator_task.py` | YES | Same endpoints (LLM calls + agency creation) |
| `automation_analyze_task` | `automation_copilot_task.py` | NO | Passed but never used — uses LLMGatewayClient with X-Internal-Token |
| `automation_execute_task` | `automation_copilot_task.py` | NO | Passed but never used — same |

## Key Discovery: Infrastructure Already Exists

The codebase has two proven internal auth mechanisms:

1. **LLMGatewayClient** (`python-backend/app/services/llm_gateway_client.py`)
   - Uses `X-Internal-Token` + `X-User-Id` headers
   - Already used by Automation Copilot tasks correctly
   - Connects to Node.js LLM gateway without user JWT

2. **Internal Token Verification** (`apps/web/server/_core/`)
   - `verifyInternalToken()` — timing-safe comparison
   - `INTERNAL_API_TOKEN` env var shared between Node.js and Python
   - Already used for server-to-server communication

## Solution: Two-Phase Approach

### Phase 1: Automation Copilot (Easy — JWT Not Used)
Simply remove `user_jwt` parameter from both tasks and their dispatch calls. JWT is passed but never consumed.

### Phase 2: Agency Creator (Main Work)
Replace Bearer JWT auth with X-Internal-Token + X-User-Id pattern (same as Automation Copilot already uses).

**Changes needed:**
- `_llm_call()` → use `LLMGatewayClient` instead of raw `httpx` with Bearer token
- `_implement_agency()` → use `X-Internal-Token` + `X-User-Id` headers instead of Bearer JWT
- Node.js `/api/internal/agency/create` endpoint → accept internal token auth
- Remove `user_jwt` from task signatures and dispatch calls

## Out of Scope

- Changing the Node.js → Python dispatch mechanism (stays as HTTP)
- Changing user-facing auth (JWT in browser stays)
- Changing the LLM gateway's public auth (stays JWT for browser calls)
- Database schema changes

## Success Criteria

1. No JWT tokens in Redis broker messages
2. No JWT tokens in Celery task arguments
3. All Agency Creator + Automation Copilot functionality works identically
4. grep for `user_jwt` in task files returns 0 results
5. Internal token auth verified via existing test patterns
