Now I have all the context I need. Let me produce the section content.

# Section 11 -- Structured Output, Custom Communication Flows, and Dynamic Instructions

## Overview

This section implements three closely related features that enhance how agents produce, communicate, and resolve data during an agency run:

1. **Structured Output (Feature 2.6)** -- Per-agent JSON Schema validation on agent responses, with retry-on-failure and automatic storage of parsed data in `AgencyRunContext`.
2. **Custom Communication Flows (Feature 2.7)** -- Extended `flowConfig` on `agencyCommunicationFlows` with `contextFields`, `requireSummary`, `maxRoundTrips`, and `timeout` for fine-grained handoff control.
3. **Dynamic Instructions (Feature 2.8)** -- Template variable resolution in agent instructions at turn start, supporting `{agent_name}`, `{current_date}`, `{context.KEY}`, `{user.KEY}`, and graceful fallback for missing keys.

**Phase**: 2 -- Communication and Streaming
**Depends on**: section-01-database-migration (outputSchema column on agencyAgents, flowConfig column on agencyCommunicationFlows), section-07-agency-context (AgencyRunContext class for storing structured output and resolving `{context.KEY}`)
**Blocks**: None (leaf section)

---

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/services/agency_instruction_resolver.py` | Template variable resolution for dynamic instructions |
| `python-backend/app/services/agency_output_validator.py` | JSON Schema validation + retry logic for structured output |
| `python-backend/tests/unit/test_agency_output_validator.py` | Tests for structured output validation |
| `python-backend/tests/unit/test_agency_instruction_resolver.py` | Tests for dynamic instruction templates |
| `python-backend/tests/unit/test_agency_communication_flows.py` | Tests for maxRoundTrips enforcement and contextFields |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/drizzle/schema.ts` | Add `outputSchema` (json, nullable) to `agencyAgents`; add `flowConfig` (json, nullable) to `agencyCommunicationFlows` |
| `apps/web/server/routers/agency.ts` | Extend saveBuilder Zod schema: `outputSchema` on agents, `flowConfig` on communicationFlows with new flow types |
| `python-backend/app/services/agency_orchestrator.py` | Import and call `AgencyOutputValidator` after agent execution; import and call `resolve_instructions` before agent turn; track round-trip counters for flows |
| `python-backend/app/services/agency_swarm_adapter.py` | Pass resolved instructions (not raw) to agent; pass `output_type` derived from `outputSchema` |
| `python-backend/app/services/agency_service.py` | Read `outputSchema` from agent row and pass to `AgentConfig.output_type`; read `flowConfig` from communication flows |

---

## Tests -- Write First

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_output_validator.py`

```
# Test 1: Valid JSON response passes schema validation
#   - Schema: {"type": "object", "properties": {"score": {"type": "number"}}, "required": ["score"]}
#   - Response: '{"score": 85}' -> passes, returns parsed dict

# Test 2: Invalid JSON response triggers retry with feedback
#   - Schema requires "score" as number
#   - Response: '{"score": "high"}' -> validation fails
#   - Validator returns retry_feedback string containing the validation error

# Test 3: Non-JSON response triggers retry
#   - Schema expects object
#   - Response: 'The score is 85' -> JSON parse fails
#   - Validator returns retry_feedback instructing agent to respond with valid JSON

# Test 4: Successful structured output stored in context under {agentName}_output
#   - Mock AgencyRunContext, validate that context.set("{agentName}_output", parsed_data) is called

# Test 5: Retry limit respected (max validationAttempts)
#   - Set validationAttempts=2
#   - First attempt invalid, second attempt invalid -> returns error, does not retry further

# Test 6: Agent with no outputSchema skips validation entirely
#   - outputSchema is None -> validator returns original response unchanged

# Test 7: Empty outputSchema (empty object {}) treated as no validation
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`, `@pytest.mark.asyncio`

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_instruction_resolver.py`

```
# Test 1: {agent_name} resolved to actual agent name
#   - Instructions: "You are {agent_name}" -> "You are ResearchBot"

# Test 2: {current_date} resolved to today's date (YYYY-MM-DD format)

# Test 3: {current_time} resolved to current time (HH:MM format)

# Test 4: {tool_names} resolved to comma-separated list of agent's tool names

# Test 5: {context.KEY} resolved from AgencyRunContext
#   - Context has key "project" = "Alpha"
#   - Instructions: "Working on {context.project}" -> "Working on Alpha"

# Test 6: {user.KEY} resolved from user_context dict
#   - user_context has key "language" = "Thai"
#   - Instructions: "Respond in {user.language}" -> "Respond in Thai"

# Test 7: Missing template variable returns literal {key} (no error)
#   - Instructions: "Hello {unknown_var}" -> "Hello {unknown_var}"

# Test 8: Nested context key {context.nested.key} returns literal (no deep access)

# Test 9: Multiple variables in same instruction resolved correctly

# Test 10: Empty instructions string returns empty string

# Test 11: Instructions with no template variables returned unchanged
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_communication_flows.py`

```
# Test 1: maxRoundTrips enforcement between agent pair
#   - flowConfig.maxRoundTrips = 3
#   - After 3 handoffs between A->B, orchestrator terminates the exchange

# Test 2: contextFields included in agent prompt during handoff
#   - flowConfig.contextFields = ["summary", "priority"]
#   - When handoff occurs, those context keys are injected into the receiving agent's prompt

# Test 3: Orchestrator tracks round-trip counter per (fromAgent, toAgent) pair

# Test 4: flowConfig with maxRoundTrips=0 treated as unlimited

# Test 5: Missing flowConfig on a flow uses default behavior (unlimited round trips)
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`, `@pytest.mark.asyncio`

### Test additions for Vitest: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.test.ts`

```
# Test: saveBuilder validates outputSchema as valid JSON Schema object or null
# Test: saveBuilder validates flowConfig.maxRoundTrips as positive integer
# Test: saveBuilder accepts new flow types: 'orchestrator_worker', 'custom'
# Test: saveBuilder rejects flowConfig.maxRoundTrips with negative value
# Test: saveBuilder rejects flowConfig.timeout exceeding 3600 seconds
```

---

## Implementation Guidance

### 1. Structured Output Validator

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_output_validator.py`

This module validates agent responses against a JSON Schema and handles retry logic. It must NOT import from agency-swarm (isolation pattern).

**Dependencies**: `jsonschema` (already in requirements.txt for existing guardrail json_schema strategy).

**Class signature** (stubs only):

```python
"""Validate agent structured output against JSON Schema."""

from __future__ import annotations

import json
from typing import Any

import jsonschema
import structlog

logger = structlog.get_logger(__name__)


class AgencyOutputValidator:
    """Validates agent responses against an outputSchema.

    If validation fails, produces a feedback message for the agent
    to retry with corrected output.
    """

    def __init__(self, output_schema: dict[str, Any] | None, agent_name: str) -> None:
        """Store schema and agent name. If schema is None or empty, validation is a no-op."""
        ...

    def validate(self, response_text: str) -> ValidationResult:
        """Parse response as JSON, validate against schema.

        Returns ValidationResult with:
        - is_valid: bool
        - parsed_data: dict | None (if valid)
        - retry_feedback: str | None (if invalid, human-readable error for agent)
        """
        ...

    async def validate_and_store(
        self,
        response_text: str,
        context,  # AgencyRunContext
    ) -> tuple[str, bool]:
        """Validate response and store in context if valid.

        Stores under key '{agent_name}_output' in AgencyRunContext.
        Returns (response_text, was_valid).
        """
        ...


class ValidationResult:
    """Result of schema validation attempt."""
    is_valid: bool
    parsed_data: dict[str, Any] | None
    retry_feedback: str | None
```

**Key behaviors**:
- If `output_schema` is `None` or `{}`, skip validation entirely and return the response as-is.
- On JSON parse failure: return retry feedback like `"Your response must be valid JSON matching the required schema. Please respond with only the JSON object."`.
- On schema validation failure: include the specific `jsonschema.ValidationError.message` in the retry feedback.
- On success: call `context.set(f"{agent_name}_output", parsed_data)` to store structured data.

### 2. Dynamic Instruction Resolver

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_instruction_resolver.py`

Uses Python `str.format_map()` with a custom mapping that returns `{key}` for missing keys.

**Function signature** (stubs only):

```python
"""Resolve template variables in agent instructions at runtime."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


class SafeFormatDict(dict):
    """Dict subclass that returns '{key}' for missing keys instead of raising KeyError."""

    def __missing__(self, key: str) -> str:
        ...


def resolve_instructions(
    raw_instructions: str,
    *,
    agent_name: str,
    tool_names: list[str] | None = None,
    context: Any | None = None,  # AgencyRunContext
    user_context: dict[str, Any] | None = None,
) -> str:
    """Resolve all template variables in agent instructions.

    Supported variables:
    - {agent_name} -> agent's display name
    - {current_date} -> YYYY-MM-DD
    - {current_time} -> HH:MM
    - {tool_names} -> comma-separated tool list
    - {context.KEY} -> value from AgencyRunContext
    - {user.KEY} -> value from user_context dict

    Missing variables are left as literal '{variable}'.
    """
    ...
```

**Key behaviors**:
- Build a flat dict from all variable sources. For `{context.KEY}`, iterate context snapshot and add entries as `"context.KEY": value`. Same pattern for `{user.KEY}`.
- Use `raw_instructions.format_map(SafeFormatDict(variables))` for resolution.
- Do NOT support nested dot access (e.g., `{context.a.b}` is treated as a single key `"context.a.b"`).
- Log the resolved instructions at DEBUG level for tracing.

### 3. Communication Flow Config -- Backend Validation

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Extend the `communicationFlows` Zod schema in both `createAgency` and `saveBuilder` procedures.

**Current schema** (line ~791 and ~1069):
```typescript
communicationFlows: z.array(z.object({
  fromAgentName: z.string(),
  toAgentName: z.string(),
  flowType: z.enum(["delegation", "handoff", "parallel"]),
})).optional(),
```

**Updated schema**:
```typescript
communicationFlows: z.array(z.object({
  fromAgentName: z.string(),
  toAgentName: z.string(),
  flowType: z.enum(["delegation", "handoff", "parallel", "orchestrator_worker", "custom"]),
  flowConfig: z.object({
    contextFields: z.array(z.string().max(100)).max(20).optional(),
    requireSummary: z.boolean().optional(),
    maxRoundTrips: z.number().int().min(0).max(1000).optional(),
    timeout: z.number().int().min(0).max(3600).optional(),
  }).optional(),
})).optional(),
```

Also extend the agent object schema in saveBuilder to accept `outputSchema`:
```typescript
outputSchema: z.record(z.unknown()).nullable().optional(),
```

The `outputSchema` is stored as-is in the `agencyAgents.outputSchema` JSONB column (added by section-01 migration). No server-side JSON Schema meta-validation is required at save time -- invalid schemas will fail at runtime with clear error messages.

### 4. Communication Flow Config -- Drizzle Schema

**File**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add to `agencyCommunicationFlows` table definition (after `flowType` column):

```typescript
flowConfig: json("flowConfig").$type<{
  contextFields?: string[];
  requireSummary?: boolean;
  maxRoundTrips?: number;
  timeout?: number;
}>(),
```

Add to `agencyAgents` table definition:

```typescript
outputSchema: json("outputSchema").$type<Record<string, unknown>>(),
```

These columns are added by the section-01 migration. This section only references them -- do NOT create a separate migration.

### 5. Orchestrator Integration

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`

Three integration points in the orchestrator:

#### 5a. Dynamic instruction resolution before agent execution

In `_execute_agent_node()`, before passing instructions to the adapter, resolve template variables:

```python
from app.services.agency_instruction_resolver import resolve_instructions

# Inside _execute_agent_node, before calling adapter:
resolved = resolve_instructions(
    raw_instructions=node.get("instructions", ""),
    agent_name=node.get("name", "Agent"),
    tool_names=[t.get("name", "") for t in node_tools],
    context=self._run_context,  # AgencyRunContext instance
    user_context=self._user_context,
)
# Pass resolved instructions to agent config instead of raw
```

#### 5b. Structured output validation after agent execution

After the agent produces a response, validate if `outputSchema` is set on the node:

```python
from app.services.agency_output_validator import AgencyOutputValidator

# After getting agent response:
output_schema = node.get("output_schema")
if output_schema:
    validator = AgencyOutputValidator(output_schema, node.get("name", "Agent"))
    result_text, was_valid = await validator.validate_and_store(
        response_text=result,
        context=self._run_context,
    )
    if not was_valid:
        # Retry: re-run agent with feedback appended
        # Respect validation_attempts (default 1 = no retry)
        ...
```

The retry loop should:
1. Get `validation_attempts` from `node.get("validation_attempts", 1)`.
2. Loop up to `validation_attempts` times.
3. On each retry, append the `retry_feedback` to the conversation as a user message.
4. If all attempts fail, store the raw response and log a warning.

#### 5c. Round-trip counter for communication flows

Add a `_round_trip_counts` dict to `AgencyOrchestrator.__init__`:

```python
self._round_trip_counts: dict[tuple[str, str], int] = {}
```

When processing a handoff from agent A to agent B:
1. Look up the communication flow for this pair.
2. If `flowConfig.maxRoundTrips` is set and > 0, check counter.
3. If counter exceeds limit, terminate the exchange and return the last response.
4. If `flowConfig.contextFields` is set, extract those keys from `AgencyRunContext` and prepend them to the receiving agent's prompt.

### 6. Agency Service Integration

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py`

When building `AgentConfig` objects (around line 641), read the `outputSchema` from the agent row:

```python
output_type=agent_data.get("output_schema"),  # JSONB column from DB
```

When reading communication flows, include `flowConfig`:

```python
flow_config = flow_row.get("flow_config")  # JSONB from agencyCommunicationFlows
```

Pass flow configs to the orchestrator so it can enforce `maxRoundTrips` and inject `contextFields`.

---

## Schema Summary

### outputSchema (agencyAgents column)

A standard JSON Schema object stored as JSONB. Example:

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "tags": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["summary", "confidence"]
}
```

### flowConfig (agencyCommunicationFlows column)

```json
{
  "contextFields": ["summary", "priority", "current_step"],
  "requireSummary": true,
  "maxRoundTrips": 5,
  "timeout": 300
}
```

---

## Security Considerations

- **outputSchema**: Stored as-is from the builder. At runtime, `jsonschema.validate()` is used which is safe against schema-based attacks. Large schemas are bounded by the JSONB column size limit.
- **Dynamic instructions**: Template resolution uses `str.format_map()` which only performs string substitution -- no code execution. Context values are coerced to strings before insertion.
- **flowConfig.contextFields**: Only reads keys from `AgencyRunContext` -- no arbitrary code execution. Keys are validated as strings (max 100 chars) at save time.
- **maxRoundTrips**: Server-side enforced (max 1000) to prevent infinite loops between agents even if frontend sends a larger value.

---

## Verification Checklist

1. All Python tests pass: `pytest tests/unit/test_agency_output_validator.py tests/unit/test_agency_instruction_resolver.py tests/unit/test_agency_communication_flows.py -v`
2. Vitest agency tests pass with new saveBuilder fields: `cd apps/web && pnpm vitest run server/routers/__tests__/agency.test.ts`
3. TypeScript type check passes: `cd apps/web && pnpm check`
4. An agent with `outputSchema` set returns validated JSON and stores it in context
5. An agent with template variables in instructions sees them resolved at runtime
6. A communication flow with `maxRoundTrips=3` terminates after 3 exchanges
7. Missing template variables remain as literal `{key}` text (no crashes)