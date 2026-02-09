# Batch Processor Workflow Node - Implementation Plan

## Problem Statement

The workflow engine needs a **batch processor** node that splits an input array into
groups (batches) using one of three strategies: fixed-size chunking, time-window
grouping (simulated), or field-value grouping. This enables downstream nodes to
process data in manageable chunks, which is essential for rate-limited APIs,
pagination, parallel fan-out, and data partitioning workflows.

## Affected Files

| File | Action | Risk |
|------|--------|------|
| `python-backend/app/orchestrator/node_executors/data_executors/batch_executor.py` | **CREATE** | Low |
| `python-backend/app/orchestrator/node_executors/data_executors/__init__.py` | MODIFY (add export) | Low |
| `python-backend/app/orchestrator/node_registry.py` | MODIFY (add registration) | Low |
| `python-backend/tests/test_batch_executor.py` | **CREATE** | Low |
| `python-backend/tests/test_phase2_nodes.py` | MODIFY (add registry test) | Low |

No database changes. No frontend changes (the frontend dynamically renders from
the registry via `useNodeRegistry`).

---

## Step 1: Create `batch_executor.py`

**File:** `python-backend/app/orchestrator/node_executors/data_executors/batch_executor.py`

### Class: `BatchExecutor`

Follows the same pattern as `FilterExecutor` and `MapExecutor`:
- Implements the `NodeExecutor` protocol (async `execute` method)
- Uses `NodeExecutionData` and `ExecutionContext` from `base.py`
- Returns `dict[str, Any]` with output port values

### Constants

```python
MAX_ARRAY_SIZE = 10_000       # Hard cap on input items (matches Filter/Map)
MIN_BATCH_SIZE = 1            # Minimum batch size
MAX_BATCH_SIZE = 5_000        # Maximum batch size (prevents single-item-per-batch abuse)
MIN_TIME_WINDOW = 0.001       # Minimum time window in seconds
MAX_TIME_WINDOW = 86_400      # Maximum time window (24 hours)
MAX_GROUP_KEYS = 1_000        # Maximum distinct group keys for field_based mode
```

### `execute()` Method Signature

```python
async def execute(
    self,
    data: NodeExecutionData,
    context: ExecutionContext,
) -> dict[str, Any]:
```

### Input Extraction (from `data.inputs`)

| Input Key | Type | Default | Description |
|-----------|------|---------|-------------|
| `inputArray` | list | (required) | Array to batch |
| `batchMode` | str | `"size_based"` | One of: `size_based`, `time_based`, `field_based` |
| `batchSize` | int | `10` | Chunk size (size_based mode) |
| `timeWindow` | float | `60` | Window in seconds (time_based mode) |
| `groupByField` | str | `""` | Dot-notation field path (field_based mode) |
| `includeRemainder` | bool | `True` | Include partial last batch |

### Validation Rules

1. `inputArray` must be a `list` -- raise `ValueError` with type name if not.
2. `len(inputArray)` must be <= `MAX_ARRAY_SIZE` -- raise `ValueError` with counts.
3. `batchMode` must be one of the three valid values -- raise `ValueError`.
4. Mode-specific validation:
   - `size_based`: `batchSize` must be int, `MIN_BATCH_SIZE <= batchSize <= MAX_BATCH_SIZE`.
   - `time_based`: `timeWindow` must be numeric, `MIN_TIME_WINDOW <= timeWindow <= MAX_TIME_WINDOW`.
     Each item must be a dict with a `"timestamp"` key (ISO 8601 string or Unix number).
   - `field_based`: `groupByField` must be a non-empty string.

### Empty Array Fast Path

```python
if len(input_array) == 0:
    return {
        "batches": [],
        "batchCount": 0,
        "itemCount": 0,
    }
```

### Mode Dispatch

```python
if batch_mode == "size_based":
    batches = self._batch_by_size(input_array, batch_size, include_remainder)
elif batch_mode == "time_based":
    batches = self._batch_by_time(input_array, time_window, include_remainder)
elif batch_mode == "field_based":
    batches = self._batch_by_field(input_array, group_by_field)
```

### Return Value

```python
# Count total items across all batches (may differ from input if remainder excluded)
item_count = sum(len(b) for b in batches)

return {
    "batches": batches,
    "batchCount": len(batches),
    "itemCount": item_count,
}
```

---

### Mode 1: `_batch_by_size(items, batch_size, include_remainder) -> list[list]`

Simple chunking using list slicing:

```python
def _batch_by_size(
    self,
    items: list[Any],
    batch_size: int,
    include_remainder: bool,
) -> list[list[Any]]:
    batches = [items[i:i + batch_size] for i in range(0, len(items), batch_size)]

    # If remainder exclusion requested and last batch is partial
    if not include_remainder and batches and len(batches[-1]) < batch_size:
        batches.pop()

    return batches
```

**Complexity:** O(n) time, O(n) space (shallow copies of sublists).

**Examples:**
- `[1,2,3,4,5]`, size=2, remainder=True --> `[[1,2], [3,4], [5]]`
- `[1,2,3,4,5]`, size=2, remainder=False --> `[[1,2], [3,4]]`
- `[1,2,3,4]`, size=2, remainder=True --> `[[1,2], [3,4]]` (no remainder anyway)
- `[1]`, size=5, remainder=True --> `[[1]]`
- `[1]`, size=5, remainder=False --> `[]` (single item is a partial batch)

---

### Mode 2: `_batch_by_time(items, time_window, include_remainder) -> list[list]`

Groups items that fall within the same time window. This is a **simulated**
batching (not real-time streaming) -- the items are expected to have a
`timestamp` field and are sorted, then grouped into windows.

```python
def _batch_by_time(
    self,
    items: list[Any],
    time_window: float,
    include_remainder: bool,
) -> list[list[Any]]:
```

**Algorithm:**

1. Extract timestamp from each item using `_extract_timestamp(item)`.
2. Create `(timestamp_float, item)` pairs.
3. Sort pairs by timestamp (stable sort preserves insertion order for equal timestamps).
4. Walk through sorted items. Start a new batch whenever
   `current_timestamp - window_start_timestamp >= time_window`.
5. If `include_remainder` is False and the last batch's time span is less than
   `time_window`, drop it.

**`_extract_timestamp(item) -> float` helper:**

- If item is a dict and has a `"timestamp"` key:
  - If value is `int` or `float` -- treat as Unix epoch seconds.
  - If value is `str` -- parse with `datetime.fromisoformat()` and convert to
    Unix timestamp. Support both `Z` suffix and `+00:00`.
- Otherwise raise `ValueError("Item at index N missing 'timestamp' field")`.

**Complexity:** O(n log n) due to sorting.

**Example:**
```python
items = [
    {"timestamp": 1000, "data": "a"},
    {"timestamp": 1005, "data": "b"},
    {"timestamp": 1012, "data": "c"},
    {"timestamp": 1018, "data": "d"},
    {"timestamp": 1025, "data": "e"},
]
# time_window=10 -> batches:
# Batch 1: [a(1000), b(1005)] (window 1000-1009)
# Batch 2: [c(1012), d(1018)] (window 1012-1021)
# Batch 3: [e(1025)]          (window 1025-...)
```

---

### Mode 3: `_batch_by_field(items, group_by_field) -> list[list]`

Groups items by the value of a specified field. Uses an `OrderedDict`-style
approach to preserve insertion order of groups.

```python
def _batch_by_field(
    self,
    items: list[Any],
    group_by_field: str,
) -> list[list[Any]]:
```

**Algorithm:**

1. Use a `dict[str, list]` (Python 3.7+ preserves insertion order).
2. For each item, extract the field value using `_get_nested_value(item, group_by_field)`
   (reuses the same dot-notation path extraction logic from FilterExecutor).
3. Convert the field value to a string key (`str(value)`). If value is `None`,
   use the key `"__null__"`.
4. Guard: if `len(groups) > MAX_GROUP_KEYS`, raise `ValueError` to prevent
   memory exhaustion from high-cardinality fields.
5. Return `list(groups.values())` -- each value is a list of items sharing that
   group key.

**Note on `includeRemainder`:** This parameter does not apply to `field_based`
mode since there is no concept of "partial" groups. All items are included.

**Complexity:** O(n) time, O(n) space.

**Example:**
```python
items = [
    {"type": "a", "val": 1},
    {"type": "b", "val": 2},
    {"type": "a", "val": 3},
    {"type": "c", "val": 4},
    {"type": "b", "val": 5},
]
# group_by_field="type" -> batches:
# [[{type:a, val:1}, {type:a, val:3}], [{type:b, val:2}, {type:b, val:5}], [{type:c, val:4}]]
```

---

### Helper: `_get_nested_value(obj, path) -> Any`

Reuse the same pattern from `FilterExecutor._get_nested_value`:
- Split `path` on `"."`.
- Walk through dicts/lists.
- Return `None` for missing paths.

This is duplicated (not shared) intentionally to keep executors self-contained
and independently testable, matching the existing codebase pattern where
`FilterExecutor` and `MapExecutor` each have their own extraction logic.

---

## Step 2: Update `data_executors/__init__.py`

Add the export:

```python
from app.orchestrator.node_executors.data_executors.batch_executor import BatchExecutor

__all__ = ["DatabaseQueryExecutor", "SQLValidator", "BatchExecutor"]
```

---

## Step 3: Register in `node_registry.py`

Add the batch processor registration in the `_register_core_nodes` method,
inside the `PHASE 2.2: Data Manipulation` section (after the filter node
registration at line ~1018).

### Registry Specification

```python
# 10. Batch Processor
self.register_node_type(
    NodeTypeSpec(
        type="batch",
        display_name="Batch Processor",
        description="Split an array into batches by size, time window, or field value",
        icon="layers",
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
                name="batchMode",
                display_name="Batch Mode",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="size_based",
                options=[
                    {"label": "Fixed Size", "value": "size_based"},
                    {"label": "Time Window", "value": "time_based"},
                    {"label": "Group by Field", "value": "field_based"},
                ],
            ),
            InputSpec(
                name="batchSize",
                display_name="Batch Size",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=10,
                validation={"min": 1, "max": 5000},
            ),
            InputSpec(
                name="timeWindow",
                display_name="Time Window (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=60,
                validation={"min": 0.001, "max": 86400},
            ),
            InputSpec(
                name="groupByField",
                display_name="Group By Field",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="type",
            ),
            InputSpec(
                name="includeRemainder",
                display_name="Include Partial Last Batch",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
        ],
        outputs=[
            OutputSpec(
                name="batches",
                display_name="Batches",
                data_type="array",
            ),
            OutputSpec(
                name="batchCount",
                display_name="Batch Count",
                data_type="number",
            ),
            OutputSpec(
                name="itemCount",
                display_name="Total Items Processed",
                data_type="number",
            ),
        ],
        executor="app.orchestrator.node_executors.data_executors.batch_executor.BatchExecutor",
    )
)
```

### Port Type Rationale

- **`inputArray`** (`data_type="array"`, `ui_type="text"`): Matches `map_array`
  node pattern. Uses `text` UI type so users can type `{{nodeId.items}}` expressions.
  `accepts_connection=True` for wiring from upstream nodes.

- **`batchMode`** (`data_type="text"`, `ui_type="select"`): Static dropdown.
  Not connectable -- mode is structural, not data-driven.

- **`batchSize`** (`data_type="number"`, `ui_type="number"`): Only relevant for
  `size_based` mode. Frontend can conditionally show/hide based on `batchMode`
  value via `DynamicNodeConfig`.

- **`timeWindow`** (`data_type="number"`, `ui_type="number"`): Only relevant for
  `time_based` mode.

- **`groupByField`** (`data_type="text"`, `ui_type="text"`): Only relevant for
  `field_based` mode. Dot-notation path like `"user.role"`.

- **`includeRemainder`** (`data_type="boolean"`, `ui_type="toggle"`): Relevant
  for `size_based` and `time_based` modes. Ignored in `field_based` mode.

- **`batches`** output (`data_type="array"`): Array of arrays. Each inner array
  is one batch. Compatible with `loop` node's `data` input (iterate over batches)
  and `map_array` node's `inputArray` input (transform each batch).

- **`batchCount`** output (`data_type="number"`): Total number of batches produced.

- **`itemCount`** output (`data_type="number"`): Total items across all batches.
  May differ from input array length if `includeRemainder=false`.

---

## Step 4: Create Tests

**File:** `python-backend/tests/test_batch_executor.py`

### Test Matrix

#### 4.1 Validation Tests

| Test | Input | Expected |
|------|-------|----------|
| `test_rejects_non_list_input` | `inputArray="not a list"` | `ValueError("inputArray must be an array")` |
| `test_rejects_oversized_array` | `inputArray` with 10,001 items | `ValueError("Array too large")` |
| `test_rejects_invalid_batch_mode` | `batchMode="invalid"` | `ValueError("Invalid batchMode")` |
| `test_rejects_batch_size_too_small` | `batchSize=0` | `ValueError` |
| `test_rejects_batch_size_too_large` | `batchSize=5001` | `ValueError` |
| `test_rejects_negative_time_window` | `timeWindow=-1` | `ValueError` |
| `test_rejects_time_window_too_large` | `timeWindow=100000` | `ValueError` |
| `test_rejects_empty_group_by_field` | `batchMode="field_based"`, `groupByField=""` | `ValueError` |

#### 4.2 Empty Array Tests

| Test | Input | Expected |
|------|-------|----------|
| `test_empty_array_returns_empty` | `inputArray=[]` | `{"batches": [], "batchCount": 0, "itemCount": 0}` |

#### 4.3 Size-Based Mode Tests

| Test | Input | Expected |
|------|-------|----------|
| `test_size_based_even_split` | `[1,2,3,4]`, size=2 | `[[1,2], [3,4]]`, count=4 |
| `test_size_based_with_remainder` | `[1,2,3,4,5]`, size=2 | `[[1,2], [3,4], [5]]`, count=5 |
| `test_size_based_without_remainder` | `[1,2,3,4,5]`, size=2, remainder=False | `[[1,2], [3,4]]`, count=4 |
| `test_size_based_single_batch` | `[1,2,3]`, size=10 | `[[1,2,3]]`, count=3 |
| `test_size_based_single_batch_no_remainder` | `[1,2,3]`, size=10, remainder=False | `[]`, count=0 |
| `test_size_based_size_equals_length` | `[1,2,3]`, size=3 | `[[1,2,3]]`, count=3 |
| `test_size_based_size_one` | `[1,2,3]`, size=1 | `[[1], [2], [3]]`, count=3 |
| `test_size_based_preserves_objects` | `[{a:1}, {a:2}]`, size=1 | `[[{a:1}], [{a:2}]]` |
| `test_size_based_default_batch_size` | `[1..15]`, no batchSize given | Uses default 10 -> 2 batches |

#### 4.4 Time-Based Mode Tests

| Test | Input | Expected |
|------|-------|----------|
| `test_time_based_groups_within_window` | Items at t=0,5,12,18,25; window=10 | 3 batches |
| `test_time_based_all_same_timestamp` | 5 items at t=1000; window=10 | 1 batch with all items |
| `test_time_based_iso_timestamps` | ISO 8601 strings | Correctly parsed and grouped |
| `test_time_based_without_remainder` | Partial last window, remainder=False | Last batch dropped |
| `test_time_based_unsorted_input` | Items in random time order | Sorted then grouped correctly |
| `test_time_based_missing_timestamp` | Item without timestamp field | `ValueError` |
| `test_time_based_single_item` | 1 item | 1 batch |
| `test_time_based_z_suffix_iso` | `"2026-01-01T00:00:00Z"` | Parses correctly |

#### 4.5 Field-Based Mode Tests

| Test | Input | Expected |
|------|-------|----------|
| `test_field_based_groups_by_value` | `[{t:a},{t:b},{t:a}]`, field="t" | 2 batches, grouped |
| `test_field_based_preserves_order` | Groups appear in first-seen order | Verified |
| `test_field_based_nested_field` | `[{u:{role:"admin"}}]`, field="u.role" | Groups by nested value |
| `test_field_based_null_values_grouped` | Items with missing field | Grouped under `__null__` key |
| `test_field_based_single_group` | All same value | 1 batch with all items |
| `test_field_based_all_unique` | All different values | N batches of 1 item each |
| `test_field_based_too_many_groups` | >1000 unique values | `ValueError("Too many groups")` |
| `test_field_based_ignores_include_remainder` | remainder=False | Same result (parameter ignored) |

#### 4.6 Output Structure Tests

| Test | Input | Expected |
|------|-------|----------|
| `test_output_has_all_ports` | Any valid input | Result has `batches`, `batchCount`, `itemCount` keys |
| `test_batch_count_matches_batches_length` | Any valid input | `batchCount == len(batches)` |
| `test_item_count_matches_total_items` | Any valid input | `itemCount == sum(len(b) for b in batches)` |

#### 4.7 Edge Case Tests

| Test | Input | Expected |
|------|-------|----------|
| `test_max_array_size_accepted` | Exactly 10,000 items | Processes without error |
| `test_large_batch_size_performance` | 10,000 items, size=1 | 10,000 batches, completes in <1s |
| `test_mixed_types_in_array` | `[1, "two", {}, []]` | Batched without type errors |

### Test Helpers

Create a helper fixture for building `ExecutionContext` and `NodeExecutionData`:

```python
@pytest.fixture
def make_batch_data():
    def _make(inputs: dict, state: dict | None = None):
        return NodeExecutionData(
            node_id="batch_1",
            node_type="batch",
            config={},
            inputs=inputs,
            state=state or {},
        )
    return _make

@pytest.fixture
def context():
    return ExecutionContext(
        user_id=1,
        tenant_id="test",
        workflow_id="wf_1",
        execution_id="exec_1",
    )
```

---

## Step 5: Update `test_phase2_nodes.py`

Add a registry test for the batch node:

```python
def test_batch_registered(self):
    """Test batch processor node is registered."""
    registry = NodeRegistry.get_instance()
    node_type = registry.get_node_type("batch")

    assert node_type is not None
    assert node_type.display_name == "Batch Processor"
    assert node_type.category == "data"
    assert len(node_type.inputs) == 6  # inputArray, batchMode, batchSize, timeWindow, groupByField, includeRemainder
    assert len(node_type.outputs) == 3  # batches, batchCount, itemCount
    assert node_type.inputs[0].name == "inputArray"
    assert node_type.inputs[1].name == "batchMode"
    assert node_type.outputs[0].name == "batches"
    assert node_type.outputs[1].name == "batchCount"
    assert node_type.outputs[2].name == "itemCount"
```

Also update `test_all_phase2_nodes_in_registry` to include `"batch"` in the
expected type names list.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Memory exhaustion from large arrays | Low | Medium | `MAX_ARRAY_SIZE=10,000` hard cap + `MAX_GROUP_KEYS=1,000` |
| Timestamp parsing failures | Medium | Low | Clear error messages with item index; support both Unix and ISO |
| High-cardinality field grouping | Medium | Medium | `MAX_GROUP_KEYS` guard prevents unbounded dict growth |
| Performance regression on 10K items | Low | Low | All modes are O(n) or O(n log n); no custom code execution |

---

## Verification Steps

After implementation:

1. **Run batch executor tests:**
   ```bash
   cd python-backend && pytest tests/test_batch_executor.py -v
   ```

2. **Run registry tests:**
   ```bash
   cd python-backend && pytest tests/test_phase2_nodes.py -v -k batch
   ```

3. **Run full test suite to verify no regressions:**
   ```bash
   cd python-backend && pytest
   ```

4. **Verify type checking passes:**
   ```bash
   cd python-backend && mypy app/orchestrator/node_executors/data_executors/batch_executor.py
   ```

5. **Verify formatting:**
   ```bash
   cd python-backend && black --check app/orchestrator/node_executors/data_executors/batch_executor.py
   cd python-backend && ruff check app/orchestrator/node_executors/data_executors/batch_executor.py
   ```

6. **Verify the node appears in the registry API:**
   Start the dev server and `GET /api/v1/workflows/node-types` -- the response
   should include a node with `type: "batch"`.

---

## Implementation Order

1. Create `batch_executor.py` with all three modes and validation
2. Update `data_executors/__init__.py` exports
3. Register in `node_registry.py`
4. Create `test_batch_executor.py` with full test matrix
5. Update `test_phase2_nodes.py` with registry tests
6. Run verification steps

---

## Design Decisions

### Why array-of-arrays output (not dict for field_based)?

The `batches` output is always `list[list]` regardless of mode. For `field_based`
mode, the groups dictionary is flattened to a list of lists. This keeps the output
type consistent across modes, allowing downstream nodes (like `loop`) to consume
`batches` uniformly without mode-specific branching.

If users need to know which group key each batch belongs to, they can inspect the
`groupByField` value on the first item of each batch. A future enhancement could
add a `groupKeys` output port, but this is intentionally deferred to keep the
initial implementation focused.

### Why simulated time-based batching?

Real-time streaming with time windows would require maintaining state across
workflow executions, websocket connections, or a persistent buffer -- all of which
are outside the scope of the current synchronous executor model. The simulated
approach sorts items by timestamp and groups them into windows, which covers
the primary use case: processing historical timestamped data in temporal batches
(e.g., "process log entries in 1-hour windows").

### Why duplicate `_get_nested_value` instead of sharing?

The existing codebase duplicates this pattern in `FilterExecutor` and `MapExecutor`
rather than extracting a shared utility. Following this established pattern keeps
executors self-contained, independently testable, and avoids introducing cross-
module dependencies that would complicate future refactoring.

### Why no `inputArray` expression resolution in the executor?

Expression resolution (e.g., `{{previousNode.items}}`) is handled by the
orchestrator *before* the executor is called. The `data.inputs["inputArray"]`
value arriving at the executor is already resolved. This matches the existing
pattern in `FilterExecutor` and `MapExecutor`.
