"""Tests for _diagnose_failure() LLM integration in SelfHealingExecutor."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.playwright_script_generator import PlaywrightAction
from app.services.self_healing_executor import FailureDiagnosis, SelfHealingExecutor


def _make_chat_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def _make_executor(gateway_mock: AsyncMock) -> SelfHealingExecutor:
    pool = MagicMock()
    cache = MagicMock()
    return SelfHealingExecutor(
        pool, cache, vision_model="gpt-4o", gateway_client=gateway_mock
    )


def _make_failed_action() -> PlaywrightAction:
    return PlaywrightAction(
        action_type="click",
        selector_css="#login-btn",
        selector_strategies=["#login-btn"],
        description="Click login button",
        confidence=0.9,
    )


def _make_mock_page() -> AsyncMock:
    page = AsyncMock()
    page.screenshot = AsyncMock(return_value=b"\x89PNG\x00\x00\x00")
    return page


class TestDiagnoseFailure:
    @pytest.mark.asyncio
    async def test_screenshot_and_error_sent_to_vision(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_chat_response(
            json.dumps({
                "root_cause": "Button moved to new location",
                "suggested_new_selector": {"css": "#new-login-btn"},
                "confidence": 0.8,
                "action_type_still_valid": True,
            })
        ))
        executor = _make_executor(gateway)
        page = _make_mock_page()
        action = _make_failed_action()

        result = await executor._diagnose_failure(page, action, Exception("Not found"))

        gateway.chat_completion.assert_called_once()
        call_kwargs = gateway.chat_completion.call_args
        messages = call_kwargs.kwargs.get("messages") or call_kwargs.args[0]
        # System prompt is first message
        assert messages[0]["role"] == "system"
        # User message contains error text and image
        user_content = messages[1]["content"]
        assert any("Not found" in str(block) for block in user_content)
        assert any("image_url" in str(block) for block in user_content)

    @pytest.mark.asyncio
    async def test_valid_diagnosis_returned(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_chat_response(
            json.dumps({
                "root_cause": "Button moved",
                "suggested_new_selector": {"css": "[data-testid='login']"},
                "confidence": 0.8,
                "action_type_still_valid": True,
            })
        ))
        executor = _make_executor(gateway)
        page = _make_mock_page()

        result = await executor._diagnose_failure(page, _make_failed_action(), Exception("err"))

        assert result.confidence > 0.0
        assert result.root_cause == "Button moved"
        assert result.suggested_new_selector == {"css": "[data-testid='login']"}

    @pytest.mark.asyncio
    async def test_suggested_selector_is_css_not_js(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_chat_response(
            json.dumps({
                "root_cause": "Button moved",
                "suggested_new_selector": {"css": ".new-btn"},
                "confidence": 0.8,
                "action_type_still_valid": True,
            })
        ))
        executor = _make_executor(gateway)
        page = _make_mock_page()

        result = await executor._diagnose_failure(page, _make_failed_action(), Exception("err"))

        selector_str = json.dumps(result.suggested_new_selector)
        assert "evaluate" not in selector_str
        assert "page.evaluate" not in selector_str

    @pytest.mark.asyncio
    async def test_gateway_unavailable_returns_zero_confidence(self):
        from app.services.llm_gateway_client import GatewayUnavailableError

        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(side_effect=GatewayUnavailableError("down"))
        executor = _make_executor(gateway)
        page = _make_mock_page()

        result = await executor._diagnose_failure(page, _make_failed_action(), Exception("err"))

        assert result.confidence == 0.0
        assert result.suggested_new_selector is None

    @pytest.mark.asyncio
    async def test_no_gateway_returns_stub_diagnosis(self):
        pool = MagicMock()
        cache = MagicMock()
        executor = SelfHealingExecutor(pool, cache, vision_model="gpt-4o")
        page = _make_mock_page()

        result = await executor._diagnose_failure(page, _make_failed_action(), Exception("err"))

        assert result.confidence == 0.0
        assert result.action_type_still_valid is False
