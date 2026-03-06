"""Workflow node executor for web automation tasks.

Calls AutomationCopilot.analyze() -> build() -> execute()
and returns extracted_data as the node output.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger(__name__)


class WebAutomationExecutor:
    """Workflow node executor for web automation tasks.

    Calls AutomationCopilot.analyze() -> build() -> execute()
    and returns extracted_data as the node output.
    """

    async def execute(self, inputs: dict, context: dict) -> dict:
        """Execute the web automation node.

        Args:
            inputs: Dict with keys: prompt, url, goal, vision_model (optional)
            context: Workflow execution context with tenant_id, user_id, etc.

        Returns:
            Dict with key 'extracted_data' containing the automation result.

        Raises:
            NotImplementedError: Until full pipeline integration is complete.
        """
        logger.info(
            "web_automation_executor_called",
            prompt=inputs.get("prompt", "")[:100],
            url=inputs.get("url"),
            tenant_id=context.get("tenant_id"),
        )
        raise NotImplementedError(
            "WebAutomationExecutor pending full pipeline implementation"
        )
