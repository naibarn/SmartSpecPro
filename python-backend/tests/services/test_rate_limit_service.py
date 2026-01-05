import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.rate_limit_service import RateLimitService
from app.models.credit import SystemConfig

@pytest.mark.asyncio
async def test_load_and_get_limits(test_db: AsyncSession, mock_redis):
    """Test that rate limits are correctly loaded from SystemConfig and retrieved."""
    # Arrange
    configs = [
        SystemConfig(key="rate_limit_default_limit", value="100"),
        SystemConfig(key="rate_limit_default_window", value="60"),
        SystemConfig(key="rate_limit_llm_limit", value="20"),
        SystemConfig(key="rate_limit_llm_window", value="120"),
    ]
    test_db.add_all(configs)
    await test_db.commit()

    # Act
    service = RateLimitService(test_db)
    default_limit = await service._get_limit_for_scope("default")
    llm_limit = await service._get_limit_for_scope("llm")
    non_existent_limit = await service._get_limit_for_scope("non_existent")

    # Assert
    assert default_limit.requests == 100
    assert default_limit.seconds == 60
    assert llm_limit.requests == 20
    assert llm_limit.seconds == 120
    assert non_existent_limit.requests == 60  # Check fallback to default
    assert non_existent_limit.seconds == 60

@pytest.mark.asyncio
async def test_check_rate_limit_logic(test_db: AsyncSession, mock_redis):
    """Test the core logic of checking and incrementing rate limits."""
    # Arrange
    configs = [SystemConfig(key="rate_limit_test_limit", value="5"), SystemConfig(key="rate_limit_test_window", value="10")]
    test_db.add_all(configs)
    await test_db.commit()

    service = RateLimitService(test_db)
    user_id = "test-user-rate-limit"
    scope = "test"

    # Act & Assert: Consume the limit
    for i in range(5):
        allowed, remaining, _ = await service.check_rate_limit(user_id, scope)
        assert allowed is True
        assert remaining == 4 - i

    # Assert: Next request is denied
    allowed, remaining, reset_time = await service.check_rate_limit(user_id, scope)
    assert allowed is False
    assert remaining == 0
    assert reset_time > 0
