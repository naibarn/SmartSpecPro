"""Sandbox command and code execution helpers."""
import structlog

from .client import OpenSandboxClient
from .models import CommandResult

logger = structlog.get_logger(__name__)

MAX_OUTPUT_LENGTH = 50_000  # 50 KB max for stdout/stderr storage


def _truncate(text: str, max_length: int = MAX_OUTPUT_LENGTH) -> str:
    """Truncate text to max_length, adding a truncation marker."""
    if len(text) <= max_length:
        return text
    return text[:max_length - 50] + "\n... [truncated]"


async def run_command(
    client: OpenSandboxClient,
    sandbox_id: str,
    command: str,
    timeout: int = 30,
) -> CommandResult:
    """Execute a shell command in the sandbox. Truncates output if needed."""
    logger.info(
        "sandbox_run_command",
        sandbox_id=sandbox_id,
        command=command[:100],
        timeout=timeout,
    )
    result = await client.run_command(sandbox_id, command, timeout=timeout)
    return CommandResult(
        exit_code=result.exit_code,
        stdout=_truncate(result.stdout),
        stderr=_truncate(result.stderr),
    )


async def run_code(
    client: OpenSandboxClient,
    sandbox_id: str,
    code: str,
    language: str = "python",
) -> CommandResult:
    """Execute code via the sandbox code interpreter."""
    logger.info(
        "sandbox_run_code",
        sandbox_id=sandbox_id,
        language=language,
        code_length=len(code),
    )
    result = await client.execute_code(sandbox_id, code, language=language)
    return CommandResult(
        exit_code=result.exit_code,
        stdout=_truncate(result.stdout),
        stderr=_truncate(result.stderr),
    )
