"""Self-healing Playwright script executor with Vision LLM diagnosis."""

from __future__ import annotations

import base64
import inspect
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
    from app.services.browser_policy_node_client import (
        BrowserPolicyExecutionState,
        BrowserPolicyNodeClient,
    )
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
        policy_client: BrowserPolicyNodeClient | None = None,
    ) -> None:
        self._browser_pool = browser_pool
        self._cache = selector_cache
        self._vision_model = vision_model
        self._max_heal_attempts = max_heal_attempts
        self._redis = redis_client
        self._gateway = gateway_client
        self._policy_client = policy_client
        self._credits_used = 0

    async def execute(
        self,
        script: PlaywrightScript,
        execution_id: str,
        tenant_id: str,
        allowed_domains: list[str],
        status_callback: Callable[[str, str | None], Awaitable[None]],
    ) -> ExecutionResult:
        """Execute the script, healing as needed."""
        self._credits_used = 0
        extracted_data: dict | None = None
        screenshots: list[str] = []

        async with self._browser_pool.session(tenant_id) as context:
            page = await context.new_page()
            try:
                await status_callback("running", None)

                heal_attempts = 0
                while True:
                    success, failed_action, failed_idx, error, data = (
                        await self._execute_script(page, script, execution_id, status_callback)
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
                        await status_callback("success", None)
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
                    await status_callback(f"healing_attempt_{heal_attempts}", None)

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
                await status_callback("failed", None)
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
        status_callback: Callable[[str, str | None], Awaitable[None]],
    ) -> tuple[bool, PlaywrightAction | None, int, Exception | None, dict | None]:
        """Execute all actions. Returns (success, failed_action, failed_idx, error, data)."""
        from app.services.browser_policy_node_client import BrowserPolicyExecutionState

        extracted_data: dict = {}
        policy_state = BrowserPolicyExecutionState(
            current_origin=self._get_origin(self._get_page_url(page))
        )
        observed_policy_events = self._get_policy_surface_event_queue(page)
        observed_policy_events.clear()
        self._attach_policy_surface_watchers(page, observed_policy_events)

        for idx, action in enumerate(script.actions):
            # Cancellation check
            if self._redis:
                cancel_val = await self._redis.get(f"automation:{execution_id}:cancel")
                if cancel_val == b"1":
                    raise CancellationRequestedError("Execution cancelled by user")

            try:
                if self._policy_client is not None:
                    await self._drain_policy_surface_events(
                        page=page,
                        policy_state=policy_state,
                        observed_events=observed_policy_events,
                        status_callback=status_callback,
                    )
                    await self._policy_client.enforce_before_action(
                        page=page,
                        action=action,
                        state=policy_state,
                        status_callback=status_callback,
                    )

                previous_url = self._get_page_url(page)
                previous_origin = (
                    self._get_origin(previous_url) or policy_state.current_origin
                )

                if action.action_type == "goto":
                    await page.goto(action.value or action.selector_css)
                elif action.action_type == "clipboard_write":
                    await page.evaluate(
                        "(value) => navigator.clipboard.writeText(value)",
                        action.value or "",
                    )
                elif action.action_type == "clipboard_read":
                    text = await page.evaluate("() => navigator.clipboard.readText()")
                    extracted_data[action.description] = (
                        text if isinstance(text, str) else str(text)
                    )
                else:
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
                    elif action.action_type == "upload":
                        await locator.set_input_files(action.value or "")
                    elif action.action_type == "hover":
                        await locator.hover()
                    elif action.action_type == "extract_data":
                        # Use only built-in locator methods (ADR-031-002)
                        text = await locator.inner_text()
                        extracted_data[action.description] = text
                    else:
                        await locator.click()  # Default to click

                if action.action_type not in {"goto", "extract_data"}:
                    policy_state.non_read_action_count += 1
                if action.action_type == "extract_data":
                    policy_state.extracted_record_count = len(extracted_data)
                if action.action_type in {"upload", "clipboard_write", "external_send"}:
                    policy_state.external_send_count += 1

                next_url = self._get_page_url(page)
                next_origin = self._get_origin(next_url)
                if (
                    self._policy_client is not None
                    and previous_url
                    and next_url
                    and previous_url != next_url
                ):
                    policy_state.origin_transition_count += 1
                    await self._policy_client.enforce_transition(
                        action=action,
                        previous_origin=previous_origin,
                        next_origin=next_origin,
                        state=policy_state,
                        status_callback=status_callback,
                    )
                if self._policy_client is not None:
                    await self._drain_policy_surface_events(
                        page=page,
                        policy_state=policy_state,
                        observed_events=observed_policy_events,
                        status_callback=status_callback,
                    )
                policy_state.current_origin = next_origin or previous_origin

            except (CancellationRequestedError, KeyboardInterrupt):
                raise
            except Exception as exc:
                return (False, action, idx, exc, extracted_data if extracted_data else None)

        return (True, None, -1, None, extracted_data if extracted_data else None)

    def _attach_policy_surface_watchers(
        self,
        page: Any,
        observed_events: list[dict[str, Any]],
    ) -> None:
        if self._policy_client is None:
            return
        page_dict = getattr(page, "__dict__", {})
        if page_dict.get("_browser_policy_watchers_attached", False):
            return

        page_on = getattr(page, "on", None)
        if not callable(page_on):
            return
        setattr(page, "_browser_policy_watchers_attached", True)

        def record_event(
            action_type: str,
            description: str,
            target_origin: str | None = None,
            cleanup: Awaitable[Any] | None = None,
        ) -> None:
            observed_events.append(
                {
                    "action_type": action_type,
                    "description": description,
                    "target_origin": target_origin,
                    "cleanup": cleanup,
                }
            )

        def handle_popup(popup_page: Any) -> None:
            record_event(
                "popup",
                "Review popup navigation before continuing browser automation",
                self._get_origin(self._get_page_url(popup_page)),
            )

        def handle_frame_navigation(frame: Any) -> None:
            if frame is getattr(page, "main_frame", None):
                return
            record_event(
                "frame_navigation",
                "Review iframe navigation before continuing browser automation",
                self._get_origin(self._get_page_url(frame)),
            )

        def handle_dialog(dialog: Any) -> None:
            action_type = "certificate_warning"
            dialog_type = getattr(dialog, "type", None)
            if callable(dialog_type):
                dialog_type = dialog_type()
            if dialog_type not in {"beforeunload", "certificate"}:
                action_type = "permission_prompt"
            dismiss_awaitable: Awaitable[Any] | None = None

            dismiss = getattr(dialog, "dismiss", None)
            if callable(dismiss):
                maybe_awaitable = dismiss()
                if inspect.isawaitable(maybe_awaitable):
                    dismiss_awaitable = maybe_awaitable

            record_event(
                action_type,
                "Browser prompt requires explicit policy approval",
                cleanup=dismiss_awaitable,
            )

        def handle_filechooser(_file_chooser: Any) -> None:
            record_event(
                "file_picker",
                "Browser file picker requires explicit policy approval",
            )

        def handle_download(_download: Any) -> None:
            download_url = getattr(_download, "url", None)
            if callable(download_url):
                try:
                    download_url = download_url()
                except TypeError:
                    download_url = None
            record_event(
                "download",
                "Browser download requires explicit policy approval",
                self._get_origin(download_url) if isinstance(download_url, str) else None,
            )

        page_on("popup", handle_popup)
        page_on("framenavigated", handle_frame_navigation)
        page_on("dialog", handle_dialog)
        page_on("filechooser", handle_filechooser)
        page_on("download", handle_download)

    @staticmethod
    def _get_policy_surface_event_queue(page: Any) -> list[dict[str, Any]]:
        page_dict = getattr(page, "__dict__", {})
        observed_events = page_dict.get("_browser_policy_observed_events")
        if isinstance(observed_events, list):
            return observed_events

        observed_events = []
        setattr(page, "_browser_policy_observed_events", observed_events)
        return observed_events

    async def _drain_policy_surface_events(
        self,
        *,
        page: Any,
        policy_state: BrowserPolicyExecutionState,
        observed_events: list[dict[str, Any]],
        status_callback: Callable[[str, str | None], Awaitable[None]],
    ) -> None:
        if self._policy_client is None:
            observed_events.clear()
            return

        while observed_events:
            event = observed_events.pop(0)
            action_type = event["action_type"] or "permission_prompt"
            target_origin = event.get("target_origin")
            cleanup = event.get("cleanup")
            if inspect.isawaitable(cleanup):
                await cleanup

            if action_type in {"popup", "frame_navigation"}:
                if not target_origin:
                    continue

                synthetic_transition = PlaywrightAction(
                    action_type=action_type,
                    selector_css=target_origin,
                    selector_strategies=[target_origin],
                    description=event["description"] or action_type,
                    confidence=1.0,
                    value=target_origin,
                )
                policy_state.origin_transition_count += 1
                await self._policy_client.enforce_transition(
                    action=synthetic_transition,
                    previous_origin=policy_state.current_origin,
                    next_origin=target_origin,
                    state=policy_state,
                    status_callback=status_callback,
                )
                continue

            synthetic_action = PlaywrightAction(
                action_type=action_type,
                selector_css=action_type,
                selector_strategies=[action_type],
                description=event["description"] or action_type,
                confidence=1.0,
                target_origin=target_origin,
            )
            await self._policy_client.enforce_before_action(
                page=page,
                action=synthetic_action,
                state=policy_state,
                status_callback=status_callback,
            )
            if action_type == "download":
                policy_state.external_send_count += 1

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

    @staticmethod
    def _get_page_url(page: Any) -> str | None:
        value = getattr(page, "url", None)
        return value if isinstance(value, str) else None

    @staticmethod
    def _get_origin(url: str | None) -> str | None:
        if not url:
            return None
        try:
            from urllib.parse import urlparse

            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return None
            return f"{parsed.scheme}://{parsed.netloc}"
        except ValueError:
            return None
