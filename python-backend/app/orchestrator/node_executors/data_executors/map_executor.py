"""Map Array Executor - Transform each item in an array."""
import io
import signal
from contextlib import redirect_stdout
from typing import Any

from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Guards import guarded_iter_unpack_sequence, safe_builtins

from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class _TimeoutException(Exception):
    """Raised when custom code execution exceeds per-item timeout."""

    pass


def _timeout_handler(signum, frame):
    """Signal handler for per-item timeout in custom code execution."""
    raise _TimeoutException("Custom code timed out")


class MapExecutor:
    """Executor for map_array nodes.

    Transforms each item in an array using one of three modes:
      - extract: Pull a nested field from each item via dot-notation path
      - transform: Apply a {{expression}} template to each item
      - custom_code: Run user-provided Python in a RestrictedPython sandbox

    Per-item failures are collected in an errors array (soft failures);
    hard failures (invalid input, oversized array, syntax errors) raise immediately.
    """

    MAX_ARRAY_SIZE = 10_000
    CUSTOM_CODE_TIMEOUT = 5  # seconds per-item timeout

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute the map transformation across all items.

        Args:
            data: Node execution data containing inputs and state
            context: Execution context (user, workflow, etc.)

        Returns:
            Dictionary with mapped items, count, and any per-item errors

        Raises:
            ValueError: For invalid configuration or input types
        """
        input_array = data.inputs.get("inputArray")
        map_mode = data.inputs.get("mapMode", "extract")
        field = data.inputs.get("field", "")
        expression = data.inputs.get("expression", "")
        custom_code = data.inputs.get("customCode", "")
        output_field = data.inputs.get("outputField") or None

        # --- Validation ---
        if not isinstance(input_array, list):
            raise ValueError(f"inputArray must be an array, got {type(input_array).__name__}")

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

        # --- Compile custom code once before the loop ---
        compiled_code = None
        if map_mode == "custom_code":
            try:
                compiled_code = compile_restricted(
                    custom_code.strip(),
                    filename="<map_transform>",
                    mode="exec",
                )
                if compiled_code is None:
                    raise ValueError(
                        "Failed to compile custom code " "(syntax error or restricted operation)"
                    )
            except SyntaxError as e:
                raise ValueError(f"Syntax error in custom code: {e}") from e

        # --- Process items ---
        mapped: list[Any] = []
        errors: list[dict[str, Any]] = []

        for index, item in enumerate(input_array):
            try:
                if map_mode == "extract":
                    value = self._extract_field(item, field)
                elif map_mode == "transform":
                    value = self._transform_expression(item, index, expression, data.state)
                else:  # custom_code
                    value = self._execute_custom_code_compiled(item, index, compiled_code)

                # Optionally wrap result in an object
                mapped.append(self._wrap_output(value, output_field))

            except Exception as e:
                errors.append(
                    {
                        "index": index,
                        "item": item,
                        "error": str(e),
                    }
                )

        return {
            "mapped": mapped,
            "mappedCount": len(mapped),
            "errors": errors,
        }

    def _extract_field(self, item: Any, field_path: str) -> Any:
        """
        Extract a nested field from an item using dot-notation.

        Supports dict key access and numeric array indices.
        Examples: "user.name", "address.city", "items.0.name"

        Args:
            item: The source item (dict expected for field access)
            field_path: Dot-separated path like "user.name" or "tags.0"

        Returns:
            The extracted value, or None if the path doesn't exist

        Raises:
            ValueError: If item type doesn't support the requested access
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
                raise ValueError(f"Cannot access field '{part}' on {type(value).__name__}")

        return value

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

    def _execute_custom_code_compiled(
        self,
        item: Any,
        index: int,
        compiled_code: Any,
    ) -> Any:
        """
        Execute pre-compiled custom Python code for a single item.

        Available variables in the sandbox:
          - item: The current array element
          - index: The current array index (0-based)
          - result: Set this to the transformed value

        Args:
            item: Current array item
            index: Current array index
            compiled_code: Pre-compiled RestrictedPython bytecode

        Returns:
            The value of 'result' after code execution

        Raises:
            ValueError: If code execution fails or times out
        """
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
                exec(compiled_code, safe_env)  # noqa: S102

            signal.alarm(0)
        except _TimeoutException as e:
            signal.alarm(0)
            raise ValueError(
                f"Custom code timed out at index {index} " f"(limit: {self.CUSTOM_CODE_TIMEOUT}s)"
            ) from e
        except Exception as e:
            signal.alarm(0)
            raise ValueError(f"Custom code execution failed at index {index}: {e}") from e

        return safe_env.get("result")

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
