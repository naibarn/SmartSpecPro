"""Tests for agency context budget manager."""

from __future__ import annotations

import pytest

from app.services.agency_context_budget import (
    COMPLETION_RESERVE_RATIO,
    CONTEXT_BUDGET_RATIO,
    DEFAULT_CONTEXT_LIMIT,
    MIN_COMPLETION_RESERVE_TOKENS,
    MODEL_CONTEXT_LIMITS,
    ContextBudgetManager,
)


def test_known_model_budget_uses_context_ratio():
    manager = ContextBudgetManager("gpt-4o")
    assert manager.total_budget == int(128000 * CONTEXT_BUDGET_RATIO)
    assert manager.input_budget == manager.total_budget - manager.completion_reserve_tokens
    assert manager.remaining == manager.input_budget


def test_partial_model_match_uses_claude_limit():
    manager = ContextBudgetManager("claude-3-sonnet-20260101")
    assert manager.total_budget == int(200000 * CONTEXT_BUDGET_RATIO)


def test_unknown_model_uses_default_limit():
    manager = ContextBudgetManager("some-unknown-model-xyz")
    assert manager.total_budget == int(DEFAULT_CONTEXT_LIMIT * CONTEXT_BUDGET_RATIO)


def test_completion_reserve_tracked_separately():
    manager = ContextBudgetManager("gpt-4o")
    assert manager.completion_reserve_tokens == max(
        MIN_COMPLETION_RESERVE_TOKENS,
        int(128000 * COMPLETION_RESERVE_RATIO),
    )
    assert manager.input_budget < manager.total_budget


def test_estimate_tokens_uses_four_char_heuristic():
    manager = ContextBudgetManager("gpt-4o")
    assert manager.estimate_tokens("") == 1
    assert manager.estimate_tokens("hello world") == len("hello world") // 4 + 1
    assert manager.estimate_tokens("a" * 100) == 26


def test_allocate_returns_full_text_when_budget_allows():
    manager = ContextBudgetManager("gpt-4o")
    result = manager.allocate("short text", "test_label")
    assert result == "short text"
    assert manager.allocations == [("test_label", manager.estimate_tokens("short text"))]


def test_allocate_truncates_when_text_exceeds_budget():
    manager = ContextBudgetManager("some-unknown-model")
    result = manager.allocate("x" * 200000, "big_block")
    assert result is not None
    assert len(result) < 200000
    assert result.endswith(" [truncated to fit context budget]")


def test_allocate_returns_none_when_budget_is_too_small():
    manager = ContextBudgetManager("some-unknown-model")
    manager.used_tokens = manager.total_budget - 10
    assert manager.allocate("x" * 100, "overflow") is None


def test_can_fit_tracks_state_after_allocation():
    manager = ContextBudgetManager("gpt-4o")
    assert manager.can_fit(1000) is True
    manager.allocate("x" * 300000, "big")
    assert manager.can_fit(manager.remaining + 1) is False


def test_model_limits_dictionary_contains_expected_keys():
    assert MODEL_CONTEXT_LIMITS["gpt-4o"] == 128000
    assert MODEL_CONTEXT_LIMITS["claude-3-5-sonnet"] == 200000
