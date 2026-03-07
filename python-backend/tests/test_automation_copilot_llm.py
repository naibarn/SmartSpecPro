"""Tests for _analyze_intent() LLM integration in AutomationCopilot."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.automation_copilot import AutomationCopilot, AutomationIntent


def _make_gateway_response(content: str) -> dict:
    """Build a chat_completion-style response dict."""
    return {"choices": [{"message": {"content": content}}]}


def _make_copilot(gateway_mock: AsyncMock) -> AutomationCopilot:
    """Create copilot with mocked dependencies."""
    gen = MagicMock()
    exe = MagicMock()
    return AutomationCopilot(gen, exe, gateway_client=gateway_mock)


class TestAnalyzeIntentLLM:
    @pytest.mark.asyncio
    async def test_valid_json_parsed_into_intent(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_gateway_response(
            json.dumps({
                "intent_type": "browser_rpa",
                "confidence": 0.9,
                "is_ready": True,
                "browser_tasks": [{"url": "https://example.com", "goal": "Click login"}],
                "plan_summary": "Automate login flow",
            })
        ))
        copilot = _make_copilot(gateway)
        result = await copilot.analyze("Log into example.com", "tenant1", 1)

        assert result.status == "preview_ready"
        assert result.intent.intent_type == "browser_rpa"
        assert result.intent.confidence == 0.9

    @pytest.mark.asyncio
    async def test_invalid_json_returns_needs_clarification(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_gateway_response(
            "This is not valid JSON at all!"
        ))
        copilot = _make_copilot(gateway)
        result = await copilot.analyze("Do something", "tenant1", 1)

        assert result.status == "needs_clarification"
        assert result.questions is not None
        assert len(result.questions) > 0

    @pytest.mark.asyncio
    async def test_low_confidence_returns_needs_clarification(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_gateway_response(
            json.dumps({
                "intent_type": "browser_rpa",
                "confidence": 0.3,
                "is_ready": False,
                "clarification_questions": ["What URL?", "What data?"],
            })
        ))
        copilot = _make_copilot(gateway)
        result = await copilot.analyze("Do something", "tenant1", 1)

        assert result.status == "needs_clarification"
        assert "What URL?" in result.questions

    @pytest.mark.asyncio
    async def test_gateway_unavailable_graceful_degradation(self):
        from app.services.llm_gateway_client import GatewayUnavailableError

        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(side_effect=GatewayUnavailableError("down"))
        copilot = _make_copilot(gateway)
        result = await copilot.analyze("Do something", "tenant1", 1)

        assert result.status == "needs_clarification"
        assert result.questions is not None

    @pytest.mark.asyncio
    async def test_response_format_set_to_json_object(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_gateway_response(
            json.dumps({
                "intent_type": "browser_rpa",
                "confidence": 0.9,
                "is_ready": True,
                "browser_tasks": [],
            })
        ))
        copilot = _make_copilot(gateway)
        await copilot.analyze("Test", "tenant1", 1)

        call_kwargs = gateway.chat_completion.call_args
        assert call_kwargs.kwargs.get("response_format") == {"type": "json_object"}
