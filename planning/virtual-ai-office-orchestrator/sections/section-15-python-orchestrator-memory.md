Now I have enough context. Let me generate the section content.

# Section 15: Python Orchestrator and Memory Services

## Overview

This section implements the Python-side services that power team orchestrator execution, memory embedding, summary generation, and inter-agent bridge endpoints. These services are called by the Node.js backend via internal HTTP APIs, extending the existing FastAPI + Celery infrastructure.

**Dependencies:**
- Section 03 (Scoped Memory) -- the `scoped_memories` table and pgvector setup must exist in the database
- Section 06 (Prompt Composer / Turn Order) -- the Node.js prompt composer calls the Python `execute-turn` endpoint
- Existing infrastructure: `LLMGatewayClient` at `/home/dev/projects/SmartSpecPro/python-backend/app/services/llm_gateway_client.py`, `AgencyOrchestrator` at `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`, `EmbeddingService` at `/home/dev/projects/SmartSpecPro/python-backend/app/services/embedding_service.py`, Celery app at `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/services/team_orchestrator.py` | Team orchestrator service for executing agent turns |
| `python-backend/app/services/memory_embedding.py` | Memory embedding service + Celery task for scoped_memories |
| `python-backend/app/services/summary_generator.py` | Run summary generation via LLM |
| `python-backend/app/api/inter_agent_bridge.py` | FastAPI endpoints for 046 integration (impact, escalation, broadcast) |
| `python-backend/app/api/team_orchestrator_api.py` | FastAPI endpoints for turn execution and summary generation |
| `python-backend/app/api/memory_api.py` | FastAPI endpoints for embedding and vector search |
| `python-backend/tests/unit/test_team_orchestrator.py` | Unit tests for team orchestrator |
| `python-backend/tests/unit/test_memory_embedding.py` | Unit tests for memory embedding |
| `python-backend/tests/unit/test_summary_generator.py` | Unit tests for summary generator |
| `python-backend/tests/unit/test_inter_agent_bridge.py` | Unit tests for inter-agent bridge |

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/api/routes.py` | Register new routers for team orchestrator, memory, and inter-agent bridge |
| `python-backend/app/core/celery_app.py` | Add `orchestrator` queue to REQUIRED_QUEUES and task_queues |

---

## Tests First

All tests use pytest with the project's existing async patterns (`asyncio_mode = auto`). Write these tests before implementing the services.

### Test File: `python-backend/tests/unit/test_team_orchestrator.py`

```python
"""Tests for team_orchestrator service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.unit
class TestTeamOrchestrator:
    """Tests for TeamOrchestratorService."""

    async def test_execute_turn_calls_llm_with_assembled_prompt(self):
        """execute_turn should call LLMGatewayClient.chat() with the prompt
        assembled from persona, memory context, and room history."""

    async def test_execute_turn_tracks_token_usage_per_agent(self):
        """execute_turn should return token counts (input + output) attributed
        to the specific assistant that took the turn."""

    async def test_execute_turn_extracts_next_speaker_hint(self):
        """When the LLM response contains a nextSpeakerHint marker,
        execute_turn should parse and return it in the response envelope."""

    async def test_execute_turn_returns_none_hint_when_absent(self):
        """When the LLM response has no nextSpeakerHint, the response
        envelope should have nextSpeakerHint=None."""

    async def test_execute_turn_records_cost_snapshot(self):
        """execute_turn should include costCredits in the response based on
        the gateway's reported usage."""

    async def test_execute_turn_handles_gateway_error_gracefully(self):
        """If LLMGatewayClient raises GatewayUnavailableError, execute_turn
        should return an error response rather than propagating the exception."""
```

### Test File: `python-backend/tests/unit/test_memory_embedding.py`

```python
"""Tests for memory_embedding service."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.unit
class TestMemoryEmbedding:
    """Tests for MemoryEmbeddingService."""

    async def test_embed_returns_1536_dim_vector(self):
        """embed() should return a list of 1536 floats for valid input text."""

    async def test_batch_embed_processes_multiple_memories(self):
        """batch_embed() should return one vector per input, preserving order."""

    async def test_embed_failure_returns_none(self):
        """If the embedding API call fails, embed() should return None
        rather than raising, enabling keyword-only fallback."""

    async def test_embed_empty_string_returns_none(self):
        """Empty or whitespace-only input should return None."""

    async def test_celery_task_updates_scoped_memory_embedding(self):
        """The embed_memory Celery task should fetch the memory row,
        generate the embedding, and write it back to the embedding column."""

    async def test_celery_task_batch_processes_correctly(self):
        """The backfill_memory_embeddings Celery task should process
        memories in batches of 100 with rate limiting."""
```

### Test File: `python-backend/tests/unit/test_summary_generator.py`

```python
"""Tests for summary_generator service."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.unit
class TestSummaryGenerator:
    """Tests for SummaryGeneratorService."""

    async def test_generate_summary_returns_structured_json(self):
        """generate_summary should return a dict with all required fields:
        objective, participants, keyDecisions, keyFindings,
        artifactsProduced, openQuestions, nextSteps, totalCost, totalDuration."""

    async def test_generate_summary_uses_cheapest_model_for_system_type(self):
        """When summaryType='system', the service should request the cheapest
        available model from the gateway."""

    async def test_generate_summary_respects_room_language(self):
        """The LLM prompt should include an instruction to generate the
        summary in the specified roomLanguage."""

    async def test_generate_summary_agent_type_uses_persona(self):
        """When summaryType='agent', the prompt should include the lead
        agent's persona context."""

    async def test_generate_summary_extractive_returns_collected_messages(self):
        """When summaryType='extractive', no LLM call should be made.
        Instead, decision/summary/execution_update messages should be
        collected and structured."""
```

### Test File: `python-backend/tests/unit/test_inter_agent_bridge.py`

```python
"""Tests for inter_agent_bridge API endpoints."""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient


@pytest.mark.unit
class TestInterAgentBridge:
    """Tests for inter-agent bridge FastAPI endpoints."""

    async def test_system_impact_validates_gateway_auth(self):
        """POST /api/internal/orchestrator/system-impact should reject
        requests without a valid gateway token."""

    async def test_system_impact_returns_affected_runs(self):
        """Given an incident affecting a provider, the endpoint should
        return a list of active runs using that provider with impact levels."""

    async def test_team_escalation_creates_incident(self):
        """POST /api/internal/virtual-admin/team-escalation should create
        an incident record and return the incident ID."""

    async def test_team_escalation_validates_auth(self):
        """team-escalation endpoint should require gateway authentication."""

    async def test_system_broadcast_validates_auth(self):
        """POST /api/internal/orchestrator/system-broadcast should require
        gateway authentication."""
```

---

## Implementation Details

### 6.1 Team Orchestrator Service

**File:** `python-backend/app/services/team_orchestrator.py`

This service extends the pattern established by `AgencyOrchestrator` but is purpose-built for team-based multi-agent execution. The Node.js run engine (section 05) calls this service to execute individual agent turns.

**Class: `TeamOrchestratorService`**

Constructor accepts an `LLMGatewayClient` instance (dependency injection for testability).

**Method: `async execute_turn(request: ExecuteTurnRequest) -> ExecuteTurnResponse`**

The core method that executes one agent's turn in a team run. Steps:

1. Receive the fully composed prompt from Node.js (the Node.js `promptComposer.ts` from section 06 assembles the prompt including persona, memories, and history -- Python does not re-assemble it).
2. Call `LLMGatewayClient.chat()` with the assembled prompt, the agent's preferred model ID, and tenant/user context headers (`X-User-Id`, `X-Tenant-Id`, `X-Run-Id`).
3. Parse the LLM response text to extract a `nextSpeakerHint` if present. The hint format is `[NEXT_SPEAKER: assistant_name]` appearing at the end of the response. Use a regex: `\[NEXT_SPEAKER:\s*(.+?)\]`.
4. Build the response envelope with: `content` (the LLM response text with the hint stripped), `nextSpeakerHint` (extracted name or None), `tokenUsage` (input/output tokens from gateway response), `costCredits` (from gateway response), `durationMs`, `modelUsed`.

**Pydantic models for request/response:**

`ExecuteTurnRequest`: `runId` (str), `assistantId` (str), `assistantDisplayName` (str), `prompt` (list of message dicts with role/content), `modelId` (str), `tenantId` (str), `userId` (int), `maxTokens` (int, default 4096), `temperature` (float, default 0.7).

`ExecuteTurnResponse`: `content` (str), `nextSpeakerHint` (str or None), `tokenUsage` (dict with `inputTokens`, `outputTokens`), `costCredits` (float), `durationMs` (int), `modelUsed` (str), `error` (str or None).

**Error handling:** If the gateway returns an error or raises an exception, catch it and return an `ExecuteTurnResponse` with `error` set and empty `content`. The Node.js run engine will handle error recording and potential retry/stop.

### 6.2 Memory Embedding Service

**File:** `python-backend/app/services/memory_embedding.py`

Provides embedding generation for `scoped_memories` records, using the existing `EmbeddingProvider` base class pattern from `embedding_service.py`.

**Class: `MemoryEmbeddingService`**

Constructor accepts an embedding provider (default: OpenAI text-embedding-3-small, 1536 dimensions) and a database session factory.

**Method: `async embed(text: str) -> list[float] | None`**

Generate a single embedding vector. Returns None on empty input or API failure (graceful degradation -- keyword-only retrieval still works when embedding is null).

**Method: `async batch_embed(texts: list[str]) -> list[list[float] | None]`**

Process multiple texts. Each result is either a 1536-dim vector or None.

**Method: `async search_by_vector(query_embedding: list[float], tenant_id: str, owner_type: str, owner_id: str, top_k: int = 10) -> list[dict]`**

Execute pgvector cosine similarity search against the `scoped_memories.embedding` column filtered by tenant and owner scope. Returns rows with cosine distance score.

The SQL query uses: `SELECT *, embedding <=> $1::vector AS distance FROM scoped_memories WHERE tenant_id = $2 AND owner_type = $3 AND owner_id = $4 AND embedding IS NOT NULL ORDER BY distance LIMIT $5`.

**Celery Tasks (registered in the same file):**

`embed_memory(memory_id: str)` -- Fetch the `scoped_memories` row by ID, generate embedding from `content` (prepended with `title` if present), and UPDATE the `embedding` column. Queue: `orchestrator`.

`backfill_memory_embeddings(tenant_id: str, batch_size: int = 100, rate_limit: int = 1000)` -- Query all `scoped_memories` where `embedding IS NULL` for the tenant, process in batches of `batch_size`, pause between batches to stay under `rate_limit` embeddings/hour. Queue: `orchestrator`.

### 6.3 Summary Generation Service

**File:** `python-backend/app/services/summary_generator.py`

Generates structured run summaries via LLM. Called by the Node.js `summaryService.ts` (section 08) through the FastAPI endpoint.

**Class: `SummaryGeneratorService`**

Constructor accepts an `LLMGatewayClient`.

**Method: `async generate_summary(request: GenerateSummaryRequest) -> SummaryOutput`**

Three modes based on `summaryType`:

1. **`agent`** -- Prompt the lead agent's persona-enhanced prompt to generate a structured summary. Uses the model specified in the request (typically the lead's preferred model). The prompt includes persona context and instructs the agent to produce JSON matching the `SummaryOutput` schema.

2. **`system`** -- Use a neutral system prompt (no persona) with the cheapest available model (specified via `modelId` in request -- the Node.js caller determines cheapest). The prompt instructs: "Summarize the following team discussion objectively."

3. **`extractive`** -- No LLM call. Filter the provided `messages` array to keep only those with `turnType` in `['decision', 'summary', 'execution_update']`. Extract key sentences and structure them into the `SummaryOutput` format programmatically.

**Pydantic models:**

`GenerateSummaryRequest`: `runId` (str), `summaryType` (literal 'agent'|'system'|'extractive'), `messages` (list of message dicts), `objective` (str), `participants` (list of str), `roomLanguage` (str, default 'en'), `modelId` (str, optional), `personaContext` (str, optional), `tenantId` (str), `userId` (int).

`SummaryOutput`: `objective` (str), `participants` (list of str), `keyDecisions` (list of str), `keyFindings` (list of str), `artifactsProduced` (list of str), `openQuestions` (list of str), `nextSteps` (list of str), `totalCost` (float), `totalDuration` (str).

The LLM prompt for agent/system modes must include `roomLanguage` as an instruction: "Generate the summary in {roomLanguage}." For extractive mode, no language transformation is applied.

### 6.4 Inter-Agent Bridge

**File:** `python-backend/app/api/inter_agent_bridge.py`

FastAPI router providing internal endpoints for communication between the Node.js orchestrator and the 046 virtual admin system.

**Authentication:** All endpoints require gateway token auth, following the same pattern as `get_user_from_gateway_or_jwt` in `/home/dev/projects/SmartSpecPro/python-backend/app/api/agencies.py`. Create a simpler dependency `verify_gateway_token` that checks `Authorization: Bearer <GATEWAY_TOKEN>` against `settings.SMARTSPEC_WEB_GATEWAY_TOKEN` using `secrets.compare_digest`.

**Path convention:** Python bridge endpoints use `/api/inter-agent/*` prefix to avoid conflict with the Node.js authoritative routes at `/api/internal/orchestrator/*` (section-09). These Python endpoints are called by the 046 Virtual Admin Agent (running in the same Python process). When cross-process communication to Node.js is needed, these endpoints proxy to the Node.js internal APIs via HTTP.

**Endpoints:**

`POST /api/inter-agent/system-impact`
- Request body: `incidentId` (str), `incidentType` (str -- e.g., 'provider_down', 'credit_exhausted'), `affectedResources` (list of str).
- Logic: Proxy to Node.js `POST /api/internal/orchestrator/system-impact` via httpx. The Node.js side handles run lookup and impact classification.
- Response: proxied from Node.js — `{ affectedRuns: [...], actions: [...] }`.

`POST /api/inter-agent/system-broadcast`
- Request body: `targetRoomIds` (list of str), `messageType` (str), `displayMessage` (str), `severity` (str).
- Logic: Proxy to Node.js `POST /api/internal/orchestrator/system-broadcast`.
- Response: proxied — `{ messagesDelivered, roomsNotified[] }`.

`POST /api/inter-agent/team-escalation`
- Request body: `roomId` (str), `runId` (str), `escalationType` (str), `context` (dict), `tenantId` (str).
- Logic: Create a `virtual_admin_incidents` record locally (Python DB). Forward to Node.js `POST /api/internal/virtual-admin/team-escalation` for inter-agent message creation.
- Response: `{ incidentId: str, status: 'created'|'forwarded' }`.

`GET /api/inter-agent/resource-state`
- Logic: Proxy to Node.js `GET /api/internal/orchestrator/resource-state`.
- Response: proxied — `{ resources: [...] }`.

### FastAPI Route Registration

**File:** `python-backend/app/api/team_orchestrator_api.py`

FastAPI router exposing the team orchestrator and summary generation as HTTP endpoints.

`POST /api/team-orchestrator/execute-turn` -- Accepts `ExecuteTurnRequest`, calls `TeamOrchestratorService.execute_turn()`, returns `ExecuteTurnResponse`. Requires gateway auth.

`POST /api/team-orchestrator/generate-summary` -- Accepts `GenerateSummaryRequest`, calls `SummaryGeneratorService.generate_summary()`, returns `SummaryOutput`. Requires gateway auth.

**File:** `python-backend/app/api/memory_api.py`

FastAPI router for memory embedding and search.

`POST /api/memory/embed` -- Accepts `{ memoryId: str, content: str, title: str | None }`. Generates embedding synchronously and returns `{ embedding: list[float] | None, dimension: int }`. Requires gateway auth. Also dispatches the `embed_memory` Celery task to persist the embedding to the database asynchronously.

`POST /api/memory/search` -- Accepts `{ query: str, tenantId: str, scopes: list[{ ownerType: str, ownerId: str }], topK: int }`. Generates query embedding, runs vector search across specified scopes, returns ranked results. Requires gateway auth.

`POST /api/memory/batch-embed` -- Accepts `{ memories: list[{ id: str, content: str, title: str | None }] }`. Returns list of embeddings (or None per item). Requires gateway auth.

### Router Registration

**File to modify:** `python-backend/app/api/routes.py`

Add these imports and router inclusions:

```python
from app.api.team_orchestrator_api import router as team_orchestrator_router
from app.api.memory_api import router as memory_router
from app.api.inter_agent_bridge import router as inter_agent_bridge_router
```

Include them with appropriate prefixes and tags.

### Celery Queue Registration

**File to modify:** `python-backend/app/core/celery_app.py`

Add `"orchestrator"` to the `REQUIRED_QUEUES` list and add `Queue("orchestrator")` to the `task_queues` list. This queue handles memory embedding tasks and any future orchestrator background work.

---

## Key Patterns and Conventions

- **Async-first**: All service methods and API endpoints use `async/await`.
- **structlog**: Use `structlog.get_logger(__name__)` for logging, consistent with the rest of the codebase.
- **Pydantic v2**: Use `BaseModel` for request/response schemas. Use `.model_dump()` not `.dict()`.
- **Gateway auth**: Internal endpoints use `SMARTSPEC_WEB_GATEWAY_TOKEN` for service-to-service auth, matching the pattern in `agencies.py`.
- **LLM calls through gateway**: All LLM calls go through `LLMGatewayClient` which handles credit deduction, rate limiting, and audit logging on the Node.js side.
- **Graceful degradation**: Embedding failures return None. LLM errors return error envelopes. No unhandled exceptions from external API calls.
- **Database access**: Use `AsyncSession` from SQLAlchemy for direct DB queries (the `scoped_memories` table). Use raw SQL for pgvector operations since SQLAlchemy ORM does not natively support the `<=>` operator.

## Verification

After implementation, verify:

1. `pytest python-backend/tests/unit/test_team_orchestrator.py -v` -- all tests pass
2. `pytest python-backend/tests/unit/test_memory_embedding.py -v` -- all tests pass
3. `pytest python-backend/tests/unit/test_summary_generator.py -v` -- all tests pass
4. `pytest python-backend/tests/unit/test_inter_agent_bridge.py -v` -- all tests pass
5. `ruff check python-backend/app/services/team_orchestrator.py python-backend/app/services/memory_embedding.py python-backend/app/services/summary_generator.py python-backend/app/api/inter_agent_bridge.py python-backend/app/api/team_orchestrator_api.py python-backend/app/api/memory_api.py` -- no lint errors
6. `mypy python-backend/app/services/team_orchestrator.py python-backend/app/services/memory_embedding.py python-backend/app/services/summary_generator.py` -- type checks pass
7. Manual curl test: `curl -X POST http://localhost:8000/api/memory/embed -H "Authorization: Bearer $GATEWAY_TOKEN" -d '{"memoryId":"test","content":"hello world"}' ` should return a 1536-dim vector or null