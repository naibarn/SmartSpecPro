"""Expression resolver for {{nodeId.output.field}} syntax."""
import re
from typing import Any


class ExpressionResolver:
    """Resolves {{variable}} expressions in workflow node configurations."""

    MAX_EXPRESSION_LENGTH = 1000
    EXPRESSION_PATTERN = re.compile(r"\{\{([^}]+)\}\}")

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

        def replace_expression(match):
            expr = match.group(1).strip()
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
        value = state

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
