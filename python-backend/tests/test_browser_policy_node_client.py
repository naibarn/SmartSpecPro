from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.approval import ApprovalStatus
from app.services.automation_exceptions import BrowserPolicyDeniedError
from app.services.browser_policy_contract import (
    BrowserPolicyEvaluationResponse,
    BrowserPolicyExecutionContext,
    BrowserPolicyOutcomeResponse,
)
from app.services.browser_policy_node_client import (
    BrowserApprovalStatusSnapshot,
    BrowserPolicyNodeClient,
)


def build_policy_context() -> BrowserPolicyExecutionContext:
    return BrowserPolicyExecutionContext.model_validate(
        {
            "config": {"enabled": True, "enforcementMode": "expanded"},
            "entitlement": {
                "tenantId": "tenant-1",
                "workflowId": 42,
                "workflowName": "Browser policy runtime",
                "allowedCapabilities": ["upload_file", "click"],
                "config": {},
            },
        }
    )


def build_result():
    return BrowserPolicyEvaluationResponse.model_validate(
        {
            "decision": {
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
                "reasonCodes": ["external_upload"],
                "confidence": 0.92,
                "riskScore": 88,
                "evidence": {
                    "actionDigest": "digest-1",
                    "payloadPreviewHash": "preview-1",
                    "domFingerprint": "dom-1",
                    "screenshotHash": "shot-1",
                },
            },
            "approvalPayload": {
                "actionDescription": "Upload report",
                "actionDigest": "digest-1",
                "payloadPreviewHash": "preview-1",
                "domFingerprint": "dom-1",
                "screenshotHash": "shot-1",
                "targetOrigin": "https://example.com",
                "executionId": "exec-1",
                "reasonCodes": ["external_upload"],
                "approvalTtlSeconds": 300,
            },
            "correlationKey": "corr-1",
            "audit": {
                "traceId": "trace-1",
                "eventHash": "audit-hash-1",
                "previousEventHash": "prev-audit-hash",
                "jsonlPersisted": True,
                "dbPersisted": True,
                "auditWriteFailed": False,
            },
            "incident": {
                "approvalState": "pending",
                "outcome": "blocked",
                "operatorMessage": "browser_policy outcome=blocked approval_state=pending trace_id=trace-1 reasons=external_upload",
            },
        }
    )


def build_client() -> BrowserPolicyNodeClient:
    return BrowserPolicyNodeClient(
        tenant_id="tenant-1",
        user_id=7,
        execution_id="exec-1",
        policy_context=build_policy_context(),
    )


@pytest.mark.asyncio
async def test_cached_approval_is_revalidated_before_reuse():
    client = build_client()
    client._approval_request_ids["corr-1"] = "req-1"
    client._approved_correlation_keys.add("corr-1")
    client._get_approval_status = AsyncMock(
        return_value=BrowserApprovalStatusSnapshot(
            status=ApprovalStatus.APPROVED,
            revoked=False,
        )
    )
    client._create_approval_request = AsyncMock()

    await client._wait_for_approval(
        result=build_result(),
        action=SimpleNamespace(action_type="upload", description="Upload report"),
        status_callback=AsyncMock(),
    )

    client._get_approval_status.assert_awaited_once_with("req-1")
    client._create_approval_request.assert_not_called()


@pytest.mark.asyncio
async def test_download_payload_fails_closed_without_an_explicit_destination():
    client = build_client()
    page = SimpleNamespace(url="https://app.example.com/report")
    action = SimpleNamespace(
        action_type="download",
        selector_css="download",
        description="Download report",
        value=None,
        target_origin=None,
    )

    payload = await client._build_payload(
        page=page,
        action=action,
        state=SimpleNamespace(
            current_origin="https://app.example.com",
            non_read_action_count=0,
            extracted_record_count=0,
            external_send_count=0,
            origin_transition_count=0,
        ),
        transition_target_origin=None,
    )

    assert payload["currentOrigin"] == "https://app.example.com"
    assert payload["targetOrigin"] is None
    assert payload["transfersExternally"] is True
    assert payload["externalSendCount"] == 1


@pytest.mark.asyncio
async def test_frame_scoped_payload_includes_frame_origin_and_trust_tier():
    client = build_client()
    page = SimpleNamespace(url="https://app.example.com/dashboard")
    action = SimpleNamespace(
        action_type="fill",
        selector_css="#token",
        description="Fill token",
        value="abc",
        frame_selector_css="iframe[data-testid='partner-frame']",
        frame_origin="https://docs.example.com/embed",
        iframe_trust_tier="same_site",
    )

    payload = await client._build_payload(
        page=page,
        action=action,
        state=SimpleNamespace(
            current_origin="https://app.example.com",
            non_read_action_count=0,
            extracted_record_count=0,
            external_send_count=0,
            origin_transition_count=0,
        ),
        transition_target_origin=None,
    )

    assert payload["currentOrigin"] == "https://app.example.com"
    assert payload["targetOrigin"] == "https://docs.example.com"
    assert payload["iframeTrustTier"] == "same_site"
    assert payload["normalizedAction"]["frame_selector_css"] == "iframe[data-testid='partner-frame']"


@pytest.mark.asyncio
async def test_cached_approval_fails_closed_when_revoked_after_approval():
    client = build_client()
    client._approval_request_ids["corr-1"] = "req-1"
    client._approved_correlation_keys.add("corr-1")
    client._get_approval_status = AsyncMock(
        return_value=BrowserApprovalStatusSnapshot(
            status=ApprovalStatus.CANCELLED,
            revoked=True,
        )
    )
    client._create_approval_request = AsyncMock()
    status_callback = AsyncMock()

    with pytest.raises(BrowserPolicyDeniedError) as exc_info:
        await client._wait_for_approval(
            result=build_result(),
            action=SimpleNamespace(action_type="upload", description="Upload report"),
            status_callback=status_callback,
        )

    assert "revoked" in str(exc_info.value)
    assert exc_info.value.details == {
        "decision": "require_approval",
        "reason_codes": ["external_upload", "approval_revoked"],
        "approval_request_id": "req-1",
        "approval_status": "cancelled",
        "approval_revoked": True,
        "trace_id": "trace-1",
        "audit_event_hash": "audit-hash-1",
    }
    assert "corr-1" not in client._approved_correlation_keys
    client._create_approval_request.assert_not_called()
    status_callback.assert_not_called()


@pytest.mark.asyncio
async def test_pending_browser_approval_status_includes_trace_and_audit_metadata():
    client = build_client()
    client._create_approval_request = AsyncMock(return_value="req-1")
    client._get_approval_status = AsyncMock(
        side_effect=[
            BrowserApprovalStatusSnapshot(
                status=ApprovalStatus.PENDING,
                revoked=False,
            ),
            BrowserApprovalStatusSnapshot(
                status=ApprovalStatus.APPROVED,
                revoked=False,
            ),
        ]
    )
    status_callback = AsyncMock()

    await client._wait_for_approval(
        result=build_result(),
        action=SimpleNamespace(action_type="upload", description="Upload report"),
        status_callback=status_callback,
    )

    status_callback.assert_awaited_once()
    detail = status_callback.await_args.args[1]
    assert "approval_request_id=req-1" in detail
    assert "audit_event_hash=audit-hash-1" in detail
    assert "trace_id=trace-1" in detail


@pytest.mark.asyncio
async def test_record_action_outcome_posts_approved_execution_metadata():
    client = build_client()
    client._persist_action_outcome = AsyncMock(
        return_value=BrowserPolicyOutcomeResponse.model_validate(
            {
                "audit": {
                    "traceId": "trace-1",
                    "eventHash": "outcome-hash-1",
                    "previousEventHash": "audit-hash-1",
                    "jsonlPersisted": True,
                    "dbPersisted": True,
                    "auditWriteFailed": False,
                },
                "incident": {
                    "approvalState": "approved",
                    "outcome": "executed",
                    "operatorMessage": "browser_policy outcome=executed approval_state=approved trace_id=trace-1 reasons=external_upload",
                },
            }
        )
    )
    status_callback = AsyncMock()

    response = await client.record_action_outcome(
        result=build_result(),
        action=SimpleNamespace(action_type="upload", description="Upload report"),
        approval_state="approved",
        outcome="executed",
        status_callback=status_callback,
    )

    assert response is not None
    client._persist_action_outcome.assert_awaited_once()
    status_callback.assert_awaited_once()
    detail = status_callback.await_args.args[1]
    assert "approval_state=approved" in detail
    assert "audit_event_hash=outcome-hash-1" in detail
