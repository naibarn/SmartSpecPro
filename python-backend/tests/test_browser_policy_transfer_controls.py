from app.services.browser_policy_contract import BrowserWorkflowEntitlement
from app.services.browser_policy_transfer_controls import (
    evaluate_browser_transfer_controls,
)


def build_entitlement() -> BrowserWorkflowEntitlement:
    return BrowserWorkflowEntitlement.model_validate(
        {
            "tenantId": "tenant-1",
            "workflowId": 42,
            "workflowName": "Transfer QA",
            "allowedDataClasses": ["public", "internal", "confidential"],
            "config": {
                "approvalTtlSeconds": 300,
                "maxExtractedRecords": 100,
                "maxExternalSends": 2,
                "maxOriginTransitions": 3,
                "maxNonReadActions": 5,
            },
        }
    )


def test_sensitive_download_is_denied_without_explicit_data_class_allowance():
    result = evaluate_browser_transfer_controls(
        action_type="download",
        action_class="restricted",
        page_sensitivity="sensitive_data",
        current_origin="https://app.example.com",
        target_origin="https://app.example.com",
        data_class="restricted",
        entitlement=build_entitlement(),
    )

    assert result == {"decision": "deny", "reason_codes": ["sensitive_download"]}


def test_external_upload_requires_approval_when_the_data_class_is_allowed():
    result = evaluate_browser_transfer_controls(
        action_type="upload",
        action_class="restricted",
        page_sensitivity="none",
        current_origin="https://app.example.com",
        target_origin="https://partner.example.net",
        data_class="internal",
        entitlement=build_entitlement(),
    )

    assert result == {
        "decision": "require_approval",
        "reason_codes": ["external_upload"],
    }


def test_clipboard_transfer_to_untrusted_destination_is_denied():
    result = evaluate_browser_transfer_controls(
        action_type="clipboard_write",
        action_class="restricted",
        page_sensitivity="sensitive_data",
        current_origin="https://app.example.com",
        target_origin="https://external.example.org",
        data_class="restricted",
        entitlement=build_entitlement(),
    )

    assert result == {"decision": "deny", "reason_codes": ["clipboard_transfer"]}
