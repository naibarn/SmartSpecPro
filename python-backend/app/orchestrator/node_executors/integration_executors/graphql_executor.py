"""GraphQL Executor - Execute GraphQL operations."""

import logging
from typing import Any

import aiohttp

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class GraphQLExecutor:
    """
    Execute GraphQL operations.

    Features:
    - Queries and mutations
    - Variables support
    - Custom headers
    - Response parsing
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Execute GraphQL request."""
        url = data.inputs.get("url")
        query = data.inputs.get("query")
        variables = data.inputs.get("variables", {})
        operation_name = data.inputs.get("operation_name")
        headers = data.inputs.get("headers", {})
        timeout = data.inputs.get("timeout", 30)

        if not url:
            raise ValueError("GraphQL endpoint URL is required")
        if not query:
            raise ValueError("GraphQL query is required")

        payload = {"query": query, "variables": variables}
        if operation_name:
            payload["operationName"] = operation_name

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers={
                    "content-type": "application/json",
                    **headers,
                },
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as response:
                result = await response.json()

                has_errors = "errors" in result and result["errors"]

                return {
                    "success": not has_errors,
                    "data": result.get("data"),
                    "errors": result.get("errors"),
                    "status_code": response.status,
                }
