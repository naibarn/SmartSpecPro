"""Tests for agentic_strategies.py — planning prompt templates."""

import pytest


@pytest.mark.unit
def test_basic_strategy_template_exists():
    """get_planning_prompt('basic', 3) returns non-empty string."""
    from app.services.agentic_strategies import get_planning_prompt

    result = get_planning_prompt("basic", 3)
    assert isinstance(result, str)
    assert len(result) > 50


@pytest.mark.unit
def test_cot_strategy_template_exists():
    """get_planning_prompt('cot', 3) returns non-empty string."""
    from app.services.agentic_strategies import get_planning_prompt

    result = get_planning_prompt("cot", 3)
    assert isinstance(result, str)
    assert len(result) > 50


@pytest.mark.unit
def test_react_strategy_template_exists():
    """get_planning_prompt('react', 3) returns non-empty string."""
    from app.services.agentic_strategies import get_planning_prompt

    result = get_planning_prompt("react", 3)
    assert isinstance(result, str)
    assert len(result) > 50


@pytest.mark.unit
def test_unknown_strategy_raises():
    """get_planning_prompt('unknown', 3) raises ValueError."""
    from app.services.agentic_strategies import get_planning_prompt

    with pytest.raises(ValueError, match="Unknown planning strategy"):
        get_planning_prompt("unknown", 3)


@pytest.mark.unit
def test_cycle_count_injected():
    """Template contains the max_cycles value."""
    from app.services.agentic_strategies import get_planning_prompt

    result = get_planning_prompt("basic", 7)
    assert "7" in result


@pytest.mark.unit
def test_all_templates_contain_completion_instruction():
    """Every template mentions structured JSON completion signal."""
    from app.services.agentic_strategies import get_planning_prompt

    for strategy in ("basic", "cot", "react"):
        result = get_planning_prompt(strategy, 3)
        assert '"complete"' in result or "complete" in result.lower(), (
            f"Strategy '{strategy}' missing completion instruction"
        )
        assert "answer" in result.lower(), (
            f"Strategy '{strategy}' missing answer instruction"
        )
