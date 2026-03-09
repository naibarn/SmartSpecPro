diff --git a/python-backend/app/orchestrator/node_executors/web_automation_executor.py b/python-backend/app/orchestrator/node_executors/web_automation_executor.py
index a3d1776..f4a98c8 100644
--- a/python-backend/app/orchestrator/node_executors/web_automation_executor.py
+++ b/python-backend/app/orchestrator/node_executors/web_automation_executor.py
@@ -8,6 +8,13 @@ from __future__ import annotations
 
 import structlog
 
+from app.services.automation_exceptions import AutomationError
+from app.services.llm_gateway_client import (
+    GatewayUnavailableError,
+    InsufficientCreditsError,
+    LLMGatewayClient,
+)
+
 logger = structlog.get_logger(__name__)
 
 
@@ -26,17 +33,85 @@ class WebAutomationExecutor:
             context: Workflow execution context with tenant_id, user_id, etc.
 
         Returns:
-            Dict with key 'extracted_data' containing the automation result.
-
-        Raises:
-            NotImplementedError: Until full pipeline integration is complete.
+            Dict with status and extracted_data or error message.
         """
+        from app.services.automation_copilot import AutomationCopilot
+        from app.services.browser_pool import BrowserPool
+        from app.services.playwright_script_generator import PlaywrightScriptGenerator
+        from app.services.selector_cache import SelectorCache
+        from app.services.self_healing_executor import SelfHealingExecutor
+
+        prompt = inputs.get("prompt", "")
+        tenant_id = context.get("tenant_id", "default")
+        user_id = context.get("user_id", 0)
+        execution_id = context.get("execution_id", "unknown")
+        vision_model = inputs.get("vision_model", "gpt-4o")
+        allowed_domains = context.get("allowed_domains", [])
+
         logger.info(
             "web_automation_executor_called",
-            prompt=inputs.get("prompt", "")[:100],
+            prompt=prompt[:100],
             url=inputs.get("url"),
-            tenant_id=context.get("tenant_id"),
-        )
-        raise NotImplementedError(
-            "WebAutomationExecutor pending full pipeline implementation"
+            tenant_id=tenant_id,
         )
+
+        try:
+            gateway_client = LLMGatewayClient()
+            browser_pool = BrowserPool()
+            selector_cache = SelectorCache()
+
+            script_generator = PlaywrightScriptGenerator(
+                browser_pool, selector_cache, gateway_client=gateway_client
+            )
+            executor = SelfHealingExecutor(
+                browser_pool, selector_cache,
+                vision_model=vision_model,
+                gateway_client=gateway_client,
+            )
+            copilot = AutomationCopilot(
+                script_generator, executor, gateway_client=gateway_client
+            )
+
+            # Step 1: Analyze intent
+            analysis = await copilot.analyze(prompt, tenant_id, user_id)
+
+            if analysis.status == "needs_clarification":
+                return {
+                    "status": "needs_input",
+                    "questions": analysis.questions or [],
+                }
+
+            # Step 2: Build scripts
+            await copilot.build(
+                analysis.intent,
+                execution_id, tenant_id, user_id,
+                vision_model, allowed_domains,
+            )
+
+            # Step 3: Execute scripts
+            async def status_callback(status: str) -> None:
+                logger.info("automation_status", execution_id=execution_id, status=status)
+
+            result = await copilot.execute_scripts(
+                execution_id, tenant_id, user_id,
+                allowed_domains, status_callback,
+            )
+
+            return {
+                "status": "success",
+                "extracted_data": result.extracted_data if result else None,
+                "screenshots": result.screenshots if result else [],
+            }
+
+        except GatewayUnavailableError as exc:
+            logger.error("gateway_unavailable", error=str(exc))
+            return {"status": "error", "message": "LLM gateway unavailable"}
+        except InsufficientCreditsError as exc:
+            logger.error("insufficient_credits", error=str(exc))
+            return {"status": "error", "message": "Insufficient credits"}
+        except AutomationError as exc:
+            logger.error("automation_error", error=str(exc))
+            return {"status": "error", "message": str(exc)}
+        except Exception as exc:
+            logger.error("unexpected_error", error=str(exc), exc_info=True)
+            return {"status": "error", "message": f"Unexpected error: {exc}"}
diff --git a/python-backend/app/services/automation_copilot.py b/python-backend/app/services/automation_copilot.py
index b398e55..e08c89a 100644
--- a/python-backend/app/services/automation_copilot.py
+++ b/python-backend/app/services/automation_copilot.py
@@ -2,17 +2,33 @@
 
 from __future__ import annotations
 
+import json
 import logging
+import os
 from typing import TYPE_CHECKING, Any, Awaitable, Callable
 
 from pydantic import BaseModel
 
 if TYPE_CHECKING:
+    from app.services.llm_gateway_client import LLMGatewayClient
     from app.services.playwright_script_generator import PlaywrightScript, PlaywrightScriptGenerator
     from app.services.self_healing_executor import ExecutionResult, SelfHealingExecutor
 
 logger = logging.getLogger(__name__)
 
+_INTENT_ANALYSIS_SYSTEM_PROMPT = """\
+You are an automation intent analyzer. Given a user's request, determine the type of automation needed.
+
+Return a JSON object with these fields:
+- intent_type: one of "browser_rpa", "workflow", "agency", "hybrid"
+- confidence: float 0.0-1.0, how confident you are in the classification
+- is_ready: boolean, true if the request is clear enough to proceed
+- browser_tasks: array of {url, goal} objects (for browser_rpa type)
+- clarification_questions: array of strings if you need more info
+- plan_summary: brief description of what will be automated
+
+Return ONLY valid JSON, no markdown fences or extra text."""
+
 
 class AutomationIntent(BaseModel):
     """Parsed user intent from LLM analysis."""
@@ -43,9 +59,11 @@ class AutomationCopilot:
         self,
         script_generator: PlaywrightScriptGenerator,
         executor: SelfHealingExecutor,
+        gateway_client: LLMGatewayClient | None = None,
     ) -> None:
         self._generator = script_generator
         self._executor = executor
+        self._gateway = gateway_client
         self._scripts: dict[str, list[Any]] = {}  # execution_id -> list of scripts
 
     async def analyze(
@@ -127,7 +145,69 @@ class AutomationCopilot:
         self, prompt: str, tenant_id: str, user_id: int
     ) -> AutomationIntent:
         """LLM-based intent analysis. Override in tests."""
-        raise NotImplementedError("Production calls the LLM gateway")
+        if self._gateway is None:
+            raise NotImplementedError("No gateway client configured")
+
+        if os.environ.get("AUTOMATION_LLM_ENABLED") == "false":
+            raise NotImplementedError("LLM calls disabled via AUTOMATION_LLM_ENABLED=false")
+
+        try:
+            from app.services.llm_gateway_client import GatewayUnavailableError
+
+            result = await self._gateway.chat_completion(
+                messages=[
+                    {"role": "system", "content": _INTENT_ANALYSIS_SYSTEM_PROMPT},
+                    {"role": "user", "content": prompt},
+                ],
+                model="gpt-4.1",
+                user_id=user_id,
+                tenant_id=tenant_id,
+                response_format={"type": "json_object"},
+            )
+
+            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
+            parsed = json.loads(content)
+
+            intent = AutomationIntent(
+                intent_type=parsed.get("intent_type", "unknown"),
+                confidence=float(parsed.get("confidence", 0.0)),
+                is_ready=parsed.get("is_ready", False),
+                browser_tasks=parsed.get("browser_tasks"),
+                plan_summary=parsed.get("plan_summary"),
+                ambiguities=parsed.get("clarification_questions"),
+            )
+
+            if intent.confidence < 0.5:
+                intent.is_ready = False
+                if not intent.ambiguities:
+                    intent.ambiguities = ["Could you describe what you'd like to automate?"]
+
+            return intent
+
+        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
+            logger.warning("Failed to parse LLM intent response: %s", exc)
+            return AutomationIntent(
+                intent_type="unknown",
+                confidence=0.0,
+                is_ready=False,
+                ambiguities=["Could you describe what you'd like to automate?"],
+            )
+        except GatewayUnavailableError:
+            logger.warning("LLM gateway unavailable for intent analysis")
+            return AutomationIntent(
+                intent_type="unknown",
+                confidence=0.0,
+                is_ready=False,
+                ambiguities=["The AI service is temporarily unavailable. Please try again."],
+            )
+        except Exception as exc:
+            logger.error("Unexpected error in intent analysis: %s", exc)
+            return AutomationIntent(
+                intent_type="unknown",
+                confidence=0.0,
+                is_ready=False,
+                ambiguities=["Could you describe what you'd like to automate?"],
+            )
 
     def _build_workflow(self, intent: AutomationIntent) -> dict:
         """Thin wrapper: construct workflow definition from intent."""
diff --git a/python-backend/app/services/playwright_script_generator.py b/python-backend/app/services/playwright_script_generator.py
index 22b5214..4714e95 100644
--- a/python-backend/app/services/playwright_script_generator.py
+++ b/python-backend/app/services/playwright_script_generator.py
@@ -3,7 +3,9 @@
 from __future__ import annotations
 
 import base64
+import json
 import logging
+import os
 from typing import TYPE_CHECKING, Any
 
 from pydantic import BaseModel
@@ -15,10 +17,26 @@ if TYPE_CHECKING:
     from playwright.async_api import BrowserContext, Page
 
     from app.services.browser_pool import BrowserPool
+    from app.services.llm_gateway_client import LLMGatewayClient
     from app.services.selector_cache import SelectorCache
 
 logger = logging.getLogger(__name__)
 
+_VISION_SYSTEM_PROMPT = """\
+You are a web page element identifier for browser automation.
+
+Given a screenshot of a web page with numbered overlays and a goal, identify the elements \
+that need to be interacted with to accomplish the goal.
+
+Return a JSON array of objects with these fields:
+- element_index: int, the overlay number on the screenshot
+- action_type: one of "click", "fill", "select", "extract_data", "hover", "scroll"
+- value: string or null, the value to fill/select (null for click/hover)
+- confidence: float 0.0-1.0
+- reasoning: brief explanation of why this element and action
+
+Return ONLY valid JSON array, no markdown fences or extra text."""
+
 # Numbered overlay injection script (system-authored, NEVER parameterized with user input)
 _OVERLAY_INJECTION_JS = """
 (() => {
@@ -85,9 +103,11 @@ class PlaywrightScriptGenerator:
         self,
         browser_pool: BrowserPool,
         selector_cache: SelectorCache,
+        gateway_client: LLMGatewayClient | None = None,
     ) -> None:
         self._browser_pool = browser_pool
         self._cache = selector_cache
+        self._gateway = gateway_client
 
     async def generate(
         self,
@@ -240,11 +260,27 @@ class PlaywrightScriptGenerator:
         Override this method in tests. In production, this calls
         the LLM gateway with a vision-capable model.
         """
-        raise NotImplementedError(
-            "Production implementation calls the LLM gateway. "
-            "This method should be overridden in tests."
+        if self._gateway is None:
+            raise NotImplementedError("No gateway client configured")
+
+        if os.environ.get("AUTOMATION_LLM_ENABLED") == "false":
+            raise NotImplementedError("LLM calls disabled via AUTOMATION_LLM_ENABLED=false")
+
+        prompt = f"Goal: {goal}\n\nElement references: {json.dumps(element_refs)}"
+        result = await self._gateway.vision_call(
+            prompt=prompt,
+            screenshot_b64=screenshot_b64,
+            model=vision_model,
         )
 
+        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
+        parsed = json.loads(content)
+
+        if not isinstance(parsed, list):
+            parsed = [parsed]
+
+        return [IdentifiedElement(**item) for item in parsed]
+
     def _build_selector_strategy(self, element_info: dict) -> list[str]:
         """Convert element info to multi-strategy selector list.
 
diff --git a/python-backend/app/services/self_healing_executor.py b/python-backend/app/services/self_healing_executor.py
index 205e751..5abc761 100644
--- a/python-backend/app/services/self_healing_executor.py
+++ b/python-backend/app/services/self_healing_executor.py
@@ -3,7 +3,9 @@
 from __future__ import annotations
 
 import base64
+import json
 import logging
+import os
 from typing import TYPE_CHECKING, Any, Awaitable, Callable
 
 from pydantic import BaseModel
@@ -20,10 +22,28 @@ if TYPE_CHECKING:
     from playwright.async_api import Page
 
     from app.services.browser_pool import BrowserPool
+    from app.services.llm_gateway_client import LLMGatewayClient
     from app.services.selector_cache import SelectorCache
 
 logger = logging.getLogger(__name__)
 
+_DIAGNOSIS_SYSTEM_PROMPT = """\
+You are a browser automation failure diagnostician.
+
+Given a screenshot of the current page state, the failed action details, and the error message, \
+diagnose why the action failed and suggest a fix.
+
+Return a JSON object with:
+- root_cause: string explaining what went wrong
+- suggested_new_selector: object with "css" key containing a CSS/ARIA/data-testid selector, or null
+- confidence: float 0.0-1.0 in your diagnosis
+- action_type_still_valid: boolean, whether the same action type should be used
+
+Do NOT suggest JavaScript evaluate or page.evaluate selectors. Only suggest CSS selectors, \
+ARIA selectors, or data-testid selectors.
+
+Return ONLY valid JSON, no markdown fences or extra text."""
+
 
 class FailureDiagnosis(BaseModel):
     """Result of Vision LLM analysis of a failed action."""
@@ -55,12 +75,14 @@ class SelfHealingExecutor:
         vision_model: str = "gpt-4o",
         max_heal_attempts: int = 3,
         redis_client: aioredis.Redis | None = None,
+        gateway_client: LLMGatewayClient | None = None,
     ) -> None:
         self._browser_pool = browser_pool
         self._cache = selector_cache
         self._vision_model = vision_model
         self._max_heal_attempts = max_heal_attempts
         self._redis = redis_client
+        self._gateway = gateway_client
         self._credits_used = 0
 
     async def execute(
@@ -192,14 +214,56 @@ class SelfHealingExecutor:
         screenshot_bytes = await page.screenshot(type="png")
         screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
 
-        # In production, this would call the LLM gateway
-        # For now, return a basic diagnosis
-        return FailureDiagnosis(
-            root_cause=f"Selector '{failed_action.selector_css}' failed: {error}",
-            suggested_new_selector=None,
-            confidence=0.0,
-            action_type_still_valid=False,
-        )
+        if self._gateway is None or os.environ.get("AUTOMATION_LLM_ENABLED") == "false":
+            return FailureDiagnosis(
+                root_cause=f"Selector '{failed_action.selector_css}' failed: {error}",
+                suggested_new_selector=None,
+                confidence=0.0,
+                action_type_still_valid=False,
+            )
+
+        try:
+            from app.services.llm_gateway_client import GatewayUnavailableError
+
+            prompt = (
+                f"Failed action: {failed_action.action_type} on selector "
+                f"'{failed_action.selector_css}'\n"
+                f"Description: {failed_action.description}\n"
+                f"Error: {str(error)}"
+            )
+
+            result = await self._gateway.vision_call(
+                prompt=prompt,
+                screenshot_b64=screenshot_b64,
+                model=self._vision_model,
+            )
+
+            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
+            parsed = json.loads(content)
+
+            return FailureDiagnosis(
+                root_cause=parsed.get("root_cause", "Unknown"),
+                suggested_new_selector=parsed.get("suggested_new_selector"),
+                confidence=float(parsed.get("confidence", 0.0)),
+                action_type_still_valid=parsed.get("action_type_still_valid", False),
+            )
+
+        except GatewayUnavailableError:
+            logger.warning("LLM gateway unavailable for failure diagnosis")
+            return FailureDiagnosis(
+                root_cause="LLM unavailable",
+                suggested_new_selector=None,
+                confidence=0.0,
+                action_type_still_valid=False,
+            )
+        except (json.JSONDecodeError, KeyError, TypeError) as exc:
+            logger.warning("Failed to parse diagnosis response: %s", exc)
+            return FailureDiagnosis(
+                root_cause=f"Parse error: {exc}",
+                suggested_new_selector=None,
+                confidence=0.0,
+                action_type_still_valid=False,
+            )
 
     async def regenerate_from_failure(
         self,
diff --git a/python-backend/tests/test_automation_copilot_llm.py b/python-backend/tests/test_automation_copilot_llm.py
new file mode 100644
index 0000000..867ed59
--- /dev/null
+++ b/python-backend/tests/test_automation_copilot_llm.py
@@ -0,0 +1,100 @@
+"""Tests for _analyze_intent() LLM integration in AutomationCopilot."""
+
+import json
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.services.automation_copilot import AutomationCopilot, AutomationIntent
+
+
+def _make_gateway_response(content: str) -> dict:
+    """Build a chat_completion-style response dict."""
+    return {"choices": [{"message": {"content": content}}]}
+
+
+def _make_copilot(gateway_mock: AsyncMock) -> AutomationCopilot:
+    """Create copilot with mocked dependencies."""
+    gen = MagicMock()
+    exe = MagicMock()
+    return AutomationCopilot(gen, exe, gateway_client=gateway_mock)
+
+
+class TestAnalyzeIntentLLM:
+    @pytest.mark.asyncio
+    async def test_valid_json_parsed_into_intent(self):
+        gateway = AsyncMock()
+        gateway.chat_completion = AsyncMock(return_value=_make_gateway_response(
+            json.dumps({
+                "intent_type": "browser_rpa",
+                "confidence": 0.9,
+                "is_ready": True,
+                "browser_tasks": [{"url": "https://example.com", "goal": "Click login"}],
+                "plan_summary": "Automate login flow",
+            })
+        ))
+        copilot = _make_copilot(gateway)
+        result = await copilot.analyze("Log into example.com", "tenant1", 1)
+
+        assert result.status == "preview_ready"
+        assert result.intent.intent_type == "browser_rpa"
+        assert result.intent.confidence == 0.9
+
+    @pytest.mark.asyncio
+    async def test_invalid_json_returns_needs_clarification(self):
+        gateway = AsyncMock()
+        gateway.chat_completion = AsyncMock(return_value=_make_gateway_response(
+            "This is not valid JSON at all!"
+        ))
+        copilot = _make_copilot(gateway)
+        result = await copilot.analyze("Do something", "tenant1", 1)
+
+        assert result.status == "needs_clarification"
+        assert result.questions is not None
+        assert len(result.questions) > 0
+
+    @pytest.mark.asyncio
+    async def test_low_confidence_returns_needs_clarification(self):
+        gateway = AsyncMock()
+        gateway.chat_completion = AsyncMock(return_value=_make_gateway_response(
+            json.dumps({
+                "intent_type": "browser_rpa",
+                "confidence": 0.3,
+                "is_ready": False,
+                "clarification_questions": ["What URL?", "What data?"],
+            })
+        ))
+        copilot = _make_copilot(gateway)
+        result = await copilot.analyze("Do something", "tenant1", 1)
+
+        assert result.status == "needs_clarification"
+        assert "What URL?" in result.questions
+
+    @pytest.mark.asyncio
+    async def test_gateway_unavailable_graceful_degradation(self):
+        from app.services.llm_gateway_client import GatewayUnavailableError
+
+        gateway = AsyncMock()
+        gateway.chat_completion = AsyncMock(side_effect=GatewayUnavailableError("down"))
+        copilot = _make_copilot(gateway)
+        result = await copilot.analyze("Do something", "tenant1", 1)
+
+        assert result.status == "needs_clarification"
+        assert result.questions is not None
+
+    @pytest.mark.asyncio
+    async def test_response_format_set_to_json_object(self):
+        gateway = AsyncMock()
+        gateway.chat_completion = AsyncMock(return_value=_make_gateway_response(
+            json.dumps({
+                "intent_type": "browser_rpa",
+                "confidence": 0.9,
+                "is_ready": True,
+                "browser_tasks": [],
+            })
+        ))
+        copilot = _make_copilot(gateway)
+        await copilot.analyze("Test", "tenant1", 1)
+
+        call_kwargs = gateway.chat_completion.call_args
+        assert call_kwargs.kwargs.get("response_format") == {"type": "json_object"}
diff --git a/python-backend/tests/test_playwright_script_generator_llm.py b/python-backend/tests/test_playwright_script_generator_llm.py
new file mode 100644
index 0000000..ef9be5d
--- /dev/null
+++ b/python-backend/tests/test_playwright_script_generator_llm.py
@@ -0,0 +1,112 @@
+"""Tests for _vision_llm_call() LLM integration in PlaywrightScriptGenerator."""
+
+import json
+from unittest.mock import AsyncMock, MagicMock
+
+import pytest
+
+from app.services.playwright_script_generator import (
+    CONFIDENCE_THRESHOLD,
+    IdentifiedElement,
+    PlaywrightScriptGenerator,
+)
+
+
+def _make_vision_response(content: str) -> dict:
+    return {"choices": [{"message": {"content": content}}]}
+
+
+def _make_generator(gateway_mock: AsyncMock) -> PlaywrightScriptGenerator:
+    pool = MagicMock()
+    cache = MagicMock()
+    return PlaywrightScriptGenerator(pool, cache, gateway_client=gateway_mock)
+
+
+class TestVisionLLMCall:
+    @pytest.mark.asyncio
+    async def test_screenshot_and_goal_sent_to_gateway(self):
+        gateway = AsyncMock()
+        gateway.vision_call = AsyncMock(return_value=_make_vision_response(
+            json.dumps([
+                {"element_index": 1, "action_type": "click", "value": None,
+                 "confidence": 0.9, "reasoning": "Login button"},
+            ])
+        ))
+        gen = _make_generator(gateway)
+
+        result = await gen._vision_llm_call(
+            screenshot_b64="base64data",
+            goal="Click login",
+            vision_model="gpt-4o",
+            element_refs=[{"index": 1, "tag": "button", "text": "Login"}],
+        )
+
+        gateway.vision_call.assert_called_once()
+        call_kwargs = gateway.vision_call.call_args
+        assert "base64data" in str(call_kwargs)
+        assert "Click login" in str(call_kwargs)
+        assert len(result) == 1
+        assert result[0].element_index == 1
+
+    @pytest.mark.asyncio
+    async def test_vision_model_passed_through(self):
+        gateway = AsyncMock()
+        gateway.vision_call = AsyncMock(return_value=_make_vision_response(
+            json.dumps([
+                {"element_index": 1, "action_type": "click", "value": None,
+                 "confidence": 0.9, "reasoning": "button"},
+            ])
+        ))
+        gen = _make_generator(gateway)
+
+        await gen._vision_llm_call(
+            screenshot_b64="img",
+            goal="test",
+            vision_model="gpt-4o-mini",
+            element_refs=[],
+        )
+
+        call_kwargs = gateway.vision_call.call_args
+        assert call_kwargs.kwargs.get("model") == "gpt-4o-mini" or call_kwargs.args[2] == "gpt-4o-mini"
+
+    @pytest.mark.asyncio
+    async def test_returns_all_elements_unfiltered(self):
+        """_vision_llm_call returns raw results; filtering happens in generate()."""
+        gateway = AsyncMock()
+        gateway.vision_call = AsyncMock(return_value=_make_vision_response(
+            json.dumps([
+                {"element_index": 1, "action_type": "click", "value": None,
+                 "confidence": 0.9, "reasoning": "high"},
+                {"element_index": 2, "action_type": "click", "value": None,
+                 "confidence": 0.7, "reasoning": "medium"},
+                {"element_index": 3, "action_type": "click", "value": None,
+                 "confidence": 0.5, "reasoning": "low"},
+            ])
+        ))
+        gen = _make_generator(gateway)
+
+        result = await gen._vision_llm_call("img", "test", "gpt-4o", [])
+
+        assert len(result) == 3
+        high_conf = [e for e in result if e.confidence >= CONFIDENCE_THRESHOLD]
+        assert len(high_conf) == 2
+
+    @pytest.mark.asyncio
+    async def test_gateway_unavailable_raises(self):
+        from app.services.llm_gateway_client import GatewayUnavailableError
+
+        gateway = AsyncMock()
+        gateway.vision_call = AsyncMock(side_effect=GatewayUnavailableError("down"))
+        gen = _make_generator(gateway)
+
+        with pytest.raises(GatewayUnavailableError):
+            await gen._vision_llm_call("img", "test", "gpt-4o", [])
+
+    @pytest.mark.asyncio
+    async def test_no_gateway_raises_not_implemented(self):
+        pool = MagicMock()
+        cache = MagicMock()
+        gen = PlaywrightScriptGenerator(pool, cache)
+
+        with pytest.raises(NotImplementedError):
+            await gen._vision_llm_call("img", "test", "gpt-4o", [])
diff --git a/python-backend/tests/test_self_healing_executor_llm.py b/python-backend/tests/test_self_healing_executor_llm.py
new file mode 100644
index 0000000..4626ee9
--- /dev/null
+++ b/python-backend/tests/test_self_healing_executor_llm.py
@@ -0,0 +1,126 @@
+"""Tests for _diagnose_failure() LLM integration in SelfHealingExecutor."""
+
+import json
+from unittest.mock import AsyncMock, MagicMock
+
+import pytest
+
+from app.services.playwright_script_generator import PlaywrightAction
+from app.services.self_healing_executor import FailureDiagnosis, SelfHealingExecutor
+
+
+def _make_vision_response(content: str) -> dict:
+    return {"choices": [{"message": {"content": content}}]}
+
+
+def _make_executor(gateway_mock: AsyncMock) -> SelfHealingExecutor:
+    pool = MagicMock()
+    cache = MagicMock()
+    return SelfHealingExecutor(
+        pool, cache, vision_model="gpt-4o", gateway_client=gateway_mock
+    )
+
+
+def _make_failed_action() -> PlaywrightAction:
+    return PlaywrightAction(
+        action_type="click",
+        selector_css="#login-btn",
+        selector_strategies=["#login-btn"],
+        description="Click login button",
+        confidence=0.9,
+    )
+
+
+def _make_mock_page() -> AsyncMock:
+    page = AsyncMock()
+    page.screenshot = AsyncMock(return_value=b"\x89PNG\x00\x00\x00")
+    return page
+
+
+class TestDiagnoseFailure:
+    @pytest.mark.asyncio
+    async def test_screenshot_and_error_sent_to_vision(self):
+        gateway = AsyncMock()
+        gateway.vision_call = AsyncMock(return_value=_make_vision_response(
+            json.dumps({
+                "root_cause": "Button moved to new location",
+                "suggested_new_selector": {"css": "#new-login-btn"},
+                "confidence": 0.8,
+                "action_type_still_valid": True,
+            })
+        ))
+        executor = _make_executor(gateway)
+        page = _make_mock_page()
+        action = _make_failed_action()
+
+        result = await executor._diagnose_failure(page, action, Exception("Not found"))
+
+        gateway.vision_call.assert_called_once()
+        call_kwargs = gateway.vision_call.call_args
+        assert "Not found" in str(call_kwargs)
+
+    @pytest.mark.asyncio
+    async def test_valid_diagnosis_returned(self):
+        gateway = AsyncMock()
+        gateway.vision_call = AsyncMock(return_value=_make_vision_response(
+            json.dumps({
+                "root_cause": "Button moved",
+                "suggested_new_selector": {"css": "[data-testid='login']"},
+                "confidence": 0.8,
+                "action_type_still_valid": True,
+            })
+        ))
+        executor = _make_executor(gateway)
+        page = _make_mock_page()
+
+        result = await executor._diagnose_failure(page, _make_failed_action(), Exception("err"))
+
+        assert result.confidence > 0.0
+        assert result.root_cause == "Button moved"
+        assert result.suggested_new_selector == {"css": "[data-testid='login']"}
+
+    @pytest.mark.asyncio
+    async def test_suggested_selector_is_css_not_js(self):
+        gateway = AsyncMock()
+        gateway.vision_call = AsyncMock(return_value=_make_vision_response(
+            json.dumps({
+                "root_cause": "Button moved",
+                "suggested_new_selector": {"css": ".new-btn"},
+                "confidence": 0.8,
+                "action_type_still_valid": True,
+            })
+        ))
+        executor = _make_executor(gateway)
+        page = _make_mock_page()
+
+        result = await executor._diagnose_failure(page, _make_failed_action(), Exception("err"))
+
+        selector_str = json.dumps(result.suggested_new_selector)
+        assert "evaluate" not in selector_str
+        assert "page.evaluate" not in selector_str
+
+    @pytest.mark.asyncio
+    async def test_gateway_unavailable_returns_zero_confidence(self):
+        from app.services.llm_gateway_client import GatewayUnavailableError
+
+        gateway = AsyncMock()
+        gateway.vision_call = AsyncMock(side_effect=GatewayUnavailableError("down"))
+        executor = _make_executor(gateway)
+        page = _make_mock_page()
+
+        result = await executor._diagnose_failure(page, _make_failed_action(), Exception("err"))
+
+        assert result.confidence == 0.0
+        assert result.suggested_new_selector is None
+
+    @pytest.mark.asyncio
+    async def test_no_gateway_returns_stub_diagnosis(self):
+        pool = MagicMock()
+        cache = MagicMock()
+        executor = SelfHealingExecutor(pool, cache, vision_model="gpt-4o")
+        page = _make_mock_page()
+
+        result = await executor._diagnose_failure(page, _make_failed_action(), Exception("err"))
+
+        assert result.confidence == 0.0
+        assert result.action_type_still_valid is False
diff --git a/python-backend/tests/test_web_automation_executor_impl.py b/python-backend/tests/test_web_automation_executor_impl.py
new file mode 100644
index 0000000..933a0f6
--- /dev/null
+++ b/python-backend/tests/test_web_automation_executor_impl.py
@@ -0,0 +1,145 @@
+"""Tests for WebAutomationExecutor.execute() full pipeline."""
+
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.orchestrator.node_executors.web_automation_executor import WebAutomationExecutor
+
+
+def _patch_executor_deps():
+    """Patch all dependencies used inside execute() via local imports."""
+    return [
+        patch("app.services.automation_copilot.AutomationCopilot"),
+        patch("app.services.playwright_script_generator.PlaywrightScriptGenerator"),
+        patch("app.services.self_healing_executor.SelfHealingExecutor"),
+        patch("app.services.browser_pool.BrowserPool"),
+        patch("app.services.selector_cache.SelectorCache"),
+        patch(
+            "app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"
+        ),
+    ]
+
+
+class TestWebAutomationExecutorPipeline:
+    @pytest.mark.asyncio
+    async def test_full_pipeline_success(self):
+        from app.services.automation_copilot import AutomationBuildResult, AutomationIntent
+        from app.services.self_healing_executor import ExecutionResult
+
+        intent = AutomationIntent(
+            intent_type="browser_rpa", confidence=0.9, is_ready=True,
+            browser_tasks=[{"url": "https://example.com", "goal": "extract data"}],
+        )
+
+        mock_copilot = MagicMock()
+        mock_copilot.analyze = AsyncMock(return_value=AutomationBuildResult(
+            status="preview_ready", intent=intent,
+        ))
+        mock_copilot.build = AsyncMock(return_value=AutomationBuildResult(
+            status="ready", intent=intent,
+        ))
+        mock_copilot.execute_scripts = AsyncMock(return_value=ExecutionResult(
+            extracted_data={"title": "Test Page"}, screenshots=["shot1.png"],
+        ))
+
+        with (
+            patch("app.services.automation_copilot.AutomationCopilot", return_value=mock_copilot),
+            patch("app.services.playwright_script_generator.PlaywrightScriptGenerator"),
+            patch("app.services.self_healing_executor.SelfHealingExecutor"),
+            patch("app.services.browser_pool.BrowserPool"),
+            patch("app.services.selector_cache.SelectorCache"),
+            patch("app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"),
+        ):
+            executor = WebAutomationExecutor()
+            result = await executor.execute(
+                {"prompt": "Extract title from example.com"},
+                {"tenant_id": "t1", "user_id": 1, "execution_id": "exec-1"},
+            )
+
+        assert result["status"] == "success"
+        assert result["extracted_data"] == {"title": "Test Page"}
+
+    @pytest.mark.asyncio
+    async def test_needs_clarification_returns_questions(self):
+        from app.services.automation_copilot import AutomationBuildResult
+
+        mock_copilot = MagicMock()
+        mock_copilot.analyze = AsyncMock(return_value=AutomationBuildResult(
+            status="needs_clarification",
+            questions=["What URL should I visit?", "What data to extract?"],
+        ))
+
+        with (
+            patch("app.services.automation_copilot.AutomationCopilot", return_value=mock_copilot),
+            patch("app.services.playwright_script_generator.PlaywrightScriptGenerator"),
+            patch("app.services.self_healing_executor.SelfHealingExecutor"),
+            patch("app.services.browser_pool.BrowserPool"),
+            patch("app.services.selector_cache.SelectorCache"),
+            patch("app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"),
+        ):
+            executor = WebAutomationExecutor()
+            result = await executor.execute(
+                {"prompt": "Do something"},
+                {"tenant_id": "t1", "user_id": 1},
+            )
+
+        assert result["status"] == "needs_input"
+        assert "What URL should I visit?" in result["questions"]
+
+    @pytest.mark.asyncio
+    async def test_gateway_unavailable_returns_error(self):
+        from app.services.llm_gateway_client import GatewayUnavailableError
+
+        with patch(
+            "app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"
+        ) as MockGateway:
+            MockGateway.side_effect = GatewayUnavailableError("down")
+
+            executor = WebAutomationExecutor()
+            result = await executor.execute(
+                {"prompt": "test"},
+                {"tenant_id": "t1", "user_id": 1},
+            )
+
+        assert result["status"] == "error"
+        assert "gateway" in result["message"].lower() or "unavailable" in result["message"].lower()
+
+    @pytest.mark.asyncio
+    async def test_allowed_domains_passed_through(self):
+        from app.services.automation_copilot import AutomationBuildResult, AutomationIntent
+
+        intent = AutomationIntent(
+            intent_type="browser_rpa", confidence=0.9, is_ready=True,
+            browser_tasks=[],
+        )
+
+        mock_copilot = MagicMock()
+        mock_copilot.analyze = AsyncMock(return_value=AutomationBuildResult(
+            status="preview_ready", intent=intent,
+        ))
+        mock_copilot.build = AsyncMock(return_value=AutomationBuildResult(
+            status="ready", intent=intent,
+        ))
+        mock_copilot.execute_scripts = AsyncMock(return_value=None)
+
+        with (
+            patch("app.services.automation_copilot.AutomationCopilot", return_value=mock_copilot),
+            patch("app.services.playwright_script_generator.PlaywrightScriptGenerator"),
+            patch("app.services.self_healing_executor.SelfHealingExecutor"),
+            patch("app.services.browser_pool.BrowserPool"),
+            patch("app.services.selector_cache.SelectorCache"),
+            patch("app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"),
+        ):
+            executor = WebAutomationExecutor()
+            result = await executor.execute(
+                {"prompt": "test"},
+                {"tenant_id": "t1", "user_id": 1, "execution_id": "e1",
+                 "allowed_domains": ["example.com"]},
+            )
+
+        # Verify build was called, and allowed_domains was in the args
+        mock_copilot.build.assert_called_once()
+        call_args = mock_copilot.build.call_args
+        # allowed_domains is the last positional arg
+        assert ["example.com"] in call_args.args
diff --git a/python-backend/tests/test_web_automation_node.py b/python-backend/tests/test_web_automation_node.py
index 1d48ae5..f891f38 100644
--- a/python-backend/tests/test_web_automation_node.py
+++ b/python-backend/tests/test_web_automation_node.py
@@ -30,12 +30,13 @@ class TestWebAutomationNode:
         assert spec is not None
         assert spec.executor == "app.orchestrator.node_executors.web_automation_executor.WebAutomationExecutor"
 
-    def test_executor_stub_raises_not_implemented(self):
+    def test_executor_returns_dict(self):
         from app.orchestrator.node_executors.web_automation_executor import WebAutomationExecutor
 
         executor = WebAutomationExecutor()
-        with pytest.raises(NotImplementedError):
-            import asyncio
-            asyncio.get_event_loop().run_until_complete(
-                executor.execute({"prompt": "test"}, {"tenant_id": "t1"})
-            )
+        import asyncio
+        result = asyncio.get_event_loop().run_until_complete(
+            executor.execute({"prompt": "test"}, {"tenant_id": "t1"})
+        )
+        assert isinstance(result, dict)
+        assert "status" in result
