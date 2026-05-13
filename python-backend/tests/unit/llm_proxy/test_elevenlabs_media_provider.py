from __future__ import annotations

import json

import httpx
import pytest

from app.llm_proxy.providers.elevenlabs_media_provider import ElevenLabsMediaProvider


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_generate_text_to_dialogue_sends_all_supported_convert_parameters():
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=b"audio", headers={"content-type": "audio/mpeg"})

    provider = ElevenLabsMediaProvider(api_key="secret-key")
    await provider.client.aclose()
    provider.client = _client(handler)
    try:
        result = await provider.generate_text_to_dialogue({
            "inputs": [
                {"text": "[giggling] Knock knock", "voice_id": "voice-1"},
                {"text": "[curious] Who is there?", "voice_id": "voice-2"},
            ],
            "model_id": "eleven_v3",
            "language_code": "th",
            "stability": 0.42,
            "pronunciation_dictionary_locators": [
                {"pronunciation_dictionary_id": "dict-1", "version_id": "ver-1"},
            ],
            "seed": 123456,
            "apply_text_normalization": "on",
            "output_format": "mp3_44100_128",
        })
    finally:
        await provider.aclose()

    assert result.capability == "text_to_dialogue"
    assert requests[0].method == "POST"
    assert requests[0].url == httpx.URL(
        "https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128"
    )
    assert requests[0].headers["xi-api-key"] == "secret-key"
    body = json.loads(requests[0].content.decode("utf-8"))
    assert body == {
        "inputs": [
            {"text": "[giggling] Knock knock", "voice_id": "voice-1"},
            {"text": "[curious] Who is there?", "voice_id": "voice-2"},
        ],
        "model_id": "eleven_v3",
        "language_code": "th",
        "settings": {"stability": 0.42},
        "pronunciation_dictionary_locators": [
            {"pronunciation_dictionary_id": "dict-1", "version_id": "ver-1"},
        ],
        "seed": 123456,
        "apply_text_normalization": "on",
    }


@pytest.mark.asyncio
async def test_generate_text_to_dialogue_can_build_single_input_from_text_and_voice_id():
    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        assert body["inputs"] == [{"text": "Hello", "voice_id": "voice-1"}]
        return httpx.Response(200, content=b"audio", headers={"content-type": "audio/mpeg"})

    provider = ElevenLabsMediaProvider(api_key="secret-key")
    await provider.client.aclose()
    provider.client = _client(handler)
    try:
        result = await provider.generate_text_to_dialogue({
            "text": "Hello",
            "voice_id": "voice-1",
        })
    finally:
        await provider.aclose()

    assert result.capability == "text_to_dialogue"
