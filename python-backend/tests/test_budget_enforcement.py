"""
Tests for budget enforcement system.

Tests credit reservation, finalization, and budget alerts.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.budget import (
    BudgetExceededError,
    check_budget_before_step,
    finalize_budget_after_step,
)


@pytest.mark.unit
def test_budget_exceeded_error_can_be_raised():
    """Test that BudgetExceededError can be raised"""
    with pytest.raises(BudgetExceededError):
        raise BudgetExceededError("Test error")


@pytest.mark.unit
def test_budget_exceeded_error_message():
    """Test BudgetExceededError has message"""
    error = BudgetExceededError("Insufficient credits")
    assert str(error) == "Insufficient credits"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_check_budget_rejects_negative_cost():
    """Test that check_budget_before_step rejects negative cost"""
    mock_session = AsyncMock()

    with pytest.raises(ValueError, match="Invalid estimated_cost_credits.*must be >= 0"):
        await check_budget_before_step(
            session=mock_session,
            user_id=1,
            execution_id="test-exec",
            step_id="test-step",
            estimated_cost_credits=-100
        )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_finalize_budget_rejects_negative_estimated():
    """Test that finalize_budget_after_step rejects negative estimated cost"""
    mock_session = AsyncMock()

    with pytest.raises(ValueError, match="Invalid estimated_cost.*must be >= 0"):
        await finalize_budget_after_step(
            session=mock_session,
            user_id=1,
            execution_id="test-exec",
            estimated_cost=-50,
            actual_cost=100
        )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_finalize_budget_rejects_negative_actual():
    """Test that finalize_budget_after_step rejects negative actual cost"""
    mock_session = AsyncMock()

    with pytest.raises(ValueError, match="Invalid actual_cost.*must be >= 0"):
        await finalize_budget_after_step(
            session=mock_session,
            user_id=1,
            execution_id="test-exec",
            estimated_cost=100,
            actual_cost=-50
        )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_finalize_budget_rejects_excessive_actual_cost():
    """Test that finalize_budget_after_step rejects actual cost > 10x estimated"""
    mock_session = AsyncMock()

    with pytest.raises(ValueError, match="Actual cost.*exceeds 10x estimate"):
        await finalize_budget_after_step(
            session=mock_session,
            user_id=1,
            execution_id="test-exec",
            estimated_cost=10,
            actual_cost=101  # More than 10x
        )


# Placeholder for integration tests requiring database
@pytest.mark.skip(reason="Requires database and User model setup")
class TestBudgetEnforcementIntegration:
    """Integration tests for budget enforcement"""

    @pytest.mark.asyncio
    async def test_check_budget_passes_with_credits(self):
        """Test budget check passes when user has credits"""
        pass

    @pytest.mark.asyncio
    async def test_check_budget_fails_without_credits(self):
        """Test budget check fails when user lacks credits"""
        pass

    @pytest.mark.asyncio
    async def test_budget_reservation_and_finalization(self):
        """Test two-phase commit: reserve then finalize"""
        pass
