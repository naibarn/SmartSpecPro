from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import AudioGenerationRequest


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
        gw._upload_generated_media_bytes = AsyncMock(return_value="https://cdn.example.com/omnivoice.wav")
        return gw


@pytest.mark.asyncio
async def test_generate_audio_routes_to_omnivoice_with_clone_fields(gateway):
    request = AudioGenerationRequest(
        model="omnivoice-tts",
        text="hello world",
        outputFormat="wav",
        apiConfig={"provider": "omnivoice"},
        extraParams={
            "reference_audio_base64": "YmFzZTY0LWZpbGU=",
            "reference_text": "hello world reference",
            "instruct": "warm and calm voice",
        },
    )
    user = MagicMock(id=1)

    omnivoice_client = MagicMock()
    omnivoice_client.generate_speech = AsyncMock(return_value=b"fake-audio-bytes")
    omnivoice_client.aclose = AsyncMock()
    gateway.unified_client.omnivoice_client = omnivoice_client

    response = await gateway.generate_audio(request, user)

    assert response.provider == "omnivoice"
    assert response.data == [{"url": "https://cdn.example.com/omnivoice.wav"}]
    omnivoice_client.generate_speech.assert_awaited_once_with(
        text="hello world",
        voice=None,
        speed=1.0,
        response_format="wav",
        instruct="warm and calm voice",
        reference_audio_base64="YmFzZTY0LWZpbGU=",
        reference_audio_url=None,
        reference_text="hello world reference",
    )
