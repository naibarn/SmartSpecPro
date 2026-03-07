"""Self-healing Playwright script executor with Vision LLM diagnosis."""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from pydantic import BaseModel

from app.services.automation_exceptions import (
    CancellationRequestedError,
    HealingExhaustedError,
    SelectorNotFoundError,
)
from app.services.llm_gateway_client import GatewayUnavailableError
from app.services.playwright_script_generator import PlaywrightAction, PlaywrightScript

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from playwright.async_api import Page

    from app.services.browser_pool import BrowserPool
    from app.services.llm_gateway_client import LLMGatewayClient
    from app.services.selector_cache import SelectorCache

logger = logging.getLogger(__name__)

_DIAGNOSIS_SYSTEM_PROMPT = """\
You are a browser automation failure diagnostician.

Given a screenshot of the current page state, the failed action details, and the error message, \
diagnose why the action failed and suggest a fix.

Return a JSON object with:
- root_cause: string explaining what went wrong
- suggested_new_selector: object with "css" key containing a CSS/ARIA/data-testid selector, or null
- confidence: float 0.0-1.0 in your diagnosis
- action_type_still_valid: boolean, whether the same action type should be used

Do NOT suggest JavaScript evaluate or page.evaluate selectors. Only suggest CSS selectors, \
ARIA selectors, or data-testid selectors.

Return ONLY valid JSON, no markdown fences or extra text."""


class FailureDiagnosis(BaseModel):
    """Result of Vision LLM analysis of a failed action."""

    root_cause: str
    suggested_new_selector: dict | None = None
    confidence: float
    action_type_still_valid: bool


class ExecutionResult(BaseModel):
    """Final result of executing a PlaywrightScript."""

    extracted_data: dict | None = None
    screenshots: list[str] = []
    pages_loaded: int = 0
    healed: bool = False
    heal_attempts: int = 0
    credits_used: int = 0


class SelfHealingExecutor:
    """Executes PlaywrightScript with automatic failure recovery."""

    def __init__(
        self,
        browser_pool: BrowserPool,
        selector_cache: SelectorCache,
        vision_model: str = "gpt-4o",
        max_heal_attempts: int = 3,
        redis_client: aioredis.Redis | None = None,
        gateway_client: LLMGatewayClient | None = None,
    ) -> None:
        self._browser_pool = browser_pool
        self._cache = selector_cache
        self._vision_model = vision_model
        self._max_heal_attempts = max_heal_attempts
        self._redis = redis_client
        self._gateway = gateway_client
        self._credits_used = 0

    async def execute(
        self,
        script: PlaywrightScript,
        execution_id: str,
        tenant_id: str,
        allowed_domains: list[str],
        status_callback: Callable[[str], Awaitable[None]],
    ) -> ExecutionResult:
        """Execute the script, healing as needed."""
        self._credits_used = 0
        extracted_data: dict | None = None
        screenshots: list[str] = []

        async with self._browser_pool.session(tenant_id) as context:
            page = await context.new_page()
            try:
                await status_callback("running")

                heal_attempts = 0
                while True:
                    success, failed_action, failed_idx, error, data = (
                        await self._execute_script(page, script, execution_id)
                    )
                    if data:
                        extracted_data = data

                    if success:
                        if heal_attempts > 0:
                            await self._cache.mark_heal(
                                tenant_id,
                                script.url,
                                script.goal,
                                [a.model_dump() for a in script.actions],
                            )
                        await status_callback("success")
                        return ExecutionResult(
                            extracted_data=extracted_data,
                            screenshots=screenshots,
                            healed=heal_attempts > 0,
                            heal_attempts=heal_attempts,
                            credits_used=self._credits_used,
                        )

                    if heal_attempts >= self._max_heal_attempts:
                        break

                    heal_attempts += 1
                    await status_callback(f"healing_attempt_{heal_attempts}")

                    diagnosis = await self._diagnose_failure(page, failed_action, error)
                    self._credits_used += 1

                    new_action = await self.regenerate_from_failure(
                        diagnosis, failed_action, page
                    )
                    if new_action is None:
                        break

                    # Replace the failed action
                    script.actions[failed_idx] = new_action

                # Exhausted healing
                await self._cache.invalidate(tenant_id, script.url, script.goal)
                await status_callback("failed")
                raise HealingExhaustedError(
                    f"Failed after {heal_attempts} heal attempts",
                    details={"attempts": heal_attempts},
                )
            finally:
                await page.close()

    async def _execute_script(
        self,
        page: Any,
        script: PlaywrightScript,
        execution_id: str,
    ) -> tuple[bool, PlaywrightAction | None, int, Exception | None, dict | None]:
        """Execute all actions. Returns (success, failed_action, failed_idx, error, data)."""
        extracted_data: dict = {}

        for idx, action in enumerate(script.actions):
            # Cancellation check
            if self._redis:
                cancel_val = await self._redis.get(f"automation:{execution_id}:cancel")
                if cancel_val == b"1":
                    raise CancellationRequestedError("Execution cancelled by user")

            try:
                locator = page.locator(action.selector_css)
                count = await locator.count()
                if count == 0:
                    raise SelectorNotFoundError(
                        f"Selector '{action.selector_css}' found 0 elements"
                    )

                if action.action_type == "click":
                    await locator.click()
                elif action.action_type == "fill":
                    await locator.fill(action.value or "")
                elif action.action_type == "select":
                    await locator.select_option(action.value or "")
                elif action.action_type == "hover":
                    await locator.hover()
                elif action.action_type == "extract_data":
                    # Use only built-in locator methods (ADR-031-002)
                    text = await locator.inner_text()
                    extracted_data[action.description] = text
                elif action.action_type == "goto":
                    await page.goto(action.value or action.selector_css)
                else:
                    await locator.click()  # Default to click

            except (CancellationRequestedError, KeyboardInterrupt):
                raise
            except Exception as exc:
                return (False, action, idx, exc, extracted_data if extracted_data else None)

        return (True, None, -1, None, extracted_data if extracted_data else None)

    async def _diagnose_failure(
        self, page: Any, failed_action: PlaywrightAction, error: Exception
    ) -> FailureDiagnosis:
        """Take screenshot at failure, ask Vision LLM to diagnose.

        Override in tests. Production calls the LLM gateway.
        """
        screenshot_bytes = await page.screenshot(type="png")
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode()

        if self._gateway is None or os.environ.get("AUTOMATION_LLM_ENABLED") == "false":
            return FailureDiagnosis(
                root_cause=f"Selector '{failed_action.selector_css}' failed: {error}",
                suggested_new_selector=None,
                confidence=0.0,
                action_type_still_valid=False,
            )

        try:
            user_text = (
                f"Failed action: {failed_action.action_type} on selector "
                f"'{failed_action.selector_css}'\n"
                f"Description: {failed_action.description}\n"
                f"Error: {str(error)}"
            )
            messages = [
                {"role": "system", "content": _DIAGNOSIS_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"},
                        },
                    ],
                },
            ]

            result = await self._gateway.chat_completion(
                messages=messages,
                model=self._vision_model,
            )

            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            parsed = json.loads(content)

            return FailureDiagnosis(
                root_cause=parsed.get("root_cause", "Unknown"),
                suggested_new_selector=parsed.get("suggested_new_selector"),
                confidence=float(parsed.get("confidence", 0.0)),
                action_type_still_valid=parsed.get("action_type_still_valid", False),
            )

        except GatewayUnavailableError:
            logger.warning("LLM gateway unavailable for failure diagnosis")
            return FailureDiagnosis(
                root_cause="LLM unavailable",
                suggested_new_selector=None,
                confidence=0.0,
                action_type_still_valid=False,
            )
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            logger.warning("Failed to parse diagnosis response: %s", exc)
            return FailureDiagnosis(
                root_cause=f"Parse error: {exc}",
                suggested_new_selector=None,
                confidence=0.0,
                action_type_still_valid=False,
            )

    async def regenerate_from_failure(
        self,
        diagnosis: FailureDiagnosis,
        original_action: PlaywrightAction,
        page: Any,
    ) -> PlaywrightAction | None:
        """Generate a replacement action from failure diagnosis."""
        if not diagnosis.action_type_still_valid:
            return None

        if diagnosis.suggested_new_selector is None:
            return None

        css = diagnosis.suggested_new_selector.get("css", "")
        if not css:
            return None

        # Validate new selector
        try:
            locator = page.locator(css)
            count = await locator.count()
            if count == 0:
                return None
        except Exception:
            return None

        return PlaywrightAction(
            action_type=original_action.action_type,
            selector_css=css,
            selector_strategies=[css],
            description=f"Healed: {original_action.description}",
            confidence=diagnosis.confidence,
            value=original_action.value,
        )
