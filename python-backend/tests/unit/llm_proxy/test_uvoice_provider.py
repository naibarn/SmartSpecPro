import base64
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.llm_proxy.providers.uvoice_provider import UVoiceProvider


@pytest.mark.asyncio
async def test_generate_audio_builds_payload_and_extracts_url():
    provider = UVoiceProvider(api_key="test-key")
    provider._post_json = AsyncMock(return_value=(
        {
            "success": True,
            "request_id": "uv-123",
            "audio_url": "https://cdn.uvoice.ai/audio/test.mp3",
            "credits_charged": 12,
        },
        MagicMock(headers={}),
    ))

    result = await provider.generate_audio(
        model="uvoice/tts-standard",
        text="hello world",
        voice="TH-KantapongPremiumHD",
        extra_params={"outputFormat": "mp3"},
        api_config={"endpoint": "/generate"},
    )

    args, kwargs = provider._post_json.await_args
    assert args[0] == "/generate"
    payload = args[1]
    assert payload["settings"]["text"] == "hello world"
    assert payload["settings"]["voiceID"] == "TH-KantapongPremiumHD"
    assert payload["settings"]["outputType"] == "url"

    assert result["id"] == "uv-123"
    assert result["data"][0]["url"] == "https://cdn.uvoice.ai/audio/test.mp3"
    assert result["uvoice_credits_charged"] == 12

    await provider.aclose()


@pytest.mark.asyncio
async def test_generate_audio_falls_back_to_binary_response():
    provider = UVoiceProvider(api_key="test-key")
    binary_response = MagicMock()
    binary_response.headers = {"x-request-id": "uv-bin-1"}
    binary_response.content = b"\x01\x02\x03"
    provider._post_json = AsyncMock(return_value=(None, binary_response))

    result = await provider.generate_audio(
        model="uvoice/tts-standard",
        text="binary output",
        extra_params={"output_type": "base64", "voiceID": "TH-KantapongPremiumHD"},
    )

    expected_b64 = base64.b64encode(b"\x01\x02\x03").decode("ascii")
    assert result["id"] == "uv-bin-1"
    assert result["data"][0]["url"] == f"data:audio/mpeg;base64,{expected_b64}"

    await provider.aclose()


@pytest.mark.asyncio
async def test_generate_audio_requires_voice_id():
    provider = UVoiceProvider(api_key="test-key")

    with pytest.raises(RuntimeError, match="voiceID"):
        await provider.generate_audio(
            model="uvoice/tts-standard",
            text="hello world",
        )

    await provider.aclose()
