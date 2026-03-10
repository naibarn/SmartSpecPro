from app.services.browser_policy_audit import (
    build_browser_policy_audit_artifacts,
    verify_browser_policy_audit_chain,
)
from app.services.browser_policy_contract import BrowserPolicyDecisionEnvelope


def build_decision(reason_code: str = "external_upload") -> BrowserPolicyDecisionEnvelope:
    return BrowserPolicyDecisionEnvelope.model_validate(
        {
            "version": "2026-03-10",
            "tenantId": "tenant-1",
            "userId": 7,
            "workflowId": 42,
            "executionId": "exec-1",
            "traceId": "trace-1",
            "actionType": "upload",
            "actionClass": "restricted",
            "pageSensitivity": "sensitive_data",
            "decision": "require_approval",
            "reasonCodes": [reason_code],
            "confidence": 0.92,
            "riskScore": 88,
            "evidence": {
                "actionDigest": "digest-1",
                "payloadPreviewHash": "preview-1",
                "domFingerprint": "dom-1",
                "screenshotHash": "shot-hash-1",
            },
            "approval": {
                "required": True,
                "approvalTtlSeconds": 300,
            },
        }
    )


def test_browser_policy_audit_artifacts_omit_raw_dom_and_screenshot_blobs():
    artifacts = build_browser_policy_audit_artifacts(
        decision=build_decision(),
        approval_state="pending",
        outcome="blocked",
        previous_event_hash="prev-hash",
        raw_dom_snippet="<form>Password</form>",
        full_screenshot_base64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    )

    assert artifacts["jsonl_event"]["eventType"] == "browser_policy_decision"
    assert artifacts["db_record"]["reasonCodes"] == ["external_upload"]
    assert "Password" not in str(artifacts["jsonl_event"])
    assert "iVBORw0KGgo" not in str(artifacts["jsonl_event"])


def test_browser_policy_audit_chain_is_verifiable():
    first = build_browser_policy_audit_artifacts(
        decision=build_decision(),
        approval_state="pending",
        outcome="blocked",
    )
    second = build_browser_policy_audit_artifacts(
        decision=build_decision("approval_context_changed"),
        approval_state="context_changed",
        outcome="blocked",
        previous_event_hash=first["jsonl_event"]["integrity"]["eventHash"],
    )

    assert verify_browser_policy_audit_chain(
        [first["jsonl_event"], second["jsonl_event"]]
    ) == {"valid": True, "failed_at_trace_id": None}
