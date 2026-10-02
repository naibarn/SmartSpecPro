"""Tests for TokenBudgetTracker and ConcurrentRunLimiter."""

from app.services.agentic_cost_controls import TokenBudgetTracker


# ── TokenBudgetTracker Tests ──


def test_under_budget_not_exceeded():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(1000)
    assert t.is_exceeded() is False


def test_over_budget_exceeded():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(51000)
    assert t.is_exceeded() is True


def test_cumulative_usage_tracking():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(20000)
    t.record_usage(20000)
    assert t.total_tokens == 40000
    assert t.is_exceeded() is False
    t.record_usage(15000)
    assert t.is_exceeded() is True


def test_warning_at_80_threshold():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(40000)
    assert t.should_warn() is True
    assert t.is_exceeded() is False


def test_warning_not_triggered_below_80():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(39000)
    assert t.should_warn() is False


def test_warning_fires_only_once():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(40000)
    assert t.should_warn() is True
    assert t.should_warn() is False


def test_get_status_returns_correct_dict():
    t = TokenBudgetTracker(budget=50000)
    t.record_usage(25000)
    status = t.get_status()
    assert status["used_tokens"] == 25000
    assert status["budget"] == 50000
    assert status["used_pct"] == 50.0
    assert status["is_exceeded"] is False


def test_zero_budget_means_unlimited():
    t = TokenBudgetTracker(budget=0)
    t.record_usage(999999)
    assert t.is_exceeded() is False
    assert t.should_warn() is False
