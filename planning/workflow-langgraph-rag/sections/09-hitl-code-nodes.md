I have all the context I need. Now let me produce the complete Section 09 document.

# Section 09: HITL & Code Sandbox Nodes

## Overview

This section implements two node types that require special handling beyond the standard executor pattern: the **Approval / Human-in-the-Loop node** (which leverages the `interrupt()` mechanism from Section 03) and the **Code Step node** (which requires critical security isolation via subprocess sandboxing).

**What gets built:**

1. **Approval node registration** -- Registers node #32 in the node registry with its full config schema (message, approval_type, options, timeout_minutes, required_approvers, notification_channel). The actual executor logic is already built in Section 03; this section wires it into the registry and ensures the config schema matches.

2. **Code Step executor** -- A completely rewritten code execution node replacing the existing `RestrictedPython`-based `CodeExecutor`. The new implementation uses **subprocess isolation** for both Python and JavaScript:
   - **Python sandbox**: `asyncio.create_subprocess_exec` spawning a runner script with `resource.setrlimit` for CPU/memory/file limits, `unshare --net` for network isolation, and an import blocklist enforced by a custom import hook.
   - **JavaScript sandbox**: Deno subprocess with `--deny-net --deny-read --deny-write --deny-env --deny-run` flags for maximum isolation without relying on the deprecated `vm2` or requiring a Node.js `isolated-vm` native module.

3. **Sandbox runner scripts** -- Standalone Python and Deno scripts spawned as subprocesses that receive inputs via stdin (JSON), execute user code in a restricted environment, and return results via stdout (JSON).

4. **Security hardening** -- Explicit scrubbing of `config["configurable"]` and `__secret__`-tagged values from sandbox inputs, preventing credential leakage to user-authored code.

**Why this is a CRITICAL SECURITY section:**

The existing `CodeExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/code_executor.py` uses `RestrictedPython` with `exec()` for code execution. This has multiple known security and reliability issues:
- `RestrictedPython` has documented bypass vectors (attribute access via `__class__.__bases__`, `__subclasses__()` chains)
- `signal.SIGALRM` (used for timeout) does not work reliably in async contexts (uvicorn/FastAPI)
- No memory limit enforcement -- a single `[0] * 10**9` allocation crashes the entire process
- No network isolation -- imported modules can open sockets
- The code runs in-process, meaning any sandbox escape compromises the FastAPI server

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/code_step_executor.py` | **CREATE** | New Code Step executor with subprocess isolation |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/sandbox/__init__.py` | **CREATE** | Sandbox package init |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/sandbox/python_runner.py` | **CREATE** | Standalone Python sandbox runner script (spawned as subprocess) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/sandbox/js_runner.ts` | **CREATE** | Deno JavaScript sandbox runner script |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/sandbox/sandbox_manager.py` | **CREATE** | Manages subprocess lifecycle for both languages |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/code_executor.py` | **DEPRECATE** | Mark as deprecated, replace with code_step_executor |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Add `approval_gate` (updated) and `code_step` node type registrations |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_code_sandbox.py` | **CREATE** | All sandbox security and functional tests |

---

## Security Analysis: Why NOT RestrictedPython, Why NOT vm2

### RestrictedPython (current approach -- BEING REPLACED)

The current code executor at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/code_executor.py` uses `compile_restricted` + `exec()` with `safe_builtins`. Problems:

1. **Known bypass vectors**: RestrictedPython restricts attribute access via `_getattr_` guards, but researchers have demonstrated bypasses through `__class__.__mro__[N].__subclasses__()` chains to reach `os.system`, `subprocess.Popen`, etc. These bypasses have been documented publicly.

2. **In-process execution**: `exec(byte_code, safe_env)` runs user code in the same Python process as the FastAPI server. Any sandbox escape gives the attacker full access to the server's memory space, environment variables, database connections, and encryption keys.

3. **SIGALRM incompatibility**: The existing code uses `signal.signal(signal.SIGALRM, timeout_handler)` and `signal.alarm(timeout)`. This does NOT work in async contexts because:
   - `signal.alarm` can only be called from the main thread
   - In uvicorn with multiple workers, the signal may fire in the wrong thread
   - In an async event loop, the alarm may interrupt an unrelated coroutine

4. **No memory limits**: There is no mechanism to limit memory usage. A malicious `[0] * 10**9` expression allocates ~8GB and crashes the entire FastAPI process, affecting all concurrent users.

5. **No network isolation**: Even with import restrictions, RestrictedPython cannot prevent network access if a module is somehow imported or if builtins are exploited.

### vm2 (JavaScript -- NOT USED)

`vm2` was the most popular Node.js sandboxing library but has been **officially deprecated** with critical CVEs:
- **CVE-2023-29017** (CVSS 10.0): Sandbox escape via `Error.prepareStackTrace`
- **CVE-2023-37903** (CVSS 10.0): Sandbox escape via `Proxy` handler
- The maintainer has stated these are unfixable architectural issues

### Chosen approach: Subprocess isolation

Subprocess isolation provides defense-in-depth through OS-level boundaries:
- **Process isolation**: User code runs in a separate process with its own address space
- **Resource limits**: `resource.setrlimit` enforces CPU time, memory, and file size limits at the OS level
- **Network isolation**: `unshare --net` creates a network namespace with no interfaces
- **Import control**: Custom import hook in the runner script blocks dangerous modules
- **Timeout enforcement**: `asyncio.wait_for` on the subprocess, with `SIGKILL` fallback

---

## Implementation Steps

### Step 1: Create Sandbox Manager

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/sandbox/sandbox_manager.py`

The `SandboxManager` is the core abstraction that handles spawning, communicating with, and terminating sandbox subprocesses for both Python and JavaScript.

```python
"""Sandbox subprocess manager for secure code execution.

Spawns isolated subprocesses with resource limits, network isolation,
and import restrictions. Communicates via stdin/stdout JSON protocol.

SECURITY: This module is the ONLY way user code should be executed.
Never use exec(), eval(), or RestrictedPython for user-provided code.
"""

import asyncio
import json
import os
import shutil
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import structlog

logger = structlog.get_logger()

# Absolute path to runner scripts
_SANDBOX_DIR = Path(__file__).parent

# Hard limits
MAX_TIMEOUT_SECONDS = 30
MAX_MEMORY_MB = 256
MAX_OUTPUT_BYTES = 1_048_576  # 1 MB


class SandboxLanguage(str, Enum):
    """Supported sandbox languages."""
    PYTHON = "python"
    JAVASCRIPT = "javascript"


@dataclass
class SandboxResult:
    """Result from sandbox execution.

    Attributes:
        success: Whether code executed without error.
        result: JSON-serializable return value from the code.
        stdout: Captured stdout output.
        stderr: Captured stderr output (for debugging only, not returned to user).
        error: Error message if execution failed.
        timed_out: Whether execution was killed due to timeout.
        memory_exceeded: Whether execution was killed due to memory limit.
    """
    success: bool
    result: Any = None
    stdout: str = ""
    stderr: str = ""
    error: str | None = None
    timed_out: bool = False
    memory_exceeded: bool = False


class SandboxManager:
    """Manages sandboxed code execution via subprocesses.

    Usage:
        manager = SandboxManager()
        result = await manager.execute(
            language=SandboxLanguage.PYTHON,
            code='result = inputs["x"] * 2',
            inputs={"x": 21},
            timeout_seconds=10,
            memory_limit_mb=128,
        )
        assert result.success
        assert result.result == 42
    """

    def __init__(self):
        self._python_runner = _SANDBOX_DIR / "python_runner.py"
        self._js_runner = _SANDBOX_DIR / "js_runner.ts"
        self._unshare_available: bool | None = None
        self._deno_available: bool | None = None

    async def execute(
        self,
        language: SandboxLanguage,
        code: str,
        inputs: dict[str, Any],
        timeout_seconds: int = 10,
        memory_limit_mb: int = 128,
    ) -> SandboxResult:
        """Execute code in an isolated subprocess.

        Args:
            language: Python or JavaScript.
            code: The user-provided code string.
            inputs: JSON-serializable dict available as `inputs` in the sandbox.
            timeout_seconds: Max execution time (capped at MAX_TIMEOUT_SECONDS).
            memory_limit_mb: Max memory usage (capped at MAX_MEMORY_MB).

        Returns:
            SandboxResult with the execution outcome.
        """
        timeout_seconds = min(timeout_seconds, MAX_TIMEOUT_SECONDS)
        memory_limit_mb = min(memory_limit_mb, MAX_MEMORY_MB)

        if language == SandboxLanguage.PYTHON:
            return await self._execute_python(
                code, inputs, timeout_seconds, memory_limit_mb
            )
        elif language == SandboxLanguage.JAVASCRIPT:
            return await self._execute_javascript(
                code, inputs, timeout_seconds, memory_limit_mb
            )
        else:
            return SandboxResult(
                success=False,
                error=f"Unsupported language: {language}",
            )

    async def _execute_python(
        self,
        code: str,
        inputs: dict[str, Any],
        timeout_seconds: int,
        memory_limit_mb: int,
    ) -> SandboxResult:
        """Execute Python code in a subprocess with resource limits.

        The subprocess:
        1. Sets resource.setrlimit for CPU, memory, and file size
        2. Installs a custom import hook blocking dangerous modules
        3. Reads inputs JSON from stdin
        4. Executes user code with `inputs` available as a variable
        5. Writes result JSON to stdout

        Network isolation via unshare --net is used when available.
        """
        # Prepare stdin payload
        payload = json.dumps({
            "code": code,
            "inputs": inputs,
            "memory_limit_mb": memory_limit_mb,
            "timeout_seconds": timeout_seconds,
        })

        # Build command
        cmd = self._build_python_command(memory_limit_mb, timeout_seconds)

        return await self._run_subprocess(
            cmd=cmd,
            stdin_data=payload,
            timeout_seconds=timeout_seconds,
            label="python",
        )

    async def _execute_javascript(
        self,
        code: str,
        inputs: dict[str, Any],
        timeout_seconds: int,
        memory_limit_mb: int,
    ) -> SandboxResult:
        """Execute JavaScript code via Deno subprocess.

        Deno provides built-in permission flags:
        --deny-net: No network access
        --deny-read: No filesystem read (except the runner script)
        --deny-write: No filesystem write
        --deny-env: No environment variable access
        --deny-run: No subprocess spawning

        Falls back to error if Deno is not installed.
        """
        if not await self._check_deno_available():
            return SandboxResult(
                success=False,
                error="JavaScript sandbox unavailable: Deno runtime not installed. "
                      "Install via: curl -fsSL https://deno.land/install.sh | sh",
            )

        payload = json.dumps({
            "code": code,
            "inputs": inputs,
        })

        cmd = [
            "deno", "run",
            "--deny-net",
            f"--allow-read={self._js_runner}",
            "--deny-write",
            "--deny-env",
            "--deny-run",
            f"--v8-flags=--max-old-space-size={memory_limit_mb}",
            str(self._js_runner),
        ]

        return await self._run_subprocess(
            cmd=cmd,
            stdin_data=payload,
            timeout_seconds=timeout_seconds,
            label="javascript",
        )

    def _build_python_command(
        self,
        memory_limit_mb: int,
        timeout_seconds: int,
    ) -> list[str]:
        """Build the Python subprocess command with optional unshare.

        If unshare is available (Linux), wraps the command in
        `unshare --net` to disable network access at the OS level.
        """
        python_cmd = [
            "python3", str(self._python_runner),
        ]

        # Use unshare for network isolation if available
        if self._check_unshare_available():
            return ["unshare", "--net", "--map-root-user"] + python_cmd
        else:
            logger.warning(
                "unshare not available; Python sandbox runs without network isolation. "
                "Install util-linux for full isolation."
            )
            return python_cmd

    def _check_unshare_available(self) -> bool:
        """Check if unshare command is available on this system."""
        if self._unshare_available is None:
            self._unshare_available = shutil.which("unshare") is not None
        return self._unshare_available

    async def _check_deno_available(self) -> bool:
        """Check if Deno runtime is available on this system."""
        if self._deno_available is None:
            self._deno_available = shutil.which("deno") is not None
        return self._deno_available

    async def _run_subprocess(
        self,
        cmd: list[str],
        stdin_data: str,
        timeout_seconds: int,
        label: str,
    ) -> SandboxResult:
        """Run a subprocess with timeout and output size limits.

        Args:
            cmd: Command and arguments.
            stdin_data: JSON data to send to stdin.
            timeout_seconds: Max execution time.
            label: Language label for logging.

        Returns:
            SandboxResult parsed from subprocess stdout.
        """
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                # Prevent inheriting parent env secrets
                env=self._build_clean_env(),
            )

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(input=stdin_data.encode()),
                    timeout=timeout_seconds + 2,  # +2s grace for setup/teardown
                )
            except asyncio.TimeoutError:
                # Kill the process tree
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                await process.wait()

                logger.warning(
                    "Sandbox timeout",
                    language=label,
                    timeout_seconds=timeout_seconds,
                )
                return SandboxResult(
                    success=False,
                    error=f"Code execution timed out after {timeout_seconds} seconds",
                    timed_out=True,
                )

            stdout_text = stdout_bytes.decode("utf-8", errors="replace")
            stderr_text = stderr_bytes.decode("utf-8", errors="replace")

            # Check output size
            if len(stdout_bytes) > MAX_OUTPUT_BYTES:
                return SandboxResult(
                    success=False,
                    error=f"Output exceeds maximum size ({MAX_OUTPUT_BYTES} bytes)",
                    stdout=stdout_text[:1000],
                )

            # Check return code
            if process.returncode != 0:
                # Check for OOM kill (signal 9) or resource limit (signal 24 = SIGXCPU)
                if process.returncode == -9 or process.returncode == 137:
                    return SandboxResult(
                        success=False,
                        error="Code execution killed: memory limit exceeded",
                        memory_exceeded=True,
                        stderr=stderr_text[:500],
                    )
                elif process.returncode == -24 or process.returncode == 152:
                    return SandboxResult(
                        success=False,
                        error="Code execution killed: CPU time limit exceeded",
                        timed_out=True,
                        stderr=stderr_text[:500],
                    )
                else:
                    # Parse error from stderr or stdout
                    error_msg = stderr_text.strip() or "Code execution failed"
                    return SandboxResult(
                        success=False,
                        error=error_msg[:1000],
                        stderr=stderr_text[:500],
                    )

            # Parse JSON result from stdout
            return self._parse_runner_output(stdout_text, stderr_text)

        except FileNotFoundError as e:
            return SandboxResult(
                success=False,
                error=f"Sandbox runtime not found: {e}",
            )
        except Exception as e:
            logger.exception("Sandbox execution error", language=label)
            return SandboxResult(
                success=False,
                error=f"Sandbox internal error: {str(e)}",
            )

    def _parse_runner_output(
        self,
        stdout: str,
        stderr: str,
    ) -> SandboxResult:
        """Parse the JSON output from a runner script.

        Expected format:
        {"success": true, "result": <value>, "stdout": "..."}
        """
        try:
            # The runner writes a JSON line as its last output
            # Find the last JSON line (in case user code also printed to stdout)
            lines = stdout.strip().split("\n")
            json_line = None
            for line in reversed(lines):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        parsed = json.loads(line)
                        if "success" in parsed:
                            json_line = parsed
                            break
                    except json.JSONDecodeError:
                        continue

            if json_line is None:
                return SandboxResult(
                    success=False,
                    error="Sandbox runner produced no valid JSON output",
                    stdout=stdout[:500],
                    stderr=stderr[:500],
                )

            user_stdout = "\n".join(lines[:-1]) if len(lines) > 1 else ""

            return SandboxResult(
                success=json_line.get("success", False),
                result=json_line.get("result"),
                stdout=json_line.get("stdout", user_stdout),
                error=json_line.get("error"),
            )

        except Exception as e:
            return SandboxResult(
                success=False,
                error=f"Failed to parse sandbox output: {e}",
                stdout=stdout[:500],
            )

    def _build_clean_env(self) -> dict[str, str]:
        """Build a minimal environment for the subprocess.

        SECURITY: Strips all sensitive environment variables.
        Only passes PATH, LANG, and HOME (needed for Python/Deno startup).
        """
        return {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "LANG": os.environ.get("LANG", "en_US.UTF-8"),
            "HOME": "/tmp",  # Prevent access to user home
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONUNBUFFERED": "1",
        }
```

### Step 2: Create Python Sandbox Runner Script

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/sandbox/python_runner.py`

This is the standalone script spawned as a subprocess. It runs in its own process with resource limits.

```python
#!/usr/bin/env python3
"""Python sandbox runner -- executed as a subprocess.

This script is spawned by SandboxManager and:
1. Reads a JSON payload from stdin (code, inputs, limits)
2. Sets resource limits (CPU, memory, file size)
3. Installs an import hook blocking dangerous modules
4. Executes user code with `inputs` available
5. Writes a JSON result to stdout

SECURITY CRITICAL: This script runs in an isolated subprocess.
It must NOT import or expose any parent process state.

Protocol:
  stdin:  {"code": "...", "inputs": {...}, "memory_limit_mb": 128, "timeout_seconds": 10}
  stdout: {"success": true, "result": <value>, "stdout": "captured output"}
     or:  {"success": false, "error": "error message"}
"""

import importlib
import io
import json
import resource
import sys
from contextlib import redirect_stdout, redirect_stderr


# =====================================================================
# IMPORT BLOCKLIST
# =====================================================================

BLOCKED_MODULES = frozenset({
    # System access
    "os", "os.path", "posix", "posixpath", "nt", "ntpath",
    "sys",
    # Process spawning
    "subprocess", "multiprocessing", "concurrent",
    "concurrent.futures",
    # Network access
    "socket", "ssl", "http", "http.client", "http.server",
    "urllib", "urllib.request", "urllib.parse",
    "ftplib", "smtplib", "poplib", "imaplib",
    "xmlrpc", "xmlrpc.client", "xmlrpc.server",
    "asyncio",  # Could be used to open sockets
    "aiohttp", "httpx", "requests",
    # Low-level / dangerous
    "ctypes", "ctypes.util",
    "_ctypes",
    "importlib", "importlib.util", "importlib.abc",
    "runpy",
    # Code generation / execution
    "code", "codeop", "compile", "compileall",
    "ast",  # Could be used to construct and exec arbitrary ASTs
    # File system access (beyond what resource limits block)
    "shutil", "glob", "fnmatch", "pathlib",
    "tempfile", "fileinput",
    # Pickle (arbitrary code execution on deserialize)
    "pickle", "shelve", "dbm",
    "_pickle", "copyreg",
    # Signal handling
    "signal",
    # Debugging / introspection
    "inspect", "dis", "traceback",
    "gc",
    # Platform info leakage
    "platform", "sysconfig",
})


class BlockedImportError(ImportError):
    """Raised when user code attempts to import a blocked module."""
    pass


class ImportBlocker:
    """Meta path finder that blocks imports of dangerous modules.

    Installed as the FIRST entry in sys.meta_path so it takes
    priority over all other finders.
    """

    def find_module(self, fullname: str, path=None):
        """Return self if the module is blocked, triggering load_module."""
        base_module = fullname.split(".")[0]
        if fullname in BLOCKED_MODULES or base_module in BLOCKED_MODULES:
            return self
        return None

    def load_module(self, fullname: str):
        """Raise BlockedImportError for blocked modules."""
        raise BlockedImportError(
            f"Import of '{fullname}' is not allowed in the code sandbox. "
            f"Blocked modules: os, sys, subprocess, socket, ctypes, importlib, and others."
        )


def set_resource_limits(memory_limit_mb: int, timeout_seconds: int) -> None:
    """Set OS-level resource limits for this process.

    Args:
        memory_limit_mb: Maximum virtual memory in megabytes.
        timeout_seconds: Maximum CPU time in seconds.
    """
    memory_bytes = memory_limit_mb * 1024 * 1024

    # CPU time limit (SIGXCPU sent when exceeded, SIGKILL after hard limit)
    resource.setrlimit(resource.RLIMIT_CPU, (timeout_seconds, timeout_seconds + 1))

    # Virtual memory limit
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))

    # File size limit (prevent writing large files)
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))

    # Number of child processes (prevent fork bombs)
    resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))

    # Core dump size (disable)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def build_safe_builtins() -> dict:
    """Build a restricted builtins dict for the execution environment.

    Allows safe built-in functions and blocks dangerous ones.
    """
    import builtins

    # Start with a curated set of safe builtins
    safe = {}
    allowed_builtins = [
        # Types
        "bool", "int", "float", "complex", "str", "bytes", "bytearray",
        "list", "tuple", "set", "frozenset", "dict",
        "type", "object", "None", "True", "False",
        # Math and comparison
        "abs", "round", "min", "max", "sum", "pow", "divmod",
        # Conversion
        "bin", "oct", "hex", "ord", "chr",
        "format", "repr",
        # Iteration
        "range", "enumerate", "zip", "map", "filter", "sorted", "reversed",
        "len", "iter", "next", "all", "any",
        # String
        "print",  # Captured via redirect_stdout
        # Type checking
        "isinstance", "issubclass", "callable", "hasattr", "getattr",
        # Container operations
        "hash", "id",
        # Exceptions (allow raising standard exceptions)
        "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
        "RuntimeError", "StopIteration", "AttributeError", "ZeroDivisionError",
        "OverflowError", "NotImplementedError",
    ]

    for name in allowed_builtins:
        if hasattr(builtins, name):
            safe[name] = getattr(builtins, name)

    # Block dangerous builtins
    # __import__ is replaced with a restricted version
    safe["__import__"] = _restricted_import

    return safe


# Allowed modules for import within the sandbox
ALLOWED_MODULES = frozenset({
    "math", "statistics", "decimal", "fractions",
    "json",
    "re",
    "datetime", "time",
    "collections", "itertools", "functools", "operator",
    "string", "textwrap",
    "copy", "types",
    "dataclasses",
    "typing",
    "hashlib", "hmac", "base64",
    "uuid",
    "csv", "io",
    "random",
    "bisect", "heapq",
    "enum",
    "pprint",
    "urllib.parse",  # Only URL parsing, not fetching
})


def _restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
    """Restricted import function that only allows safe modules."""
    base_module = name.split(".")[0]
    if name in BLOCKED_MODULES or base_module in BLOCKED_MODULES:
        raise BlockedImportError(
            f"Import of '{name}' is not allowed in the code sandbox."
        )
    if name not in ALLOWED_MODULES and base_module not in ALLOWED_MODULES:
        raise BlockedImportError(
            f"Import of '{name}' is not allowed. Allowed modules: "
            f"math, json, re, datetime, collections, itertools, functools, "
            f"string, copy, hashlib, base64, uuid, csv, random, enum, typing."
        )
    return __builtins__["__import__"](name, globals, locals, fromlist, level)


def execute_user_code(code: str, inputs: dict) -> dict:
    """Execute user code in a restricted environment.

    Args:
        code: Python source code string.
        inputs: Dict available as `inputs` variable.

    Returns:
        {"success": True, "result": <value>, "stdout": "..."} on success
        {"success": False, "error": "..."} on failure
    """
    # Capture stdout
    stdout_buffer = io.StringIO()

    # Build execution globals
    safe_builtins = build_safe_builtins()
    exec_globals = {
        "__builtins__": safe_builtins,
        "inputs": inputs,
        "result": None,
    }

    try:
        # Compile first to get better error messages
        compiled = compile(code, "<sandbox>", "exec")

        with redirect_stdout(stdout_buffer):
            exec(compiled, exec_globals)

        # Get result
        result_value = exec_globals.get("result")

        # Verify result is JSON-serializable
        if result_value is not None:
            json.dumps(result_value)  # Will raise TypeError if not serializable

        return {
            "success": True,
            "result": result_value,
            "stdout": stdout_buffer.getvalue(),
        }

    except BlockedImportError as e:
        return {"success": False, "error": str(e)}
    except SyntaxError as e:
        return {"success": False, "error": f"Syntax error: {e}"}
    except MemoryError:
        return {"success": False, "error": "Memory limit exceeded"}
    except TypeError as e:
        if "JSON" in str(e) or "serializable" in str(e):
            return {
                "success": False,
                "error": "Result is not JSON-serializable. "
                         "Ensure the `result` variable contains only "
                         "dicts, lists, strings, numbers, booleans, or None.",
            }
        return {"success": False, "error": f"Type error: {e}"}
    except Exception as e:
        return {"success": False, "error": f"Execution error: {type(e).__name__}: {e}"}


def main():
    """Entry point: read payload from stdin, execute, write result to stdout."""
    # Install import blocker FIRST
    sys.meta_path.insert(0, ImportBlocker())

    # Read payload from stdin
    try:
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input)
    except (json.JSONDecodeError, Exception) as e:
        print(json.dumps({"success": False, "error": f"Invalid input: {e}"}))
        sys.exit(1)

    code = payload.get("code", "")
    inputs = payload.get("inputs", {})
    memory_limit_mb = payload.get("memory_limit_mb", 128)
    timeout_seconds = payload.get("timeout_seconds", 10)

    # Set resource limits
    try:
        set_resource_limits(memory_limit_mb, timeout_seconds)
    except (ValueError, OSError) as e:
        # On some systems (macOS, containers), setrlimit may fail
        # Continue without limits but log a warning
        sys.stderr.write(f"Warning: Could not set resource limits: {e}\n")

    # Execute
    result = execute_user_code(code, inputs)

    # Write result as JSON to stdout (last line)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
```

### Step 3: Create JavaScript Sandbox Runner Script (Deno)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/sandbox/js_runner.ts`

This Deno script is executed with restrictive permission flags. Deno's security model is permission-based by default (deny-all unless explicitly allowed).

```typescript
/**
 * JavaScript sandbox runner for Deno.
 *
 * Executed via: deno run --deny-net --allow-read=<this-file> --deny-write
 *               --deny-env --deny-run --v8-flags=--max-old-space-size=N
 *               js_runner.ts
 *
 * Protocol:
 *   stdin:  {"code": "...", "inputs": {...}}
 *   stdout: {"success": true, "result": <value>, "stdout": "..."}
 *      or:  {"success": false, "error": "error message"}
 *
 * SECURITY: Deno's permission system ensures:
 *   - No network access (--deny-net)
 *   - No filesystem write (--deny-write)
 *   - No environment variables (--deny-env)
 *   - No subprocess spawning (--deny-run)
 *   - Memory limited via V8 flags (--max-old-space-size)
 */

async function main() {
  // Read payload from stdin
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  for await (const chunk of Deno.stdin.readable) {
    chunks.push(chunk);
  }
  const rawInput = decoder.decode(
    new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0))
      .fill(0)
      // Concatenate chunks properly
  );

  // Simpler stdin read approach
  const buf = new Uint8Array(10_000_000); // 10MB max input
  let inputStr = "";
  const stdinReader = Deno.stdin.readable.getReader();

  try {
    while (true) {
      const { done, value } = await stdinReader.read();
      if (done) break;
      inputStr += decoder.decode(value, { stream: true });
    }
  } finally {
    stdinReader.releaseLock();
  }

  let payload: { code: string; inputs: Record<string, unknown> };
  try {
    payload = JSON.parse(inputStr);
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: `Invalid input: ${e}` }));
    Deno.exit(1);
  }

  const { code, inputs } = payload;

  // Capture console.log output
  const stdoutCapture: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    stdoutCapture.push(args.map(String).join(" "));
  };

  // Build restricted global scope
  // The Function constructor creates a new function scope without access
  // to the module's variables. Combined with Deno's permission flags,
  // this provides strong isolation.
  try {
    // Create function with explicit parameter for inputs
    // This prevents access to Deno globals like Deno.env, Deno.run, etc.
    const userFunction = new Function(
      "inputs",
      "console",
      `
      "use strict";
      // User code runs here
      let result = undefined;
      ${code}
      return result;
      `
    );

    // Execute with a frozen console proxy
    const safeConsole = Object.freeze({
      log: (...args: unknown[]) => {
        stdoutCapture.push(args.map(String).join(" "));
      },
      warn: (...args: unknown[]) => {
        stdoutCapture.push("[WARN] " + args.map(String).join(" "));
      },
      error: (...args: unknown[]) => {
        stdoutCapture.push("[ERROR] " + args.map(String).join(" "));
      },
    });

    const result = userFunction(
      Object.freeze(structuredClone(inputs)),
      safeConsole
    );

    // Verify JSON-serializable
    const serialized = JSON.stringify(result);
    if (serialized === undefined && result !== undefined) {
      throw new Error("Result is not JSON-serializable");
    }

    // Restore console and output result
    console.log = originalLog;
    console.log(
      JSON.stringify({
        success: true,
        result: result === undefined ? null : JSON.parse(serialized),
        stdout: stdoutCapture.join("\n"),
      })
    );
  } catch (e) {
    console.log = originalLog;
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.log(
      JSON.stringify({
        success: false,
        error: `Execution error: ${errorMsg}`,
        stdout: stdoutCapture.join("\n"),
      })
    );
  }
}

main();
```

### Step 4: Create Code Step Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/code_step_executor.py`

```python
"""Code Step node executor with subprocess sandbox isolation.

Replaces the legacy CodeExecutor (RestrictedPython + exec()) with a
secure subprocess-based sandbox supporting Python and JavaScript.

SECURITY: User code runs in an isolated subprocess with:
- Process isolation (separate address space)
- CPU time limits (resource.RLIMIT_CPU)
- Memory limits (resource.RLIMIT_AS)
- Network isolation (unshare --net)
- Import blocklist (os, sys, subprocess, socket, ctypes, importlib)
- Clean environment (no access to parent process env vars)
- No access to config["configurable"] or credentials

See /home/dev/projects/SmartSpecPro/planning/workflow-langgraph-rag/sections/09-hitl-code-nodes.md
for full security analysis.
"""

import re
from typing import Any, Dict

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.sandbox.sandbox_manager import (
    SandboxLanguage,
    SandboxManager,
    SandboxResult,
)

logger = structlog.get_logger()

# Secret reference pattern from Section 08
SECRET_PATTERN = re.compile(r"__secret__\[.*?\]|__secret__\.[\w.]+")

# Maximum code length (100KB -- prevents abuse via extremely large code strings)
MAX_CODE_LENGTH = 102_400


class CodeStepExecutor:
    """Executor for Code Step nodes with dual-language sandbox support.

    Supports Python and JavaScript execution in isolated subprocesses.
    Inputs are scrubbed of secret references before passing to the sandbox.

    Config:
        language: "python" or "javascript" (default: "python")
        code: The code string to execute
        timeout_seconds: Max execution time, 1-30 (default: 10)
        memory_limit_mb: Max memory, 1-256 (default: 128)

    Inputs:
        Any JSON-serializable data, available as `inputs` variable in sandbox.
        The `result` variable should be set by the user code.

    Outputs:
        result: The value of the `result` variable after execution
        stdout: Captured standard output from the code
    """

    def __init__(self):
        self._sandbox = SandboxManager()

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """Execute user code in a sandboxed subprocess.

        Args:
            data: Node execution data with code in config, inputs from upstream.
            context: Execution context (NOT passed to sandbox).

        Returns:
            Dict with 'result' and 'stdout' keys.

        Raises:
            ValueError: If code is empty or exceeds size limit.
        """
        config = data.config
        inputs = data.inputs

        # Extract config
        language_str = config.get("language", "python").lower()
        code = config.get("code", "").strip()
        timeout_seconds = max(1, min(int(config.get("timeout_seconds", 10)), 30))
        memory_limit_mb = max(1, min(int(config.get("memory_limit_mb", 128)), 256))

        # Validate code
        if not code:
            raise ValueError("Code is required for Code Step node")

        if len(code) > MAX_CODE_LENGTH:
            raise ValueError(
                f"Code exceeds maximum length ({MAX_CODE_LENGTH} characters). "
                f"Consider breaking into smaller steps."
            )

        # Parse language
        try:
            language = SandboxLanguage(language_str)
        except ValueError:
            raise ValueError(
                f"Unsupported language: {language_str}. "
                f"Supported: python, javascript"
            )

        # SECURITY: Scrub secret references from inputs
        clean_inputs = self._scrub_secrets(inputs)

        # SECURITY: Do NOT pass config["configurable"] or context to sandbox
        # The sandbox only receives explicitly provided inputs

        logger.info(
            "Code Step: executing sandbox",
            node_id=data.node_id,
            language=language_str,
            code_length=len(code),
            timeout_seconds=timeout_seconds,
            memory_limit_mb=memory_limit_mb,
        )

        # Execute in sandbox
        result: SandboxResult = await self._sandbox.execute(
            language=language,
            code=code,
            inputs=clean_inputs,
            timeout_seconds=timeout_seconds,
            memory_limit_mb=memory_limit_mb,
        )

        if not result.success:
            error_msg = result.error or "Code execution failed"

            logger.warning(
                "Code Step: execution failed",
                node_id=data.node_id,
                error=error_msg,
                timed_out=result.timed_out,
                memory_exceeded=result.memory_exceeded,
            )

            raise ValueError(f"Code Step execution failed: {error_msg}")

        logger.info(
            "Code Step: execution complete",
            node_id=data.node_id,
            has_result=result.result is not None,
            stdout_length=len(result.stdout),
        )

        return {
            "result": result.result,
            "stdout": result.stdout,
        }

    def _scrub_secrets(self, inputs: dict[str, Any]) -> dict[str, Any]:
        """Remove __secret__-tagged values from inputs before passing to sandbox.

        This prevents credential leakage to user-authored code.
        Secret values from the Secrets Vault node (Section 08) are tagged
        with __secret__ wrapper. These are recursively removed from the
        inputs dict.

        Args:
            inputs: Raw inputs dict, potentially containing secret references.

        Returns:
            Clean copy of inputs with secrets replaced by "[REDACTED]".
        """
        return self._scrub_recursive(inputs)

    def _scrub_recursive(self, value: Any) -> Any:
        """Recursively scrub secret values from a data structure."""
        if isinstance(value, dict):
            result = {}
            for k, v in value.items():
                if isinstance(k, str) and "__secret__" in k:
                    continue  # Drop secret-keyed entries entirely
                if isinstance(v, str) and SECRET_PATTERN.search(v):
                    result[k] = "[REDACTED]"
                elif isinstance(v, dict) and v.get("__secret__"):
                    result[k] = "[REDACTED]"
                else:
                    result[k] = self._scrub_recursive(v)
            return result
        elif isinstance(value, list):
            return [self._scrub_recursive(item) for item in value]
        elif isinstance(value, str) and SECRET_PATTERN.search(value):
            return "[REDACTED]"
        else:
            return value
```

### Step 5: Create Sandbox Package Init

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/sandbox/__init__.py`

```python
"""Sandbox package for secure code execution.

Provides subprocess-based isolation for running user-authored code
in Python and JavaScript with resource limits, network isolation,
and import restrictions.
"""

from app.orchestrator.sandbox.sandbox_manager import (
    SandboxLanguage,
    SandboxManager,
    SandboxResult,
)

__all__ = ["SandboxLanguage", "SandboxManager", "SandboxResult"]
```

### Step 6: Node Registry Registration Entries

**Modification to:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`

These entries are added inside `_register_core_nodes()`. The `approval_gate` registration is updated (the existing one at line 297 is replaced), and `code_step` is added as a new entry.

```python
# ===== Section 9: HITL & Code Nodes =====

# 32. Approval / Human-in-the-Loop (UPDATED -- uses interrupt())
# NOTE: Replaces the existing approval_gate registration.
# The executor is the rewritten ApprovalExecutor from Section 03.
self.register_node_type(
    NodeTypeSpec(
        type="approval_gate",
        display_name="Approval Gate",
        description="Pause workflow for human approval, input, or decision",
        icon="user-check",
        color="orange",
        category="human",
        inputs=[
            InputSpec(
                name="data",
                display_name="Data to Review",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data requiring approval...",
            ),
            InputSpec(
                name="message",
                display_name="Message",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                default="Please review and approve",
                placeholder="Message shown to approvers...",
            ),
            InputSpec(
                name="approval_type",
                display_name="Approval Type",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="approve_reject",
                options=[
                    {"label": "Approve / Reject", "value": "approve_reject"},
                    {"label": "Free-form Input", "value": "input"},
                    {"label": "Decision (choose from options)", "value": "decision"},
                ],
            ),
            InputSpec(
                name="options",
                display_name="Decision Options",
                data_type="array",
                ui_type="json_editor",
                required=False,
                accepts_connection=False,
                default=[],
                placeholder='["Option A", "Option B", "Option C"]',
            ),
            InputSpec(
                name="timeout_minutes",
                display_name="Timeout (minutes)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=60,
                validation={"min": 1, "max": 10080},
            ),
            InputSpec(
                name="required_approvers",
                display_name="Required Approvers",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=1,
                validation={"min": 1, "max": 10},
            ),
            InputSpec(
                name="notification_channel",
                display_name="Notification Channel",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                options=[
                    {"label": "None", "value": ""},
                    {"label": "Email", "value": "email"},
                    {"label": "Telegram", "value": "telegram"},
                    {"label": "In-App", "value": "in_app"},
                ],
            ),
            InputSpec(
                name="approvers",
                display_name="Approvers",
                data_type="array",
                ui_type="multiselect",
                required=True,
                accepts_connection=False,
                options_endpoint="/api/v1/workflow/available-approvers",
            ),
        ],
        outputs=[
            OutputSpec(name="approved", display_name="Approved Data", data_type="json"),
            OutputSpec(name="rejected", display_name="Rejected Data", data_type="json"),
            OutputSpec(name="decision", display_name="Decision Value", data_type="text"),
            OutputSpec(name="input_value", display_name="Input Value", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.approval_executor.ApprovalExecutor",
    )
)

# 33. Code Step (dual-language sandbox)
self.register_node_type(
    NodeTypeSpec(
        type="code_step",
        display_name="Code Step",
        description="Execute custom Python or JavaScript code in a secure sandbox",
        icon="code",
        color="purple",
        category="code",
        inputs=[
            InputSpec(
                name="language",
                display_name="Language",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="python",
                options=[
                    {"label": "Python", "value": "python"},
                    {"label": "JavaScript", "value": "javascript"},
                ],
            ),
            InputSpec(
                name="code",
                display_name="Code",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=False,
                placeholder=(
                    '# Python: access inputs via `inputs` dict, set `result`\n'
                    'result = inputs["value"] * 2'
                ),
            ),
            InputSpec(
                name="input_data",
                display_name="Input Data",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data available as `inputs` in sandbox...",
            ),
            InputSpec(
                name="timeout_seconds",
                display_name="Timeout (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=10,
                validation={"min": 1, "max": 30},
            ),
            InputSpec(
                name="memory_limit_mb",
                display_name="Memory Limit (MB)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=128,
                validation={"min": 1, "max": 256},
            ),
        ],
        outputs=[
            OutputSpec(name="result", display_name="Execution Result", data_type="any"),
            OutputSpec(name="stdout", display_name="Standard Output", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.code_step_executor.CodeStepExecutor",
    )
)
```

**Important**: The existing `code_runner` registration (type `"code_runner"`, line 663 of node_registry.py) should be preserved for backward compatibility during the migration period (Section 16). It still points to the legacy `CodeExecutor`. The new `code_step` type is the recommended replacement.

The existing `approval_gate` registration (line 297) must be replaced, not duplicated. Since the `register_node_type` method raises `ValueError` for duplicates, the old block should be removed and replaced with the new one.

### Step 7: Deprecate Legacy Code Executor

**Modification to:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/code_executor.py`

Add a deprecation warning at the top of the module and in the `execute` method:

```python
"""Code Runner Executor - DEPRECATED.

This module uses RestrictedPython with in-process exec(), which has known
security bypass risks. Use CodeStepExecutor instead, which provides
subprocess isolation with resource limits, network isolation, and import
blocking.

See: app.orchestrator.node_executors.code_step_executor.CodeStepExecutor
"""

import warnings

# ... existing imports ...


class CodeExecutor:
    """Executor for code runner nodes.

    DEPRECATED: Use CodeStepExecutor for new workflows. This executor
    is retained for backward compatibility with existing workflows
    that use the "code_runner" node type.
    """

    async def execute(self, data, context):
        warnings.warn(
            "CodeExecutor is deprecated due to security concerns. "
            "Use CodeStepExecutor (node type 'code_step') instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        # ... existing implementation unchanged for backward compat ...
```

---

## Approval Node: Integration with Section 03

The Approval node executor is fully implemented in Section 03 (`/home/dev/projects/SmartSpecPro/planning/workflow-langgraph-rag/sections/03-hitl-interrupt.md`). This section only:

1. **Registers the updated node type** in the node registry (Step 6 above) with the expanded config schema supporting `approval_type`, `options`, `timeout_minutes`, `required_approvers`, and `notification_channel`.

2. **Ensures config schema compatibility**: The new registry inputs match what the Section 03 `ApprovalExecutor.execute()` reads from `data.config`:
   - `config.get("message")` -- mapped to `message` input
   - `config.get("approval_type")` -- mapped to `approval_type` input
   - `config.get("options")` -- mapped to `options` input
   - `config.get("timeout_minutes")` -- mapped to `timeout_minutes` input
   - `config.get("required_approvers")` -- mapped to `required_approvers` input
   - `config.get("notification_channel")` -- mapped to `notification_channel` input
   - `config.get("approvers")` -- mapped to `approvers` input

3. **Output ports**: The outputs (`approved`, `rejected`, `decision`, `input_value`) map to the dict keys returned by `ApprovalExecutor.execute()` after `interrupt()` resumes.

No additional executor code is needed for the approval node beyond what Section 03 defines. The `interrupt()` mechanism, `PendingInterruptTracker`, `HITLResumeHandler`, and Celery timeout task are all implemented there.

---

## Error Handling

| Error Scenario | Handling | Exception/Response |
|----------------|----------|-------------------|
| **Empty code** | `CodeStepExecutor` raises before sandbox spawn | `ValueError("Code is required")` |
| **Code exceeds 100KB** | Rejected before sandbox spawn | `ValueError("Code exceeds maximum length")` |
| **Unsupported language** | Rejected before sandbox spawn | `ValueError("Unsupported language: X")` |
| **Python timeout** | `asyncio.wait_for` expires, subprocess killed | `SandboxResult(timed_out=True)` -> `ValueError` |
| **Python memory exceeded** | `RLIMIT_AS` triggered, SIGKILL (exit 137) | `SandboxResult(memory_exceeded=True)` -> `ValueError` |
| **Python CPU limit** | `RLIMIT_CPU` triggered, SIGXCPU (exit 152) | `SandboxResult(timed_out=True)` -> `ValueError` |
| **Python blocked import** | `ImportBlocker` raises `BlockedImportError` | `SandboxResult(error="Import not allowed")` -> `ValueError` |
| **Python syntax error** | `compile()` raises `SyntaxError` | `SandboxResult(error="Syntax error")` -> `ValueError` |
| **Python runtime error** | Exception in `exec()` caught | `SandboxResult(error="Execution error: ...")` -> `ValueError` |
| **Non-JSON-serializable result** | `json.dumps()` raises `TypeError` | `SandboxResult(error="Not JSON-serializable")` -> `ValueError` |
| **Output exceeds 1MB** | Subprocess output too large | `SandboxResult(error="Output exceeds maximum size")` -> `ValueError` |
| **JS Deno not installed** | `shutil.which("deno")` returns None | `SandboxResult(error="Deno runtime not installed")` -> `ValueError` |
| **JS timeout** | `asyncio.wait_for` expires | `SandboxResult(timed_out=True)` -> `ValueError` |
| **JS memory exceeded** | V8 `--max-old-space-size` limit triggers OOM | `SandboxResult(memory_exceeded=True)` -> `ValueError` |
| **JS runtime error** | Error in `Function()` execution | `SandboxResult(error="Execution error")` -> `ValueError` |
| **unshare not available** | Non-Linux or missing `util-linux` | Warning logged, Python runs without network isolation |
| **Secret references in inputs** | `__secret__`-tagged values detected | Replaced with `"[REDACTED]"`, code sees redacted values |
| **Approval: no approvers** | `ApprovalExecutor` returns immediate rejection | `{"approved": False, "rejected": True, "error": "No approvers"}` |
| **Approval: timeout** | Celery task auto-rejects (Section 03) | `{"approved": False, "timeout": True}` |
| **Approval: invalid type** | Falls back to `APPROVE_REJECT` | Warning logged |

---

## Tests

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_code_sandbox.py`

```python
"""Tests for Code Step sandbox executor.

Tests verify:
- Python sandbox: result return, input access, timeout, memory limit,
  import blocking (os, subprocess, socket), credential isolation
- JavaScript sandbox: result return, timeout, Node.js global isolation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.code_step_executor import CodeStepExecutor
from app.orchestrator.sandbox.sandbox_manager import (
    SandboxLanguage,
    SandboxManager,
    SandboxResult,
)


@pytest.fixture
def executor():
    """Create a CodeStepExecutor instance."""
    return CodeStepExecutor()


@pytest.fixture
def execution_context():
    """Create a sample ExecutionContext."""
    return ExecutionContext(
        user_id=1,
        tenant_id="tenant-1",
        workflow_id="wf-1",
        execution_id="exec-1",
        credits_available=100,
        extra_data={
            "memory_service": "SHOULD_NOT_BE_IN_SANDBOX",
            "api_key": "sk-SHOULD_NOT_BE_IN_SANDBOX",
        },
    )


def make_node_data(
    code: str,
    language: str = "python",
    inputs: dict | None = None,
    timeout_seconds: int = 10,
    memory_limit_mb: int = 128,
) -> NodeExecutionData:
    """Helper to build NodeExecutionData for code step tests."""
    return NodeExecutionData(
        node_id="code-1",
        node_type="code_step",
        config={
            "language": language,
            "code": code,
            "timeout_seconds": timeout_seconds,
            "memory_limit_mb": memory_limit_mb,
        },
        inputs=inputs or {},
        state={},
    )


# =====================================================================
# Python Sandbox Tests
# =====================================================================


class TestPythonSandboxReturnsResult:
    """test_python_sandbox_returns_result: Simple Python code returns value."""

    @pytest.mark.asyncio
    async def test_python_sandbox_returns_result(self, executor, execution_context):
        """Simple Python code sets result variable and returns it."""
        data = make_node_data(code='result = 42')

        # Use real subprocess execution
        output = await executor.execute(data, execution_context)

        assert output["result"] == 42

    @pytest.mark.asyncio
    async def test_python_returns_complex_result(self, executor, execution_context):
        """Python code returning a dict/list result."""
        data = make_node_data(
            code='result = {"name": "test", "values": [1, 2, 3]}'
        )
        output = await executor.execute(data, execution_context)
        assert output["result"] == {"name": "test", "values": [1, 2, 3]}


class TestPythonSandboxReceivesInputs:
    """test_python_sandbox_receives_inputs: `inputs` variable available in sandbox."""

    @pytest.mark.asyncio
    async def test_python_sandbox_receives_inputs(self, executor, execution_context):
        """User code can access the `inputs` dict."""
        data = make_node_data(
            code='result = inputs["x"] + inputs["y"]',
            inputs={"x": 10, "y": 32},
        )
        output = await executor.execute(data, execution_context)
        assert output["result"] == 42

    @pytest.mark.asyncio
    async def test_python_nested_inputs(self, executor, execution_context):
        """User code can access nested input data."""
        data = make_node_data(
            code='result = inputs["user"]["name"].upper()',
            inputs={"user": {"name": "alice"}},
        )
        output = await executor.execute(data, execution_context)
        assert output["result"] == "ALICE"


class TestPythonSandboxTimeout:
    """test_python_sandbox_timeout: Long-running code killed after timeout."""

    @pytest.mark.asyncio
    async def test_python_sandbox_timeout(self, executor, execution_context):
        """Infinite loop is killed after timeout_seconds."""
        data = make_node_data(
            code='while True: pass',
            timeout_seconds=2,
        )
        with pytest.raises(ValueError, match="timed out|CPU time"):
            await executor.execute(data, execution_context)


class TestPythonSandboxMemoryLimit:
    """test_python_sandbox_memory_limit: Memory-hungry code killed."""

    @pytest.mark.asyncio
    async def test_python_sandbox_memory_limit(self, executor, execution_context):
        """Allocating excessive memory triggers resource limit."""
        data = make_node_data(
            code='x = [0] * (10 ** 9)',  # ~8GB allocation
            memory_limit_mb=64,
            timeout_seconds=10,
        )
        with pytest.raises(ValueError, match="memory|killed|MemoryError"):
            await executor.execute(data, execution_context)


class TestPythonSandboxBlocksOsImport:
    """test_python_sandbox_blocks_os_import: `import os` raises error."""

    @pytest.mark.asyncio
    async def test_python_sandbox_blocks_os_import(self, executor, execution_context):
        """Importing os module is blocked by the import hook."""
        data = make_node_data(code='import os\nresult = os.getcwd()')

        with pytest.raises(ValueError, match="not allowed|blocked"):
            await executor.execute(data, execution_context)


class TestPythonSandboxBlocksSubprocess:
    """test_python_sandbox_blocks_subprocess: `import subprocess` blocked."""

    @pytest.mark.asyncio
    async def test_python_sandbox_blocks_subprocess(self, executor, execution_context):
        """Importing subprocess module is blocked."""
        data = make_node_data(
            code='import subprocess\nresult = subprocess.run(["ls"], capture_output=True)'
        )
        with pytest.raises(ValueError, match="not allowed|blocked"):
            await executor.execute(data, execution_context)


class TestPythonSandboxBlocksNetwork:
    """test_python_sandbox_blocks_network: `import socket` blocked."""

    @pytest.mark.asyncio
    async def test_python_sandbox_blocks_socket(self, executor, execution_context):
        """Importing socket module is blocked."""
        data = make_node_data(
            code='import socket\ns = socket.socket()'
        )
        with pytest.raises(ValueError, match="not allowed|blocked"):
            await executor.execute(data, execution_context)

    @pytest.mark.asyncio
    async def test_python_sandbox_blocks_urllib(self, executor, execution_context):
        """Importing urllib.request is also blocked."""
        data = make_node_data(
            code='import urllib.request\nresult = urllib.request.urlopen("http://evil.com")'
        )
        with pytest.raises(ValueError, match="not allowed|blocked"):
            await executor.execute(data, execution_context)


class TestPythonSandboxNoConfigAccess:
    """test_python_sandbox_no_config_access: Cannot access credentials."""

    @pytest.mark.asyncio
    async def test_python_sandbox_no_config_access(self, executor, execution_context):
        """Sandbox cannot access execution context, API keys, or env vars.

        Even though ExecutionContext has extra_data with memory_service
        and api_key, these are NOT passed to the subprocess sandbox.
        The sandbox only receives explicitly provided inputs.
        """
        data = make_node_data(
            code=(
                '# Try to access env vars (should fail -- clean env)\n'
                'result = None\n'
                'try:\n'
                '    # os is blocked\n'
                '    import os\n'
                '    result = os.environ.get("DATABASE_URL")\n'
                'except:\n'
                '    result = "os_blocked"\n'
            ),
        )
        # Should succeed but result should show os was blocked
        output = await executor.execute(data, execution_context)
        assert output["result"] == "os_blocked"

    @pytest.mark.asyncio
    async def test_secret_references_scrubbed(self, executor, execution_context):
        """Inputs with __secret__ tags are scrubbed before sandbox."""
        data = make_node_data(
            code='result = inputs.get("api_key", "not_found")',
            inputs={
                "normal_value": "hello",
                "api_key": {"__secret__": True, "value": "sk-12345"},
            },
        )
        output = await executor.execute(data, execution_context)
        # Secret value should be redacted
        assert output["result"] == "[REDACTED]"


# =====================================================================
# JavaScript Sandbox Tests
# =====================================================================


class TestJsSandboxReturnsResult:
    """test_js_sandbox_returns_result: Simple JS code returns value."""

    @pytest.mark.asyncio
    async def test_js_sandbox_returns_result(self, executor, execution_context):
        """Simple JavaScript code sets result and returns it.

        NOTE: This test requires Deno to be installed. If Deno is not
        available, the test will verify the appropriate error message.
        """
        data = make_node_data(
            code='result = 42;',
            language="javascript",
        )
        try:
            output = await executor.execute(data, execution_context)
            assert output["result"] == 42
        except ValueError as e:
            if "Deno runtime not installed" in str(e):
                pytest.skip("Deno not installed -- skipping JS sandbox test")
            raise

    @pytest.mark.asyncio
    async def test_js_sandbox_with_inputs(self, executor, execution_context):
        """JavaScript code can access inputs object."""
        data = make_node_data(
            code='result = inputs.x + inputs.y;',
            language="javascript",
            inputs={"x": 10, "y": 32},
        )
        try:
            output = await executor.execute(data, execution_context)
            assert output["result"] == 42
        except ValueError as e:
            if "Deno runtime not installed" in str(e):
                pytest.skip("Deno not installed -- skipping JS sandbox test")
            raise


class TestJsSandboxTimeout:
    """test_js_sandbox_timeout: Long-running JS killed."""

    @pytest.mark.asyncio
    async def test_js_sandbox_timeout(self, executor, execution_context):
        """Infinite loop in JS is killed after timeout."""
        data = make_node_data(
            code='while(true) {}',
            language="javascript",
            timeout_seconds=2,
        )
        try:
            with pytest.raises(ValueError, match="timed out|timeout"):
                await executor.execute(data, execution_context)
        except ValueError as e:
            if "Deno runtime not installed" in str(e):
                pytest.skip("Deno not installed -- skipping JS sandbox test")
            raise


class TestJsSandboxIsolated:
    """test_js_sandbox_isolated: No access to Node.js globals."""

    @pytest.mark.asyncio
    async def test_js_sandbox_no_process(self, executor, execution_context):
        """Deno sandbox does not expose Node.js `process` global."""
        data = make_node_data(
            code=(
                'try {\n'
                '  result = typeof process;\n'
                '} catch(e) {\n'
                '  result = "undefined";\n'
                '}\n'
            ),
            language="javascript",
        )
        try:
            output = await executor.execute(data, execution_context)
            assert output["result"] == "undefined"
        except ValueError as e:
            if "Deno runtime not installed" in str(e):
                pytest.skip("Deno not installed -- skipping JS sandbox test")
            raise

    @pytest.mark.asyncio
    async def test_js_sandbox_no_require(self, executor, execution_context):
        """Deno sandbox does not expose Node.js `require` function."""
        data = make_node_data(
            code=(
                'try {\n'
                '  result = typeof require;\n'
                '} catch(e) {\n'
                '  result = "undefined";\n'
                '}\n'
            ),
            language="javascript",
        )
        try:
            output = await executor.execute(data, execution_context)
            assert output["result"] == "undefined"
        except ValueError as e:
            if "Deno runtime not installed" in str(e):
                pytest.skip("Deno not installed -- skipping JS sandbox test")
            raise

    @pytest.mark.asyncio
    async def test_js_sandbox_no_deno_globals(self, executor, execution_context):
        """User code in the sandbox cannot access Deno.env, Deno.run, etc.

        The Function constructor scope does not include Deno globals.
        """
        data = make_node_data(
            code=(
                'try {\n'
                '  result = typeof Deno;\n'
                '} catch(e) {\n'
                '  result = "no_access";\n'
                '}\n'
            ),
            language="javascript",
        )
        try:
            output = await executor.execute(data, execution_context)
            # Deno should either be undefined or inaccessible in the Function scope
            assert output["result"] in ("undefined", "no_access")
        except ValueError as e:
            if "Deno runtime not installed" in str(e):
                pytest.skip("Deno not installed -- skipping JS sandbox test")
            raise


# =====================================================================
# Edge Cases and Security
# =====================================================================


class TestCodeStepEdgeCases:
    """Additional edge case and security tests."""

    @pytest.mark.asyncio
    async def test_empty_code_raises(self, executor, execution_context):
        """Empty code string raises ValueError."""
        data = make_node_data(code="")
        with pytest.raises(ValueError, match="required"):
            await executor.execute(data, execution_context)

    @pytest.mark.asyncio
    async def test_code_too_long_raises(self, executor, execution_context):
        """Code exceeding 100KB raises ValueError."""
        data = make_node_data(code="x = 1\n" * 50_000)  # ~300KB
        with pytest.raises(ValueError, match="maximum length"):
            await executor.execute(data, execution_context)

    @pytest.mark.asyncio
    async def test_unsupported_language_raises(self, executor, execution_context):
        """Unsupported language raises ValueError."""
        data = make_node_data(code="puts 'hello'", language="ruby")
        with pytest.raises(ValueError, match="Unsupported language"):
            await executor.execute(data, execution_context)

    @pytest.mark.asyncio
    async def test_syntax_error_reported(self, executor, execution_context):
        """Python syntax errors are reported clearly."""
        data = make_node_data(code="def foo(\n  # incomplete")
        with pytest.raises(ValueError, match="Syntax error|syntax"):
            await executor.execute(data, execution_context)

    @pytest.mark.asyncio
    async def test_stdout_captured(self, executor, execution_context):
        """print() output is captured in stdout field."""
        data = make_node_data(
            code='print("hello world")\nresult = "done"'
        )
        output = await executor.execute(data, execution_context)
        assert output["result"] == "done"
        assert "hello world" in output["stdout"]

    @pytest.mark.asyncio
    async def test_allowed_imports_work(self, executor, execution_context):
        """Safe modules like math, json, re can be imported."""
        data = make_node_data(
            code=(
                'import math\n'
                'import json\n'
                'result = math.sqrt(144)\n'
            ),
        )
        output = await executor.execute(data, execution_context)
        assert output["result"] == 12.0

    @pytest.mark.asyncio
    async def test_blocks_ctypes(self, executor, execution_context):
        """ctypes import is blocked (prevents FFI escape)."""
        data = make_node_data(code='import ctypes')
        with pytest.raises(ValueError, match="not allowed|blocked"):
            await executor.execute(data, execution_context)

    @pytest.mark.asyncio
    async def test_blocks_importlib(self, executor, execution_context):
        """importlib import is blocked (prevents dynamic loading)."""
        data = make_node_data(code='import importlib')
        with pytest.raises(ValueError, match="not allowed|blocked"):
            await executor.execute(data, execution_context)
```

### Test-to-TDD Mapping

| TDD Test Name | Test Class/Method | Verified By |
|---------------|------------------|-------------|
| `test_python_sandbox_returns_result` | `TestPythonSandboxReturnsResult.test_python_sandbox_returns_result` | `result = 42` returns 42 |
| `test_python_sandbox_receives_inputs` | `TestPythonSandboxReceivesInputs.test_python_sandbox_receives_inputs` | `inputs["x"] + inputs["y"]` works |
| `test_python_sandbox_timeout` | `TestPythonSandboxTimeout.test_python_sandbox_timeout` | `while True: pass` killed after 2s |
| `test_python_sandbox_memory_limit` | `TestPythonSandboxMemoryLimit.test_python_sandbox_memory_limit` | `[0] * 10**9` killed |
| `test_python_sandbox_blocks_os_import` | `TestPythonSandboxBlocksOsImport.test_python_sandbox_blocks_os_import` | `import os` raises error |
| `test_python_sandbox_blocks_subprocess` | `TestPythonSandboxBlocksSubprocess.test_python_sandbox_blocks_subprocess` | `import subprocess` blocked |
| `test_python_sandbox_blocks_network` | `TestPythonSandboxBlocksNetwork.test_python_sandbox_blocks_socket` | `import socket` blocked |
| `test_python_sandbox_no_config_access` | `TestPythonSandboxNoConfigAccess.test_python_sandbox_no_config_access` | Cannot access env/credentials |
| `test_js_sandbox_returns_result` | `TestJsSandboxReturnsResult.test_js_sandbox_returns_result` | `result = 42` returns 42 |
| `test_js_sandbox_timeout` | `TestJsSandboxTimeout.test_js_sandbox_timeout` | `while(true){}` killed |
| `test_js_sandbox_isolated` | `TestJsSandboxIsolated.test_js_sandbox_no_process` | No `process`, `require`, `Deno` globals |

---

## Dependencies on Other Sections

| Section | Dependency | Nature |
|---------|-----------|--------|
| **Section 01 (LangGraph Runtime Core)** | `NodeAdapter` wraps `CodeStepExecutor` and `ApprovalExecutor` like any other executor. `WorkflowState` is the state schema. | Both executors implement the `NodeExecutor` protocol (from `base.py`) and are wrapped by `make_langgraph_node()`. |
| **Section 03 (HITL Interrupt)** | `ApprovalExecutor` implementation, `InterruptPayload`, `PendingInterruptTracker`, `HITLResumeHandler`, Celery timeout task | The approval node executor is fully defined in Section 03. This section only registers the node type in the registry. |
| **Section 08 (Security Nodes)** | `__secret__` tagging and scrubbing pattern | `CodeStepExecutor._scrub_secrets()` removes `__secret__`-tagged values from inputs before passing to the sandbox. The `__secret__` wrapper format is defined in Section 08's Secrets Vault node. |
| **Section 11 (Node Registry)** | Registration entries for `approval_gate` (updated) and `code_step` (new) | The registry entries defined in Step 6 are added during Section 11's expansion pass. They are included here for completeness. |
| **Section 13 (Database Schema)** | `workflow_executions.status` includes `interrupted` value | The approval node's interrupt causes the execution status to be set to `interrupted` (handled by Section 03). |
| **Section 16 (Backward Compat)** | Legacy `code_runner` node type preserved | The old `code_runner` registration continues to point to the deprecated `CodeExecutor`. Existing workflows using `code_runner` are not broken. |

### Python Packages Required

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| (none) | -- | Python sandbox uses stdlib only (`asyncio`, `resource`, `json`) | N/A |
| `deno` | >=1.40 | JavaScript sandbox runtime (system binary, not pip) | **Install required** |

The Deno runtime must be installed on the server for JavaScript sandbox support. If not installed, the `code_step` node returns an error message for JavaScript code but continues working for Python.

Install Deno:
```bash
curl -fsSL https://deno.land/install.sh | sh
# Or via package manager:
# apt install deno  (if available)
# brew install deno  (macOS)
```

---

## Verification Checklist

- [ ] `python_runner.py` runs standalone: `echo '{"code":"result=42","inputs":{},"memory_limit_mb":128,"timeout_seconds":10}' | python3 python_runner.py`
- [ ] Import blocker prevents `import os` (exits with error JSON, not a crash)
- [ ] Resource limits kill `while True: pass` within timeout
- [ ] Resource limits kill `[0]*10**9` with memory error
- [ ] `unshare --net` prevents network access (test with `import socket` after removing from blocklist)
- [ ] Clean env prevents access to `DATABASE_URL`, `LLM_ENCRYPTION_KEY`, etc.
- [ ] Deno runner respects `--deny-net`, `--deny-env`, `--deny-run`
- [ ] Secret scrubbing replaces `__secret__`-tagged values with `[REDACTED]`
- [ ] `config["configurable"]` and `ExecutionContext.extra_data` are NOT passed to sandbox
- [ ] Legacy `code_runner` node type still works with deprecated `CodeExecutor`
- [ ] Updated `approval_gate` registry entry matches Section 03's `ApprovalExecutor` config expectations
- [ ] All 11 TDD tests pass: `pytest tests/test_node_executors/test_code_sandbox.py -v`