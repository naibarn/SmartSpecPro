from app.services.browser_policy_rollout import evaluate_browser_policy_rollout_gate


def test_browser_policy_rollout_gate_enforces_observe_to_read_only_thresholds():
    result = evaluate_browser_policy_rollout_gate(
        "observe_to_read_only",
        {
            "observed_days": 10,
            "total_decisions": 9000,
            "reviewed_sample_size": 420,
            "precision": 0.97,
            "false_positive_rate": 0.02,
            "false_negative_rate": 0.03,
            "stable_days": 5,
            "p0p1_misses": 1,
        },
    )

    assert result["passed"] is False
    assert "minimum_observed_days" in result["failed_checks"]
    assert "minimum_total_decisions" in result["failed_checks"]

