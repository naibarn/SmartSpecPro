"""Tests for _vision_llm_call() LLM integration in PlaywrightScriptGenerator."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.playwright_script_generator import (
    CONFIDENCE_THRESHOLD,
    IdentifiedElement,
    PlaywrightScriptGenerator,
    ScriptGenerationError,
)


def _make_chat_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def _make_generator(gateway_mock: AsyncMock) -> PlaywrightScriptGenerator:
    pool = MagicMock()
    cache = MagicMock()
    return PlaywrightScriptGenerator(pool, cache, gateway_client=gateway_mock)


class TestVisionLLMCall:
    @pytest.mark.asyncio
    async def test_screenshot_and_goal_sent_to_gateway(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_chat_response(
            json.dumps([
                {"element_index": 1, "action_type": "click", "value": None,
                 "confidence": 0.9, "reasoning": "Login button"},
            ])
        ))
        gen = _make_generator(gateway)

        result = await gen._vision_llm_call(
            screenshot_b64="base64data",
            goal="Click login",
            vision_model="gpt-4o",
            element_refs=[{"index": 1, "tag": "button", "text": "Login"}],
        )

        gateway.chat_completion.assert_called_once()
        call_kwargs = gateway.chat_completion.call_args
        messages = call_kwargs.kwargs.get("messages") or call_kwargs.args[0]
        # System prompt is first message
        assert messages[0]["role"] == "system"
        # User message contains image and text
        user_content = messages[1]["content"]
        assert any("base64data" in str(block) for block in user_content)
        assert any("Click login" in str(block) for block in user_content)
        assert len(result) == 1
        assert result[0].element_index == 1

    @pytest.mark.asyncio
    async def test_vision_model_passed_through(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_chat_response(
            json.dumps([
                {"element_index": 1, "action_type": "click", "value": None,
                 "confidence": 0.9, "reasoning": "button"},
            ])
        ))
        gen = _make_generator(gateway)

        await gen._vision_llm_call(
            screenshot_b64="img",
            goal="test",
            vision_model="gpt-4o-mini",
            element_refs=[],
        )

        call_kwargs = gateway.chat_completion.call_args
        assert call_kwargs.kwargs.get("model") == "gpt-4o-mini"

    @pytest.mark.asyncio
    async def test_returns_all_elements_unfiltered(self):
        """_vision_llm_call returns raw results; filtering happens in generate()."""
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_chat_response(
            json.dumps([
                {"element_index": 1, "action_type": "click", "value": None,
                 "confidence": 0.9, "reasoning": "high"},
                {"element_index": 2, "action_type": "click", "value": None,
                 "confidence": 0.7, "reasoning": "medium"},
                {"element_index": 3, "action_type": "click", "value": None,
                 "confidence": 0.5, "reasoning": "low"},
            ])
        ))
        gen = _make_generator(gateway)

        result = await gen._vision_llm_call("img", "test", "gpt-4o", [])

        assert len(result) == 3
        high_conf = [e for e in result if e.confidence >= CONFIDENCE_THRESHOLD]
        assert len(high_conf) == 2

    @pytest.mark.asyncio
    async def test_gateway_unavailable_raises(self):
        from app.services.llm_gateway_client import GatewayUnavailableError

        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(side_effect=GatewayUnavailableError("down"))
        gen = _make_generator(gateway)

        with pytest.raises(GatewayUnavailableError):
            await gen._vision_llm_call("img", "test", "gpt-4o", [])

    @pytest.mark.asyncio
    async def test_no_gateway_raises_not_implemented(self):
        pool = MagicMock()
        cache = MagicMock()
        gen = PlaywrightScriptGenerator(pool, cache)

        with pytest.raises(NotImplementedError):
            await gen._vision_llm_call("img", "test", "gpt-4o", [])

    @pytest.mark.asyncio
    async def test_invalid_json_raises_script_generation_error(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_chat_response(
            "This is not valid JSON!"
        ))
        gen = _make_generator(gateway)

        with pytest.raises(ScriptGenerationError, match="invalid JSON"):
            await gen._vision_llm_call("img", "test", "gpt-4o", [])

    @pytest.mark.asyncio
    async def test_tenant_id_passed_through(self):
        gateway = AsyncMock()
        gateway.chat_completion = AsyncMock(return_value=_make_chat_response(
            json.dumps([
                {"element_index": 1, "action_type": "click", "value": None,
                 "confidence": 0.9, "reasoning": "btn"},
            ])
        ))
        gen = _make_generator(gateway)

        await gen._vision_llm_call(
            "img", "test", "gpt-4o", [], tenant_id="t1", user_id=42
        )

        call_kwargs = gateway.chat_completion.call_args
        assert call_kwargs.kwargs.get("tenant_id") == "t1"
        assert call_kwargs.kwargs.get("user_id") == 42
