from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import VideoGenerationRequest


@pytest.mark.asyncio
async def test_estimate_cost_uses_flat_pricing_field_value_from_extra_params():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchone.return_value = (
        2000,
        {
            "pricingFormula": "flat",
            "pricingTiers": {
                "default": 2000,
                "veo3_lite": 300,
                "veo3_fast": 800,
            },
            "inputFields": [
                {"key": "model", "affectsPricing": True},
            ],
        },
    )
    mock_db.execute = AsyncMock(return_value=mock_result)

    with patch("app.llm_proxy.gateway_unified.LLMProxy"), \
         patch("app.llm_proxy.gateway_unified.get_unified_client"), \
         patch("app.llm_proxy.gateway_unified.CreditService"), \
         patch("app.llm_proxy.gateway_unified.get_gateway_client"):
        gateway = LLMGateway(mock_db)

    request = VideoGenerationRequest(
        model="veo3/generate-veo-3-video",
        prompt="A cinematic waterfall",
        extraParams={"model": "veo3_lite"},
    )

    cost = await gateway._estimate_cost(request, False)

    assert cost == Decimal("0.3")


@pytest.mark.asyncio
async def test_generate_video_skips_duplicate_billing_when_reserved_credits_exist():
    mock_db = AsyncMock()

    with patch("app.llm_proxy.gateway_unified.LLMProxy"), \
         patch("app.llm_proxy.gateway_unified.get_unified_client"), \
         patch("app.llm_proxy.gateway_unified.CreditService"), \
         patch("app.llm_proxy.gateway_unified.get_gateway_client"):
        gateway = LLMGateway(mock_db)

    gateway._estimate_cost = AsyncMock(return_value=Decimal("2.0"))
    gateway._check_credits = AsyncMock()
    gateway._deduct_credits = AsyncMock()
    gateway._resolve_media_provider = AsyncMock(return_value="kie_ai")
    gateway.unified_client.kie_ai_client = MagicMock(
        generate_video=AsyncMock(
            return_value={
                "id": "provider-task-1",
                "created": 0,
                "data": [],
            }
        )
    )

    request = VideoGenerationRequest(
        model="veo3/generate-veo-3-video",
        prompt="A cinematic waterfall",
        apiConfig={"provider": "kie.ai"},
        extraParams={
            "__reserved_credits": 300,
            "model": "veo3_lite",
        },
    )

    response = await gateway.generate_video(request, MagicMock(id=1), wait_for_completion=False)

    gateway._estimate_cost.assert_not_awaited()
    gateway._check_credits.assert_not_awaited()
    gateway._deduct_credits.assert_not_awaited()
    gateway.unified_client.kie_ai_client.generate_video.assert_awaited_once()
    assert response.provider == "kie_ai"
    assert response.credits_used == Decimal("300")
