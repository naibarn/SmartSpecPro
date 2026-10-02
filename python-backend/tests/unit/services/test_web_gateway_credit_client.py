from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.web_gateway_client import WebGatewayClient


@pytest.mark.asyncio
async def test_credit_gateway_serializes_integer_user_id_as_string():
    gateway = WebGatewayClient()
    gateway.enabled = True
    gateway.base_url = "https://gateway.example"
    gateway.token = "test-token"

    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "success": True,
        "transaction_id": "txn-1",
        "balance_before_usd": 2.0,
        "balance_after_usd": 1.9,
        "amount_deducted_usd": 0.1,
    }
    client = AsyncMock()
    client.post = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.web_gateway_client.httpx.AsyncClient", return_value=client):
        result = await gateway.deduct_credits(
            user_id=42,
            amount_usd=0.1,
            description="Image generation",
            request_type="image",
            model="seedream/5-pro-text-to-image",
        )

    assert result is not None
    assert result.transaction_id == "txn-1"
    assert client.post.await_args.kwargs["json"]["user_id"] == "42"
