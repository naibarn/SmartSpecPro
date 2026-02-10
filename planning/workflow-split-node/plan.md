# Split (String/Array Splitting) Workflow Node - Implementation Plan

## Problem Statement

The workflow system needs a **Split** node that allows users to split strings and arrays into parts. This is a fundamental data processing operation complementary to the existing Merge, Filter, and Map nodes. Users need to:

- Split CSV data, tag lists, or delimited text into arrays for downstream processing.
- Break arrays into fixed-size chunks for batched operations (e.g., batch API calls, paginated processing).
- Split text using regex patterns for advanced parsing (log lines, structured formats).

The node must support three split modes (string delimiter split, array chunking, regex split) with proper validation, edge case handling, and security protections against regex denial-of-service.

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/orchestrator/node_executors/data_executors/split_executor.py` | **CREATE** | Core executor with three split modes |
| `python-backend/app/orchestrator/node_executors/data_executors/__init__.py` | **MODIFY** | Export SplitExecutor |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `split` node type with full InputSpec/OutputSpec |
| `python-backend/tests/test_split_executor.py` | **CREATE** | Comprehensive unit tests |

No database changes. No frontend changes required (the frontend renders dynamically from the registry).

## Architecture Overview

```
User Config (UI)                    Executor (Python)
+---------------------------+       +------------------------------------------+
| splitMode: string_split   |       |                                          |
| input: "a,b,c,d"         |       | SplitExecutor.execute()                  |
| delimiter: ","            | ----> |   |                                      |
| trimWhitespace: true      |       |   +-> _split_string()                    |
| maxSplits: 0 (unlimited)  |       |   |     +-> str.split(delimiter, max)    |
|                           |       |   |     +-> optional trim                 |
| -- OR --                  |       |   |                                      |
| splitMode: array_chunk    |       |   +-> _split_array_chunk()               |
| input: [1,2,3,4,5,6,7]   | ----> |   |     +-> chunk by size               |
| chunkSize: 3              |       |   |     +-> handle remainder chunk       |
|                           |       |   |                                      |
| -- OR --                  |       |   |                                      |
| splitMode: regex_split    |       |   +-> _split_regex()                     |
| input: "2026-02-09"       | ----> |         +-> re.split(pattern, input)     |
| pattern: "[-/]"           |       |         +-> timeout protection           |
+---------------------------+       +------------------------------------------+
                                    |                                          |
                                    | Returns:                                 |
                                    |   parts: [...split results]             |
                                    |   partCount: N                          |
                                    +------------------------------------------+
```

---

## Step 1: Split Executor Implementation

**File:** `python-backend/app/orchestrator/node_executors/data_executors/split_executor.py`

### 1.1 Class Structure

```python
"""Split Executor - Split strings by delimiter/regex or arrays into chunks.

Supports three split modes:
  - string_split: Split a string by a delimiter character/substring
  - array_chunk: Split an array into fixed-size chunks
  - regex_split: Split a string by a regular expression pattern
"""
import re
import signal
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class _RegexTimeoutException(Exception):
    """Raised when regex execution exceeds timeout."""
    pass


def _regex_timeout_handler(signum, frame):
    """Signal handler for regex execution timeout."""
    raise _RegexTimeoutException("Regex execution timed out")


class SplitExecutor:
    """Executor for split (string/array splitting) nodes.

    Splits data using one of three modes:
      - string_split: Split string by delimiter with optional whitespace trimming
      - array_chunk: Split array into fixed-size sub-arrays (chunks)
      - regex_split: Split string by regex pattern with timeout protection

    Performance characteristics:
      - Hard cap at MAX_OUTPUT_SIZE items to prevent resource exhaustion
      - SIGALRM timeout for regex mode to prevent ReDoS
      - All modes are O(n) where n is input length
    """

    # Maximum number of items in output array
    MAX_OUTPUT_SIZE = 10_000

    # Maximum input string length (bytes)
    MAX_INPUT_LENGTH = 1_000_000  # 1 MB

    # Maximum input array length for array_chunk mode
    MAX_ARRAY_SIZE = 10_000

    # Regex execution timeout (seconds)
    REGEX_TIMEOUT = 5

    # Maximum regex pattern length
    MAX_PATTERN_LENGTH = 500

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        ...
```

### 1.2 Main Execute Method

The `execute` method:

1. Extracts `splitMode` from `data.inputs` (default: `"string_split"`).
2. Extracts `input` from `data.inputs` (resolved by expression resolver before reaching executor).
3. Extracts `maxSplits` from `data.inputs` (default: `0` meaning unlimited).
4. Dispatches to the appropriate split method based on mode.
5. Enforces `MAX_OUTPUT_SIZE` on the result.
6. Returns the standard output dict with `parts` and `partCount`.

```python
async def execute(
    self,
    data: NodeExecutionData,
    context: ExecutionContext,
) -> dict[str, Any]:
    """Execute split operation on input data.

    Args:
        data: Node execution data containing inputs with input value,
              splitMode, and mode-specific configuration.
        context: Execution context with user/workflow metadata.

    Returns:
        Dictionary with split results:
          - parts: List of split parts
          - partCount: Number of parts produced

    Raises:
        ValueError: If input type is wrong for the selected mode,
                   configuration is invalid, or output exceeds limits.
    """
    split_mode = data.inputs.get("splitMode", "string_split")
    input_value = data.inputs.get("input")
    max_splits = data.inputs.get("maxSplits", 0)

    # Validate maxSplits
    if max_splits is not None and not isinstance(max_splits, (int, float)):
        try:
            max_splits = int(max_splits)
        except (TypeError, ValueError):
            max_splits = 0

    if isinstance(max_splits, float):
        max_splits = int(max_splits)

    # 0 or negative means unlimited
    if max_splits is None or max_splits <= 0:
        max_splits = 0

    # Handle empty/None input
    if input_value is None or input_value == "":
        return {
            "parts": [],
            "partCount": 0,
        }

    # Dispatch to split mode
    if split_mode == "string_split":
        parts = self._split_string(input_value, data.inputs, max_splits)
    elif split_mode == "array_chunk":
        parts = self._split_array_chunk(input_value, data.inputs)
    elif split_mode == "regex_split":
        parts = self._split_regex(input_value, data.inputs, max_splits)
    else:
        raise ValueError(f"Invalid splitMode: {split_mode}")

    # Enforce output size limit
    if len(parts) > self.MAX_OUTPUT_SIZE:
        raise ValueError(
            f"Split produced too many parts ({len(parts)}, max {self.MAX_OUTPUT_SIZE}). "
            f"Use maxSplits to limit the number of splits."
        )

    return {
        "parts": parts,
        "partCount": len(parts),
    }
```

### 1.3 String Split Mode: `_split_string()`

Splits a string by a delimiter substring with optional whitespace trimming and maxSplits support.

```python
def _split_string(
    self,
    input_value: Any,
    inputs: dict[str, Any],
    max_splits: int,
) -> list[str]:
    """Split a string by a delimiter.

    Args:
        input_value: The string to split (coerced to str if not already).
        inputs: Node inputs containing delimiter and trimWhitespace settings.
        max_splits: Maximum number of splits (0 = unlimited).

    Returns:
        List of string parts.

    Raises:
        ValueError: If input exceeds MAX_INPUT_LENGTH or delimiter is empty.
    """
    # Coerce to string
    if not isinstance(input_value, str):
        input_value = str(input_value)

    # Validate input length
    if len(input_value) > self.MAX_INPUT_LENGTH:
        raise ValueError(
            f"Input string too long ({len(input_value)} chars, "
            f"max {self.MAX_INPUT_LENGTH})"
        )

    delimiter = inputs.get("delimiter", ",")
    trim_whitespace = inputs.get("trimWhitespace", True)

    # Empty delimiter: split each character (like Python's default split behavior)
    if delimiter == "":
        raise ValueError("Delimiter cannot be empty. Use regex_split for character-level splitting.")

    # Perform the split
    if max_splits > 0:
        parts = input_value.split(delimiter, max_splits)
    else:
        parts = input_value.split(delimiter)

    # Optional whitespace trimming
    if trim_whitespace:
        parts = [part.strip() for part in parts]

    # Remove empty strings that result from leading/trailing/consecutive delimiters
    # Only when trimming is enabled, to avoid data loss
    if trim_whitespace:
        parts = [part for part in parts if part != ""]

    return parts
```

**Design Decision -- Empty parts after trimming:** When `trimWhitespace` is enabled, empty strings resulting from consecutive delimiters (e.g., `"a,,b"` split by `","`) are removed. This matches user expectation: "split and clean up." When `trimWhitespace` is disabled, empty parts are preserved for data fidelity.

### 1.4 Array Chunk Mode: `_split_array_chunk()`

Splits an array into fixed-size sub-arrays (chunks). The last chunk may be smaller than `chunkSize` if the array length is not evenly divisible.

```python
def _split_array_chunk(
    self,
    input_value: Any,
    inputs: dict[str, Any],
) -> list[list[Any]]:
    """Split an array into fixed-size chunks.

    Args:
        input_value: The array to chunk.
        inputs: Node inputs containing chunkSize.

    Returns:
        List of sub-arrays (chunks).

    Raises:
        ValueError: If input is not a list, exceeds MAX_ARRAY_SIZE,
                   or chunkSize is invalid.
    """
    if not isinstance(input_value, list):
        raise ValueError(
            f"array_chunk mode requires an array input, got {type(input_value).__name__}"
        )

    if len(input_value) > self.MAX_ARRAY_SIZE:
        raise ValueError(
            f"Input array too large ({len(input_value)} items, max {self.MAX_ARRAY_SIZE})"
        )

    chunk_size = inputs.get("chunkSize", 1)

    # Validate chunkSize
    if not isinstance(chunk_size, (int, float)):
        try:
            chunk_size = int(chunk_size)
        except (TypeError, ValueError):
            raise ValueError(f"chunkSize must be a positive integer, got {chunk_size!r}")

    if isinstance(chunk_size, float):
        chunk_size = int(chunk_size)

    if chunk_size < 1:
        raise ValueError(f"chunkSize must be >= 1, got {chunk_size}")

    # Handle empty array
    if len(input_value) == 0:
        return []

    # Chunk size >= array length -> return single chunk containing entire array
    if chunk_size >= len(input_value):
        return [input_value[:]]  # Shallow copy of the entire array

    # Build chunks
    chunks: list[list[Any]] = []
    for i in range(0, len(input_value), chunk_size):
        chunks.append(input_value[i : i + chunk_size])

    return chunks
```

**Note:** `maxSplits` does NOT apply to `array_chunk` mode. The number of chunks is determined solely by `chunkSize` and the array length. This is intentional: `maxSplits` is a concept for string splitting, not array partitioning.

### 1.5 Regex Split Mode: `_split_regex()`

Splits a string by a regular expression pattern with timeout protection against ReDoS.

```python
def _split_regex(
    self,
    input_value: Any,
    inputs: dict[str, Any],
    max_splits: int,
) -> list[str]:
    """Split a string by a regular expression pattern.

    Args:
        input_value: The string to split (coerced to str if not already).
        inputs: Node inputs containing pattern and trimWhitespace settings.
        max_splits: Maximum number of splits (0 = unlimited).

    Returns:
        List of string parts.

    Raises:
        ValueError: If input exceeds MAX_INPUT_LENGTH, pattern is empty,
                   pattern is too long, pattern is invalid regex, or
                   regex execution times out.
    """
    # Coerce to string
    if not isinstance(input_value, str):
        input_value = str(input_value)

    # Validate input length
    if len(input_value) > self.MAX_INPUT_LENGTH:
        raise ValueError(
            f"Input string too long ({len(input_value)} chars, "
            f"max {self.MAX_INPUT_LENGTH})"
        )

    pattern = inputs.get("pattern", "")
    trim_whitespace = inputs.get("trimWhitespace", True)

    if not pattern:
        raise ValueError("Regex pattern is required for regex_split mode")

    if len(pattern) > self.MAX_PATTERN_LENGTH:
        raise ValueError(
            f"Regex pattern too long ({len(pattern)} chars, max {self.MAX_PATTERN_LENGTH})"
        )

    # Compile the regex (validates syntax)
    try:
        compiled = re.compile(pattern)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern '{pattern}': {e}") from None

    # Execute with timeout protection against ReDoS
    old_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, _regex_timeout_handler)
    signal.alarm(self.REGEX_TIMEOUT)

    try:
        if max_splits > 0:
            parts = compiled.split(input_value, maxsplit=max_splits)
        else:
            parts = compiled.split(input_value)
    except _RegexTimeoutException:
        raise ValueError(
            f"Regex split timed out after {self.REGEX_TIMEOUT}s. "
            f"The pattern '{pattern}' may be vulnerable to catastrophic backtracking. "
            f"Simplify the pattern or use string_split mode instead."
        ) from None
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)

    # Optional whitespace trimming
    if trim_whitespace:
        parts = [part.strip() for part in parts]
        parts = [part for part in parts if part != ""]

    return parts
```

**Security:** The `SIGALRM` timeout (5 seconds) protects against catastrophic backtracking in malicious or careless regex patterns (e.g., `(a+)+$` on a long string of `a`s). The error message explicitly warns the user about the pattern.

---

## Step 2: Node Registry Specification

**File:** `python-backend/app/orchestrator/node_registry.py`

Add the split node registration in `_register_core_nodes()` under the `PHASE 2.2: Data Manipulation` section, after the existing `filter` registration.

### 2.1 Registry Spec

```python
# 10. Split (String/Array Splitting)
self.register_node_type(
    NodeTypeSpec(
        type="split",
        display_name="Split",
        description="Split strings by delimiter/regex or arrays into chunks",
        icon="scissors",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="splitMode",
                display_name="Split Mode",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="string_split",
                options=[
                    {"label": "String Split (by delimiter)", "value": "string_split"},
                    {"label": "Array Chunk (by size)", "value": "array_chunk"},
                    {"label": "Regex Split (by pattern)", "value": "regex_split"},
                ],
            ),
            InputSpec(
                name="input",
                display_name="Input",
                data_type="any",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder="Text to split or array to chunk (supports {{variable}})...",
            ),
            # --- string_split mode field ---
            InputSpec(
                name="delimiter",
                display_name="Delimiter",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default=",",
                placeholder="e.g., , or ; or |",
            ),
            # --- regex_split mode field ---
            InputSpec(
                name="pattern",
                display_name="Regex Pattern",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder=r"e.g., [\s,;]+ or \d{4}-\d{2}-\d{2}",
            ),
            # --- array_chunk mode field ---
            InputSpec(
                name="chunkSize",
                display_name="Chunk Size",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=10,
                validation={"min": 1, "max": 10000},
            ),
            # --- Shared options ---
            InputSpec(
                name="maxSplits",
                display_name="Max Splits",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=0,
                validation={"min": 0, "max": 10000},
                placeholder="0 = unlimited",
            ),
            InputSpec(
                name="trimWhitespace",
                display_name="Trim Whitespace",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
        ],
        outputs=[
            OutputSpec(name="parts", display_name="Parts", data_type="array"),
            OutputSpec(name="partCount", display_name="Part Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.data_executors.split_executor.SplitExecutor",
    )
)
```

### 2.2 Input Port Design Decisions

**`input` port with `data_type="any"`:** The input port accepts `any` type because:
- `string_split` and `regex_split` accept strings (will coerce non-strings via `str()`).
- `array_chunk` accepts arrays.
- Using `any` allows the same input port for all modes, avoiding the need for conditional port types.

**`ui_type="textarea"` for input:** Textarea provides multi-line support for longer text inputs (CSV data, log lines), which is more practical than a single-line text field.

**`delimiter` default is `","`:** Comma is the most common delimiter (CSV data, tag lists). Users can easily change to `;`, `|`, `\t` (tab), or any other string.

**`maxSplits` applies to string_split and regex_split only:** For `array_chunk`, the number of chunks is determined by `chunkSize` and array length. The `maxSplits` field is ignored in `array_chunk` mode.

**`trimWhitespace` applies to string_split and regex_split only:** It is ignored in `array_chunk` mode (arrays don't have whitespace to trim).

### 2.3 Conditional Field Visibility (Future Enhancement)

Same as the Filter node: the current `InputSpec` does not support conditional visibility. All fields are rendered regardless of `splitMode`. This is acceptable because:

1. Fields irrelevant to the current mode are simply left at their defaults.
2. The executor validates required fields per mode.
3. Empty/unused fields are ignored at execution time.

---

## Step 3: `__init__.py` Update

**File:** `python-backend/app/orchestrator/node_executors/data_executors/__init__.py`

Add the SplitExecutor export:

```python
"""Data shaping node executors."""

from app.orchestrator.node_executors.data_executors.database_query_executor import (
    DatabaseQueryExecutor,
    SQLValidator,
)
from app.orchestrator.node_executors.data_executors.split_executor import SplitExecutor

__all__ = ["DatabaseQueryExecutor", "SQLValidator", "SplitExecutor"]
```

---

## Step 4: Performance Optimization Strategy

### 4.1 String Split -- O(n) Linear

Python's built-in `str.split()` is implemented in C and runs in O(n) time where n is the input string length. No optimization needed beyond enforcing `MAX_INPUT_LENGTH`.

### 4.2 Array Chunk -- O(n) Linear

Array slicing `input_value[i : i + chunk_size]` creates shallow copies. The loop runs `ceil(n / chunkSize)` times. Total time is O(n) where n is the array length.

### 4.3 Regex Split -- O(n) with Timeout

`re.split()` runs in O(n) for well-behaved patterns. However, pathological patterns with nested quantifiers can cause exponential backtracking. The `SIGALRM` timeout (5 seconds) provides a hard safety net.

### 4.4 Memory Efficiency

- **String split:** Creates new string objects for each part (Python's normal behavior). Memory is bounded by `MAX_OUTPUT_SIZE * average_part_length`.
- **Array chunk:** Creates shallow-copy sub-arrays. Items themselves are not copied.
- **Output size limit:** Hard cap at `MAX_OUTPUT_SIZE = 10,000` items prevents unbounded memory growth.

### 4.5 Input Size Limits

| Mode | Input Limit | Rationale |
|------|-------------|-----------|
| `string_split` | 1 MB string | Prevents OOM on very large text |
| `regex_split` | 1 MB string + 500 char pattern | Same + pattern length cap |
| `array_chunk` | 10,000 items | Consistent with Filter/Map node limits |

---

## Step 5: Edge Cases and Error Handling

| Scenario | Behavior |
|----------|----------|
| `input` is `None` | Return `{"parts": [], "partCount": 0}` |
| `input` is `""` (empty string) | Return `{"parts": [], "partCount": 0}` |
| `input` is not a string in `string_split` | Coerce to string via `str()` |
| `input` is not a list in `array_chunk` | `ValueError("array_chunk mode requires an array input")` |
| `input` string exceeds 1 MB | `ValueError("Input string too long")` |
| `input` array exceeds 10,000 items | `ValueError("Input array too large")` |
| `splitMode` is invalid | `ValueError("Invalid splitMode: <value>")` |
| `delimiter` is empty string | `ValueError("Delimiter cannot be empty")` |
| `delimiter` not found in input string | Return single-element array containing the entire input |
| `pattern` is empty in `regex_split` | `ValueError("Regex pattern is required")` |
| `pattern` is invalid regex | `ValueError("Invalid regex pattern '<pattern>': <error>")` |
| `pattern` exceeds 500 chars | `ValueError("Regex pattern too long")` |
| Regex causes catastrophic backtracking | `ValueError("Regex split timed out...")` after 5s |
| `chunkSize` is 0 or negative | `ValueError("chunkSize must be >= 1")` |
| `chunkSize` is not a number | Attempt `int()` coercion, raise `ValueError` on failure |
| `chunkSize` > array length | Return single chunk containing the entire array |
| `maxSplits` is negative or non-numeric | Treated as unlimited (0) |
| Split produces > 10,000 parts | `ValueError("Split produced too many parts")` |
| Input is a number (e.g., `12345`) in `string_split` | Coerced to `"12345"`, then split by delimiter |
| Input is a list of mixed types in `array_chunk` | Chunked as-is (no type checking on elements) |
| `trimWhitespace=true` with consecutive delimiters | Empty parts removed after trimming |
| `trimWhitespace=false` with consecutive delimiters | Empty parts preserved |
| Empty array in `array_chunk` | Return `[]` (empty list of chunks) |
| Regex with capture groups | `re.split()` includes captured groups in output; this is standard Python behavior and documented |

---

## Step 6: Test Plan

**File:** `python-backend/tests/test_split_executor.py`

### 6.1 Test Data Fixtures

```python
import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.data_executors.split_executor import SplitExecutor


@pytest.fixture
def executor():
    """SplitExecutor instance."""
    return SplitExecutor()


@pytest.fixture
def make_execution_data():
    """Factory for creating NodeExecutionData."""
    def _make(inputs: dict, state: dict | None = None):
        return NodeExecutionData(
            node_id="split-1",
            node_type="split",
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

### 6.2 Test Categories

```python
# ===== String Split Mode Tests =====

class TestStringSplit:
    """Tests for string_split mode."""

    async def test_split_by_comma(self):
        """Split "a,b,c" by comma -> ["a", "b", "c"]."""

    async def test_split_by_semicolon(self):
        """Split "x;y;z" by semicolon -> ["x", "y", "z"]."""

    async def test_split_by_pipe(self):
        """Split "1|2|3" by pipe -> ["1", "2", "3"]."""

    async def test_split_by_multi_char_delimiter(self):
        """Split "a::b::c" by "::" -> ["a", "b", "c"]."""

    async def test_split_with_whitespace_trimming(self):
        """Split "a , b , c" by comma with trim -> ["a", "b", "c"]."""

    async def test_split_without_whitespace_trimming(self):
        """Split "a , b , c" by comma without trim -> ["a ", " b ", " c"]."""

    async def test_split_with_max_splits(self):
        """Split "a,b,c,d" by comma with maxSplits=2 -> ["a", "b", "c,d"]."""

    async def test_split_delimiter_not_found(self):
        """Delimiter not in input -> single-element array."""

    async def test_split_consecutive_delimiters_with_trim(self):
        """Split "a,,b" by comma with trim -> ["a", "b"] (empty parts removed)."""

    async def test_split_consecutive_delimiters_without_trim(self):
        """Split "a,,b" by comma without trim -> ["a", "", "b"] (empty parts preserved)."""

    async def test_split_leading_trailing_delimiters(self):
        """Split ",a,b," by comma with trim -> ["a", "b"]."""

    async def test_split_coerces_non_string(self):
        """Non-string input (e.g., number 12345) is coerced to string."""

    async def test_split_empty_delimiter_raises(self):
        """Empty delimiter raises ValueError."""

    async def test_split_tab_delimiter(self):
        """Split by tab character."""

    async def test_split_newline_delimiter(self):
        """Split by newline character."""

    async def test_split_input_too_long(self):
        """Input exceeding MAX_INPUT_LENGTH raises ValueError."""


# ===== Array Chunk Mode Tests =====

class TestArrayChunk:
    """Tests for array_chunk mode."""

    async def test_chunk_even_division(self):
        """[1,2,3,4,5,6] with chunkSize=3 -> [[1,2,3], [4,5,6]]."""

    async def test_chunk_uneven_division(self):
        """[1,2,3,4,5] with chunkSize=3 -> [[1,2,3], [4,5]]."""

    async def test_chunk_size_one(self):
        """chunkSize=1 -> each item in its own chunk."""

    async def test_chunk_size_equals_array_length(self):
        """chunkSize == len(array) -> single chunk with entire array."""

    async def test_chunk_size_exceeds_array_length(self):
        """chunkSize > len(array) -> single chunk with entire array."""

    async def test_chunk_empty_array(self):
        """Empty array -> empty list of chunks."""

    async def test_chunk_single_item(self):
        """[1] with chunkSize=5 -> [[1]]."""

    async def test_chunk_mixed_types(self):
        """Array with mixed types (dicts, strings, numbers) chunked correctly."""

    async def test_chunk_non_array_input_raises(self):
        """Non-array input raises ValueError."""

    async def test_chunk_string_input_raises(self):
        """String input (iterable but not array) raises ValueError."""

    async def test_chunk_size_zero_raises(self):
        """chunkSize=0 raises ValueError."""

    async def test_chunk_size_negative_raises(self):
        """chunkSize=-1 raises ValueError."""

    async def test_chunk_size_float_coerced(self):
        """chunkSize=3.7 coerced to 3."""

    async def test_chunk_size_non_numeric_raises(self):
        """chunkSize="abc" raises ValueError."""

    async def test_chunk_array_too_large(self):
        """Array exceeding MAX_ARRAY_SIZE raises ValueError."""

    async def test_chunk_ignores_max_splits(self):
        """maxSplits is ignored in array_chunk mode (determined by chunkSize)."""


# ===== Regex Split Mode Tests =====

class TestRegexSplit:
    """Tests for regex_split mode."""

    async def test_split_by_whitespace_regex(self):
        r"""Split "hello world  foo" by \s+ -> ["hello", "world", "foo"]."""

    async def test_split_by_multiple_delimiters(self):
        """Split "a,b;c|d" by [,;|] -> ["a", "b", "c", "d"]."""

    async def test_split_by_date_separator(self):
        """Split "2026-02-09" by [-/] -> ["2026", "02", "09"]."""

    async def test_split_with_max_splits(self):
        r"""Split "a b c d" by \s+ with maxSplits=2 -> ["a", "b", "c d"]."""

    async def test_split_with_capture_group(self):
        """Regex with capture groups includes captured text in results."""

    async def test_split_empty_pattern_raises(self):
        """Empty pattern raises ValueError."""

    async def test_split_invalid_regex_raises(self):
        """Invalid regex (e.g., unclosed bracket) raises ValueError."""

    async def test_split_pattern_too_long_raises(self):
        """Pattern exceeding MAX_PATTERN_LENGTH raises ValueError."""

    async def test_split_regex_timeout(self):
        """Pathological regex pattern times out with clear error message."""

    async def test_split_with_trimming(self):
        """Regex split with trimWhitespace removes empty/whitespace parts."""

    async def test_split_without_trimming(self):
        """Regex split without trimWhitespace preserves empty parts."""

    async def test_split_coerces_non_string(self):
        """Non-string input coerced to string for regex split."""


# ===== Empty/Null Input Tests =====

class TestSplitEmptyInput:
    """Tests for empty and null input handling."""

    async def test_none_input(self):
        """None input returns empty parts."""

    async def test_empty_string_input(self):
        """Empty string returns empty parts."""

    async def test_whitespace_only_input_string_split(self):
        """Whitespace-only string with trimming returns empty parts."""


# ===== Output Size Limit Tests =====

class TestSplitOutputLimits:
    """Tests for output size enforcement."""

    async def test_output_exceeds_max_raises(self):
        """Split producing > MAX_OUTPUT_SIZE parts raises ValueError."""

    async def test_output_at_max_allowed(self):
        """Split producing exactly MAX_OUTPUT_SIZE parts succeeds."""


# ===== Invalid Mode Tests =====

class TestSplitInvalidMode:
    """Tests for invalid splitMode."""

    async def test_invalid_mode_raises(self):
        """Invalid splitMode raises ValueError."""

    async def test_missing_mode_defaults_to_string_split(self):
        """Missing splitMode defaults to string_split."""


# ===== Integration Tests =====

class TestSplitIntegration:
    """Integration-style tests for realistic workflows."""

    async def test_csv_line_parsing(self):
        """Parse CSV line: 'Alice,30,admin' -> ['Alice', '30', 'admin']."""

    async def test_tag_splitting(self):
        """Split tags: 'python, fastapi, async' -> ['python', 'fastapi', 'async']."""

    async def test_log_line_parsing(self):
        r"""Parse log: '2026-02-09 10:30:00 ERROR ...' by \s+ with maxSplits=3."""

    async def test_batch_api_calls_chunking(self):
        """Chunk 25-item array with chunkSize=10 -> 3 chunks for batch processing."""

    async def test_output_ports_correct(self):
        """Verify both output ports (parts and partCount) are populated correctly."""
```

### 6.3 Performance Test

```python
class TestSplitPerformance:
    """Performance regression tests."""

    async def test_large_string_split(self):
        """Split a 100KB string by comma in < 1 second."""

    async def test_large_array_chunk(self):
        """Chunk 10,000-item array in < 1 second."""

    async def test_large_string_regex_split(self):
        """Regex split a 100KB string in < 3 seconds."""
```

---

## Step 7: Implementation Checklist

- [ ] **7.1** Create `python-backend/app/orchestrator/node_executors/data_executors/split_executor.py`
  - [ ] `SplitExecutor` class with `execute()` method
  - [ ] `_split_string()` with delimiter split, trim, and maxSplits
  - [ ] `_split_array_chunk()` with chunk size validation and slicing
  - [ ] `_split_regex()` with pattern validation, compilation, and timeout
  - [ ] `_RegexTimeoutException` and `_regex_timeout_handler`
  - [ ] Docstrings and type hints throughout

- [ ] **7.2** Update `python-backend/app/orchestrator/node_executors/data_executors/__init__.py`
  - [ ] Add `SplitExecutor` import and export

- [ ] **7.3** Register node in `python-backend/app/orchestrator/node_registry.py`
  - [ ] Add `NodeTypeSpec` with all InputSpecs and OutputSpecs
  - [ ] Place under `PHASE 2.2: Data Manipulation` section (after filter registration)
  - [ ] Verify executor dotpath is correct

- [ ] **7.4** Create `python-backend/tests/test_split_executor.py`
  - [ ] String split mode tests (all delimiter scenarios)
  - [ ] Array chunk mode tests (all chunk size scenarios)
  - [ ] Regex split mode tests (valid/invalid patterns, timeout)
  - [ ] Empty/null input tests
  - [ ] Output size limit tests
  - [ ] Invalid mode tests
  - [ ] Integration/workflow scenario tests
  - [ ] Performance regression tests
  - [ ] All tests pass

- [ ] **7.5** Verification
  - [ ] `pytest tests/test_split_executor.py` -- all pass
  - [ ] `pytest` -- full suite, no regressions
  - [ ] `black app/ tests/` -- formatting clean
  - [ ] `ruff check app/` -- no lint errors
  - [ ] `mypy app/orchestrator/node_executors/data_executors/split_executor.py` -- no type errors

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Regex Denial of Service (ReDoS) via malicious pattern | HIGH | SIGALRM timeout (5s) kills execution. Pattern length capped at 500 chars. Clear error message on timeout. |
| SIGALRM not available on Windows | MEDIUM | Production runs on Linux (Docker). Add fallback for dev environments (skip timeout or use `threading.Timer`). |
| Memory exhaustion from splitting very large strings | MEDIUM | MAX_INPUT_LENGTH (1 MB) and MAX_OUTPUT_SIZE (10,000 items) provide hard caps. |
| `re.split()` with capture groups produces unexpected output | LOW | This is documented standard Python behavior. The user controls the pattern. |
| Type coercion surprises (non-string input in string modes) | LOW | Explicit `str()` coercion with clear documentation. |
| Missing conditional field visibility in UI | LOW | All fields rendered. Unused fields ignored by executor. Placeholder text guides the user. |

---

## Dependencies

- **No new Python dependencies.** Uses only Python stdlib (`re`, `signal`).
- **No database changes.**
- **No frontend changes.** The UI renders dynamically from the registry.
- **No migration needed.**

---

## Design Decisions Log

### Decision 1: Three modes vs. separate node types

**Decision:** Single node with three modes (via `splitMode` select).

**Rationale:** Consistent with the established pattern in the codebase (FilterExecutor has 3 modes, MapExecutor has 3 modes). A single node is easier for users to discover in the palette. The modes share output ports (`parts`, `partCount`), making them naturally cohesive.

### Decision 2: `maxSplits` not applicable to `array_chunk`

**Decision:** `maxSplits` is silently ignored in `array_chunk` mode.

**Rationale:** For array chunking, the number of output chunks is mathematically determined by `ceil(len(array) / chunkSize)`. A "maxSplits" concept doesn't map cleanly to chunking. If users want fewer chunks, they increase `chunkSize`. Raising an error would be confusing; ignoring it is the least surprising behavior.

### Decision 3: Empty parts handling with `trimWhitespace`

**Decision:** When `trimWhitespace=true`, empty strings resulting from consecutive/leading/trailing delimiters are removed from the output.

**Rationale:** Users enabling "trim whitespace" expect clean output. `"a,,b".split(",")` producing `["a", "", "b"]` with an empty element is surprising to most users. This matches common "split and clean" patterns in data processing.

### Decision 4: Output port types

**Decision:** `parts` output has `data_type="array"` and `partCount` has `data_type="number"`.

**Rationale:** `parts` is always an array regardless of split mode:
- `string_split` produces `list[str]`
- `array_chunk` produces `list[list[Any]]` (array of arrays)
- `regex_split` produces `list[str]`

The `array` type is compatible with downstream nodes that accept arrays (Filter, Map, Loop) per the data type compatibility matrix.

### Decision 5: Regex timeout value (5 seconds)

**Decision:** 5 second `SIGALRM` timeout for regex execution.

**Rationale:** Well-behaved regex patterns on 1 MB strings complete in milliseconds. 5 seconds provides ample margin for complex but non-pathological patterns while still protecting against ReDoS. The filter executor uses 10 seconds for custom code (which runs a loop over all items), but regex split is a single operation, so 5 seconds is more appropriate.

---

## Future Enhancements (Out of Scope)

1. **Conditional field visibility** in `InputSpec` + `DynamicNodeConfig.tsx` to hide/show fields based on `splitMode`.
2. **`keepDelimiters` option** for string_split to optionally include delimiter in output parts.
3. **`removeEmpty` toggle** separate from `trimWhitespace` for more granular control.
4. **Named capture group output** for regex_split: output a structured dict per match instead of flat strings.
5. **Streaming split** for very large inputs (yield results progressively via async generator).
6. **Configurable MAX_OUTPUT_SIZE / MAX_INPUT_LENGTH** via environment variable.
7. **Windows compatibility** for regex timeout via `threading.Timer` instead of `SIGALRM`.
