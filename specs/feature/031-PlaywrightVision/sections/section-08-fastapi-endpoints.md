I now have enough context. Here is the section content:

# Section 08: FastAPI Endpoints

## Overview

This section implements five FastAPI endpoints that expose the Automation Copilot functionality to the Node.js tRPC layer. All endpoints use `X-Internal-Token` header authentication (not user-facing), follow the existing `browser.py` internal-token pattern, and enforce tenant isolation on every request.

**File to create:** `python-backend/app/api/automation_copilot.py`
**File to modify:** `python-backend/app/main.py` (register the new router)
**Test file to create:** `python-backend/tests/integration/test_automation_copilot_api.py`

## Dependencies

This section depends on:
- **Section 07 (Celery Tasks):** The `automation_analyze_task` and `automation_execute_task` Celery tasks must exist in `python-backend/app/tasks/automation_copilot_task.py`. The endpoints enqueue these tasks via `.delay()`.
- **Section 01 (Exceptions):** Uses `FeatureDisabledError` from `python-backend/app/services/automation_exceptions.py`.

Redis is used for status storage (key pattern `automation:{task_id}`) and cancellation signalling (key pattern `automation:{task_id}:cancel`).

## Tests FIRST

Create `python-backend/tests/integration/test_automation_copilot_api.py`.

The tests use FastAPI's `TestClient` with mocked Celery tasks and Redis. The internal token is verified via `secrets.compare_digest` against `settings.SMARTSPEC_PROXY_TOKEN`.

```python
"""Integration tests for Automation Copilot FastAPI endpoints.

Tests:
  - Auth: 401 without X-Internal-Token, valid token passes
  - Feature flag: 403 when automation copilot disabled
  - /analyze: 200 + enqueues task
  - /status: 404 for unknown, 403 for cross-tenant, 200 with data
  - /execute: 200 + enqueues execution task
  - /cancel: sets Redis cancel key with TTL
  - /templates: tenant isolation + cursor pagination
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


VALID_TOKEN = "test-internal-token-abc"
ENDPOINT_PREFIX = "/api/v1/automation-copilot"


@pytest.fixture
def internal_headers():
    """Headers with valid X-Internal-Token."""
    return {"X-Internal-Token": VALID_TOKEN}


class TestAnalyzeEndpoint:
    """POST /api/v1/automation-copilot/analyze"""

    def test_returns_401_without_internal_token(self, client):
        """Requests without X-Internal-Token header are rejected."""
        ...

    def test_returns_403_if_feature_flag_disabled(self, client, internal_headers):
        """When automation copilot feature flag is off, return 403."""
        ...

    def test_returns_200_and_enqueues_task(self, client, internal_headers):
        """Valid request returns task_id and calls automation_analyze_task.delay()."""
        ...


class TestStatusEndpoint:
    """GET /api/v1/automation-copilot/status/{task_id}"""

    def test_returns_404_for_unknown_task_id(self, client, internal_headers):
        """Unknown task_id returns 404."""
        ...

    def test_returns_403_if_tenant_id_mismatch(self, client, internal_headers):
        """Cross-tenant access is blocked (tenant_id in query != stored tenant_id)."""
        ...

    def test_returns_current_status_from_redis(self, client, internal_headers):
        """Returns the full status dict from Redis for a valid task."""
        ...


class TestExecuteEndpoint:
    """POST /api/v1/automation-copilot/execute"""

    def test_returns_200_and_enqueues_execution_task(self, client, internal_headers):
        """Valid request enqueues automation_execute_task and returns ok."""
        ...


class TestCancelEndpoint:
    """POST /api/v1/automation-copilot/cancel/{task_id}"""

    def test_sets_redis_cancel_key_with_ttl(self, client, internal_headers):
        """Cancel sets automation:{task_id}:cancel = '1' with TTL 3600s."""
        ...


class TestTemplatesEndpoint:
    """GET /api/v1/automation-copilot/templates"""

    def test_returns_only_tenants_own_templates(self, client, internal_headers):
        """Templates are filtered by tenant_id -- no cross-tenant leakage."""
        ...

    def test_uses_timestamp_cursor_pagination(self, client, internal_headers):
        """Pagination uses created_at cursor, not offset/UUID."""
        ...
```

Each test should mock:
- `settings.SMARTSPEC_PROXY_TOKEN` to equal `VALID_TOKEN`
- Celery task `.delay()` calls (assert they are called with expected args)
- Redis get/set operations (use `fakeredis` or `unittest.mock`)
- Database queries for templates (mock the SQLAlchemy async session)

## Implementation Details

### Router File: `python-backend/app/api/automation_copilot.py`

Create a FastAPI `APIRouter` with prefix `/api/v1/automation-copilot` and five endpoints.

#### Internal Token Verification

Reuse the same pattern from `python-backend/app/api/browser.py`. The `_verify_internal_token` dependency reads `X-Internal-Token` or `X-Proxy-Token` from headers and compares against `settings.SMARTSPEC_PROXY_TOKEN` using `secrets.compare_digest()`. Returns 401 on missing/invalid token.

```python
async def _verify_internal_token(
    x_internal_token: str | None = Header(None),
    x_proxy_token: str | None = Header(None),
) -> None:
    """Verify internal service token. Raises 401 on failure."""
    ...
```

#### Pydantic Request/Response Models

```python
class AnalyzeRequest(BaseModel):
    """POST /analyze request body."""
    prompt: str = Field(..., min_length=1, max_length=10000)
    tenant_id: str = Field(..., max_length=100)
    user_id: int
    user_jwt: str

class ExecuteRequest(BaseModel):
    """POST /execute request body."""
    task_id: str
    execution_id: str
    intent_json: str
    user_jwt: str
    tenant_id: str = Field(..., max_length=100)
    user_id: int
    vision_model: str = Field(default="gpt-4o", max_length=100)
    allowed_domains: list[str] = Field(default_factory=list)

class CancelRequest(BaseModel):
    """POST /cancel/{task_id} request body."""
    tenant_id: str = Field(..., max_length=100)

class TemplateQuery(BaseModel):
    """GET /templates query params (use Query() in endpoint signature)."""
    tenant_id: str
    limit: int = Field(default=20, le=100, ge=1)
    cursor: str | None = None  # ISO timestamp string for cursor pagination
```

#### Endpoint 1: POST /analyze

Accepts `AnalyzeRequest`. Generates a unique `task_id` (format: `auto-{uuid4().hex[:12]}`). Stores initial status in Redis (`automation:{task_id}` with TTL 3600s, status "queued"). Calls `automation_analyze_task.delay(task_id, user_jwt, user_id, tenant_id, prompt)`. Returns `{"task_id": task_id}`.

Before enqueuing, check the feature flag. If disabled, return 403 with error body `{"error": "Automation Copilot is disabled", "code": "feature_disabled"}`.

The feature flag check queries Redis or a settings store for the tenant's `automationCopilot` flag. If the flag mechanism is not yet implemented, use a simple Redis key `feature_flag:automationCopilot:{tenant_id}` or accept a request-body field forwarded by the tRPC layer.

#### Endpoint 2: GET /status/{task_id}

Reads Redis key `automation:{task_id}`. Returns 404 if key does not exist. Parses the stored JSON and checks that `tenant_id` in the query parameter matches the stored `tenant_id`. Returns 403 on mismatch. Otherwise returns the full status object (stripping any keys prefixed with `_`).

The `tenant_id` is passed as a query parameter: `?tenant_id=xxx`.

Response shape:
```json
{
  "status": "analyzing|generating|running|success|failed|healed|needs_clarification|preview_ready",
  "intent": { ... },
  "plan_summary": "...",
  "questions": ["..."],
  "extracted_data": { ... },
  "error": "...",
  "actual_credits_used": 42
}
```

#### Endpoint 3: POST /execute

Accepts `ExecuteRequest`. Calls `automation_execute_task.delay(task_id, execution_id, user_jwt, user_id, tenant_id, intent_json, vision_model, allowed_domains)`. Returns `{"ok": true}`.

#### Endpoint 4: POST /cancel/{task_id}

Accepts `CancelRequest`. Sets Redis key `automation:{task_id}:cancel` to `"1"` with TTL 3600 seconds. The running Celery task polls this key between actions and raises `CancellationRequestedError` when found. Returns `{"cancelled": true}`.

Also validates that the requesting `tenant_id` matches the stored execution's `tenant_id` (read from `automation:{task_id}`). Returns 403 on mismatch, 404 if task not found.

#### Endpoint 5: GET /templates

Query parameters: `tenant_id` (required), `limit` (default 20, max 100), `cursor` (optional ISO timestamp string).

Queries the `automation_templates` PostgreSQL table. Filters by `tenant_id = :tenant_id`. If `cursor` is provided, adds `WHERE created_at < :cursor`. Orders by `created_at DESC`. Limits to `limit + 1` rows (to detect if there is a next page).

Returns:
```json
{
  "templates": [ ... ],
  "next_cursor": "2026-03-05T12:34:56Z"
}
```

If `limit + 1` rows were returned, pop the last row and set `next_cursor` to that row's `created_at`. Otherwise `next_cursor` is null.

This endpoint reads from PostgreSQL (not Redis), so it needs an async database session. Use the existing `get_async_session` dependency pattern from the codebase.

#### Error Response Convention

All error responses follow the existing project convention:
```json
{"error": "Human-readable message", "code": "machine_readable_code"}
```

Error codes used:
- `"unauthorized"` -- 401, missing/invalid internal token
- `"feature_disabled"` -- 403, automation copilot turned off
- `"forbidden"` -- 403, cross-tenant access attempt
- `"not_found"` -- 404, unknown task_id
- `"validation_error"` -- 422, invalid request body

### Router Registration: `python-backend/app/main.py`

Add the router import and registration near the existing `browser` and `agency_creator` registrations (around line 312-313):

```python
from app.api import automation_copilot

app.include_router(
    automation_copilot.router,
    prefix="/api/v1/automation-copilot",
    tags=["Automation Copilot"],
)
```

The router itself should be created without a prefix (prefix is set at registration time), matching the `agency_creator.py` pattern.

### Redis Key Schema

| Key Pattern | Value | TTL | Purpose |
|---|---|---|---|
| `automation:{task_id}` | JSON status object | 3600s | Task status tracking |
| `automation:{task_id}:cancel` | `"1"` | 3600s | Cancellation signal |

The status JSON always includes a `_tenant_id` field (underscore-prefixed so it is stripped from responses) for tenant isolation checks on the `/status` endpoint.

### Logging

Use `structlog.get_logger(__name__)` for structured logging. Log at `info` level for successful enqueues and completions. Log at `warning` level for auth failures and tenant mismatches. Never log token values, user JWTs, or full intent JSON (log only `task_id`, `tenant_id`, `user_id`, `status`).

## Verification Checklist

After implementation, verify:

1. All 10 tests in `test_automation_copilot_api.py` pass
2. `pytest tests/integration/test_automation_copilot_api.py -v` shows green
3. The router is importable: `python -c "from app.api.automation_copilot import router"`
4. Coverage for `app/api/automation_copilot.py` is at least 80%
5. No new `ruff` or `mypy` errors introduced
6. The five endpoints are visible in the FastAPI OpenAPI docs at `/docs` under the "Automation Copilot" tag