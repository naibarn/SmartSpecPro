"""Expression resolver for {{nodeId.output.field}} syntax."""
import re
from typing import Any


class ExpressionResolver:
    """Resolves {{variable}} expressions in workflow node configurations."""

    MAX_EXPRESSION_LENGTH = 1000
    MAX_EXPRESSION_DEPTH = 10  # Max dot-separated parts
    MAX_EXPRESSIONS_PER_TEXT = 50  # Max number of expressions in a single text

    # Only allow alphanumeric, underscores, hyphens, dots (safe path traversal)
    EXPRESSION_PATTERN = re.compile(r"\{\{([^}]+)\}\}")
    SAFE_EXPR_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.]+$")

    def resolve(self, text: str, state: dict[str, Any]) -> str:
        """
        Resolve all {{expressions}} in text using execution state.

        Args:
            text: Text containing {{nodeId.output.field}} expressions
            state: Execution state with node outputs

        Returns:
            Text with expressions replaced by actual values
        """
        if not text or not isinstance(text, str):
            return text

        if len(text) > self.MAX_EXPRESSION_LENGTH:
            raise ValueError(f"Expression too long (max {self.MAX_EXPRESSION_LENGTH})")

        # Count expressions to prevent abuse
        matches = self.EXPRESSION_PATTERN.findall(text)
        if len(matches) > self.MAX_EXPRESSIONS_PER_TEXT:
            raise ValueError(
                f"Too many expressions (max {self.MAX_EXPRESSIONS_PER_TEXT}, found {len(matches)})"
            )

        def replace_expression(match):
            expr = match.group(1).strip()

            # Validate expression format (only safe characters)
            if not self.SAFE_EXPR_PATTERN.match(expr):
                return f"{{{{{expr}}}}}"  # Return original for invalid format

            return str(self._evaluate_expression(expr, state))

        return self.EXPRESSION_PATTERN.sub(replace_expression, text)

    def _evaluate_expression(self, expr: str, state: dict[str, Any]) -> Any:
        """
        Evaluate a single expression like "nodeId.output.field".

        Args:
            expr: Expression without {{ }}
            state: Execution state

        Returns:
            Resolved value or original expression if not found
        """
        parts = expr.split(".")

        # Enforce depth limit
        if len(parts) > self.MAX_EXPRESSION_DEPTH:
            return f"{{{{{expr}}}}}"

        value: Any = state

        try:
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    return f"{{{{{expr}}}}}"  # Return original if path invalid

                if value is None:
                    return f"{{{{{expr}}}}}"  # Return original if not found

            return value
        except (KeyError, TypeError, AttributeError):
            return f"{{{{{expr}}}}}"  # Return original on error
