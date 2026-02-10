"""
MCP (Model Context Protocol) Node Executor

Connects to MCP servers to fetch data from external systems.
Supports:
- Reading resources (files, data, etc.)
- Listing available resources
- Calling tools on MCP servers
"""

import logging
from typing import Any, Dict
import httpx
from ..base import NodeExecutor, NodeExecutionResult

logger = logging.getLogger(__name__)


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

            method = config.get("method", "read_resource")
            resource_uri = config.get("resource_uri", "")
            tool_name = config.get("tool_name", "")
            parameters = config.get("parameters", {})
            timeout = config.get("timeout", 30)

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
                    f"[MCP] Calling {method} on {server_url}",
                    extra={
                        "node_id": node_id,
                        "server_url": server_url,
                        "method": method,
                    },
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
                    error=f"MCP server error: {error_info.get('message', 'Unknown error')}",
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
                        "server_url": server_url,
                        "method": method,
                        "status": "success",
                    },
                },
            )

        except httpx.TimeoutException:
            logger.error(f"[MCP] Timeout connecting to {server_url}", exc_info=True)
            return NodeExecutionResult(
                success=False,
                error=f"Timeout connecting to MCP server: {server_url}",
                outputs={},
            )

        except httpx.HTTPError as e:
            logger.error(f"[MCP] HTTP error: {str(e)}", exc_info=True)
            return NodeExecutionResult(
                success=False,
                error=f"HTTP error connecting to MCP server: {str(e)}",
                outputs={},
            )

        except Exception as e:
            logger.error(f"[MCP] Execution error: {str(e)}", exc_info=True)
            return NodeExecutionResult(
                success=False,
                error=f"MCP execution error: {str(e)}",
                outputs={},
            )
