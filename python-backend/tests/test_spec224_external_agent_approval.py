from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import approvals
from app.api.approvals import Spec224ExternalAgentApprovalCreate
from app.core.config import settings


def request() -> Spec224ExternalAgentApprovalCreate:
    return Spec224ExternalAgentApprovalCreate(
        tenantId="tenant-224",
        requesterId=109,
        jobId="job-224",
        operationKey="external-agent:task-224:plan-1:1",
        provider="codex",
        providerRequestId="provider-request-1",
        runnerId="runner-224",
        runnerSessionId="session-224",
        capabilitySnapshotId="snapshot-224",
        capabilitySnapshotRevision="revision-1",
        fencingVersion=4,
        actionId="tool-call-1",
        semanticState={"tool": "workspace.edit", "scope": "bounded"},
        correlationKey="spec224:job-224:provider-request-1",
        approvers=[207],
    )


def test_spec224_internal_approval_requires_server_marker_and_scope(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)
    monkeypatch.setenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_TENANT_ID", "tenant-224")
    monkeypatch.setenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID", "207")

    approvals._assert_spec224_external_internal("gateway-secret", request())

    with pytest.raises(HTTPException) as wrong_token:
        approvals._assert_spec224_external_internal("wrong-secret", request())
    assert wrong_token.value.status_code == 401

    with pytest.raises(HTTPException) as wrong_tenant:
        approvals._assert_spec224_external_internal(
            "gateway-secret", request().model_copy(update={"tenant_id": "other-tenant"})
        )
    assert wrong_tenant.value.status_code == 403


def test_spec224_internal_approval_requires_distinct_configured_approver(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)
    monkeypatch.setenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_TENANT_ID", "tenant-224")
    monkeypatch.delenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID", raising=False)
    with pytest.raises(HTTPException) as missing:
        approvals._assert_spec224_external_internal("gateway-secret", request())
    assert missing.value.status_code == 503

    monkeypatch.setenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID", "109")
    with pytest.raises(HTTPException) as self_approval:
        approvals._assert_spec224_external_internal(
            "gateway-secret", request().model_copy(update={"approvers": [109]})
        )
    assert self_approval.value.status_code == 403


def test_spec224_resume_payload_is_bounded_and_server_owned():
    payload = approvals._spec224_external_resume_payload(
        request(), approval_request_id="approval-224", decision="approved", approver_id=207
    )
    assert payload["jobId"] == "job-224"
    assert payload["tenantId"] == "tenant-224"
    assert payload["approvalRequestId"] == "approval-224"
    assert payload["decision"] == "approved"
    assert payload["approverId"] == 207
    assert "token" not in str(payload).lower()


def test_spec224_resume_payload_rejects_secret_like_semantic_state():
    with pytest.raises(ValueError, match="SECRET"):
        approvals._spec224_external_resume_payload(
            request().model_copy(update={"semantic_state": {"accessToken": "redacted"}}),
            approval_request_id="approval-224",
            decision="approved",
            approver_id=207,
        )


def test_spec224_resume_record_rejects_provider_or_scope_tampering():
    continuation = request().model_dump(by_alias=True)
    continuation["provider"] = "unknown"
    with pytest.raises(ValueError, match="PROVIDER"):
        approvals._spec224_external_resume_payload_from_record(
            continuation, "approval-224", "approved", 207
        )
