"""Tests for AutomationCopilot orchestrator."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.automation_copilot import (
    AutomationBuildResult,
    AutomationCopilot,
    AutomationIntent,
)


@pytest.fixture
def mock_script_generator():
    gen = AsyncMock()
    gen.generate = AsyncMock(return_value=MagicMock(
        url="http://example.com",
        goal="click submit",
        actions=[],
    ))
    return gen


@pytest.fixture
def mock_executor():
    ex = AsyncMock()
    ex.execute = AsyncMock(return_value=MagicMock(
        extracted_data=None,
        screenshots=[],
        pages_loaded=1,
        healed=False,
        heal_attempts=0,
        credits_used=5,
    ))
    return ex


@pytest.fixture
def copilot(mock_script_generator, mock_executor):
    return AutomationCopilot(
        script_generator=mock_script_generator,
        executor=mock_executor,
    )


class TestIntentRouting:
    async def test_browser_rpa_intent_routes_to_generator(self, copilot, mock_script_generator):
        intent = AutomationIntent(
            intent_type="browser_rpa",
            confidence=0.9,
            is_ready=True,
            browser_tasks=[{"url": "http://example.com", "goal": "click submit"}],
        )
        result = await copilot.build(
            intent=intent,
            execution_id="exec-1",
            tenant_id="t1",
            user_id=1,
            vision_model="gpt-4o",
            allowed_domains=["example.com"],
        )
        mock_script_generator.generate.assert_awaited()

    async def test_workflow_intent_calls_build_workflow(self, copilot):
        intent = AutomationIntent(
            intent_type="workflow",
            confidence=0.8,
            is_ready=True,
        )
        result = await copilot.build(
            intent=intent,
            execution_id="exec-1",
            tenant_id="t1",
            user_id=1,
            vision_model="gpt-4o",
            allowed_domains=[],
        )
        assert result.status == "ready"

    async def test_agency_intent_calls_build_agency(self, copilot):
        intent = AutomationIntent(
            intent_type="agency",
            confidence=0.8,
            is_ready=True,
        )
        result = await copilot.build(
            intent=intent,
            execution_id="exec-1",
            tenant_id="t1",
            user_id=1,
            vision_model="gpt-4o",
            allowed_domains=[],
        )
        assert result.status == "ready"


class TestAnalyze:
    async def test_analyze_returns_needs_clarification_when_not_ready(self, copilot):
        copilot._analyze_intent = AsyncMock(
            return_value=AutomationIntent(
                intent_type="browser_rpa",
                confidence=0.5,
                is_ready=False,
                ambiguities=["Which button to click?"],
            )
        )
        result = await copilot.analyze(
            prompt="click a button",
            tenant_id="t1",
            user_id=1,
        )
        assert result.status == "needs_clarification"
        assert result.questions is not None

    async def test_analyze_returns_preview_ready_when_clear(self, copilot):
        copilot._analyze_intent = AsyncMock(
            return_value=AutomationIntent(
                intent_type="browser_rpa",
                confidence=0.9,
                is_ready=True,
                browser_tasks=[{"url": "http://example.com", "goal": "click submit"}],
            )
        )
        result = await copilot.analyze(
            prompt="go to example.com and click submit",
            tenant_id="t1",
            user_id=1,
        )
        assert result.status == "preview_ready"


class TestExecute:
    async def test_execute_calls_self_healing_executor(self, copilot, mock_executor):
        copilot._scripts = {"exec-1": [MagicMock()]}
        result = await copilot.execute_scripts(
            execution_id="exec-1",
            tenant_id="t1",
            user_id=1,
            allowed_domains=["example.com"],
            status_callback=AsyncMock(),
        )
        mock_executor.execute.assert_awaited()
