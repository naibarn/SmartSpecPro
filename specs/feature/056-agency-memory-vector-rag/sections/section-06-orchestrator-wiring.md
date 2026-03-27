# Section 06: Orchestrator Wiring

## Overview

This section wires the 2-level retrieval engine (`AgencyMemoryRetriever` from section-04), chunk service (`AgencyChunkService` from section-03), and context budget manager (`ContextBudgetManager` from section-05) into the existing `agency_orchestrator.py`. It replaces the confidence-sorted memory injection with semantic 2-level retrieval before agent node execution, and adds post-execution chunking of agent outputs.

**Depends on**: section-03-chunk-service (`AgencyChunkService`), section-04-retrieval-engine (`AgencyMemoryRetriever`, `format_retrieval_for_context`), section-05-context-budget (`ContextBudgetManager`)
**Blocks**: section-07-internode-optimization

---

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/services/agency_orchestrator.py` | Wire retriever + chunk service + budget manager into `_execute_react_path()` and `_execute_autonomous_node()` |

## Files to Read (Dependencies)

| File | What You Need From It |
|------|----------------------|
| `python-backend/app/services/agency_memory_retriever.py` | `AgencyMemoryRetriever` class, `format_retrieval_for_context()` function (section-04) |
| `python-backend/app/services/agency_chunk_service.py` | `AgencyChunkService.chunk_and_store()` (section-03) |
| `python-backend/app/services/agency_context_budget.py` | `ContextBudgetManager` class (section-05) |
| `python-backend/app/orchestrator/vector_store/embedding_service.py` | `EmbeddingService` constructor and `embed()` API |
| `python-backend/app/services/long_term_memory.py` | `LongTermMemoryService` constructor (needed by retriever) |
| `python-backend/app/services/agency_orchestrator.py` | Current implementation (lines 519-810) -- `_execute_react_path()` and `_execute_autonomous_node()` |

---

## Tests (Write First)

**File**: `python-backend/tests/unit/test_orchestrator_memory_wiring.py` (new file)

Use `AsyncMock`/`MagicMock` for all dependencies. Follow patterns from `test_agency_orchestrator_runtime.py`.

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, ANY

pytestmark = [pytest.mark.unit, pytest.mark.agency]

# --- Pre-execution: Memory Retrieval Replacement ---

# Test: agent node execution uses AgencyMemoryRetriever instead of confidence-sort
#   Setup: Create orchestrator with a single agent node, mock all imports
#   Patch: AgencyMemoryRetriever.retrieve, format_retrieval_for_context
#   Assert: retriever.retrieve() is called with query matching the augmented_message
#   Assert: format_retrieval_for_context() is called with the retrieval result
#   Assert: The formatted context is included in memory_context["long_term_memory"]

# Test: memory retrieval is budget-aware (max_tokens = remaining // 2)
#   Setup: ContextBudgetManager with model "gpt-4o" (budget = 76800)
#   After system prompt allocation, remaining should be some value N
#   Assert: retriever.retrieve() receives max_tokens close to N // 2

# Test: agent node execution creates ContextBudgetManager with correct model name
#   Setup: node["model"] = "claude-sonnet-4-20250514"
#   Assert: ContextBudgetManager is initialized with model_name="claude-sonnet-4-20250514"

# Test: format_retrieval_for_context output is injected into memory_context
#   Setup: format_retrieval_for_context returns "<agent_context>...</agent_context>"
#   Assert: memory_context["long_term_memory"] == the formatted string
#   Assert: The old confidence-sort path is NOT called

# --- Post-execution: Chunking ---

# Test: agent node execution calls chunk_and_store after execution completes
#   Setup: ReAct executor returns result with final_answer = "some output"
#   Patch: AgencyChunkService.chunk_and_store
#   Assert: chunk_and_store called with output=result.final_answer,
#           correct tenant_id, agency_id, user_id, agent_node_id, run_id, source_node_id

# Test: chunk_and_store is called for autonomous executor path too
#   Setup: Mock autonomous executor returning a result
#   Assert: chunk_and_store called with same scope params

# --- EmbeddingService Initialization ---

# Test: orchestrator initializes EmbeddingService at start of agent execution
#   Patch: EmbeddingService constructor
#   Assert: EmbeddingService() is called once per agent node execution

# --- Graceful Degradation ---

# Test: retrieval failure does not block agent execution
#   Setup: AgencyMemoryRetriever.retrieve raises RuntimeError
#   Assert: Agent still executes successfully with empty memory_context
#   Assert: Warning logged

# Test: chunk_and_store failure does not block agent result
#   Setup: AgencyChunkService.chunk_and_store raises RuntimeError
#   Assert: Agent returns result successfully
#   Assert: Warning logged

# Test: EmbeddingService import failure falls back to old confidence-sort path
#   Setup: ImportError on EmbeddingService import
#   Assert: Falls back to existing ltm_service.get_memories_for_agent()
```

---

## Implementation Guidance

### Change 1: Add Imports at Module Top (or Lazy Inside Methods)

Follow the existing pattern in `agency_orchestrator.py` where imports are done lazily inside methods (e.g., `from app.services.long_term_memory import LongTermMemoryService` at line 595). Add similar lazy imports for the three new services.

### Change 2: Replace Memory Injection in `_execute_react_path()` (Lines ~592-610)

**Current code** (lines 592-610 of `agency_orchestrator.py`):
```python
# Inject long-term memories if available
ltm_service = None
try:
    from app.services.long_term_memory import LongTermMemoryService
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as ltm_session:
        ltm_service = LongTermMemoryService(db_session=ltm_session, ...)
        ltm_memories = await ltm_service.get_memories_for_agent(
            tenant_id=ctx.tenant_id,
            agency_id=getattr(self.agency_config, "agency_id", ""),
            agent_node_id=node["id"],
            user_id=ctx.user_id,
        )
        if ltm_memories:
            injection = ltm_service.format_memories_for_injection(ltm_memories)
            if injection:
                memory_context["long_term_memory"] = injection["content"]
except Exception as e:
    logger.debug("ltm_inject_skipped", error=str(e)[:100])
```

**Replace with** (pseudocode structure):

```python
# Inject long-term memories via 2-level semantic retrieval
try:
    from app.services.agency_memory_retriever import AgencyMemoryRetriever, format_retrieval_for_context
    from app.services.agency_chunk_service import AgencyChunkService
    from app.services.agency_context_budget import ContextBudgetManager
    from app.orchestrator.vector_store.embedding_service import EmbeddingService
    from app.services.long_term_memory import LongTermMemoryService
    from app.core.database import AsyncSessionLocal

    model_name = node.get("model", "gpt-4o")
    budget = ContextBudgetManager(model_name=model_name)

    async with AsyncSessionLocal() as ltm_session:
        embedding_service = EmbeddingService()
        ltm_service = LongTermMemoryService(db_session=ltm_session, gateway_url=base_url, user_token=ctx.user_token)
        chunk_service = AgencyChunkService(db=ltm_session, embedding_service=embedding_service)
        retriever = AgencyMemoryRetriever(
            db=ltm_session,
            embedding_service=embedding_service,
            ltm_service=ltm_service,
            chunk_service=chunk_service,
        )

        retrieval = await retriever.retrieve(
            query=augmented_message,
            tenant_id=ctx.tenant_id,
            agency_id=getattr(self.agency_config, "agency_id", ""),
            agent_node_id=node["id"],
            user_id=ctx.user_id,
            max_tokens=budget.remaining // 2,
        )
        formatted = format_retrieval_for_context(retrieval)
        if formatted:
            memory_context["long_term_memory"] = formatted

except ImportError:
    # Sections not deployed yet — fall back to legacy confidence-sort
    # (keep existing ltm injection code as fallback)
    ...
except Exception as e:
    logger.debug("semantic_memory_inject_skipped", error=str(e)[:100])
    # Fall back to legacy confidence-sort on any error
    ...
```

Key points:
- `augmented_message` is used as the `query` -- this is the full task context the agent will work on, making it the ideal semantic query
- `budget.remaining // 2` gives memories up to 50% of the remaining budget (after system prompt)
- `ContextBudgetManager` is created with the node's model name for correct context window limits
- `EmbeddingService()` is instantiated fresh per execution (stateless, uses environment config)
- The `AsyncSessionLocal()` context manager is reused from the existing pattern
- All four services share the same `ltm_session` for the retrieval phase
- The executor must keep `budget.completion_reserve_tokens` untouched when setting the final LLM `max_tokens`

### Change 3: Add Post-Execution Chunking in `_execute_react_path()` (After Line ~643)

Insert chunking AFTER `ctx.results[node["id"]] = result.final_answer` and AFTER the existing fact extraction block (lines 646-661), but BEFORE the event emission:

```python
# Chunk agent output into L2 store for future retrieval
try:
    from app.services.agency_chunk_service import AgencyChunkService
    from app.orchestrator.vector_store.embedding_service import EmbeddingService
    from app.core.database import AsyncSessionLocal

    if result.final_answer and len(result.final_answer) > 100:
        async with AsyncSessionLocal() as chunk_session:
            embedding_svc = EmbeddingService()
            chunk_service = AgencyChunkService(db=chunk_session, embedding_service=embedding_svc)
            await chunk_service.chunk_and_store(
                output=result.final_answer,
                tenant_id=ctx.tenant_id,
                agency_id=getattr(self.agency_config, "agency_id", ""),
                user_id=ctx.user_id,
                agent_node_id=node["id"],
                run_id=getattr(ctx, "run_id", "") or node["id"],
                source_node_id=node["id"],
                metadata={"model": node.get("model", "gpt-4o"), "executor": "react"},
            )
except Exception as e:
    logger.debug("chunk_store_failed", error=str(e)[:100])
```

Key points:
- Only chunk outputs longer than 100 chars (skip trivial outputs)
- Use a separate `AsyncSessionLocal()` session for chunking (independent transaction)
- The `source_node_id` is set to `node["id"]` since this is the producing node
- `run_id` falls back to `node["id"]` if not available (matches existing pattern at line 578)
- Chunking failure is non-critical -- log and continue
- Metadata records model and executor type for diagnostics

### Change 4: Same Modifications in `_execute_autonomous_node()` (Lines ~688-810)

Apply the **same two changes** (pre-execution retrieval and post-execution chunking) to the autonomous executor path. The autonomous path currently has its own memory injection block (implicit through `ctx.get_context_text()`) and its own fact extraction block (lines 776-791).

For the autonomous path specifically:
- The `query` for retrieval should be: `ctx.get_context_text()` (matching line 760 where it is used as the task input)
- Chunking happens after `ctx.results[node["id"]] = result.final_answer` (line 773) and after fact extraction (lines 776-791)
- The metadata should include `"executor": "autonomous"`

Note: The autonomous path does NOT currently have explicit LTM injection before execution (it relies on `ctx.get_context_text()` which does not include memories). Adding 2-level retrieval here is a net-new capability for autonomous nodes. Inject the formatted memory context into the execution by appending it to the task input or passing it as a context parameter to `run_autonomous()`. The simplest approach is to append it to the task text:

```python
task_text = ctx.get_context_text() if hasattr(ctx, "get_context_text") else str(getattr(ctx, "input", ""))

# Inject semantic memories if available
try:
    # ... (same retrieval pattern as react path)
    if formatted:
        task_text = task_text + "\n\n" + formatted
except Exception as e:
    logger.debug("semantic_memory_inject_autonomous_skipped", error=str(e)[:100])

result = await run_autonomous(task=task_text, ...)
```

### Change 5: ContextBudgetManager Storage for Section 07

Store the `ContextBudgetManager` instance on the `ExecutionContext` object so that section-07 (inter-node optimization) can reference it for budget-aware truncation decisions. Add an optional attribute:

In `ExecutionContext.__init__()`:
```python
self.budget_manager: Any | None = None  # Set by orchestrator during agent execution
```

In the agent execution methods, after creating the budget manager:
```python
ctx.budget_manager = budget
```

This is a forward-looking change that section-07 will use but is harmless if section-07 is not yet deployed.

---

## Dependency Interfaces (from other sections)

### From Section 03: AgencyChunkService

```python
class AgencyChunkService:
    def __init__(self, db: AsyncSession, embedding_service: EmbeddingService): ...

    async def chunk_and_store(
        self, output: str, tenant_id: str, agency_id: str,
        user_id: int, agent_node_id: str, run_id: str,
        source_node_id: str, metadata: dict | None = None,
        chunk_retention_days: int = 7,
    ) -> int:
        """Chunk output, embed, store. Returns chunk count."""
```

### From Section 04: AgencyMemoryRetriever

```python
class AgencyMemoryRetriever:
    def __init__(
        self, db: AsyncSession, embedding_service: EmbeddingService,
        ltm_service: LongTermMemoryService, chunk_service: AgencyChunkService,
    ): ...

    async def retrieve(
        self, query: str, tenant_id: str, agency_id: str,
        agent_node_id: str, user_id: int, max_tokens: int = 3000,
    ) -> RetrievalResult:
        """Search L1 facts, fallback L2 chunks, merge + budget-fit."""

def format_retrieval_for_context(result: RetrievalResult) -> str:
    """Format 2-level results for LLM context injection. Returns empty string if no results."""
```

### From Section 05: ContextBudgetManager

```python
class ContextBudgetManager:
    def __init__(self, model_name: str): ...

    @property
    def remaining(self) -> int: ...

    def estimate_tokens(self, text: str) -> int: ...
    def allocate(self, text: str, label: str) -> str | None: ...
    def can_fit(self, tokens: int) -> bool: ...
```

### From Existing: EmbeddingService

```python
# python-backend/app/orchestrator/vector_store/embedding_service.py
class EmbeddingService:
    def __init__(self, ...): ...  # Uses environment config, no required params
    async def embed(self, text: str) -> list[float]: ...
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...
```

---

## Error Handling

All new code blocks must be wrapped in try/except with graceful degradation:

| Failure Scenario | Behavior |
|------------------|----------|
| `AgencyMemoryRetriever` import fails | Fall back to existing confidence-sort LTM injection |
| `retriever.retrieve()` raises exception | Log warning, continue with empty memory_context |
| `EmbeddingService()` constructor fails | Fall back to confidence-sort LTM injection |
| `chunk_and_store()` raises exception | Log debug, return agent result normally |
| `AsyncSessionLocal()` fails | Log, skip memory operations entirely |

The pattern is: **never let memory operations block agent execution**. Every new block is defensive.

---

## Logging

Add structured log events consistent with existing patterns:

```python
logger.info("semantic_memory_retrieved", l1_count=..., l2_count=..., query_len=len(augmented_message))
logger.debug("semantic_memory_inject_skipped", error=str(e)[:100])
logger.debug("chunk_store_completed", chunk_count=..., node_id=node["id"])
logger.debug("chunk_store_failed", error=str(e)[:100])
logger.debug("budget_manager_initialized", model=model_name, budget=budget.remaining)
```

---

## Verification Checklist

After implementing this section:

1. Run existing orchestrator tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/unit/test_agency_orchestrator_runtime.py -v` -- all must pass (no regressions)
2. Run new tests: `pytest tests/unit/test_orchestrator_memory_wiring.py -v`
3. Verify that when section-04/05 modules are not importable (ImportError), the orchestrator falls back to the legacy confidence-sort path gracefully
4. Verify that `_execute_react_path` and `_execute_autonomous_node` both call `chunk_and_store()` post-execution
5. Verify that `format_retrieval_for_context()` output replaces the old `format_memories_for_injection()` output in `memory_context["long_term_memory"]`
