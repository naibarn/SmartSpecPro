Now I have a thorough understanding of the codebase. Let me generate the section content.

# Section 08: Python Generator Enhancement

## Overview

This section enhances the existing AI workflow generator in `python-backend/app/tasks/workflow_gen_tasks.py` and `python-backend/app/orchestrator/workflow_generator.py` to use:

1. **A 3-attempt retry loop** with Pydantic v2 validation (`GeneratedWorkflow.model_validate()`) after each attempt, replacing the current single-shot generation
2. **Few-shot examples from the database** — 5 curated templates loaded at Celery worker startup, replacing the 3 hardcoded toy examples in `_SYSTEM_PROMPT`
3. **Structured error fields** (`validationError`, `hint`) in the status response so the frontend can show actionable errors

This section depends on:
- **section-07-python-validator** (must be complete): `python-backend/app/orchestrator/workflow_validator.py` with `GeneratedWorkflow`, `KNOWN_NODE_TYPES`, `TRIGGER_NODE_TYPES`, and `WorkflowGenerationError` must already exist
- **section-04-seeder-script** (must be complete for sub-deliverable C): The 60 curated templates must be seeded into the database before few-shot loading can work

---

## Files to Create / Modify

| File | Action |
|---|---|
| `python-backend/app/tasks/workflow_gen_tasks.py` | Modify — replace single LLM call with retry loop; add `validationError`/`hint` to Redis status |
| `python-backend/app/orchestrator/workflow_generator.py` | Modify — add `generate_with_retry()` method; add few-shot loading; remove built-in toy examples from `_SYSTEM_PROMPT` |
| `python-backend/app/api/workflows.py` | Modify — add `validationError` and `hint` fields to `WorkflowGenerateStatusResponse`; pass them through in the `failed` status branch |
| `python-backend/app/orchestrator/workflow_validator.py` | Read-only dependency — see section-07 |
| `apps/web/client/src/components/workflow/AutoCreateWorkflowModal.tsx` | Modify — display `validationError` + `hint` in the error state UI |
| `python-backend/tests/test_workflow_generator.py` | Create (or extend if it exists) — unit tests for retry logic and few-shot caching |

---

## Tests First

Write these tests before implementing. Tests use `@pytest.mark.unit` and mock all LLM calls. Run with `cd python-backend && uv run pytest -m unit`.

### File: `python-backend/tests/test_workflow_generator.py`

```python
"""
Unit tests for workflow generator retry loop and few-shot cache.
All LLM gateway calls are mocked — no network calls.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from pydantic import ValidationError

# --- Retry loop tests ---

@pytest.mark.unit
async def test_first_attempt_success_returns_immediately():
    """If the first LLM response is valid, result is returned with exactly 1 LLM call."""
    ...

@pytest.mark.unit
async def test_second_attempt_success_after_first_failure():
    """If attempt 1 fails validation and attempt 2 succeeds, result returned, LLM called twice."""
    ...

@pytest.mark.unit
async def test_all_three_attempts_fail_raises_error():
    """After 3 failed attempts, WorkflowGenerationError is raised with the last error details."""
    ...

@pytest.mark.unit
async def test_error_raised_includes_validation_error_and_hint():
    """WorkflowGenerationError from 3 failures must carry .validation_error and .hint attributes."""
    ...

@pytest.mark.unit
async def test_retry_prompt_includes_previous_error_message():
    """On retry, the previous ValidationError message is appended to the LLM prompt."""
    ...

@pytest.mark.unit
def test_celery_task_max_retries_is_zero():
    """Celery task must have max_retries=0 — application retry loop handles retries."""
    from app.tasks.workflow_gen_tasks import generate_workflow_task
    assert generate_workflow_task.max_retries == 0

# --- Few-shot cache tests ---

@pytest.mark.unit
def test_few_shot_cache_populated_after_first_call():
    """Module-level few-shot cache is set after the first call to load_few_shot_examples()."""
    ...

@pytest.mark.unit
def test_few_shot_cache_not_refreshed_within_24_hours():
    """If cache was loaded less than 24h ago, it is not re-queried from the database."""
    ...

@pytest.mark.unit
def test_few_shot_cache_refreshed_after_24_hours():
    """If 24+ hours have elapsed since last load, cache is refreshed from the database."""
    ...

@pytest.mark.unit
def test_few_shot_examples_within_token_budget():
    """Combined token count of loaded few-shot examples must be <= 3000."""
    ...

@pytest.mark.unit
def test_builtin_examples_removed_when_curated_loaded():
    """When few-shot examples are loaded, the built-in EXAMPLE A/B/C blocks are absent from the prompt."""
    ...
```

---

## Sub-deliverable A: Update `WorkflowGenerationError`

The existing `WorkflowGenerationError` in `python-backend/app/orchestrator/workflow_generator.py` currently only accepts `message`. It needs to carry structured error fields for the retry loop.

**Current signature** (line 206–209 of `workflow_generator.py`):
```python
class WorkflowGenerationError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message
```

**Updated signature** — extend to carry validation details:
```python
class WorkflowGenerationError(Exception):
    def __init__(
        self,
        message: str,
        validation_error: str | None = None,
        hint: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.validation_error = validation_error
        self.hint = hint
```

This change is backward-compatible — all existing callers that pass only `message` continue to work.

---

## Sub-deliverable B: Retry Loop in `WorkflowGenerator`

### Location
`python-backend/app/orchestrator/workflow_generator.py`

### What to Add

Add a `generate_with_retry()` method to the `WorkflowGenerator` class. This is a new method — do NOT replace the existing `generate()` method in place (the Celery task will call `generate_with_retry()` specifically). Keeping `generate()` intact preserves backward compatibility with any other callers.

```python
async def generate_with_retry(
    self,
    prompt: str,
    node_types: list[dict[str, Any]] | None = None,
    model: str | None = None,
    user_token: str | None = None,
    default_model: str | None = None,
    max_attempts: int = 3,
) -> dict[str, Any]:
    """
    Generate a workflow with up to max_attempts LLM calls.

    On each failed attempt, the Pydantic ValidationError message is fed
    back to the LLM as a correction instruction. After max_attempts
    failures, raises WorkflowGenerationError with validation_error and hint.

    Args:
        prompt: User's natural language description of the desired workflow.
        node_types: Full node type specs from the registry.
        model: LLM model ID for the generation call.
        user_token: User JWT for gateway credit tracking.
        default_model: Default model for llm_call nodes inside generated workflow.
        max_attempts: Maximum number of LLM attempts (default 3).

    Returns:
        Validated workflow dict with 'nodes', 'edges', 'description'.

    Raises:
        WorkflowGenerationError: After max_attempts failures, with
            .validation_error set to the last Pydantic error message
            and .hint set to a user-facing correction suggestion.
    """
    ...
```

### Algorithm

The retry loop follows this structure:

```python
from pydantic import ValidationError
from app.orchestrator.workflow_validator import GeneratedWorkflow

last_validation_error: str | None = None

for attempt in range(1, max_attempts + 1):
    # Build prompt, appending the previous error if this is a retry
    full_prompt = self._build_retry_prompt(
        original_prompt=prompt,
        previous_error=last_validation_error,
        attempt=attempt,
    )

    # Make the LLM call (reuse existing generate() logic for the raw call)
    raw_json_dict = await self._call_llm_once(
        prompt=full_prompt,
        node_types=node_types,
        model=model,
        user_token=user_token,
        default_model=default_model,
    )

    try:
        workflow = GeneratedWorkflow.model_validate(raw_json_dict)
        return workflow.model_dump()  # Success — return immediately
    except ValidationError as e:
        last_validation_error = str(e)
        logger.warning(
            "workflow_generator_validation_failure",
            attempt=attempt,
            max_attempts=max_attempts,
            error=last_validation_error[:200],
        )

# All attempts exhausted
raise WorkflowGenerationError(
    message=f"Workflow generation failed after {max_attempts} attempts.",
    validation_error=last_validation_error,
    hint=_derive_hint(last_validation_error),
)
```

### Helper: `_build_retry_prompt()`

On attempt 1, returns the original prompt unchanged. On subsequent attempts, appends a correction instruction block:

```python
def _build_retry_prompt(
    self,
    original_prompt: str,
    previous_error: str | None,
    attempt: int,
) -> str:
    """Append validation error context to prompt for retry attempts."""
    if previous_error is None or attempt == 1:
        return original_prompt
    return (
        f"{original_prompt}\n\n"
        f"[CORRECTION REQUIRED — Attempt {attempt}]\n"
        f"Your previous response failed validation with this error:\n"
        f"{previous_error}\n"
        f"Fix ONLY the specific issue described above. Do not change other parts of the workflow."
    )
```

### Helper: `_call_llm_once()`

Extract the existing LLM-call logic from `generate()` into a private method `_call_llm_once()`. This method handles: building the user message, sending to `forward_chat_json`, extracting the content string, calling `_parse_and_validate()` for JSON parsing and port validation, and returning a plain dict. It does NOT do Pydantic structural validation (that stays in the retry loop). This refactor makes `generate()` a thin wrapper that calls `_call_llm_once()` exactly once — behavior unchanged for existing callers.

### Helper: `_derive_hint()` (module-level function)

```python
def _derive_hint(validation_error: str | None) -> str:
    """
    Derive a user-facing hint from a Pydantic ValidationError message.

    Maps known error patterns to actionable suggestions:
    - 'trigger' in error  → suggest describing when the workflow starts
    - 'nodeType' / 'Unknown nodeType' → suggest being more specific about tools
    - 'edge' / 'source' / 'target' → suggest simplifying the workflow
    - fallback → generic "try rephrasing" hint
    """
    ...
```

---

## Sub-deliverable B: Update the Celery Task

### File: `python-backend/app/tasks/workflow_gen_tasks.py`

Make two changes to `generate_workflow_task`:

**Change 1**: Set `max_retries=0` on the Celery task decorator. The application-level retry loop in `generate_with_retry()` handles all 3 attempts. Having Celery also retry creates up to 9 total LLM calls (3 app retries × 3 Celery retries).

```python
@celery_app.task(
    bind=True,
    max_retries=0,   # Changed from 1 — application retry loop in generate_with_retry() handles retries
    name="app.tasks.workflow_gen_tasks.generate_workflow",
    soft_time_limit=540,
    time_limit=600,
)
def generate_workflow_task(self, task_id, prompt, node_types, model, default_model, user_token):
    ...
```

**Change 2**: Call `generator.generate_with_retry()` instead of `generator.generate()`. On failure, capture `validation_error` and `hint` from the `WorkflowGenerationError` exception and store them in the Redis status dict.

The updated failure handling:
```python
except WorkflowGenerationError as e:
    _set_status(task_id, {
        "status": "failed",
        "error": e.message,
        "validationError": e.validation_error,
        "hint": e.hint,
    })
except Exception as e:
    _set_status(task_id, {
        "status": "failed",
        "error": str(e),
        "validationError": None,
        "hint": None,
    })
```

Remove the existing Celery retry logic (the `if self.request.retries < self.max_retries: raise self.retry(...)` block) — it is superseded by the application-level loop.

---

## Sub-deliverable C: Few-Shot Examples from Database

### Location
`python-backend/app/orchestrator/workflow_generator.py`

### What to Add

Add module-level cache state and a `load_few_shot_examples()` function. This runs in the Celery worker process (not the FastAPI web process), so it uses a **synchronous** SQLAlchemy connection (not `async_sessionmaker`).

```python
import time
from typing import Any

# Module-level cache
_few_shot_cache: list[dict[str, Any]] = []
_few_shot_loaded_at: float = 0.0
_FEW_SHOT_TTL = 86400.0  # 24 hours

# Static selection — one per major category. Set at implementation time
# by choosing from the 60 seeded templates.
_FEW_SHOT_TEMPLATE_KEYS: list[str] = [
    "tpl-055",  # AI/LLM category — replace with actual key after seeding
    "tpl-019",  # IT & DevOps (schedule-triggered)
    "tpl-039",  # Logistics (integration/HTTP)
    "tpl-032",  # Personal Productivity (data processing)
    "tpl-048",  # Customer Service (event/webhook-triggered)
]

_MAX_FEW_SHOT_TOKENS = 3000


def load_few_shot_examples(force: bool = False) -> list[dict[str, Any]]:
    """
    Load few-shot workflow examples from the database.

    Uses module-level cache with 24-hour TTL. Safe to call on every
    generation request — the cache check is O(1).

    Args:
        force: If True, bypass cache and reload from DB.

    Returns:
        List of dicts with 'name', 'description', 'workflowJson' keys.
        Returns empty list if DB is unavailable (graceful degradation).
    """
    ...
```

### Database Access Pattern

The Celery worker is a synchronous context. Use the synchronous SQLAlchemy session (not the async one from `app.core.database`). Access the database via the `DATABASE_URL` environment variable using `sqlalchemy.create_engine` and a direct query. Do NOT import `AsyncSession` or `asyncpg` here.

```python
import os
from sqlalchemy import create_engine, text

def _load_from_db() -> list[dict[str, Any]]:
    """Synchronous DB query for Celery worker context."""
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        return []
    # Convert asyncpg URL to psycopg2 URL if needed
    sync_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(sync_url, pool_pre_ping=True)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                'SELECT name, description, "workflowJson" FROM "workflowTemplates" '
                'WHERE "templateKey" = ANY(:keys) AND "isPublic" = true '
                'LIMIT 5'
            ),
            {"keys": _FEW_SHOT_TEMPLATE_KEYS},
        ).fetchall()
    engine.dispose()
    return [{"name": r[0], "description": r[1], "workflowJson": r[2]} for r in rows]
```

### Token Budget Enforcement

After loading, apply the 3000-token cap. Use a simple approximation: `len(json.dumps(obj)) // 4` tokens per item. Truncate `config` field values (replace strings longer than 100 chars with `"..."`) until the total fits. If all 5 still exceed the budget, use 3 examples.

```python
def _truncate_to_token_budget(
    examples: list[dict[str, Any]],
    max_tokens: int = _MAX_FEW_SHOT_TOKENS,
) -> list[dict[str, Any]]:
    """
    Trim few-shot examples to fit within the token budget.

    Strategy:
    1. Truncate long config string values to "..."
    2. If still over budget, reduce to 3 examples
    3. Returns whatever fits

    Args:
        examples: List of example dicts with 'name', 'description', 'workflowJson'.
        max_tokens: Token cap (approximated as len(json_string) // 4).

    Returns:
        Trimmed list that fits within max_tokens.
    """
    ...
```

### Integrating Few-Shot into System Prompt

In `_SYSTEM_PROMPT`, the three built-in examples (EXAMPLE A, EXAMPLE B, EXAMPLE C) must be **removed** when curated examples are loaded. The system prompt still contains the STRICT RULES and OUTPUT FORMAT sections — only the `BUILT-IN EXAMPLES` section is replaced.

Create a `_build_system_prompt()` function that returns the system prompt string dynamically:

```python
def _build_system_prompt(few_shot_examples: list[dict[str, Any]]) -> str:
    """
    Build the system prompt, injecting few-shot examples.

    If few_shot_examples is non-empty, replaces the built-in EXAMPLE A/B/C
    block with formatted curated examples. If empty (DB unavailable),
    falls back to the built-in examples.

    Args:
        few_shot_examples: List of dicts from load_few_shot_examples().

    Returns:
        Complete system prompt string with examples section.
    """
    ...
```

Format each example as:
```
# Example {N}: {name}
Description: {description}
Workflow JSON:
{json.dumps(workflowJson, indent=2)}
```

In `generate_with_retry()` (and `generate()`), call `_build_system_prompt(load_few_shot_examples())` instead of referencing `_SYSTEM_PROMPT` directly.

---

## Sub-deliverable D: Update `WorkflowGenerateStatusResponse` in `workflows.py`

### File: `python-backend/app/api/workflows.py`

Extend the `WorkflowGenerateStatusResponse` Pydantic model (line 88–96) to include the two new optional fields:

```python
class WorkflowGenerateStatusResponse(BaseModel):
    """Response from workflow generation status polling."""

    status: str  # queued | processing | completed | failed
    message: str | None = None
    error: str | None = None
    nodes: list[dict[str, Any]] | None = None
    edges: list[dict[str, Any]] | None = None
    description: str | None = None
    validationError: str | None = None   # NEW: structured Pydantic error
    hint: str | None = None              # NEW: user-facing corrective hint
```

In the `get_generate_status` endpoint handler (around line 293), update the `failed` branch to pass through the new fields from the Redis status dict:

```python
elif status == "failed":
    return WorkflowGenerateStatusResponse(
        status="failed",
        error=status_data.get("error", "Unknown error"),
        validationError=status_data.get("validationError"),
        hint=status_data.get("hint"),
    )
```

---

## Sub-deliverable E: Update `AutoCreateWorkflowModal` (Frontend)

### File: `apps/web/client/src/components/workflow/AutoCreateWorkflowModal.tsx`

The frontend receives the status response via tRPC polling. When `status === "failed"`, the modal currently shows a generic error message. It needs to display `validationError` and `hint` when present.

**Step 1**: Add state for the new error fields alongside the existing `errorMessage` state:

```typescript
const [errorMessage, setErrorMessage] = useState("");
const [validationError, setValidationError] = useState<string | null>(null);
const [hint, setHint] = useState<string | null>(null);
```

**Step 2**: In the polling callback, extract the new fields:

```typescript
} else if (status.status === "failed") {
  setErrorMessage(status.error || "Unknown error occurred");
  setValidationError(status.validationError ?? null);
  setHint(status.hint ?? null);
  setPhase("error");
  setTaskId(null);
}
```

**Step 3**: Reset the new state fields when the user triggers a new generation or closes the modal:

```typescript
const resetState = () => {
  setPhase("idle");
  setErrorMessage("");
  setValidationError(null);
  setHint(null);
  setResult(null);
  setTaskId(null);
};
```

**Step 4**: Update the error state JSX (currently around line 456–480). When `validationError` is present, show it as a secondary detail block below the main error message. When `hint` is present, show it as an actionable suggestion with a "Try rephrasing" link that calls `resetState()`:

```tsx
{phase === "error" && !result && (
  <div className="border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3">
    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">
        Generation failed
      </p>
      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
        {errorMessage ||
          "The LLM did not return a valid workflow. Try simplifying your description."}
      </p>
      {validationError && (
        <details className="mt-2">
          <summary className="text-xs text-red-500 cursor-pointer">
            Technical details
          </summary>
          <pre className="text-xs text-red-500 mt-1 whitespace-pre-wrap font-mono">
            {validationError}
          </pre>
        </details>
      )}
      {hint && (
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
          Suggestion: {hint}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={resetState}
      >
        Try rephrasing
      </Button>
    </div>
  </div>
)}
```

The frontend does not need to know about tRPC type changes — it accesses the response data through whatever shape the tRPC proxy returns. If the tRPC router proxies the Python response directly, the `validationError` and `hint` fields will be present in the status object when the Python API returns them. Verify that the Node.js tRPC router (`apps/web/server/routers/workflow.ts`) passes through these fields from the Python API response without stripping them.

---

## Implementation Notes

### Preserving Backward Compatibility

- The existing `generate()` method on `WorkflowGenerator` stays intact and is not modified. New callers use `generate_with_retry()`. This avoids breaking any direct usages of `generate()` in tests or other parts of the codebase.
- The `WorkflowGenerationError` extension is backward-compatible (new params are optional with `None` defaults).
- The `WorkflowGenerateStatusResponse` extension is backward-compatible (new fields default to `None` and do not break existing `completed`/`queued`/`processing` responses).

### Avoiding Double Retries

The current `generate_workflow_task` has `max_retries=1` at the Celery level AND the new application loop retries 3 times. If both are active, a worst case would be 3 application retries × 2 Celery retries = 6 total LLM calls. Set `max_retries=0` to ensure exactly 3 total LLM calls per user request.

### Few-Shot Examples — Static Selection

The 5 `_FEW_SHOT_TEMPLATE_KEYS` are hardcoded. Select them after the seeder runs (section-04) by reviewing which templates best represent diverse workflow patterns (one AI/LLM, one schedule-triggered, one HTTP integration, one data processing, one event-driven). Update the module-level list with the actual `templateKey` values (e.g., `"tpl-055"`, `"tpl-019"`, etc.).

### Graceful Degradation if DB Unavailable

`load_few_shot_examples()` must never crash the Celery worker. Wrap the `_load_from_db()` call in try/except and return an empty list on any failure. When few-shot examples are unavailable, `_build_system_prompt([])` falls back to the built-in `_SYSTEM_PROMPT` with EXAMPLE A/B/C.

### Pydantic v2 Syntax (Critical)

This project uses `pydantic>=2.7.4`. The validator in `workflow_validator.py` (section-07) uses v2 syntax. In this section:
- Use `GeneratedWorkflow.model_validate(parsed_dict)` — NOT `GeneratedWorkflow(**parsed_dict)`
- Use `workflow.model_dump()` to serialize — NOT `.dict()`
- Catch `pydantic.ValidationError` (not `pydantic.v1.ValidationError`)

### Token Budget Approximation

The `len(json.dumps(obj)) // 4` approximation is intentionally simple (roughly 4 chars per token for English text + JSON syntax). It may over-estimate token count by up to 30% for heavily structured JSON. This is acceptable — the 3000-token cap has a wide enough margin that a 30% over-count would still protect against context overflow.

---

## Implementation Notes (Actual)

### Files Created/Modified
- **Modified:** `python-backend/app/orchestrator/workflow_generator.py` — Added `generate_with_retry()`, `_call_llm_once()`, `_build_retry_prompt()`, `_derive_hint()`, `_build_system_prompt()`, `load_few_shot_examples()`, `_truncate_to_token_budget()`, `_load_from_db()`. Refactored `generate()` to delegate to `_call_llm_once()`. Extended `WorkflowGenerationError` with `validation_error` and `hint` fields.
- **Modified:** `python-backend/app/tasks/workflow_gen_tasks.py` — Set `max_retries=0`, switched to `generate_with_retry()`, added structured error handling for `WorkflowGenerationError`.
- **Modified:** `python-backend/app/api/workflows.py` — Updated failed status branch to pass through `validationError` and `hint` from Redis.
- **Modified:** `python-backend/app/orchestrator/workflow_validator.py` — Added `description` field to `GeneratedWorkflow`, `type` field to `WorkflowEdge` (code review fixes).
- **Modified:** `apps/web/server/routers/workflow.ts` — Added `validationError` and `hint` to status response type.
- **Modified:** `apps/web/client/src/components/workflow/AutoCreateWorkflowModal.tsx` — Added `validationError`/`hint` state, expandable technical details in error UI, suggestion display.
- **Created:** `python-backend/tests/test_workflow_generator.py` — 12 unit tests for retry loop and few-shot cache.

### Deviations from Plan
1. **`generate()` refactored**: Plan said to keep `generate()` intact. Code review identified ~100 lines of duplication. Refactored `generate()` to be a thin wrapper calling `_call_llm_once()`.
2. **`GeneratedWorkflow` model extended**: Added `description` and edge `type` fields (code review fix). Without these, `model_dump()` would silently drop these fields.
3. **Token budget fallback**: Plan only reduced to 3 examples. Implementation adds fallback to 1 example or empty if still over budget.
4. **`WorkflowGenerateStatusResponse` already moved**: Sub-deliverable D was already handled in section-07. Only the endpoint handler needed updating.

### Test Results
- 12/12 tests pass for section-08
- 15/15 tests pass for section-07 (no regressions)
- 27/27 total tests pass

## Test Run Command

```bash
cd python-backend && uv run pytest -m unit -k "test_workflow_generator" -v
```

To run all section-08 related tests including the validator tests from section-07:
```bash
cd python-backend && uv run pytest -m unit -k "workflow_generator or workflow_validator" -v
```