"""Tests for AgencyCreditManager."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from decimal import Decimal

import httpx

pytestmark = [pytest.mark.unit, pytest.mark.agency, pytest.mark.credits]


class TestAgencyCreditPreCheck:
    """Tests for AgencyCreditManager.pre_check()."""

    async def test_pre_check_sufficient_credits(self):
        """pre_check returns True when user has enough credits."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(
            gateway_url="http://localhost:3000",
            gateway_token="test-token",
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"balance": 100.0}

        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await mgr.pre_check(user_id=1, estimated_cost=10.0)
            assert result is True

    async def test_pre_check_insufficient_credits(self):
        """pre_check returns False when user has insufficient credits."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(
            gateway_url="http://localhost:3000",
            gateway_token="test-token",
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"balance": 5.0}

        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            result = await mgr.pre_check(user_id=1, estimated_cost=10.0)
            assert result is False

    async def test_pre_check_gateway_down_returns_true(self):
        """pre_check returns True (optimistic) when gateway is unreachable."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(
            gateway_url="http://localhost:3000",
            gateway_token="test-token",
        )

        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
            mock_client_cls.return_value = mock_client

            result = await mgr.pre_check(user_id=1, estimated_cost=10.0)
            assert result is True  # Optimistic: allow the run

    async def test_pre_check_no_gateway_url_returns_true(self):
        """pre_check returns True when gateway URL not configured."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(gateway_url="", gateway_token="")
        result = await mgr.pre_check(user_id=1, estimated_cost=10.0)
        assert result is True


class TestAgencyCreditMultiplier:
    """Tests for AgencyCreditManager.apply_multiplier_markup()."""

    async def test_markup_calculation(self):
        """1.5x multiplier on $10 gateway cost = $5 markup."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(
            gateway_url="http://localhost:3000",
            gateway_token="test-token",
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"success": True}

        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            await mgr.apply_multiplier_markup(
                user_id=1,
                agency_id="agency-1",
                total_gateway_cost=10.0,
                multiplier=1.5,
            )

            # Verify the POST was called with markup = 5.0
            call_kwargs = mock_client.post.call_args
            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            assert payload["markupAmount"] == pytest.approx(5.0)

    async def test_markup_with_unity_multiplier(self):
        """Multiplier of 1.0 results in no HTTP call (no-op)."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(
            gateway_url="http://localhost:3000",
            gateway_token="test-token",
        )

        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            await mgr.apply_multiplier_markup(
                user_id=1,
                agency_id="agency-1",
                total_gateway_cost=10.0,
                multiplier=1.0,
            )

            # With multiplier=1.0, no HTTP call should be made
            mock_client.post.assert_not_called()

    async def test_markup_failure_does_not_raise(self):
        """Markup HTTP failure logs error but does not raise."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(
            gateway_url="http://localhost:3000",
            gateway_token="test-token",
        )

        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            mock_client_cls.return_value = mock_client

            # Should not raise
            await mgr.apply_multiplier_markup(
                user_id=1,
                agency_id="agency-1",
                total_gateway_cost=10.0,
                multiplier=1.5,
            )


class TestAgencyCreditEstimate:
    """Tests for AgencyCreditManager.estimate_run_cost()."""

    def test_estimate_is_conservative(self):
        """Estimate based on agent count and model produces non-zero value."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(gateway_url="", gateway_token="")
        estimate = mgr.estimate_run_cost(agent_count=3)
        assert estimate > 0

    def test_estimate_scales_with_agents(self):
        """More agents = higher estimate."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(gateway_url="", gateway_token="")
        est_2 = mgr.estimate_run_cost(agent_count=2)
        est_5 = mgr.estimate_run_cost(agent_count=5)
        assert est_5 > est_2


class TestAgencyCreditFailure:
    """Tests for credit handling on run failure."""

    async def test_failed_run_charges_only_completed(self):
        """Failed run: markup only applies to actual gateway cost incurred."""
        from app.services.agency_credits import AgencyCreditManager

        mgr = AgencyCreditManager(
            gateway_url="http://localhost:3000",
            gateway_token="test-token",
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"success": True}

        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            # Only $2 of gateway cost was incurred before failure
            await mgr.apply_multiplier_markup(
                user_id=1,
                agency_id="agency-1",
                total_gateway_cost=2.0,
                multiplier=1.5,
            )

            call_kwargs = mock_client.post.call_args
            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
            # Markup = 2.0 * 1.5 - 2.0 = 1.0
            assert payload["markupAmount"] == pytest.approx(1.0)
