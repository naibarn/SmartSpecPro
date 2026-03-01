"""
Browser Automation Node Executor

Connects to the browser sandbox to navigate pages, extract content,
and take screenshots as part of a workflow execution.

Delegates to the Node.js /api/internal/tools/browser endpoint which
handles credit reservation and concurrency limits before calling
the Python browser tool service.
"""
from __future__ import annotations

import os
from typing import Any, Dict

import httpx
import structlog

from ..base import NodeExecutor, NodeExecutionResult

logger = structlog.get_logger(__name__)

_INTERNAL_SERVICE_URL = os.getenv("SMARTSPEC_INTERNAL_URL", "http://127.0.0.1:3000")
_BROWSER_ENDPOINT = f"{_INTERNAL_SERVICE_URL}/api/internal/tools/browser"
_GATEWAY_TOKEN = os.getenv("SMARTSPEC_WEB_GATEWAY_TOKEN", "")


class BrowserExecutor(NodeExecutor):
    """
    Executor for Browser Automation workflow nodes.

    Delegates to the Node.js browser tool endpoint which handles
    credit reservation and SSRF-protected sandbox execution.

    Config:
        - actions: List of browser actions to perform (required)
            Each action is a dict with 'action' key and action-specific params:
            - navigate: { action: 'navigate', url: str }
            - click: { action: 'click', selector: str }
            - fill: { action: 'fill', selector: str, value: str }
            - screenshot: { action: 'screenshot' }
            - extractText: { action: 'extractText', selector?: str }
            - extractLinks: { action: 'extractLinks' }
            - waitForSelector: { action: 'waitForSelector', selector: str }
            - scrollTo: { action: 'scrollTo', position: str }
        - allowed_domains: List of allowed domain hostnames (required, empty=deny all)
        - timeout: Session timeout in seconds (default: 300, max: 300)

    Returns:
        NodeExecutionResult with:
            - outputs.session_id: str
            - outputs.results: list of action results
            - outputs.actual_cost: int (credits consumed)
            - outputs.screenshots_taken: int
            - outputs.pages_loaded: int
    """

    async def execute(
        self,
        node_id: str,
        node_type: str,
        config: Dict[str, Any],
        inputs: Dict[str, Any],
        context: Dict[str, Any],
    ) -> NodeExecutionResult:
        """Execute browser automation actions via the Node.js proxy."""
        actions = config.get("actions") or inputs.get("actions") or []
        if not actions:
            return NodeExecutionResult(
                success=False,
                error="No browser actions configured.",
                outputs={},
            )

        allowed_domains = config.get("allowed_domains") or []
        timeout = min(int(config.get("timeout", 300)), 300)
        user_id = context.get("user_id")
        tenant_id = context.get("tenant_id", "")

        if not user_id:
            return NodeExecutionResult(
                success=False,
                error="user_id is required in execution context.",
                outputs={},
            )

        logger.info(
            "browser_executor_start",
            node_id=node_id,
            action_count=len(actions),
            user_id=user_id,
        )

        try:
            async with httpx.AsyncClient(timeout=timeout + 15) as client:
                response = await client.post(
                    _BROWSER_ENDPOINT,
                    json={
                        "userId": user_id,
                        "tenantId": tenant_id,
                        "actions": actions,
                        "allowedDomains": allowed_domains,
                        "timeout": timeout,
                    },
                    headers={
                        "X-Internal-Token": _GATEWAY_TOKEN,
                        "Content-Type": "application/json",
                    },
                )

            if response.status_code == 402:
                return NodeExecutionResult(
                    success=False,
                    error="Insufficient credits for browser automation.",
                    outputs={},
                )

            if response.status_code == 429:
                return NodeExecutionResult(
                    success=False,
                    error="Concurrent browser session limit reached.",
                    outputs={},
                )

            if not response.is_success:
                error_text = response.text[:500]
                logger.error(
                    "browser_executor_http_error",
                    node_id=node_id,
                    status=response.status_code,
                    body=error_text,
                )
                return NodeExecutionResult(
                    success=False,
                    error=f"Browser service returned {response.status_code}: {error_text}",
                    outputs={},
                )

            result = response.json()
            logger.info(
                "browser_executor_complete",
                node_id=node_id,
                session_id=result.get("session_id"),
                pages_loaded=result.get("pages_loaded", 0),
                actual_cost=result.get("actual_cost", 0),
            )

            return NodeExecutionResult(
                success=True,
                outputs=result,
            )

        except httpx.TimeoutException:
            return NodeExecutionResult(
                success=False,
                error=f"Browser session timed out after {timeout}s.",
                outputs={},
            )
        except Exception as exc:
            logger.error("browser_executor_error", node_id=node_id, error=str(exc))
            return NodeExecutionResult(
                success=False,
                error=f"Browser execution failed: {exc}",
                outputs={},
            )
