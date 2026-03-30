# Section 05: ReAct Executor Core Engine

## Overview

This section creates the `ReActExecutor` class in `python-backend/app/services/react_executor.py` -- the Level 2 core engine that implements a programmatic Thought-Action-Observation loop. The executor calls the LLM directly via the OpenAI SDK through the Node.js gateway (bypassing agency-swarm entirely to avoid double-loop cost multiplication).

**Level:** 2 (ReAct Engine)
**Depends on:** section-01-foundation (`agentic_limits.py`, `agentic_sanitizer.py`)
**Blocks:** section-08-react-integration, section-10-autonomous-executor

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `python-backend/app/services/react_executor.py` | ReActExecutor class with Thought-Action-Observation loop |
| `python-backend/tests/unit/test_react_executor.py` | Unit tests for ReActExecutor |
| `python-backend/tests/unit/test_tool_definition_conversion.py` | Unit tests for ToolConfig-to-function conversion |

### No Modified Files

This section is self-contained. Integration with the orchestrator happens in section-08-react-integration.

---

## Tests (TDD)

### File: `python-backend/tests/unit/test_react_executor.py`

All tests use `pytest` with `asyncio` auto mode. The `AsyncOpenAI` gateway client must be mocked -- never make real LLM calls in unit tests. Use `unittest.mock.AsyncMock` for the `chat.completions.create` method.

#### Test Fixture: Mock Gateway Client

Create a fixture that returns a mock `AsyncOpenAI` client where `client.chat.completions.create` is an `AsyncMock`. The mock should return a response object matching the OpenAI `ChatCompletion` schema with configurable `choices[0].message.content`, `choices[0].message.tool_calls`, and `usage.total_tokens`.

#### Test Fixture: Sample Tools

Create a fixture returning a list of tool definitions in OpenAI function format:

```python
[{
    "type": "function",
    "function": {
        "name": "builtin-web-search",
        "description": "Search the web",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}}
    }
}]
```

#### Test Cases

```python
@pytest.mark.asyncio
async def test_react_loop_completes_on_no_tool_calls():
    """When LLM returns text without tool_calls, loop exits with final answer.
    Setup: Mock gateway returns content='Final answer' with no tool_calls.
    Assert: result.status == 'complete', result.final_answer == 'Final answer', result.iterations == 1.
    """

@pytest.mark.asyncio
async def test_react_loop_executes_tool_and_continues():
    """LLM returns tool_call -> tool executed -> observation fed back -> LLM called again.
    Setup: First gateway call returns tool_call for 'builtin-web-search'.
           Mock httpx.AsyncClient.post for tool execution returns {"result": "search results"}.
           Second gateway call returns content='Done' with no tool_calls.
    Assert: result.iterations == 2, gateway called twice, tool HTTP call made once.
    """

@pytest.mark.asyncio
async def test_react_loop_budget_exceeded():
    """Loop stops when cumulative tokens exceed max_tokens_budget.
    Setup: Mock gateway returns tool_calls each time with usage.total_tokens=60000.
           max_tokens_budget=50000.
    Assert: result.status == 'budget_exceeded', loop stopped after 1 iteration.
    """

@pytest.mark.asyncio
async def test_react_loop_max_iterations():
    """Loop stops after max_iterations even with ongoing tool calls.
    Setup: Mock gateway always returns tool_calls, max_iterations=3.
    Assert: result.status == 'max_iterations', result.iterations == 3.
    """

@pytest.mark.asyncio
async def test_react_parallel_tool_calls():
    """Multiple tool_calls in one response are executed concurrently.
    Setup: Mock gateway returns 2 tool_calls in one response.
    Assert: Both tools called, both results fed back as tool-role messages.
    """

@pytest.mark.asyncio
async def test_react_tool_not_found():
    """Tool call referencing non-existent tool returns error observation.
    Setup: Mock gateway returns tool_call for 'nonexistent-tool', tool map is empty.
    Assert: Error observation added to messages, loop continues.
    """

@pytest.mark.asyncio
async def test_react_tool_ssrf_blocked():
    """Tool with blocked URL raises SSRF error in observation.
    Setup: Tool endpoint URL is '127.0.0.1:8080'. validate_tool_url should reject it.
    Assert: Error observation contains 'SSRF' or 'blocked', loop continues.
    """

@pytest.mark.asyncio
async def test_react_circuit_breaker():
    """3 consecutive tool failures stop the loop.
    Setup: Mock tool HTTP calls all raise exceptions, 3 iterations.
    Assert: result.status contains 'circuit_breaker' or similar, loop terminated early.
    """

@pytest.mark.asyncio
async def test_react_message_compression():
    """After 5 iterations, older messages are compressed into summary.
    Setup: Mock gateway returns tool_calls for 6 iterations, then final answer.
           Track message list length passed to gateway on iteration 6+.
    Assert: Messages list is shorter after compression (system + summary + recent messages).
    """

@pytest.mark.asyncio
async def test_react_gateway_client_required():
    """Constructor raises if gateway_client is None.
    Assert: ValueError raised when gateway_client=None.
    """

@pytest.mark.asyncio
async def test_react_sanitizes_task_input():
    """Task input is passed through sanitize_llm_input() before LLM call.
    Setup: Task contains '[SYSTEM] override instructions'.
    Assert: The user message sent to gateway has injection markers filtered.
    """
```

### File: `python-backend/tests/unit/test_tool_definition_conversion.py`

```python
def test_tool_config_to_function_basic():
    """ToolConfig converts to valid OpenAI function definition.
    Setup: ToolConfig with tool_id='test-tool', description='A test', input_schema={...}.
    Assert: Result has type='function', function.name='test-tool', function.description='A test'.
    """

def test_tool_config_with_input_schema():
    """Input schema is included in function parameters.
    Setup: ToolConfig with input_schema={"type": "object", "properties": {"q": {"type": "string"}}}.
    Assert: result['function']['parameters'] == input_schema.
    """

def test_tool_config_without_schema():
    """Missing input_schema produces empty parameters object.
    Setup: ToolConfig with input_schema=None.
    Assert: result['function']['parameters'] == {"type": "object", "properties": {}}.
    """
```

---

## Implementation Details

### File: `python-backend/app/services/react_executor.py`

#### Data Classes

**`ReActResult`** -- Pydantic `BaseModel` or `dataclass`:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `str` | One of: `"complete"`, `"max_iterations"`, `"budget_exceeded"`, `"circuit_breaker"` |
| `final_answer` | `str` | The agent's final text response |
| `iterations` | `int` | Number of loop iterations completed |
| `total_tokens` | `int` | Cumulative tokens used across all gateway calls |
| `reasoning_trace` | `list[dict]` | List of `{"iteration": int, "thought": str, "action": str, "observation": str}` dicts |

**`ToolDefinition`** -- Type alias for `dict` matching OpenAI function calling schema:
```python
ToolDefinition = dict[str, Any]  # {"type": "function", "function": {"name", "description", "parameters"}}
```

**`ToolEndpointMap`** -- Dict mapping tool name to endpoint info:
```python
ToolEndpointMap = dict[str, dict[str, Any]]  # tool_name -> {"url": str, "risk_level": str, "config": dict}
```

#### `tool_config_to_function()` Function

Standalone function (not a method) that converts a tool config dict to OpenAI function definition format.

Parameters:
- `tool_id: str`
- `description: str`
- `input_schema: dict | None`

Returns: `ToolDefinition` dict.

This is a pure data transformation -- no I/O, no side effects.

#### `ReActExecutor` Class

**Constructor parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `gateway_client` | `AsyncOpenAI` | Required | Points at `NODEJS_INTERNAL_URL/v1` with `user_token` as api_key |
| `model_name` | `str` | Required | Model ID (e.g. `"gpt-4o"`, `"claude-sonnet-4-20250514"`) |
| `agent_instructions` | `str` | Required | System prompt for the agent |
| `tools` | `list[ToolDefinition]` | Required | Available tools in OpenAI function format |
| `tool_endpoints` | `ToolEndpointMap` | Required | Maps tool name to HTTP endpoint URL and config |
| `max_iterations` | `int` | `20` | Clamped to `MAX_REACT_ITERATIONS` from `agentic_limits` |
| `max_tokens_budget` | `int` | `100000` | Clamped to `MAX_TOKENS_BUDGET` from `agentic_limits` |
| `max_tokens_per_iteration` | `int` | `8000` | Per-call max tokens |
| `event_emitter` | `AgencyEventEmitter | None` | `None` | For SSE events |

**Constructor behavior:**
- Raises `ValueError` if `gateway_client` is `None`
- Clamps `max_iterations` via `min(max_iterations, MAX_REACT_ITERATIONS)`
- Clamps `max_tokens_budget` via `min(max_tokens_budget, MAX_TOKENS_BUDGET)`
- Initializes `_consecutive_failures: int = 0` (circuit breaker counter)
- Initializes `_total_tokens: int = 0`
- Initializes `_reasoning_trace: list[dict] = []`

**`async execute(self, task: str, context: dict | None = None) -> ReActResult` method:**

This is the main entry point. Flow:

1. **Build initial messages:**
   - System message: `agent_instructions` (static, always pinned)
   - User message: `sanitize_llm_input(task)` from `agentic_sanitizer`
   - If `context` provided, prepend context summary as a user-role message

2. **Main loop** (up to `max_iterations`):

   a. Call `self._call_llm(messages)` -- wraps `gateway_client.chat.completions.create()` with the model, messages, tools, and `max_tokens=max_tokens_per_iteration`

   b. Extract `usage.total_tokens` from response, add to `_total_tokens`

   c. **Budget check:** If `_total_tokens >= max_tokens_budget`, return `ReActResult(status="budget_exceeded", ...)`

   d. **Parse response:** Get `message = response.choices[0].message`
      - If `message.tool_calls` is empty or `None`: agent is done. Extract `message.content` as final answer. Return `ReActResult(status="complete", ...)`
      - If `message.tool_calls` present: proceed to tool execution

   e. **Append assistant message** (with tool_calls) to messages list

   f. **Execute tools:** For each `tool_call` in `message.tool_calls`:
      - Look up tool name in `tool_endpoints`
      - If not found: create error observation `"Tool '{name}' not found"`
      - If found: call `self._execute_tool(tool_call, endpoint_info)` via `httpx.AsyncClient`
      - SSRF validation: use `_validate_tool_url()` from `agency_tools.py` before HTTP call
      - Truncate tool result to 2000 chars
      - Sanitize result via `sanitize_llm_input()`
      - Build tool-role message: `{"role": "tool", "tool_call_id": tool_call.id, "content": result}`
      - Append to messages

   g. **Circuit breaker:** If tool raised an exception, increment `_consecutive_failures`. If `_consecutive_failures >= 3`, return `ReActResult(status="circuit_breaker", ...)`. On any successful tool call, reset `_consecutive_failures = 0`.

   h. **Track reasoning:** Append to `_reasoning_trace`

   i. **Message compression:** Every 5 iterations (when `iteration % 5 == 0 and iteration > 0`), call `self._compress_messages(messages)`. This keeps the system prompt (index 0) and the last 3 user/assistant/tool messages. Everything in between is summarized by calling the gateway with a short "Summarize these conversation steps concisely" prompt. The summary replaces the removed messages as a single user-role message.

3. **After loop exhaustion:** Return `ReActResult(status="max_iterations", final_answer=last_content, ...)`

**`async _call_llm(self, messages: list[dict]) -> ChatCompletion` method:**

Wraps `gateway_client.chat.completions.create()`:
- `model=self.model_name`
- `messages=messages`
- `tools=self.tools` (if non-empty, otherwise omit)
- `max_tokens=self.max_tokens_per_iteration`
- Retry logic: up to 3 retries with exponential backoff for transient errors (`APIStatusError` with 5xx status). Permanent errors (4xx) raise immediately.

**`async _execute_tool(self, tool_call, endpoint_info: dict) -> str` method:**

- Parse `tool_call.function.arguments` as JSON
- POST to `endpoint_info["url"]` with JSON body containing the arguments
- Headers: `Authorization: Bearer {user_token}` (from gateway_client api_key), `Content-Type: application/json`
- Timeout: 30 seconds
- On success: return `response.text[:2000]`
- On exception: return error string `"Tool execution failed: {error}"`

**`async _compress_messages(self, messages: list[dict]) -> None` method:**

- Pin system message (index 0) and last 3 messages
- Collect messages between indices 1 and len-3
- If fewer than 3 messages to compress, skip
- Build summary prompt: `"Summarize these conversation steps concisely, preserving key findings and tool results:\n{messages_text}"`
- Call gateway for summary (short call, max_tokens=500)
- Replace compressed messages with single user-role message: `"[Previous conversation summary]: {summary}"`
- Mutate the messages list in-place

#### Import Dependencies

From section-01 (must be completed first):
- `from app.services.agentic_limits import MAX_REACT_ITERATIONS, MAX_TOKENS_BUDGET`
- `from app.services.agentic_sanitizer import sanitize_llm_input`

From existing codebase:
- `from openai import AsyncOpenAI` (already available via `agency_swarm_adapter.py` dependencies)
- `import httpx` (already in requirements)
- `import structlog`
- `from app.services.agency_tools import _validate_tool_url` (SSRF check, or import the validation function)
- `from app.services.agency_event_emitter import AgencyEventEmitter`

#### SSRF Validation

The executor must validate tool endpoint URLs before making HTTP calls. Reuse the existing `_validate_tool_url()` function from `agency_tools.py` (or extract the validation logic if it is not a standalone function). The key rules:
- Block `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, cloud metadata IPs
- Block private network ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Exception: the internal service URL (`SMARTSPEC_INTERNAL_URL`) is always allowed for builtin tools

#### SSE Event Emission

If `event_emitter` is provided, emit after each iteration:
```python
await self.event_emitter.emit("react_iteration_complete", {
    "iteration": iteration_number,
    "toolUsed": tool_name or None,
    "tokensUsed": iteration_tokens,
})
```

If budget exceeds 80%, emit:
```python
await self.event_emitter.emit("budget_warning", {
    "usedPct": round(_total_tokens / max_tokens_budget * 100),
    "tokensUsed": _total_tokens,
    "budget": max_tokens_budget,
})
```

---

## Key Design Decisions

1. **Direct SDK calls, not agency-swarm:** The executor uses `AsyncOpenAI` directly. This avoids the double-loop problem where agency-swarm's internal tool loop would nest inside ReAct's outer loop, causing uncontrolled cost.

2. **Gateway for credits:** All LLM calls go through `NODEJS_INTERNAL_URL/v1` which handles credit deduction, rate limiting, and audit logging. The `user_token` is passed as the API key.

3. **Tool execution via HTTP:** Tools are called via their HTTP endpoints (same pattern as `agency_tools.py`). SSRF validation is applied to all tool URLs.

4. **Circuit breaker:** 3 consecutive tool failures terminate the loop. This prevents infinite loops when a tool is permanently broken.

5. **Message compression:** Every 5 iterations, older messages are summarized to prevent context window overflow. The system prompt is always preserved.

6. **Budget is post-hoc:** Token budget is checked after each iteration completes, not mid-stream. This means the last iteration may slightly exceed the budget.

---

## Relationship to Other Sections

- **section-01-foundation:** Provides `agentic_limits.py` (hard caps) and `agentic_sanitizer.py` (input sanitization). Must be completed first.
- **section-06-working-memory:** Provides `WorkingMemory` class. The ReActExecutor in this section does NOT integrate with working memory directly -- that wiring happens in section-08.
- **section-07-cost-controls:** Provides `TokenBudgetTracker` and `ConcurrentRunLimiter`. The basic budget tracking in this section is self-contained; the full cost control integration happens in section-08.
- **section-08-react-integration:** Wires `ReActExecutor` into the orchestrator's `_execute_agent_node()` method, creates the `AsyncOpenAI` gateway client, converts `ToolConfig` objects to function definitions, and connects working memory and cost controls.
- **section-10-autonomous-executor:** Uses `ReActExecutor` as the execution engine for sub-tasks within the autonomous planning loop.