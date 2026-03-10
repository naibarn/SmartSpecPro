from app.services.browser_policy_incident_controls import (
    evaluate_browser_policy_incident_controls,
)


def test_browser_policy_incident_controls_fail_closed_on_kill_switches():
    assert evaluate_browser_policy_incident_controls(
        target_origin="https://app.example.com",
        page_sensitivity="none",
        workflow_enabled=True,
        global_kill_switch_enabled=True,
    ) == {"allowed": False, "reason_code": "global_kill_switch"}

    assert evaluate_browser_policy_incident_controls(
        target_origin="https://app.example.com",
        page_sensitivity="none",
        workflow_enabled=False,
    ) == {"allowed": False, "reason_code": "workflow_disabled"}


def test_browser_policy_incident_controls_fail_closed_on_revocation_and_emergency_overrides():
    assert evaluate_browser_policy_incident_controls(
        target_origin="https://danger.example.com",
        page_sensitivity="none",
        workflow_enabled=True,
        emergency_denied_domains=["danger.example.com"],
    ) == {"allowed": False, "reason_code": "emergency_domain_override"}

    assert evaluate_browser_policy_incident_controls(
        target_origin="https://app.example.com",
        page_sensitivity="none",
        workflow_enabled=True,
        approval_revoked=True,
    ) == {"allowed": False, "reason_code": "approval_revoked"}
