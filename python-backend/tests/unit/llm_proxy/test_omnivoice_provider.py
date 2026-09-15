import base64

import httpx
import pytest

from app.llm_proxy.providers.omnivoice_provider import OmniVoiceProvider


def _provider(handler):
    provider = OmniVoiceProvider("https://omnivoice.example", api_key="test-key")
    provider.client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        follow_redirects=False,
    )
    return provider


@pytest.mark.asyncio
async def test_reference_audio_url_uses_strict_direct_reference_policy():
    provider = _provider(lambda request: httpx.Response(200, content=b"audio", request=request))
    try:
        with pytest.raises(ValueError, match="MEDIA_REFERENCE_REQUIRES_UPLOAD"):
            await provider.generate_speech(
                text="hello",
                reference_audio_url="https://managed.example/api/storage/files/ref.wav?token=secret",
            )
    finally:
        await provider.aclose()


@pytest.mark.asyncio
async def test_result_redirect_to_private_target_is_rejected():
    calls = []

    def handler(request):
        calls.append(str(request.url))
        if request.url.path == "/tts":
            return httpx.Response(
                200,
                json={"audio_url": "https://1.1.1.1/result.wav"},
                request=request,
            )
        return httpx.Response(
            302,
            headers={"location": "http://169.254.169.254/latest/meta-data"},
            request=request,
        )

    provider = _provider(handler)
    try:
        with pytest.raises(ValueError):
            await provider.generate_speech(text="hello")
        assert calls == ["https://omnivoice.example/tts", "https://1.1.1.1/result.wav"]
    finally:
        await provider.aclose()


@pytest.mark.asyncio
async def test_base64_provider_result_is_decoded_without_url_fetch():
    encoded = base64.b64encode(b"audio-bytes").decode("ascii")

    def handler(request):
        return httpx.Response(200, json={"audio_base64": encoded}, request=request)

    provider = _provider(handler)
    try:
        assert await provider.generate_speech(text="hello") == b"audio-bytes"
    finally:
        await provider.aclose()
