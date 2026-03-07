# Section 04: Activate Automation Copilot LLM Calls

## Overview

This section replaces four stub/placeholder implementations in the Python backend with real LLM calls routed through the Node.js LLM Gateway via `LLMGatewayClient`. The four call sites are:

1. `_analyze_intent()` in `automation_copilot.py` -- currently raises `NotImplementedError`
2. `_vision_llm_call()` in `playwright_script_generator.py` -- currently raises `NotImplementedError`
3. `_diagnose_failure()` in `self_healing_executor.py` -- currently returns `FailureDiagnosis(confidence=0.0)`
4. `WebAutomationExecutor.execute()` in `web_automation_executor.py` -- currently raises `NotImplementedError`

All LLM calls go through `LLMGatewayClient` (built in section-02-gateway-client) so that credit deduction, rate limiting, and audit logging happen at the Node.js gateway layer. Python never calls OpenAI directly.

## Dependencies

- **section-02-gateway-client**: Provides `LLMGatewayClient` at `python-backend/app/services/llm_gateway_client.py` with `chat_completion()` and `vision_call()` methods. Also provides `guardWithCreditsOrInternalToken()` on the Node side. This section assumes the client exists and works.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/services/automation_copilot.py` | Modify | Implement `_analyze_intent()` with real LLM call |
| `python-backend/app/services/playwright_script_generator.py` | Modify | Implement `_vision_llm_call()` with real vision LLM call |
| `python-backend/app/services/self_healing_executor.py` | Modify | Implement `_diagnose_failure()` with real vision LLM call |
| `python-backend/app/orchestrator/node_executors/web_automation_executor.py` | Modify | Implement `execute()` with full pipeline orchestration |

## Test Files to Create

| File | Description |
|------|-------------|
| `python-backend/tests/test_automation_copilot_llm.py` | Tests for `_analyze_intent()` |
| `python-backend/tests/test_playwright_script_generator_llm.py` | Tests for `_vision_llm_call()` |
| `python-backend/tests/test_self_healing_executor_llm.py` | Tests for `_diagnose_failure()` |
| `python-backend/tests/test_web_automation_executor_impl.py` | Tests for `WebAutomationExecutor.execute()` |

---

## Tests (Write First)

### File: `python-backend/tests/test_automation_copilot_llm.py`

```python
"""Tests for _analyze_intent() LLM integration in AutomationCopilot."""
import pytest

# Test: valid JSON response parsed into AutomationIntent correctly
# - Mock LLMGatewayClient.chat_completion() to return a well-formed JSON string
#   with intent_type="browser_rpa", confidence=0.9, browser_tasks=[...], is_ready=True
# - Call copilot.analyze(prompt, tenant_id, user_id)
# - Assert result.status == "preview_ready"
# - Assert result.intent.intent_type == "browser_rpa"
# - Assert result.intent.confidence == 0.9

# Test: invalid JSON from LLM -> returns needs_clarification with generic questions
# - Mock gateway to return malformed/non-JSON string
# - Call copilot.analyze(...)
# - Assert result.status == "needs_clarification"
# - Assert result.questions is not None and len > 0

# Test: confidence < 0.5 -> returns needs_clarification with model's questions
# - Mock gateway to return valid JSON with confidence=0.3 and
#   clarification_questions=["What URL?", "What data?"]
# - Call copilot.analyze(...)
# - Assert result.status == "needs_clarification"
# - Assert "What URL?" in result.questions

# Test: gateway unavailable -> returns needs_clarification (graceful degradation)
# - Mock gateway to raise GatewayUnavailableError
# - Call copilot.analyze(...)
# - Assert result.status == "needs_clarification"
# - Assert no exception propagated

# Test: response_format set to json_object (not json_schema)
# - Mock gateway, capture the call arguments
# - Verify response_format={"type": "json_object"} was passed
```

### File: `python-backend/tests/test_playwright_script_generator_llm.py`

```python
"""Tests for _vision_llm_call() LLM integration in PlaywrightScriptGenerator."""
import pytest

# Test: screenshot base64 + overlay sent as image content block
# - Mock LLMGatewayClient.vision_call(), capture messages argument
# - Verify messages contain an image_url content block with base64 data URI
# - Verify the goal text is included in the user message

# Test: vision model from tenant settings (not hardcoded)
# - Pass vision_model="gpt-4o-mini" to generate()
# - Mock gateway, capture the model argument
# - Assert model == "gpt-4o-mini"

# Test: elements with confidence >= 0.7 kept, < 0.7 filtered
# - Mock gateway to return 3 IdentifiedElement objects:
#   confidence 0.9, 0.7, 0.5
# - Assert only 2 elements pass CONFIDENCE_THRESHOLD filtering
# (Note: filtering happens in generate() after _vision_llm_call returns)

# Test: overall confidence < 0.5 -> returns empty list
# - Mock gateway to return elements all with confidence < 0.5
# - Assert ScriptGenerationError raised (no elements above threshold)

# Test: gateway unavailable -> raises (cannot proceed without vision)
# - Mock gateway to raise GatewayUnavailableError
# - Assert exception propagates (vision is required, no graceful degradation)
```

### File: `python-backend/tests/test_self_healing_executor_llm.py`

```python
"""Tests for _diagnose_failure() LLM integration in SelfHealingExecutor."""
import pytest

# Test: failure screenshot + error message sent to vision model
# - Mock LLMGatewayClient.vision_call(), capture messages
# - Verify screenshot base64 is in image content block
# - Verify error message text is included in the prompt

# Test: valid FailureDiagnosis returned with confidence > 0.0
# - Mock gateway to return JSON with root_cause, suggested_new_selector,
#   confidence=0.8, action_type_still_valid=True
# - Assert returned FailureDiagnosis has confidence > 0.0

# Test: suggested selector is CSS/ARIA/data-testid (no JS evaluate)
# - Mock gateway to return suggested_new_selector with css key
# - Assert the selector does not contain "evaluate" or "page.evaluate"

# Test: gateway unavailable -> returns FailureDiagnosis(confidence=0.0)
# - Mock gateway to raise GatewayUnavailableError
# - Assert FailureDiagnosis returned with confidence=0.0
# - Assert no exception propagated (graceful degradation)

# Test: successful heal -> selector cache invalidated
# - This tests the integration with SelfHealingExecutor.execute() flow
# - After successful healing, verify cache.invalidate() or cache.mark_heal() called

# Test: max 3 heal attempts then gives up
# - Mock gateway to always return low-confidence diagnosis
# - Run executor.execute() and verify HealingExhaustedError after 3 attempts
```

### File: `python-backend/tests/test_web_automation_executor_impl.py`

```python
"""Tests for WebAutomationExecutor.execute() full pipeline."""
import pytest

# Test: full pipeline: analyze -> build -> execute -> results
# - Mock AutomationCopilot with all methods returning success data
# - Call executor.execute(inputs, context)
# - Assert result contains extracted_data and status="success"

# Test: needs_clarification -> returns status=needs_input with questions
# - Mock copilot.analyze() to return status="needs_clarification"
# - Assert executor returns {"status": "needs_input", "questions": [...]}

# Test: allowed_domains passed from node config
# - Provide inputs with allowed_domains=["example.com"]
# - Mock copilot, capture the allowed_domains argument
# - Assert ["example.com"] passed through

# Test: gateway unavailable -> returns status=error with message
# - Mock copilot.analyze() to raise GatewayUnavailableError
# - Assert executor returns {"status": "error", "message": "..."} without crashing
```

---

## Implementation Details

### 4.1: `_analyze_intent()` -- Intent Analysis

**File**: `python-backend/app/services/automation_copilot.py`

The `AutomationCopilot` class currently raises `NotImplementedError` at line 130. Replace with a real LLM call.

**Changes required**:

1. **Add `LLMGatewayClient` as a constructor dependency**. Modify `__init__` to accept a `gateway_client: LLMGatewayClient` parameter and store it as `self._gateway`.

2. **Implement `_analyze_intent()`** to:
   - Construct a system prompt that defines the `AutomationIntent` JSON schema, including fields: `intent_type` (one of "browser_rpa", "workflow", "agency", "hybrid"), `confidence` (0.0-1.0), `is_ready` (bool), `browser_tasks` (array of `{url, goal}` objects), `clarification_questions` (array of strings), `plan_summary` (string).
   - Call `self._gateway.chat_completion()` with:
     - `messages`: system prompt + user prompt
     - `model`: "gpt-5.4" (gateway resolves via `model_provider_map`)
     - `user_id` and `tenant_id` passed through
     - `response_format`: `{"type": "json_object"}` (NOT `json_schema` -- more portable across providers)
   - Parse the JSON response into an `AutomationIntent` object
   - If JSON parsing fails: return `AutomationIntent(intent_type="unknown", confidence=0.0, is_ready=False, ambiguities=["Could you describe what you'd like to automate?"])`
   - If `confidence < 0.5`: set `is_ready=False`, populate `ambiguities` from the model's `clarification_questions`

3. **Graceful degradation**: Wrap the gateway call in a try/except for `GatewayUnavailableError` (and general `Exception`). On failure, return a `needs_clarification` intent with generic questions. The copilot must never crash due to LLM unavailability at the analysis stage.

**Key design choice**: Use `response_format: {"type": "json_object"}` rather than `json_schema` for broader provider compatibility. Include explicit JSON formatting instructions in the system prompt to ensure reliable structured output.

### 4.2: `_vision_llm_call()` -- Vision Element Identification

**File**: `python-backend/app/services/playwright_script_generator.py`

The `_vision_llm_call()` method at line 231 currently raises `NotImplementedError`. Replace with a real vision LLM call.

**Changes required**:

1. **Add `LLMGatewayClient` as a constructor dependency**. Modify `PlaywrightScriptGenerator.__init__` to accept `gateway_client: LLMGatewayClient` and store as `self._gateway`. The `generate()` method already receives `vision_model` as a parameter, so no additional config is needed.

2. **Implement `_vision_llm_call()`** to:
   - Construct messages with an image content block:
     ```python
     messages = [
         {"role": "system", "content": VISION_SYSTEM_PROMPT},
         {"role": "user", "content": [
             {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}},
             {"type": "text", "text": f"Goal: {goal}\n\nElement references: {json.dumps(element_refs)}"}
         ]}
     ]
     ```
   - The system prompt should instruct the model to return a JSON array of `IdentifiedElement` objects: `[{element_index, action_type, value, confidence, reasoning}]`
   - Call `self._gateway.vision_call()` with the constructed messages, `vision_model`, and tenant context
   - Parse the response JSON into a list of `IdentifiedElement` objects
   - This method uses `/v1/chat/completions` (not `/v1/responses`) -- it is a single-turn call with no tool loop

3. **No graceful degradation**: If the gateway is unavailable, the exception propagates. Vision is required to proceed -- without it, the script generator cannot identify page elements. The caller (`generate()`) will raise `ScriptGenerationError`.

4. **Filtering happens in the caller**: The existing `generate()` method already filters results by `CONFIDENCE_THRESHOLD = 0.7` and checks `MIN_OVERALL_CONFIDENCE = 0.5`. The `_vision_llm_call()` method returns the raw list.

### 4.3: `_diagnose_failure()` -- Self-Healing Diagnosis

**File**: `python-backend/app/services/self_healing_executor.py`

The `_diagnose_failure()` method at line 185 currently captures a screenshot but returns a stub `FailureDiagnosis(confidence=0.0)`. Replace the stub return with a real vision LLM call.

**Changes required**:

1. **Add `LLMGatewayClient` as a constructor dependency**. Modify `SelfHealingExecutor.__init__` to accept `gateway_client: LLMGatewayClient` and store as `self._gateway`. The `_vision_model` is already stored from the constructor.

2. **Implement `_diagnose_failure()`** to:
   - The method already captures a screenshot and encodes it as base64 (lines 192-193). Keep this existing code.
   - Construct a vision call with:
     - System prompt: instruct the model to diagnose why a browser action failed, suggest a new CSS/ARIA/data-testid selector, and explicitly state "Do NOT suggest JavaScript evaluate or page.evaluate selectors"
     - User message: include the screenshot (image content block), the failed action details (`failed_action.selector_css`, `failed_action.action_type`, `failed_action.description`), and the error message (`str(error)`)
   - Call `self._gateway.vision_call()` with the vision model stored in `self._vision_model`
   - Parse response JSON into a `FailureDiagnosis` object
   - The `suggested_new_selector` field should be a dict with a `css` key containing the new selector string

3. **Graceful degradation**: If the gateway is unavailable, return `FailureDiagnosis(root_cause="LLM unavailable", suggested_new_selector=None, confidence=0.0, action_type_still_valid=False)`. This preserves the existing stub behavior -- self-healing is effectively disabled, but the executor continues with the heal-exhaustion flow.

4. **Cache invalidation on successful heal**: This is already handled by the `execute()` method in `SelfHealingExecutor` (line 94-99 calls `self._cache.mark_heal()`). No additional change needed in `_diagnose_failure()` itself.

5. **Max heal attempts**: Already enforced by the `execute()` method (line 109 checks `self._max_heal_attempts`, default 3). No change needed.

### 4.4: `WebAutomationExecutor.execute()` -- Workflow Node

**File**: `python-backend/app/orchestrator/node_executors/web_automation_executor.py`

The `execute()` method at line 21 currently logs and raises `NotImplementedError`. Replace with full pipeline orchestration.

**Changes required**:

1. **Import dependencies**: Import `AutomationCopilot`, `PlaywrightScriptGenerator`, `SelfHealingExecutor`, `LLMGatewayClient`, `BrowserPool`, `SelectorCache`, and exception classes.

2. **Implement `execute()`** to:
   - Instantiate `LLMGatewayClient` (singleton or from a factory)
   - Instantiate `BrowserPool` and `SelectorCache` (from app context or dependency injection)
   - Instantiate `PlaywrightScriptGenerator(browser_pool, selector_cache, gateway_client)`
   - Instantiate `SelfHealingExecutor(browser_pool, selector_cache, vision_model, gateway_client=gateway_client)`
   - Instantiate `AutomationCopilot(script_generator, executor, gateway_client)`
   - Extract parameters from `inputs` dict: `prompt`, `url`, `goal`, `vision_model` (default "gpt-4o")
   - Extract context: `tenant_id`, `user_id`, `execution_id`, `allowed_domains` (from node config or tenant settings)
   - Call `copilot.analyze(prompt, tenant_id, user_id)`
   - If result is `needs_clarification`: return `{"status": "needs_input", "questions": result.questions}`
   - Call `copilot.build(intent, execution_id, tenant_id, user_id, vision_model, allowed_domains)`
   - Define a no-op or simple `status_callback` async function
   - Call `copilot.execute_scripts(execution_id, tenant_id, user_id, allowed_domains, status_callback)`
   - Return `{"status": "success", "extracted_data": result.extracted_data, "screenshots": result.screenshots}`

3. **Error handling**:
   - Catch `GatewayUnavailableError` (from `llm_gateway_client`): return `{"status": "error", "message": "LLM gateway unavailable"}`
   - Catch `InsufficientCreditsError`: return `{"status": "error", "message": "Insufficient credits"}`
   - Catch general `AutomationError`: return `{"status": "error", "message": str(e)}`
   - Never let exceptions propagate -- workflow nodes must return a result dict

### Vision Model Configuration

The vision model is configurable per-tenant via `system_settings`:
- Setting key pattern: `vision_model_{tenantId}`, category: `automation`
- Default: `gpt-4o` (must be a vision-capable model)
- The `WebAutomationExecutor` should query this setting when constructing the pipeline. If the setting does not exist, fall back to `"gpt-4o"`.
- For `PlaywrightScriptGenerator`, the vision model is passed as a parameter to `generate()`, so no additional config lookup is needed there.

### Constructor Dependency Injection Pattern

All three classes (`AutomationCopilot`, `PlaywrightScriptGenerator`, `SelfHealingExecutor`) need `LLMGatewayClient` added to their constructors. The recommended pattern:

```python
# In AutomationCopilot.__init__
def __init__(
    self,
    script_generator: PlaywrightScriptGenerator,
    executor: SelfHealingExecutor,
    gateway_client: LLMGatewayClient | None = None,
) -> None:
    self._generator = script_generator
    self._executor = executor
    self._gateway = gateway_client
```

Making `gateway_client` optional (`| None = None`) preserves backward compatibility with existing tests that construct these classes without a gateway client. The `_analyze_intent()` method should check for `self._gateway is None` and raise `NotImplementedError` if absent (maintaining the existing test-override pattern when no client is provided).

### Rollback Strategy

Each stub has built-in graceful degradation. To revert this section without a code rollback:
- Set environment variable `AUTOMATION_LLM_ENABLED=false`
- Each implemented method checks this flag and falls back to stub behavior
- This allows disabling LLM calls without redeploying

### Existing Tests

All 102 existing Feature 031 tests must continue to pass. The constructor changes are backward-compatible (`gateway_client` is optional). Existing tests that subclass or mock these methods will continue to work since the method signatures are unchanged.

---

## Implementation Deviations from Plan

1. **Model**: Used `gpt-4.1` instead of plan's `gpt-5.4` (aspirational model name; gpt-4.1 is real and available)
2. **Vision calls use `chat_completion()` not `vision_call()`**: To include system prompts (`_VISION_SYSTEM_PROMPT`, `_DIAGNOSIS_SYSTEM_PROMPT`) as separate messages. `vision_call()` only supports a single user message. Both use the same underlying `/v1/chat/completions` endpoint.
3. **`_vision_llm_call()` signature extended**: Added `tenant_id` and `user_id` optional params for proper billing attribution
4. **`ScriptGenerationError` on bad JSON**: `_vision_llm_call()` now catches `JSONDecodeError` and raises `ScriptGenerationError` instead of propagating raw parse error
5. **Sanitized error in `WebAutomationExecutor`**: Generic message for unexpected errors (security fix)
6. **Resource lifecycle deferred**: `WebAutomationExecutor` instantiates per-call (no singleton/factory). Deferred to DI framework follow-up.
7. **Tenant settings lookup deferred**: `vision_model` comes from `inputs` dict, not `system_settings` DB. Deferred to cross-cutting concern follow-up.
8. **`test_web_automation_node.py` updated**: Changed `test_executor_stub_raises_not_implemented` to `test_executor_returns_dict` since stub was replaced.

### Files Summary (Actual)

| File | Action | Tests |
|------|--------|-------|
| `python-backend/app/services/automation_copilot.py` | Modified | 5 tests |
| `python-backend/app/services/playwright_script_generator.py` | Modified | 7 tests |
| `python-backend/app/services/self_healing_executor.py` | Modified | 5 tests |
| `python-backend/app/orchestrator/node_executors/web_automation_executor.py` | Modified | 4 tests |
| `python-backend/tests/test_web_automation_node.py` | Modified (existing test updated) | 3 tests |
| Total new tests: 21, updated existing: 1 | | 34 pass |

## Verification Checklist

After implementing this section:

1. All new tests in the four test files pass: `pytest python-backend/tests/test_automation_copilot_llm.py python-backend/tests/test_playwright_script_generator_llm.py python-backend/tests/test_self_healing_executor_llm.py python-backend/tests/test_web_automation_executor_impl.py`
2. All existing Feature 031 tests still pass: `pytest python-backend/tests/ -k "automation or copilot or playwright or healing or executor"`
3. Python quality checks pass: `ruff check app/`, `mypy app/`
4. No `NotImplementedError` remains in the four call sites (when `AUTOMATION_LLM_ENABLED` is true or unset)
5. Each graceful degradation path is tested (gateway unavailable scenarios)