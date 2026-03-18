# Feature 045: JWT Celery Refactor — Quick Reference

## Problem Statement
- JWT tokens currently passed as Celery task arguments (stored in Redis plaintext)
- Security risk: tokens exposed in queue, logs, monitoring tools
- Affects: Agency Creator (2 tasks), Automation Copilot (2 tasks)

## Current Flow
```
Browser → Node.js tRPC (extracts JWT from Authorization header)
  → Python FastAPI (receives user_jwt in request body)
  → Celery task (user_jwt as argument, stored in Redis)
  → Worker (uses JWT to call Node.js LLM gateway & agency endpoint)
```

## Impact Map

### Agency Creator (MUST FIX)
| Component | Lines | JWT Used | Impact |
|-----------|-------|----------|--------|
| Task: DISCOVER | `agency_creator_task.py:98-130` | YES (3x LLM calls) | HIGH |
| Task: DESIGN | `agency_creator_task.py:200-230` | YES (4x calls: LLM + agency create) | HIGH |
| Dispatch: API | `api/agency_creator.py:70-76` | Enqueues JWT | HIGH |
| Answer handler | `api/agency_creator.py:145-174` | Re-enqueues JWT | HIGH |

### Automation Copilot (SHOULD FIX)
| Component | Lines | JWT Used | Impact |
|-----------|-------|----------|--------|
| Task: ANALYZE | `automation_copilot_task.py:75-143` | Passed but UNUSED (TODO comment) | MEDIUM |
| Task: EXECUTE | `automation_copilot_task.py:153-307` | Passed but UNUSED (TODO comment) | MEDIUM |
| Dispatch: API | `api/automation_copilot.py:117-119` | Enqueues JWT | MEDIUM |
| Dispatch: API | `api/automation_copilot.py:191-202` | Enqueues JWT | MEDIUM |
| tRPC Router | `automationCopilot.ts:115-122, 230-245` | Sends JWT in body | MEDIUM |

## Key Code Locations

### Where JWT Enters Task System
```python
# python-backend/app/api/agency_creator.py:70
user_jwt = credentials.credentials  # From Authorization: Bearer <JWT>

# Line 72-76: PROBLEM — queues task with JWT arg
create_agency_discover_task.delay(
    task_id=task_id,
    user_jwt=user_jwt,  # <-- REMOVE THIS
    user_id=current_user.id,
    payload=payload,
)
```

### Where JWT is Used in Tasks
```python
# python-backend/app/tasks/agency_creator_task.py:315-362
async def _llm_call(
    system_prompt: str,
    user_message: str,
    model: str,
    user_jwt: str,  # <-- REMOVE THIS PARAM
    max_tokens: int = 4000,
    timeout: float = 120.0,
) -> str | None:
    """Make HTTP request with JWT"""
    headers={"Authorization": f"Bearer {user_jwt}"}
    # Called to: {GATEWAY}/v1/chat/completions

# Line 599: Also called here
async def _implement_agency(spec: dict, user_jwt: str, tenant_id: str):
    headers={"Authorization": f"Bearer {user_jwt}"}
    # Called to: /api/internal/agency/create
```

### Existing Internal Token Infrastructure

**Python:** Already uses this pattern
```python
# python-backend/app/services/llm_gateway_client.py:65-82
def _build_headers(self, user_id: int | None = None, tenant_id: str | None = None):
    headers = {
        "X-Internal-Token": self._token,  # SMARTSPEC_WEB_GATEWAY_TOKEN
        "X-User-Id": str(user_id),
        "X-Tenant-Id": str(tenant_id),
    }
    # Token source: settings.SMARTSPEC_WEB_GATEWAY_TOKEN (env var)
```

**Node.js:** Already validates this pattern
```typescript
// apps/web/server/_core/llmRoutes.ts:1219-1232
const verifyInternalToken = (req: Request): boolean => {
    const token = req.headers["x-internal-token"];
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
};
```

**Node.js:** Already creates short-lived tokens
```typescript
// apps/web/server/_core/tokens.ts:127-145
export function createInternalTokenFromAuth(auth: { userId: number }): string {
    return signBearerToken(
        { sub: String(auth.userId), type: "access", scopes: [...], jti: ... },
        "15m"
    );
}
```

## Recommended Solution

### Option A: Use X-Internal-Token + X-User-Id (Preferred)
```python
# NO Celery arg change, add at task runtime:

async def _llm_call(
    system_prompt: str,
    user_message: str,
    model: str,
    user_id: int,      # <-- Add (already available as task arg)
    tenant_id: str,    # <-- Add (already available as task arg)
    max_tokens: int = 4000,
):
    # Use existing LLMGatewayClient pattern
    gateway = LLMGatewayClient()
    response = await gateway.chat_completion(
        messages=[...],
        model=model,
        user_id=user_id,     # <-- Passed here instead of token
        tenant_id=tenant_id, # <-- Passed here instead of token
    )
    return response.choices[0].message.content
```

**Changes needed:**
1. Remove `user_jwt` param from all task signatures
2. Keep `user_id` and add `tenant_id` to task args
3. Replace direct HTTP calls with `LLMGatewayClient()` (already exists)
4. For agency creation: extend Node.js endpoint to accept `X-Internal-Token` + `X-User-Id` headers

### Option B: Generate Fresh Bearer Token at Runtime
```python
# At start of task, create a short-lived token

from apps.web.server._core.tokens import signBearerToken  # Import from Node.js

async def _discover_async(task_id: str, user_id: int, payload: dict):
    # Generate fresh token (15 min expiry)
    fresh_token = signBearerToken(
        {"sub": str(user_id), "type": "internal", "scopes": ["media:generate"]},
        "15m"
    )
    # Use fresh_token for all HTTP calls in this task
    # Avoids storing token in Redis queue
```

**Changes needed:**
1. Remove `user_jwt` from task args (keep `user_id`)
2. Export `signBearerToken` from Node.js to Python (new dependency)
3. Generate token at task start
4. Use fresh token for all HTTP calls

## Implementation Checklist

### Phase 1: Agency Creator (Week 1)
- [ ] Decide between Option A or B
- [ ] Remove `user_jwt` from `create_agency_discover_task()` signature
- [ ] Add `tenant_id` to task args
- [ ] Update `_llm_call()` to use LLMGatewayClient or fresh token
- [ ] Update `_implement_agency()` to use new auth
- [ ] Update dispatch code in `api/agency_creator.py`
- [ ] Update dispatch code in Node.js (if tRPC router calls Python)
- [ ] Add integration tests
- [ ] Remove TODO comment from code

### Phase 2: Automation Copilot (Week 2)
- [ ] Remove `user_jwt` from `automation_analyze_task()` signature
- [ ] Remove `user_jwt` from `automation_execute_task()` signature
- [ ] Update dispatch code in `api/automation_copilot.py`
- [ ] Update dispatch code in `automationCopilot.ts`
- [ ] Add integration tests
- [ ] Remove TODO comments from code

### Phase 3: Cleanup (Week 3+)
- [ ] Search for other Celery tasks passing sensitive data
- [ ] Update Celery monitoring configs (redact headers)
- [ ] Performance test: verify no latency regressions
- [ ] Update documentation/runbooks

## Testing Strategy

### Unit Tests (Fast)
```python
# Test that task runs without JWT argument
# Test that LLMGatewayClient is called with correct user_id/tenant_id
# Test that internal tokens are created with correct claims
```

### Integration Tests (Full Flow)
```python
# Test: Agency Creator discovers → designs → creates agency
# Test: Automation Copilot analyzes → executes automation
# Test: Credit deduction still works (uses user_id, not JWT)
# Test: Rate limiting still enforced per-user
# Test: Audit logs contain correct user_id and trace_id
```

### E2E Tests (UI)
```
1. Open browser, log in
2. Start Agency Creator
3. Verify agency is created (no JWT in logs)
4. Start Automation Copilot
5. Verify automation executes (no JWT in logs)
6. Check Celery logs: no JWT in task args
7. Check Redis: no JWT in queue messages
```

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Token expiry (task > 15 min) | MEDIUM | Use 1-hour expiry for internal tokens, or refresh mid-task |
| Node.js endpoint validation changes | LOW | Keep bearer token support (no breaking changes) |
| User context lost | LOW | Pass user_id + tenant_id (already available) |
| Celery debugging harder | LOW | Use X-Request-ID + user_id for tracing |

## Rollback Plan
1. If Option A doesn't work: fall back to Option B (no data loss)
2. If Option B has performance issues: revert task signatures (Celery compatible)
3. Full rollback: re-add `user_jwt` argument (backward compatible)

## Success Criteria
- [ ] All JWT tokens removed from Celery task arguments
- [ ] Agency Creator E2E tests pass
- [ ] Automation Copilot E2E tests pass
- [ ] No JWT appears in Redis queue inspection
- [ ] No JWT appears in Celery logs
- [ ] Rate limiting still works per-user
- [ ] Audit logs still contain correct user context
- [ ] No performance regression (latency < 5% change)

