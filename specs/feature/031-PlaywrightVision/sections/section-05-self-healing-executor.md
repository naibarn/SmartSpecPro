Now I have all the context needed. Let me generate the section content.

# Section 05: Self-Healing Executor

## Overview

This section implements `SelfHealingExecutor`, the service responsible for executing a `PlaywrightScript` (produced by `PlaywrightScriptGenerator` from section 04) and automatically recovering from selector failures through a structured retry loop with Vision LLM diagnosis.

The executor runs each action in the script sequentially. When an action fails (selector not found, element not interactable, etc.), the executor captures a screenshot of the current page state, sends it to the Vision LLM to diagnose what changed, generates a replacement selector, and retries from the failed action. This loop repeats up to 3 times before giving up. On successful healing, the updated action list is written back to the `SelectorCache` (section 03) so future runs benefit from the fix.

**File to create:** `python-backend/app/services/self_healing_executor.py`

**Dependencies from prior sections (must be implemented first):**
- Section 01: `AutomationError`, `HealingExhaustedError`, `CancellationRequestedError`, `SelectorNotFoundError` from `automation_exceptions.py`
- Section 02: `BrowserPool` from `browser_pool.py` (provides browser contexts)
- Section 03: `SelectorCache` from `selector_cache.py` (stores healed action lists)
- Section 04: `PlaywrightScriptGenerator` (provides `PlaywrightScript`, `PlaywrightAction`, `SelectorStrategy`, `PageSnapshot` models and the `_build_selector_strategy` helper)

---

## Tests First

**File to create:** `python-backend/tests/unit/automation/test_self_healing_executor.py`

The test file mocks Playwright `Page`, `BrowserPool`, `SelectorCache`, and Vision LLM calls. No real browser is launched in unit tests.

### Test stubs

```python
"""Unit tests for SelfHealingExecutor."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def mock_browser_pool():
    """Mock BrowserPool that yields a mock BrowserContext."""

@pytest.fixture
def mock_selector_cache():
    """Mock SelectorCache with async get/put/mark_heal/invalidate."""

@pytest.fixture
def mock_page():
    """Mock Playwright Page with locator, screenshot, goto, etc."""

@pytest.fixture
def sample_script():
    """A PlaywrightScript with 3 actions: goto, click, fill."""

@pytest.fixture
def executor(mock_browser_pool, mock_selector_cache):
    """SelfHealingExecutor instance with mocked dependencies."""


class TestSuccessfulExecution:

    async def test_successful_first_try_returns_healed_false(self, executor, sample_script, mock_page):
        """When all actions succeed on the first try, result.healed is False
        and result.heal_attempts is 0."""

    async def test_credits_used_reflects_actual_llm_calls(self, executor, sample_script, mock_page):
        """credits_used in ExecutionResult tracks the number of Vision LLM
        calls actually made (0 if no healing needed)."""


class TestHealingLoop:

    async def test_failure_triggers_diagnose_failure_call(self, executor, sample_script, mock_page):
        """When an action fails, _diagnose_failure is called with the page,
        failed action, and the exception."""

    async def test_successful_healing_replaces_failed_action_and_retries(self, executor, sample_script, mock_page):
        """After a successful heal, the failed action is replaced in the script
        and execution retries from that action (not from the beginning)."""

    async def test_healed_action_list_stored_in_cache(self, executor, sample_script, mock_page, mock_selector_cache):
        """After successful healing, selector_cache.mark_heal() is called
        with the updated action list."""

    async def test_three_failed_heals_raises_healing_exhausted(self, executor, sample_script, mock_page, mock_selector_cache):
        """After max_heal_attempts (3) failed heal attempts, HealingExhaustedError
        is raised and selector_cache.invalidate() is called."""


class TestRegenerateFromFailure:

    async def test_regenerate_returns_none_when_element_gone(self, executor, mock_page):
        """When the Vision LLM diagnosis indicates the element no longer exists
        on the page, regenerate_from_failure returns None."""


class TestGetByRoleGuard:

    async def test_get_by_role_zero_matches_handled(self, executor, mock_page):
        """When get_by_role locator returns count() == 0, the executor handles
        it gracefully rather than throwing an unhandled error."""


class TestCancellation:

    async def test_cancellation_check_between_actions(self, executor, sample_script, mock_page):
        """Between each action, the executor checks the Redis cancel key.
        If set, CancellationRequestedError is raised."""


class TestStatusCallback:

    async def test_status_callback_called_at_each_phase(self, executor, sample_script, mock_page):
        """status_callback is called with 'running', 'healing_attempt_N',
        and 'success' or 'failed' at the appropriate phases."""
```

### Key testing patterns

- **Mock Playwright Page:** Create `AsyncMock` for `page.locator()`, `page.get_by_role()`, `page.screenshot()`, and `locator.click()`, `locator.fill()`, `locator.count()`. Control failure by making specific locator calls raise `TimeoutError` or return `count() == 0`.
- **Mock Vision LLM:** Patch the internal `_diagnose_failure` or the LLM gateway call to return a `FailureDiagnosis` with controlled `suggested_new_selector` and `confidence` values.
- **Simulate healing exhaustion:** Configure the mock page so that the replacement selector also fails on every retry, causing the loop to exhaust `max_heal_attempts`.
- **Redis cancel key:** Mock the Redis client's `get` method to return `"1"` for the cancel key after a certain number of actions.
- **Status callback:** Pass an `AsyncMock` as `status_callback` and assert it was called with the expected status strings in order using `call_args_list`.

---

## Implementation Details

### Data Models

Define these Pydantic models in `self_healing_executor.py` (or import from a shared models module if already created in section 04):

```python
class FailureDiagnosis(BaseModel):
    """Result of Vision LLM analysis of a failed action."""
    root_cause: str
    suggested_new_selector: dict | None  # SelectorStrategy-compatible dict
    confidence: float
    action_type_still_valid: bool  # False if element was removed from page

class ExecutionResult(BaseModel):
    """Final result of executing a PlaywrightScript."""
    extracted_data: dict | None = None
    screenshots: list[str] = []  # base64 PNG strings
    pages_loaded: int = 0
    healed: bool = False
    heal_attempts: int = 0
    credits_used: int = 0
```

### SelfHealingExecutor class

```python
class SelfHealingExecutor:
    """Executes PlaywrightScript with automatic failure recovery.

    Constructor args:
        browser_pool: BrowserPool instance
        selector_cache: SelectorCache instance
        vision_model: str - the vision model to use for diagnosis
        max_heal_attempts: int = 3
        redis_client: Redis instance for cancellation checks
    """
```

### Core method: `execute()`

Signature:
```python
async def execute(
    self,
    script: PlaywrightScript,
    execution_id: str,
    tenant_id: str,
    allowed_domains: list[str],
    status_callback: Callable[[str], Awaitable[None]],
) -> ExecutionResult:
```

Logic:
1. Acquire a browser context via `browser_pool.session(tenant_id)`.
2. Call `status_callback("running")`.
3. Call `_execute_script(page, script)` which runs actions sequentially.
4. If all actions succeed, call `status_callback("success")` and return result with `healed=False`.
5. On action failure, enter the heal loop (see below).
6. On terminal failure or exhaustion, call `status_callback("failed")`.

### Core method: `_execute_script()`

Signature:
```python
async def _execute_script(
    self, page: Page, script: PlaywrightScript
) -> tuple[bool, PlaywrightAction | None, Exception | None]:
```

Executes all actions in the script sequentially. For each action:
1. **Cancellation check:** Read Redis key `automation:{execution_id}:cancel`. If value is `"1"`, raise `CancellationRequestedError`.
2. **Resolve selector:** Try each strategy in the action's `SelectorStrategy` in priority order (ARIA role, label, text, data-testid, CSS, XPath). Use `page.get_by_role()`, `page.get_by_label()`, `page.get_by_text()`, `page.locator()` accordingly.
3. **`get_by_role` None guard:** After resolving a locator, always call `await locator.count()` and check it is `> 0` before interacting. If count is 0, treat as selector failure.
4. **Execute action:** Call `locator.click()`, `locator.fill(value)`, `locator.select_option(value)`, etc. based on `action.action_type`.
5. **Extract data:** For `extract_data` actions, use only Playwright built-in locator methods (`inner_text()`, `get_attribute()`, `input_value()`). Never use `page.evaluate()` with user/LLM-derived code (security requirement from ADR-031-002).
6. Returns `(True, None, None)` on success, or `(False, failed_action, exception)` on first failure.

### Heal loop logic (inside `execute()`)

```
heal_attempts = 0
while heal_attempts < max_heal_attempts:
    success, failed_action, error = await _execute_script(page, script)
    if success:
        if heal_attempts > 0:
            await selector_cache.mark_heal(tenant_id, url, goal, script.actions)
            status_callback("success")
        return ExecutionResult(healed=heal_attempts > 0, heal_attempts=heal_attempts, ...)
    
    heal_attempts += 1
    status_callback(f"healing_attempt_{heal_attempts}")
    
    diagnosis = await _diagnose_failure(page, failed_action, error)
    new_action = await regenerate_from_failure(diagnosis, failed_action, page)
    
    if new_action is None:
        # Element gone from page, cannot heal
        break
    
    # Replace the failed action in the script
    script.actions[failed_action_index] = new_action
    # Retry from the failed action (not from beginning)

# Exhausted
await selector_cache.invalidate(tenant_id, url, goal)
raise HealingExhaustedError(f"Failed after {max_heal_attempts} heal attempts")
```

**Retry from failed action, not from beginning:** When retrying after a heal, the executor must skip already-completed actions and resume from the replaced action. Track the index of the last successfully completed action.

### Core method: `_diagnose_failure()`

Signature:
```python
async def _diagnose_failure(
    self, page: Page, failed_action: PlaywrightAction, error: Exception
) -> FailureDiagnosis:
```

1. Capture a screenshot of the current page state (`page.screenshot(type="png")`).
2. Get a simplified DOM snapshot around the failed element's expected location.
3. Get the page's accessibility tree.
4. Send to the Vision LLM with a prompt that includes: the failed selector, the error message, the screenshot, and a request to identify what changed and suggest a new selector.
5. Parse the LLM response into a `FailureDiagnosis` model.
6. Increment `credits_used` counter.

### Core method: `regenerate_from_failure()`

Signature:
```python
async def regenerate_from_failure(
    self,
    diagnosis: FailureDiagnosis,
    original_action: PlaywrightAction,
    page: Page,
) -> PlaywrightAction | None:
```

1. If `diagnosis.action_type_still_valid` is `False`, return `None` (element removed from page).
2. Build a new `SelectorStrategy` from `diagnosis.suggested_new_selector`.
3. Validate the new selector against the live DOM (check `locator.count() > 0`).
4. If valid, return a new `PlaywrightAction` with the same action type and value but the new selector.
5. If the new selector also fails validation, return `None`.

### Vision LLM integration for diagnosis

The diagnosis call uses the existing multi-provider LLM system in the Python backend. The prompt structure for diagnosis:

- **System prompt:** "You are a web automation diagnosis expert. A Playwright action failed. Analyze the screenshot and suggest a replacement selector."
- **User message:** Include the failed selector details, the error message, and the screenshot as base64 PNG.
- **Expected JSON output:** `{ "root_cause": str, "suggested_new_selector": { "aria_role": str?, "label": str?, "text": str?, "css": str?, "xpath": str? }, "confidence": float, "action_type_still_valid": bool }`
- **Vision model:** Use the `vision_model` string passed to the executor constructor.

Use the existing `callLLMStructured` or equivalent gateway call from `python-backend/app/llm_proxy/gateway_unified.py`. The model name comes from the `vision_model` parameter (ultimately from `system_settings` key `automation_vision_model`).

### Cancellation mechanism

Between each action in `_execute_script()`, check:
```python
cancel_val = await self.redis_client.get(f"automation:{execution_id}:cancel")
if cancel_val == b"1":
    raise CancellationRequestedError("Execution cancelled by user")
```

The cancel key is set by the `/cancel` FastAPI endpoint (section 08) with a TTL of 3600 seconds.

### Security constraints

- **No `page.evaluate()` with user/LLM content:** The `extract_data` action handler must use only Playwright built-in locator methods. This is a hard security requirement (ADR-031-002). The only permitted `page.evaluate()` usage is the numbered overlay injection (section 04), which uses a hardcoded system-authored script.
- **SSRF:** The executor does not navigate to new URLs on its own (navigation is part of the script from section 04 which already validated URLs). However, if the script contains a `goto` action, the URL should be re-validated against `allowed_domains` before navigation.

### Key conventions

- **Async in Celery:** This service is async and will be called from Celery tasks using `_run_async(coro)` with `asyncio.new_event_loop()` (section 07).
- **Redis key prefix:** Cancellation keys use `automation:{execution_id}:cancel`.
- **camelCase interop:** `ExecutionResult` should use `model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)` for tRPC interop if it will be serialized to JSON for the Node.js layer.
- **Screenshot capture:** Always viewport-only (`full_page=False`) to stay within LLM token budgets.
- **No ProcessPoolExecutor:** Playwright async is incompatible with process-based parallelism.

---

## Implementation Checklist

1. Create `python-backend/tests/unit/automation/test_self_healing_executor.py` with all test stubs listed above.
2. Create `python-backend/app/services/self_healing_executor.py` with:
   - `FailureDiagnosis` Pydantic model
   - `ExecutionResult` Pydantic model
   - `SelfHealingExecutor` class with `execute()`, `_execute_script()`, `_diagnose_failure()`, `regenerate_from_failure()` methods
3. Implement the heal loop with the 3-attempt limit.
4. Implement cancellation checking between actions.
5. Implement the `get_by_role` count guard.
6. Implement `status_callback` calls at each phase transition.
7. Implement Vision LLM diagnosis call using the existing gateway.
8. Run tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/unit/automation/test_self_healing_executor.py -v`
9. Verify coverage target: >= 80% for `self_healing_executor.py`.