from app.services.browser_policy_rollout import evaluate_browser_policy_rollback_readiness


def test_browser_policy_rollback_requires_tenant_disablement_first():
    result = evaluate_browser_policy_rollback_readiness(
        {
            "tenant_facing_access_disabled": False,
            "additive_tables_preserved": True,
            "approval_flows_healthy": True,
            "raw_browser_bypass_closed": True,
        }
    )

    assert result["ready"] is False
    assert "tenant_disable_first" in result["failed_checks"]
