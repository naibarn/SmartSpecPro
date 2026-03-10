from app.services.browser_policy_contract import (
    BrowserApprovalContextSnapshot,
    BrowserApprovalPayload,
    validate_browser_approval_context,
)


def test_browser_approval_payload_persists_required_fields():
    payload = BrowserApprovalPayload.model_validate(
        {
            "actionDescription": "Upload report.csv",
            "actionDigest": "digest-123",
            "payloadPreviewHash": "preview-123",
            "domFingerprint": "dom-123",
            "screenshotHash": "shot-123",
            "targetOrigin": "https://example.com",
            "executionId": "exec-123",
            "reasonCodes": ["restricted_action"],
            "approvalTtlSeconds": 300,
        }
    )

    assert payload.actionDigest == "digest-123"
    assert payload.domFingerprint == "dom-123"
    assert payload.screenshotHash == "shot-123"


def test_browser_approval_context_change_emits_expected_reason():
    valid, reason = validate_browser_approval_context(
        stored=BrowserApprovalContextSnapshot(
            actionDigest="digest-123",
            domFingerprint="dom-123",
            targetOrigin="https://example.com",
        ),
        observed=BrowserApprovalContextSnapshot(
            actionDigest="digest-123",
            domFingerprint="dom-456",
            targetOrigin="https://example.com",
        ),
        dom_drift=0.3,
    )

    assert valid is False
    assert reason == "approval_context_changed"
