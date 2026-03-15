"""Workflow node executor for web automation tasks.

Calls AutomationCopilot.analyze() -> build() -> execute()
and returns extracted_data as the node output.
"""

from __future__ import annotations

import structlog

from app.services.automation_exceptions import AutomationError
from app.services.llm_gateway_client import (
    GatewayUnavailableError,
    InsufficientCreditsError,
    LLMGatewayClient,
)
from app.services.live_browser_observability import emit_rollout_metric

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
            Dict with status and extracted_data or error message.
        """
        from app.services.automation_copilot import AutomationCopilot
        from app.services.browser_pool import BrowserPool
        from app.services.playwright_script_generator import PlaywrightScriptGenerator
        from app.services.selector_cache import SelectorCache
        from app.services.self_healing_executor import SelfHealingExecutor

        prompt = inputs.get("prompt", "")
        tenant_id = context.get("tenant_id", "default")
        user_id = context.get("user_id", 0)
        execution_id = context.get("execution_id", "unknown")
        vision_model = inputs.get("vision_model", "gpt-4o")
        allowed_domains = context.get("allowed_domains", [])

        logger.info(
            "web_automation_executor_called",
            prompt=prompt[:100],
            url=inputs.get("url"),
            tenant_id=tenant_id,
        )
        emit_rollout_metric(
            "workflow_browser_session_legacy_fallback_total",
            origin_surface="workflow",
            reason_category="legacy_fallback",
        )

        try:
            gateway_client = LLMGatewayClient()
            browser_pool = BrowserPool()
            selector_cache = SelectorCache()

            script_generator = PlaywrightScriptGenerator(
                browser_pool, selector_cache, gateway_client=gateway_client
            )
            executor = SelfHealingExecutor(
                browser_pool, selector_cache,
                vision_model=vision_model,
                gateway_client=gateway_client,
            )
            copilot = AutomationCopilot(
                script_generator, executor, gateway_client=gateway_client
            )

            # Step 1: Analyze intent
            analysis = await copilot.analyze(prompt, tenant_id, user_id)

            if analysis.status == "needs_clarification":
                return {
                    "status": "needs_input",
                    "questions": analysis.questions or [],
                }

            # Step 2: Build scripts
            await copilot.build(
                analysis.intent,
                execution_id, tenant_id, user_id,
                vision_model, allowed_domains,
            )

            # Step 3: Execute scripts
            async def status_callback(status: str) -> None:
                logger.info("automation_status", execution_id=execution_id, status=status)

            result = await copilot.execute_scripts(
                execution_id, tenant_id, user_id,
                allowed_domains, status_callback,
            )

            return {
                "status": "success",
                "extracted_data": result.extracted_data if result else None,
                "screenshots": result.screenshots if result else [],
            }

        except GatewayUnavailableError as exc:
            logger.error("gateway_unavailable", error=str(exc))
            return {"status": "error", "message": "LLM gateway unavailable"}
        except InsufficientCreditsError as exc:
            logger.error("insufficient_credits", error=str(exc))
            return {"status": "error", "message": "Insufficient credits"}
        except AutomationError as exc:
            logger.error("automation_error", error=str(exc))
            return {"status": "error", "message": str(exc)}
        except Exception as exc:
            logger.error("unexpected_error", error=str(exc), exc_info=True)
            return {"status": "error", "message": "An unexpected error occurred during automation"}
