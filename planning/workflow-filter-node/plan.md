# Filter (Array Filtering) Workflow Node - Implementation Plan

## Problem Statement

The workflow system needs a **Filter** node that allows users to filter arrays based on conditions. This is a fundamental data processing operation for workflows that transform, clean, or route data. The node must support three filter modes (simple field comparison, expression-based, and custom Python code) and handle edge cases like empty arrays, non-array inputs, nested object paths, and null values.

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/orchestrator/node_executors/data_executors/filter_executor.py` | **CREATE** | Core executor with three filter modes |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `filter` node type with full InputSpec/OutputSpec |
| `python-backend/tests/test_filter_executor.py` | **CREATE** | Comprehensive unit tests |

No database changes. No frontend changes required (the frontend renders dynamically from the registry).

## Architecture Overview

```
User Config (UI)                    Executor (Python)
+---------------------------+       +------------------------------------------+
| inputArray: {{node.data}} |       |                                          |
| filterMode: simple        | ----> | FilterExecutor.execute()                 |
| field: "age"              |       |   |                                      |
| operator: ">"             |       |   +-> _filter_simple()                   |
| value: 18                 |       |   |     +-> _get_nested_value()          |
|                           |       |   |     +-> _compare()                   |
| -- OR --                  |       |   |                                      |
| filterMode: expression    |       |   +-> _filter_expression()               |
| expression: item.age > 18 |       |   |     +-> ExpressionResolver (reuse)  |
|                           |       |   |     +-> _evaluate_condition()        |
| -- OR --                  |       |   |                                      |
| filterMode: custom_code   |       |   +-> _filter_custom_code()              |
| customCode: def f(item).. |       |         +-> RestrictedPython (reuse)     |
+---------------------------+       +------------------------------------------+
                                    |                                          |
                                    | Returns:                                 |
                                    |   filtered: [...matching items]          |
                                    |   filteredCount: N                       |
                                    |   originalCount: M                       |
                                    |   removedCount: M - N                    |
                                    +------------------------------------------+
```

---

## Step 1: Filter Executor Implementation

**File:** `python-backend/app/orchestrator/node_executors/data_executors/filter_executor.py`

### 1.1 Class Structure

```python
"""Filter Executor - Filter arrays based on conditions."""
import io
import signal
from contextlib import redirect_stdout
from typing import Any

from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Guards import guarded_iter_unpack_sequence, safe_builtins

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class FilterExecutor:
    """Executor for filter (array filtering) nodes."""

    # Supported comparison operators
    OPERATORS = {
        "==", "!=", ">", "<", ">=", "<=",
        "contains", "startsWith", "endsWith",
        "in", "not_in", "exists", "not_exists",
    }

    # Maximum array size for performance safety
    MAX_ARRAY_SIZE = 10_000

    # Timeout for custom_code mode (seconds)
    CUSTOM_CODE_TIMEOUT = 10

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        ...
```

### 1.2 Main Execute Method

The `execute` method:

1. Extracts `inputArray` from `data.inputs` (resolved by expression resolver before reaching executor).
2. Validates it is a `list`. If not, raises `ValueError("inputArray must be an array")`.
3. Enforces `MAX_ARRAY_SIZE` limit.
4. Reads `filterMode` from inputs (default: `"simple"`).
5. Reads `nullHandling` from inputs (default: `"exclude"` -- skip items where the target field is None).
6. Dispatches to the appropriate filter method.
7. Returns the standard output dict.

```python
async def execute(self, data, context) -> dict[str, Any]:
    input_array = data.inputs.get("inputArray", [])
    filter_mode = data.inputs.get("filterMode", "simple")
    null_handling = data.inputs.get("nullHandling", "exclude")

    # Validate input
    if not isinstance(input_array, list):
        raise ValueError(
            f"inputArray must be an array, got {type(input_array).__name__}"
        )

    if len(input_array) > self.MAX_ARRAY_SIZE:
        raise ValueError(
            f"Array too large ({len(input_array)} items, max {self.MAX_ARRAY_SIZE})"
        )

    original_count = len(input_array)

    # Handle empty array early
    if original_count == 0:
        return {
            "filtered": [],
            "filteredCount": 0,
            "originalCount": 0,
            "removedCount": 0,
        }

    # Dispatch to filter mode
    if filter_mode == "simple":
        filtered = self._filter_simple(input_array, data.inputs, null_handling)
    elif filter_mode == "expression":
        filtered = self._filter_expression(input_array, data.inputs, data.state)
    elif filter_mode == "custom_code":
        filtered = self._filter_custom_code(input_array, data.inputs)
    else:
        raise ValueError(f"Invalid filterMode: {filter_mode}")

    filtered_count = len(filtered)

    return {
        "filtered": filtered,
        "filteredCount": filtered_count,
        "originalCount": original_count,
        "removedCount": original_count - filtered_count,
    }
```

### 1.3 Simple Mode: `_filter_simple()`

Field-based comparison with operator support. Handles nested paths via `_get_nested_value()`.

```python
def _filter_simple(
    self,
    items: list[Any],
    inputs: dict[str, Any],
    null_handling: str,
) -> list[Any]:
    field = inputs.get("field", "")
    operator = inputs.get("operator", "==")
    compare_value = inputs.get("value")

    if not field:
        raise ValueError("Field name is required for simple filter mode")

    if operator not in self.OPERATORS:
        raise ValueError(f"Invalid operator: {operator}")

    result = []
    for item in items:
        field_value = self._get_nested_value(item, field)

        # Handle null/missing values
        if field_value is None:
            if null_handling == "include":
                result.append(item)
            # "exclude" (default) -> skip
            continue

        if self._compare(field_value, operator, compare_value):
            result.append(item)

    return result
```

### 1.4 Nested Field Path Extraction: `_get_nested_value()`

Supports dot-separated paths like `"user.profile.age"` and integer-indexed array access like `"items.0.name"`.

```python
def _get_nested_value(self, obj: Any, path: str) -> Any:
    """
    Extract a value from a nested object using dot-separated path.

    Supports:
      - Dict key access: "user.name"
      - Nested dicts: "user.profile.age"
      - List indexing: "items.0.name"

    Returns None if path is invalid or value not found.
    """
    parts = path.split(".")
    current = obj

    for part in parts:
        if current is None:
            return None

        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, (list, tuple)):
            try:
                index = int(part)
                current = current[index]
            except (ValueError, IndexError):
                return None
        else:
            # Try attribute access for objects
            try:
                current = getattr(current, part, None)
            except Exception:
                return None

    return current
```

### 1.5 Operator Comparison Logic: `_compare()`

```python
def _compare(self, field_value: Any, operator: str, compare_value: Any) -> bool:
    """
    Compare a field value against a target value using the specified operator.

    Type coercion: attempts numeric comparison first, falls back to string.
    """
    try:
        if operator == "==":
            return field_value == compare_value
        elif operator == "!=":
            return field_value != compare_value
        elif operator in (">", "<", ">=", "<="):
            return self._numeric_compare(field_value, operator, compare_value)
        elif operator == "contains":
            return self._string_op(field_value, compare_value, "contains")
        elif operator == "startsWith":
            return self._string_op(field_value, compare_value, "startsWith")
        elif operator == "endsWith":
            return self._string_op(field_value, compare_value, "endsWith")
        elif operator == "in":
            if isinstance(compare_value, list):
                return field_value in compare_value
            return False
        elif operator == "not_in":
            if isinstance(compare_value, list):
                return field_value not in compare_value
            return True
        elif operator == "exists":
            return field_value is not None
        elif operator == "not_exists":
            return field_value is None
        else:
            return False
    except (TypeError, ValueError):
        return False

def _numeric_compare(self, a: Any, operator: str, b: Any) -> bool:
    """Numeric comparison with type coercion."""
    try:
        a_num = float(a)
        b_num = float(b)
    except (TypeError, ValueError):
        # Fall back to string comparison
        a_str = str(a)
        b_str = str(b)
        if operator == ">":
            return a_str > b_str
        elif operator == "<":
            return a_str < b_str
        elif operator == ">=":
            return a_str >= b_str
        elif operator == "<=":
            return a_str <= b_str
        return False

    if operator == ">":
        return a_num > b_num
    elif operator == "<":
        return a_num < b_num
    elif operator == ">=":
        return a_num >= b_num
    elif operator == "<=":
        return a_num <= b_num
    return False

def _string_op(self, field_value: Any, compare_value: Any, op: str) -> bool:
    """String operations: contains, startsWith, endsWith."""
    field_str = str(field_value)
    compare_str = str(compare_value)
    if op == "contains":
        return compare_str in field_str
    elif op == "startsWith":
        return field_str.startswith(compare_str)
    elif op == "endsWith":
        return field_str.endswith(compare_str)
    return False
```

### 1.6 Expression Mode: `_filter_expression()`

Evaluates an expression per item. The expression uses `item` as the current element variable. This mode leverages a lightweight evaluator rather than the full `ExpressionResolver` (which is designed for `{{nodeId.output}}` path resolution, not boolean conditions).

**Design Decision:** Rather than extending ExpressionResolver (which resolves path references, not boolean expressions), we use Python's `ast.literal_eval` approach combined with a safe expression evaluator. This keeps ExpressionResolver focused on its original purpose.

```python
import ast
import operator as op_module

# Safe operators for expression evaluation
SAFE_OPS = {
    ast.Gt: op_module.gt,
    ast.Lt: op_module.lt,
    ast.GtE: op_module.ge,
    ast.LtE: op_module.le,
    ast.Eq: op_module.eq,
    ast.NotEq: op_module.ne,
    ast.And: lambda a, b: a and b,
    ast.Or: lambda a, b: a or b,
    ast.Not: op_module.not_,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}

def _filter_expression(
    self,
    items: list[Any],
    inputs: dict[str, Any],
    state: dict[str, Any],
) -> list[Any]:
    expression = inputs.get("expression", "").strip()
    if not expression:
        raise ValueError("Expression is required for expression filter mode")

    # Strip {{ }} if present (user may copy from expression syntax)
    if expression.startswith("{{") and expression.endswith("}}"):
        expression = expression[2:-2].strip()

    # Security: validate expression length
    if len(expression) > 500:
        raise ValueError("Expression too long (max 500 characters)")

    result = []
    for item in items:
        try:
            matches = self._evaluate_expression_for_item(expression, item, state)
            if matches:
                result.append(item)
        except Exception:
            # Invalid expression for this item -> skip (treat as non-match)
            continue

    return result

def _evaluate_expression_for_item(
    self,
    expression: str,
    item: Any,
    state: dict[str, Any],
) -> bool:
    """
    Evaluate a boolean expression against a single item.

    The expression can reference:
      - item.field (current array element)
      - item.nested.field (nested access)

    Uses AST parsing for safe evaluation (no exec/eval).
    """
    # Replace item.path references with actual values
    resolved_expr = self._resolve_item_references(expression, item)

    # Parse and evaluate safely via AST
    try:
        tree = ast.parse(resolved_expr, mode="eval")
        return bool(self._eval_ast_node(tree.body, item))
    except (SyntaxError, ValueError, TypeError):
        return False

def _resolve_item_references(self, expression: str, item: Any) -> str:
    """
    Replace item.xxx references in the expression with actual values.

    Example: "item.age > 18" with item={"age": 25} -> "25 > 18"
    """
    import re

    def replace_ref(match):
        path = match.group(1)  # e.g., "age" or "profile.name"
        value = self._get_nested_value(item, path)
        if value is None:
            return "None"
        if isinstance(value, str):
            return repr(value)  # Quote strings
        return repr(value)

    # Match item.xxx patterns (item. followed by word chars and dots)
    return re.sub(r"item\.([a-zA-Z_][a-zA-Z0-9_.]*)", replace_ref, expression)
```

**Alternative (simpler) approach for expression mode:** Since expressions like `item.age > 18` are essentially boolean expressions, we can use RestrictedPython with a minimal sandbox that only exposes `item`. This is consistent with the custom_code approach and avoids building a custom AST evaluator.

**Recommended implementation (using RestrictedPython for expressions too):**

```python
def _filter_expression(
    self,
    items: list[Any],
    inputs: dict[str, Any],
    state: dict[str, Any],
) -> list[Any]:
    expression = inputs.get("expression", "").strip()
    if not expression:
        raise ValueError("Expression is required for expression filter mode")

    if expression.startswith("{{") and expression.endswith("}}"):
        expression = expression[2:-2].strip()

    if len(expression) > 500:
        raise ValueError("Expression too long (max 500 characters)")

    # Wrap expression in a function to get a boolean result
    wrapper_code = f"_result_ = bool({expression})"

    try:
        byte_code = compile_restricted(
            wrapper_code,
            filename="<filter_expression>",
            mode="exec",
        )
        if byte_code is None:
            raise ValueError("Failed to compile filter expression")
    except SyntaxError as e:
        raise ValueError(f"Invalid filter expression: {e}")

    result = []
    for item in items:
        safe_env = {
            "__builtins__": safe_builtins,
            "_getiter_": guarded_iter_unpack_sequence,
            "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
            "item": item,
            "_result_": False,
        }
        safe_env.update(safe_globals)

        try:
            exec(byte_code, safe_env)
            if safe_env.get("_result_", False):
                result.append(item)
        except Exception:
            # Expression failed for this item -> skip
            continue

    return result
```

**Decision: Use the RestrictedPython approach.** It is simpler, more consistent with the codebase (matches `code_executor.py`), handles complex expressions naturally, and is already battle-tested in the project.

### 1.7 Custom Code Mode: `_filter_custom_code()`

Runs user-provided Python code through RestrictedPython. The code receives `item` and must set `result` to `True` or `False`.

```python
def _filter_custom_code(
    self,
    items: list[Any],
    inputs: dict[str, Any],
) -> list[Any]:
    custom_code = inputs.get("customCode", "").strip()
    if not custom_code:
        raise ValueError("Custom code is required for custom_code filter mode")

    # Compile once, execute per item
    try:
        byte_code = compile_restricted(
            custom_code,
            filename="<filter_custom_code>",
            mode="exec",
        )
        if byte_code is None:
            raise ValueError(
                "Failed to compile custom code (syntax error or restricted operation)"
            )
    except SyntaxError as e:
        raise ValueError(f"Syntax error in custom code: {e}")

    result = []

    # Set timeout for the entire filtering operation
    old_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(self.CUSTOM_CODE_TIMEOUT)

    try:
        for item in items:
            safe_env = {
                "__builtins__": safe_builtins,
                "_getiter_": guarded_iter_unpack_sequence,
                "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
                "item": item,
                "index": items.index(item),  # Avoid: O(n) lookup
                "result": False,  # Default: exclude
            }
            safe_env.update(safe_globals)

            try:
                exec(byte_code, safe_env)
                if safe_env.get("result", False):
                    result.append(item)
            except Exception:
                # Code failed for this item -> skip
                continue
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)

    return result
```

**Performance note on `items.index(item)`:** This is O(n) per item, making the whole loop O(n^2). Instead, use `enumerate`:

```python
    try:
        for idx, item in enumerate(items):
            safe_env = {
                "__builtins__": safe_builtins,
                "_getiter_": guarded_iter_unpack_sequence,
                "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
                "item": item,
                "index": idx,
                "result": False,
            }
            safe_env.update(safe_globals)
            ...
```

### 1.8 Timeout Handler (module-level)

Reuse the pattern from `code_executor.py`:

```python
class _FilterTimeoutException(Exception):
    """Raised when filter code execution exceeds timeout."""
    pass

def _timeout_handler(signum, frame):
    raise _FilterTimeoutException("Filter code execution timed out")
```

---

## Step 2: Node Registry Specification

**File:** `python-backend/app/orchestrator/node_registry.py`

Add the filter node registration in `_register_core_nodes()` under the `PHASE 2.2: Data Manipulation` section, after the existing `code_runner` registration.

### 2.1 Registry Spec

```python
# 7. Filter (Array Filtering)
self.register_node_type(
    NodeTypeSpec(
        type="filter",
        display_name="Filter",
        description="Filter array items based on conditions",
        icon="filter",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="inputArray",
                display_name="Input Array",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Connect array data or enter {{nodeId.output}}...",
            ),
            InputSpec(
                name="filterMode",
                display_name="Filter Mode",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="simple",
                options=[
                    {"label": "Simple (field comparison)", "value": "simple"},
                    {"label": "Expression", "value": "expression"},
                    {"label": "Custom Code (Python)", "value": "custom_code"},
                ],
            ),
            # --- Simple mode fields ---
            InputSpec(
                name="field",
                display_name="Field Path",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="e.g., user.profile.age",
            ),
            InputSpec(
                name="operator",
                display_name="Operator",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="==",
                options=[
                    {"label": "Equals (==)", "value": "=="},
                    {"label": "Not Equals (!=)", "value": "!="},
                    {"label": "Greater Than (>)", "value": ">"},
                    {"label": "Less Than (<)", "value": "<"},
                    {"label": "Greater or Equal (>=)", "value": ">="},
                    {"label": "Less or Equal (<=)", "value": "<="},
                    {"label": "Contains", "value": "contains"},
                    {"label": "Starts With", "value": "startsWith"},
                    {"label": "Ends With", "value": "endsWith"},
                    {"label": "In List", "value": "in"},
                    {"label": "Not In List", "value": "not_in"},
                    {"label": "Exists (not null)", "value": "exists"},
                    {"label": "Not Exists (null)", "value": "not_exists"},
                ],
            ),
            InputSpec(
                name="value",
                display_name="Comparison Value",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Value to compare against...",
            ),
            # --- Expression mode field ---
            InputSpec(
                name="expression",
                display_name="Filter Expression",
                data_type="text",
                ui_type="textarea",
                required=False,
                accepts_connection=False,
                placeholder="item.age > 18 and item.status == 'active'",
            ),
            # --- Custom code mode field ---
            InputSpec(
                name="customCode",
                display_name="Filter Code (Python)",
                data_type="text",
                ui_type="textarea",
                required=False,
                accepts_connection=False,
                placeholder="# 'item' is the current element\n# Set 'result' to True to keep the item\nresult = item.get('score', 0) > 80",
            ),
            # --- Shared options ---
            InputSpec(
                name="nullHandling",
                display_name="Null Value Handling",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="exclude",
                options=[
                    {"label": "Exclude nulls (skip items)", "value": "exclude"},
                    {"label": "Include nulls (keep items)", "value": "include"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="filtered", display_name="Filtered Items", data_type="array"),
            OutputSpec(name="filteredCount", display_name="Filtered Count", data_type="number"),
            OutputSpec(name="originalCount", display_name="Original Count", data_type="number"),
            OutputSpec(name="removedCount", display_name="Removed Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.data_executors.filter_executor.FilterExecutor",
    )
)
```

### 2.2 Conditional Field Visibility (Future Enhancement)

The current `InputSpec` does not support conditional visibility (showing/hiding fields based on another field's value). All fields are rendered regardless of `filterMode`. This is acceptable for the initial implementation because:

1. The DynamicNodeConfig renders all inputs -- fields irrelevant to the current mode are simply left empty.
2. The executor validates required fields per mode (e.g., `field` is only required when `filterMode == "simple"`).
3. Empty/unused fields are ignored at execution time.

**Future enhancement (not in this PR):** Add a `visibility` field to `InputSpec`:

```python
@dataclass
class InputSpec:
    ...
    visibility: dict | None = None  # e.g., {"depends_on": "filterMode", "values": ["simple"]}
```

And update `DynamicNodeConfig.tsx` to conditionally render fields based on this. This is tracked separately.

---

## Step 3: Performance Optimization Strategy

### 3.1 Compile Once, Execute Many

For both `expression` and `custom_code` modes, the code is compiled once via `compile_restricted()` and then `exec()`-ed per item. This avoids recompilation overhead on arrays of 10,000 items.

### 3.2 Short-Circuit on Empty

Empty arrays return immediately without entering any filter logic.

### 3.3 Timeout Protection

- **custom_code mode:** Global `SIGALRM` timeout of 10 seconds for the entire loop.
- **expression mode:** Uses compiled RestrictedPython, inherently bounded.
- **simple mode:** Pure Python comparisons, no timeout needed (O(n) linear scan).

### 3.4 Memory Efficiency

- Results are accumulated in a list (not copying items -- references only).
- No intermediate data structures for the simple filter path.
- `_get_nested_value()` traverses in-place without copying.

### 3.5 Array Size Limit

Hard cap at `MAX_ARRAY_SIZE = 10_000` items. This prevents:
- Memory exhaustion from massive arrays.
- CPU starvation from custom code on huge datasets.
- The limit can be adjusted per deployment via environment variable in a future enhancement.

---

## Step 4: Edge Cases and Error Handling

| Scenario | Behavior |
|----------|----------|
| `inputArray` is not a list | `ValueError("inputArray must be an array, got <type>")` |
| `inputArray` is empty (`[]`) | Return `{"filtered": [], "filteredCount": 0, "originalCount": 0, "removedCount": 0}` |
| `inputArray` exceeds 10,000 items | `ValueError("Array too large (N items, max 10000)")` |
| `filterMode` is invalid | `ValueError("Invalid filterMode: <value>")` |
| `field` is empty in simple mode | `ValueError("Field name is required for simple filter mode")` |
| `operator` is invalid in simple mode | `ValueError("Invalid operator: <value>")` |
| Nested field path not found | `_get_nested_value()` returns `None`, handled by `nullHandling` setting |
| Field value is `None` | If `nullHandling == "exclude"` -> skip. If `"include"` -> keep. |
| Type mismatch in comparison (e.g., string vs int) | `_compare()` attempts coercion, returns `False` on failure |
| Expression syntax error | `ValueError("Invalid filter expression: <details>")` |
| Expression references undefined field | Expression evaluates to error -> item is skipped (treated as non-match) |
| Custom code syntax error | `ValueError("Syntax error in custom code: <details>")` |
| Custom code runtime error (per item) | Item is skipped, processing continues |
| Custom code timeout (total) | `_FilterTimeoutException` raised, executor fails |
| Array of mixed types (dicts and primitives) | `_get_nested_value()` handles gracefully: returns `None` for non-dict items |

---

## Step 5: Test Plan

**File:** `python-backend/tests/test_filter_executor.py`

### 5.1 Test Categories

```python
# ===== Simple Mode Tests =====

class TestFilterSimpleMode:
    """Tests for simple field comparison filtering."""

    async def test_filter_equals(self):
        """Filter items where field equals value."""

    async def test_filter_not_equals(self):
        """Filter items where field does not equal value."""

    async def test_filter_greater_than(self):
        """Filter items where numeric field > value."""

    async def test_filter_less_than(self):
        """Filter items where numeric field < value."""

    async def test_filter_greater_equal(self):
        """Filter items where numeric field >= value."""

    async def test_filter_less_equal(self):
        """Filter items where numeric field <= value."""

    async def test_filter_contains(self):
        """Filter items where string field contains substring."""

    async def test_filter_starts_with(self):
        """Filter items where string field starts with prefix."""

    async def test_filter_ends_with(self):
        """Filter items where string field ends with suffix."""

    async def test_filter_in_list(self):
        """Filter items where field value is in a list of values."""

    async def test_filter_not_in_list(self):
        """Filter items where field value is not in a list."""

    async def test_filter_exists(self):
        """Filter items where field is not null."""

    async def test_filter_not_exists(self):
        """Filter items where field is null/missing."""


class TestFilterNestedPaths:
    """Tests for nested object path access."""

    async def test_nested_dict_path(self):
        """Access nested dict fields: user.profile.age."""

    async def test_nested_list_index(self):
        """Access list by index: items.0.name."""

    async def test_invalid_nested_path(self):
        """Invalid path returns None (item skipped)."""

    async def test_mixed_nesting(self):
        """Mix of dict keys and list indices."""


class TestFilterNullHandling:
    """Tests for null value configuration."""

    async def test_null_exclude_default(self):
        """Default: items with null field value are excluded."""

    async def test_null_include(self):
        """With nullHandling=include: items with null field are kept."""

    async def test_missing_field_treated_as_null(self):
        """Field not present in dict -> treated as null."""


# ===== Expression Mode Tests =====

class TestFilterExpressionMode:
    """Tests for expression-based filtering."""

    async def test_simple_comparison_expression(self):
        """Expression: item.age > 18."""

    async def test_compound_expression_and(self):
        """Expression: item.age > 18 and item.active == True."""

    async def test_compound_expression_or(self):
        """Expression: item.role == 'admin' or item.role == 'superadmin'."""

    async def test_string_expression(self):
        """Expression: 'test' in item.email."""

    async def test_expression_with_brackets(self):
        """Expression wrapped in {{ }}: {{item.age > 18}}."""

    async def test_invalid_expression_syntax(self):
        """Invalid syntax raises ValueError."""

    async def test_expression_too_long(self):
        """Expression exceeding 500 chars raises ValueError."""

    async def test_expression_empty(self):
        """Empty expression raises ValueError."""

    async def test_expression_item_field_error(self):
        """Expression referencing missing field -> item skipped."""


# ===== Custom Code Mode Tests =====

class TestFilterCustomCodeMode:
    """Tests for custom Python code filtering."""

    async def test_simple_custom_code(self):
        """Code: result = item['score'] > 80."""

    async def test_custom_code_with_index(self):
        """Code uses index variable."""

    async def test_custom_code_complex_logic(self):
        """Multi-line code with conditionals."""

    async def test_custom_code_syntax_error(self):
        """Syntax error raises ValueError."""

    async def test_custom_code_runtime_error_per_item(self):
        """Runtime error on one item -> item skipped, others processed."""

    async def test_custom_code_restricted_operations(self):
        """Restricted operations (import os, open file) are blocked."""

    async def test_custom_code_empty(self):
        """Empty code raises ValueError."""

    async def test_custom_code_no_result_set(self):
        """Code that doesn't set result -> default False -> item excluded."""


# ===== Edge Cases & Error Handling =====

class TestFilterEdgeCases:
    """Tests for edge cases and error handling."""

    async def test_empty_array(self):
        """Empty array returns empty result with correct counts."""

    async def test_non_array_input(self):
        """Non-array input raises ValueError."""

    async def test_string_input(self):
        """String input raises ValueError (strings are iterable but not arrays)."""

    async def test_array_too_large(self):
        """Array exceeding MAX_ARRAY_SIZE raises ValueError."""

    async def test_invalid_filter_mode(self):
        """Invalid filterMode raises ValueError."""

    async def test_output_counts_correct(self):
        """Verify filteredCount + removedCount == originalCount."""

    async def test_mixed_type_array(self):
        """Array with mixed types (dicts, strings, numbers)."""

    async def test_filter_preserves_item_order(self):
        """Filtered results maintain original array order."""

    async def test_all_items_match(self):
        """All items pass filter -> filtered == original."""

    async def test_no_items_match(self):
        """No items pass filter -> empty filtered array."""


# ===== Performance Tests =====

class TestFilterPerformance:
    """Performance regression tests."""

    async def test_large_array_simple_mode(self):
        """Filter 10,000 items in simple mode completes in < 1 second."""

    async def test_large_array_expression_mode(self):
        """Filter 10,000 items in expression mode completes in < 5 seconds."""
```

### 5.2 Test Data Fixtures

```python
@pytest.fixture
def sample_users():
    """Sample user data for testing."""
    return [
        {"id": 1, "name": "Alice", "age": 30, "role": "admin", "profile": {"level": 5}},
        {"id": 2, "name": "Bob", "age": 17, "role": "user", "profile": {"level": 2}},
        {"id": 3, "name": "Charlie", "age": 25, "role": "user", "profile": {"level": 3}},
        {"id": 4, "name": "Diana", "age": 45, "role": "admin", "profile": {"level": 8}},
        {"id": 5, "name": "Eve", "age": None, "role": "guest", "profile": None},
    ]

@pytest.fixture
def make_execution_data():
    """Factory for creating NodeExecutionData."""
    def _make(inputs: dict, state: dict | None = None):
        return NodeExecutionData(
            node_id="filter-1",
            node_type="filter",
            config={},
            inputs=inputs,
            state=state or {},
        )
    return _make

@pytest.fixture
def context():
    """Standard execution context."""
    return ExecutionContext(
        user_id=1,
        tenant_id="test",
        workflow_id="wf-1",
        execution_id="exec-1",
    )
```

---

## Step 6: Implementation Checklist

- [ ] **6.1** Create `python-backend/app/orchestrator/node_executors/data_executors/filter_executor.py`
  - [ ] `FilterExecutor` class with `execute()` method
  - [ ] `_filter_simple()` with operator dispatch
  - [ ] `_get_nested_value()` for dot-path traversal
  - [ ] `_compare()` with type coercion
  - [ ] `_numeric_compare()` and `_string_op()` helpers
  - [ ] `_filter_expression()` using RestrictedPython
  - [ ] `_filter_custom_code()` using RestrictedPython with timeout
  - [ ] `_FilterTimeoutException` and `_timeout_handler`
  - [ ] Docstrings and type hints throughout

- [ ] **6.2** Register node in `python-backend/app/orchestrator/node_registry.py`
  - [ ] Add `NodeTypeSpec` with all InputSpecs and OutputSpecs
  - [ ] Place under `PHASE 2.2: Data Manipulation` section
  - [ ] Verify executor dotpath is correct

- [ ] **6.3** Create `python-backend/tests/test_filter_executor.py`
  - [ ] Simple mode tests (all 12 operators)
  - [ ] Nested path tests
  - [ ] Null handling tests
  - [ ] Expression mode tests
  - [ ] Custom code mode tests
  - [ ] Edge case tests
  - [ ] Performance regression tests
  - [ ] All tests pass

- [ ] **6.4** Verification
  - [ ] `pytest tests/test_filter_executor.py` -- all pass
  - [ ] `pytest` -- full suite, no regressions
  - [ ] `black app/ tests/` -- formatting clean
  - [ ] `ruff check app/` -- no lint errors
  - [ ] `mypy app/orchestrator/node_executors/data_executors/filter_executor.py` -- no type errors

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| RestrictedPython bypass in expression/custom_code mode | HIGH | RestrictedPython is already used and trusted in `code_executor.py`. Same sandbox. No new attack surface. |
| SIGALRM not available on Windows | MEDIUM | Production runs on Linux. Add fallback for dev environments (skip timeout or use threading). |
| Performance degradation on large arrays with expression mode | MEDIUM | Compile once, exec many. 10K limit enforced. Expression mode benchmarked. |
| Missing conditional field visibility in UI | LOW | All fields rendered. Unused fields ignored by executor. Clear placeholder text guides the user. |
| Type coercion surprises in comparisons | LOW | Documented behavior. Numeric comparison attempted first, string fallback. `_compare()` returns False on error. |

---

## Dependencies

- **No new Python dependencies.** RestrictedPython is already in `requirements.txt`.
- **No database changes.**
- **No frontend changes.** The UI renders dynamically from the registry.
- **No migration needed.**

---

## Future Enhancements (Out of Scope)

1. **Conditional field visibility** in `InputSpec` + `DynamicNodeConfig.tsx` to hide/show fields based on `filterMode`.
2. **Multiple filter conditions** (AND/OR groups) for simple mode.
3. **"Rejected items" output port** to also capture items that did not match.
4. **Streaming filter** for very large arrays (yield results progressively).
5. **Configurable MAX_ARRAY_SIZE** via environment variable.
6. **`code_editor` ui_type** for `customCode` field instead of `textarea` (for syntax highlighting).
