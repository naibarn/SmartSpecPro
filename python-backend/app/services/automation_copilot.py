"""AutomationCopilot orchestrator — routes user intent to appropriate executor."""

from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from pydantic import BaseModel

from app.services.llm_gateway_client import GatewayUnavailableError

if TYPE_CHECKING:
    from app.services.llm_gateway_client import LLMGatewayClient
    from app.services.playwright_script_generator import PlaywrightScript, PlaywrightScriptGenerator
    from app.services.self_healing_executor import ExecutionResult, SelfHealingExecutor

logger = logging.getLogger(__name__)

_INTENT_ANALYSIS_SYSTEM_PROMPT = """\
You are an automation intent analyzer. Given a user's request, determine the type of automation needed.

Return a JSON object with these fields:
- intent_type: one of "browser_rpa", "workflow", "agency", "hybrid"
- confidence: float 0.0-1.0, how confident you are in the classification
- is_ready: boolean, true if the request is clear enough to proceed
- browser_tasks: array of {url, goal} objects (for browser_rpa type)
- clarification_questions: array of strings if you need more info
- plan_summary: brief description of what will be automated

Return ONLY valid JSON, no markdown fences or extra text."""


class AutomationIntent(BaseModel):
    """Parsed user intent from LLM analysis."""

    intent_type: str  # browser_rpa, workflow, agency, hybrid
    confidence: float
    is_ready: bool = False
    ambiguities: list[str] | None = None
    browser_tasks: list[dict] | None = None
    plan_summary: str | None = None


class AutomationBuildResult(BaseModel):
    """Result of analyze or build operation."""

    status: str  # needs_clarification, preview_ready, ready, executing, success, failed
    intent: AutomationIntent | None = None
    plan_summary: str | None = None
    questions: list[str] | None = None
    error: str | None = None
    scripts: list[dict] | None = None


class AutomationCopilot:
    """Routes automation requests based on intent type."""

    def __init__(
        self,
        script_generator: PlaywrightScriptGenerator,
        executor: SelfHealingExecutor,
        gateway_client: LLMGatewayClient | None = None,
    ) -> None:
        self._generator = script_generator
        self._executor = executor
        self._gateway = gateway_client
        self._scripts: dict[str, list[Any]] = {}  # execution_id -> list of scripts

    async def analyze(
        self, prompt: str, tenant_id: str, user_id: int
    ) -> AutomationBuildResult:
        """Parse user prompt into AutomationIntent via LLM."""
        intent = await self._analyze_intent(prompt, tenant_id, user_id)

        if not intent.is_ready:
            return AutomationBuildResult(
                status="needs_clarification",
                intent=intent,
                questions=intent.ambiguities or ["Could you be more specific?"],
            )

        return AutomationBuildResult(
            status="preview_ready",
            intent=intent,
            plan_summary=intent.plan_summary or f"Execute {intent.intent_type} automation",
        )

    async def build(
        self,
        intent: AutomationIntent,
        execution_id: str,
        tenant_id: str,
        user_id: int,
        vision_model: str,
        allowed_domains: list[str],
    ) -> AutomationBuildResult:
        """Generate scripts for all tasks in the intent."""
        if intent.intent_type == "browser_rpa":
            scripts = []
            for task in intent.browser_tasks or []:
                script = await self._generator.generate(
                    url=task.get("url", ""),
                    goal=task.get("goal", ""),
                    tenant_id=tenant_id,
                    allowed_domains=allowed_domains,
                    vision_model=vision_model,
                )
                scripts.append(script)
            self._scripts[execution_id] = scripts
        elif intent.intent_type == "workflow":
            self._scripts[execution_id] = [self._build_workflow(intent)]
        elif intent.intent_type == "agency":
            self._scripts[execution_id] = [self._build_agency(intent)]
        else:
            self._scripts[execution_id] = []

        return AutomationBuildResult(
            status="ready",
            intent=intent,
        )

    async def execute_scripts(
        self,
        execution_id: str,
        tenant_id: str,
        user_id: int,
        allowed_domains: list[str],
        status_callback: Callable[[str], Awaitable[None]],
    ) -> Any:
        """Run all generated scripts via SelfHealingExecutor."""
        scripts = self._scripts.get(execution_id, [])
        results = []
        for script in scripts:
            result = await self._executor.execute(
                script=script,
                execution_id=execution_id,
                tenant_id=tenant_id,
                allowed_domains=allowed_domains,
                status_callback=status_callback,
            )
            results.append(result)
        return results[0] if results else None

    async def _analyze_intent(
        self, prompt: str, tenant_id: str, user_id: int
    ) -> AutomationIntent:
        """LLM-based intent analysis. Override in tests."""
        if self._gateway is None:
            raise NotImplementedError("No gateway client configured")

        if os.environ.get("AUTOMATION_LLM_ENABLED") == "false":
            raise NotImplementedError("LLM calls disabled via AUTOMATION_LLM_ENABLED=false")

        try:
            result = await self._gateway.chat_completion(
                messages=[
                    {"role": "system", "content": _INTENT_ANALYSIS_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                model="gpt-4.1",
                user_id=user_id,
                tenant_id=tenant_id,
                response_format={"type": "json_object"},
            )

            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            parsed = json.loads(content)

            intent = AutomationIntent(
                intent_type=parsed.get("intent_type", "unknown"),
                confidence=float(parsed.get("confidence", 0.0)),
                is_ready=parsed.get("is_ready", False),
                browser_tasks=parsed.get("browser_tasks"),
                plan_summary=parsed.get("plan_summary"),
                ambiguities=parsed.get("clarification_questions"),
            )

            if intent.confidence < 0.5:
                intent.is_ready = False
                if not intent.ambiguities:
                    intent.ambiguities = ["Could you describe what you'd like to automate?"]

            return intent

        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            logger.warning("Failed to parse LLM intent response: %s", exc)
            return AutomationIntent(
                intent_type="unknown",
                confidence=0.0,
                is_ready=False,
                ambiguities=["Could you describe what you'd like to automate?"],
            )
        except GatewayUnavailableError:
            logger.warning("LLM gateway unavailable for intent analysis")
            return AutomationIntent(
                intent_type="unknown",
                confidence=0.0,
                is_ready=False,
                ambiguities=["The AI service is temporarily unavailable. Please try again."],
            )
        except Exception as exc:
            logger.error("Unexpected error in intent analysis: %s", exc)
            return AutomationIntent(
                intent_type="unknown",
                confidence=0.0,
                is_ready=False,
                ambiguities=["Could you describe what you'd like to automate?"],
            )

    def _build_workflow(self, intent: AutomationIntent) -> dict:
        """Thin wrapper: construct workflow definition from intent."""
        return {"type": "workflow", "intent": intent.model_dump()}

    def _build_agency(self, intent: AutomationIntent) -> dict:
        """Thin wrapper: construct agency definition from intent."""
        return {"type": "agency", "intent": intent.model_dump()}
