"""Browser and Sandbox MCP tool handlers.

Exposes browser automation and sandbox command tools as MCP-compatible
functions invoked via the internal MCP HTTP API.
"""

import logging
import re
import shlex
from typing import Any

import httpx

from app.core.config import settings
from app.mcp.google_drive_mcp import ToolError
from app.services.mcp_client import _BLOCKED_HOSTS

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────

ALLOWED_COMMANDS = {"python", "python3", "node", "npm", "pip"}
BLOCKED_FLAGS = {"-e", "--eval", "-c", "--command", "--exec"}
MAX_EXEC_TIMEOUT = 300

_PRIVATE_HOSTNAME_PATTERNS = [
    re.compile(r"^localhost$", re.I),
    re.compile(r"^127\."),
    re.compile(r"^10\."),
    re.compile(r"^172\.(1[6-9]|2\d|3[01])\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^169\.254\."),
    re.compile(r"^\[?::1\]?$"),
    re.compile(r"\.internal$", re.I),
    re.compile(r"\.local$", re.I),
]


def _validate_domains(domains: list[str]) -> list[str]:
    """Filter out SSRF-blocked domains."""
    safe = []
    for domain in domains:
        domain_lower = domain.strip().lower()
        if domain_lower in _BLOCKED_HOSTS:
            continue
        if any(p.match(domain_lower) for p in _PRIVATE_HOSTNAME_PATTERNS):
            continue
        safe.append(domain)
    return safe

# ── Tool Definitions (MCP schema format) ──────────────────────────────────

BROWSER_EXECUTE_ACTIONS_TOOL = {
    "name": "browser.execute_actions",
    "description": "Execute browser automation actions on allowed domains.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "allowed_domains": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Domains the browser is allowed to visit",
            },
            "actions": {
                "type": "array",
                "items": {"type": "object"},
                "description": "List of browser actions (navigate, click, fill, screenshot, extract_text)",
            },
            "session_id": {
                "type": "string",
                "description": "Optional session ID for continuity",
            },
            "timeout_seconds": {
                "type": "integer",
                "default": 300,
                "description": "Max execution time in seconds",
            },
        },
        "required": ["allowed_domains", "actions"],
    },
}

SANDBOX_EXEC_COMMAND_TOOL = {
    "name": "sandbox.exec_command",
    "description": "Execute an approved command in a sandboxed environment.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "Command to execute (must be in allowlist)",
            },
            "working_dir": {
                "type": "string",
                "description": "Working directory for the command",
            },
            "timeout_seconds": {
                "type": "integer",
                "default": 300,
                "description": "Max execution time",
            },
        },
        "required": ["command"],
    },
}

BROWSER_TOOLS = [BROWSER_EXECUTE_ACTIONS_TOOL, SANDBOX_EXEC_COMMAND_TOOL]

# ── Handlers ───────────────────────────────────────────────────────────────


async def handle_browser_execute_actions(
    allowed_domains: list[str],
    actions: list[dict],
    user_id: int,
    tenant_id: str,
    session_id: str | None = None,
    timeout_seconds: int = 300,
    **kwargs: Any,
) -> dict:
    """Dispatch browser actions to the Node browser tool route."""
    allowed_domains = _validate_domains(allowed_domains)
    if not allowed_domains:
        raise ToolError("invalid_input", "No valid domains after SSRF filtering")

    gateway_url = settings.SMARTSPEC_WEB_GATEWAY_URL
    if not gateway_url:
        raise ToolError("config_error", "SMARTSPEC_WEB_GATEWAY_URL not configured")

    gateway_token = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
    if not gateway_token:
        raise ToolError("config_error", "SMARTSPEC_WEB_GATEWAY_TOKEN not configured")

    effective_timeout = min(timeout_seconds, MAX_EXEC_TIMEOUT)
    body: dict[str, Any] = {
        "userId": user_id,
        "tenantId": tenant_id,
        "actions": actions,
        "allowedDomains": allowed_domains,
        "timeout": effective_timeout,
    }
    if session_id:
        body["sessionId"] = session_id

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{gateway_url}/api/internal/tools/browser",
                json=body,
                headers={"X-Internal-Token": gateway_token},
                timeout=effective_timeout + 10,
            )
    except httpx.TimeoutException:
        raise ToolError("timeout", "Browser execution timed out")
    except httpx.ConnectError:
        raise ToolError("connection_error", "Cannot reach browser tool service")

    if resp.status_code >= 400:
        logger.error("browser_tool_dispatch_error status=%d", resp.status_code)
        error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        code = error_body.get("code", "execution_error")
        message = error_body.get("error", "Browser execution failed")
        raise ToolError(code, message)

    return resp.json()


async def handle_sandbox_exec_command(
    command: str,
    user_id: int,
    tenant_id: str,
    working_dir: str | None = None,
    timeout_seconds: int = 300,
    node_config: dict | None = None,
    **kwargs: Any,
) -> dict:
    """Execute an approved command in the sandbox."""
    # Capability check
    if node_config is not None:
        capabilities = node_config.get("capabilities", {})
        if not capabilities.get("sandbox_command"):
            raise ToolError("capability_required", "sandbox_command capability is required")

    # Command allowlist + dangerous flag check
    parts = shlex.split(command.strip()) if command.strip() else []
    base_command = parts[0] if parts else ""
    if base_command not in ALLOWED_COMMANDS:
        raise ToolError("command_not_allowed", f"Command '{base_command}' is not in the allowed commands list")
    for flag in parts[1:]:
        if flag in BLOCKED_FLAGS:
            raise ToolError("command_not_allowed", f"Flag '{flag}' is not allowed")
        if ".." in flag:
            raise ToolError("command_not_allowed", "Path traversal not allowed in command arguments")

    # Clamp timeout
    effective_timeout = min(timeout_seconds, MAX_EXEC_TIMEOUT)

    logger.info(
        "sandbox_exec_command user_id=%d tenant_id=%s command=%s timeout=%d",
        user_id, tenant_id, base_command, effective_timeout,
    )

    # Dispatch to sandbox
    from app.core.database import get_db_context

    async with get_db_context() as db:
        from app.services.sandbox_dispatcher import SandboxDispatcher

        dispatcher = SandboxDispatcher(db)
        job_id = await dispatcher.dispatch(
            feature_type="connector",
            execution_mode="command",
            tenant_id=tenant_id,
            user_id=user_id,
            inputs={"command": command, "working_dir": working_dir, "timeout": effective_timeout},
        )

    if job_id is None:
        raise ToolError("sandbox_unavailable", "Sandbox execution is not available")

    return {"job_id": job_id, "status": "dispatched"}


# ── Export ─────────────────────────────────────────────────────────────────

TOOL_HANDLERS = {
    "browser.execute_actions": handle_browser_execute_actions,
    "sandbox.exec_command": handle_sandbox_exec_command,
}
