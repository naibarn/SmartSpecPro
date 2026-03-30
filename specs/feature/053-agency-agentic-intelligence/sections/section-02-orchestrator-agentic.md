# Section 02: Orchestrator Agentic Mode

## Overview

This section adds the agentic execution path to the existing `AgencyOrchestrator`. When an agent node has `executionMode: "agentic"` in its `nodeConfig`, the orchestrator runs a reflection loop instead of a single-shot call. The agent receives a planning prompt (from section-01's `agentic_strategies.py`), executes, and the orchestrator checks for a structured `CompletionSignal` JSON block. If the agent signals completion, the answer is returned. Otherwise, the loop continues up to `maxReflectionCycles`.

**Dependencies:** section-01-foundation (provides `agentic_limits.py`, `agentic_sanitizer.py`, `agentic_strategies.py`)

**Blocks:** section-03-frontend-level1, section-08-react-integration

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/tests/unit/test_completion_detection.py` | CREATE | Tests for `_parse_completion()` method |
| `python-backend/tests/unit/test_agentic_orchestrator.py` | CREATE | Tests for `_execute_agent_node_agentic()` method |
| `python-backend/app/services/agency_orchestrator.py` | MODIFY | Add `CompletionSignal`, `_parse_completion()`, `_execute_agent_node_agentic()`, `delegation_depth` |

## Data Models

### CompletionSignal (Pydantic model)

Add to `agency_orchestrator.py` (or a shared models file importable from it):

```python
from pydantic import BaseModel

class CompletionSignal(BaseModel):
    complete: bool
    answer: str = ""
```

This model is used to parse the structured JSON block that agents emit when they determine their task is finished. It is intentionally minimal to reduce parsing failures.

## Tests (TDD)

All tests go in `python-backend/tests/unit/`. Write tests first, then implement to make them pass.

### File: `python-backend/tests/unit/test_completion_detection.py`

```python
"""Tests for CompletionSignal detection in _parse_completion()."""

import pytest

pytestmark = [pytest.mark.unit, pytest.mark.agency]
```

**Test cases to implement (stubs with docstrings):**

1. **`test_parse_completion_valid_json_block`** -- Response ending with a fenced JSON block `\`\`\`json\n{"complete": true, "answer": "done"}\n\`\`\`` returns a `CompletionSignal` with `complete=True` and `answer="done"`.

2. **`test_parse_completion_raw_json_at_end`** -- Response ending with bare `{"complete": true, "answer": "the result"}` (no code fences) returns a valid `CompletionSignal`.

3. **`test_parse_completion_no_json`** -- Response containing only plain text (no JSON anywhere) returns `None`, indicating the loop should continue.

4. **`test_parse_completion_malformed_json`** -- Response ending with `{"complete": true, "answer":` (truncated/invalid JSON) returns `None`.

5. **`test_parse_completion_complete_false`** -- Response with `{"complete": false, "answer": ""}` returns a `CompletionSignal` where `complete` is `False`.

6. **`test_parse_completion_marker_in_tool_output`** -- The string `[COMPLETE]` appearing in the response body does NOT trigger completion. Only structured JSON is recognized. This prevents prompt injection via text markers.

7. **`test_parse_completion_user_injected_marker`** -- User text containing `[FINAL ANSWER]` does NOT trigger completion. Only the structured `{"complete": true, ...}` JSON block is valid.

8. **`test_max_cycles_zero_returns_immediately`** -- When `maxReflectionCycles` is 0 (or clamped to 0), the agentic method returns immediately without calling the LLM. Returns the input message or empty string.

### File: `python-backend/tests/unit/test_agentic_orchestrator.py`

```python
"""Tests for the agentic execution path in AgencyOrchestrator."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_orchestrator import AgencyOrchestrator, ExecutionContext

pytestmark = [pytest.mark.unit, pytest.mark.agency]
```

**Test cases to implement (stubs with docstrings):**

1. **`test_agentic_mode_calls_planning_prompt`** -- When `nodeConfig.executionMode == "agentic"`, the agent's instructions are augmented with the planning prompt template from `get_planning_prompt()`. Mock `adapter.run()` to return a response with `{"complete": true, "answer": "result"}`. Verify the planning prompt text is present in the instructions passed to `adapter.create_agent()`.

2. **`test_agentic_mode_reflection_loop`** -- Agent is called multiple times until a `CompletionSignal` with `complete=True` is received. First call returns text without completion signal. Second call returns `{"complete": true, "answer": "final"}`. Verify `adapter.run()` was called exactly twice.

3. **`test_agentic_mode_max_cycles_respected`** -- Agent never returns a `CompletionSignal`. After `maxReflectionCycles` iterations, the loop stops and returns the last response. Verify `adapter.run()` call count equals `maxReflectionCycles`.

4. **`test_single_shot_mode_unchanged`** -- When `nodeConfig.executionMode` is `"single_shot"` (or absent), the existing `_execute_agent_node()` code path runs without any reflection loop. Verify `adapter.run()` is called exactly once.

5. **`test_ctx_results_overwritten_not_accumulated`** -- During the reflection loop, `ctx.results[node_id]` is overwritten with each cycle's response, not accumulated. After 3 cycles, verify `ctx.results[node_id]` contains only the last cycle's text.

**Test helper pattern (matching existing codebase conventions):**

```python
def _build_orchestrator(node_config=None, adapter=None):
    """Build an AgencyOrchestrator with a single agent node for testing."""
    _adapter = adapter or MagicMock()
    _adapter.create_agent = MagicMock(return_value=MagicMock(name="Agent"))
    _adapter.create_agency = MagicMock(return_value="agency-object")
    # Default: returns completion on first call
    _adapter.run = AsyncMock(
        return_value=MagicMock(response='{"complete": true, "answer": "done"}')
    )

    node = {
        "id": "agent-1",
        "name": "TestAgent",
        "instructions": "You are a test agent.",
        "model": "gpt-4o-mini",
        "model_settings": None,
        "is_entry_point": True,
        "node_type": "agent",
        "node_config": node_config or {},
    }

    orchestrator = AgencyOrchestrator(
        nodes=[node],
        edges=[],
        adapter=_adapter,
        db=AsyncMock(),
        agency_config=MagicMock(
            system_prompt="",
            user_id=1,
            conversation_id="test-conv",
            max_run_time_seconds=60,
            credit_multiplier=1.0,
            creator_fee_credits=0,
            platform_share_pct=20,
            creator_id=None,
        ),
    )
    return orchestrator, _adapter
```

## Implementation Details

### 1. Add `CompletionSignal` model

Location: top of `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`, after existing imports.

```python
from pydantic import BaseModel

class CompletionSignal(BaseModel):
    complete: bool
    answer: str = ""
```

### 2. Add `delegation_depth` to `ExecutionContext`

In the `ExecutionContext.__init__()` method, add a new field:

```python
self.delegation_depth: int = 0
```

This field is used by section-10 (autonomous executor) for tracking recursive delegation. It must be present from this section onward so that `ExecutionContext` is ready for downstream consumers.

### 3. Add `_parse_completion()` method

Add as a static method or module-level function in `agency_orchestrator.py`.

**Behavior:**
- Scans the response text for JSON at the end of the string
- Supports two formats:
  - Fenced: `` ```json\n{...}\n``` `` at end of response
  - Raw: `{...}` as the last non-whitespace content
- Attempts to parse the JSON into `CompletionSignal` via Pydantic
- Returns `CompletionSignal` on success, `None` on failure (invalid JSON, missing fields, no JSON found)
- MUST NOT scan for bare text markers like `[COMPLETE]` or `[FINAL ANSWER]` -- these are prompt injection vectors

**Implementation guidance:**
- Use a regex to extract the last JSON block: look for `\{[^{}]*"complete"[^{}]*\}` near the end of text
- For fenced blocks: `r'```json\s*(\{.*?\})\s*```\s*$'` with `re.DOTALL`
- Try fenced first, then raw JSON
- Wrap Pydantic parse in try/except -- return `None` on any parse failure
- Keep the function pure (no side effects, no logging on expected `None` returns)

### 4. Add `_execute_agent_node_agentic()` method

Add as a new method on `AgencyOrchestrator`.

**Signature:**
```python
async def _execute_agent_node_agentic(
    self, node: NodeRow, ctx: ExecutionContext
) -> str:
```

**Flow:**
1. Read config from `node.get("node_config") or {}`:
   - `planningStrategy`: str (default `"basic"`)
   - `maxReflectionCycles`: int (default 3)
   - `showReasoning`: bool (default False)
2. Clamp `maxReflectionCycles` via `min(user_value, MAX_REFLECTION_CYCLES)` from `agentic_limits`
3. If clamped value is 0: return empty string immediately
4. Get planning prompt via `get_planning_prompt(strategy, max_cycles)` from `agentic_strategies`
5. Augment the agent's instructions with the planning prompt (append to existing instructions)
6. For each cycle from 1 to max_cycles:
   a. Call the existing agent execution logic (adapter.create_agent, adapter.create_agency, adapter.run) -- reuse the same pattern from `_execute_agent_node()` but with augmented instructions
   b. Get response text from `run_result.response`
   c. Store in `ctx.results[node_id]` (overwrite, not append)
   d. Call `_parse_completion(response)` 
   e. If `CompletionSignal` returned with `complete=True`: return `signal.answer`
   f. If `complete=False` or `None`: emit SSE event for cycle completion, continue loop
   g. Optionally emit reasoning trace if `showReasoning` is True
7. After all cycles exhausted: return the last response text

**SSE events to emit per cycle:**
```python
if self.event_emitter:
    await self.event_emitter.emit("agentic_cycle", {
        "cycleNumber": cycle,
        "status": "complete" if signal and signal.complete else "continue",
        "agentName": node.get("name", "Agent"),
    })
```

### 5. Modify `_execute_agent_node()` to branch

In the existing `_execute_agent_node()` method, add an early check before the current logic:

```python
async def _execute_agent_node(self, node: NodeRow, ctx: ExecutionContext) -> str:
    node_config = node.get("node_config") or {}
    execution_mode = node_config.get("executionMode", "single_shot")

    if execution_mode == "agentic":
        return await self._execute_agent_node_agentic(node, ctx)

    # ... existing single-shot logic unchanged ...
```

**Placement:** This check goes at the very top of `_execute_agent_node()`, before the adapter-None check, guardrail checks, and knowledge base retrieval. The agentic method handles all of those internally.

### 6. Imports to add

At the top of `agency_orchestrator.py`:

```python
from app.services.agentic_limits import MAX_REFLECTION_CYCLES, clamp_user_value
from app.services.agentic_strategies import get_planning_prompt
```

These imports reference modules created in section-01-foundation.

## Key Design Decisions

1. **Agentic method reuses adapter pattern, not direct LLM calls.** Level 1 re-invokes `adapter.run()` per cycle. This keeps it simple and backward-compatible. Level 2 (section-05/08) replaces this with direct SDK calls.

2. **CompletionSignal is JSON-only, no text markers.** This prevents prompt injection where user content contains `[COMPLETE]` or similar markers.

3. **`ctx.results[node_id]` is overwritten per cycle.** Each cycle's result replaces the previous one. This prevents unbounded memory growth and ensures downstream nodes see only the final result.

4. **`delegation_depth` is added now but used later.** Adding it to `ExecutionContext` in this section avoids a separate migration. Section-10 will use it for autonomous delegation.

5. **Guardrails run inside the agentic loop.** Input guardrails run once before the loop starts. Output guardrails run on the final answer. Per-cycle guardrails are not applied (too expensive and the planning prompt constrains behavior).

## Verification Checklist

- [x] `pytest python-backend/tests/unit/test_completion_detection.py -v` -- all 8 tests pass
- [x] `pytest python-backend/tests/unit/test_agentic_orchestrator.py -v` -- all 7 tests pass
- [x] `pytest python-backend/tests/unit/test_agency_orchestrator_runtime.py -v` -- 1 pre-existing failure (not a regression)
- [x] Existing single-shot agencies work identically (no behavior change when `executionMode` is absent or `"single_shot"`)
- [x] `CompletionSignal` import works from test files
- [x] `delegation_depth` field exists on `ExecutionContext` instances

## Implementation Notes (Post-Build)

**Files created:**
- `python-backend/tests/unit/test_completion_detection.py` (8 tests)
- `python-backend/tests/unit/test_agentic_orchestrator.py` (7 tests, 2 more than spec)

**Files modified:**
- `python-backend/app/services/agency_orchestrator.py` — CompletionSignal, _parse_completion, _execute_agent_node_agentic, delegation_depth

**Deviations from original plan (code review fixes):**
- Input/output guardrails run in `_execute_agent_node()` wrapping the agentic dispatch (spec Design Decision 5).
- Unknown strategy falls back to "basic" with warning log instead of raising ValueError.
- Imports moved before the loop (from inside the hot loop).
- `showReasoning` config field documented as reserved for Level 2.
- Prior response truncated to 32000 chars to prevent unbounded message growth.
- Added `test_agentic_mode_zero_cycles_returns_empty` (proper orchestrator-level test).
- Added `test_parse_completion_mid_text_json_ignored` (verifying `$` anchor rejects mid-text JSON).
- Simplified fragile `call_args` test introspection.

**Test results:** 15/15 passed (8 completion + 7 orchestrator).