"""Custom error types for the workflow engine."""


class CompilationError(Exception):
    """Raised when workflow compilation fails.

    Attributes:
        errors: List of specific validation failures.
        warnings: List of non-fatal issues (e.g., unreachable nodes).
    """

    def __init__(self, message: str, errors: list[str] | None = None, warnings: list[str] | None = None):
        super().__init__(message)
        self.errors = errors or [message]
        self.warnings = warnings or []


class RuntimeExecutionError(Exception):
    """Raised when workflow execution fails at the runtime level."""

    def __init__(self, message: str, node_id: str | None = None, execution_id: str | None = None):
        super().__init__(message)
        self.node_id = node_id
        self.execution_id = execution_id


class CheckpointerError(Exception):
    """Raised when the checkpointer fails after retry attempts."""
    pass
