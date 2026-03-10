from app.services.browser_policy_contract import BrowserWorkflowEntitlement
from app.services.browser_policy_transfer_controls import (
    evaluate_browser_transfer_controls,
    resolve_iframe_trust_tier,
)


def build_entitlement() -> BrowserWorkflowEntitlement:
    return BrowserWorkflowEntitlement.model_validate(
        {
            "tenantId": "tenant-1",
            "workflowId": 42,
            "workflowName": "Iframe QA",
            "allowedDataClasses": ["public", "internal"],
            "config": {"approvalTtlSeconds": 300},
        }
    )


def test_same_site_subdomains_are_classified_as_same_site():
    assert (
        resolve_iframe_trust_tier(
            parent_origin="https://app.example.com",
            frame_origin="https://docs.example.com",
        )
        == "same_site"
    )


def test_same_site_commit_like_iframe_actions_require_approval():
    result = evaluate_browser_transfer_controls(
        action_type="upload",
        action_class="restricted",
        page_sensitivity="none",
        current_origin="https://app.example.com",
        target_origin="https://docs.example.com",
        data_class="internal",
        iframe_trust_tier="same_site",
        entitlement=build_entitlement(),
    )

    assert result == {
        "decision": "require_approval",
        "reason_codes": ["same_site_iframe_requires_approval"],
    }


def test_cross_site_iframes_are_capped_at_read_only():
    result = evaluate_browser_transfer_controls(
        action_type="fill",
        action_class="draft",
        page_sensitivity="none",
        iframe_trust_tier="cross_site",
        entitlement=build_entitlement(),
    )

    assert result == {"decision": "deny", "reason_codes": ["cross_site_iframe"]}
