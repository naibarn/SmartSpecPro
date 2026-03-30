"""
MCP (Model Context Protocol) Node Executor

Connects to MCP servers to fetch data from external systems.
Supports:
- Reading resources (files, data, etc.)
- Listing available resources
- Calling tools on MCP servers
"""

from typing import Any, Dict

import httpx
import structlog
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.workflow import Workflow
from app.services.mcp_client import _validate_mcp_url

from ..base import NodeExecutor, NodeExecutionResult

logger = structlog.get_logger(__name__)

MAX_TIMEOUT_SECONDS = 120.0


def _normalize_timeout(raw_timeout: Any) -> float:
    try:
        timeout = float(raw_timeout)
    except (TypeError, ValueError):
        timeout = 30.0
    return max(1.0, min(timeout, MAX_TIMEOUT_SECONDS))


async def _verify_workflow_ownership(context: Dict[str, Any]) -> str | None:
    """Return None when the workflow belongs to the caller, else an error message."""
    workflow_id = context.get("workflow_id") or context.get("workflowId")
    user_id = context.get("user_id") or context.get("userId")
    tenant_id = context.get("tenant_id") or context.get("tenantId")

    if workflow_id is None:
        return "workflow_id is required"
    if user_id is None:
        return "user_id is required"

    try:
        workflow_pk = int(str(workflow_id))
    except (TypeError, ValueError):
        return "Invalid workflow_id"

    try:
        caller_user_id = int(str(user_id))
    except (TypeError, ValueError):
        return "Invalid user_id"

    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Workflow).where(Workflow.id == workflow_pk)
            )
            workflow = result.scalar_one_or_none()
    except Exception as exc:
        logger.warning(
            "mcp_workflow_ownership_lookup_failed",
            workflow_id=workflow_id,
            user_id=user_id,
            tenant_id=tenant_id,
            error=str(exc),
        )
        return "Failed to verify workflow ownership"

    if workflow is None:
        return "Workflow not found"

    if workflow.userId != caller_user_id:
        return "Unauthorized workflow access"

    if tenant_id is not None and workflow.tenantId not in (None, str(tenant_id)):
        return "Unauthorized workflow access"

    return None


class MCPExecutor(NodeExecutor):
    """
    Executor for MCP (Model Context Protocol) nodes.

    Connects to MCP servers to access external resources and tools.
    """

    async def execute(
        self,
        node_id: str,
        node_type: str,
        config: Dict[str, Any],
        inputs: Dict[str, Any],
        context: Dict[str, Any],
    ) -> NodeExecutionResult:
        """
        Execute MCP server request.

        Config:
            - mcp_server_url: URL of the MCP server (required)
            - resource_uri: URI of the resource (for read/list operations)
            - method: Operation type (read_resource, list_resources, call_tool)
            - tool_name: Name of tool to call (for call_tool method)
            - parameters: Additional parameters (JSON object)
            - timeout: Request timeout in seconds (default: 30)

        Returns:
            NodeExecutionResult with fetched data and metadata
        """
        try:
            # Get configuration
            server_url = config.get("mcp_server_url", "").strip()
            if not server_url:
                return NodeExecutionResult(
                    success=False,
                    error="MCP server URL is required",
                    outputs={},
                )

            validation_error = _validate_mcp_url(server_url)
            if validation_error:
                logger.warning(
                    "mcp_executor_ssrf_blocked",
                    node_id=node_id,
                    method=config.get("method", "read_resource"),
                    error=validation_error,
                )
                return NodeExecutionResult(
                    success=False,
                    error="MCP server URL blocked by SSRF protection",
                    outputs={},
                )

            ownership_error = await _verify_workflow_ownership(context)
            if ownership_error:
                logger.warning(
                    "mcp_executor_workflow_unauthorized",
                    node_id=node_id,
                    workflow_id=context.get("workflow_id") or context.get("workflowId"),
                    user_id=context.get("user_id") or context.get("userId"),
                    tenant_id=context.get("tenant_id") or context.get("tenantId"),
                    error=ownership_error,
                )
                return NodeExecutionResult(
                    success=False,
                    error=ownership_error,
                    outputs={},
                )

            method = config.get("method", "read_resource")
            resource_uri = config.get("resource_uri", "")
            tool_name = config.get("tool_name", "")
            parameters = config.get("parameters", {})
            timeout = _normalize_timeout(config.get("timeout", 30))

            # Ensure server URL ends with /rpc if not already specified
            if not server_url.endswith("/rpc"):
                server_url = f"{server_url.rstrip('/')}/rpc"

            # Build request based on method
            if method == "read_resource":
                if not resource_uri:
                    return NodeExecutionResult(
                        success=False,
                        error="resource_uri is required for read_resource method",
                        outputs={},
                    )

                request_data = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "resources/read",
                    "params": {
                        "uri": resource_uri,
                        **parameters,
                    },
                }

            elif method == "list_resources":
                request_data = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "resources/list",
                    "params": parameters,
                }

            elif method == "call_tool":
                if not tool_name:
                    return NodeExecutionResult(
                        success=False,
                        error="tool_name is required for call_tool method",
                        outputs={},
                    )

                request_data = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {
                        "name": tool_name,
                        "arguments": parameters,
                    },
                }

            else:
                return NodeExecutionResult(
                    success=False,
                    error=f"Invalid method: {method}. Use read_resource, list_resources, or call_tool",
                    outputs={},
                )

            # Make request to MCP server
            async with httpx.AsyncClient(timeout=timeout) as client:
                logger.info(
                    "mcp_executor_request",
                    node_id=node_id,
                    method=method,
                    timeout=timeout,
                )

                response = await client.post(
                    server_url,
                    json=request_data,
                    headers={"Content-Type": "application/json"},
                )

                response.raise_for_status()
                response_data = response.json()

            # Check for JSON-RPC error
            if "error" in response_data:
                error_info = response_data["error"]
                return NodeExecutionResult(
                    success=False,
                    error="MCP server returned an error",
                    outputs={
                        "error_code": error_info.get("code"),
                        "error_message": error_info.get("message"),
                        "error_data": error_info.get("data"),
                    },
                )

            # Extract result
            result = response_data.get("result", {})

            # Format output based on method
            if method == "read_resource":
                # Resource read returns content
                content = result.get("contents", [])
                output_data = {
                    "content": content[0] if content else None,
                    "uri": resource_uri,
                }

            elif method == "list_resources":
                # List returns array of resources
                resources = result.get("resources", [])
                output_data = {
                    "resources": resources,
                    "count": len(resources),
                }

            elif method == "call_tool":
                # Tool call returns tool output
                output_data = {
                    "tool_result": result.get("content", []),
                    "tool_name": tool_name,
                }

            return NodeExecutionResult(
                success=True,
                outputs={
                    "data": output_data,
                    "metadata": {
                        "method": method,
                        "status": "success",
                    },
                },
            )

        except httpx.TimeoutException:
            logger.error("mcp_executor_timeout", exc_info=True)
            return NodeExecutionResult(
                success=False,
                error="MCP server request timed out",
                outputs={},
            )

        except httpx.HTTPError as e:
            logger.error("mcp_executor_http_error", error=str(e), exc_info=True)
            return NodeExecutionResult(
                success=False,
                error="MCP server request failed",
                outputs={},
            )

        except Exception as e:
            logger.error("mcp_executor_failed", error=str(e), exc_info=True)
            return NodeExecutionResult(
                success=False,
                error="MCP execution failed",
                outputs={},
            )
