---
name: Feature 045 Celery JWT Refactor Research
description: Complete JWT flow analysis for Feature 045 (Remove JWT from Celery Task Arguments) - Security risk: plaintext JWT stored in Redis queue
type: project
---

# Feature 045: Remove JWT from Celery Task Arguments — Research Summary

**Date:** 2026-03-16
**Status:** Research Complete — Ready for Implementation
**Effort:** 16-20 hours (2 sprint days)
**Priority:** P0 (Security: JWT exposed in plaintext in Redis queue)

## Problem Statement
SmartSpecPro passes user JWT tokens as Celery task arguments in 4 tasks:
1. `create_agency_discover_task` (Agency Creator)
2. `create_agency_design_task` (Agency Creator)
3. `automation_analyze_task` (Automation Copilot)
4. `automation_execute_task` (Automation Copilot)

**Security Risk:** JWT tokens stored in plaintext in Redis message queue, accessible via:
- Celery Flower monitoring tool
- Worker logs
- Task history/replay
- Redis snapshots (RDB/AOF)

**Exposure window:** 2-10+ minutes per task

## Key Findings

### 1. Current JWT Usage Map

**Agency Creator (USES JWT):**
- Task receives `user_jwt` as argument
- Called 4 times with JWT as Bearer token:
  - 3x to `/v1/chat/completions` (LLM gateway)
  - 1x to `/api/internal/agency/create` (agency endpoint)
- **Files:** `python-backend/app/tasks/agency_creator_task.py`, `python-backend/app/api/agency_creator.py`

**Automation Copilot (JWT UNUSED):**
- Task receives `user_jwt` as argument but NEVER USES IT
- Code has explicit TODO comment: "Replace user_jwt with user_id + internal service token"
- Uses `LLMGatewayClient()` instead (correct pattern)
- **Files:** `python-backend/app/tasks/automation_copilot_task.py`, `python-backend/app/api/automation_copilot.py`

### 2. Existing Internal Token Infrastructure (Proven)

**LLMGatewayClient** (python-backend):
- Uses `X-Internal-Token` header (env var: `SMARTSPEC_WEB_GATEWAY_TOKEN`)
- Passes context via `X-User-Id` + `X-Tenant-Id` headers
- Already used correctly by Automation Copilot
- Location: `python-backend/app/services/llm_gateway_client.py:65-82`

**Token Verification** (Node.js):
- Function: `verifyInternalToken()` with timing-safe comparison
- Location: `apps/web/server/_core/llmRoutes.ts:1219-1232`

**Short-lived Token Generation** (Node.js):
- Function: `createInternalTokenFromAuth()` — creates 15-minute bearer tokens
- Location: `apps/web/server/_core/tokens.ts:127-145`

→ **All infrastructure already exists and proven** — just need to reuse it

### 3. Recommended Solution

**Option A (Preferred): Use X-Internal-Token Pattern**
- Remove `user_jwt` from task arguments
- Keep `user_id` + `tenant_id` in task arguments
- Use `LLMGatewayClient()` for all LLM calls (already exists)
- For agency creation: use X-Internal-Token + X-User-Id headers
- Complexity: Low | Risk: Low | Latency: No change

**Option B (Alternative): Generate Fresh Bearer Token**
- Remove `user_jwt` from task arguments
- Generate 15-minute bearer token at task runtime
- Use fresh token for all HTTP calls (never store in Redis)
- Complexity: Medium | Risk: Low | Latency: +5ms per task

## Implementation Scope

### Phase 1 (Week 1 — Priority 0): Agency Creator
- Remove `user_jwt` from `create_agency_discover_task()` signature
- Remove `user_jwt` from `create_agency_design_task()` signature
- Update `_llm_call()` function (remove JWT param, use LLMGatewayClient)
- Update `_implement_agency()` function (remove JWT param, use internal token pattern)
- Update dispatch code in `api/agency_creator.py` (don't queue JWT)
- Effort: 4-6 hours

### Phase 2 (Week 2 — Priority 1): Automation Copilot
- Remove unused `user_jwt` from both task signatures
- Update dispatch code (Python API)
- Update dispatch code (Node.js tRPC router)
- Effort: 2-4 hours

### Phase 3 (Week 3+ — Optional): Hardening
- Audit for other sensitive data in Celery tasks
- Update Celery monitoring configs (redact headers)
- Performance benchmarking
- Effort: 2-4 hours

## Files Affected

**MUST CHANGE:**
- `python-backend/app/tasks/agency_creator_task.py` (lines 98-230, 315-362, 544-612)
- `python-backend/app/api/agency_creator.py` (lines 70-76, 145-174)

**SHOULD CHANGE:**
- `python-backend/app/tasks/automation_copilot_task.py` (lines 75-307)
- `python-backend/app/api/automation_copilot.py` (lines 117-202)
- `apps/web/server/routers/automationCopilot.ts` (lines 115-122, 230-245)

**REFERENCE:**
- `apps/web/server/_core/tokens.ts` (reuse existing functions)
- `python-backend/app/services/llm_gateway_client.py` (reference pattern)

## Testing Strategy
- **Unit tests:** Verify task signatures, LLMGatewayClient calls, token generation
- **Integration tests:** Full Agency Creator workflow, full Automation Copilot workflow
- **E2E tests:** UI → Celery → LLM → database, verify no JWT in Redis/logs
- **Verification:** redis-cli inspect queue (confirm no JWT), Celery logs check, Flower UI check

## Risk Assessment
| Risk | Severity | Mitigation |
|------|----------|-----------|
| Task expiry > 15 min | MEDIUM | Use 1-hour expiry for internal tokens |
| User context lost | LOW | Pass user_id + tenant_id in args |
| Celery compatibility | LOW | Changes are backward-compatible |
| Rate limiting breaks | LOW | Uses user_id in headers, not JWT |
| Node.js endpoint rejects new auth | LOW | Keep bearer token support |

## Success Criteria
- [ ] JWT removed from all 4 task argument signatures
- [ ] Agency Creator E2E tests pass
- [ ] Automation Copilot E2E tests pass
- [ ] No JWT in Redis queue (verified)
- [ ] No JWT in logs or Celery Flower UI
- [ ] User rate limiting still works per-user
- [ ] Latency impact < 5%
- [ ] Full test suite passes

## Research Artifacts
All research documents located at: `/specs/feature/045-CeleryJWTRefactor/`
- `INDEX.md` — Start here (decision points, checklist)
- `QUICK-REF.md` — Implementation reference (code snippets, impact matrix)
- `claude-research.md` — Complete analysis (12 sections, call flows, diagrams)
- `RESEARCH-SUMMARY.txt` — Executive summary

