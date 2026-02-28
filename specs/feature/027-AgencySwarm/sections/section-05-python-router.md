# Section 05 -- Python Router (FastAPI Agency Endpoints and Error Handling)

## Status: IMPLEMENTED

## Overview

This section creates the **FastAPI router** that exposes agency run endpoints at `/api/v1/agencies`. It also implements the **error handling** layer (retry/fail/skip classification, fallback behavior, and credit reconciliation on errors). The router is the HTTP interface that the Node.js integration layer (section-06) calls to trigger multi-agent runs.

## Dependencies

| Dependency | Section | What It Provides |
|------------|---------|------------------|
| Feature flags (`AGENCY_SWARM_ENABLED`) | section-01-pre-validation | Feature flag check function; all endpoints return 404 when disabled |
| SQLAlchemy models (`AgencyRun`, `AgencyMessage`) | section-02-database-schema | `agency_runs` and `agency_messages` tables for recording run state |
| `AgencySwarmAdapter` | section-03-python-adapter | Constructs and executes agency-swarm `Agency` objects |
| `AgencyService`, `AgencyCreditManager`, persistence hooks, PII | section-04-python-services | Orchestration service, credit pre-check/markup, persistence, PII redaction |

All of these must be implemented and available before this section can function.

## Files Created

| File | Purpose |
|------|---------|
| `python-backend/app/api/agencies.py` | FastAPI router with 5 endpoints, error classification, retry logic |
| `python-backend/tests/unit/test_agency_router.py` | 32 unit tests for the router |

## Files Modified

| File | Change |
|------|--------|
| `python-backend/app/main.py` | Import and register the agencies router |
| `python-backend/app/services/agency_service.py` | Added `list_runs()`, `get_run()`, `cancel_run()` methods needed by router |

## Deviations from Plan

1. **user_token extraction**: Added `_bearer_scheme` (HTTPBearer) dependency to extract raw JWT from Authorization header. Plan didn't specify this mechanism.
2. **Service methods**: Added `list_runs`, `get_run`, `cancel_run` to `AgencyService` (originally section-04 scope) since they're required by the router endpoints.
3. **SSE heartbeat**: Deferred to section-07 per user decision. Section-07 handles full SSE streaming infrastructure.
4. **credits_used**: Returns 0.0 in AgencyRunResponse. Gateway per-call costs reconciled in section-06.

## Test Coverage

32 tests in 8 test classes:
- TestAgencyRouterAuth (4 tests) - auth requirement on all endpoints
- TestAgencyRouterFeatureFlag (5 tests) - 404 when disabled
- TestAgencyRunEndpoint (4 tests) - run, validation, credits, not-found
- TestAgencyStreamEndpoint (3 tests) - SSE content-type, headers, credit pre-check
- TestAgencyListRunsEndpoint (2 tests) - tenant filtering, empty list
- TestAgencyCancelEndpoint (2 tests) - success, not-found
- TestAgencyErrorHandling (9 tests) - classification, fallback, partial completion
- TestRetryLogic (3 tests) - transient retry, permanent fail, max exhausted

---

## Tests (Write First)

All tests go in `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_router.py`.

Tests use the existing pattern: FastAPI `TestClient` with SQLite in-memory DB via `StaticPool`. Agency service and adapter are mocked; these tests validate HTTP-level behavior (auth, feature flags, status codes, response shapes, error classification) -- not the full agency execution pipeline.

Mark all tests with `@pytest.mark.agency` and `@pytest.mark.unit`.

### Test Structure

```python
"""Tests for the agency FastAPI router.

Validates HTTP-level behavior: auth, feature flags, error handling,
response shapes. Agency execution is mocked.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture
def mock_agency_service():
    """Mock AgencyService so no real agency-swarm calls occur."""
    # Returns a mock with async methods: execute_run, execute_run_stream, cancel_run, list_runs, get_run


@pytest.fixture
def mock_feature_flag_enabled():
    """Patch the feature flag check to return True (agency enabled)."""


@pytest.fixture
def mock_feature_flag_disabled():
    """Patch the feature flag check to return False (agency disabled)."""


# --- Auth Tests ---

@pytest.mark.agency
@pytest.mark.unit
class TestAgencyRouterAuth:
    """Endpoints require Bearer token + cookie auth."""

    async def test_run_requires_auth_returns_401(self, client):
        """POST /api/v1/agencies/{id}/run without auth headers returns 401."""

    async def test_stream_requires_auth_returns_401(self, client):
        """POST /api/v1/agencies/{id}/stream without auth headers returns 401."""

    async def test_list_runs_requires_auth_returns_401(self, client):
        """GET /api/v1/agencies/{id}/runs without auth headers returns 401."""

    async def test_cancel_requires_auth_returns_401(self, client):
        """POST /api/v1/agencies/{id}/runs/{run_id}/cancel without auth returns 401."""


# --- Feature Flag Tests ---

@pytest.mark.agency
@pytest.mark.unit
class TestAgencyRouterFeatureFlag:
    """All endpoints return 404 when AGENCY_SWARM_ENABLED is false."""

    async def test_run_returns_404_when_disabled(self, authed_client, mock_feature_flag_disabled):
        """POST /run returns 404 when feature flag is off."""

    async def test_stream_returns_404_when_disabled(self, authed_client, mock_feature_flag_disabled):
        """POST /stream returns 404 when feature flag is off."""

    async def test_list_runs_returns_404_when_disabled(self, authed_client, mock_feature_flag_disabled):
        """GET /runs returns 404 when feature flag is off."""

    async def test_cancel_returns_404_when_disabled(self, authed_client, mock_feature_flag_disabled):
        """POST /cancel returns 404 when feature flag is off."""

    async def test_run_details_returns_404_when_disabled(self, authed_client, mock_feature_flag_disabled):
        """GET /runs/{run_id} returns 404 when feature flag is off."""


# --- Run Endpoint Tests ---

@pytest.mark.agency
@pytest.mark.unit
class TestAgencyRunEndpoint:
    """POST /api/v1/agencies/{agency_id}/run -- non-streaming execution."""

    async def test_returns_run_result_with_run_id(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Successful run returns JSON with run_id, status, and output."""

    async def test_returns_422_for_missing_message(self, authed_client, mock_feature_flag_enabled):
        """Missing 'message' field in request body returns 422."""

    async def test_returns_402_on_insufficient_credits(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """When credit pre-check fails, returns 402 Payment Required."""

    async def test_returns_404_for_nonexistent_agency(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Agency ID not found returns 404."""


# --- Stream Endpoint Tests ---

@pytest.mark.agency
@pytest.mark.unit
class TestAgencyStreamEndpoint:
    """POST /api/v1/agencies/{agency_id}/stream -- SSE streaming execution."""

    async def test_returns_sse_content_type(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Response has Content-Type: text/event-stream."""

    async def test_sse_headers_include_no_cache(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Response includes Cache-Control: no-cache and X-Accel-Buffering: no."""

    async def test_returns_402_on_insufficient_credits(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Credit pre-check failure prevents streaming and returns 402."""


# --- List Runs Endpoint Tests ---

@pytest.mark.agency
@pytest.mark.unit
class TestAgencyListRunsEndpoint:
    """GET /api/v1/agencies/{agency_id}/runs -- list runs for an agency."""

    async def test_returns_runs_filtered_by_tenant(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Runs returned are filtered to the authenticated user's tenant."""

    async def test_returns_empty_list_for_no_runs(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """No runs for agency returns an empty list (not 404)."""


# --- Cancel Endpoint Tests ---

@pytest.mark.agency
@pytest.mark.unit
class TestAgencyCancelEndpoint:
    """POST /api/v1/agencies/{agency_id}/runs/{run_id}/cancel."""

    async def test_cancel_returns_success(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Cancelling a running run returns success status."""

    async def test_cancel_nonexistent_run_returns_404(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Cancelling a run that does not exist returns 404."""


# --- Error Handling Tests ---

@pytest.mark.agency
@pytest.mark.unit
class TestAgencyErrorHandling:
    """Error classification: transient (retry), permanent (fail), optional (skip)."""

    async def test_transient_timeout_retries(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Timeout error triggers retry (up to 3 attempts), succeeds on retry."""

    async def test_transient_429_retries_with_backoff(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """HTTP 429 triggers retry with exponential backoff."""

    async def test_permanent_auth_failure_no_retry(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Auth failure (401) is permanent -- fails immediately, no retry."""

    async def test_permanent_credit_exhaustion_no_retry(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """Credit exhaustion is permanent -- fails immediately."""

    async def test_optional_agent_skipped_on_failure(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """When an optional agent fails, it is skipped and the run continues."""

    async def test_required_agent_failure_stops_run(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """When a required agent fails, the entire run stops."""

    async def test_fallback_safe_single_agent(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """If isFallbackSafe=true and service degrades, falls back to single-agent using entry agent."""

    async def test_non_fallback_safe_fails_closed(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """If isFallbackSafe=false and service degrades, returns error (no fallback)."""

    async def test_partial_completion_charges_completed_steps_only(self, authed_client, mock_agency_service, mock_feature_flag_enabled):
        """When a run partially completes, only the completed LLM calls are charged."""
```

---

## Implementation Details

### 1. FastAPI Router (`/home/dev/projects/SmartSpecPro/python-backend/app/api/agencies.py`)

Create a new FastAPI `APIRouter` at prefix `/api/v1/agencies` with tag `"agencies"`.

#### Router Structure

```python
"""Agency run endpoints -- FastAPI router for multi-agent execution."""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/v1/agencies", tags=["agencies"])
logger = structlog.get_logger(__name__)
```

#### Request/Response Models

Define Pydantic models for the API surface.

```python
class AgencyRunRequest(BaseModel):
    """Request body for POST /run and POST /stream."""
    message: str = Field(..., min_length=1, max_length=50000)
    conversation_id: Optional[str] = Field(None, description="Existing conversation ID to continue")


class AgencyRunResponse(BaseModel):
    """Response from POST /run."""
    run_id: str
    conversation_id: str
    status: str  # completed / failed
    output: str
    credits_used: float
    duration_ms: int


class AgencyRunSummary(BaseModel):
    """Single run in the list response."""
    id: str
    status: str
    total_credits_used: float
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    error_type: Optional[str]
    error_message: Optional[str]
    step_count: int


class AgencyRunListResponse(BaseModel):
    """Response from GET /runs."""
    runs: list[AgencyRunSummary]
    total: int


class AgencyCancelResponse(BaseModel):
    """Response from POST /cancel."""
    run_id: str
    status: str  # cancelled
```

#### Feature Flag Guard

Create a dependency that checks the `AGENCY_SWARM_ENABLED` feature flag. When disabled, raise `HTTPException(404)`. This dependency is injected into every endpoint.

```python
async def require_agency_feature(db: AsyncSession = Depends(get_db)) -> None:
    """Dependency that raises 404 if AGENCY_SWARM_ENABLED is false.

    Reads from the system_settings table (category='feature_flags',
    key='AGENCY_SWARM_ENABLED'). Falls back to False if not found.
    """
    # Implementation reads from system_settings via the feature flag
    # utility created in section-01.
```

#### Endpoint Definitions

Five endpoints, all protected by auth (`get_current_user`) and feature flag (`require_agency_feature`).

**POST `/{agency_id}/run`** -- Non-streaming agency run.
- Validates request body (`AgencyRunRequest`).
- Calls `AgencyService.execute_run()`.
- Returns `AgencyRunResponse` with run_id, output, credit usage, duration.
- On credit pre-check failure: returns HTTP 402.
- On agency not found: returns HTTP 404.
- On transient error: the service layer handles retries internally; if retries exhausted, returns HTTP 503.
- On permanent error: returns HTTP 400 or appropriate status.

**POST `/{agency_id}/stream`** -- Streaming agency run (SSE).
- Same auth and validation as `/run`.
- Returns `StreamingResponse` with `media_type="text/event-stream"`.
- SSE headers: `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- The generator function calls `AgencyService.execute_run_stream()` which yields SSE-formatted strings.
- Heartbeat: yield `: keepalive\n\n` every 15 seconds if no events.
- Event format matches: `event: {type}\ndata: {json}\n\n` with types: `run_started`, `agent_switch`, `token`, `tool_call`, `tool_result`, `run_finished`, `run_error`.

**GET `/{agency_id}/runs`** -- List runs for an agency.
- Query params: `limit` (default 20, max 100), `offset` (default 0), `status` (optional filter).
- Reads from `agency_runs` table, filtered by `agency_id` AND `tenant_id` (from authenticated user).
- Returns `AgencyRunListResponse`.

**GET `/{agency_id}/runs/{run_id}`** -- Get run details.
- Returns full `AgencyRunSummary` with metadata.
- 404 if run not found or tenant mismatch.

**POST `/{agency_id}/runs/{run_id}/cancel`** -- Cancel a running run.
- Calls `AgencyService.cancel_run()`.
- Updates run status to `cancelled`.
- Returns `AgencyCancelResponse`.
- 404 if run not found.

#### Auth Pattern

Follow the same pattern as the existing workflows router and internal sandbox router. Endpoints use `Depends(get_current_user)` which extracts the JWT from the `Authorization: Bearer {token}` header and validates against the database. The user object provides `tenant_id` for tenant isolation.

```python
@router.post("/{agency_id}/run")
async def run_agency(
    agency_id: str,
    request: AgencyRunRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _flag: None = Depends(require_agency_feature),
) -> AgencyRunResponse:
    """Execute a non-streaming agency run."""
```

### 2. Error Handling Layer

Error handling is built into both the router endpoints and the agency service. The router is responsible for HTTP-level error translation; the service layer handles retry logic.

#### Error Classification

The router defines an error classifier used by the service layer.

```python
class AgencyErrorType:
    """Error classification constants."""
    TRANSIENT = "transient"    # timeout, 429, 503 -- retry
    PERMANENT = "permanent"    # auth, validation, credit -- fail fast
    OPTIONAL_SKIP = "optional_skip"  # optional agent failed -- skip
```

Classification rules:
- **Transient:** `asyncio.TimeoutError`, HTTP 429, HTTP 503, connection errors. Retry up to 3 times with exponential backoff (1s, 2s, 4s).
- **Permanent:** HTTP 401, HTTP 403, `InsufficientCreditsError`, `ValueError`, validation errors. Fail immediately.
- **Optional skip:** Any error from an agent marked `isOptional=True`. Log the failure, skip the agent, continue the run.

```python
def classify_error(error: Exception, agent_is_optional: bool = False) -> str:
    """Classify an error for retry/fail/skip decision.

    Returns one of AgencyErrorType constants.
    """
```

#### Fallback Behavior

When a runtime-level degradation occurs (Python agency-swarm service error, adapter failure):

- If the agency has `isFallbackSafe=True`: fall back to single-agent mode using the entry-point agent's model and prompt. Route through the standard chat LLM gateway.
- If `isFallbackSafe=False`: fail closed with an error response. Never attempt to run a partial agency.

This logic lives in the service layer (section-04) but the router surfaces the result: a successful fallback returns a normal `AgencyRunResponse` with a `fallback: true` field; a failed-closed returns HTTP 503.

#### Credit Reconciliation on Error

Credit handling on errors follows the per-call deduction model:

- **Transient error (retried, succeeded):** Each LLM call (including retries) was already deducted by the gateway. Total cost reflects actual calls made.
- **Permanent error (run failed):** Only completed LLM calls are charged. No refund needed since no reservation was made. The multiplier markup is NOT applied to failed runs.
- **Partial completion (optional agent skipped):** Completed steps are charged. The multiplier markup is applied only to the successful portion's gateway cost.

The router itself does not do credit math -- it delegates to `AgencyCreditManager.apply_multiplier_markup()` which is called at the end of `AgencyService.execute_run()`. However, the router catches `InsufficientCreditsError` from the pre-check and returns HTTP 402.

### 3. SSE Event Streaming Format

The streaming endpoint yields SSE events in this format:

```
event: run_started
data: {"run_id": "uuid", "agency_id": "uuid", "agents": ["CEO", "Researcher"]}

event: agent_switch
data: {"from_agent": "CEO", "to_agent": "Researcher", "reason": "delegation"}

event: token
data: {"agent": "Researcher", "delta": "The research shows"}

event: tool_call
data: {"agent": "Researcher", "tool": "web_search", "input": {"query": "..."}}

event: tool_result
data: {"agent": "Researcher", "tool": "web_search", "output": "...", "duration_ms": 450}

event: run_finished
data: {"run_id": "uuid", "status": "completed", "credits_used": 1.5, "duration_ms": 8200}

event: run_error
data: {"run_id": "uuid", "error_type": "transient", "message": "...", "retryable": false}
```

Heartbeat comments (not events) are sent every 15 seconds:
```
: keepalive

```

The generator function wraps `AgencyService.execute_run_stream()` and adds error-boundary handling:

```python
async def sse_generator(agency_id: str, request: AgencyRunRequest, user: User, db: AsyncSession) -> AsyncIterator[str]:
    """Wrap agency service streaming with error boundary and heartbeat."""
    # 1. Pre-check credits
    # 2. Start streaming from AgencyService
    # 3. Yield SSE events
    # 4. On error: yield run_error event, then return
    # 5. On completion: yield run_finished event
    # Heartbeat via asyncio.wait_for with 15s timeout on each chunk
```

### 4. Router Registration in `main.py`

Modify `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` to import and include the agencies router.

In the import block (around line 67), add:

```python
from app.api import agencies  # Agency-Swarm multi-agent endpoints
```

In the router registration block (after line 301), add:

```python
app.include_router(agencies.router, tags=["Agencies"])
```

The router already includes its own `/api/v1/agencies` prefix, so no additional prefix is needed in `include_router`.

### 5. Retry Logic Implementation Notes

The retry logic wraps the `AgencyService.execute_run()` call. It is implemented as a utility within the router module (or in the service layer -- either location is acceptable as long as the router tests verify the retry behavior via mocks).

```python
MAX_RETRIES = 3
BACKOFF_BASE = 1.0  # seconds

async def with_retry(coro_factory, max_retries=MAX_RETRIES):
    """Execute an async operation with exponential backoff retry on transient errors.

    coro_factory: a callable that returns a new coroutine on each call
    (because a coroutine object cannot be awaited twice).
    """
    # For each attempt:
    #   1. Await the coroutine
    #   2. On transient error: sleep(BACKOFF_BASE * 2^attempt), then retry
    #   3. On permanent error: raise immediately
    #   4. On success: return result
```

---

## Verification Checklist

After implementing this section, verify the following:

1. `pytest tests/unit/test_agency_router.py -v` -- all tests pass
2. All 5 endpoints return 404 when `AGENCY_SWARM_ENABLED` is false
3. All 5 endpoints return 401 without auth headers
4. POST `/run` returns proper `AgencyRunResponse` JSON shape
5. POST `/stream` returns `text/event-stream` content type with correct SSE headers
6. Credit pre-check failure returns HTTP 402
7. Transient errors are retried; permanent errors fail immediately
8. Router is registered in `main.py` and the app starts without import errors
9. `pytest` full suite still passes (no regressions from new imports)