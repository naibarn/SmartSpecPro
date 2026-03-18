# Feature 045: Remove JWT from Celery Task Arguments — Implementation Plan

## 1. Background & Motivation

SmartSpecPro uses Celery (with Redis broker) for async tasks like AI agency creation and browser automation. Currently, 4 Celery tasks receive the user's full JWT token as a function argument. This means:

- The JWT is serialized into Redis as plaintext JSON (readable by any process with Redis access)
- The JWT persists in the queue for the task's lifetime (2-10+ minutes)
- The JWT is visible in Celery Flower monitoring UI and worker debug logs

This is a **HIGH security vulnerability** — if Redis is compromised or logs are leaked, attackers get valid user sessions.

**The good news:** The codebase already has a proven internal service-to-service auth pattern (`X-Internal-Token` + `X-User-Id`) used by the Automation Copilot's `LLMGatewayClient`. We just need to adopt it consistently.

## 2. Current Architecture

### 2.1 Agency Creator Flow (JWT IS Used)

```
Browser → Node.js tRPC → Python FastAPI (extracts JWT from Bearer header)
  → Celery task(user_jwt=<full JWT>) → Redis queue (JWT in plaintext)
    → Worker: _llm_call() uses Bearer {user_jwt} to call Node.js /v1/chat/completions
    → Worker: _implement_agency() uses Bearer {user_jwt} to call /api/internal/agency/create
```

**4 HTTP calls use the JWT:**
- `_llm_discover()` → `_llm_call()` → POST `/v1/chat/completions` (Bearer)
- `_llm_design()` → `_llm_call()` → POST `/v1/chat/completions` (Bearer)
- `_llm_document()` → `_llm_call()` → POST `/v1/chat/completions` (Bearer)
- `_implement_agency()` → POST `/api/internal/agency/create` (Bearer)

### 2.2 Automation Copilot Flow (JWT NOT Used)

```
Browser → Node.js tRPC → Python FastAPI (receives JWT in request body, auth via x-proxy-token)
  → Celery task(user_jwt=<full JWT>) → Redis queue (JWT in plaintext)
    → Worker: uses LLMGatewayClient (X-Internal-Token, NOT user_jwt)
    → JWT is never read from the task argument
```

**The JWT is passed but completely unused.** The tasks already use `LLMGatewayClient` which authenticates via `X-Internal-Token`.

### 2.3 Existing Internal Auth Pattern

`LLMGatewayClient` (in `python-backend/app/services/llm_gateway_client.py`):
- Reads `SMARTSPEC_WEB_GATEWAY_TOKEN` from environment (via `settings.SMARTSPEC_WEB_GATEWAY_TOKEN`)
- Sends headers: `X-Internal-Token: {token}`, `X-User-Id: {user_id}`
- Node.js verifies via `verifyInternalToken()` with timing-safe comparison
- **NOTE:** The env var name is `SMARTSPEC_WEB_GATEWAY_TOKEN`, NOT `SMARTSPEC_WEB_GATEWAY_TOKEN`
- Already production-proven in Automation Copilot tasks

## 3. Implementation Strategy

Two phases, ordered by effort and risk:

### Phase 1: Automation Copilot — Remove Unused JWT (Low Risk)

Simply remove the `user_jwt` parameter everywhere in the chain. The JWT is passed but never consumed.

### Phase 2: Agency Creator — Switch to Internal Token (Medium Risk)

Replace Bearer JWT auth with `LLMGatewayClient` for LLM calls and `X-Internal-Token` + `X-User-Id` for the agency creation endpoint.

## 4. Phase 1: Automation Copilot (Remove Unused JWT)

### 4.1 Files to Change

| File | Change |
|------|--------|
| `python-backend/app/tasks/automation_copilot_task.py` | Remove `user_jwt` param from both task signatures |
| `python-backend/app/api/automation_copilot.py` | Remove `user_jwt` from `.delay()` calls and request body schema |
| `apps/web/server/routers/automationCopilot.ts` | Remove `userToken` from the body sent to Python API |

### 4.2 Task Signature Changes

**`automation_analyze_task`:**
- Remove: `user_jwt: str` parameter (line 78)
- All callers already pass `user_id` and `tenant_id` — no new params needed

**`automation_execute_task`:**
- Remove: `user_jwt: str` parameter (line 157)
- Same — `user_id` and `tenant_id` are already separate params

### 4.3 API Dispatch Changes

**`python-backend/app/api/automation_copilot.py`:**
- Remove `user_jwt` from the Pydantic request body model
- Remove `user_jwt` from `.delay()` argument lists
- Keep `user_id` and `tenant_id` (already present)

**`apps/web/server/routers/automationCopilot.ts`:**
- Remove `userToken` from the object sent to Python API in the `body` field
- Keep `userId` and `tenantId`

### 4.4 Testing

- Verify `automation_analyze_task` runs without `user_jwt`
- Verify `automation_execute_task` runs without `user_jwt`
- Verify LLM calls still work (they use `LLMGatewayClient`, not JWT)
- Verify no grep match for `user_jwt` in automation_copilot_task.py

## 5. Phase 2: Agency Creator (Switch to Internal Token)

### 5.1 Files to Change

| File | Change |
|------|--------|
| `python-backend/app/tasks/agency_creator_task.py` | Replace `user_jwt` with `user_id`, use `LLMGatewayClient` for LLM calls, use internal token for agency creation |
| `python-backend/app/api/agency_creator.py` | Remove `user_jwt` from `.delay()` calls |
| `apps/web/server/routes/internalApi.ts` (or wherever `/api/internal/agency/create` is) | Accept `X-Internal-Token` + `X-User-Id` auth (may already support this) |

### 5.2 Replace `_llm_call()` with LLMGatewayClient

The existing `_llm_call()` function in `agency_creator_task.py` is a raw `httpx` POST with Bearer JWT. Replace it with `LLMGatewayClient` which already handles:
- `X-Internal-Token` authentication (via `SMARTSPEC_WEB_GATEWAY_TOKEN`)
- `X-User-Id` header for user context
- Retry logic
- Error handling

**Current `_llm_call()`:**
```python
async def _llm_call(messages, model, user_jwt):
    headers = {"Authorization": f"Bearer {user_jwt}"}
    # POST to /v1/chat/completions with max_tokens
```

**New approach:**
```python
from app.services.llm_gateway_client import LLMGatewayClient

async def _llm_call(messages, model, user_id, max_tokens=None):
    client = LLMGatewayClient()
    # Uses X-Internal-Token + X-User-Id automatically
```

**CRITICAL: max_tokens compatibility.** The current `_llm_call()` passes `max_tokens` per call (1000 for discover, 4000 for design, 500 for document). `LLMGatewayClient.chat_completion()` may NOT support `max_tokens`. Before implementing:
1. Read `LLMGatewayClient.chat_completion()` signature
2. If `max_tokens` is not supported → add it to the client method and pass through to the request body
3. If supported → pass it through from each caller

Update all callers: `_llm_discover()`, `_llm_design()`, `_llm_document()` to pass `user_id` and `max_tokens` instead of `user_jwt`.

### 5.3 Replace `_implement_agency()` Auth

**Current:**
```python
headers = {"Authorization": f"Bearer {user_jwt}"}
# POST /api/internal/agency/create
```

**New:**
```python
headers = {
    "X-Internal-Token": os.environ.get("SMARTSPEC_WEB_GATEWAY_TOKEN", ""),
    "X-User-Id": str(user_id),
    "Content-Type": "application/json",
}
```

**Node.js side:** Check if `/api/internal/agency/create` already accepts `X-Internal-Token`. If not, add internal token verification to that endpoint (following the pattern in `verifyInternalToken()`).

### 5.4 Task Signature Changes

**`create_agency_discover_task`:**
- Remove: `user_jwt: str`
- Keep: `user_id: int` (already present)

**`create_agency_design_task`:**
- Remove: `user_jwt: str`
- Keep: `user_id: int` (already present)

### 5.5 API Dispatch Changes — ALL 3 Endpoints

**`python-backend/app/api/agency_creator.py` — `/start` endpoint (~line 70-94):**
- Remove `credentials: HTTPAuthorizationCredentials` dependency
- Remove `user_jwt = credentials.credentials` extraction (line 70)
- Remove `user_jwt` from `create_agency_discover_task.delay()` call
- **ALSO fix synchronous fallback** (lines 82-94): when Celery is unavailable, `_discover_async(task_id, user_jwt, ...)` is called in a daemon thread — update to pass `user_id` not `user_jwt`
- Keep `current_user.id` (already extracted via `Depends(get_current_user)`)

**`python-backend/app/api/agency_creator.py` — `/answer` endpoint (~line 145-172):**
- Remove `credentials: HTTPAuthorizationCredentials` dependency
- Remove `user_jwt = credentials.credentials` extraction (line 145)
- Remove `user_jwt` from `create_agency_design_task.delay()` call (line 157-159)
- **ALSO fix synchronous fallback** (lines 166-172): same daemon thread pattern

### 5.6 Chain Dispatch: Discover → Design

Currently, `_discover_async()` dispatches `create_agency_design_task.delay(user_jwt=user_jwt)`. After refactor:
- Remove `user_jwt` from the `.delay()` call
- `user_id` is already passed through the chain

### 5.7 Testing

- Verify agency creation flow end-to-end:
  1. Start agency creation from UI
  2. Verify discover phase completes (LLM calls work via internal token)
  3. Verify design phase completes (LLM calls + agency creation work)
  4. Verify created agency is functional
- Verify no `user_jwt` in Redis queue messages
- Verify no JWT in Celery worker logs

## 6. Node.js Internal Endpoint Verification

### 6.1 Fix `/api/internal/agency/create` — REQUIRED Node.js Change

**CONFIRMED:** This endpoint at `apps/web/server/_core/index.ts:734-749` accepts **only Bearer JWT auth** (via `sdk.authenticateRequest(req)` + cookie fallback). There is NO `X-Internal-Token` verification path.

**Must add internal token auth BEFORE changing the Python side:**
1. Add `X-Internal-Token` verification to the endpoint
2. Follow the pattern from `llmRoutes.ts:1219-1232` which already does this
3. Accept both Bearer JWT (for backward compat during migration) AND X-Internal-Token
4. When `X-Internal-Token` is present, get userId from `X-User-Id` header instead of JWT payload

### 6.2 Check LLM Gateway `/v1/chat/completions`

This endpoint already supports both:
- Bearer JWT (for browser clients)
- `X-Internal-Token` (for internal services)

The `LLMGatewayClient` uses the internal token path. No changes needed here.

## 7. Migration Safety

### 7.1 Backward Compatibility

**Not needed.** The change is internal — no public API changes, no database changes, no client changes. The task signature change only affects the Celery dispatch in the Python API layer.

### 7.2 Deployment Order — CRITICAL

**In-flight message handling:** Tasks already queued in Redis with old `user_jwt` positional arg will fail with `TypeError` when new workers start. Must handle this.

**Safe deployment procedure:**
1. **Step 1:** Deploy Node.js changes FIRST (add X-Internal-Token to `/api/internal/agency/create`)
2. **Step 2:** Drain Celery queues OR wait for in-flight tasks to complete:
   ```bash
   celery -A app.core.celery_app inspect active  # check active tasks
   celery -A app.core.celery_app purge -Q media   # purge if safe (confirm no important tasks)
   ```
3. **Step 3:** Deploy Python backend (new task signatures)
4. **Step 4:** Restart Celery workers

**Alternative (zero-downtime):** Two-step Python deploy:
- Deploy A: Workers accept BOTH old (with `user_jwt`) and new (without) signatures using `**kwargs`
- Deploy B: API stops sending `user_jwt`
- Deploy C: Remove `**kwargs` compatibility, clean signatures

### 7.3 Rollback

If issues arise: revert the Python backend commit. The old task signatures still work because the JWT was extracted from the same request that provides `user_id`.

## 8. Security Considerations

### 8.1 X-User-Id Spoofing Risk (Accepted with Mitigations)

Moving from per-user JWT to shared internal token changes the trust model:
- **JWT:** Each task authenticates as a specific user. Compromised worker can only impersonate users whose JWTs were in the queue.
- **Internal token:** Any caller with the shared token can set any X-User-Id. A compromised Python service can impersonate any user.

**This is acceptable ONLY IF:**
1. Nginx blocks ALL public access to `/api/internal/*` routes
2. `SMARTSPEC_WEB_GATEWAY_TOKEN` is ≥32 bytes random (`openssl rand -hex 32`)
3. Token rotation procedure is documented

### 8.2 Token Rotation

To rotate `SMARTSPEC_WEB_GATEWAY_TOKEN`:
1. Generate new token: `openssl rand -hex 32`
2. Update BOTH `python-backend/.env` AND `apps/web/.env`
3. Restart Python backend + Node.js simultaneously
4. Verify internal calls work

## 9. Verification Checklist

After implementation:
- [ ] `grep -r "user_jwt" python-backend/app/tasks/` returns 0 matches
- [ ] `grep -r "user_jwt" python-backend/app/api/agency_creator.py` returns 0 matches
- [ ] `grep -r "user_jwt" python-backend/app/api/automation_copilot.py` returns 0 matches
- [ ] Redis broker messages for agency tasks contain no JWT strings
- [ ] Agency creation from UI works end-to-end
- [ ] Automation copilot from UI works end-to-end
- [ ] Celery worker logs contain no JWT strings
- [ ] `SMARTSPEC_WEB_GATEWAY_TOKEN` is set in `.env` for both Node.js and Python (≥32 chars)
- [ ] **Nginx blocks `/api/internal/*` from public internet** (curl from external IP returns 403/404)
- [ ] `/api/internal/agency/create` accepts X-Internal-Token auth (verified via test)
- [ ] `console.error` in agency create endpoint sanitized (no request body fragments)

## 10. Out-of-Scope Follow-ups

| ID | Finding | Severity | Action |
|----|---------|----------|--------|
| R4 | `oidc_auth.py:42` — `TASKS_INTERNAL_TOKEN` uses `!=` (timing oracle) | MEDIUM | Fix: `hmac.compare_digest()` |
| R5 | `/api/internal/agency/create` — no rate limit | MEDIUM | Add per-user-id rate limit |
| R6 | `index.ts:891` — `console.error` may leak request fragments | LOW | Sanitize error output |
