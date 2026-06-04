from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx
from fastapi import HTTPException

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import AudioGenerationRequest
from app.llm_proxy.providers.uvoice_provider import UVoiceProvider as _RealUVoice

UVOICE_PATCH = "app.llm_proxy.providers.uvoice_provider.UVoiceProvider"
GET_PROVIDER_KEY_PATCH = "app.services.media_provider_service.get_media_provider_key"


def _uvoice_class_mock(instance: MagicMock) -> MagicMock:
    cls = MagicMock()
    cls.AUDIO_MODELS = _RealUVoice.AUDIO_MODELS
    cls.return_value = instance
    return cls


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(fetchone=lambda: None))
    return db


@pytest.fixture
def gateway(mock_db):
    with patch("app.llm_proxy.gateway_unified.LLMProxy"), \
         patch("app.llm_proxy.gateway_unified.get_unified_client"), \
         patch("app.llm_proxy.gateway_unified.CreditService"), \
         patch("app.llm_proxy.gateway_unified.get_gateway_client"):
        gw = LLMGateway(mock_db)
        gw._check_credits = AsyncMock()
        gw._estimate_cost = AsyncMock(return_value=Decimal("0.02"))
        gw._deduct_credits = AsyncMock(return_value=MagicMock(amount=-20, balance_after=980))
        return gw


@pytest.mark.asyncio
async def test_generate_audio_routes_to_uvoice_when_provider_hint_present(gateway):
    request = AudioGenerationRequest(
        model="uvoice/tts-standard",
        text="hello",
        apiConfig={"provider": "uvoice"},
    )
    user = MagicMock(id=1)

    uvoice_client = MagicMock()
    uvoice_client.generate_audio = AsyncMock(return_value={
        "id": "uv-task-1",
        "created": 123,
        "data": [{"url": "https://cdn.uvoice.ai/a.mp3"}],
    })
    uvoice_client.aclose = AsyncMock()

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(uvoice_client)), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "uv-key", "baseUrl": "https://api.uvoice.ai"}):
        response = await gateway.generate_audio(request, user)

    assert response.provider == "uvoice"
    assert response.id == "uv-task-1"
    assert response.data == [{"url": "https://cdn.uvoice.ai/a.mp3"}]
    uvoice_client.generate_audio.assert_awaited_once()
    uvoice_client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_audio_raises_503_when_uvoice_not_configured(gateway):
    request = AudioGenerationRequest(
        model="uvoice/tts-standard",
        text="hello",
        apiConfig={"provider": "uvoice"},
    )

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(MagicMock())), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            await gateway.generate_audio(request, MagicMock(id=1))

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_generate_audio_kie_fallback_for_non_uvoice_model(gateway):
    request = AudioGenerationRequest(
        model="elevenlabs/text-to-speech-multilingual-v2",
        text="hello",
    )

    kie_client = MagicMock()
    kie_client.generate_audio = AsyncMock(return_value={
        "id": "kie-audio-1",
        "created": 456,
        "data": [{"url": "https://cdn.kie.ai/a.mp3"}],
        "kie_credits_consumed": None,
    })
    gateway.unified_client.kie_ai_client = kie_client

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(MagicMock())):
        response = await gateway.generate_audio(request, MagicMock(id=1))

    assert response.provider == "kie_ai"
    assert response.id == "kie-audio-1"
    kie_client.generate_audio.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_audio_applies_text_affix_from_api_config_for_kie(gateway):
    request = AudioGenerationRequest(
        model="elevenlabs/text-to-speech-multilingual-v2",
        text="hello world",
        extraParams={
            "dialogue": [{"text": "line one", "voice": "Jessica"}],
        },
        apiConfig={
            "prepend_newline": "true",
            "apply_text_affix_to_dialogue": "true",
        },
    )

    async def _estimate_cost_with_assert(req: AudioGenerationRequest, _use_openrouter: bool):
        assert req.text == "\nhello world"
        assert isinstance(req.extra_params, dict)
        dialogue = req.extra_params.get("dialogue")
        assert isinstance(dialogue, list)
        assert isinstance(dialogue[0], dict)
        assert dialogue[0].get("text") == "\nline one"
        return Decimal("0.02")

    gateway._estimate_cost = AsyncMock(side_effect=_estimate_cost_with_assert)

    kie_client = MagicMock()
    kie_client.generate_audio = AsyncMock(return_value={
        "id": "kie-audio-affix-1",
        "created": 456,
        "data": [{"url": "https://cdn.kie.ai/a.mp3"}],
        "kie_credits_consumed": None,
    })
    gateway.unified_client.kie_ai_client = kie_client

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(MagicMock())):
        await gateway.generate_audio(request, MagicMock(id=1))

    _, kwargs = kie_client.generate_audio.await_args
    assert kwargs["text"] == "\nhello world"
    assert kwargs["extra_params"]["dialogue"][0]["text"] == "\nline one"


@pytest.mark.asyncio
async def test_generate_audio_applies_text_prefix_for_uvoice(gateway):
    request = AudioGenerationRequest(
        model="uvoice/tts-standard",
        text="สวัสดีครับ",
        apiConfig={
            "provider": "uvoice",
            "text_prefix": "\n",
        },
    )
    user = MagicMock(id=1)

    async def _estimate_cost_with_assert(req: AudioGenerationRequest, _use_openrouter: bool):
        assert req.text == "\nสวัสดีครับ"
        return Decimal("0.02")

    gateway._estimate_cost = AsyncMock(side_effect=_estimate_cost_with_assert)

    uvoice_client = MagicMock()
    uvoice_client.generate_audio = AsyncMock(return_value={
        "id": "uv-task-affix-1",
        "created": 123,
        "data": [{"url": "https://cdn.uvoice.ai/a.mp3"}],
    })
    uvoice_client.aclose = AsyncMock()

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(uvoice_client)), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "uv-key", "baseUrl": "https://api.uvoice.ai"}):
        await gateway.generate_audio(request, user)

    _, kwargs = uvoice_client.generate_audio.await_args
    assert kwargs["text"] == "\nสวัสดีครับ"


@pytest.mark.asyncio
async def test_generate_audio_auto_prepends_newline_for_tts_voice_requests(gateway):
    request = AudioGenerationRequest(
        model="uvoice/tts-standard",
        text="hello",
        voice="TH-KantapongPremiumHD",
        apiConfig={"provider": "uvoice"},
    )

    async def _estimate_cost_with_assert(req: AudioGenerationRequest, _use_openrouter: bool):
        assert req.text == "\nhello"
        return Decimal("0.02")

    gateway._estimate_cost = AsyncMock(side_effect=_estimate_cost_with_assert)

    uvoice_client = MagicMock()
    uvoice_client.generate_audio = AsyncMock(return_value={
        "id": "uv-task-auto-newline-1",
        "created": 123,
        "data": [{"url": "https://cdn.uvoice.ai/a.mp3"}],
    })
    uvoice_client.aclose = AsyncMock()

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(uvoice_client)), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "uv-key", "baseUrl": "https://api.uvoice.ai"}):
        await gateway.generate_audio(request, MagicMock(id=1))

    _, kwargs = uvoice_client.generate_audio.await_args
    assert kwargs["text"] == "\nhello"


@pytest.mark.asyncio
async def test_generate_audio_respects_prepend_newline_false(gateway):
    request = AudioGenerationRequest(
        model="uvoice/tts-standard",
        text="hello",
        voice="TH-KantapongPremiumHD",
        apiConfig={
            "provider": "uvoice",
            "prepend_newline": "false",
        },
    )

    async def _estimate_cost_with_assert(req: AudioGenerationRequest, _use_openrouter: bool):
        assert req.text == "hello"
        return Decimal("0.02")

    gateway._estimate_cost = AsyncMock(side_effect=_estimate_cost_with_assert)

    uvoice_client = MagicMock()
    uvoice_client.generate_audio = AsyncMock(return_value={
        "id": "uv-task-no-newline-1",
        "created": 123,
        "data": [{"url": "https://cdn.uvoice.ai/a.mp3"}],
    })
    uvoice_client.aclose = AsyncMock()

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(uvoice_client)), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "uv-key", "baseUrl": "https://api.uvoice.ai"}):
        await gateway.generate_audio(request, MagicMock(id=1))

    _, kwargs = uvoice_client.generate_audio.await_args
    assert kwargs["text"] == "hello"


@pytest.mark.asyncio
async def test_generate_audio_retries_natural_tier_403_with_standard_fallback(gateway):
    request = AudioGenerationRequest(
        model="uvoice/tts-natural",
        text="สวัสดีครับ นี่คือข้อความทดสอบ",
        apiConfig={"provider": "uvoice", "voiceID": "TH-NalineeNatural"},
    )

    gateway._estimate_cost = AsyncMock(return_value=Decimal("0.02"))

    failed_request = httpx.Request("POST", "https://api.uvoice.ai/generate")
    failed_response = httpx.Response(
        403,
        request=failed_request,
        text='{"success":false,"message":"Error creating file"}',
    )

    uvoice_client = MagicMock()
    uvoice_client.generate_audio = AsyncMock(side_effect=[
        httpx.HTTPStatusError("forbidden", request=failed_request, response=failed_response),
        {
            "id": "uv-task-fallback-1",
            "created": 123,
            "data": [{"url": "https://cdn.uvoice.ai/fallback.mp3"}],
        },
    ])
    uvoice_client.aclose = AsyncMock()

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(uvoice_client)), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "uv-key", "baseUrl": "https://api.uvoice.ai"}):
        response = await gateway.generate_audio(request, MagicMock(id=1))

    assert response.provider == "uvoice"
    assert response.model == "uvoice/tts-standard"
    assert response.data == [{"url": "https://cdn.uvoice.ai/fallback.mp3"}]
    assert uvoice_client.generate_audio.await_count == 2

    first_call = uvoice_client.generate_audio.await_args_list[0]
    assert first_call.kwargs["model"] == "uvoice/tts-natural"
    assert first_call.kwargs["api_config"]["voiceID"] == "TH-NalineeNatural"

    second_call = uvoice_client.generate_audio.await_args_list[1]
    assert second_call.kwargs["model"] == "uvoice/tts-standard"
    assert second_call.kwargs["voice_id"] == "TH-TigerSD"
    assert second_call.kwargs["extra_params"]["voiceID"] == "TH-TigerSD"


@pytest.mark.asyncio
async def test_generate_audio_does_not_fallback_when_uvoice_voice_id_is_explicit(gateway):
    request = AudioGenerationRequest(
        model="uvoice/tts-natural",
        text="สวัสดีครับ นี่คือข้อความทดสอบ",
        apiConfig={"provider": "uvoice"},
        extraParams={"voiceID": "TH-NalineeNatural"},
    )

    gateway._estimate_cost = AsyncMock(return_value=Decimal("0.02"))

    failed_request = httpx.Request("POST", "https://api.uvoice.ai/generate")
    failed_response = httpx.Response(
        403,
        request=failed_request,
        text='{"success":false,"message":"Error creating file"}',
    )

    uvoice_client = MagicMock()
    uvoice_client.generate_audio = AsyncMock(
        side_effect=httpx.HTTPStatusError(
            "forbidden",
            request=failed_request,
            response=failed_response,
        )
    )
    uvoice_client.aclose = AsyncMock()

    with patch(UVOICE_PATCH, new=_uvoice_class_mock(uvoice_client)), \
         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "uv-key", "baseUrl": "https://api.uvoice.ai"}):
        with pytest.raises(HTTPException) as exc_info:
            await gateway.generate_audio(request, MagicMock(id=1))

    assert exc_info.value.status_code == 500
    assert uvoice_client.generate_audio.await_count == 1
    first_call = uvoice_client.generate_audio.await_args_list[0]
    assert first_call.kwargs["model"] == "uvoice/tts-natural"
    assert first_call.kwargs["extra_params"]["voiceID"] == "TH-NalineeNatural"
