# Transformer Workflow Node Executor - Implementation Plan

## Problem Statement

The workflow engine needs a **Transformer** node that converts data between formats (JSON, CSV, XML) and reshapes nested structures (flatten/unflatten). This is a "data" category node that sits alongside existing data executors (filter, merge, map, set_variable, code_runner, database_query) in the `data_executors/` directory.

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/orchestrator/node_executors/data_executors/transformer_executor.py` | **CREATE** | Executor class with all 6 transformation types |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `transformer` node type spec |
| `python-backend/app/orchestrator/node_executors/data_executors/__init__.py` | **MODIFY** | Export `TransformerExecutor` |
| `python-backend/requirements.txt` | **MODIFY** | Add `xmltodict>=0.13.0` dependency |
| `python-backend/tests/test_transformer_executor.py` | **CREATE** | Comprehensive test suite |

**No frontend changes required.** The frontend fetches node types from the backend registry via `GET /api/v1/workflows/node-types` and renders them dynamically. The `useNodeRegistry` hook and `DynamicNodeConfig` component already handle arbitrary node specs. The `data` category is already present in the frontend category type union.

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Malformed input causing crash | Medium | Input validation + size cap at 10 MB |
| XML parsing XXE vulnerability | HIGH | Use `defusedxml` or disable external entities in ElementTree |
| Memory exhaustion on large payloads | Medium | 10 MB hard limit before parsing begins |
| Breaking existing registry | Low | Additive-only change (new node type registration) |
| Circular reference in flatten/unflatten | Low | Max depth limit (20 levels) |

## Dependencies

### Python stdlib (no install needed)
- `csv` -- CSV reading/writing via `csv.DictReader`, `csv.DictWriter`
- `io.StringIO` -- In-memory string streams for csv module
- `json` -- JSON validation (already used throughout)
- `sys` -- `sys.getsizeof` for rough size checks

### New dependency
- `xmltodict>=0.13.0` -- Bidirectional JSON/XML conversion (simpler than raw ElementTree for dict-like structures, well-maintained, 1.5k stars)
- `defusedxml>=0.7.1` -- Safe XML parsing (prevents XXE, billion laughs, entity expansion attacks)

### Why xmltodict over raw ElementTree

ElementTree requires manual recursive dict-to-XML construction and loses natural dict ordering. `xmltodict` provides `parse()` (XML->dict) and `unparse()` (dict->XML) with correct attribute handling, namespace support, and force-list control. It is the de facto standard for JSON/XML conversion in Python and is already used by boto3 (which is in `requirements.txt`).

## Detailed Design

### 1. Registry Spec (node_registry.py)

```python
NodeTypeSpec(
    type="transformer",
    display_name="Transformer",
    description="Convert data between formats (JSON, CSV, XML) and reshape structures (flatten/unflatten)",
    icon="repeat-2",
    color="orange",
    category="data",
    inputs=[...],  # See below
    outputs=[...],
    executor="app.orchestrator.node_executors.data_executors.transformer_executor.TransformerExecutor",
)
```

#### Input Specs

| Name | Display Name | data_type | ui_type | required | accepts_connection | default | Notes |
|------|-------------|-----------|---------|----------|--------------------|---------|-------|
| `transformationType` | Transformation Type | text | select | True | False | `json_to_csv` | Options: json_to_csv, csv_to_json, json_to_xml, xml_to_json, flatten, unflatten |
| `input` | Input Data | any | json_editor | True | True | -- | Source data (string or parsed object) |
| `csvDelimiter` | CSV Delimiter | text | text | False | False | `,` | Delimiter for CSV operations. Validation: max_length 1 |
| `csvHeaders` | Include Headers | boolean | toggle | False | False | `True` | Include header row in CSV output / expect headers in CSV input |
| `xmlRootElement` | XML Root Element | text | text | False | False | `root` | Root element name for JSON-to-XML conversion |
| `xmlAttrPrefix` | XML Attribute Prefix | text | text | False | False | `@` | Prefix for XML attributes in JSON representation |
| `flattenSeparator` | Flatten Separator | text | text | False | False | `.` | Separator for flattened key paths |
| `flattenMaxDepth` | Max Flatten Depth | number | number | False | False | `20` | Maximum nesting depth for flatten (safety limit). Validation: min 1, max 100 |

#### Output Specs

| Name | Display Name | data_type |
|------|-------------|-----------|
| `output` | Transformed Data | any |
| `outputType` | Output Format | text |
| `recordCount` | Record Count | number |

The `recordCount` output provides the number of records/rows/items processed (useful for logging and downstream decisions). It maps naturally to CSV row count, JSON array length, or XML child count.

### 2. Executor Class Structure

```
TransformerExecutor
    execute(data, context) -> dict[str, Any]
    _validate_input_size(input_data) -> None
    _resolve_input(raw_input) -> str | dict | list
    _json_to_csv(data, delimiter, include_headers) -> str
    _csv_to_json(csv_string, delimiter, has_headers) -> list[dict]
    _json_to_xml(data, root_element, attr_prefix) -> str
    _xml_to_json(xml_string, attr_prefix) -> dict
    _flatten(data, separator, max_depth) -> dict
    _unflatten(data, separator) -> dict
```

### 3. Transformation Specifications

#### 3.1 json_to_csv

**Input**: JSON array of objects (list[dict]) or a single dict (treated as 1-row array).
**Output**: CSV string.
**Behavior**:
- Extract headers from union of all keys across all rows (preserves order of first occurrence).
- Write header row if `csvHeaders=True`.
- Handle nested values by JSON-serializing them (e.g., `{"a": {"b": 1}}` -> cell contains `{"b": 1}`).
- Use `csv.DictWriter` with `extrasaction='ignore'` and `restval=''`.
- Delimiter from `csvDelimiter`.

**Edge cases**:
- Empty array -> empty string (or headers only if `csvHeaders=True`).
- Single dict input -> wrap in list, treat as 1-row.
- Non-dict items in array -> raise `ValueError` with clear message.

#### 3.2 csv_to_json

**Input**: CSV string.
**Output**: List of dicts.
**Behavior**:
- If `csvHeaders=True`, first row is treated as header row (field names). Uses `csv.DictReader`.
- If `csvHeaders=False`, generate numeric keys (`"0"`, `"1"`, ...). Uses `csv.reader` and builds dicts manually.
- Delimiter from `csvDelimiter`.
- Auto-detect numeric values: attempt `int()` then `float()` conversion on each cell.
- Empty cells -> `None`.
- Preserve original string for values that don't convert cleanly.

**Edge cases**:
- Empty string -> empty list.
- Single row (no data, only headers) -> empty list.
- Inconsistent column counts -> `csv.DictReader` handles gracefully with `restval=None`.

#### 3.3 json_to_xml

**Input**: Dict (JSON object).
**Output**: XML string.
**Behavior**:
- Use `xmltodict.unparse()` with `root_element` as the root tag.
- Input dict is wrapped as `{root_element: input_dict}` before unparsing.
- If input is a list, wrap as `{root_element: {"item": input_list}}`.
- `pretty=True` for human-readable output.
- `xmlAttrPrefix` passed through to xmltodict.

**Edge cases**:
- Empty dict -> `<root/>`.
- Nested arrays -> xmltodict handles with repeated elements.
- Non-string values -> xmltodict auto-converts to string.

#### 3.4 xml_to_json

**Input**: XML string.
**Output**: Dict (JSON-compatible).
**Behavior**:
- Use `defusedxml.ElementTree` for safe parsing, then `xmltodict.parse()`.
- Actually: `xmltodict.parse()` with `xml_attribs=True` and configured `attr_prefix`.
- To prevent XXE: use `defusedxml.expatreader` by patching or pass `forbid_dtd=True`, `forbid_entities=True`, `forbid_external=True` kwargs to `xmltodict.parse()` (xmltodict 0.13+ supports `expat` parser with these options via the `process_namespaces` and custom `expat` parser).
- Safer approach: pre-parse with `defusedxml.minidom.parseString()` to validate safety, then pass to `xmltodict.parse()`.
- Return the parsed dict (strip root element wrapper optionally).

**Edge cases**:
- Malformed XML -> raise `ValueError` with parse error message.
- Empty document -> raise `ValueError`.
- Very deeply nested XML -> xmltodict handles recursively; capped by 10 MB input size.

#### 3.5 flatten

**Input**: Nested dict (JSON object).
**Output**: Flat dict with dot-separated keys.
**Behavior**:
- Recursively walk the dict.
- Nested dicts produce keys like `a.b.c` (using `flattenSeparator`).
- List items produce keys like `a.0.value`, `a.1.value` (numeric indices).
- Leaf values (str, int, float, bool, None) are preserved as-is.
- Max depth enforced by `flattenMaxDepth` (default 20). Beyond max depth, remaining nested structures are stored as-is (not stringified).

**Example**:
```json
// Input
{"user": {"name": "Alice", "address": {"city": "NYC"}}, "tags": ["a", "b"]}

// Output (separator=".")
{"user.name": "Alice", "user.address.city": "NYC", "tags.0": "a", "tags.1": "b"}
```

**Edge cases**:
- Empty dict -> `{}`.
- Already flat dict -> returned as-is.
- None values -> preserved.
- Circular references -> impossible in JSON, no special handling needed.

#### 3.6 unflatten

**Input**: Flat dict with dot-separated keys.
**Output**: Nested dict.
**Behavior**:
- Split each key by `flattenSeparator`.
- Reconstruct nested structure.
- Numeric path segments create lists (auto-detect: if all sibling keys at a level are sequential integers starting from 0, create a list instead of dict).
- Non-sequential numeric keys -> remain as dict keys.

**Example**:
```json
// Input (separator=".")
{"user.name": "Alice", "user.address.city": "NYC", "tags.0": "a", "tags.1": "b"}

// Output
{"user": {"name": "Alice", "address": {"city": "NYC"}}, "tags": ["a", "b"]}
```

**Edge cases**:
- Empty dict -> `{}`.
- Single-level keys (no separator) -> returned as-is.
- Conflicting keys (`a.b=1` and `a.b.c=2`) -> later key wins (overwrites).
- Empty string key segments -> raise `ValueError`.

### 4. Input Validation & Size Limits

```python
MAX_INPUT_SIZE = 10 * 1024 * 1024  # 10 MB

def _validate_input_size(self, input_data: Any) -> None:
    """Validate input data size does not exceed MAX_INPUT_SIZE."""
    if isinstance(input_data, str):
        size = len(input_data.encode("utf-8"))
    elif isinstance(input_data, (dict, list)):
        # Serialize to measure size (approximate)
        size = len(json.dumps(input_data, default=str).encode("utf-8"))
    else:
        size = 0

    if size > self.MAX_INPUT_SIZE:
        raise ValueError(
            f"Input data exceeds maximum size "
            f"({size / 1024 / 1024:.1f} MB, max {self.MAX_INPUT_SIZE / 1024 / 1024:.0f} MB)"
        )
```

### 5. Error Handling Strategy

All errors raised as `ValueError` with descriptive messages. The orchestrator catches these and reports them as node execution failures. No silent error swallowing.

| Error Condition | Error Message |
|----------------|---------------|
| Input exceeds 10 MB | `"Input data exceeds maximum size (X.X MB, max 10 MB)"` |
| Invalid transformationType | `"Invalid transformation type: {type}. Valid: json_to_csv, csv_to_json, json_to_xml, xml_to_json, flatten, unflatten"` |
| json_to_csv with non-list/dict input | `"json_to_csv requires a JSON array (list) or object (dict), got {type}"` |
| csv_to_json with non-string input | `"csv_to_json requires a CSV string, got {type}"` |
| json_to_xml with non-dict/list input | `"json_to_xml requires a JSON object or array, got {type}"` |
| xml_to_json with non-string input | `"xml_to_json requires an XML string, got {type}"` |
| xml_to_json with malformed XML | `"Failed to parse XML: {parse_error}"` |
| flatten with non-dict input | `"flatten requires a JSON object (dict), got {type}"` |
| unflatten with non-dict input | `"unflatten requires a flat JSON object (dict), got {type}"` |
| Empty string key segment in unflatten | `"Invalid key path: contains empty segment in '{key}'"` |

## Implementation Steps

### Step 1: Add dependencies to requirements.txt

Add to `python-backend/requirements.txt` under the Phase 2 section:

```
# Data transformation (transformer node)
xmltodict>=0.13.0
defusedxml>=0.7.1
```

Run `pip install xmltodict defusedxml` to install locally.

### Step 2: Create transformer_executor.py

Create `/python-backend/app/orchestrator/node_executors/data_executors/transformer_executor.py` with:

```python
"""Transformer Executor - Convert data between formats.

Supported transformations:
  - json_to_csv: Convert JSON array to CSV string
  - csv_to_json: Parse CSV string to JSON array
  - json_to_xml: Convert JSON to XML string
  - xml_to_json: Parse XML string to JSON dict
  - flatten: Flatten nested JSON to dot-notation keys
  - unflatten: Rebuild nested JSON from dot-notation keys
"""
import csv
import io
import json
from typing import Any

import defusedxml.minidom
import xmltodict

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class TransformerExecutor:
    """Executor for data format transformation nodes."""

    MAX_INPUT_SIZE = 10 * 1024 * 1024  # 10 MB
    MAX_FLATTEN_DEPTH = 100  # Hard cap regardless of config

    VALID_TYPES = frozenset({
        "json_to_csv",
        "csv_to_json",
        "json_to_xml",
        "xml_to_json",
        "flatten",
        "unflatten",
    })

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute data transformation."""
        transformation_type = data.inputs.get("transformationType", "json_to_csv")
        raw_input = data.inputs.get("input")
        csv_delimiter = data.inputs.get("csvDelimiter", ",")
        csv_headers = data.inputs.get("csvHeaders", True)
        xml_root = data.inputs.get("xmlRootElement", "root")
        xml_attr_prefix = data.inputs.get("xmlAttrPrefix", "@")
        flatten_sep = data.inputs.get("flattenSeparator", ".")
        flatten_max_depth = min(
            data.inputs.get("flattenMaxDepth", 20),
            self.MAX_FLATTEN_DEPTH,
        )

        if transformation_type not in self.VALID_TYPES:
            raise ValueError(
                f"Invalid transformation type: {transformation_type}. "
                f"Valid: {', '.join(sorted(self.VALID_TYPES))}"
            )

        if raw_input is None:
            raise ValueError("Input data is required")

        self._validate_input_size(raw_input)

        # Dispatch to transformation method
        # ... (each returns (output, output_type, record_count))

    # ... individual transformation methods
```

Full implementation follows the specifications in Section 3 above.

### Step 3: Register in node_registry.py

Add the transformer node type spec to `_register_core_nodes()` in the `PHASE 2.2: Data Manipulation` section, after the existing filter node registration (around line 1018).

```python
# 10. Transformer (Data Format Conversion)
self.register_node_type(
    NodeTypeSpec(
        type="transformer",
        display_name="Transformer",
        description="Convert data between formats (JSON/CSV/XML) and reshape structures (flatten/unflatten)",
        icon="repeat-2",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="transformationType",
                display_name="Transformation Type",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="json_to_csv",
                options=[
                    {"label": "JSON to CSV", "value": "json_to_csv"},
                    {"label": "CSV to JSON", "value": "csv_to_json"},
                    {"label": "JSON to XML", "value": "json_to_xml"},
                    {"label": "XML to JSON", "value": "xml_to_json"},
                    {"label": "Flatten JSON", "value": "flatten"},
                    {"label": "Unflatten JSON", "value": "unflatten"},
                ],
            ),
            InputSpec(
                name="input",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Data to transform (JSON, CSV string, or XML string)...",
            ),
            InputSpec(
                name="csvDelimiter",
                display_name="CSV Delimiter",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default=",",
                validation={"max_length": 1},
                placeholder=",",
            ),
            InputSpec(
                name="csvHeaders",
                display_name="Include Headers",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
            InputSpec(
                name="xmlRootElement",
                display_name="XML Root Element",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default="root",
                placeholder="root",
            ),
            InputSpec(
                name="xmlAttrPrefix",
                display_name="XML Attribute Prefix",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default="@",
                placeholder="@",
            ),
            InputSpec(
                name="flattenSeparator",
                display_name="Flatten Separator",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default=".",
                placeholder=".",
            ),
            InputSpec(
                name="flattenMaxDepth",
                display_name="Max Flatten Depth",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=20,
                validation={"min": 1, "max": 100},
            ),
        ],
        outputs=[
            OutputSpec(name="output", display_name="Transformed Data", data_type="any"),
            OutputSpec(name="outputType", display_name="Output Format", data_type="text"),
            OutputSpec(name="recordCount", display_name="Record Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.data_executors.transformer_executor.TransformerExecutor",
    )
)
```

### Step 4: Update __init__.py

Add `TransformerExecutor` to `python-backend/app/orchestrator/node_executors/data_executors/__init__.py`:

```python
from app.orchestrator.node_executors.data_executors.transformer_executor import TransformerExecutor

__all__ = ["DatabaseQueryExecutor", "SQLValidator", "TransformerExecutor"]
```

### Step 5: Create test suite

Create `python-backend/tests/test_transformer_executor.py` with tests covering:

#### Test Categories (minimum 25 tests)

**json_to_csv tests:**
1. Basic array of dicts -> CSV
2. Single dict input (auto-wrapped) -> CSV
3. Custom delimiter (semicolon, tab)
4. Headers disabled
5. Mixed-type values (int, float, str, bool, None)
6. Nested objects serialized to JSON strings in cells
7. Empty array -> empty output
8. Non-dict items in array -> ValueError

**csv_to_json tests:**
9. Basic CSV with headers -> list of dicts
10. CSV without headers -> list with numeric keys
11. Custom delimiter
12. Auto-numeric conversion (int, float)
13. Empty cells -> None
14. Empty string -> empty list
15. Single header row no data -> empty list

**json_to_xml tests:**
16. Basic dict -> XML
17. List input -> wrapped in root/item elements
18. Empty dict -> minimal XML
19. Nested structures

**xml_to_json tests:**
20. Basic XML -> dict
21. XML with attributes
22. Malformed XML -> ValueError
23. XXE attack string -> rejected safely

**flatten tests:**
24. Nested dict -> flat keys
25. Array values -> indexed keys
26. Already flat -> unchanged
27. Empty dict -> empty dict
28. Max depth enforcement
29. None values preserved

**unflatten tests:**
30. Flat keys -> nested dict
31. Numeric keys -> list reconstruction
32. Empty dict -> empty dict
33. Empty key segment -> ValueError

**Validation tests:**
34. Input exceeds 10 MB -> ValueError
35. Invalid transformation type -> ValueError
36. None input -> ValueError

### Step 6: Run tests and verify

```bash
cd python-backend
pytest tests/test_transformer_executor.py -v
pytest tests/test_transformer_executor.py --cov=app.orchestrator.node_executors.data_executors.transformer_executor --cov-report=term-missing
```

Target: 90%+ coverage on the executor file.

### Step 7: Run full test suite for regression

```bash
cd python-backend
pytest
```

Ensure no regressions in existing tests.

## Verification Checklist

- [ ] All 6 transformation types work correctly
- [ ] 10 MB input size limit enforced
- [ ] XML parsing is safe against XXE attacks (defusedxml)
- [ ] CSV delimiter validation (single character)
- [ ] Flatten max depth enforced
- [ ] Error messages are clear and actionable
- [ ] Node appears in registry API response (`GET /api/v1/workflows/node-types`)
- [ ] Node renders correctly in workflow editor (automatic via DynamicNodeConfig)
- [ ] All tests pass with 90%+ coverage
- [ ] No regressions in existing test suite
- [ ] `black`, `ruff`, `isort` pass on new files
- [ ] Dependencies installed and listed in requirements.txt

## Implementation Order (Dependency Chain)

```
1. requirements.txt (add xmltodict, defusedxml)
   |
2. transformer_executor.py (create executor class)
   |
3. data_executors/__init__.py (add export)
   |
4. node_registry.py (register node type)
   |
5. test_transformer_executor.py (create tests)
   |
6. Run tests + lint + full regression
```

Steps 2-4 can be done in sequence (schema -> module -> registry). Step 5 can be done in parallel with step 4 but must be validated after step 4 completes.
