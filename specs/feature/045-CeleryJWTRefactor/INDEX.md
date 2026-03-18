# Feature 045: Remove JWT from Celery Task Arguments — Research Index

**Research Completed:** 2026-03-16
**Status:** Ready for Design & Implementation
**Effort Estimate:** 16-20 hours (2 sprint days)
**Priority:** P0 (Security: JWT exposed in plaintext in Redis queue)

## Document Map

| Document | Size | Purpose | Read When |
|----------|------|---------|-----------|
| **RESEARCH-SUMMARY.txt** | 8 KB | **START HERE** — Executive summary, findings, next steps | You have 5 min |
| **QUICK-REF.md** | 8 KB | Impact matrix, code locations, checklist, code snippets | Implementing feature |
| **claude-research.md** | 12 KB | Complete technical analysis (12 sections, call flows, diagrams) | Planning or PR review |

---

## Quick Start (5 Minutes)

### The Problem
```
React Browser → Node.js → Python API → Celery Task (stores JWT in Redis)
                                            ↓
                                      Worker uses JWT
                                      (exposed in logs, monitoring, snapshots)
```

### The Risk
- JWT tokens stored in plaintext in Redis message queue
- Accessible via Celery Flower monitoring, worker logs, redis-cli
- Affects: Agency Creator (2 tasks) + Automation Copilot (2 tasks)

### The Solution
- Remove `user_jwt` from task arguments
- Use existing `X-Internal-Token` pattern (already proven in codebase)
- Or generate fresh short-lived bearer tokens at task runtime

### The Effort
- 16-20 hours total (2 sprint days)
- Phase 1 (Week 1): Fix Agency Creator (4-6 hrs)
- Phase 2 (Week 2): Fix Automation Copilot (2-3 hrs)
- Testing & integration: 6-8 hrs

---

## Reading Guide by Role

### Security/DevSecOps: Review Current Risk
1. Read: RESEARCH-SUMMARY.txt (section 1-2) — 5 min
2. Read: claude-research.md (section 8-9) — "Why Current Approach is Problematic" — 10 min
3. Decision: Approve implementation approach

### Implementation Engineer: Build the Fix
1. Read: QUICK-REF.md (Recommended Solution section) — 5 min
2. Read: QUICK-REF.md (Implementation Checklist) — 10 min
3. Read: claude-research.md (sections 5, 10, 12) — Token patterns & checklist — 20 min
4. Start coding using checklist as guide

### Code Reviewer: QA the Changes
1. Read: QUICK-REF.md (Risk Assessment & Testing Strategy) — 10 min
2. Read: claude-research.md (section 11-12) — Risks & Code Review Checklist — 20 min
3. Use provided checklist during PR review

### Architecture: Design Alternative Solutions
1. Read: RESEARCH-SUMMARY.txt (section 6) — Recommended solution overview — 5 min
2. Read: claude-research.md (section 10) — 3 implementation options — 15 min
3. Read: claude-research.md (section 11) — Risks & considerations — 10 min
4. Decide: Option A (X-Internal-Token) vs Option B (fresh bearer token)

---

## Key Findings

### 1. Current JWT Usage
- **Agency Creator**: 4 HTTP calls use JWT as Bearer token
  - 3x to Node.js LLM gateway (`/v1/chat/completions`)
  - 1x to Node.js agency endpoint (`/api/internal/agency/create`)
- **Automation Copilot**: JWT passed but UNUSED (contains TODO comment!)

### 2. Security Issue
| Exposure Vector | Impact | Severity |
|---|---|---|
| Redis queue (plaintext) | Token persists 2-10+ minutes, accessible via redis-cli | CRITICAL |
| Celery Flower UI | Monitoring tool displays task arguments with JWT | HIGH |
| Worker logs | Logs may contain task arguments with JWT | HIGH |
| Redis snapshots | RDB/AOF files contain plaintext JWT | MEDIUM |

### 3. Existing Solution Already Available
```python
# Already used by Automation Copilot (correctly!)
gateway = LLMGatewayClient()  # Uses X-Internal-Token internally
response = await gateway.chat_completion(
    messages=[...],
    model=model,
    user_id=user_id,      # Context passed via header
    tenant_id=tenant_id,
)
```

### 4. Effort is Low
- No new infrastructure needed (reuse LLMGatewayClient)
- No breaking changes to Node.js endpoints
- Backward-compatible Celery changes

---

## Files Affected

### MUST CHANGE (Priority 0 — Agency Creator)
```
python-backend/app/tasks/agency_creator_task.py
  ├─ Line 98-130: create_agency_discover_task()
  ├─ Line 200-230: create_agency_design_task()
  └─ Line 315-362: _llm_call() function (JWT param)
     AND Line 544-612: _implement_agency() function (JWT param)

python-backend/app/api/agency_creator.py
  ├─ Line 70-76: start_agency_creator() (dispatch with JWT)
  └─ Line 145-174: submit_agency_creator_answers() (re-dispatch with JWT)
```

### SHOULD CHANGE (Priority 1 — Automation Copilot, already unused)
```
python-backend/app/tasks/automation_copilot_task.py
  ├─ Line 75-143: automation_analyze_task() (unused JWT param)
  └─ Line 153-307: automation_execute_task() (unused JWT param)

python-backend/app/api/automation_copilot.py
  ├─ Line 117-119: analyze() endpoint (send JWT in body)
  └─ Line 191-202: execute() endpoint (send JWT in body)

apps/web/server/routers/automationCopilot.ts
  ├─ Line 115-122: analyze mutation (pass userToken in body)
  └─ Line 230-245: execute mutation (pass userToken in body)
```

### REFERENCE ONLY (no changes)
```
apps/web/server/_core/tokens.ts (reuse: createInternalTokenFromAuth, signBearerToken)
apps/web/server/_core/llmRoutes.ts (verify: X-Internal-Token validation exists)
python-backend/app/services/llm_gateway_client.py (reference: correct pattern)
```

---

## Recommended Implementation Approach

### Option A: Use X-Internal-Token Pattern (Preferred)
**Complexity:** Low
**Risk:** Low
**Latency:** No change
**Code changes:** ~20 lines

```python
# BEFORE
def create_agency_discover_task(self, task_id, user_jwt, user_id, payload):
    intent = await _llm_discover(requirement, model, user_jwt)

# AFTER
def create_agency_discover_task(self, task_id, user_id, tenant_id, payload):
    gateway = LLMGatewayClient()
    result = await gateway.chat_completion(
        messages=[...],
        model=model,
        user_id=user_id,      # <-- No JWT
        tenant_id=tenant_id,
    )
```

### Option B: Generate Fresh Bearer Token (Alternative)
**Complexity:** Medium
**Risk:** Low
**Latency:** +5ms per task (token generation)
**Code changes:** ~30 lines

```python
# At task start
fresh_token = signBearerToken(
    {"sub": str(user_id), "type": "internal", "scopes": ["media:generate"]},
    "15m"  # Short-lived
)
# Use fresh_token for all HTTP calls (never store in Redis)
```

---

## Testing Strategy

### Unit Tests (Verify)
- [ ] Task signature doesn't contain `user_jwt` parameter
- [ ] LLMGatewayClient is called with correct user_id/tenant_id
- [ ] Fresh tokens (if Option B) have correct claims and expiry

### Integration Tests (Validate)
- [ ] Agency Creator DISCOVER phase completes successfully
- [ ] Agency Creator DESIGN phase completes successfully
- [ ] Agency Creator IMPLEMENT phase creates agency in database
- [ ] Automation Copilot ANALYZE phase returns intent
- [ ] Automation Copilot EXECUTE phase runs scripts
- [ ] User credit tracking works (uses user_id, not JWT)
- [ ] Rate limiting still enforced per-user

### E2E Tests (Confirm)
- [ ] Browser → Agency Creator workflow produces agency
- [ ] Browser → Automation Copilot workflow produces automation
- [ ] Redis queue contains NO JWT tokens (verify with redis-cli)
- [ ] Celery logs contain NO JWT tokens
- [ ] Celery Flower UI doesn't expose JWT

---

## Implementation Checklist

### Planning (2 hours)
- [ ] Read this INDEX.md (5 min)
- [ ] Read QUICK-REF.md (10 min)
- [ ] Read claude-research.md sections 5, 10 (20 min)
- [ ] Decide: Option A or Option B (5 min)
- [ ] Plan: Which files to change in which order (20 min)

### Phase 1: Agency Creator (4-6 hours)
- [ ] Remove `user_jwt` parameter from 2 task signatures
- [ ] Update 2 task dispatch calls (Python API)
- [ ] Update `_llm_call()` function to use LLMGatewayClient
- [ ] Update `_implement_agency()` to use LLMGatewayClient or fresh token
- [ ] Write integration tests
- [ ] Test: Local E2E with Agency Creator
- [ ] Run: Full test suite (no regressions)

### Phase 2: Automation Copilot (2-4 hours)
- [ ] Remove `user_jwt` parameter from 2 task signatures
- [ ] Update 2 task dispatch calls (Python API)
- [ ] Update 2 task dispatch calls (Node.js tRPC router)
- [ ] Write integration tests
- [ ] Test: Local E2E with Automation Copilot
- [ ] Run: Full test suite

### Phase 3: Validation & Documentation (2-4 hours)
- [ ] E2E test: Agency Creator (full workflow)
- [ ] E2E test: Automation Copilot (full workflow)
- [ ] Verify: No JWT in Redis queue
- [ ] Verify: No JWT in worker logs
- [ ] Performance test: <5% latency change
- [ ] Update: Code comments, runbooks, docs

### Code Review (2 hours)
- [ ] Review: No JWT in task arguments (static analysis)
- [ ] Review: All HTTP calls use new auth pattern
- [ ] Review: Tests cover new auth flow
- [ ] Review: Rollback plan documented

---

## Success Criteria

- [ ] All 4 tasks have `user_jwt` parameter removed
- [ ] Agency Creator E2E tests pass (discover → design → implement)
- [ ] Automation Copilot E2E tests pass (analyze → execute)
- [ ] Integration tests verify new auth pattern
- [ ] No JWT appears in Redis queue (verified with redis-cli)
- [ ] No JWT appears in Celery logs or Flower UI
- [ ] User rate limiting still works per-user
- [ ] Audit logs contain correct user_id context
- [ ] Latency impact < 5%
- [ ] Full test suite passes (no regressions)

---

## Decision Points

### 1. Option Selection (Required)
**Choose before starting implementation:**
- [ ] Option A: X-Internal-Token pattern (lower risk, no code export)
- [ ] Option B: Fresh bearer token (more granular, needs Node.js export)

**Recommendation:** Option A (reuses proven pattern, lower risk)

### 2. Token Expiry (If Option B)
**Choose before implementation:**
- [ ] 15-minute expiry (tight, may require refresh mid-task)
- [ ] 1-hour expiry (safer, less granular)

**Recommendation:** 1 hour (Agency Creator can exceed 15 min in interview phase)

### 3. Node.js Endpoint Changes
**Choose before Phase 1:**
- [ ] Modify existing `/api/internal/agency/create` to accept X-Internal-Token
- [ ] Keep existing endpoint (only accepts Bearer JWT), use LLMGatewayClient for all calls

**Recommendation:** Use LLMGatewayClient for all calls (simpler, no endpoint changes)

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Task expiry (task > 15 min) | MEDIUM | Use 1-hour expiry for internal tokens |
| User context lost | LOW | Pass user_id + tenant_id in task args |
| Celery compatibility | LOW | No breaking changes to Celery API |
| Rate limiting breaks | LOW | Uses user_id in headers, not JWT |
| Node.js endpoint rejects new auth | LOW | Keep bearer token support indefinitely |
| Performance regression | LOW | LLMGatewayClient already optimized |

---

## Rollback Plan

If implementation encounters blockers:

1. **Minor issue (e.g., missing test):**
   - Fix and re-test
   - No rollback needed

2. **Compatibility issue (e.g., endpoint rejects header):**
   - Revert commits
   - Stay on current JWT approach
   - Open follow-up ticket for infrastructure changes

3. **Behavioral regression (e.g., rate limiting breaks):**
   - Revert commits
   - Investigate root cause
   - Re-implement with different approach (Option B instead of Option A)

**Rollback is safe:** Changes are backward-compatible, Celery doesn't care about task signature changes.

---

## Questions & Answers

**Q: Why not just encrypt the JWT in Redis?**
A: That's a surface fix. The real problem is: tokens shouldn't be stored at rest. They should be generated fresh per HTTP call (Option B) or passed via secure headers (Option A).

**Q: Will this break existing deployments?**
A: No. Celery changes are backward-compatible. Old tasks in queue will fail gracefully, new tasks will work correctly.

**Q: What if the Node.js LLM gateway goes down?**
A: Same as today. LLMGatewayClient already has retry logic (3x retry on 429, 1x retry on 5xx).

**Q: Why remove it from Automation Copilot if it's unused?**
A: Simplification + consistency. The code has a TODO comment saying to remove it. Easier now than later.

**Q: Is Option A or B preferred?**
A: Option A (X-Internal-Token). It's simpler, uses proven pattern, doesn't require exporting Node.js token functions to Python.

---

## Next Steps

1. **NOW:** Read RESEARCH-SUMMARY.txt (5 min) + QUICK-REF.md (10 min)
2. **NEXT MEETING:** Decide Option A vs Option B
3. **PLANNING:** Create implementation tasks using checklist
4. **WEEK 1:** Implement Phase 1 (Agency Creator)
5. **WEEK 2:** Implement Phase 2 (Automation Copilot)
6. **WEEK 3:** Validation + documentation

---

**Research Complete.** Ready for design & implementation.

