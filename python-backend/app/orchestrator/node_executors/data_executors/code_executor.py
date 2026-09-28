"""Code Runner Executor - Execute custom Python code in a sandbox or RestrictedPython."""
import io
import json
import logging
import signal
from contextlib import redirect_stdout
from typing import Any

from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Guards import guarded_iter_unpack_sequence, safe_builtins

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class TimeoutException(Exception):
    """Raised when code execution exceeds timeout."""

    pass


def timeout_handler(signum, frame):
    """Signal handler for timeout."""
    raise TimeoutException("Code execution timed out")


class CodeExecutor:
    """Executor for code runner nodes.

    Runs only the restricted local execution path. OpenSandbox is retired.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute Python code via RestrictedPython."""
        code = data.inputs.get("code", "").strip()
        input_data = data.inputs.get("input")
        timeout = int(data.inputs.get("timeout", 30))

        if not code:
            raise ValueError("Python code is required")

        return self._execute_restricted(code, input_data, timeout)

    def _execute_restricted(
        self,
        code: str,
        input_data: Any,
        timeout: int,
    ) -> dict[str, Any]:
        """Execute code via RestrictedPython (legacy path)."""
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
            signal.alarm(0)
            raise TimeoutException(f"Code execution exceeded {timeout} second timeout")
        except Exception as e:
            signal.alarm(0)
            raise ValueError(f"Code execution failed: {str(e)}")

        result = safe_env.get("result")
        stdout_text = stdout_capture.getvalue()

        return {
            "result": result,
            "stdout": stdout_text,
        }
