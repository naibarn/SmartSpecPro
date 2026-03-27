# Section 05: Context Budget Manager

## Overview

This section implements `ContextBudgetManager`, a standalone module that enforces context window limits during agency execution. It ensures composed context (system prompt + memories + prior node results + working memory + user input) never exceeds 60% of the target model's context window. It also reserves explicit completion headroom so the executor does not spend the last tokens on input. This prevents the ~5% context overflow errors currently observed in multi-node chains.

**Depends on**: Nothing -- this section is independent and can be implemented in parallel with sections 01-03 and 08.
**Blocks**: section-06-orchestrator-wiring (which integrates this manager into the execution flow).

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/services/agency_context_budget.py` | Context budget manager module |
| `python-backend/tests/unit/test_agency_context_budget.py` | Unit tests |

## Existing Code Reference

The project already has a model context limits dictionary in `/home/dev/projects/SmartSpecPro/python-backend/app/kilo/context_manager.py` (lines 19-48). The new `ContextBudgetManager` maintains its own `MODEL_CONTEXT_LIMITS` dictionary rather than importing from kilo, because the kilo module is for a different subsystem (CLI context management) and couples threading, session management, and summarization concerns that are not relevant here. The dictionary values should be kept consistent between the two.

The existing `estimate_tokens()` in `kilo/context_manager.py` (line 119) uses a similar `len(text) // 4` heuristic. The new module uses `len(text) // 4 + 1` for a slight upward bias (safer for budget enforcement).

The existing `BudgetController` in `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/agents/budget_controller.py` manages workflow-level token budgets with credit integration. The new `ContextBudgetManager` is different: it manages per-LLM-call context window allocation, not workflow cost budgets. They operate at different levels and do not overlap.

---

## Tests (Write First)

**File**: `python-backend/tests/unit/test_agency_context_budget.py`

All tests are synchronous (the `ContextBudgetManager` has no async methods). Use standard pytest assertions.

```python
import pytest
from app.services.agency_context_budget import (
    ContextBudgetManager,
    MODEL_CONTEXT_LIMITS,
    DEFAULT_CONTEXT_LIMIT,
    CONTEXT_BUDGET_RATIO,
    COMPLETION_RESERVE_RATIO,
    MIN_COMPLETION_RESERVE_TOKENS,
)

# --- __init__ / budget computation ---

# Test: __init__ computes budget as model_limit * 0.6 for known models
#   manager = ContextBudgetManager("gpt-4o")
#   assert manager.total_budget == int(128000 * 0.6)  # 76800

# Test: __init__ uses DEFAULT_CONTEXT_LIMIT (32000) for unknown models
#   manager = ContextBudgetManager("some-unknown-model-xyz")
#   assert manager.total_budget == int(32000 * 0.6)  # 19200

# Test: budget for gpt-4o is 128000 * 0.6 = 76800
#   Explicit check: ContextBudgetManager("gpt-4o").total_budget == 76800

# Test: budget for claude-sonnet model variants
#   ContextBudgetManager("claude-3-5-sonnet").total_budget == int(200000 * 0.6)  # 120000
#   Also check partial match: ContextBudgetManager("claude-3-sonnet-20260101").total_budget == 120000

# Test: budget for gpt-4o-mini matches gpt-4o (both 128K context)
#   ContextBudgetManager("gpt-4o-mini").total_budget == 76800

# Test: completion reserve is tracked separately from input budget
#   manager = ContextBudgetManager("gpt-4o")
#   assert manager.completion_reserve_tokens == max(MIN_COMPLETION_RESERVE_TOKENS, int(128000 * COMPLETION_RESERVE_RATIO))

# Test: __init__ with empty string model_name uses default
#   ContextBudgetManager("").total_budget == int(32000 * 0.6)

# Test: __init__ with None-like edge case
#   ContextBudgetManager("").total_budget == 19200

# --- estimate_tokens ---

# Test: estimate_tokens returns len(text) // 4 + 1
#   manager.estimate_tokens("hello world") == len("hello world") // 4 + 1 == 3
#   manager.estimate_tokens("a" * 100) == 26
#   manager.estimate_tokens("") == 1  (0 // 4 + 1)

# Test: estimate_tokens for empty string
#   manager.estimate_tokens("") == 1

# --- allocate ---

# Test: allocate returns full text when within budget
#   manager = ContextBudgetManager("gpt-4o")  # budget=76800
#   result = manager.allocate("short text", "test_label")
#   assert result == "short text"

# Test: allocate truncates text when exceeding remaining budget
#   manager = ContextBudgetManager("some-unknown-model")  # budget=19200
#   big_text = "x" * 200000  # way over budget
#   result = manager.allocate(big_text, "big_block")
#   assert result is not None
#   assert len(result) < len(big_text)
#   assert result.endswith("[truncated to fit context budget]")

# Test: allocate returns None when remaining budget < 25 tokens (100 chars)
#   manager = ContextBudgetManager("some-unknown-model")
#   # Exhaust budget by allocating large text first
#   manager.allocate("x" * 76000, "filler")
#   result = manager.allocate("more text", "overflow")
#   assert result is None

# Test: allocate tracks cumulative usage across multiple calls
#   manager = ContextBudgetManager("gpt-4o")
#   manager.allocate("first block" * 100, "block1")
#   remaining_after_first = manager.remaining
#   manager.allocate("second block" * 100, "block2")
#   assert manager.remaining < remaining_after_first

# --- remaining ---

# Test: remaining starts at total_budget
#   manager = ContextBudgetManager("gpt-4o")
#   assert manager.remaining == 76800

# Test: remaining decreases after each allocate call
#   manager = ContextBudgetManager("gpt-4o")
#   text = "a" * 400  # 101 tokens
#   manager.allocate(text, "label")
#   assert manager.remaining == 76800 - 101

# --- can_fit ---

# Test: can_fit returns True when tokens <= remaining
#   manager = ContextBudgetManager("gpt-4o")
#   assert manager.can_fit(1000) is True

# Test: can_fit returns False when tokens > remaining
#   manager = ContextBudgetManager("gpt-4o")
#   assert manager.can_fit(100000) is False

# Test: can_fit reflects state after allocations
#   manager = ContextBudgetManager("gpt-4o")
#   manager.allocate("x" * 300000, "big")
#   assert manager.can_fit(1000) is False
```

---

## Implementation Guidance

**File**: `python-backend/app/services/agency_context_budget.py`

### Module-Level Constants

```python
MODEL_CONTEXT_LIMITS: dict[str, int] = {
    # OpenAI
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-3.5-turbo": 16385,
    # Anthropic
    "claude-3-5-sonnet": 200000,
    "claude-3-opus": 200000,
    "claude-3-haiku": 200000,
    "claude-3-sonnet": 200000,
    "claude-sonnet": 200000,
    "claude-opus": 200000,
    "claude-haiku": 200000,
    # Google
    "gemini-2.0-flash": 1000000,
    "gemini-1.5-pro": 2000000,
    "gemini-1.5-flash": 1000000,
    # DeepSeek
    "deepseek-chat": 64000,
    "deepseek-coder": 64000,
}

DEFAULT_CONTEXT_LIMIT: int = 32000
CONTEXT_BUDGET_RATIO: float = 0.6
COMPLETION_RESERVE_RATIO: float = 0.2
MIN_COMPLETION_RESERVE_TOKENS: int = 2048
```

### Model Name Matching

Use substring matching (case-insensitive) to handle model name variants with date suffixes (e.g., `claude-3-5-sonnet-20260101`, `gpt-4o-2026-03-15`). The matching logic should iterate through `MODEL_CONTEXT_LIMITS` keys and check if any key is contained in the lowercase model name. This matches the existing pattern in `kilo/context_manager.py:get_model_limit()`.

### Class: `ContextBudgetManager`

```python
class ContextBudgetManager:
    """Enforce that composed context never exceeds 60% of target model's context window."""

    def __init__(self, model_name: str):
        """
        Initialize with a model name. Looks up context limit, computes budget.
        - model_name: LLM model identifier (e.g., "gpt-4o", "claude-3-5-sonnet")
        """

    @property
    def remaining(self) -> int:
        """Return remaining token budget (total_budget - used_tokens)."""

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count: len(text) // 4 + 1. Returns 1 for empty string."""

    def allocate(self, text: str, label: str) -> str | None:
        """
        Try to fit text within remaining budget.
        - If text fits entirely: track usage, return text unchanged.
        - If text exceeds budget but remaining > 25 tokens: truncate text to fit,
          append "[truncated to fit context budget]", track usage, return truncated text.
        - If remaining budget < 25 tokens: return None (skip entirely).
        - label: human-readable name for logging (e.g., "system_prompt", "memories", "task_input").
        """

    def can_fit(self, tokens: int) -> bool:
        """Return True if `tokens` would fit within remaining budget."""
```

### Internal State

The manager tracks:
- `total_budget: int` -- computed as `_get_model_limit(model_name) * CONTEXT_BUDGET_RATIO`, cast to int
- `completion_reserve_tokens: int` -- computed as `max(MIN_COMPLETION_RESERVE_TOKENS, model_limit * COMPLETION_RESERVE_RATIO)`
- `used_tokens: int` -- starts at 0, incremented by each `allocate()` call
- `allocations: list[tuple[str, int]]` -- list of `(label, token_count)` for debugging/logging

### Truncation Logic

When `allocate()` must truncate:
1. Compute `max_chars` from the remaining input budget only; completion reserve is never consumed by `allocate()`
2. Slice text to `text[:max_chars]`
3. Append ` [truncated to fit context budget]`
4. Track the tokens for the truncated text (re-estimate after truncation)

The executor layer, not the budget manager, is responsible for honoring `completion_reserve_tokens` when setting LLM `max_tokens`.

### Private Helper

```python
def _get_model_limit(self, model_name: str) -> int:
    """Look up model context limit. Returns DEFAULT_CONTEXT_LIMIT for unknown models."""
```

Uses case-insensitive substring matching. If `model_name` is empty or None-equivalent, return `DEFAULT_CONTEXT_LIMIT`.

### Logging

Use `structlog.get_logger()` (matches all other services in the codebase). Log at `debug` level:
- On init: `"context_budget_init"`, model_name, total_budget
- On allocate: `"context_budget_allocate"`, label, tokens, remaining
- On truncation: `"context_budget_truncated"`, label, original_tokens, truncated_tokens
- On skip (returning None): `"context_budget_skip"`, label, remaining

### Usage Pattern (for section-06 integration reference)

The orchestrator will use `ContextBudgetManager` as follows (implemented in section-06):

```python
# In _execute_agent_node(), before building messages:
budget = ContextBudgetManager(model_name=node.get("model", "gpt-4o"))

# 1. System prompt (always allocated first)
system_prompt_text = budget.allocate(agent_instructions, "system_prompt")

# 2. Retrieved memories (up to 50% of remaining budget)
retrieval = await retriever.retrieve(
    query=task_description,
    max_tokens=budget.remaining // 2,
)
memory_text = budget.allocate(
    format_retrieval_for_context(retrieval), "memories"
)

# 3. Prior node results
for node_id, result_text in ctx.results.items():
    fitted = budget.allocate(result_text, f"node_result_{node_id}")
    if fitted is None:
        break  # no more budget

# 4. User input / task
task_text = budget.allocate(augmented_message, "task_input")
```

The executor layer must leave `budget.completion_reserve_tokens` untouched when setting the model's final `max_tokens`. The budget manager only controls input allocation; completion headroom is enforced by the caller.

---

## Edge Cases and Constraints

- **Empty model name**: Defaults to 32K context limit (19,200 token budget). This handles cases where the orchestrator passes no model name.
- **Very large system prompts**: If the system prompt alone exceeds 60% of the context window, `allocate()` will truncate it. This is acceptable since extremely long system prompts are an anti-pattern.
- **Non-ASCII text**: The `len(text) // 4 + 1` heuristic over-counts tokens for Thai/CJK text (which typically uses ~2-3 chars per token). This is a conservative bias that is safer for budget enforcement -- over-reserving is preferable to overflow.
- **Thread safety**: `ContextBudgetManager` is instantiated per-execution (not shared across threads), so no locking is needed. Each agent node execution creates its own instance.

## Verification

After implementation:
1. Run `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/unit/test_agency_context_budget.py -v`
2. Verify all 12+ test cases pass
3. Verify the module has no imports from the kilo or orchestrator packages (it should be self-contained)
4. Verify `structlog` is the only external dependency beyond the standard library
