"""Filter Executor - Filter arrays based on conditions.

Supports three filter modes:
  - simple: Field-based comparison with 12 operators
  - expression: RestrictedPython boolean expression per item
  - custom_code: User-provided Python code with RestrictedPython sandbox
"""
import signal
from typing import Any

from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Guards import guarded_iter_unpack_sequence, safe_builtins

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class _FilterTimeoutException(Exception):
    """Raised when filter code execution exceeds timeout."""

    pass


def _timeout_handler(signum, frame):
    """Signal handler for filter execution timeout."""
    raise _FilterTimeoutException("Filter code execution timed out")


class FilterExecutor:
    """Executor for filter (array filtering) nodes.

    Filters arrays based on conditions using one of three modes:
      - simple: Compare a field value against a target using an operator
      - expression: Evaluate a boolean expression per item via RestrictedPython
      - custom_code: Execute user-provided Python code via RestrictedPython

    Performance characteristics:
      - Compile-once pattern for expression and custom_code modes
      - Linear O(n) scan for simple mode
      - Hard cap at MAX_ARRAY_SIZE items to prevent resource exhaustion
      - SIGALRM timeout for custom_code mode
    """

    # Supported comparison operators for simple mode
    OPERATORS = {
        "==",
        "!=",
        ">",
        "<",
        ">=",
        "<=",
        "contains",
        "startsWith",
        "endsWith",
        "in",
        "not_in",
        "exists",
        "not_exists",
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
        """Execute filter operation on an input array.

        Args:
            data: Node execution data containing inputs with inputArray,
                  filterMode, and mode-specific configuration.
            context: Execution context with user/workflow metadata.

        Returns:
            Dictionary with filtered array and count statistics:
              - filtered: List of items that passed the filter
              - filteredCount: Number of items that passed
              - originalCount: Number of items in the input array
              - removedCount: Number of items removed by the filter

        Raises:
            ValueError: If inputArray is not a list, exceeds MAX_ARRAY_SIZE,
                       or mode-specific configuration is invalid.
        """
        input_array = data.inputs.get("inputArray", [])
        filter_mode = data.inputs.get("filterMode", "simple")
        null_handling = data.inputs.get("nullHandling", "exclude")

        # Validate input
        if not isinstance(input_array, list):
            raise ValueError(f"inputArray must be an array, got {type(input_array).__name__}")

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

    # -------------------------------------------------------------------------
    # Simple Mode
    # -------------------------------------------------------------------------

    def _filter_simple(
        self,
        items: list[Any],
        inputs: dict[str, Any],
        null_handling: str,
    ) -> list[Any]:
        """Filter items using field comparison with an operator.

        Args:
            items: Array of items to filter.
            inputs: Node inputs containing field, operator, and value.
            null_handling: How to handle null field values ("exclude" or "include").

        Returns:
            List of items that match the comparison condition.

        Raises:
            ValueError: If field is empty or operator is unsupported.
        """
        field = inputs.get("field", "")
        operator = inputs.get("operator", "==")
        compare_value = inputs.get("value")

        if not field:
            raise ValueError("Field name is required for simple filter mode")

        if operator not in self.OPERATORS:
            raise ValueError(f"Invalid operator: {operator}")

        result: list[Any] = []
        for item in items:
            field_value = self._get_nested_value(item, field)

            # Handle null/missing values
            if field_value is None:
                # exists/not_exists operators evaluate null directly
                if operator in ("exists", "not_exists"):
                    if self._compare(field_value, operator, compare_value):
                        result.append(item)
                elif null_handling == "include":
                    result.append(item)
                # "exclude" (default) -> skip
                continue

            if self._compare(field_value, operator, compare_value):
                result.append(item)

        return result

    # -------------------------------------------------------------------------
    # Nested Field Path Extraction
    # -------------------------------------------------------------------------

    def _get_nested_value(self, obj: Any, path: str) -> Any:
        """Extract a value from a nested object using dot-separated path.

        Supports:
          - Dict key access: "user.name"
          - Nested dicts: "user.profile.age"
          - List indexing: "items.0.name"

        Args:
            obj: The object to extract a value from.
            path: Dot-separated field path.

        Returns:
            The extracted value, or None if path is invalid or value not found.
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

    # -------------------------------------------------------------------------
    # Operator Comparison Logic
    # -------------------------------------------------------------------------

    def _compare(self, field_value: Any, operator: str, compare_value: Any) -> bool:
        """Compare a field value against a target value using the specified operator.

        Type coercion: attempts numeric comparison first for ordering operators,
        falls back to string comparison.

        Args:
            field_value: The value extracted from the item.
            operator: The comparison operator string.
            compare_value: The target value to compare against.

        Returns:
            True if the comparison holds, False otherwise.
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
        """Numeric comparison with type coercion.

        Attempts to convert both values to float for numeric comparison.
        Falls back to string comparison if conversion fails.

        Args:
            a: Left-hand value.
            operator: One of ">", "<", ">=", "<=".
            b: Right-hand value.

        Returns:
            True if the comparison holds.
        """
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
        """String operations: contains, startsWith, endsWith.

        Both values are coerced to strings before comparison.

        Args:
            field_value: The field value to test.
            compare_value: The substring/prefix/suffix to search for.
            op: One of "contains", "startsWith", "endsWith".

        Returns:
            True if the string operation matches.
        """
        field_str = str(field_value)
        compare_str = str(compare_value)
        if op == "contains":
            return compare_str in field_str
        elif op == "startsWith":
            return field_str.startswith(compare_str)
        elif op == "endsWith":
            return field_str.endswith(compare_str)
        return False

    # -------------------------------------------------------------------------
    # Expression Mode (RestrictedPython)
    # -------------------------------------------------------------------------

    def _filter_expression(
        self,
        items: list[Any],
        inputs: dict[str, Any],
        state: dict[str, Any],
    ) -> list[Any]:
        """Filter items using a boolean expression evaluated via RestrictedPython.

        The expression can reference ``item`` as the current array element.
        Example expressions:
          - ``item.get('age', 0) > 18``
          - ``item['status'] == 'active' and item.get('score', 0) >= 50``

        The expression is compiled once and executed per item for performance.

        Args:
            items: Array of items to filter.
            inputs: Node inputs containing the expression string.
            state: Current workflow execution state.

        Returns:
            List of items for which the expression evaluates to True.

        Raises:
            ValueError: If expression is empty, too long, or has syntax errors.
        """
        expression = inputs.get("expression", "").strip()
        if not expression:
            raise ValueError("Expression is required for expression filter mode")

        # Strip {{ }} if present (user may copy from expression syntax)
        if expression.startswith("{{") and expression.endswith("}}"):
            expression = expression[2:-2].strip()

        # Security: validate expression length
        if len(expression) > 500:
            raise ValueError("Expression too long (max 500 characters)")

        # Wrap expression in assignment to capture boolean result
        wrapper_code = f"_result_ = bool({expression})"

        # Compile once
        try:
            byte_code = compile_restricted(
                wrapper_code,
                filename="<filter_expression>",
                mode="exec",
            )
            if byte_code is None:
                raise ValueError("Failed to compile filter expression")
        except SyntaxError as e:
            raise ValueError(f"Invalid filter expression: {e}") from None

        result: list[Any] = []
        for item in items:
            safe_env = self._build_safe_env()
            safe_env["item"] = item
            safe_env["_result_"] = False

            try:
                exec(byte_code, safe_env)  # noqa: S102
                if safe_env.get("_result_", False):
                    result.append(item)
            except Exception:
                # Expression failed for this item -> skip (treat as non-match)
                continue

        return result

    # -------------------------------------------------------------------------
    # Custom Code Mode (RestrictedPython)
    # -------------------------------------------------------------------------

    def _filter_custom_code(
        self,
        items: list[Any],
        inputs: dict[str, Any],
    ) -> list[Any]:
        """Filter items using user-provided Python code via RestrictedPython.

        The code receives ``item`` (current element) and ``index`` (position).
        The code must set ``result = True`` to keep the item.

        Compiled once, executed per item. Protected by SIGALRM timeout.

        Args:
            items: Array of items to filter.
            inputs: Node inputs containing the customCode string.

        Returns:
            List of items for which the code sets result to True.

        Raises:
            ValueError: If code is empty or has syntax errors.
            _FilterTimeoutException: If total execution exceeds timeout.
        """
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
            raise ValueError(f"Syntax error in custom code: {e}") from None

        result: list[Any] = []

        # Set timeout for the entire filtering operation
        old_handler = signal.getsignal(signal.SIGALRM)
        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(self.CUSTOM_CODE_TIMEOUT)

        try:
            for idx, item in enumerate(items):
                safe_env = self._build_safe_env()
                safe_env["item"] = item
                safe_env["index"] = idx
                safe_env["result"] = False  # Default: exclude

                try:
                    exec(byte_code, safe_env)  # noqa: S102
                    if safe_env.get("result", False):
                        result.append(item)
                except _FilterTimeoutException:
                    # Re-raise timeout so the outer handler catches it
                    raise
                except Exception:
                    # Code failed for this item -> skip, processing continues
                    continue
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

        return result

    # -------------------------------------------------------------------------
    # Shared Helpers
    # -------------------------------------------------------------------------

    def _build_safe_env(self) -> dict[str, Any]:
        """Build a safe execution environment for RestrictedPython.

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
