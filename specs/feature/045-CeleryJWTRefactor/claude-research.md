# Feature 045: Remove JWT from Celery Task Arguments — JWT Flow Research Brief

**Date:** 2026-03-16
**Status:** Research Complete
**Scope:** SmartSpecPro JWT architecture and Celery task parameter passing

## Executive Summary

SmartSpecPro currently passes user JWT tokens as Celery task arguments in two places:

1. **Agency Creator tasks** (`agency_creator_task.py`: `create_agency_discover_task`, `create_agency_design_task`)
2. **Automation Copilot tasks** (`automation_copilot_task.py`: `automation_analyze_task`, `automation_execute_task`)

This practice is **problematic** because:
- JWT tokens are stored in Celery/Redis message queue in plaintext (security risk)
- Tokens should never be persisted at rest
- Task arguments are logged and visible in monitoring tools
- Existing internal service authentication pattern (X-Internal-Token) is already available

**This research identifies the complete JWT flow and proposes a secure refactor using existing internal token infrastructure.**

---

## 1. Current JWT Usage in Celery Tasks

### 1.1 Agency Creator Task Flow

**File:** `python-backend/app/tasks/agency_creator_task.py`

#### Task 1: DISCOVER Phase (lines 98-130)
```python
def create_agency_discover_task(
    self,
    task_id: str,
    user_jwt: str,          # <-- JWT passed as argument (PROBLEM)
    user_id: int,
    payload: dict,
):
```

**Where JWT is used:**
- Line 146: `intent = await _llm_discover(requirement, model, user_jwt)`
- Line 177: Intentionally NOT persisted to Redis (good practice)

**HTTP calls with JWT:**
- Lines 315-362: `_llm_call()` function sends JWT as Bearer token to Node.js LLM gateway
  ```python
  headers={"Authorization": f"Bearer {user_jwt}"}
  ```
  - Target: `{SMARTSPEC_WEB_GATEWAY_URL}/v1/chat/completions`
  - Used 3 times: `_llm_discover()`, `_llm_design()`, `_llm_document()`

#### Task 2: DESIGN Phase (lines 200-230)
```python
def create_agency_design_task(
    self,
    task_id: str,
    user_jwt: str,          # <-- JWT passed as argument
    user_id: int,
    payload: dict,
):
```

**Where JWT is used:**
- Line 247: `spec = await _llm_design(requirement, intent, answers, model, user_jwt)`
- Line 266: `agency_id = await _implement_agency(spec, user_jwt, tenant_id)`
- Line 286: `guide = await _llm_document(spec, model, user_jwt)`

**HTTP calls with JWT:**
- Line 599: `_implement_agency()` calls Node.js internal API to create agency
  ```python
  headers={
      "Authorization": f"Bearer {user_jwt}",
      "Content-Type": "application/json",
  },
  ```
  - Target: `/api/internal/agency/create` (Node.js Express endpoint)

#### Task dispatch (lines 72-76, 157-162, 168-173)
**File:** `python-backend/app/api/agency_creator.py`

```python
# Line 70: Extract bearer token from HTTP request
user_jwt = credentials.credentials  # From Authorization: Bearer <token>

# Line 72-77: Queue task with JWT
create_agency_discover_task.delay(
    task_id=task_id,
    user_jwt=user_jwt,              # <-- JWT arg
    user_id=current_user.id,
    payload=payload,
)
```

**Caller:** `apps/web/server/routers/` → FastAPI Python API → Celery task

---

### 1.2 Automation Copilot Task Flow

**File:** `python-backend/app/tasks/automation_copilot_task.py`

#### Task 1: ANALYZE Phase (lines 75-143)
```python
def automation_analyze_task(
    self,
    task_id: str,
    user_jwt: str,          # <-- JWT passed as argument (line 78 TODO comment!)
    user_id: int,
    tenant_id: str,
    prompt: str,
) -> dict:
```

**Note:** Line 78 has explicit TODO comment:
```python
user_jwt: str,  # TODO: Replace user_jwt with user_id + internal service token
```

**Where JWT is NOT used in this task:**
- The JWT is passed to `LLMGatewayClient()` inside the task
- But looking at the code, `_analyze()` at line 118 does NOT pass JWT to copilot
- JWT is available but appears unused in this task

#### Task 2: EXECUTE Phase (lines 153-307)
```python
def automation_execute_task(
    self,
    task_id: str,
    execution_id: str,
    user_jwt: str,          # <-- JWT passed as argument (line 157 TODO!)
    user_id: int,
    tenant_id: str,
    intent_json: str,
    vision_model: str,
    allowed_domains: list[str],
    browser_policy_context: dict | None = None,
    reservation_id: str | None = None,
) -> dict:
```

**Note:** Line 157 has same TODO comment

**Where JWT is NOT directly used:**
- JWT is passed but not extracted or used in the async function
- Services initialized at lines 171-214 use `LLMGatewayClient()`
- LLMGatewayClient uses `X-Internal-Token` auth, NOT user JWT

#### Task dispatch (lines 117-119, 191-202)
**File:** `python-backend/app/api/automation_copilot.py`

```python
# Line 94-96: Verify internal token (not user JWT!)
async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    x_proxy_token: Optional[str] = Header(None),
) -> None:
```

```python
# Line 118: Queue task with JWT
automation_analyze_task.delay(
    task_id, body.user_jwt, body.user_id, body.tenant_id, body.prompt
)

# Line 191-202: Queue task with JWT
automation_execute_task.delay(
    body.task_id,
    body.execution_id,
    body.user_jwt,          # <-- JWT arg
    body.user_id,
    body.tenant_id,
    ...
)
```

**Caller:** Node.js tRPC router (`automationCopilot.ts`) → Python FastAPI → Celery task

**Key insight:** FastAPI endpoint receives `user_jwt` from request body (sent by Node.js), but the endpoint itself is authenticated via `X-Internal-Token` header (not user JWT).

---

## 2. Complete JWT Call Chain

### 2.1 Agency Creator: Call Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ React Browser                                           │
│ POST /trpc/presentation.ai.autoCreateAgency             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Node.js tRPC Router (apps/web/server/routers/...)      │
│ ● Extracts user's bearer token from Authorization       │
│ ● Calls Python API                                      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Python FastAPI (python-backend/app/api/agency_creator) │
│ ● Endpoint: POST /api/v1/agency-creator/start           │
│ ● Receives: user_jwt from request.credentials           │
│ ● Auth: HTTPBearer (validates JWT is present)           │
│ ● Also: current_user = Depends(get_current_user)        │
└────────────────────────┬────────────────────────────────┘
                         │ (enqueues with user_jwt)
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Celery Queue (Redis)                                    │
│ ● create_agency_discover_task(user_jwt=JWT_STRING)      │
│ ● JWT stored in plaintext in Redis message              │
└────────────────────────┬────────────────────────────────┘
                         │ (worker picks up task)
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Celery Worker (python-backend worker)                   │
│ ● _llm_discover(user_jwt) → _llm_call(user_jwt)         │
│ ● POST to Node.js: /v1/chat/completions                 │
│   Headers: Authorization: Bearer {user_jwt}             │
│                                                         │
│ If no interview needed OR answers provided:             │
│   Dispatch create_agency_design_task(user_jwt=JWT)      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼ (if design phase)
┌─────────────────────────────────────────────────────────┐
│ Celery Worker (design phase)                            │
│ ● _design_async(user_jwt)                               │
│ ● POST /v1/chat/completions (3 calls for LLM)           │
│   Headers: Authorization: Bearer {user_jwt}             │
│                                                         │
│ ● _implement_agency(user_jwt)                           │
│   POST /api/internal/agency/create                      │
│   Headers: Authorization: Bearer {user_jwt}             │
│                                                         │
│ ● _llm_document(user_jwt)                               │
│   POST /v1/chat/completions                             │
│   Headers: Authorization: Bearer {user_jwt}             │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Automation Copilot: Call Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ React Browser                                           │
│ POST /trpc/automationCopilot.analyze                    │
└────────────────────────┬────────────────────────────────┘
                         │ (includes userToken from context)
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Node.js tRPC Router (automationCopilot.ts)              │
│ ● Extracts: ctx.userToken (from bearer token)           │
│ ● Does NOT pass JWT to Python directly!                 │
│ ● Calls Python: POST /api/v1/automation-copilot/analyze │
│   Headers: x-proxy-token (NOT user JWT)                 │
│   Body: { user_jwt: ctx.userToken, ... }                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Python FastAPI (python-backend/app/api/automation_...)  │
│ ● Endpoint: POST /api/v1/automation-copilot/analyze     │
│ ● Auth: _verify_internal_token (x-proxy-token)          │
│ ● Receives: body.user_jwt from request body             │
│ ● Also: body.user_id (not from get_current_user!)       │
└────────────────────────┬────────────────────────────────┘
                         │ (enqueues with user_jwt)
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Celery Queue (Redis)                                    │
│ ● automation_analyze_task(user_jwt=JWT_STRING)          │
│ ● JWT stored in plaintext in Redis message              │
└────────────────────────┬────────────────────────────────┘
                         │ (worker picks up task)
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Celery Worker                                           │
│ ● user_jwt is passed but NOT USED (bug?)                │
│ ● LLMGatewayClient() uses X-Internal-Token              │
│ ● NO calls to Node.js with user_jwt as Bearer token     │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Node.js Endpoints That Receive JWT

### 3.1 LLM Gateway Endpoint

**Endpoint:** `POST /v1/chat/completions`
**Location:** `apps/web/server/_core/llmRoutes.ts`
**Auth Method:** JWT Bearer token (from Authorization header)

**How it works:**
1. Client sends: `Authorization: Bearer <JWT>`
2. Node.js extracts token from header (no explicit code shown, likely via middleware)
3. tRPC/Express validates token
4. Token used for:
   - User identification (credit tracking)
   - Rate limiting (per-user)
   - Audit logging (traceId)

**Called by:**
- Agency Creator: 3+ times per session (discover, design, document)
- Automation Copilot: indirectly (via LLMGatewayClient)

### 3.2 Internal Agency Creation Endpoint

**Endpoint:** `POST /api/internal/agency/create`
**Location:** Referenced in `agency_creator_task.py` line 599
**Auth Method:** JWT Bearer token (from Authorization header)

**Code:**
```python
# agency_creator_task.py line 598-604
create_resp = await client.post(
    f"{internal_url}/api/internal/agency/create",
    json=body_json,
    headers={
        "Authorization": f"Bearer {user_jwt}",
        "Content-Type": "application/json",
    },
)
```

**Purpose:** Create agency record in database on behalf of the user

---

## 4. Existing Internal Token Infrastructure

### 4.1 X-Internal-Token Pattern

**Location:** Already in use throughout codebase

#### Python side (LLMGatewayClient)
**File:** `python-backend/app/services/llm_gateway_client.py` (lines 65-82)

```python
def _build_headers(
    self,
    user_id: int | None = None,
    tenant_id: str | None = None,
    trace_id: str | None = None,
) -> dict[str, str]:
    """Build request headers for internal auth."""
    tid = trace_id or uuid.uuid4().hex[:32]
    headers: dict[str, str] = {
        "X-Internal-Token": self._token,        # <-- Service auth
        "x-trace-id": tid,
        "Content-Type": "application/json",
    }
    if user_id is not None:
        headers["X-User-Id"] = str(user_id)     # <-- User context
    if tenant_id is not None:
        headers["X-Tenant-Id"] = str(tenant_id) # <-- Tenant context
    return headers
```

**Token source:** `settings.SMARTSPEC_WEB_GATEWAY_TOKEN`

#### Node.js side (Automation Copilot router)
**File:** `apps/web/server/routers/automationCopilot.ts` (lines 29-57)

```python
// Line 31: Service token from env
const PROXY_TOKEN =
  process.env.SMARTSPEC_PROXY_TOKEN ||
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ||
  "";

// Lines 36-57: Call Python backend with internal token
async function callPythonBackend(
  path: string,
  options: { method, body?, timeoutMs? },
): Promise<Response> {
  return await fetch(`${PY_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(PROXY_TOKEN ? { "x-proxy-token": PROXY_TOKEN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  });
}
```

### 4.2 Existing Internal Token Verification

**File:** `apps/web/server/_core/llmRoutes.ts` (lines 1219-1232)

```typescript
/**
 * Verify X-Internal-Token header using timing-safe comparison.
 * Returns true if the token is valid, false otherwise.
 */
const verifyInternalToken = (req: Request): boolean => {
  const token = req.headers["x-internal-token"];
  if (!token || typeof token !== "string") return false;

  const expected = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || "";
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(expected)
  );
};
```

### 4.3 Existing Bearer Token Creation Pattern

**File:** `apps/web/server/_core/tokens.ts` (lines 127-145)

```typescript
/**
 * Create a short-lived internal bearer token from an AuthContext.
 * Used to call service functions that still expect a userToken string
 * (e.g., Python backend communication via X-User-Token header).
 */
export function createInternalTokenFromAuth(
  auth: { userId: number },
  scopes?: string[],
): string {
  return signBearerToken(
    {
      sub: String(auth.userId),
      type: "access",
      scopes: scopes ?? ["media:generate", "presentation:export"],
      jti: `api_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m",
  );
}
```

**Key:** This already exists and creates **fresh, short-lived tokens** instead of passing stale ones through queue systems.

---

## 5. JWT Verification on Node.js Side

### 5.1 How Bearer Tokens are Verified

**File:** `apps/web/server/_core/context.ts` (lines 21-85)

```typescript
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let userToken: string | null = null;

  // Extract bearer token from Authorization header
  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    userToken = authHeader.substring(7);  // <-- Token extracted here
  } else {
    // Fall back to session cookie
    const cookieHeader = opts.req.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader);
      const sessionCookie = cookies[COOKIE_NAME];
      if (sessionCookie) {
        userToken = sessionCookie;
      }
    }
  }

  try {
    user = await sdk.authenticateRequest(opts.req);  // <-- Validates token
  } catch (error) {
    user = null;
    userToken = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    userToken,  // <-- Token stored in context
    tenantId,
    publicUrl,
  };
}
```

### 5.2 Python Authentication

**File:** `python-backend/app/core/auth.py` (lines 104-188)

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get current authenticated user
    Verifies the bearer token is valid and user exists in database.
    """
    token = credentials.credentials
    payload = verify_jwt_token(token)  # <-- Validates signature + expiry
    ...
    user = await db.query(User).where(User.id == user_id).first()
    return user
```

---

## 6. HTTP Call Sites Using User JWT

### 6.1 Agency Creator HTTP Calls

| Site | File | Line | Target | Method | Header | Purpose |
|------|------|------|--------|--------|--------|---------|
| `_llm_call()` | `agency_creator_task.py` | 315-362 | `{gateway}/v1/chat/completions` | POST | `Authorization: Bearer {user_jwt}` | LLM inference (DISCOVER phase) |
| `_llm_call()` | `agency_creator_task.py` | 315-362 | `{gateway}/v1/chat/completions` | POST | `Authorization: Bearer {user_jwt}` | LLM inference (DESIGN phase) |
| `_llm_call()` | `agency_creator_task.py` | 315-362 | `{gateway}/v1/chat/completions` | POST | `Authorization: Bearer {user_jwt}` | LLM inference (DOCUMENT phase) |
| `_implement_agency()` | `agency_creator_task.py` | 598-604 | `{internal_url}/api/internal/agency/create` | POST | `Authorization: Bearer {user_jwt}` | Create agency in database |

### 6.2 Automation Copilot HTTP Calls

| Site | File | Line | Target | Method | Header | Purpose |
|------|------|------|--------|--------|--------|---------|
| `_verify_internal_token()` | `automation_copilot.py` | 40-54 | N/A | N/A | `x-internal-token` | FastAPI endpoint auth (NOT user JWT) |
| (none) | `automation_copilot_task.py` | N/A | N/A | N/A | (JWT unused) | TODO: Was intended for LLM calls, now uses LLMGatewayClient |

---

## 7. Data Flow for JWT Token Context

### 7.1 Where User JWT Comes From

```
React Browser
    ↓ (includes Authorization: Bearer <JWT>)
Node.js tRPC Endpoint
    ↓ (context.userToken = authHeader.substring(7))
tRPC Router Procedure (ctx.userToken available)
    ↓ (passes to Python backend)
Python FastAPI Endpoint
    ↓ (receives body.user_jwt from request)
Celery Task Argument (stored in Redis plaintext)
    ↓ (worker picks up task)
Celery Worker
    ↓ (uses JWT for outbound HTTP calls)
Node.js /v1/chat/completions (validates JWT signature)
```

### 7.2 JWT Claims Structure

From `apps/web/server/_core/tokens.ts` (lines 18-25):

```typescript
export interface TokenClaims {
  sub: string;        // User ID as string
  type?: string;      // "access" or "refresh"
  scopes?: string[];  // Permission scopes
  jti?: string;       // JWT ID (unique per token)
  exp?: number;       // Expiration timestamp
  iat?: number;       // Issued-at timestamp
}
```

### 7.3 What Node.js Extracts from JWT

From `apps/web/server/_core/sdk.ts` (line 44):

```typescript
user = await sdk.authenticateRequest(opts.req);
// Returns: User object with id, email, name, loginMethod, lastSignedIn
```

---

## 8. Why Current Approach is Problematic

### Security Issues

1. **Plaintext storage in Redis:** JWT tokens stored in Celery message queue (Redis) without encryption
   - Redis snapshots contain raw tokens
   - Queue inspection tools expose tokens
   - If Redis is compromised, all in-flight tokens leak

2. **Long exposure window:** Token remains in queue until task completes
   - Agency Creator tasks: up to 10 minutes
   - Automation Copilot tasks: up to 5+ minutes
   - If task crashes/retries, token persists for TTL (2 hours in Redis)

3. **Logging and monitoring:** Celery monitoring tools (Flower) and logs may show task arguments
   - Token could appear in:
     - Celery worker logs
     - Task history/replay
     - Error messages
     - Monitoring dashboards

4. **Token reuse pattern:** Same token used for multiple HTTP calls across task lifecycle
   - No per-call token isolation
   - Single token compromise affects all LLM calls in that task

### Architectural Issues

1. **Violates principle of least privilege:** Task gets full user JWT instead of scoped permissions
2. **Not needed for Automation Copilot:** JWT is passed but not used in analyze/execute tasks
3. **Inconsistent auth:**
   - Agency Creator: Bearer JWT per-call
   - Automation Copilot: X-Internal-Token for endpoint, unused JWT in task
4. **Difficult to rotate:** Changing token strategy requires task queue migration

---

## 9. Recommended Refactor Pattern

### 9.1 New Approach: Internal Service Tokens

**Replace:**
```python
# Current: Pass JWT as argument
create_agency_discover_task.delay(
    task_id=task_id,
    user_jwt=user_jwt,  # <-- REMOVE
    user_id=current_user.id,
    payload=payload,
)
```

**With:**
```python
# Proposed: Pass user context only
create_agency_discover_task.delay(
    task_id=task_id,
    user_id=current_user.id,  # Keep only user ID
    tenant_id=current_user.tenant_id,  # Add tenant context
    payload=payload,
)

# At task runtime: Generate short-lived internal token
internal_token = create_internal_token(
    user_id=user_id,
    tenant_id=tenant_id,
    scopes=["media:generate", "llm:chat"]
)
# Then use: internal_token for Node.js calls
```

### 9.2 Implementation Options

**Option A: Service-to-Service Internal Token**
- Use existing `X-Internal-Token` + `X-User-Id` + `X-Tenant-Id` pattern
- Node.js LLM gateway already accepts this (llmRoutes.ts line 1239)
- Requires adding new endpoint to Node.js for internal auth

**Option B: Generate Fresh Bearer Token at Task Runtime**
- Use `createInternalTokenFromAuth()` from `tokens.ts` pattern
- Generate 15-minute token with user context
- Pass token via header instead of storing in queue
- Less infrastructure changes

**Option C: HTTP Proxy Pattern**
- Don't pass token at all through Celery
- Celery task makes HTTP request to intermediate Node.js endpoint
- Node.js endpoint validates user_id + tenant_id, generates token
- Celery task uses returned token for immediate use
- More secure (token never in queue), more latency

### 9.3 Phase-Based Implementation

**Phase 1 (Week 1):**
- Add internal token endpoint to Node.js (if not exists)
- Modify Agency Creator to use Option A or B
- Keep Automation Copilot as-is (JWT currently unused)

**Phase 2 (Week 2):**
- Remove JWT argument from Automation Copilot tasks
- Update task dispatch code (automationCopilot.ts, automation_copilot.py)

**Phase 3 (Week 3+):**
- Audit for any other Celery tasks passing sensitive data
- Update Celery monitoring/logging to redact headers
- Add encryption for task arguments (optional hardening)

---

## 10. Risks & Considerations

### 10.1 Compatibility Risks

1. **Token expiration:** Internal tokens expire in 15 minutes
   - Agency Creator can exceed 15 min (interview phase)
   - Solution: Use longer expiry (e.g., 1 hour) for internal tokens, or refresh tokens in task

2. **Node.js endpoint changes:** If LLM gateway endpoint signature changes, tokens won't work
   - Solution: Keep bearer token support indefinitely (low risk)

3. **Rate limiting:** User rate limits tied to user ID, not token
   - Solution: Pass user_id in headers, no change needed

4. **Audit logging:** May need to update traceId correlation for internal tokens
   - Solution: Use same X-Request-ID pattern for internal calls

### 10.2 Behavioral Changes

1. **Celery task argument logging:** Logs will no longer contain JWT
   - **Good:** Reduces security surface
   - **Bad:** Harder to debug task failures related to auth
   - **Mitigation:** Use X-Request-ID and user_id for debugging

2. **Task monitoring:** Flower dashboard won't show sensitive token data
   - **Good:** Improved security posture
   - **Bad:** May confuse operators familiar with JWT-based monitoring
   - **Mitigation:** Document new auth pattern in runbooks

### 10.3 Implementation Gotchas

1. **Scope creep:** If endpoint expects specific scopes in JWT, internal token must have them
   - LLM gateway currently only checks user context, not scopes (safe)

2. **Multi-task scenarios:** If Agency Creator dispatches Design task, must pass credentials
   - Current code already does this (line 157-162)
   - With new pattern: pass user_id/tenant_id, recreate token in child task

3. **Python backend version mismatch:** Python needs to accept new auth headers
   - Currently does: LLMGatewayClient already uses X-Internal-Token pattern

4. **Database lookups:** Internal token needs user_id to exist in database
   - Should always be true (user created task in first place)

---

## 11. Code Review Checklist for Refactor

### Before Implementation

- [ ] Identify all HTTP calls from Celery tasks to Node.js endpoints
- [ ] Document required token scopes for each endpoint
- [ ] Check if any endpoints validate token expiry (unlikely)
- [ ] Verify Node.js can accept new auth pattern (X-Internal-Token + X-User-Id)

### During Implementation

- [ ] Remove user_jwt parameter from task signatures
- [ ] Update task dispatch code in Python API endpoints
- [ ] Update task dispatch code in Node.js tRPC routers
- [ ] Add token generation at task runtime
- [ ] Update HTTP calls to use new auth pattern
- [ ] Add integration tests for new auth flow
- [ ] Update Celery task monitoring (Flower configs)

### After Implementation

- [ ] Run full E2E tests for Agency Creator workflow
- [ ] Run full E2E tests for Automation Copilot workflow
- [ ] Check Celery worker logs for auth errors
- [ ] Verify tRPC audit logs still contain correct user IDs
- [ ] Check Node.js LLM gateway rate limiting still works per-user
- [ ] Performance test: Ensure token generation doesn't add latency

---

## 12. File Summary & Required Changes

### Files Requiring Changes

| File | Lines | Change | Priority |
|------|-------|--------|----------|
| `python-backend/app/tasks/agency_creator_task.py` | 98-230 | Remove `user_jwt` param, generate at runtime | P0 |
| `python-backend/app/api/agency_creator.py` | 70-76, 157-162 | Stop passing `user_jwt` to task | P0 |
| `python-backend/app/tasks/automation_copilot_task.py` | 75-307 | Remove unused `user_jwt` param | P1 |
| `python-backend/app/api/automation_copilot.py` | 94-96, 117-119, 191-202 | Stop passing `user_jwt` to task | P1 |
| `apps/web/server/routers/automationCopilot.ts` | 115-122, 230-245 | Stop passing `user_jwt` in request body | P1 |
| `apps/web/server/_core/tokens.ts` | (no change) | Add internal token endpoint if needed | P2 |
| `apps/web/server/_core/llmRoutes.ts` | (no change) | Verify X-Internal-Token validation | P2 |

### Files for Reference (No Changes)

| File | Purpose |
|------|---------|
| `python-backend/app/core/auth.py` | JWT verification (used by endpoints) |
| `python-backend/app/services/llm_gateway_client.py` | Already uses X-Internal-Token pattern |
| `python-backend/app/api/internal_library.py` | Internal token verification |
| `apps/web/server/_core/context.ts` | Token extraction (keep as-is) |
| `apps/web/server/_core/sdk.ts` | User auth (keep as-is) |

---

## Appendix A: Token Formats & Comparison

### Current: User JWT (Bearer Token)
```
Format: Signed JWT (RS256 or HS256)
Signed by: Node.js JWT_SECRET
Content: { sub, type, scopes, jti, exp, iat }
Validation: Signature check + expiry check
Used by: LLM gateway, agency creation endpoint
Stored in: Celery Redis queue (PROBLEM)
Lifespan: ~1 hour
```

### Proposed: Internal Token (Options)

**Option A: X-Internal-Token Header**
```
Format: Simple string (no structure)
Secret: SMARTSPEC_WEB_GATEWAY_TOKEN (env var)
Validation: Timing-safe string comparison
Used by: Python backend → Node.js (already exists)
Stored in: Config/env vars
Lifespan: N/A (no expiry)
+ Already implemented, no changes to Node.js
- Monolithic (not per-user scoped)
- No expiry if compromised
```

**Option B: Short-lived Bearer Token (Fresh)**
```
Format: Signed JWT (HS256)
Signed by: Node.js JWT_SECRET (at task runtime)
Content: { sub=user_id, type="internal", scopes, exp=15m }
Validation: Signature check + expiry check
Used by: Celery task → Node.js (new)
Stored in: Task local memory only
Lifespan: 15 minutes
+ Fine-grained per-user, short expiry
+ Leverages existing token infrastructure
- Requires token generation in Celery (new dependency on crypto)
- Need to export signBearerToken or equivalent to Python
```

---

## Appendix B: LLMGatewayClient Implementation Details

**Current usage in Celery:**
```python
# automation_copilot_task.py lines 96, 182
gateway = LLMGatewayClient()
# Uses SMARTSPEC_WEB_GATEWAY_TOKEN for auth (X-Internal-Token header)
# user_id passed via X-User-Id header
```

**Where LLMGatewayClient is initialized:**
- `automation_copilot_task.py`: Lines 96, 182
- Other Python services that need LLM calls

**Headers sent by LLMGatewayClient:**
```python
headers: dict[str, str] = {
    "X-Internal-Token": self._token,      # Service account token
    "x-trace-id": tid,                     # Tracing
    "Content-Type": "application/json",
    # user_id/tenant_id added if provided:
    "X-User-Id": str(user_id),
    "X-Tenant-Id": str(tenant_id),
}
```

**This pattern is already production-proven and can be extended to Agency Creator tasks.**

---

## Appendix C: Node.js Internal Endpoint Requirements

To fully implement Option A (X-Internal-Token pattern), Node.js may need:

1. **New endpoint for internal agency creation** (if not already exists):
   ```typescript
   POST /api/internal/agencies/create
   Headers: X-Internal-Token, X-User-Id, X-Tenant-Id
   Auth: verifyInternalToken(req)
   ```

2. **Or modify existing endpoint** to accept internal token:
   ```typescript
   // Current: POST /api/internal/agency/create (expects Bearer JWT)
   // Modified to also accept X-Internal-Token + X-User-Id
   ```

3. **No changes needed** to LLM gateway (/v1/chat/completions):
   - Can already accept Bearer token
   - Can extend to accept X-Internal-Token + X-User-Id

---

## Conclusion

SmartSpecPro currently passes user JWT tokens through Celery task arguments, which is a security anti-pattern. The codebase already has mature internal service-to-service authentication infrastructure (X-Internal-Token + X-User-Id pattern used by LLMGatewayClient).

**Recommended action:** Implement **Option A or B** to replace user JWT with internal service tokens:
- Remove `user_jwt` from Celery task signatures
- Generate short-lived tokens at task runtime
- Use existing Node.js token validation infrastructure
- Reduce security surface by eliminating plaintext token storage in Redis

**Estimated effort:**
- Analysis & planning: 4 hours (done)
- Implementation: 6-8 hours
- Testing & integration: 4 hours
- Total: 14-16 hours (1-2 sprint days)

**Risk level:** Low (existing patterns, backward-compatible changes)

