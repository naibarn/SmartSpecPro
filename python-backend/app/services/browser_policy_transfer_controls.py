"""Shared iframe and transfer controls for browser policy consumers."""

from __future__ import annotations

from urllib.parse import urlparse

from app.services.browser_policy_contract import BrowserWorkflowEntitlement


def _site_key(hostname: str) -> str:
    parts = [part for part in hostname.lower().split(".") if part]
    if len(parts) <= 2:
        return hostname.lower()

    second_level_suffixes = {"co", "com", "org", "net", "gov", "ac"}
    if len(parts) >= 3 and len(parts[-1]) == 2 and parts[-2] in second_level_suffixes:
        return ".".join(parts[-3:])

    return ".".join(parts[-2:])


def _resolve_origin_trust_tier(
    current_origin: str | None = None,
    target_origin: str | None = None,
) -> str:
    if not current_origin or not target_origin:
        return "cross_site"

    if current_origin == target_origin:
        return "same_origin"

    try:
        current_url = urlparse(current_origin)
        target_url = urlparse(target_origin)
    except ValueError:
        return "cross_site"

    if current_url.scheme == target_url.scheme and current_url.netloc == target_url.netloc:
        return "same_origin"

    if _site_key(current_url.hostname or "") == _site_key(target_url.hostname or ""):
        return "same_site"

    return "cross_site"


def resolve_iframe_trust_tier(
    parent_origin: str | None = None,
    frame_origin: str | None = None,
    sandboxed: bool = False,
) -> str:
    if sandboxed:
        return "sandboxed"

    return _resolve_origin_trust_tier(parent_origin, frame_origin)


def evaluate_browser_transfer_controls(
    *,
    action_type: str,
    action_class: str,
    page_sensitivity: str,
    entitlement: BrowserWorkflowEntitlement,
    current_origin: str | None = None,
    target_origin: str | None = None,
    iframe_trust_tier: str | None = None,
    data_class: str | None = None,
) -> dict[str, object]:
    normalized_action_type = action_type.lower()
    resolved_data_class = (data_class or "internal").lower()
    destination_trust_tier = _resolve_origin_trust_tier(current_origin, target_origin)

    if iframe_trust_tier in {"cross_site", "sandboxed"}:
        if action_class != "read":
            return {"decision": "deny", "reason_codes": ["cross_site_iframe"]}
        return {"reason_codes": ["cross_site_iframe"]}

    if iframe_trust_tier == "same_site" and action_class not in {"read", "draft"}:
        return {
            "decision": "require_approval",
            "reason_codes": ["same_site_iframe_requires_approval"],
        }

    if normalized_action_type == "download" and page_sensitivity != "none":
        data_class_allowed = resolved_data_class in entitlement.allowedDataClasses
        trusted_destination = destination_trust_tier in {"same_origin", "same_site"}
        if not data_class_allowed or not trusted_destination:
            return {"decision": "deny", "reason_codes": ["sensitive_download"]}

    if normalized_action_type == "upload":
        if resolved_data_class not in entitlement.allowedDataClasses:
            return {"decision": "deny", "reason_codes": ["upload_data_class_not_allowed"]}
        if destination_trust_tier == "cross_site":
            return {"decision": "require_approval", "reason_codes": ["external_upload"]}

    if "clipboard" in normalized_action_type:
        restricted_context = page_sensitivity == "sensitive_data" or resolved_data_class == "restricted"
        if restricted_context or destination_trust_tier == "cross_site":
            return {"decision": "deny", "reason_codes": ["clipboard_transfer"]}

    return {"reason_codes": []}
