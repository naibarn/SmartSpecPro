from app.services.browser_policy_contract import (
    BrowserApprovalContextSnapshot,
    validate_browser_approval_context,
)


def test_browser_approval_resume_fails_closed_when_revoked():
    valid, reason = validate_browser_approval_context(
        stored=BrowserApprovalContextSnapshot(
            actionDigest="digest-123",
            domFingerprint="dom-123",
            targetOrigin="https://example.com",
        ),
        observed=BrowserApprovalContextSnapshot(
            actionDigest="digest-123",
            domFingerprint="dom-123",
            targetOrigin="https://example.com",
        ),
        dom_drift=0.0,
        revoked=True,
    )

    assert valid is False
    assert reason == "approval_revoked"
