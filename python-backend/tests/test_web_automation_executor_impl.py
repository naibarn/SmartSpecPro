"""Tests for WebAutomationExecutor.execute() full pipeline."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.orchestrator.node_executors.web_automation_executor import WebAutomationExecutor


def _patch_executor_deps():
    """Patch all dependencies used inside execute() via local imports."""
    return [
        patch("app.services.automation_copilot.AutomationCopilot"),
        patch("app.services.playwright_script_generator.PlaywrightScriptGenerator"),
        patch("app.services.self_healing_executor.SelfHealingExecutor"),
        patch("app.services.browser_pool.BrowserPool"),
        patch("app.services.selector_cache.SelectorCache"),
        patch(
            "app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"
        ),
    ]


class TestWebAutomationExecutorPipeline:
    @pytest.mark.asyncio
    async def test_full_pipeline_success(self):
        from app.services.automation_copilot import AutomationBuildResult, AutomationIntent
        from app.services.self_healing_executor import ExecutionResult

        intent = AutomationIntent(
            intent_type="browser_rpa", confidence=0.9, is_ready=True,
            browser_tasks=[{"url": "https://example.com", "goal": "extract data"}],
        )

        mock_copilot = MagicMock()
        mock_copilot.analyze = AsyncMock(return_value=AutomationBuildResult(
            status="preview_ready", intent=intent,
        ))
        mock_copilot.build = AsyncMock(return_value=AutomationBuildResult(
            status="ready", intent=intent,
        ))
        mock_copilot.execute_scripts = AsyncMock(return_value=ExecutionResult(
            extracted_data={"title": "Test Page"}, screenshots=["shot1.png"],
        ))

        with (
            patch("app.services.automation_copilot.AutomationCopilot", return_value=mock_copilot),
            patch("app.services.playwright_script_generator.PlaywrightScriptGenerator"),
            patch("app.services.self_healing_executor.SelfHealingExecutor"),
            patch("app.services.browser_pool.BrowserPool"),
            patch("app.services.selector_cache.SelectorCache"),
            patch("app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"),
        ):
            executor = WebAutomationExecutor()
            result = await executor.execute(
                {"prompt": "Extract title from example.com"},
                {"tenant_id": "t1", "user_id": 1, "execution_id": "exec-1"},
            )

        assert result["status"] == "success"
        assert result["extracted_data"] == {"title": "Test Page"}

    @pytest.mark.asyncio
    async def test_needs_clarification_returns_questions(self):
        from app.services.automation_copilot import AutomationBuildResult

        mock_copilot = MagicMock()
        mock_copilot.analyze = AsyncMock(return_value=AutomationBuildResult(
            status="needs_clarification",
            questions=["What URL should I visit?", "What data to extract?"],
        ))

        with (
            patch("app.services.automation_copilot.AutomationCopilot", return_value=mock_copilot),
            patch("app.services.playwright_script_generator.PlaywrightScriptGenerator"),
            patch("app.services.self_healing_executor.SelfHealingExecutor"),
            patch("app.services.browser_pool.BrowserPool"),
            patch("app.services.selector_cache.SelectorCache"),
            patch("app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"),
        ):
            executor = WebAutomationExecutor()
            result = await executor.execute(
                {"prompt": "Do something"},
                {"tenant_id": "t1", "user_id": 1},
            )

        assert result["status"] == "needs_input"
        assert "What URL should I visit?" in result["questions"]

    @pytest.mark.asyncio
    async def test_gateway_unavailable_returns_error(self):
        from app.services.llm_gateway_client import GatewayUnavailableError

        with patch(
            "app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"
        ) as MockGateway:
            MockGateway.side_effect = GatewayUnavailableError("down")

            executor = WebAutomationExecutor()
            result = await executor.execute(
                {"prompt": "test"},
                {"tenant_id": "t1", "user_id": 1},
            )

        assert result["status"] == "error"
        assert "gateway" in result["message"].lower() or "unavailable" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_allowed_domains_passed_through(self):
        from app.services.automation_copilot import AutomationBuildResult, AutomationIntent

        intent = AutomationIntent(
            intent_type="browser_rpa", confidence=0.9, is_ready=True,
            browser_tasks=[],
        )

        mock_copilot = MagicMock()
        mock_copilot.analyze = AsyncMock(return_value=AutomationBuildResult(
            status="preview_ready", intent=intent,
        ))
        mock_copilot.build = AsyncMock(return_value=AutomationBuildResult(
            status="ready", intent=intent,
        ))
        mock_copilot.execute_scripts = AsyncMock(return_value=None)

        with (
            patch("app.services.automation_copilot.AutomationCopilot", return_value=mock_copilot),
            patch("app.services.playwright_script_generator.PlaywrightScriptGenerator"),
            patch("app.services.self_healing_executor.SelfHealingExecutor"),
            patch("app.services.browser_pool.BrowserPool"),
            patch("app.services.selector_cache.SelectorCache"),
            patch("app.orchestrator.node_executors.web_automation_executor.LLMGatewayClient"),
        ):
            executor = WebAutomationExecutor()
            result = await executor.execute(
                {"prompt": "test"},
                {"tenant_id": "t1", "user_id": 1, "execution_id": "e1",
                 "allowed_domains": ["example.com"]},
            )

        # Verify build was called, and allowed_domains was in the args
        mock_copilot.build.assert_called_once()
        call_args = mock_copilot.build.call_args
        # allowed_domains is the last positional arg
        assert ["example.com"] in call_args.args
