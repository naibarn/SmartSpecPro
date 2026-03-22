"""Tests for agentic_limits.py — platform-wide hard caps."""

import importlib
import os

import pytest


@pytest.mark.unit
def test_all_limits_have_defaults():
    """Every MAX_* constant has a positive integer default."""
    from app.services.agentic_limits import (
        MAX_DELEGATION_DEPTH,
        MAX_MEMORIES_PER_AGENT,
        MAX_MEMORY_CONTENT_LENGTH,
        MAX_PLAN_DEPTH,
        MAX_REACT_ITERATIONS,
        MAX_REFLECTION_CYCLES,
        MAX_TOKENS_BUDGET,
        MAX_TOKENS_PER_ITERATION,
        MAX_TOTAL_ITERATIONS,
    )

    for name, val in [
        ("MAX_REFLECTION_CYCLES", MAX_REFLECTION_CYCLES),
        ("MAX_REACT_ITERATIONS", MAX_REACT_ITERATIONS),
        ("MAX_TOKENS_BUDGET", MAX_TOKENS_BUDGET),
        ("MAX_TOKENS_PER_ITERATION", MAX_TOKENS_PER_ITERATION),
        ("MAX_PLAN_DEPTH", MAX_PLAN_DEPTH),
        ("MAX_TOTAL_ITERATIONS", MAX_TOTAL_ITERATIONS),
        ("MAX_DELEGATION_DEPTH", MAX_DELEGATION_DEPTH),
        ("MAX_MEMORY_CONTENT_LENGTH", MAX_MEMORY_CONTENT_LENGTH),
        ("MAX_MEMORIES_PER_AGENT", MAX_MEMORIES_PER_AGENT),
    ]:
        assert isinstance(val, int), f"{name} should be int"
        assert val > 0, f"{name} should be positive"


@pytest.mark.unit
def test_limits_read_from_env(monkeypatch):
    """MAX_REFLECTION_CYCLES reads from SSP_MAX_REFLECTION_CYCLES env var."""
    import app.services.agentic_limits as mod

    monkeypatch.setenv("SSP_MAX_REFLECTION_CYCLES", "7")
    importlib.reload(mod)

    try:
        assert mod.MAX_REFLECTION_CYCLES == 7
    finally:
        # Restore module to default state
        monkeypatch.delenv("SSP_MAX_REFLECTION_CYCLES")
        importlib.reload(mod)


@pytest.mark.unit
def test_clamp_user_value_to_max():
    """clamp_to_limit(user_value=999, limit=10) returns 10."""
    from app.services.agentic_limits import clamp_to_limit

    assert clamp_to_limit(999, 10) == 10
    assert clamp_to_limit(5, 10) == 5
    assert clamp_to_limit(0, 10) == 0
    assert clamp_to_limit(-1, 10) == 0  # negative clamped to 0
