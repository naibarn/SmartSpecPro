Now I have all the context needed. Let me generate the section content.

# Section 10: Workflow Integration

## Overview

This section integrates the agency-swarm multi-agent system into SmartSpecPro's existing workflow orchestrator and skill detection system. It adds two capabilities:

1. **AgencyExecutor** -- a new node executor that allows workflow graphs to include an "agency_run" node, executing a full multi-agent agency as a step within a LangGraph workflow.
2. **Skill Auto-Trigger for Agencies** -- extends the existing skill detector in `packages/skills/src/detector.ts` and `apps/web/server/services/skillDetector.ts` to recognize agency trigger patterns and offer agency runs as alternatives to single-skill execution.

**Phase:** 3
**Depends on:** section-04-python-services (AgencyService must exist at `python-backend/app/services/agency_service.py`), section-06-nodejs-integration (tRPC agency router and CreditSourceType "agency" must be in place)
**Blocks:** section-11-admin-observability

---

## Background

### Workflow Orchestrator Architecture

SmartSpecPro's workflow system is built on LangGraph. The key components:

- **NodeRegistry** (`/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`) -- Singleton registry mapping node type strings to `NodeTypeSpec` dataclass instances. Each spec includes inputs, outputs, and an `executor` dotpath string.
- **NodeTypeSpec** -- Dataclass with fields: `type`, `display_name`, `description`, `icon`, `color`, `category`, `inputs` (list of `InputSpec`), `outputs` (list of `OutputSpec`), `executor` (Python dotpath to executor class).
- **NodeExecutor protocol** (`/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/base.py`) -- Protocol class requiring `async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]`.
- **ExecutionContext** -- Dataclass with: `user_id`, `tenant_id`, `workflow_id`, `execution_id`, `credits_available`, `extra_data` (dict with `user_token`, `workspace_root`, etc.).
- **NodeExecutionData** -- Dataclass with: `node_id`, `node_type`, `config` (dict), `inputs` (dict), `state` (dict of outputs from previous nodes).
- **Node adapter** (`/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py`) -- `make_langgraph_node()` wraps any `NodeExecutor` into a LangGraph-compatible async function. It builds `ExecutionContext` from LangGraph's `RunnableConfig.configurable`, resolves inputs from upstream `node_outputs`, calls `executor.execute()`, and returns a state update dict.

New node types are registered inside `NodeRegistry._register_core_nodes()`. The registry is a singleton accessed via `NodeRegistry.get_instance()`.

### Existing SkillExecutor Pattern

The `SkillExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/skill_executor.py` provides a good template. It:
1. Reads `skill_id` from `data.inputs` or `data.config`
2. Discovers the skill definition from disk
3. Calls the Node.js LLM gateway via `httpx` using the `user_token` from `context.extra_data`
4. Returns `{"outputs": {...}, "skill_id": ..., "cost": ...}`

The `AgencyExecutor` will follow this same pattern but delegate to the `AgencyService` instead of calling the LLM gateway directly.

### Skill Detection System

The skill detection pipeline works as follows:
1. **`packages/skills/src/detector.ts`** -- Pure detection logic. `detectSkillFromList(message, skills)` iterates trigger patterns and returns a `SkillDetectionResult` with confidence score.
2. **`apps/web/server/services/skillDetector.ts`** -- Server-side wrapper. `detectSkill(message, conversationId?, skillSettings?, userId?)` loads available skills from registry + DB, filters by user preferences, and calls the shared detector.
3. **`apps/web/server/routers/chat.ts`** -- tRPC `detectSkill` mutation exposes detection to the frontend.

Agency auto-trigger extends this pipeline by adding agency definitions alongside skill definitions during detection.

---

## Files Created (Actual)

| File | Purpose |
|------|---------|
| `python-backend/app/orchestrator/node_executors/agency_executor.py` | AgencyExecutor -- workflow node executor with session management, UUID validation, timeout handling |
| `python-backend/tests/unit/test_agency_executor.py` | 12 unit tests (3 registration, 7 execution, 2 session cleanup) |
| `apps/web/server/services/__tests__/agencySkillTrigger.test.ts` | 6 tests for agency trigger detection |

## Files Modified (Actual)

| File | Change |
|------|--------|
| `python-backend/app/orchestrator/node_registry.py` | Registered `agency_run` node type at end of `_register_core_nodes()` |
| `python-backend/app/api/workflows.py` | Added `/agencies` GET endpoint for workflow node dropdown (tenant-isolated) |
| `packages/skills/src/detector.ts` | Added `detectAgencyFromList()` with priority-sorted matching and `calculateAgencyConfidence()` |
| `packages/skills/src/types.ts` | Added `AgencyTriggerDefinition` and `AgencyDetectionResult` interfaces |
| `packages/skills/src/index.ts` | No changes needed (already uses `export *` from detector/types) |
| `apps/web/server/services/skillDetector.ts` | Added `detectSkillWithAgency()` function, exported `ExtendedSkillDetectionResult` type |

## Deviations from Plan

1. **Feature flag**: Used existing `AGENCY_SWARM_ENABLED` instead of plan's `AGENCY_WORKFLOW_NODE_ENABLED` (doesn't exist in config yet)
2. **Cost field**: Set `cost: 0` instead of `total_tokens`. Credits tracked inside AgencyService via AgencyCreditManager
3. **Agency detection**: Created separate `detectSkillWithAgency()` function instead of modifying `detectSkill()` directly (non-breaking extension)
4. **Session management**: Added `try/finally` with `session.close()` for connection pool safety (review fix)
5. **UUID validation**: Added regex-based UUID format check for agency_id (review fix)
6. **Tenant isolation**: Enforced strict tenant filter on `/agencies` endpoint - returns empty when tenant_id is None (review fix)

---

## Tests First

### Test File 1: AgencyExecutor (Python)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_executor.py`

These tests validate that the `AgencyExecutor` correctly integrates with the workflow orchestrator. All tests mock the `AgencyService` -- no real LLM calls or database access.

```python
"""Tests for AgencyExecutor workflow node executor.

Run: cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/unit/test_agency_executor.py -v
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_registry import NodeRegistry


# ---- Registration Tests ----

@pytest.mark.unit
@pytest.mark.agency
def test_agency_executor_registered_in_node_registry():
    """AgencyExecutor is registered as 'agency_run' in NodeRegistry."""
    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("agency_run")
    assert spec is not None
    assert spec.type == "agency_run"
    assert spec.display_name == "Agency Run"
    assert spec.category == "ai"
    assert spec.executor == "app.orchestrator.node_executors.agency_executor.AgencyExecutor"


@pytest.mark.unit
@pytest.mark.agency
def test_agency_run_node_has_correct_inputs():
    """agency_run node has agency_id (required) and message (required, connectable) inputs."""
    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("agency_run")
    assert spec is not None
    input_names = [i.name for i in spec.inputs]
    assert "agency_id" in input_names
    assert "message" in input_names
    # agency_id is required, not connectable (user selects from dropdown)
    agency_id_input = next(i for i in spec.inputs if i.name == "agency_id")
    assert agency_id_input.required is True
    assert agency_id_input.accepts_connection is False
    # message is required and connectable (can receive from upstream node)
    message_input = next(i for i in spec.inputs if i.name == "message")
    assert message_input.required is True
    assert message_input.accepts_connection is True


@pytest.mark.unit
@pytest.mark.agency
def test_agency_run_node_has_correct_outputs():
    """agency_run node outputs result (text) and run_metadata (json)."""
    registry = NodeRegistry.get_instance()
    spec = registry.get_node_type("agency_run")
    assert spec is not None
    output_names = [o.name for o in spec.outputs]
    assert "result" in output_names
    assert "run_metadata" in output_names


# ---- Execution Tests ----

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_receives_workflow_input_and_returns_output():
    """AgencyExecutor calls AgencyService.execute_run with correct params and returns result."""
    # Arrange: mock AgencyService
    # Act: call executor.execute(data, context)
    # Assert: result dict has 'outputs' key with 'result' and 'run_metadata'
    pass


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_respects_workflow_timeout():
    """AgencyExecutor uses maxRunTimeSeconds from agency config or workflow timeout."""
    # Arrange: mock AgencyService to take longer than timeout
    # Act: call executor.execute with timeout context
    # Assert: execution is terminated and error result returned
    pass


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_handles_agency_failure_gracefully():
    """AgencyExecutor returns error output dict (not exception) when agency run fails."""
    # Arrange: mock AgencyService.execute_run to raise RuntimeError
    # Act: call executor.execute(data, context)
    # Assert: result has outputs.result="" and error field set
    pass


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_missing_agency_id_returns_error():
    """AgencyExecutor returns error when agency_id is not in inputs or config."""
    pass


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_passes_user_token_to_agency_service():
    """AgencyExecutor extracts user_token from context.extra_data and passes to AgencyService."""
    pass


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_passes_tenant_id_from_context():
    """AgencyExecutor uses context.tenant_id for tenant isolation in agency lookup."""
    pass


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_agency_executor_checks_feature_flag():
    """AgencyExecutor returns error when AGENCY_WORKFLOW_NODE_ENABLED flag is disabled."""
    pass
```

### Test File 2: Agency Skill Auto-Trigger (TypeScript)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencySkillTrigger.test.ts`

These tests validate that the skill detection system recognizes agency trigger patterns and offers agencies alongside skills.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for agency auto-trigger in skill detection pipeline.
 *
 * Run: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/agencySkillTrigger.test.ts
 */

describe("Agency Skill Auto-Trigger", () => {
  // Test: detectAgencyFromList recognizes agency trigger patterns
  it("should detect agency trigger from message matching agency pattern", () => {
    // Arrange: create an AgencyTriggerDefinition with regex pattern
    // Act: call detectAgencyFromList(message, [agencyDef])
    // Assert: result.detected === true, result.agency is set
  });

  // Test: agency trigger offered alongside skill suggestions
  it("should return agency suggestion alongside skill suggestion when both match", () => {
    // Arrange: message matches both a skill trigger and an agency trigger
    // Act: call detectSkill with agency-aware detection
    // Assert: result includes agencyMatch field with agency info
  });

  // Test: agency trigger dispatches to agency run endpoint
  it("should include agency_id and route info in agency detection result", () => {
    // Arrange: AgencyTriggerDefinition with agencyId
    // Act: detect from message
    // Assert: result.agencyId is set, result.routeTo === 'agency'
  });

  // Test: no false positives -- non-matching messages return no agency detection
  it("should not detect agency when message does not match any trigger", () => {
    // Act: call detectAgencyFromList("hello world", [agencyDef])
    // Assert: result.detected === false
  });

  // Test: agency detection respects feature flag
  it("should skip agency detection when AGENCY_SKILL_TRIGGER_ENABLED is false", () => {
    // Arrange: mock feature flag to return false
    // Act: call detection
    // Assert: no agency match even if patterns match
  });

  // Test: confidence scoring for agency triggers
  it("should calculate confidence based on match position and specificity", () => {
    // Similar to skill confidence: higher if match is at start of message
  });
});
```

---

## Implementation Details

### Part 1: AgencyExecutor Node Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/agency_executor.py`

The `AgencyExecutor` follows the same protocol as `SkillExecutor` and all other node executors. It implements the `NodeExecutor` protocol's `execute()` method.

```python
"""Agency run node executor for workflow integration.

Executes a multi-agent agency as a workflow node step.
Delegates to AgencyService for the actual run.
"""
import asyncio
import os
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)

# Internal URL for feature flag check (could also be env-based)
AGENCY_WORKFLOW_FLAG = "AGENCY_WORKFLOW_NODE_ENABLED"


class AgencyExecutor:
    """Executor for 'agency_run' workflow nodes.

    Loads an agency by ID, executes it with the provided message input,
    and returns the agency's final response as the node output.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute an agency run within a workflow.

        Reads 'agency_id' and 'message' from data.inputs/config.
        Delegates to AgencyService.execute_run().
        Returns dict with 'outputs' containing 'result' (str) and 'run_metadata' (dict).
        """
        ...
```

Key implementation points:

1. **Input resolution:** Read `agency_id` from `data.inputs` or `data.config` (same fallback pattern as `SkillExecutor`). Read `message` from `data.inputs` -- this is the connectable input that receives text from upstream workflow nodes.

2. **Feature flag check:** Before executing, check if `AGENCY_WORKFLOW_NODE_ENABLED` is set. This can be checked via environment variable or by importing the feature flag service. If disabled, return an error dict immediately.

3. **AgencyService delegation:** Import `AgencyService` from `app.services.agency_service`. Call `execute_run()` with the agency_id, message, and a `RunContext` built from the `ExecutionContext`:
   - `user_id` from `context.user_id`
   - `tenant_id` from `context.tenant_id`
   - `user_token` from `context.extra_data.get("user_token")`
   - Timeout derived from workflow timeout or agency's `maxRunTimeSeconds`

4. **Timeout handling:** Wrap the `execute_run` call in `asyncio.wait_for()` using the agency's `maxRunTimeSeconds` (default 600). If the workflow has a tighter timeout in `context.extra_data`, use the smaller of the two.

5. **Error handling:** Catch exceptions from `AgencyService` and return a structured error result dict (NOT re-raise). This matches the pattern used by `SkillExecutor` where failures produce `{"outputs": {"result": "", "status": "error"}, "error": "..."}`.

6. **Return format:** On success, return:
   ```python
   {
       "outputs": {
           "result": run_result.final_response,
           "run_metadata": {
               "run_id": run_result.run_id,
               "agent_steps": run_result.step_count,
               "credits_used": run_result.total_credits_used,
               "duration_ms": run_result.duration_ms,
           },
       },
       "agency_id": agency_id,
       "cost": run_result.total_credits_used,
   }
   ```

### Part 2: NodeRegistry Registration

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`

Add the `agency_run` node type registration inside `_register_core_nodes()`. Place it after the existing `skill` node registration (around line 504). The registration follows the exact same pattern as every other node in the registry.

```python
# Agency Run node
self.register_node_type(
    NodeTypeSpec(
        type="agency_run",
        display_name="Agency Run",
        description="Execute a multi-agent agency",
        icon="Users",
        color="purple",
        category="ai",
        inputs=[
            InputSpec(
                name="agency_id",
                display_name="Agency",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                options_endpoint="/api/v1/workflows/agencies",
                placeholder="Select an agency...",
            ),
            InputSpec(
                name="message",
                display_name="Message",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder="Enter message or connect from previous node...",
            ),
            InputSpec(
                name="timeout_seconds",
                display_name="Timeout (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=600,
                validation={"min": 10, "max": 3600},
            ),
        ],
        outputs=[
            OutputSpec(
                name="result",
                display_name="Agency Result",
                data_type="text",
            ),
            OutputSpec(
                name="run_metadata",
                display_name="Run Metadata",
                data_type="json",
            ),
        ],
        executor="app.orchestrator.node_executors.agency_executor.AgencyExecutor",
    )
)
```

The `options_endpoint` for `agency_id` points to `/api/v1/workflows/agencies` -- this endpoint needs to return a list of published agencies for the current tenant. It can be added to the existing workflows router in `python-backend/app/api/workflows.py` or served via the Node.js tRPC agency router (which already has a `list` procedure). The simplest approach is to add a thin handler in the workflows API that proxies to the Node.js agency list endpoint, or reads directly from the `agencies` table using read-only SQLAlchemy models (same pattern as `AgencyService.load_agency()`).

### Part 3: Agency List Endpoint for Workflow UI

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py`

Add a simple endpoint that returns published agencies as options for the workflow node editor dropdown. This follows the existing pattern used by `/api/v1/workflows/skills` and `/api/v1/workflows/available-models`.

```python
@router.get("/agencies")
async def list_agencies_for_workflow(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List published agencies for workflow node dropdown.
    
    Returns list of {value: agency_id, label: agency_name} for the select input.
    """
    ...
```

This endpoint reads from the `agencies` table using a read-only SQLAlchemy model, filtered by `tenant_id` (from auth headers) and `status = 'published'`. Returns `[{"value": id, "label": name, "description": description}, ...]`.

### Part 4: Skill Auto-Trigger for Agencies

#### 4a. New Types

**File:** `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts`

Add these types at the end of the file:

```typescript
/**
 * Minimal agency definition for trigger detection.
 * Not the full agency config -- just enough for matching.
 */
export interface AgencyTriggerDefinition {
  /** Agency ID (UUID) */
  agencyId: string;
  /** Agency display name */
  name: string;
  /** Agency description */
  description: string;
  /** Trigger rules (same format as skill triggers) */
  triggers: TriggerRule[];
  /** Priority for detection ordering */
  priority: number;
}

/**
 * Result of agency trigger detection.
 */
export interface AgencyDetectionResult {
  detected: boolean;
  agency: AgencyTriggerDefinition | null;
  confidence: number;
  matchedTrigger: string | null;
  suggestedPrompt: string | null;
}
```

#### 4b. Detection Function

**File:** `/home/dev/projects/SmartSpecPro/packages/skills/src/detector.ts`

Add a `detectAgencyFromList()` function. This is structurally identical to `detectSkillFromList()` but operates on `AgencyTriggerDefinition` objects instead of `SkillDefinition` objects. The confidence calculation reuses the same logic -- match position, message length ratio, etc.

```typescript
import type { AgencyTriggerDefinition, AgencyDetectionResult } from "./types";

/**
 * Detect if a message triggers any agency from a given list.
 * Structurally identical to detectSkillFromList but for agencies.
 */
export function detectAgencyFromList(
  message: string,
  agencies: AgencyTriggerDefinition[]
): AgencyDetectionResult {
  // Same pattern as detectSkillFromList:
  // iterate agencies, check each trigger.regex against message,
  // calculate confidence, return first match
  ...
}
```

#### 4c. Re-export

**File:** `/home/dev/projects/SmartSpecPro/packages/skills/src/index.ts`

The file currently exports everything from `types`, `parser`, and `detector`. Since the new types and function are added to existing files, they will be automatically re-exported. No changes needed unless the exports are selective (they are `export *` so no change required).

#### 4d. Server-Side Integration

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillDetector.ts`

Extend the `detectSkill()` function to also check agency triggers when the `AGENCY_SKILL_TRIGGER_ENABLED` feature flag is on. The flow becomes:

1. Run existing skill detection (unchanged)
2. If `AGENCY_SKILL_TRIGGER_ENABLED` is true:
   a. Load published agencies for the user's tenant that have trigger patterns configured
   b. Call `detectAgencyFromList(message, agencyTriggers)`
   c. If an agency match is found, include it in the return value as an `agencyMatch` field
3. Return the combined result

The return type of `detectSkill()` is extended to optionally include an `agencyMatch` field. This is a non-breaking change -- existing consumers that do not check `agencyMatch` continue to work.

```typescript
// Extended return type (non-breaking addition)
interface ExtendedSkillDetectionResult extends SkillDetectionResult {
  agencyMatch?: {
    agencyId: string;
    agencyName: string;
    confidence: number;
    matchedTrigger: string | null;
    suggestedPrompt: string | null;
  };
}
```

The agency trigger definitions come from the database. Agencies can store trigger patterns in their `systemPrompt` or in a dedicated field. For this implementation, agencies that want auto-triggering should have trigger patterns stored in their config. The simplest approach: add an optional `triggerPatterns` JSON field to the `agencies` table (this is a minor schema addition that can be done via a nullable JSON column, or by reading patterns from a convention in the agency's description/name).

However, to avoid schema changes in this section, the initial implementation can derive trigger patterns from the agency's name and description using simple heuristics:
- Agency name becomes a trigger pattern (e.g., agency named "Research Agency" matches messages containing "research agency")
- First sentence of description provides additional keywords

This keeps the implementation simple and schema-change-free. More sophisticated trigger configuration can be added in the AgencyBuilder UI (section-09) later.

---

## Implementation Checklist

1. Create test file `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_executor.py` with all test stubs
2. Create test file `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencySkillTrigger.test.ts` with all test stubs
3. Create `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/agency_executor.py` implementing `AgencyExecutor`
4. Modify `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` to register `agency_run` in `_register_core_nodes()`
5. Add agency list endpoint to `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py`
6. Add `AgencyTriggerDefinition` and `AgencyDetectionResult` types to `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts`
7. Add `detectAgencyFromList()` to `/home/dev/projects/SmartSpecPro/packages/skills/src/detector.ts`
8. Extend `detectSkill()` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillDetector.ts` to include agency matching
9. Run Python tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/unit/test_agency_executor.py -v`
10. Run TypeScript tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/agencySkillTrigger.test.ts`
11. Run existing registry tests to verify no regression: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/test_node_registry.py -v`
12. Run TypeScript type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`