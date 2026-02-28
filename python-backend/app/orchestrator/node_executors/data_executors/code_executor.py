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

    Routes to OpenSandbox when enabled for full Python environment access,
    or falls back to RestrictedPython for restricted local execution.
    """

    def _is_sandbox_enabled(self) -> bool:
        """Check if sandbox execution is enabled."""
        try:
            from app.integrations.opensandbox.config import opensandbox_settings
            return opensandbox_settings.is_enabled
        except Exception:
            return False

    def _get_dispatch_mode(self) -> str:
        """Get sandbox dispatch mode (optional or required)."""
        try:
            from app.integrations.opensandbox.config import opensandbox_settings
            return opensandbox_settings.OPENSANDBOX_DISPATCH_MODE
        except Exception:
            return "optional"

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute Python code via sandbox or RestrictedPython fallback."""
        code = data.inputs.get("code", "").strip()
        input_data = data.inputs.get("input")
        timeout = int(data.inputs.get("timeout", 30))

        if not code:
            raise ValueError("Python code is required")

        # Route to sandbox when enabled
        if self._is_sandbox_enabled():
            try:
                return await self._execute_in_sandbox(code, input_data, timeout, context)
            except Exception as e:
                if self._get_dispatch_mode() == "required":
                    raise
                logger.warning(
                    "Sandbox execution failed, falling back to RestrictedPython: %s",
                    str(e),
                )

        # Legacy: RestrictedPython path
        return self._execute_restricted(code, input_data, timeout)

    async def _execute_in_sandbox(
        self,
        code: str,
        input_data: Any,
        timeout: int,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute code via OpenSandbox with full Python environment."""
        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.config import opensandbox_settings
        from app.integrations.opensandbox.execution import run_code
        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
        from app.integrations.opensandbox.models import SandboxConfig

        # Wrap user code to capture result and provide input_data
        wrapper = f"""
import json, sys

input = json.loads('''{json.dumps(input_data) if input_data is not None else "null"}''')
result = None

{code}

# Output result as JSON
print(json.dumps({{"result": result}}))
"""

        sandbox_id: str | None = None
        client = OpenSandboxClient(opensandbox_settings)
        lifecycle = SandboxLifecycleManager(client)

        try:
            sandbox_id = await lifecycle.provision_sandbox(
                SandboxConfig(
                    image="python:3.11-slim",
                    timeout_seconds=max(timeout, 5),
                    network_default_action=opensandbox_settings.SANDBOX_DEFAULT_NETWORK_ACTION,
                    metadata={
                        "workflow_id": context.workflow_id or "",
                        "execution_id": context.execution_id or "",
                        "node_id": "code",
                    },
                ),
                job_id=context.execution_id or context.workflow_id or "workflow-code",
            )

            response = await run_code(
                client=client,
                sandbox_id=sandbox_id,
                code=wrapper,
                language="python",
            )
            if response.exit_code != 0:
                raise ValueError(
                    f"Code execution failed in sandbox: {response.stderr}"
                )
            stdout_text = response.stdout
        finally:
            try:
                if sandbox_id:
                    await lifecycle.destroy_sandbox(sandbox_id)
            finally:
                await client.close()

        # Parse result from stdout JSON
        result = None
        try:
            parsed = json.loads(stdout_text.strip().split("\n")[-1])
            result = parsed.get("result")
        except (json.JSONDecodeError, IndexError):
            pass

        return {
            "result": result,
            "stdout": stdout_text,
        }

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
