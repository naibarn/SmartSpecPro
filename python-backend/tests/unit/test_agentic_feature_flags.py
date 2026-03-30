"""Tests for agentic feature flag checker."""

import pytest
from unittest.mock import AsyncMock, patch

from app.services.agentic_feature_flags import (
    AGENTIC_FLAG_DEFAULTS,
    AGENTIC_FLAGS,
    check_agentic_flag,
)


# ── Flag defaults ─────────────────────────────────────────────────


def test_agentic_flag_defaults_has_four_entries():
    assert len(AGENTIC_FLAG_DEFAULTS) == 4


def test_agentic_mode_default_is_true():
    assert AGENTIC_FLAG_DEFAULTS["agencyAgenticModeEnabled"] is True


def test_react_executor_default_is_false():
    assert AGENTIC_FLAG_DEFAULTS["agencyReactExecutorEnabled"] is False


def test_autonomous_agent_default_is_false():
    assert AGENTIC_FLAG_DEFAULTS["agencyAutonomousAgentEnabled"] is False


def test_long_term_memory_default_is_false():
    assert AGENTIC_FLAG_DEFAULTS["agencyLongTermMemoryEnabled"] is False


def test_agentic_flags_set_matches_defaults():
    assert AGENTIC_FLAGS == set(AGENTIC_FLAG_DEFAULTS.keys())


# ── Flag validation ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unknown_flag_raises_value_error():
    with pytest.raises(ValueError, match="Unknown agentic flag"):
        await check_agentic_flag("nonExistentFlag", "tenant123")


# ── Redis reads ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reads_tenant_scoped_flag_from_redis():
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value="true")

    with patch("app.services.agentic_feature_flags.get_redis", return_value=mock_redis):
        result = await check_agentic_flag("agencyAgenticModeEnabled", "tenant123")

    assert result is True
    mock_redis.get.assert_called_once_with("feature-flag:agencyAgenticModeEnabled:tenant123")


@pytest.mark.asyncio
async def test_reads_tenant_scoped_flag_false():
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value="false")

    with patch("app.services.agentic_feature_flags.get_redis", return_value=mock_redis):
        result = await check_agentic_flag("agencyAgenticModeEnabled", "tenant123")

    assert result is False


@pytest.mark.asyncio
async def test_falls_back_to_global_flag():
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(side_effect=[None, "true"])

    with patch("app.services.agentic_feature_flags.get_redis", return_value=mock_redis):
        result = await check_agentic_flag("agencyReactExecutorEnabled", "tenant123")

    assert result is True
    assert mock_redis.get.call_count == 2
    mock_redis.get.assert_any_call("feature-flag:agencyReactExecutorEnabled:tenant123")
    mock_redis.get.assert_any_call("feature-flag:agencyReactExecutorEnabled")


@pytest.mark.asyncio
async def test_falls_back_to_default_when_redis_empty():
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    with patch("app.services.agentic_feature_flags.get_redis", return_value=mock_redis):
        result = await check_agentic_flag("agencyReactExecutorEnabled", "tenant123")

    assert result is False  # default for agencyReactExecutorEnabled


@pytest.mark.asyncio
async def test_returns_default_on_redis_failure():
    with patch("app.services.agentic_feature_flags.get_redis", side_effect=Exception("Connection refused")):
        result = await check_agentic_flag("agencyAgenticModeEnabled", "tenant123")

    assert result is True  # default for agencyAgenticModeEnabled


@pytest.mark.asyncio
async def test_fail_closed_for_react_on_redis_failure():
    with patch("app.services.agentic_feature_flags.get_redis", side_effect=Exception("Connection refused")):
        result = await check_agentic_flag("agencyReactExecutorEnabled", "tenant123")

    assert result is False


@pytest.mark.asyncio
async def test_fail_open_for_agentic_mode_on_redis_failure():
    with patch("app.services.agentic_feature_flags.get_redis", side_effect=Exception("Connection refused")):
        result = await check_agentic_flag("agencyAgenticModeEnabled", "tenant123")

    assert result is True


@pytest.mark.asyncio
async def test_returns_default_when_redis_is_none():
    with patch("app.services.agentic_feature_flags.get_redis", return_value=None):
        result = await check_agentic_flag("agencyAutonomousAgentEnabled", "tenant123")

    assert result is False
