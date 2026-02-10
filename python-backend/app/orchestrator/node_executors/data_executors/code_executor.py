"""Code Runner Executor - Execute custom Python code in a sandbox."""
import io
import signal
import sys
from contextlib import redirect_stdout
from typing import Any

from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Guards import guarded_iter_unpack_sequence, safe_builtins

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class TimeoutException(Exception):
    """Raised when code execution exceeds timeout."""

    pass


def timeout_handler(signum, frame):
    """Signal handler for timeout."""
    raise TimeoutException("Code execution timed out")


class CodeExecutor:
    """Executor for code runner nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute Python code in a restricted sandbox.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with execution result and stdout

        Raises:
            ValueError: If code is not provided
            TimeoutException: If execution exceeds timeout
            Exception: If code execution fails
        """
        code = data.inputs.get("code", "").strip()
        input_data = data.inputs.get("input")
        timeout = int(data.inputs.get("timeout", 30))

        if not code:
            raise ValueError("Python code is required")

        # Compile code with RestrictedPython
        try:
            byte_code = compile_restricted(
                code,
                filename="<workflow_code>",
                mode="exec",
            )

            if byte_code is None:
                raise ValueError("Failed to compile code (syntax error or restricted operation)")

        except SyntaxError as e:
            raise ValueError(f"Syntax error in code: {e}")

        # Prepare safe execution environment
        safe_env = {
            "__builtins__": safe_builtins,
            "_getiter_": guarded_iter_unpack_sequence,
            "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
            "input": input_data,
            "result": None,
        }

        # Also allow safe math/utility functions
        safe_env.update(safe_globals)

        # Capture stdout
        stdout_capture = io.StringIO()

        try:
            # Set timeout alarm
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(timeout)

            # Execute code with stdout redirect
            with redirect_stdout(stdout_capture):
                exec(byte_code, safe_env)

            # Cancel alarm
            signal.alarm(0)

        except TimeoutException:
            signal.alarm(0)  # Cancel alarm
            raise TimeoutException(f"Code execution exceeded {timeout} second timeout")
        except Exception as e:
            signal.alarm(0)  # Cancel alarm
            raise ValueError(f"Code execution failed: {str(e)}")

        # Get result
        result = safe_env.get("result")
        stdout_text = stdout_capture.getvalue()

        return {
            "result": result,
            "stdout": stdout_text,
        }
