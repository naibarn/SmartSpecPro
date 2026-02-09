# Map (Array Transformation) Workflow Node - Implementation Plan

## Problem Statement

The workflow engine needs a **Map** node that transforms arrays by applying an operation to each element. This is a fundamental data-processing primitive (analogous to `Array.prototype.map()` in JavaScript or `map()` in Python) that enables users to extract fields, apply expressions, or run custom code across every item in an array.

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/orchestrator/node_executors/data_executors/map_executor.py` | **CREATE** | Core executor implementation |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `map_array` node type spec |
| `python-backend/tests/test_map_executor.py` | **CREATE** | Unit tests for all modes and edge cases |

No database schema changes required. No frontend changes required (the frontend dynamically renders node UIs from the registry spec via `useNodeRegistry`).

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| RestrictedPython escape | HIGH | Reuse exact sandbox pattern from `CodeExecutor`; no file/network access; timeout enforced |
| Performance on large arrays | MEDIUM | Hard cap at 10,000 items; fail fast with clear error |
| Expression injection | MEDIUM | Only allow safe `ExpressionResolver` patterns for `transform` mode; no `eval()` |
| Breaking existing nodes | LOW | Purely additive change; new file + new registry entry |

---

## 1. Registry Specification (`node_registry.py`)

Add a new `map_array` node type in the **PHASE 2.2: Data Manipulation** section, after the existing `code_runner` entry.

### Node Type Spec

```python
# Map Array Node
self.register_node_type(
    NodeTypeSpec(
        type="map_array",
        display_name="Map Array",
        description="Transform each item in an array using field extraction, expressions, or custom code",
        icon="list",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="inputArray",
                display_name="Input Array",
                data_type="array",
                ui_type="text",
                required=True,
                accepts_connection=True,
                placeholder="{{previousNode.items}}",
            ),
            InputSpec(
                name="mapMode",
                display_name="Map Mode",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="extract",
                options=[
                    {"label": "Extract Field", "value": "extract"},
                    {"label": "Transform Expression", "value": "transform"},
                    {"label": "Custom Code", "value": "custom_code"},
                ],
            ),
            InputSpec(
                name="field",
                display_name="Field Path",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="user.name",
            ),
            InputSpec(
                name="expression",
                display_name="Transform Expression",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="{{item.price * 1.1}}",
            ),
            InputSpec(
                name="customCode",
                display_name="Custom Code",
                data_type="text",
                ui_type="textarea",
                required=False,
                accepts_connection=False,
                placeholder="# 'item' and 'index' are available\nresult = item['price'] * 1.1",
            ),
            InputSpec(
                name="outputField",
                display_name="Output Field Name",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="transformedPrice",
            ),
        ],
        outputs=[
            OutputSpec(name="mapped", display_name="Mapped Items", data_type="array"),
            OutputSpec(name="mappedCount", display_name="Mapped Count", data_type="number"),
            OutputSpec(name="errors", display_name="Errors", data_type="array"),
        ],
        executor="app.orchestrator.node_executors.data_executors.map_executor.MapExecutor",
    )
)
```

### Design Decisions

- **`type="map_array"`** rather than `"map"` to avoid collision with Python's builtin `map` in search/autocomplete.
- **`icon="list"`** uses the Lucide `list` icon (data transformation of lists).
- **`category="data"`** groups it alongside `set_variable`, `merge_data`, and `code_runner`.
- **`inputArray` uses `ui_type="text"`** rather than `json_editor` because users will typically connect this via `{{expression}}` from an upstream node, not type raw JSON.
- **`field` and `expression` and `customCode`** are all `required=False` because only one is needed depending on `mapMode`. Validation happens at runtime in the executor.

---

## 2. Executor Implementation (`map_executor.py`)

### File Location

```
python-backend/app/orchestrator/node_executors/data_executors/map_executor.py
```

### Class Structure

```python
"""Map Array Executor - Transform each item in an array."""
import io
import signal
from contextlib import redirect_stdout
from typing import Any

from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Guards import guarded_iter_unpack_sequence, safe_builtins

from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class MapExecutor:
    """Executor for map_array nodes."""

    MAX_ARRAY_SIZE = 10_000
    CUSTOM_CODE_TIMEOUT = 5  # seconds per-item timeout (overall bounded by array limit)

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        ...

    def _extract_field(self, item: Any, field_path: str) -> Any:
        ...

    def _transform_expression(
        self,
        item: Any,
        index: int,
        expression: str,
        state: dict[str, Any],
    ) -> Any:
        ...

    def _execute_custom_code(
        self,
        item: Any,
        index: int,
        code: str,
    ) -> Any:
        ...

    def _wrap_output(self, value: Any, output_field: str | None) -> Any:
        ...
```

### 2.1 Main `execute()` Method

```python
async def execute(
    self,
    data: NodeExecutionData,
    context: ExecutionContext,
) -> dict[str, Any]:
    input_array = data.inputs.get("inputArray")
    map_mode = data.inputs.get("mapMode", "extract")
    field = data.inputs.get("field", "")
    expression = data.inputs.get("expression", "")
    custom_code = data.inputs.get("customCode", "")
    output_field = data.inputs.get("outputField") or None

    # --- Validation ---
    if not isinstance(input_array, list):
        raise ValueError(
            f"inputArray must be an array, got {type(input_array).__name__}"
        )

    if len(input_array) > self.MAX_ARRAY_SIZE:
        raise ValueError(
            f"Array exceeds maximum size of {self.MAX_ARRAY_SIZE} items "
            f"(got {len(input_array)})"
        )

    if map_mode not in ("extract", "transform", "custom_code"):
        raise ValueError(f"Invalid mapMode: {map_mode}")

    # Mode-specific validation
    if map_mode == "extract" and not field:
        raise ValueError("Field path is required for 'extract' mode")
    if map_mode == "transform" and not expression:
        raise ValueError("Expression is required for 'transform' mode")
    if map_mode == "custom_code" and not custom_code.strip():
        raise ValueError("Custom code is required for 'custom_code' mode")

    # --- Empty array fast path ---
    if len(input_array) == 0:
        return {"mapped": [], "mappedCount": 0, "errors": []}

    # --- Process items ---
    mapped = []
    errors = []

    for index, item in enumerate(input_array):
        try:
            if map_mode == "extract":
                value = self._extract_field(item, field)
            elif map_mode == "transform":
                value = self._transform_expression(
                    item, index, expression, data.state
                )
            else:  # custom_code
                value = self._execute_custom_code(item, index, custom_code)

            # Optionally wrap result in an object
            mapped.append(self._wrap_output(value, output_field))

        except Exception as e:
            errors.append({
                "index": index,
                "item": item,
                "error": str(e),
            })

    return {
        "mapped": mapped,
        "mappedCount": len(mapped),
        "errors": errors,
    }
```

**Key behaviors:**
- Non-array input raises `ValueError` immediately (not a partial failure).
- Array size exceeding 10,000 raises `ValueError` immediately.
- Per-item failures are captured in the `errors` array; processing continues for remaining items.
- Empty array returns immediately with empty results (no error).
- Array order is preserved: `mapped[i]` corresponds to `input_array[i]` (minus items that errored).

### 2.2 Extract Field Mode

Extracts a value from each item using dot-notation path traversal (e.g., `"user.address.city"`).

```python
def _extract_field(self, item: Any, field_path: str) -> Any:
    """
    Extract a nested field from an item using dot-notation.

    Args:
        item: The source item (dict expected)
        field_path: Dot-separated path like "user.name" or "address.city"

    Returns:
        The extracted value, or None if the path doesn't exist

    Raises:
        ValueError: If item is not a dict and field path requires dict access
    """
    parts = field_path.split(".")

    value = item
    for part in parts:
        if isinstance(value, dict):
            if part not in value:
                return None  # Missing field returns None
            value = value[part]
        elif isinstance(value, list) and part.isdigit():
            # Support numeric index into arrays: "items.0.name"
            idx = int(part)
            if idx < 0 or idx >= len(value):
                return None
            value = value[idx]
        else:
            raise ValueError(
                f"Cannot access field '{part}' on {type(value).__name__}"
            )

    return value
```

**Design decisions:**
- Missing keys return `None` rather than raising (user can filter nulls downstream).
- Numeric path segments are treated as array indices (e.g., `"items.0.name"` accesses the first element's name).
- Non-dict/non-list intermediates raise `ValueError` (caught by the per-item error handler in `execute()`).

### 2.3 Transform Expression Mode

Applies a `{{...}}` expression to each item. The expression has access to `item` (current element) and `index` (position) within the expression resolver's state.

```python
def _transform_expression(
    self,
    item: Any,
    index: int,
    expression: str,
    state: dict[str, Any],
) -> Any:
    """
    Apply an expression template to an item.

    The expression can reference:
      - {{item.fieldName}} - current item's fields
      - {{index}} - current array index
      - {{nodeId.output}} - upstream node outputs (via state)

    Args:
        item: Current array item
        index: Current array index
        expression: Expression template string
        state: Workflow execution state

    Returns:
        Resolved expression value
    """
    resolver = ExpressionResolver()

    # Create a temporary state that includes item and index
    item_state = dict(state)  # shallow copy
    item_state["item"] = item
    item_state["index"] = index

    resolved = resolver.resolve(expression, item_state)

    # Attempt numeric conversion if the result looks numeric
    if isinstance(resolved, str):
        try:
            if "." in resolved:
                return float(resolved)
            return int(resolved)
        except (ValueError, TypeError):
            pass

    return resolved
```

**Important limitation:** The current `ExpressionResolver` only supports simple variable path resolution (`{{item.price}}`), not arithmetic (`{{item.price * 1.1}}`). The `SAFE_EXPR_PATTERN` regex in `ExpressionResolver` only allows `[a-zA-Z0-9_\-\.]`, which excludes `*`, `+`, spaces.

**Plan for arithmetic expressions:** We need to extend `ExpressionResolver` with a `resolve_value()` method (or add a secondary resolver) that can evaluate simple arithmetic on resolved values. Two approaches:

- **Option A (recommended, minimal change):** Add a `resolve_to_value()` method on `ExpressionResolver` that resolves `{{item.price}}` to its raw value (not stringified), then use `ast.literal_eval` or a simple arithmetic evaluator for the surrounding expression. For the initial implementation, document that `transform` mode currently supports only field reference expressions (same as `ExpressionResolver`), and users should use `custom_code` mode for arithmetic.

- **Option B (deferred):** Build a safe expression evaluator using Python's `ast` module that supports `+`, `-`, `*`, `/`, `%`, comparisons, and string operations. This would be a separate PR.

**For this implementation, we use Option A:** The `transform` mode resolves `{{...}}` expressions to their raw values. For arithmetic transformations, users should use `custom_code` mode. This keeps the initial implementation simple and safe.

### 2.4 Custom Code Mode

Executes user-provided Python code in a RestrictedPython sandbox, reusing the exact pattern from `CodeExecutor`.

```python
def _execute_custom_code(
    self,
    item: Any,
    index: int,
    code: str,
) -> Any:
    """
    Execute custom Python code for each item in a RestrictedPython sandbox.

    Available variables in the sandbox:
      - item: The current array element
      - index: The current array index (0-based)
      - result: Set this to the transformed value

    Args:
        item: Current array item
        index: Current array index
        code: Python code to execute

    Returns:
        The value of 'result' after code execution

    Raises:
        ValueError: If code fails to compile or execute
    """
    try:
        byte_code = compile_restricted(
            code,
            filename="<map_transform>",
            mode="exec",
        )
        if byte_code is None:
            raise ValueError("Failed to compile code")
    except SyntaxError as e:
        raise ValueError(f"Syntax error in custom code: {e}")

    safe_env = {
        "__builtins__": safe_builtins,
        "_getiter_": guarded_iter_unpack_sequence,
        "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
        "item": item,
        "index": index,
        "result": None,
    }
    safe_env.update(safe_globals)

    # Capture stdout (discard it for map; we only care about result)
    stdout_capture = io.StringIO()

    try:
        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(self.CUSTOM_CODE_TIMEOUT)

        with redirect_stdout(stdout_capture):
            exec(byte_code, safe_env)

        signal.alarm(0)
    except _TimeoutException:
        signal.alarm(0)
        raise ValueError(
            f"Custom code timed out at index {index} "
            f"(limit: {self.CUSTOM_CODE_TIMEOUT}s)"
        )
    except Exception as e:
        signal.alarm(0)
        raise ValueError(f"Custom code execution failed at index {index}: {e}")

    return safe_env.get("result")
```

**Timeout handling:** The `CUSTOM_CODE_TIMEOUT` is 5 seconds **per item**, which is generous. With a max array size of 10,000, the theoretical worst-case is 50,000 seconds, but in practice:
- The RestrictedPython sandbox prevents I/O, network, and file operations.
- Infinite loops are the main risk, and the 5-second alarm catches those.
- Realistic code runs in microseconds per item.

**Note on `signal.SIGALRM`:** This approach (from the existing `CodeExecutor`) works on Linux but not Windows. Since the production environment is Linux (see project env), this is acceptable.

**Code compilation optimization:** The `compile_restricted` call happens once in `execute()` before the loop, and the compiled bytecode is reused for each item. This is an important optimization over compiling inside the per-item loop.

**Optimized version (compile once):**

```python
# In execute(), before the loop:
if map_mode == "custom_code":
    try:
        compiled_code = compile_restricted(
            custom_code.strip(),
            filename="<map_transform>",
            mode="exec",
        )
        if compiled_code is None:
            raise ValueError(
                "Failed to compile custom code (syntax error or restricted operation)"
            )
    except SyntaxError as e:
        raise ValueError(f"Syntax error in custom code: {e}")
else:
    compiled_code = None

# Then in the loop:
value = self._execute_custom_code_compiled(item, index, compiled_code)
```

The `_execute_custom_code` method then becomes `_execute_custom_code_compiled` which accepts pre-compiled bytecode instead of source string. This avoids recompiling on every iteration.

### 2.5 Output Field Wrapping

```python
def _wrap_output(self, value: Any, output_field: str | None) -> Any:
    """
    Optionally wrap a value in a dict with a named field.

    If output_field is provided: {"output_field": value}
    If output_field is None: value (passed through)

    Args:
        value: The transformed value
        output_field: Optional field name to wrap the value in

    Returns:
        Wrapped or unwrapped value
    """
    if output_field:
        return {output_field: value}
    return value
```

---

## 3. Error Collection Strategy

The map node uses a **partial failure** model. Individual item failures do not abort the entire operation. Instead:

### Error Object Shape

```python
{
    "index": 3,           # Position in original array
    "item": {...},        # The original item that failed
    "error": "Cannot access field 'name' on int"  # Error message
}
```

### Downstream Consumption

Users can connect the `errors` output port to:
- A **Conditional Branch** node to check `{{mapNode.errors.length > 0}}` and handle failures.
- A **Workflow Response** node to include errors in the final output.
- A **Set Variable** node to store errors for later processing.

### What constitutes an error vs. a hard failure

| Scenario | Behavior |
|----------|----------|
| Non-array input | **Hard failure** - `ValueError` raised, node fails |
| Array exceeds 10,000 items | **Hard failure** - `ValueError` raised, node fails |
| Invalid `mapMode` value | **Hard failure** - `ValueError` raised, node fails |
| Missing required config (field/expression/code) | **Hard failure** - `ValueError` raised, node fails |
| Custom code syntax error | **Hard failure** - code won't compile for any item |
| Individual item: missing field in extract mode | **Soft** - `None` returned (NOT an error) |
| Individual item: type mismatch during extract | **Soft failure** - added to `errors[]`, item skipped |
| Individual item: expression resolution fails | **Soft failure** - added to `errors[]`, item skipped |
| Individual item: custom code runtime error | **Soft failure** - added to `errors[]`, item skipped |
| Individual item: custom code timeout | **Soft failure** - added to `errors[]`, item skipped |

---

## 4. RestrictedPython Integration Details

### Reuse from `CodeExecutor`

The custom_code mode reuses the identical sandbox setup from `code_executor.py`:

```python
safe_env = {
    "__builtins__": safe_builtins,
    "_getiter_": guarded_iter_unpack_sequence,
    "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
    "item": item,        # Current array element
    "index": index,      # Current position
    "result": None,      # User sets this to return value
}
safe_env.update(safe_globals)
```

### What users CAN do in custom code

- Access `item` (dict, list, str, number, etc.)
- Access `index` (int, 0-based)
- Use Python builtins: `len()`, `str()`, `int()`, `float()`, `bool()`, `list()`, `dict()`, `tuple()`, `set()`
- Use string methods: `item["name"].upper()`, `.split()`, `.strip()`, etc.
- Use math operations: `+`, `-`, `*`, `/`, `//`, `%`, `**`
- Use comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Use conditionals: `if`/`else`/`elif`
- Use list comprehensions: `[x for x in item["tags"]]`
- Use dict comprehensions: `{k: v for k, v in item.items()}`
- Set `result = <value>` to define the output

### What users CANNOT do (RestrictedPython blocks)

- File I/O: `open()`, `os.*`, `pathlib.*`
- Network: `socket.*`, `urllib.*`, `requests.*`
- Process: `subprocess.*`, `os.system()`
- Import: `import` and `__import__` are blocked
- Attribute access on restricted objects: `__class__`, `__dict__`, `__globals__`
- `exec()`, `eval()`, `compile()` inside the sandbox

### Timeout strategy

- **Per-item timeout:** 5 seconds via `signal.SIGALRM`
- **Why per-item:** A single bad item (infinite loop) should not block all subsequent items. The per-item alarm ensures progress.
- **Overall wall-clock:** With 10,000 items and well-behaved code, the total time is dominated by the Python execution speed. Typical transformations take microseconds per item. The 5-second alarm is only a safety net.

---

## 5. Transformation Examples for Testing

### Test Case 1: Extract Mode - Simple Field

```python
# Input
input_array = [
    {"id": 1, "name": "Alice", "age": 30},
    {"id": 2, "name": "Bob", "age": 25},
    {"id": 3, "name": "Charlie", "age": 35},
]
config = {"mapMode": "extract", "field": "name"}

# Expected Output
{
    "mapped": ["Alice", "Bob", "Charlie"],
    "mappedCount": 3,
    "errors": [],
}
```

### Test Case 2: Extract Mode - Nested Field

```python
# Input
input_array = [
    {"id": 1, "user": {"name": "Alice", "address": {"city": "NYC"}}},
    {"id": 2, "user": {"name": "Bob", "address": {"city": "LA"}}},
]
config = {"mapMode": "extract", "field": "user.address.city"}

# Expected Output
{
    "mapped": ["NYC", "LA"],
    "mappedCount": 2,
    "errors": [],
}
```

### Test Case 3: Extract Mode - Missing Field Returns None

```python
# Input
input_array = [
    {"id": 1, "name": "Alice"},
    {"id": 2},  # no "name" field
    {"id": 3, "name": "Charlie"},
]
config = {"mapMode": "extract", "field": "name"}

# Expected Output
{
    "mapped": ["Alice", None, "Charlie"],
    "mappedCount": 3,
    "errors": [],
}
```

### Test Case 4: Extract Mode - Array Index Access

```python
# Input
input_array = [
    {"tags": ["python", "fastapi", "async"]},
    {"tags": ["js", "react"]},
]
config = {"mapMode": "extract", "field": "tags.0"}

# Expected Output
{
    "mapped": ["python", "js"],
    "mappedCount": 2,
    "errors": [],
}
```

### Test Case 5: Transform Mode - Field Reference

```python
# Input
input_array = [
    {"product": "Widget", "price": 100},
    {"product": "Gadget", "price": 200},
]
config = {"mapMode": "transform", "expression": "{{item.product}}"}

# Expected Output
{
    "mapped": ["Widget", "Gadget"],
    "mappedCount": 2,
    "errors": [],
}
```

### Test Case 6: Custom Code - Price Calculation

```python
# Input
input_array = [
    {"product": "Widget", "price": 100, "quantity": 3},
    {"product": "Gadget", "price": 200, "quantity": 1},
]
config = {
    "mapMode": "custom_code",
    "customCode": "result = {'product': item['product'], 'total': item['price'] * item['quantity']}",
}

# Expected Output
{
    "mapped": [
        {"product": "Widget", "total": 300},
        {"product": "Gadget", "total": 200},
    ],
    "mappedCount": 2,
    "errors": [],
}
```

### Test Case 7: Custom Code with Output Field Wrapping

```python
# Input
input_array = [10, 20, 30]
config = {
    "mapMode": "custom_code",
    "customCode": "result = item * 2",
    "outputField": "doubled",
}

# Expected Output
{
    "mapped": [
        {"doubled": 20},
        {"doubled": 40},
        {"doubled": 60},
    ],
    "mappedCount": 3,
    "errors": [],
}
```

### Test Case 8: Empty Array

```python
# Input
input_array = []
config = {"mapMode": "extract", "field": "name"}

# Expected Output
{
    "mapped": [],
    "mappedCount": 0,
    "errors": [],
}
```

### Test Case 9: Non-Array Input (Hard Failure)

```python
# Input
input_array = "not an array"
config = {"mapMode": "extract", "field": "name"}

# Expected: ValueError("inputArray must be an array, got str")
```

### Test Case 10: Partial Failure with Error Collection

```python
# Input
input_array = [
    {"id": 1, "value": 10},
    "not_a_dict",  # will fail field extraction
    {"id": 3, "value": 30},
]
config = {"mapMode": "extract", "field": "value"}

# Expected Output
{
    "mapped": [10, 30],
    "mappedCount": 2,
    "errors": [
        {
            "index": 1,
            "item": "not_a_dict",
            "error": "Cannot access field 'value' on str",
        }
    ],
}
```

### Test Case 11: Array Size Limit (Hard Failure)

```python
# Input
input_array = list(range(10_001))
config = {"mapMode": "extract", "field": "name"}

# Expected: ValueError("Array exceeds maximum size of 10000 items (got 10001)")
```

### Test Case 12: Custom Code Timeout

```python
# Input
input_array = [1]
config = {
    "mapMode": "custom_code",
    "customCode": "while True: pass",  # infinite loop
}

# Expected Output
{
    "mapped": [],
    "mappedCount": 0,
    "errors": [
        {
            "index": 0,
            "item": 1,
            "error": "Custom code timed out at index 0 (limit: 5s)",
        }
    ],
}
```

### Test Case 13: Custom Code Syntax Error (Hard Failure)

```python
# Input
input_array = [1, 2, 3]
config = {
    "mapMode": "custom_code",
    "customCode": "result = (",  # syntax error
}

# Expected: ValueError("Syntax error in custom code: ...")
```

### Test Case 14: Invalid Map Mode (Hard Failure)

```python
# Input
input_array = [1, 2, 3]
config = {"mapMode": "invalid_mode"}

# Expected: ValueError("Invalid mapMode: invalid_mode")
```

### Test Case 15: Extract Mode - Missing Required Field Config

```python
# Input
input_array = [{"a": 1}]
config = {"mapMode": "extract", "field": ""}

# Expected: ValueError("Field path is required for 'extract' mode")
```

---

## 6. Implementation Steps (Ordered)

### Step 1: Create `map_executor.py`

Create the file at `python-backend/app/orchestrator/node_executors/data_executors/map_executor.py` with:
- `MapExecutor` class implementing `execute()`, `_extract_field()`, `_transform_expression()`, `_execute_custom_code_compiled()`, and `_wrap_output()`.
- Module-level `_TimeoutException` class and `_timeout_handler` function (reusing the pattern from `code_executor.py`).
- Compile-once optimization: compile RestrictedPython bytecode before the loop, pass compiled code to per-item executor.

### Step 2: Register in `node_registry.py`

Add the `map_array` NodeTypeSpec in `_register_core_nodes()`, in the **PHASE 2.2: Data Manipulation** section after `code_runner` (line ~707).

### Step 3: Write tests

Create `python-backend/tests/test_map_executor.py` with the 15 test cases above, organized into test classes:
- `TestMapExtractMode` (cases 1-4)
- `TestMapTransformMode` (case 5)
- `TestMapCustomCodeMode` (cases 6, 7, 12, 13)
- `TestMapEdgeCases` (cases 8, 9, 10, 11, 14, 15)

### Step 4: Run tests and verify

```bash
cd python-backend
pytest tests/test_map_executor.py -v
```

### Step 5: Run full test suite

```bash
cd python-backend
pytest
```

---

## 7. Future Enhancements (Out of Scope for This PR)

1. **Safe arithmetic expression evaluator** for `transform` mode (using `ast.parse` with whitelisted node types).
2. **Parallel execution** for `custom_code` mode using `asyncio.gather` with chunked batches.
3. **Progress reporting** via SSE for large arrays (emit progress events at 10% intervals).
4. **`flatMap` mode** that flattens arrays-of-arrays after transformation.
5. **`filter` integration** that combines map+filter in a single node to avoid chaining.
6. **Frontend conditional field visibility** (show `field` input only when mode is `extract`, etc.) - requires frontend UI enhancement to `DynamicNodeConfig.tsx`.

---

## Verification Checklist

- [ ] `MapExecutor` class follows `NodeExecutor` protocol (same signature as `SetExecutor`, `MergeExecutor`)
- [ ] All three modes (extract, transform, custom_code) work independently
- [ ] Dot-notation nested field extraction handles arbitrary depth
- [ ] Numeric array index access works in field paths
- [ ] Missing fields return `None` (not error) in extract mode
- [ ] Non-array input raises `ValueError` immediately
- [ ] Array size > 10,000 raises `ValueError` immediately
- [ ] Per-item errors are collected in `errors[]` output
- [ ] Failed items do not appear in `mapped[]` output
- [ ] Array order is preserved in output
- [ ] `outputField` wrapping is optional and works correctly
- [ ] RestrictedPython sandbox prevents file/network/process access
- [ ] Per-item timeout (5s) catches infinite loops
- [ ] Code is compiled once before the loop (not per-item)
- [ ] Custom code syntax errors are hard failures (before loop)
- [ ] Empty array returns `{"mapped": [], "mappedCount": 0, "errors": []}`
- [ ] Node is registered in `NodeRegistry` with correct spec
- [ ] All 15 test cases pass
- [ ] Full `pytest` suite passes without regressions
- [ ] Code formatted with `black` (100 char line length)
- [ ] Code passes `ruff` linting
