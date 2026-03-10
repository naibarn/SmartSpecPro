"""Fail-closed incident controls for browser policy enforcement."""

from __future__ import annotations

from urllib.parse import urlparse


def _extract_hostname(target_origin: str) -> str:
    try:
        return (urlparse(target_origin).hostname or target_origin).lower()
    except ValueError:
        return target_origin.lower()


def evaluate_browser_policy_incident_controls(
    *,
    target_origin: str,
    page_sensitivity: str,
    workflow_enabled: bool,
    global_kill_switch_enabled: bool = False,
    tenant_kill_switch_enabled: bool = False,
    approval_revoked: bool = False,
    emergency_denied_domains: list[str] | None = None,
    emergency_denied_page_sensitivities: list[str] | None = None,
) -> dict[str, object]:
    if global_kill_switch_enabled:
        return {"allowed": False, "reason_code": "global_kill_switch"}

    if tenant_kill_switch_enabled:
        return {"allowed": False, "reason_code": "tenant_kill_switch"}

    if not workflow_enabled:
        return {"allowed": False, "reason_code": "workflow_disabled"}

    if approval_revoked:
        return {"allowed": False, "reason_code": "approval_revoked"}

    hostname = _extract_hostname(target_origin)
    if hostname in {domain.lower() for domain in emergency_denied_domains or []}:
        return {"allowed": False, "reason_code": "emergency_domain_override"}

    if page_sensitivity in set(emergency_denied_page_sensitivities or []):
        return {"allowed": False, "reason_code": "emergency_category_override"}

    return {"allowed": True}
