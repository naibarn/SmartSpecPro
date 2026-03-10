from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.approval import ApprovalStatus
from app.services.automation_exceptions import BrowserPolicyDeniedError
from app.services.browser_policy_contract import (
    BrowserPolicyEvaluationResponse,
    BrowserPolicyExecutionContext,
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
            "approval": {
                "required": True,
                "approvalTtlSeconds": 300,
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
    }
    assert "corr-1" not in client._approved_correlation_keys
    client._create_approval_request.assert_not_called()
    status_callback.assert_not_called()
