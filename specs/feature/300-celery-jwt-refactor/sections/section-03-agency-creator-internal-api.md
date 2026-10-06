# Section 03: Agency Creator Internal API Auth

## Overview
Update `_implement_agency()` to use `X-Internal-Token` + `X-User-Id` instead of Bearer JWT for the `/api/internal/agency/create` endpoint. Ensure the Node.js endpoint accepts this auth method.

## Context
The `_implement_agency()` function makes an HTTP POST to the Node.js server at `/api/internal/agency/create` using Bearer JWT auth. This is the last remaining use of `user_jwt` in the agency creator flow (LLM calls were migrated in Section 02).

## Implementation

### Step 1: Check Node.js internal endpoint auth

**Find the endpoint:** Search for `/api/internal/agency/create` in the Node.js codebase:
```bash
grep -rn "internal/agency" apps/web/server/ --include="*.ts"
```

**Check if it already accepts X-Internal-Token:**
- If yes → no Node.js changes needed
- If only Bearer JWT → add internal token verification

### Step 2: Add internal token auth to Node.js endpoint (if needed)

If the endpoint only accepts Bearer JWT, add support for `X-Internal-Token`:

**Pattern to follow** (from existing internal endpoints):
```typescript
function verifyInternalOrBearerAuth(req) {
  const internalToken = req.headers['x-internal-token'];
  if (internalToken) {
    // Verify against SMARTSPEC_WEB_GATEWAY_TOKEN env var with timing-safe comparison
    // Get userId from X-User-Id header
    return { userId: req.headers['x-user-id'], authMethod: 'internal' };
  }
  // Fall back to Bearer JWT verification
  return verifyBearerToken(req);
}
```

### Step 3: Update _implement_agency() in Python

**File:** `python-backend/app/tasks/agency_creator_task.py`

**Current (~line 544):**
```python
async def _implement_agency(spec: dict, user_jwt: str, tenant_id: str = "") -> str | None:
    headers = {
        "Authorization": f"Bearer {user_jwt}",
        "Content-Type": "application/json",
    }
```

**New:**
```python
async def _implement_agency(spec: dict, user_id: int, tenant_id: str = "") -> str | None:
    from app.core.config import settings
    headers = {
        "X-Internal-Token": settings.SMARTSPEC_WEB_GATEWAY_TOKEN,
        "X-User-Id": str(user_id),
        "Content-Type": "application/json",
    }
```

### Step 4: Update caller

In `_design_async()` where `_implement_agency()` is called:
- Change: `_implement_agency(spec, user_jwt, tenant_id)`
- To: `_implement_agency(spec, user_id, tenant_id)`

### Step 5: Verify SMARTSPEC_WEB_GATEWAY_TOKEN is configured

Check both `.env` files:
- `python-backend/.env` — should have `SMARTSPEC_WEB_GATEWAY_TOKEN=...`
- `apps/web/.env` — should have same `SMARTSPEC_WEB_GATEWAY_TOKEN=...`

If missing, this is a deployment blocker — add to `.env.example` files.

## Tests (TDD)

```python
# test_agency_creator_security.py

from unittest.mock import patch, AsyncMock
import os

@patch.dict(os.environ, {"SMARTSPEC_WEB_GATEWAY_TOKEN": "test-internal-token"})
@patch("httpx.AsyncClient.post")
async def test_implement_agency_uses_internal_token(mock_post):
    mock_post.return_value = AsyncMock(
        status_code=200,
        json=lambda: {"success": True, "agencyId": "test-123"}
    )

    from app.tasks.agency_creator_task import _implement_agency
    result = await _implement_agency({"name": "test"}, user_id=42, tenant_id="t1")

    # Verify headers
    call_kwargs = mock_post.call_args
    headers = call_kwargs.kwargs.get("headers", {}) or call_kwargs[1].get("headers", {})
    assert "X-Internal-Token" in headers
    assert headers["X-Internal-Token"] == "test-internal-token"
    assert headers["X-User-Id"] == "42"
    assert "Authorization" not in headers  # No Bearer JWT!
```

### Step 6: Verify Nginx blocks /api/internal/* from public

```bash
# From EXTERNAL network (not the server itself):
curl -s -o /dev/null -w "%{http_code}" https://smartaihub.app/api/internal/agency/create
# Expected: 403 or 404 (NOT 401 — that means it reached the endpoint)
```

If Nginx does NOT block, add to `nginx/conf.d/dev-host.conf`:
```nginx
location /api/internal/ {
    allow 127.0.0.1;
    allow ::1;
    deny all;
    proxy_pass http://localhost:3000;
}
```

## Risks & Mitigations
- **Risk:** Node.js endpoint rejects X-Internal-Token → CONFIRMED: must add auth path first
- **Mitigation:** Deploy Node.js changes BEFORE Python changes
- **Risk:** SMARTSPEC_WEB_GATEWAY_TOKEN not set in production
- **Mitigation:** Check both .env files, add to deployment checklist, enforce ≥32 chars
- **Risk:** X-User-Id spoofing by attacker with token
- **Mitigation:** Nginx blocks /api/internal/* from public internet (primary defense)
- **Risk:** In-flight Celery messages with old signature cause TypeError
- **Mitigation:** Drain queue or use 2-step deploy (see plan Section 7.2)
