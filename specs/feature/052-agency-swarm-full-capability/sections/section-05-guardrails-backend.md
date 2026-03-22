Now I have all the context needed. Let me produce the section content.

# Section 05 — Guardrails Backend

## Section ID
`section-05-guardrails-backend`

## Dependencies
- **section-01-database-migration**: The `agency_guardrails` and `agency_agent_guardrails` tables must exist in the database before any CRUD or execution logic can function.

## Blocked By This Section
- **section-06-guardrails-frontend**: Consumes the tRPC procedures defined here.
- **section-12-topology-human-approval**: The `enforceOnHandoff` integration point requires guardrail execution to be available in the orchestrator.

## Goal

Implement the guardrails system backend across two layers:

1. **Node.js tRPC layer** -- CRUD procedures for managing guardrail definitions and agent assignments, including cross-tenant isolation and rate limiting.
2. **Python execution layer** -- A guardrail execution engine with 7 strategy implementations, integrated into the agency orchestrator for input/output validation during agent runs.

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_guardrails.py` | Python guardrail execution engine with 7 strategy implementations |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_agency_guardrails.py` | pytest unit tests for all guardrail strategies |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agencyGuardrails.test.ts` | Vitest unit tests for tRPC guardrail CRUD and assignment procedures |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` | Add 7 new tRPC procedures: `createGuardrail`, `updateGuardrail`, `deleteGuardrail`, `listGuardrails`, `testGuardrail`, `assignGuardrailToAgent`, `removeGuardrailFromAgent` |
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | Import the new `agencyGuardrails` and `agencyAgentGuardrails` table exports (already created by section-01) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` | Import and invoke guardrail execution at input, output, and handoff checkpoints |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py` | Fetch guardrail definitions from Node.js gateway and pass them to the orchestrator |

---

## TDD Test Specifications

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agencyGuardrails.test.ts`

Framework: Vitest. Follow the existing pattern in `apps/web/server/routers/__tests__/` -- mock the `db` module and call tRPC procedures via `createCallerFactory`.

```
Test: "createGuardrail validates strategy against 7 allowed values"
  - Input: { strategy: "invalid_strategy", ... }
  - Expect: Zod validation error (PARSE_ERROR)
  - Input: { strategy: "keyword_block", ... }
  - Expect: success, returns guardrail with id

Test: "createGuardrail validates mode is 'guidance' or 'strict'"
  - Input: { mode: "invalid" }
  - Expect: Zod validation error
  - Input: { mode: "strict" }
  - Expect: success

Test: "createGuardrail validates type is 'input' or 'output'"
  - Input: { type: "other" }
  - Expect: Zod validation error

Test: "createGuardrail rejects name > 100 characters"
  - Input: { name: "A".repeat(101) }
  - Expect: validation error

Test: "createGuardrail inserts record with tenantId from session context"
  - Mock db.insert to capture inserted values
  - Assert tenantId matches ctx.user.tenantId (not user-supplied)

Test: "updateGuardrail prevents updating guardrail from another tenant"
  - Mock db.select returns guardrail with tenantId = "tenant-A"
  - Call with ctx.user.tenantId = "tenant-B"
  - Expect: TRPCError code FORBIDDEN

Test: "deleteGuardrail removes guardrail and cascaded assignments"
  - Mock db.delete on agency_guardrails
  - Assert delete is called with correct id
  - CASCADE on agency_agent_guardrails is handled by DB constraint

Test: "listGuardrails filters by tenantId and agencyId"
  - Mock db.select
  - Assert WHERE conditions include tenantId = ctx.user.tenantId and agencyId filter

Test: "assignGuardrailToAgent blocks cross-tenant assignment"
  - Mock: guardrail.tenantId = "tenant-A", agent's agency.tenantId = "tenant-B"
  - Expect: TRPCError code FORBIDDEN with message indicating cross-tenant denied

Test: "assignGuardrailToAgent enforces UNIQUE(agentId, guardrailId)"
  - Mock: db.insert throws unique constraint violation
  - Expect: TRPCError code CONFLICT or graceful handling

Test: "removeGuardrailFromAgent deletes the junction row"
  - Mock db.delete on agency_agent_guardrails
  - Assert WHERE matches both agentId and guardrailId

Test: "testGuardrail calls Python backend with sample message and returns result"
  - Mock: HTTP call to Python guardrail test endpoint
  - Assert: returns { passed, message, action }
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_agency_guardrails.py`

Framework: pytest with `@pytest.mark.unit`. All tests are sync or async (use `@pytest.mark.asyncio` for async). Mock external dependencies (LLM Gateway, HTTP calls).

```
Test: "keyword_block blocks message containing keyword (case-insensitive)"
  - Config: { keywords: ["password", "credit card"] }
  - Message: "Please share your Password"
  - Expect: { passed: False, message: contains "password", action: "block" }

Test: "keyword_block passes message without keywords"
  - Config: { keywords: ["password"] }
  - Message: "Hello world"
  - Expect: { passed: True }

Test: "regex_match blocks message matching pattern"
  - Config: { pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b", action: "block" }
  - Message: "My SSN is 123-45-6789"
  - Expect: { passed: False }

Test: "regex_match passes when no match"
  - Config: { pattern: "\\b\\d{16}\\b" }
  - Message: "No credit card here"
  - Expect: { passed: True }

Test: "llm_classify calls LLM Gateway and evaluates blockIf"
  - Mock LLMGatewayClient.chat to return { content: "harmful" }
  - Config: { prompt: "Classify: {message}", blockIf: "harmful", model: "gpt-4o-mini" }
  - Expect: { passed: False, action: "block" }

Test: "llm_classify passes when LLM returns non-matching classification"
  - Mock LLMGatewayClient.chat to return { content: "safe" }
  - Config: { blockIf: "harmful" }
  - Expect: { passed: True }

Test: "json_schema validates output JSON against schema"
  - Config: { schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } } }
  - Message: '{"name": "test"}'
  - Expect: { passed: True }

Test: "json_schema rejects invalid JSON output"
  - Config: { schema: { type: "object", required: ["name"] } }
  - Message: '{"age": 25}'
  - Expect: { passed: False, message: contains "name" }

Test: "json_schema rejects non-JSON text"
  - Message: "This is not JSON"
  - Expect: { passed: False, message: contains "invalid JSON" }

Test: "max_length blocks messages exceeding maxChars"
  - Config: { maxChars: 100 }
  - Message: "A" * 101
  - Expect: { passed: False }

Test: "max_length passes within limit"
  - Config: { maxChars: 100 }
  - Message: "Short message"
  - Expect: { passed: True }

Test: "pii_detection detects email patterns"
  - Config: { patterns: ["email"] }
  - Message: "Contact me at user@example.com"
  - Expect: { passed: False }

Test: "pii_detection detects phone patterns"
  - Config: { patterns: ["phone"] }
  - Message: "Call me at 555-123-4567"
  - Expect: { passed: False }

Test: "pii_detection detects SSN patterns"
  - Config: { patterns: ["ssn"] }
  - Message: "SSN: 123-45-6789"
  - Expect: { passed: False }

Test: "pii_detection with action=redact replaces PII with [REDACTED]"
  - Config: { patterns: ["email"], action: "redact" }
  - Message: "Email: user@example.com please"
  - Expect: { passed: True, redactedMessage: "Email: [REDACTED] please" }

Test: "custom_endpoint calls SSRF-validated URL and returns result"
  - Mock httpx.AsyncClient.post to return { "passed": false, "message": "blocked by policy" }
  - Config: { endpoint: "https://guardrails.example.com/check" }
  - Expect: { passed: False, message: "blocked by policy" }

Test: "custom_endpoint rejects private IP endpoint (SSRF)"
  - Config: { endpoint: "http://192.168.1.1/check" }
  - Expect: raises SSRFError or returns { passed: False, message: contains "SSRF" }

Test: "execute_guardrails runs in sortOrder"
  - 3 guardrails with sortOrder 2, 0, 1
  - Mock strategies to record call order
  - Expect: called in order 0, 1, 2

Test: "execute_guardrails stops on first failure in strict mode"
  - 3 guardrails; second one fails with mode=strict
  - Expect: third guardrail not called

Test: "execute_guardrails collects all failures in guidance mode"
  - 3 guardrails; second one fails with mode=guidance
  - Expect: all 3 executed, result includes guidance message from second

Test: "output guardrail retries up to validationAttempts"
  - Guardrail with validationAttempts=3
  - First 2 calls: { passed: False }, 3rd call: { passed: True }
  - Expect: retry count = 3, final result passed

Test: "enforceOnHandoff=true runs input guardrails on handoff messages"
  - Guardrail with enforceOnHandoff=True, type=input
  - Call execute_guardrails with is_handoff=True
  - Expect: guardrail executed
```

---

## Implementation Details

### 1. tRPC Procedures (Node.js)

Add the following procedures to the `agencyRouter` in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`. Follow the existing pattern of rate-limited `protectedProcedure` instances.

#### Rate Limiting

Create a dedicated rate-limited procedure:

```
const agencyGuardrailProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "agency-guardrail", limit: 30, windowMs: 60_000 }),
);
```

#### Zod Input Schemas

The `createGuardrail` input schema should validate:

- `agencyId`: `z.string().uuid()`
- `name`: `z.string().min(1).max(100)`
- `type`: `z.enum(["input", "output"])`
- `mode`: `z.enum(["guidance", "strict"])`
- `strategy`: `z.enum(["keyword_block", "regex_match", "llm_classify", "json_schema", "max_length", "pii_detection", "custom_endpoint"])`
- `config`: `z.record(z.unknown())` -- strategy-specific config; validated per-strategy via `.superRefine()`
- `validationAttempts`: `z.number().int().min(1).max(5).default(1)` -- only meaningful for output type
- `isEnabled`: `z.boolean().default(true)`
- `sortOrder`: `z.number().int().min(0).default(0)`
- `enforceOnHandoff`: `z.boolean().default(false)` -- stored in `config` JSONB

The `.superRefine()` callback should validate `config` based on `strategy`:

| Strategy | Required Config Fields |
|----------|----------------------|
| `keyword_block` | `keywords: string[]` (min 1, max 100 items, each max 200 chars) |
| `regex_match` | `pattern: string` (max 1000 chars), `action: "block" \| "require"` |
| `llm_classify` | `prompt: string` (max 2000 chars), `blockIf: string`, `model?: string` |
| `json_schema` | `schema: object` (valid JSON Schema) |
| `max_length` | `maxChars: number` (min 1, max 100000) |
| `pii_detection` | `patterns: ("email" \| "phone" \| "ssn")[]`, `action?: "block" \| "redact"` |
| `custom_endpoint` | `endpoint: string` (URL, SSRF-validated), `timeout?: number` (max 10000ms) |

#### Cross-Tenant Isolation

Every procedure must:
1. Use `ctx.user.tenantId` (from JWT session) as the tenant filter -- never accept `tenantId` from input.
2. For `assignGuardrailToAgent`: fetch both the guardrail and the agent's parent agency, verify `guardrail.tenantId === agency.tenantId`. Return `TRPCError({ code: "FORBIDDEN" })` on mismatch.

#### Procedure Signatures

- `createGuardrail` -- Insert into `agencyGuardrails`, return the created record.
- `updateGuardrail` -- Accept `guardrailId` + partial fields. Verify tenant ownership before update.
- `deleteGuardrail` -- Delete from `agencyGuardrails` by id (CASCADE removes junction rows). Verify tenant ownership.
- `listGuardrails` -- Filter by `tenantId` and optional `agencyId`. Return ordered by `sortOrder` ASC. Include related agent assignments via LEFT JOIN on `agencyAgentGuardrails`.
- `testGuardrail` -- Accept `{ guardrailId, sampleMessage }`. Fetch the guardrail definition, POST to Python backend endpoint `/api/internal/guardrails/test` with the guardrail config and sample message. Return the Python response `{ passed, message, action }`.
- `assignGuardrailToAgent` -- Insert into `agencyAgentGuardrails` after cross-tenant check.
- `removeGuardrailFromAgent` -- Delete from `agencyAgentGuardrails` matching `(agentId, guardrailId)`.

#### SSRF Validation for `custom_endpoint` Strategy

Reuse the existing URL validation pattern from the codebase. In the Zod `.superRefine()` for `custom_endpoint`, validate the endpoint URL:
- Must use `https://` scheme (reject `http://` unless in development).
- Must not resolve to private IP ranges, localhost, or cloud metadata endpoints.
- Use the same validation logic from `/home/dev/projects/SmartSpecPro/apps/web/server/services/` or inline a URL-based check matching the Python `SSRFGuard` logic.

### 2. Python Guardrail Execution Engine

#### File: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_guardrails.py`

This module implements the core guardrail execution logic. It is called by the agency orchestrator, not directly by HTTP endpoints.

#### Data Structures

```
@dataclass
class GuardrailResult:
    passed: bool
    message: str
    action: str  # "allow", "block", "guidance", "redact"
    redacted_message: str | None  # only for pii_detection with action=redact

@dataclass
class GuardrailDefinition:
    id: str
    name: str
    type: str           # "input" | "output"
    mode: str           # "guidance" | "strict"
    strategy: str       # one of 7 strategies
    config: dict        # strategy-specific configuration
    validation_attempts: int
    sort_order: int
    enforce_on_handoff: bool
```

#### Main Entry Point

```
async def execute_guardrails(
    guardrails: list[GuardrailDefinition],
    message: str,
    guardrail_type: str,  # "input" or "output"
    context: dict | None = None,
    is_handoff: bool = False,
    llm_client: LLMGatewayClient | None = None,
) -> GuardrailResult:
    """Execute guardrails in sortOrder. Returns aggregated result."""
```

Behavior:
- Sort guardrails by `sort_order` ascending.
- Filter to only `guardrail_type` matches (input or output).
- If `is_handoff=True`, only include guardrails where `enforce_on_handoff=True`.
- Iterate through guardrails. For each, dispatch to the appropriate strategy function.
- On **strict** mode failure: stop immediately, return the blocking result.
- On **guidance** mode failure: continue executing remaining guardrails, collect guidance messages.
- If all pass: return `{ passed: True, message: "", action: "allow" }`.
- If guidance failures collected: return `{ passed: True, message: "<joined guidance>", action: "guidance" }`.

#### Strategy Implementations

Each strategy is a standalone async function with signature:

```
async def _strategy_keyword_block(message: str, config: dict) -> GuardrailResult:
```

**keyword_block**: Iterate `config["keywords"]`, check if any keyword appears in `message.lower()`. Return blocked with matched keyword in message.

**regex_match**: Compile `config["pattern"]` with `re.IGNORECASE`. If `config["action"] == "block"`: block on match. If `"require"`: block on no-match.

**llm_classify**: Build a classification prompt using `config["prompt"]` with `{message}` placeholder replaced. Call `llm_client.chat()` (see `/home/dev/projects/SmartSpecPro/python-backend/app/services/llm_gateway_client.py`) with the prompt. Compare response text (lowered, stripped) against `config["blockIf"]` (lowered). Use `config.get("model")` or fall back to the agency's default model. Wrap the LLM call in a try/except -- on LLM failure, default to `{ passed: True }` (fail-open to avoid blocking all traffic on LLM outage).

**json_schema**: Parse `message` as JSON. If parse fails, return `{ passed: False, message: "invalid JSON" }`. Validate parsed JSON against `config["schema"]` using `jsonschema.validate()` (already a dependency). Return validation errors in message.

**max_length**: Compare `len(message)` against `config["maxChars"]`.

**pii_detection**: Define regex patterns for each PII type:
- `email`: `r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"`
- `phone`: `r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"`
- `ssn`: `r"\b\d{3}-\d{2}-\d{4}\b"`

Check `config["patterns"]` list for which patterns to apply. If `config.get("action") == "redact"`: replace matched patterns with `[REDACTED]` and return `{ passed: True, redacted_message: ... }`. Otherwise if any match found: `{ passed: False }`.

**custom_endpoint**: Validate `config["endpoint"]` using the existing `SSRFGuard` from `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/ssrf_guard.py`. POST `{ message, context }` to the endpoint with a timeout of `config.get("timeout", 5000)` ms. Parse JSON response expecting `{ passed: bool, message?: str }`. On HTTP error or timeout, return `{ passed: True }` (fail-open).

#### Output Guardrail Retry Logic

For output guardrails, the orchestrator integration (not this module) handles retries. This module returns the result; the caller decides whether to retry. The retry contract:

```
for attempt in range(guardrail.validation_attempts):
    result = await execute_guardrails([guardrail], agent_output, "output", ...)
    if result.passed:
        break
    # Inject feedback into agent: "Your output failed validation: {result.message}"
```

### 3. Orchestrator Integration

Modify `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` to invoke guardrails at three checkpoints:

#### Checkpoint 1: Input Guardrails (before agent execution)

In `_execute_agent_node()`, before calling the adapter:
- Fetch guardrails assigned to this agent (passed from Node.js via the agency config payload, or pre-loaded at run start).
- Call `execute_guardrails(guardrails, message, "input")`.
- If result `action == "block"`: raise an exception or return the guardrail's block message directly.
- If result `action == "guidance"`: prepend the guidance message to the agent's instructions for this turn.

#### Checkpoint 2: Output Guardrails (after agent execution)

After receiving the agent's response:
- Call `execute_guardrails(guardrails, response, "output")`.
- If failed and `validation_attempts > 1`: retry the agent with feedback message.
- If failed after all attempts: in strict mode, return error message; in guidance mode, return response with warning.

#### Checkpoint 3: Handoff Guardrails

When the orchestrator routes a message from one agent to another (in the `_execute_agent_node` handoff path):
- Fetch the receiving agent's input guardrails.
- Filter to those with `enforce_on_handoff=True`.
- Call `execute_guardrails(filtered, handoff_message, "input", is_handoff=True)`.
- Handle result same as Checkpoint 1.

#### Guardrail Data Flow

Guardrail definitions flow from Node.js to Python as follows:
1. Node.js tRPC stores guardrails in `agency_guardrails` + `agency_agent_guardrails` tables.
2. When an agency run starts, the existing `agencyBridge` service fetches the full agency configuration (nodes, edges, tools).
3. Extend this fetch to include guardrails: JOIN `agency_agent_guardrails` on `agentId`, then JOIN `agency_guardrails` for definitions.
4. Include the guardrail data in the payload sent to Python's agency service endpoint.
5. Python `agency_service.py` extracts guardrails from the payload and passes them to the orchestrator constructor.
6. The orchestrator stores guardrails keyed by `agentId` for quick lookup during execution.

### 4. Python Internal Test Endpoint

Add a minimal internal endpoint for the `testGuardrail` tRPC procedure to call:

In `/home/dev/projects/SmartSpecPro/python-backend/app/api/` (new or existing internal router):

```
POST /api/internal/guardrails/test
Body: { strategy, config, message }
Response: { passed, message, action, redactedMessage? }
```

This endpoint calls the strategy function directly with the provided config and message. It is internal-only (validated via `X-Internal-Token` header, matching the existing service-to-service auth pattern in `llm_gateway_client.py`).

---

## Schema Reference (from section-01)

The following tables are defined in section-01 and must exist before this section:

**`agencyGuardrails`** columns: `id`, `tenantId`, `agencyId`, `name`, `type`, `mode`, `strategy`, `config` (JSONB), `validationAttempts`, `isEnabled`, `sortOrder`, `createdAt`, `updatedAt`.

**`agencyAgentGuardrails`** columns: `id`, `agentId`, `guardrailId`. UNIQUE constraint on `(agentId, guardrailId)`. Both FKs have ON DELETE CASCADE.

---

## Key Security Considerations

1. **Tenant isolation**: All CRUD operations filter by `ctx.user.tenantId`. The `assignGuardrailToAgent` procedure performs an explicit cross-tenant check comparing guardrail and agent tenant ownership.
2. **SSRF protection**: The `custom_endpoint` strategy validates URLs through `SSRFGuard` at both creation time (Zod `.superRefine()`) and execution time (Python runtime check).
3. **LLM prompt injection**: The `llm_classify` strategy uses a fixed prompt template where user content is placed in the human-message role only. The `config.prompt` is set by the guardrail creator (admin/owner), not the end user.
4. **Regex DoS**: Compiled regex patterns should use a timeout or be wrapped in a safety check. Consider using Python's `re` with a maximum match length or a library like `regex` with timeout support. Cap `config.pattern` length at 1000 characters.
5. **Fail-open**: Both `llm_classify` and `custom_endpoint` fail-open on external service errors to avoid blocking all agent traffic due to a transient dependency failure. This decision should be documented in the guardrail UI.