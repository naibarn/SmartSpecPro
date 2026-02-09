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
from jsonschema import Draft7Validator
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
            raise ValueError(f"Validation failed ({validation_type}): {error_summary}")

        return {
            "valid": valid,
            "errors": errors,
            "validatedData": input_data if valid else None,
        }

    # -------------------------------------------------------------------------
    # JSON Schema Validation
    # -------------------------------------------------------------------------

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
            raise ValueError(f"JSON Schema must be an object, got {type(schema).__name__}")

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
        for error in raw_errors[: self.MAX_SCHEMA_ERRORS]:
            path = (
                ".".join(str(p) for p in error.absolute_path)
                if error.absolute_path
                else "(root)"
            )
            errors.append(f"[{path}] {error.message}")

        if len(raw_errors) > self.MAX_SCHEMA_ERRORS:
            errors.append(f"... and {len(raw_errors) - self.MAX_SCHEMA_ERRORS} more errors")

        return False, errors

    # -------------------------------------------------------------------------
    # Regex Validation
    # -------------------------------------------------------------------------

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
        """
        pattern = inputs.get("pattern")

        if not pattern:
            raise ValueError("Regex pattern is required for regex validation")

        if not isinstance(pattern, str):
            raise ValueError(f"Regex pattern must be a string, got {type(pattern).__name__}")

        if len(pattern) > self.MAX_PATTERN_LENGTH:
            raise ValueError(
                f"Regex pattern too long ({len(pattern)} chars, max {self.MAX_PATTERN_LENGTH})"
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

    # -------------------------------------------------------------------------
    # Type Check Validation
    # -------------------------------------------------------------------------

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
            return False, [f"Expected {expected_type}, got boolean ({input_data})"]

        if isinstance(input_data, expected_py_type):
            return True, []

        return False, [
            f"Expected type '{expected_type}', got '{actual_type_name}' "
            f"(value: {self._truncate(repr(input_data), 100)})"
        ]

    # -------------------------------------------------------------------------
    # Custom Function Validation (RestrictedPython)
    # -------------------------------------------------------------------------

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

        Example user code::

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
        """
        validation_code = inputs.get("validationCode", "").strip()

        if not validation_code:
            raise ValueError("Validation code is required for custom_function validation")

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
        safe_env["errors"] = []  # User appends error messages here

        # Execute with timeout protection
        old_handler = signal.getsignal(signal.SIGALRM)
        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(self.CUSTOM_CODE_TIMEOUT)

        try:
            exec(byte_code, safe_env)  # noqa: S102
        except _ValidatorTimeoutException:
            raise ValueError(
                f"Validation code execution timed out after {self.CUSTOM_CODE_TIMEOUT}s"
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

    # -------------------------------------------------------------------------
    # Shared Helpers
    # -------------------------------------------------------------------------

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
        return text[: max_length - 3] + "..."
