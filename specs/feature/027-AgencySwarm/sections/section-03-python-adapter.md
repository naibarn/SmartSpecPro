Now I have all the context I need. Let me produce the section content.

# Section 03: Python Adapter -- AgencySwarmAdapter

## Overview

This section implements the `AgencySwarmAdapter` class -- the single abstraction point for all `agency-swarm` library imports in the SmartSpecPro Python backend. The adapter wraps Agency and Agent construction, run execution, and streaming, while routing all LLM calls through the existing Node.js gateway for credit deduction.

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_swarm_adapter.py`
**Test file to create:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_adapter.py`

**Dependencies:**
- Section 01 (pre-validation) must be completed first: Python 3.12, openai v2, pydantic 2.11, `agency-swarm==1.8.0` must be installed.
- Section 02 (database schema) must be completed: the `agency_runs` and `agency_messages` SQLAlchemy models must exist.

**Depended on by:**
- Section 04 (python-services) -- `AgencyService` calls the adapter to construct and execute agencies.
- Section 05 (python-router) -- FastAPI router delegates to the service which uses the adapter.

---

## Tests First

All tests mock the `agency-swarm` library classes (`Agency`, `Agent`, `StreamingRunResponse`). No real LLM calls are made. Tests use the `@pytest.mark.unit` and `@pytest.mark.agency` markers.

The `agency` marker must be registered in `/home/dev/projects/SmartSpecPro/python-backend/pytest.ini` (added in section-01-pre-validation):

```ini
markers =
    ...
    agency: Agency-swarm integration tests
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_adapter.py`

```python
"""
Tests for AgencySwarmAdapter — version-isolated wrapper for agency-swarm v1.8.0.

All agency-swarm classes are mocked. No real LLM calls.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from dataclasses import dataclass


@pytest.mark.unit
@pytest.mark.agency
class TestCreateAgent:
    """Test AgencySwarmAdapter.create_agent()."""

    async def test_create_agent_returns_agent_with_gateway_model(self):
        """create_agent returns an Agent whose LLM model points to the Node.js gateway."""
        # Mock agency-swarm Agent and OpenAIChatCompletionsModel
        # Call adapter.create_agent() with an AgentConfig
        # Assert the resulting Agent has a model with base_url matching NODEJS_INTERNAL_URL/api/llm/v2

    async def test_create_agent_model_base_url_matches_gateway(self):
        """The OpenAIChatCompletionsModel base_url is NODEJS_INTERNAL_URL/api/llm/v2."""
        # Verify the AsyncOpenAI client is constructed with the correct base_url
        # and the user_token is used as api_key

    async def test_create_agent_passes_instructions(self):
        """Agent instructions are forwarded from the config."""
        # Verify Agent is constructed with the instructions from AgentConfig

    async def test_create_agent_passes_model_name(self):
        """Agent model name matches the config's model field."""
        # Verify the model parameter passed to OpenAIChatCompletionsModel


@pytest.mark.unit
@pytest.mark.agency
class TestCreateAgency:
    """Test AgencySwarmAdapter.create_agency()."""

    async def test_create_agency_with_communication_flows(self):
        """create_agency creates an Agency with the correct agent communication flows."""
        # Provide 2+ agents and a flow definition
        # Assert Agency is constructed with the correct agency_chart

    async def test_create_agency_persistence_hooks_configured(self):
        """create_agency attaches persistence load/save callbacks."""
        # Verify Agency kwargs include threads_callbacks or equivalent hooks

    async def test_create_agency_user_context_includes_tenant_id(self):
        """User context (tenant_id, user_id) is passed to Agency construction."""
        # Verify the shared_instructions or context metadata includes tenant_id


@pytest.mark.unit
@pytest.mark.agency
class TestRun:
    """Test AgencySwarmAdapter.run()."""

    async def test_run_executes_agency_and_returns_result(self):
        """run() calls agency.get_response() and returns a RunResult."""
        # Mock agency.get_response() to return a canned response
        # Verify RunResult contains the response text

    async def test_run_handles_transient_error_with_retry(self):
        """run() retries on transient errors (timeout, HTTP 429/503)."""
        # Mock agency.get_response() to raise TimeoutError once, then succeed
        # Verify it was called twice and returned successfully

    async def test_run_handles_permanent_error_immediately(self):
        """run() fails fast on permanent errors (auth, validation)."""
        # Mock agency.get_response() to raise an auth error
        # Verify it was called once and raised the appropriate exception


@pytest.mark.unit
@pytest.mark.agency
class TestRunStream:
    """Test AgencySwarmAdapter.run_stream()."""

    async def test_run_stream_returns_synchronously(self):
        """run_stream() returns a StreamingRunResponse (NOT awaited)."""
        # Verify the return type is the streaming response wrapper, not a coroutine

    async def test_run_stream_yields_correct_event_types(self):
        """The streaming response yields run_started, token, and run_finished events."""
        # Mock StreamingRunResponse to yield known events
        # Iterate and verify event types


@pytest.mark.unit
@pytest.mark.agency
class TestThreadSafety:
    """Test per-request isolation guarantees."""

    async def test_concurrent_create_agency_produces_isolated_instances(self):
        """10 concurrent create_agency calls produce independent Agency objects."""
        # Call create_agency 10 times with different configs
        # Verify each returned Agency is a distinct instance
        # Verify agent names, tool configs, and conversation history are isolated
```

Each test body is left as a docstring stub. The implementer should fill in the mock setup and assertions following the patterns described below.

---

## Implementation Details

### Architecture Context

SmartSpecPro's Python backend communicates with a Node.js gateway for all LLM calls. The gateway at `NODEJS_INTERNAL_URL/api/llm/v2/chat` handles credit checks, provider routing, and cost deduction atomically. The adapter must route agency-swarm's LLM calls through this gateway by constructing an `OpenAIChatCompletionsModel` whose underlying `AsyncOpenAI` client points to the gateway URL.

The existing pattern (from `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/llm_executor.py`) is:

```python
NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
# Then POST to f"{NODEJS_INTERNAL_URL}/api/llm/v2/chat" with the user's auth token
```

The adapter replicates this but for agency-swarm's model interface:

```python
from openai import AsyncOpenAI
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel

client = AsyncOpenAI(
    api_key=user_token,  # user JWT for credit attribution
    base_url=f"{NODEJS_INTERNAL_URL}/api/llm/v2",
)
model = OpenAIChatCompletionsModel(model=model_name, openai_client=client)
```

### Data Types

The adapter uses Pydantic models for its input/output contracts. These are defined within the adapter module (or a sibling types module if preferred).

**AgentConfig** -- configuration for constructing a single agent:
- `name: str` -- Agent display name
- `instructions: str` -- Agent system prompt
- `model: str` -- LLM model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514")
- `model_settings: dict | None` -- Optional `{max_tokens, temperature, top_p}`
- `tools: list` -- List of tool instances (BaseTool subclasses from section-04)
- `is_entry_point: bool` -- Whether this is the entry agent

**AgencyConfig** -- configuration for constructing an agency:
- `agency_id: str` -- Database ID
- `name: str` -- Agency display name
- `system_prompt: str` -- Shared instructions for all agents
- `communication_flows: list[tuple[str, str]]` -- List of (from_agent_name, to_agent_name) pairs
- `tenant_id: str`
- `user_id: int`
- `conversation_id: str`
- `max_run_time_seconds: int` -- Timeout (default 600)

**RunResult** -- result of a non-streaming run:
- `run_id: str` -- UUID
- `response: str` -- Final response text
- `agent_name: str` -- Name of agent that produced the final response
- `total_tokens: int` -- Aggregate token count
- `step_count: int` -- Number of agent steps
- `duration_ms: int` -- Elapsed time in milliseconds

### File: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_swarm_adapter.py`

```python
"""
AgencySwarmAdapter -- version-isolated interface to agency-swarm v1.8.0.

This module is the ONLY place in SmartSpecPro that imports from agency-swarm
(or the openai-agents-sdk). All other modules interact with agency-swarm
through this adapter.

Design principles:
1. Version isolation -- if agency-swarm upgrades, only this file changes
2. Gateway routing -- all LLM calls go through Node.js gateway for credit deduction
3. Per-request instantiation -- Agency objects are never reused across requests
4. Raw streaming -- StreamingRunResponse events are exposed directly (no re-wrapping)
"""

import os
import time
import uuid
from typing import Any, Callable

import structlog
from pydantic import BaseModel

logger = structlog.get_logger(__name__)

NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")

# Retry configuration for transient errors
MAX_RETRIES = 3
RETRY_BASE_DELAY_SECONDS = 1.0


class AgentConfig(BaseModel):
    """Configuration for constructing a single agency-swarm Agent."""
    name: str
    instructions: str
    model: str
    model_settings: dict[str, Any] | None = None
    tools: list[Any] = []
    is_entry_point: bool = False


class AgencyConfig(BaseModel):
    """Configuration for constructing an agency-swarm Agency."""
    agency_id: str
    name: str
    system_prompt: str
    communication_flows: list[tuple[str, str]]
    tenant_id: str
    user_id: int
    conversation_id: str
    max_run_time_seconds: int = 600


class RunResult(BaseModel):
    """Result of a non-streaming agency run."""
    run_id: str
    response: str
    agent_name: str
    total_tokens: int = 0
    step_count: int = 0
    duration_ms: int = 0


class AgencySwarmAdapter:
    """Version-isolated interface to agency-swarm v1.8.0."""

    def _create_model(self, model_name: str, user_token: str):
        """Create an OpenAIChatCompletionsModel pointing to the Node.js gateway.

        The AsyncOpenAI client uses:
        - base_url: NODEJS_INTERNAL_URL/api/llm/v2 (gateway endpoint)
        - api_key: user_token (JWT for credit attribution)
        """
        ...

    def create_agent(self, config: AgentConfig, user_token: str):
        """Construct an Agent with SmartSpecPro's gateway-routed LLM model.

        Returns an agency-swarm Agent instance with:
        - name and instructions from config
        - model routed through Node.js gateway
        - tools attached
        """
        ...

    def create_agency(
        self,
        config: AgencyConfig,
        agents: list,
        persistence_hooks: tuple[Callable, Callable] | None = None,
    ):
        """Construct an Agency with persistence hooks and user context.

        Builds the agency_chart (communication flows) from config.communication_flows,
        attaches persistence load/save callbacks, and sets shared_instructions
        from config.system_prompt.

        Agency objects are instantiated per-request -- never reused.
        """
        ...

    async def run(self, agency, message: str) -> RunResult:
        """Execute agency.get_response() with error handling and retry.

        Transient errors (TimeoutError, HTTP 429/503) are retried up to
        MAX_RETRIES times with exponential backoff.
        Permanent errors (auth failure, validation) fail immediately.

        Returns a RunResult with the final response.
        """
        ...

    def run_stream(self, agency, message: str):
        """Return a streaming response (synchronous -- do NOT await).

        Calls agency.get_response_stream() which returns a
        StreamingRunResponse. The caller iterates this to get SSE events.
        """
        ...

    def _is_transient_error(self, error: Exception) -> bool:
        """Classify whether an error is transient (retryable).

        Transient: TimeoutError, ConnectionError, HTTP 429, HTTP 503
        Permanent: AuthenticationError, ValidationError, HTTP 401/403
        """
        ...
```

### Key Implementation Notes

1. **Import isolation.** All `from agency_swarm import ...` and `from agents import ...` statements live exclusively in this file. Other modules import only `AgencySwarmAdapter`, `AgentConfig`, `AgencyConfig`, and `RunResult` from `app.services.agency_swarm_adapter`.

2. **Gateway model creation.** The `_create_model` method creates an `AsyncOpenAI` client with `base_url=f"{NODEJS_INTERNAL_URL}/api/llm/v2"` and `api_key=user_token`. It then wraps it in `OpenAIChatCompletionsModel(model=model_name, openai_client=client)`. This ensures every LLM call from agency-swarm flows through SmartSpecPro's credit/billing pipeline.

3. **Per-request instantiation.** Every call to `create_agency` produces a new `Agency` object. Agencies are never cached or reused. This prevents thread-safety issues with agency-swarm's mutable internal state (conversation history, agent state). The thread-safety test validates this by calling `create_agency` 10 times concurrently and asserting each result is a distinct object with no shared state.

4. **Communication flows.** agency-swarm uses an `agency_chart` parameter that defines which agents can communicate. The format is a list of lists: `[[ceo, dev], [ceo, researcher]]` means `ceo` can delegate to both `dev` and `researcher`. The adapter translates `AgencyConfig.communication_flows` (a list of `(from_name, to_name)` tuples) into this format by mapping agent names to Agent instances.

5. **Transient error retry.** The `run` method catches exceptions and classifies them via `_is_transient_error`. For transient errors, it retries up to `MAX_RETRIES` times with exponential backoff (`RETRY_BASE_DELAY_SECONDS * 2^attempt`). Permanent errors raise immediately. The retry logic wraps only `agency.get_response()` -- if the agency partially completes and then fails, only the remaining calls are retried (not the entire run).

6. **Streaming.** `run_stream` is intentionally synchronous. It calls `agency.get_response_stream()` which returns a `StreamingRunResponse` object. The caller (the FastAPI router in section-05) iterates this object to yield SSE events. The adapter does not re-wrap or transform the streaming events -- they are passed through raw for performance.

7. **Persistence hooks.** The `create_agency` method accepts optional `persistence_hooks` -- a tuple of `(load_callback, save_callback)`. These are the PostgreSQL-backed callbacks created by `agency_persistence.py` (section-04). They are passed to the Agency constructor as `threads_callbacks`.

8. **Logging.** Use `structlog.get_logger()` for all logging. Log agency creation, run start/completion, retry attempts, and errors. Never log user tokens, message content, or PII. Log only `agency_id`, `tenant_id`, `user_id`, `model_name`, and timing information.

### Error Classification Detail

The `_is_transient_error` method should check:

| Error Type | Classification | Action |
|---|---|---|
| `TimeoutError` | Transient | Retry |
| `ConnectionError` | Transient | Retry |
| `openai.RateLimitError` (HTTP 429) | Transient | Retry with backoff |
| `openai.APIStatusError` with status 503 | Transient | Retry |
| `openai.AuthenticationError` (HTTP 401) | Permanent | Fail immediately |
| `openai.PermissionDeniedError` (HTTP 403) | Permanent | Fail immediately |
| `openai.BadRequestError` (HTTP 400) | Permanent | Fail immediately |
| `ValueError`, `ValidationError` | Permanent | Fail immediately |
| All other exceptions | Permanent | Fail immediately |

### Environment Variable

The adapter reads `NODEJS_INTERNAL_URL` from the environment, defaulting to `http://localhost:3000`. This matches the existing pattern used by `LLMExecutor`, `SkillExecutor`, `ImageExecutor`, and `VideoExecutor` in `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/`.

### Testing Patterns

Tests should follow the existing pattern from `/home/dev/projects/SmartSpecPro/python-backend/tests/conftest.py`:

- Use `pytest-asyncio` with `asyncio_mode = auto` (tests are auto-detected as async)
- Mock external dependencies with `unittest.mock.patch` and `AsyncMock`
- Mock all agency-swarm classes (`Agent`, `Agency`, `StreamingRunResponse`)
- Mock the `AsyncOpenAI` client and `OpenAIChatCompletionsModel`
- Use `monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://test-gateway:3000")` for URL testing

For the thread-safety test, use `asyncio.gather` to run 10 concurrent `create_agency` calls. Each call should use a different `AgencyConfig` (different agency_id, name, tenant_id). After all complete, verify:
- All 10 returned Agency objects are distinct (`id()` differs)
- Each Agency has the correct agents matching its config
- No agent name or tool config leaked between instances

---

## Implementation Notes (Actual)

### What was built
All planned items were implemented. Key deviations from plan:

1. **`is_entry_point` metadata stored on Agent** — `create_agent()` stores `agent._is_entry_point = config.is_entry_point`. `create_agency()` reads this attribute to determine entry points, falling back to the first agent if none are marked.

2. **`NODEJS_INTERNAL_URL` read lazily** — Moved from module-level constant to `_create_model()` method for testability with `monkeypatch.setenv`.

3. **`max_run_time_seconds` enforced via `asyncio.wait_for()`** — `run()` accepts a `timeout_seconds` parameter (default 600). `asyncio.TimeoutError` from the guard is treated as permanent (not retried) to prevent multiplying long timeouts.

4. **Invalid communication flows raise `ValueError`** — Plan originally showed silent warning. Changed to fail-fast per user review decision.

5. **`TimeoutError` reclassified as permanent** — Removed from transient error classification. Only `ConnectionError`, `RateLimitError`, and HTTP 502/503/504 are retried.

6. **Added 502/504 to transient errors** — Plan only listed 503. Added 502 (Bad Gateway) and 504 (Gateway Timeout) as defensive measure.

7. **Unused `BadRequestError`/`PermissionDeniedError` imports removed** — Cleaned up per review feedback.

8. **`run()` and `run_stream()` accept `agency_id`/`tenant_id`** — Added for structured logging context per plan requirements.

### Actual files created/modified
| File | Action |
|------|--------|
| `python-backend/app/services/agency_swarm_adapter.py` | Created: AgencySwarmAdapter, AgentConfig, AgencyConfig, RunResult |
| `python-backend/tests/unit/test_agency_adapter.py` | Created: 32 unit tests (7 create_agent, 5 create_agency, 6 run, 3 run_stream, 1 thread_safety, 10 error_classification) |

### Test results
- 32 tests passed
- Test coverage: full coverage of adapter module