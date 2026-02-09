# Validator (Schema Validation) Workflow Node - Implementation Plan

## Problem Statement

The workflow system needs a **Validator** node that validates data against schemas, patterns, types, or custom logic before it flows to downstream nodes. This is essential for data quality enforcement in production workflows -- catching malformed LLM outputs, invalid webhook payloads, or type mismatches before they cause failures in downstream processing. The node must support four validation modes: JSON Schema validation (draft-07), regex pattern matching, type checking, and custom Python validation functions. It must provide clear error reporting and configurable behavior on validation failure (stop vs. continue).

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/orchestrator/node_executors/data_executors/validator_executor.py` | **CREATE** | Core executor with four validation modes |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `validator` node type with full InputSpec/OutputSpec |
| `python-backend/app/orchestrator/node_executors/data_executors/__init__.py` | **MODIFY** | Export ValidatorExecutor |
| `python-backend/tests/test_validator_executor.py` | **CREATE** | Comprehensive unit tests (~40 test cases) |

No database changes. No frontend changes required (the frontend renders dynamically from the registry).

## Architecture Overview

```
User Config (UI)                       Executor (Python)
+-----------------------------------+  +-----------------------------------------------+
| validationType: json_schema       |  |                                               |
| input: {{previousNode.output}}    |  | ValidatorExecutor.execute()                   |
| schema: {"type":"object",...}     |  |   |                                           |
|                                   |  |   +-> _validate_json_schema()                 |
| -- OR --                          |  |   |     +-> jsonschema.validate()              |
|                                   |  |   |     +-> Draft7Validator                    |
| validationType: regex             |  |   |                                           |
| input: "test@example.com"        |  |   +-> _validate_regex()                        |
| pattern: "^[\w.-]+@[\w.-]+$"    |  |   |     +-> re.compile() (with timeout)        |
|                                   |  |   |     +-> re.fullmatch()                    |
| -- OR --                          |  |   |                                           |
| validationType: type_check        |  |   +-> _validate_type_check()                  |
| input: [1, 2, 3]                 |  |   |     +-> isinstance() checks               |
| expectedType: array               |  |   |                                           |
| -- OR --                          |  |   +-> _validate_custom_function()              |
| validationType: custom_function   |  |         +-> RestrictedPython sandbox           |
| input: {...}                      |  |         +-> SIGALRM timeout protection         |
| validationCode: "result = ..."   |  |                                               |
+-----------------------------------+  +-----------------------------------------------+
                                       |                                               |
                                       | Returns:                                      |
                                       |   valid: bool                                 |
                                       |   errors: string[]                            |
                                       |   validatedData: any (passthrough if valid)    |
                                       +-----------------------------------------------+
                                       |                                               |
                                       | If stopOnError=True and valid=False:           |
                                       |   -> raises ValueError (halts workflow)        |
                                       | If stopOnError=False and valid=False:          |
                                       |   -> returns {valid: False, errors: [...]}     |
                                       +-----------------------------------------------+
```

---

## Step 1: Validator Executor Implementation

**File:** `python-backend/app/orchestrator/node_executors/data_executors/validator_executor.py`

### 1.1 Class Structure

```python
"""Validator Executor - Validate data against schemas, patterns, types, or custom logic.

Supports four validation modes:
  - json_schema: JSON Schema draft-07 validation via jsonschema library
  - regex: Regex pattern matching with timeout protection
  - type_check: Python type validation (string, number, boolean, array, object)
  - custom_function: User-provided Python validation via RestrictedPython sandbox
"""
import re
import signal
from typing import Any

import jsonschema
from jsonschema import Draft7Validator, ValidationError as JsonSchemaValidationError
from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Guards import guarded_iter_unpack_sequence, safe_builtins

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class _ValidatorTimeoutException(Exception):
    """Raised when validation code/regex execution exceeds timeout."""
    pass


def _timeout_handler(signum, frame):
    """Signal handler for validation execution timeout."""
    raise _ValidatorTimeoutException("Validation execution timed out")


class ValidatorExecutor:
    """Executor for validator (schema validation) nodes.

    Validates input data against a schema, pattern, type, or custom validation
    function. Returns validation results with detailed error messages.

    Performance characteristics:
      - JSON Schema: jsonschema library with Draft7Validator (compiled once)
      - Regex: Compiled pattern with SIGALRM timeout protection (ReDoS defense)
      - Type check: Simple isinstance() checks, O(1)
      - Custom function: RestrictedPython sandbox with SIGALRM timeout

    Security characteristics:
      - Regex timeout prevents ReDoS attacks
      - Custom code runs in RestrictedPython sandbox (no file I/O, no imports)
      - JSON Schema validation depth is bounded by jsonschema library defaults
    """

    # Supported validation types
    VALIDATION_TYPES = {"json_schema", "regex", "type_check", "custom_function"}

    # Supported type names for type_check mode
    SUPPORTED_TYPES = {"string", "number", "integer", "boolean", "array", "object", "null"}

    # Timeout for regex matching (seconds) - protects against ReDoS
    REGEX_TIMEOUT = 5

    # Timeout for custom validation code (seconds)
    CUSTOM_CODE_TIMEOUT = 10

    # Maximum length for regex patterns
    MAX_PATTERN_LENGTH = 1000

    # Maximum length for custom validation code
    MAX_CODE_LENGTH = 5000

    # Maximum number of JSON Schema validation errors to collect
    MAX_SCHEMA_ERRORS = 50

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        ...
```

### 1.2 Main Execute Method

The `execute` method:

1. Extracts `validationType` from `data.inputs` (required, no default).
2. Extracts `input` -- the data to validate (from upstream node connection or manual entry).
3. Extracts `stopOnError` from `data.inputs` (default: `True`).
4. Validates that `validationType` is one of the supported types.
5. Dispatches to the appropriate validation method.
6. If `stopOnError is True` and validation fails, raises `ValueError` with error details (halts workflow execution).
7. Returns the standard output dict with `valid`, `errors`, and `validatedData`.

```python
async def execute(
    self,
    data: NodeExecutionData,
    context: ExecutionContext,
) -> dict[str, Any]:
    """Execute validation on the input data.

    Args:
        data: Node execution data containing inputs with validationType,
              input, and mode-specific configuration.
        context: Execution context with user/workflow metadata.

    Returns:
        Dictionary with validation results:
          - valid: Whether the input passed validation
          - errors: List of validation error messages (empty if valid)
          - validatedData: The input data passthrough (only if valid, else None)

    Raises:
        ValueError: If validationType is missing or unsupported, or if
                   stopOnError is True and validation fails.
    """
    validation_type = data.inputs.get("validationType")
    input_data = data.inputs.get("input")
    stop_on_error = data.inputs.get("stopOnError", True)

    # Validate configuration
    if not validation_type:
        raise ValueError("validationType is required")

    if validation_type not in self.VALIDATION_TYPES:
        raise ValueError(
            f"Invalid validationType: {validation_type}. "
            f"Supported: {', '.join(sorted(self.VALIDATION_TYPES))}"
        )

    # Dispatch to validation mode
    if validation_type == "json_schema":
        valid, errors = self._validate_json_schema(input_data, data.inputs)
    elif validation_type == "regex":
        valid, errors = self._validate_regex(input_data, data.inputs)
    elif validation_type == "type_check":
        valid, errors = self._validate_type_check(input_data, data.inputs)
    elif validation_type == "custom_function":
        valid, errors = self._validate_custom_function(input_data, data.inputs)
    else:
        # Should not reach here due to earlier validation, but defensive
        raise ValueError(f"Unsupported validationType: {validation_type}")

    # Handle stopOnError behavior
    if not valid and stop_on_error:
        error_summary = "; ".join(errors[:5])  # First 5 errors in summary
        if len(errors) > 5:
            error_summary += f" (and {len(errors) - 5} more errors)"
        raise ValueError(
            f"Validation failed ({validation_type}): {error_summary}"
        )

    return {
        "valid": valid,
        "errors": errors,
        "validatedData": input_data if valid else None,
    }
```

### 1.3 JSON Schema Validation: `_validate_json_schema()`

Uses the `jsonschema` library (already in `requirements.txt` at version `4.21.0`) with `Draft7Validator` for JSON Schema draft-07 compliance. Collects all validation errors rather than failing on the first one.

```python
def _validate_json_schema(
    self,
    input_data: Any,
    inputs: dict[str, Any],
) -> tuple[bool, list[str]]:
    """Validate input data against a JSON Schema (draft-07).

    Args:
        input_data: The data to validate.
        inputs: Node inputs containing the schema object.

    Returns:
        Tuple of (is_valid, error_messages).

    Raises:
        ValueError: If schema is missing or not a valid JSON Schema.
    """
    schema = inputs.get("schema")

    if schema is None:
        raise ValueError("JSON Schema is required for json_schema validation")

    if not isinstance(schema, dict):
        raise ValueError(
            f"JSON Schema must be an object, got {type(schema).__name__}"
        )

    # Validate the schema itself before using it
    try:
        Draft7Validator.check_schema(schema)
    except jsonschema.SchemaError as e:
        raise ValueError(f"Invalid JSON Schema: {e.message}") from None

    # Create validator instance and collect all errors
    validator = Draft7Validator(schema)
    raw_errors = list(validator.iter_errors(input_data))

    if not raw_errors:
        return True, []

    # Format error messages with JSON path context
    errors: list[str] = []
    for error in raw_errors[:self.MAX_SCHEMA_ERRORS]:
        path = ".".join(str(p) for p in error.absolute_path) if error.absolute_path else "(root)"
        errors.append(f"[{path}] {error.message}")

    if len(raw_errors) > self.MAX_SCHEMA_ERRORS:
        errors.append(
            f"... and {len(raw_errors) - self.MAX_SCHEMA_ERRORS} more errors"
        )

    return False, errors
```

**Key design decisions:**

- **Draft7Validator** is used explicitly rather than the default `validate()` function, ensuring consistent draft-07 behavior regardless of the `$schema` keyword in the user's schema.
- **Schema validation first:** `Draft7Validator.check_schema()` validates the schema itself before attempting to validate data. This prevents confusing errors when users provide malformed schemas.
- **All errors collected:** `iter_errors()` collects all validation errors rather than stopping at the first. This gives users a complete picture of what is wrong.
- **Error path formatting:** Each error includes the JSON path (e.g., `[properties.name]`) for precise location identification.
- **Error count cap:** Maximum `MAX_SCHEMA_ERRORS` (50) errors to prevent unbounded output on deeply invalid data.

### 1.4 Regex Validation: `_validate_regex()`

Pattern matching with timeout protection against ReDoS (Regular Expression Denial of Service).

```python
def _validate_regex(
    self,
    input_data: Any,
    inputs: dict[str, Any],
) -> tuple[bool, list[str]]:
    """Validate input data against a regex pattern.

    Converts input to string before matching. Uses SIGALRM timeout to
    protect against ReDoS attacks from malicious or poorly-constructed
    patterns.

    Args:
        input_data: The data to validate (converted to string).
        inputs: Node inputs containing the pattern string.

    Returns:
        Tuple of (is_valid, error_messages).

    Raises:
        ValueError: If pattern is missing, empty, too long, or has
                   invalid regex syntax.
        _ValidatorTimeoutException: If regex matching exceeds timeout.
    """
    pattern = inputs.get("pattern")

    if not pattern:
        raise ValueError("Regex pattern is required for regex validation")

    if not isinstance(pattern, str):
        raise ValueError(
            f"Regex pattern must be a string, got {type(pattern).__name__}"
        )

    if len(pattern) > self.MAX_PATTERN_LENGTH:
        raise ValueError(
            f"Regex pattern too long ({len(pattern)} chars, "
            f"max {self.MAX_PATTERN_LENGTH})"
        )

    # Compile pattern (validates syntax)
    try:
        compiled = re.compile(pattern)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}") from None

    # Convert input to string for matching
    input_str = str(input_data) if input_data is not None else ""

    # Execute with timeout protection against ReDoS
    old_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(self.REGEX_TIMEOUT)

    try:
        match = compiled.fullmatch(input_str)
    except _ValidatorTimeoutException:
        raise ValueError(
            f"Regex matching timed out after {self.REGEX_TIMEOUT}s "
            f"(possible ReDoS pattern)"
        )
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)

    if match:
        return True, []

    return False, [
        f"Value '{self._truncate(input_str, 100)}' does not match "
        f"pattern '{self._truncate(pattern, 100)}'"
    ]
```

**Key design decisions:**

- **`fullmatch()`** is used instead of `match()` or `search()` to ensure the entire input matches the pattern, not just a substring. This is the expected behavior for schema validation (e.g., email format validation should match the entire string).
- **SIGALRM timeout** protects against ReDoS attacks. Patterns like `(a+)+$` against `"aaaaaaaaaaaaaaa!"` can cause exponential backtracking. The 5-second timeout prevents this from blocking the workflow engine.
- **Pattern length limit** (1000 chars) adds a secondary defense layer.
- **String coercion:** Input is converted to string before matching, since regex operates on strings. `None` becomes `""`.
- **Truncated error messages:** Long input values and patterns are truncated in error messages to prevent log flooding.

### 1.5 Type Check Validation: `_validate_type_check()`

Simple Python type validation mapping workflow type names to Python types.

```python
def _validate_type_check(
    self,
    input_data: Any,
    inputs: dict[str, Any],
) -> tuple[bool, list[str]]:
    """Validate that input data matches an expected Python type.

    Maps workflow type names to Python types:
      - string -> str
      - number -> int | float
      - integer -> int
      - boolean -> bool
      - array -> list
      - object -> dict
      - null -> NoneType

    Args:
        input_data: The data to validate.
        inputs: Node inputs containing expectedType string.

    Returns:
        Tuple of (is_valid, error_messages).

    Raises:
        ValueError: If expectedType is missing or unsupported.
    """
    expected_type = inputs.get("expectedType")

    if not expected_type:
        raise ValueError("expectedType is required for type_check validation")

    if expected_type not in self.SUPPORTED_TYPES:
        raise ValueError(
            f"Invalid expectedType: {expected_type}. "
            f"Supported: {', '.join(sorted(self.SUPPORTED_TYPES))}"
        )

    # Map type names to Python type checks
    # Note: bool is a subclass of int in Python, so check bool BEFORE int
    type_map: dict[str, type | tuple[type, ...]] = {
        "string": str,
        "number": (int, float),
        "integer": int,
        "boolean": bool,
        "array": list,
        "object": dict,
        "null": type(None),
    }

    expected_py_type = type_map[expected_type]
    actual_type_name = type(input_data).__name__

    # Special case: bool is a subclass of int in Python.
    # If expectedType is "number" or "integer", booleans should NOT match.
    if expected_type in ("number", "integer") and isinstance(input_data, bool):
        return False, [
            f"Expected {expected_type}, got boolean ({input_data})"
        ]

    if isinstance(input_data, expected_py_type):
        return True, []

    return False, [
        f"Expected type '{expected_type}', got '{actual_type_name}' "
        f"(value: {self._truncate(repr(input_data), 100)})"
    ]
```

**Key design decisions:**

- **Bool/int distinction:** In Python, `bool` is a subclass of `int`, so `isinstance(True, int)` returns `True`. The validator explicitly rejects booleans when the expected type is `"number"` or `"integer"`, which matches JSON Schema semantics and user expectations.
- **Number includes both int and float:** `"number"` maps to `(int, float)` to accept any numeric value. `"integer"` is strict int-only.
- **Null support:** `"null"` validates that the input is `None`, useful for checking optional fields.
- **Type name mapping** follows JSON Schema naming conventions (`string`, `number`, `array`, `object`) for consistency with the `json_schema` validation type.

### 1.6 Custom Function Validation: `_validate_custom_function()`

Executes user-provided Python validation code in a RestrictedPython sandbox, following the same pattern as `code_executor.py` and `filter_executor.py`.

```python
def _validate_custom_function(
    self,
    input_data: Any,
    inputs: dict[str, Any],
) -> tuple[bool, list[str]]:
    """Validate input using user-provided Python code in a sandbox.

    The code receives:
      - ``data``: The input data to validate
      - ``valid``: Boolean (set to True if valid, default False)
      - ``errors``: List (append error messages)

    Example user code:
        if not isinstance(data, dict):
            errors.append("Input must be a dictionary")
        elif "email" not in data:
            errors.append("Missing required field: email")
        elif "@" not in data["email"]:
            errors.append("Invalid email format")
        else:
            valid = True

    The code is compiled once and executed with SIGALRM timeout protection.

    Args:
        input_data: The data to validate.
        inputs: Node inputs containing the validationCode string.

    Returns:
        Tuple of (is_valid, error_messages).

    Raises:
        ValueError: If code is empty, too long, or has syntax errors.
        _ValidatorTimeoutException: If code execution exceeds timeout.
    """
    validation_code = inputs.get("validationCode", "").strip()

    if not validation_code:
        raise ValueError(
            "Validation code is required for custom_function validation"
        )

    if len(validation_code) > self.MAX_CODE_LENGTH:
        raise ValueError(
            f"Validation code too long ({len(validation_code)} chars, "
            f"max {self.MAX_CODE_LENGTH})"
        )

    # Compile with RestrictedPython
    try:
        byte_code = compile_restricted(
            validation_code,
            filename="<validator_custom_function>",
            mode="exec",
        )
        if byte_code is None:
            raise ValueError(
                "Failed to compile validation code "
                "(syntax error or restricted operation)"
            )
    except SyntaxError as e:
        raise ValueError(f"Syntax error in validation code: {e}") from None

    # Prepare safe execution environment
    safe_env = self._build_safe_env()
    safe_env["data"] = input_data
    safe_env["valid"] = False  # Default: invalid
    safe_env["errors"] = []    # User appends error messages here

    # Execute with timeout protection
    old_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(self.CUSTOM_CODE_TIMEOUT)

    try:
        exec(byte_code, safe_env)  # noqa: S102
    except _ValidatorTimeoutException:
        raise ValueError(
            f"Validation code execution timed out after "
            f"{self.CUSTOM_CODE_TIMEOUT}s"
        )
    except Exception as e:
        # Runtime error in validation code
        return False, [f"Validation code runtime error: {str(e)}"]
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)

    # Extract results
    is_valid = bool(safe_env.get("valid", False))
    error_list = safe_env.get("errors", [])

    # Ensure errors is a list of strings
    if not isinstance(error_list, list):
        error_list = [str(error_list)]
    else:
        error_list = [str(e) for e in error_list]

    # If not valid and no errors were provided, add a generic one
    if not is_valid and not error_list:
        error_list = ["Custom validation failed (no specific error provided)"]

    return is_valid, error_list
```

**Key design decisions:**

- **Variable naming:** The user code receives `data` (not `input`, which shadows a Python builtin) and sets `valid` (boolean) and `errors` (list). This is more intuitive than requiring `result` like in `filter_executor.py`.
- **Default is invalid:** `valid` starts as `False`. The user must explicitly set `valid = True` for the data to pass. This is a fail-safe design -- if the code crashes or forgets to set `valid`, the data is rejected.
- **Error collection:** The `errors` list allows the user to provide multiple specific error messages, which are passed through to the output.
- **Runtime error handling:** If the user's code crashes, the validation fails with a descriptive error message rather than halting the entire workflow (unless `stopOnError` is True).
- **Code length limit** (5000 chars) prevents abuse through extremely large validation scripts.

### 1.7 Shared Helpers

```python
def _build_safe_env(self) -> dict[str, Any]:
    """Build a safe execution environment for RestrictedPython.

    Provides safe builtins, iteration guards, and common utility functions
    (len, str, int, float, bool, list, dict, set, tuple, sorted, min, max,
     enumerate, zip, range, isinstance, type, hasattr, getattr, abs, round).

    Returns:
        Dictionary with safe builtins and globals suitable for exec().
    """
    safe_env: dict[str, Any] = {
        "__builtins__": safe_builtins,
        "_getiter_": guarded_iter_unpack_sequence,
        "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
    }
    safe_env.update(safe_globals)
    return safe_env


def _truncate(self, text: str, max_length: int) -> str:
    """Truncate a string for use in error messages.

    Args:
        text: The string to truncate.
        max_length: Maximum allowed length.

    Returns:
        The original string if short enough, or truncated with '...' suffix.
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."
```

---

## Step 2: Node Registry Specification

**File:** `python-backend/app/orchestrator/node_registry.py`

Add the validator node registration in `_register_core_nodes()` under the `PHASE 2.2: Data Manipulation` section, after the existing `filter` registration.

### 2.1 Registry Spec

```python
# Validator (Schema Validation)
self.register_node_type(
    NodeTypeSpec(
        type="validator",
        display_name="Validator",
        description="Validate data against JSON Schema, regex patterns, types, or custom validation functions",
        icon="shield-check",
        color="teal",
        category="data",
        inputs=[
            InputSpec(
                name="validationType",
                display_name="Validation Type",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="json_schema",
                options=[
                    {"label": "JSON Schema (Draft-07)", "value": "json_schema"},
                    {"label": "Regex Pattern", "value": "regex"},
                    {"label": "Type Check", "value": "type_check"},
                    {"label": "Custom Function", "value": "custom_function"},
                ],
            ),
            InputSpec(
                name="input",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Data to validate (connect from upstream node)...",
            ),
            # --- JSON Schema mode fields ---
            InputSpec(
                name="schema",
                display_name="JSON Schema",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=False,
                default={"type": "object", "properties": {}, "required": []},
                placeholder='{"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}',
            ),
            # --- Regex mode fields ---
            InputSpec(
                name="pattern",
                display_name="Regex Pattern",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder=r"^[\w.-]+@[\w.-]+\.\w{2,}$",
            ),
            # --- Type check mode fields ---
            InputSpec(
                name="expectedType",
                display_name="Expected Type",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="object",
                options=[
                    {"label": "String", "value": "string"},
                    {"label": "Number", "value": "number"},
                    {"label": "Integer", "value": "integer"},
                    {"label": "Boolean", "value": "boolean"},
                    {"label": "Array", "value": "array"},
                    {"label": "Object", "value": "object"},
                    {"label": "Null", "value": "null"},
                ],
            ),
            # --- Custom function mode fields ---
            InputSpec(
                name="validationCode",
                display_name="Validation Code (Python)",
                data_type="text",
                ui_type="textarea",
                required=False,
                accepts_connection=False,
                placeholder=(
                    "# 'data' is the input value to validate\n"
                    "# Set 'valid' to True if validation passes\n"
                    "# Append messages to 'errors' list for failures\n\n"
                    "if isinstance(data, dict) and 'email' in data:\n"
                    "    valid = True\n"
                    "else:\n"
                    "    errors.append('Missing required field: email')"
                ),
            ),
            # --- Shared options ---
            InputSpec(
                name="stopOnError",
                display_name="Stop on Validation Failure",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
        ],
        outputs=[
            OutputSpec(name="valid", display_name="Valid", data_type="boolean"),
            OutputSpec(name="errors", display_name="Errors", data_type="array"),
            OutputSpec(
                name="validatedData",
                display_name="Validated Data",
                data_type="any",
            ),
        ],
        executor="app.orchestrator.node_executors.data_executors.validator_executor.ValidatorExecutor",
    )
)
```

### 2.2 Output Port Data Type Rationale

| Port | Data Type | Rationale |
|------|-----------|-----------|
| `valid` | `boolean` | Clean boolean flag for downstream conditional branching. Pairs naturally with a Conditional Branch node (`valid` -> true branch, connect error handling to false branch). |
| `errors` | `array` | Array of human-readable error strings. Useful for logging, notification, or displaying to users. Empty array when valid. |
| `validatedData` | `any` | Passthrough of the original input data when valid, `None` when invalid. Downstream nodes connect to this port to receive only validated data. The `any` type preserves the original data type. |

### 2.3 Conditional Field Visibility (Future Enhancement)

Same note as the filter node plan: the current `InputSpec` does not support conditional field visibility. All fields are rendered regardless of `validationType`. Fields irrelevant to the current mode are simply left empty and ignored by the executor. The placeholder text in each field indicates which mode it belongs to.

### 2.4 Executor Module Path

The executor is placed at `data_executors/validator_executor.py` because validation is a data quality operation, consistent with other data manipulation nodes (filter, map, merge, set_variable, code_runner).

---

## Step 3: `__init__.py` Update

**File:** `python-backend/app/orchestrator/node_executors/data_executors/__init__.py`

Add `ValidatorExecutor` to the exports:

```python
"""Data shaping node executors."""

from app.orchestrator.node_executors.data_executors.database_query_executor import (
    DatabaseQueryExecutor,
    SQLValidator,
)
from app.orchestrator.node_executors.data_executors.validator_executor import (
    ValidatorExecutor,
)

__all__ = ["DatabaseQueryExecutor", "SQLValidator", "ValidatorExecutor"]
```

---

## Step 4: Security Analysis

### 4.1 JSON Schema Mode

| Threat | Mitigation |
|--------|------------|
| Schema bomb (deeply nested `$ref` loops) | `jsonschema` library handles circular `$ref` detection and raises `RefResolutionError`. Default recursion limit applies. |
| Remote `$ref` loading (`"$ref": "https://evil.com/schema.json"`) | `Draft7Validator` does NOT automatically resolve remote `$ref` URIs by default. Requires explicit `RefResolver` configuration. No risk. |
| Extremely large schema | No explicit limit needed -- `jsonschema` processes schemas lazily. Error count capped at `MAX_SCHEMA_ERRORS`. |
| Schema with `pattern` keyword containing ReDoS pattern | `jsonschema` validates patterns using Python's `re` module, which has no built-in timeout. However, the per-pattern matching is bounded by the individual property values being validated, not attacker-controlled. **Acceptable risk** -- the pattern comes from the workflow author (trusted user), not from external input. |

### 4.2 Regex Mode

| Threat | Mitigation |
|--------|------------|
| ReDoS (catastrophic backtracking) | SIGALRM timeout of 5 seconds. Pattern length capped at 1000 chars. |
| Pattern injection (if pattern comes from upstream node) | Pattern is `accepts_connection=False` in the registry spec, so it cannot be connected to upstream nodes. It is always a static configuration value set by the workflow author. |
| Null input | Converted to empty string `""` before matching. |

### 4.3 Custom Function Mode

| Threat | Mitigation |
|--------|------------|
| Arbitrary code execution | RestrictedPython blocks: `import`, `open()`, `exec()`, `eval()`, `__import__()`, attribute access on dunder methods, `globals()`, `locals()`, file system access, network access. |
| Infinite loop | SIGALRM timeout of 10 seconds kills execution. |
| Memory exhaustion | RestrictedPython does not limit memory. **Acceptable risk** -- same as `code_executor.py` and `filter_executor.py`. Future enhancement: run in subprocess with memory limit. |
| Code length abuse | Capped at 5000 chars. |
| Side effects via mutable `data` | The user receives a reference to the input data. If they mutate it, it affects the validated output. This is **intentional** -- it allows validation code to also normalize data (e.g., strip whitespace, lowercase emails). |

### 4.4 Type Check Mode

No security concerns. Pure `isinstance()` checks with no user-controlled code execution.

---

## Step 5: Performance Optimization Strategy

### 5.1 JSON Schema: Compiled Validator

`Draft7Validator(schema)` compiles the schema once. The `iter_errors()` method then validates efficiently. For repeated validation of the same schema (e.g., in a loop), the validator instance could be cached, but since each node execution creates a fresh one, this is sufficient.

### 5.2 Regex: Compiled Pattern

`re.compile(pattern)` compiles the pattern once. The compiled regex is then used for `fullmatch()`. Combined with SIGALRM timeout, this prevents both compilation and matching from blocking.

### 5.3 Custom Code: Compile Once, Execute Once

Unlike `filter_executor.py` which compiles once and executes per-item, the validator compiles and executes once per node execution. This is inherently efficient.

### 5.4 Type Check: O(1)

`isinstance()` is a single operation. No optimization needed.

### 5.5 Error Message Construction

Error messages are constructed lazily -- only when validation fails. Truncation (`_truncate()`) prevents large values from generating enormous error strings.

---

## Step 6: Edge Cases and Error Handling

| Scenario | Behavior |
|----------|----------|
| `validationType` missing | `ValueError("validationType is required")` |
| `validationType` unsupported | `ValueError("Invalid validationType: ...")` |
| `input` is `None` | Passed through to validators. json_schema validates against `{"type": "null"}`. regex matches empty string. type_check checks for `null`. custom_function receives `None`. |
| `input` is `undefined`/missing | `data.inputs.get("input")` returns `None`. Same as above. |
| **JSON Schema mode:** |  |
| Schema missing | `ValueError("JSON Schema is required...")` |
| Schema not a dict | `ValueError("JSON Schema must be an object...")` |
| Invalid JSON Schema structure | `ValueError("Invalid JSON Schema: ...")` via `Draft7Validator.check_schema()` |
| Valid data | Returns `{valid: True, errors: [], validatedData: data}` |
| Invalid data | Returns `{valid: False, errors: ["[path] message", ...], validatedData: None}` |
| Many validation errors | Capped at 50 errors, with count indicator |
| **Regex mode:** |  |
| Pattern missing | `ValueError("Regex pattern is required...")` |
| Pattern not a string | `ValueError("Regex pattern must be a string...")` |
| Pattern too long (>1000 chars) | `ValueError("Regex pattern too long...")` |
| Invalid regex syntax | `ValueError("Invalid regex pattern: ...")` |
| Match succeeds | Returns `{valid: True, errors: [], validatedData: data}` |
| Match fails | Returns `{valid: False, errors: ["Value '...' does not match pattern '...'"], validatedData: None}` |
| ReDoS timeout | `ValueError("Regex matching timed out...")` |
| **Type check mode:** |  |
| Expected type missing | `ValueError("expectedType is required...")` |
| Unsupported type name | `ValueError("Invalid expectedType: ...")` |
| Type matches | Returns `{valid: True, errors: [], validatedData: data}` |
| Type mismatch | Returns `{valid: False, errors: ["Expected type '...', got '...'"], validatedData: None}` |
| `True` with expectedType `"number"` | Fails (bool not treated as number) |
| `True` with expectedType `"boolean"` | Passes |
| **Custom function mode:** |  |
| Code missing | `ValueError("Validation code is required...")` |
| Code too long (>5000 chars) | `ValueError("Validation code too long...")` |
| Syntax error | `ValueError("Syntax error in validation code: ...")` |
| Runtime error in code | Returns `{valid: False, errors: ["Validation code runtime error: ..."]}` |
| Code sets `valid = True` | Returns `{valid: True, errors: [], validatedData: data}` |
| Code doesn't set `valid` | Returns `{valid: False, errors: ["Custom validation failed (no specific error provided)"]}` |
| Code timeout | `ValueError("Validation code execution timed out...")` |
| **stopOnError behavior:** |  |
| `stopOnError=True` and valid | Normal return |
| `stopOnError=True` and invalid | `ValueError("Validation failed (type): error summary")` -- halts workflow |
| `stopOnError=False` and invalid | Normal return with `valid: False` -- workflow continues |

---

## Step 7: Test Plan

**File:** `python-backend/tests/test_validator_executor.py`

### 7.1 Test Categories and Cases

```python
import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.data_executors.validator_executor import (
    ValidatorExecutor,
)


# ===== Fixtures =====

@pytest.fixture
def executor():
    """ValidatorExecutor instance."""
    return ValidatorExecutor()


@pytest.fixture
def context():
    """Standard execution context."""
    return ExecutionContext(
        user_id=1,
        tenant_id="test",
        workflow_id="wf-1",
        execution_id="exec-1",
    )


@pytest.fixture
def make_data():
    """Factory for creating NodeExecutionData with defaults."""
    def _make(inputs: dict, state: dict | None = None):
        return NodeExecutionData(
            node_id="validator-1",
            node_type="validator",
            config={},
            inputs=inputs,
            state=state or {},
        )
    return _make


# ===== Configuration Validation Tests =====

@pytest.mark.asyncio
class TestValidatorConfiguration:
    """Tests for executor configuration validation."""

    async def test_missing_validation_type_raises(self, executor, context, make_data):
        """Missing validationType raises ValueError."""

    async def test_invalid_validation_type_raises(self, executor, context, make_data):
        """Unsupported validationType raises ValueError."""

    async def test_all_supported_types_accepted(self, executor, context, make_data):
        """All four validation types are accepted without configuration error."""


# ===== JSON Schema Mode Tests =====

@pytest.mark.asyncio
class TestValidatorJsonSchema:
    """Tests for JSON Schema (draft-07) validation."""

    async def test_valid_object_passes(self, executor, context, make_data):
        """Valid object against schema returns valid=True."""

    async def test_missing_required_field_fails(self, executor, context, make_data):
        """Object missing required field returns valid=False with error."""

    async def test_wrong_type_fails(self, executor, context, make_data):
        """String where number expected returns valid=False."""

    async def test_nested_schema_validation(self, executor, context, make_data):
        """Nested object properties are validated correctly."""

    async def test_array_items_validation(self, executor, context, make_data):
        """Array items are validated against items schema."""

    async def test_additional_properties_false(self, executor, context, make_data):
        """Extra properties rejected when additionalProperties=false."""

    async def test_pattern_property_validation(self, executor, context, make_data):
        """String matching a pattern keyword in schema."""

    async def test_enum_validation(self, executor, context, make_data):
        """Value not in enum list returns error."""

    async def test_multiple_errors_collected(self, executor, context, make_data):
        """Multiple validation failures are all reported."""

    async def test_error_includes_json_path(self, executor, context, make_data):
        """Error messages include the JSON path to the failing property."""

    async def test_schema_missing_raises(self, executor, context, make_data):
        """Missing schema raises ValueError."""

    async def test_schema_not_dict_raises(self, executor, context, make_data):
        """Non-dict schema raises ValueError."""

    async def test_invalid_schema_structure_raises(self, executor, context, make_data):
        """Malformed schema (e.g., invalid type keyword) raises ValueError."""

    async def test_null_input_against_null_type(self, executor, context, make_data):
        """None input validated against {"type": "null"} passes."""

    async def test_null_input_against_object_type(self, executor, context, make_data):
        """None input validated against {"type": "object"} fails."""

    async def test_error_count_capped(self, executor, context, make_data):
        """More than MAX_SCHEMA_ERRORS errors are capped with count."""


# ===== Regex Mode Tests =====

@pytest.mark.asyncio
class TestValidatorRegex:
    """Tests for regex pattern matching validation."""

    async def test_email_pattern_valid(self, executor, context, make_data):
        """Valid email matches email pattern."""

    async def test_email_pattern_invalid(self, executor, context, make_data):
        """Invalid email does not match email pattern."""

    async def test_numeric_pattern(self, executor, context, make_data):
        """Numeric string matches '^\\d+$' pattern."""

    async def test_fullmatch_behavior(self, executor, context, make_data):
        """Pattern must match entire string, not just substring."""

    async def test_non_string_input_coerced(self, executor, context, make_data):
        """Non-string input is converted to string before matching."""

    async def test_none_input_matches_empty(self, executor, context, make_data):
        """None input is converted to '' for matching."""

    async def test_pattern_missing_raises(self, executor, context, make_data):
        """Missing pattern raises ValueError."""

    async def test_pattern_invalid_syntax_raises(self, executor, context, make_data):
        """Invalid regex syntax raises ValueError."""

    async def test_pattern_too_long_raises(self, executor, context, make_data):
        """Pattern exceeding MAX_PATTERN_LENGTH raises ValueError."""

    async def test_error_message_truncated(self, executor, context, make_data):
        """Long input values are truncated in error messages."""


# ===== Type Check Mode Tests =====

@pytest.mark.asyncio
class TestValidatorTypeCheck:
    """Tests for type validation."""

    async def test_string_type_valid(self, executor, context, make_data):
        """String input matches 'string' type."""

    async def test_number_type_int(self, executor, context, make_data):
        """Int input matches 'number' type."""

    async def test_number_type_float(self, executor, context, make_data):
        """Float input matches 'number' type."""

    async def test_integer_type_valid(self, executor, context, make_data):
        """Int input matches 'integer' type."""

    async def test_integer_type_rejects_float(self, executor, context, make_data):
        """Float input does not match 'integer' type."""

    async def test_boolean_type_valid(self, executor, context, make_data):
        """Boolean input matches 'boolean' type."""

    async def test_boolean_not_treated_as_number(self, executor, context, make_data):
        """Boolean input does NOT match 'number' type (Python subclass guard)."""

    async def test_boolean_not_treated_as_integer(self, executor, context, make_data):
        """Boolean input does NOT match 'integer' type."""

    async def test_array_type_valid(self, executor, context, make_data):
        """List input matches 'array' type."""

    async def test_object_type_valid(self, executor, context, make_data):
        """Dict input matches 'object' type."""

    async def test_null_type_valid(self, executor, context, make_data):
        """None input matches 'null' type."""

    async def test_null_type_rejects_string(self, executor, context, make_data):
        """String input does not match 'null' type."""

    async def test_expected_type_missing_raises(self, executor, context, make_data):
        """Missing expectedType raises ValueError."""

    async def test_unsupported_type_raises(self, executor, context, make_data):
        """Unsupported type name raises ValueError."""


# ===== Custom Function Mode Tests =====

@pytest.mark.asyncio
class TestValidatorCustomFunction:
    """Tests for custom Python validation functions."""

    async def test_simple_valid_check(self, executor, context, make_data):
        """Code sets valid=True -> passes."""

    async def test_simple_invalid_check(self, executor, context, make_data):
        """Code appends error and doesn't set valid -> fails."""

    async def test_multiple_errors_collected(self, executor, context, make_data):
        """Code appends multiple errors -> all returned."""

    async def test_complex_validation_logic(self, executor, context, make_data):
        """Multi-field validation with conditional logic."""

    async def test_code_receives_data_variable(self, executor, context, make_data):
        """Validate that the code receives 'data' variable with input."""

    async def test_code_default_invalid(self, executor, context, make_data):
        """Code that doesn't set valid -> defaults to False."""

    async def test_generic_error_when_no_errors_provided(self, executor, context, make_data):
        """Invalid with empty errors list -> generic error message added."""

    async def test_code_empty_raises(self, executor, context, make_data):
        """Empty validation code raises ValueError."""

    async def test_code_syntax_error_raises(self, executor, context, make_data):
        """Syntax error in validation code raises ValueError."""

    async def test_code_runtime_error(self, executor, context, make_data):
        """Runtime error in code -> returns invalid with error message."""

    async def test_code_restricted_import_blocked(self, executor, context, make_data):
        """Import statements in code are blocked by RestrictedPython."""

    async def test_code_restricted_file_access_blocked(self, executor, context, make_data):
        """File access (open) in code is blocked by RestrictedPython."""

    async def test_code_too_long_raises(self, executor, context, make_data):
        """Code exceeding MAX_CODE_LENGTH raises ValueError."""


# ===== stopOnError Behavior Tests =====

@pytest.mark.asyncio
class TestValidatorStopOnError:
    """Tests for stopOnError configuration."""

    async def test_stop_on_error_true_raises_on_failure(self, executor, context, make_data):
        """stopOnError=True and invalid -> raises ValueError."""

    async def test_stop_on_error_true_no_raise_on_success(self, executor, context, make_data):
        """stopOnError=True and valid -> normal return."""

    async def test_stop_on_error_false_returns_on_failure(self, executor, context, make_data):
        """stopOnError=False and invalid -> returns {valid: False, errors: [...]}."""

    async def test_stop_on_error_default_is_true(self, executor, context, make_data):
        """Default stopOnError behavior is True."""

    async def test_error_summary_truncated(self, executor, context, make_data):
        """stopOnError=True ValueError includes first 5 errors."""


# ===== Output Format Tests =====

@pytest.mark.asyncio
class TestValidatorOutputFormat:
    """Tests for output port values."""

    async def test_valid_output_structure(self, executor, context, make_data):
        """Successful validation returns correct output structure."""

    async def test_invalid_output_structure(self, executor, context, make_data):
        """Failed validation (stopOnError=False) returns correct structure."""

    async def test_validated_data_is_input_when_valid(self, executor, context, make_data):
        """validatedData is the original input when validation passes."""

    async def test_validated_data_is_none_when_invalid(self, executor, context, make_data):
        """validatedData is None when validation fails."""

    async def test_errors_empty_when_valid(self, executor, context, make_data):
        """errors is empty list when validation passes."""
```

### 7.2 Test Data Examples

```python
# JSON Schema test schemas
SIMPLE_OBJECT_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "age": {"type": "integer", "minimum": 0},
        "email": {"type": "string", "format": "email"},
    },
    "required": ["name", "age"],
}

NESTED_SCHEMA = {
    "type": "object",
    "properties": {
        "user": {
            "type": "object",
            "properties": {
                "profile": {
                    "type": "object",
                    "properties": {
                        "bio": {"type": "string", "maxLength": 500},
                    },
                },
            },
        },
    },
}

ARRAY_SCHEMA = {
    "type": "array",
    "items": {"type": "integer"},
    "minItems": 1,
    "maxItems": 10,
}

# Regex test patterns
EMAIL_PATTERN = r"^[\w.-]+@[\w.-]+\.\w{2,}$"
NUMERIC_PATTERN = r"^\d+$"
UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

# Custom validation code examples
CUSTOM_CODE_VALID = """\
if isinstance(data, dict) and "name" in data:
    valid = True
else:
    errors.append("Input must be a dict with 'name' field")
"""

CUSTOM_CODE_MULTI_ERROR = """\
if not isinstance(data, dict):
    errors.append("Must be a dictionary")
else:
    if "name" not in data:
        errors.append("Missing 'name'")
    if "email" not in data:
        errors.append("Missing 'email'")
    if not errors:
        valid = True
"""
```

---

## Step 8: Implementation Checklist

- [ ] **8.1** Create `python-backend/app/orchestrator/node_executors/data_executors/validator_executor.py`
  - [ ] `ValidatorExecutor` class with `execute()` method
  - [ ] `_validate_json_schema()` with Draft7Validator and error collection
  - [ ] `_validate_regex()` with pattern compilation and SIGALRM timeout
  - [ ] `_validate_type_check()` with type map and bool/int guard
  - [ ] `_validate_custom_function()` with RestrictedPython and timeout
  - [ ] `_build_safe_env()` helper (consistent with filter_executor pattern)
  - [ ] `_truncate()` helper for error message formatting
  - [ ] `_ValidatorTimeoutException` and `_timeout_handler` (module level)
  - [ ] Docstrings and type hints throughout
  - [ ] Follow Black formatting (100 char line length)

- [ ] **8.2** Register node in `python-backend/app/orchestrator/node_registry.py`
  - [ ] Add `NodeTypeSpec` with all InputSpecs and OutputSpecs
  - [ ] Place under `PHASE 2.2: Data Manipulation` section, after filter registration
  - [ ] Verify executor dotpath matches file location
  - [ ] Verify icon name (`shield-check`) exists in Lucide icons

- [ ] **8.3** Update `python-backend/app/orchestrator/node_executors/data_executors/__init__.py`
  - [ ] Add `ValidatorExecutor` import and export

- [ ] **8.4** Create `python-backend/tests/test_validator_executor.py`
  - [ ] Configuration validation tests (3 tests)
  - [ ] JSON Schema mode tests (16 tests)
  - [ ] Regex mode tests (10 tests)
  - [ ] Type check mode tests (14 tests)
  - [ ] Custom function mode tests (13 tests)
  - [ ] stopOnError behavior tests (5 tests)
  - [ ] Output format tests (5 tests)
  - [ ] All tests pass

- [ ] **8.5** Verification
  - [ ] `pytest tests/test_validator_executor.py` -- all pass
  - [ ] `pytest` -- full suite, no regressions
  - [ ] `black app/ tests/` -- formatting clean
  - [ ] `ruff check app/` -- no lint errors
  - [ ] `mypy app/orchestrator/node_executors/data_executors/validator_executor.py` -- no type errors

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| ReDoS attack via regex pattern | HIGH | SIGALRM 5s timeout. Pattern length capped at 1000 chars. Pattern is not connectable (workflow author sets it statically). |
| RestrictedPython bypass in custom_function mode | HIGH | Same sandbox as `code_executor.py` and `filter_executor.py`. No new attack surface. SIGALRM timeout prevents infinite loops. |
| JSON Schema `$ref` to external URL | MEDIUM | `Draft7Validator` does NOT auto-resolve remote `$ref` by default. No risk. |
| JSON Schema with ReDoS `pattern` keyword | MEDIUM | Pattern comes from workflow author (trusted). Not from external input. Acceptable risk. |
| SIGALRM not available on Windows | MEDIUM | Production runs on Linux. Dev environments on macOS also support SIGALRM. Windows dev is edge case -- add try/except fallback to skip timeout. |
| Missing conditional field visibility in UI | LOW | All fields rendered. Unused fields ignored by executor. Placeholder text guides users. Same approach as filter/map nodes. |
| Memory exhaustion in custom validation code | LOW | RestrictedPython does not limit memory. Same acceptable risk as existing code_executor. Future: subprocess with memory limit. |
| Bool/int ambiguity in type_check | LOW | Explicitly handled with guard clause. Documented in tests. |

---

## Dependencies

- **No new Python dependencies.** All required libraries are already in `requirements.txt`:
  - `jsonschema==4.21.0` (used for JSON Schema validation)
  - `RestrictedPython>=8.1` (used for custom function sandbox)
  - `re` (stdlib, used for regex validation)
  - `signal` (stdlib, used for timeout protection)
- **No database changes.**
- **No frontend changes.** The UI renders dynamically from the registry.
- **No migration needed.**

---

## Workflow Integration Examples

### Example 1: Validate LLM Output Structure

```
[LLM Call] --response--> [Validator] --validatedData--> [Merge Data]
                              |
                          stopOnError=True
                          validationType=json_schema
                          schema={"type":"object","required":["title","summary"]}
```

Use case: Ensure the LLM returns a properly structured JSON object before merging it into a larger dataset.

### Example 2: Validate Email Format from Form Input

```
[Form Input] --values.email--> [Validator] --valid--> [Conditional Branch]
                                    |                       |         |
                                stopOnError=False       true      false
                                validationType=regex       |         |
                                pattern=^[\w.-]+@...    [Send]  [Error Response]
```

Use case: Validate email format from user input. Route valid emails to send, invalid ones to error handling.

### Example 3: Type Guard Before Array Processing

```
[HTTP Request] --body--> [Validator] --validatedData--> [Filter] --filtered--> [Map Array]
                              |
                          stopOnError=True
                          validationType=type_check
                          expectedType=array
```

Use case: Ensure the API response is an array before attempting to filter/map it. Prevents cryptic downstream errors.

### Example 4: Custom Business Rule Validation

```
[Database Query] --rows--> [Loop] --item--> [Validator] --validatedData--> [LLM Call]
                                                |
                                            stopOnError=False
                                            validationType=custom_function
                                            validationCode="
                                              if data.get('status') != 'active':
                                                  errors.append('Inactive record')
                                              elif data.get('balance', 0) < 0:
                                                  errors.append('Negative balance')
                                              else:
                                                  valid = True
                                            "
```

Use case: Apply business rules to each database record before processing. Skip invalid records without halting the entire workflow.

---

## Future Enhancements (Out of Scope)

1. **Conditional field visibility** in `InputSpec` + `DynamicNodeConfig.tsx` to show/hide fields based on `validationType`.
2. **Schema auto-detection** from upstream node output type (infer JSON Schema from sample data).
3. **Schema library/preset** support -- allow users to select from predefined schemas (e.g., "Email", "URL", "ISO Date", "UUID").
4. **`code_editor` ui_type** for `validationCode` field (syntax highlighting, line numbers).
5. **Validation result caching** -- cache schema compilation for repeated executions in loops.
6. **Batch validation mode** -- validate an array of items and return per-item results (currently validates a single input per execution).
7. **JSON Schema 2020-12 support** -- upgrade to newer draft when `jsonschema` library supports it.
8. **OpenAPI Schema validation** -- accept OpenAPI component schemas directly.
